import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  ActivityIndicator,
} from "react-native";
import { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ui";
import { useI18n } from "../i18n/ui";
import { Screen, Card, AppInput, Chip, PrimaryButton, OutlineButton, Snackbar } from "../components/ui";
import { getApiErrorMessage, postApiWithRetry } from "../config/api";
import { fetchTrackingByCode } from "../services/trackingApi";
import { formatDaysAgo, localizeEventAction, localizeExternalEventType } from "../utils/eventText";

export default function DeliveredPackagesScreen({ navigation }) {
  const theme = useTheme();
  const { t, language } = useI18n();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { colors, typography } = theme;
  const insets = useSafeAreaInsets();

  const [packages, setPackages] = useState([]);
  const [eventsData, setEventsData] = useState({});
  const [loadingAll, setLoadingAll] = useState(false);

  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editPackageName, setEditPackageName] = useState("");
  const [editPackageCode, setEditPackageCode] = useState("");

  const [snack, setSnack] = useState({ visible: false, text: "", type: "info" });
  const showSnack = (text, type = "info") => setSnack({ visible: true, text, type });
  const apiErrorText = (error, overrides = {}) =>
    getApiErrorMessage(error, {
      config: t("api.config", "API configuration is incomplete"),
      timeout: t("api.timeout", "The request took too long, please try again"),
      network: t("api.network", "Could not connect to the server"),
      invalidCode: t("api.invalidCode", "Invalid or not found code"),
      auth: t("api.auth", "Invalid API credentials"),
      server: t("api.server", "The server encountered a problem"),
      http: t("api.http", "Error while requesting data"),
      unknown: t("api.unknown", "An unexpected error occurred"),
      ...overrides,
    });

  const ENABLE_SUBSCRIBE = true;

  const getLatestEvent = (locales = [], externos = []) => {
    const normalize = (ev, source) => ({
      source,
      dateRaw: source === "local" ? ev?.updated_at || ev?.created_at || null : ev?.eventDate || null,
      eventType:
        source === "local"
          ? localizeEventAction(ev?.action, t, language)
          : localizeExternalEventType(ev?.eventType, t, language),
      office: ev?.office || "",
      condition: ev?.condition || "",
      nextOffice: ev?.nextOffice || "",
    });

    const all = [
      ...(Array.isArray(locales) ? locales.map((ev) => normalize(ev, "local")) : []),
      ...(Array.isArray(externos) ? externos.map((ev) => normalize(ev, "external")) : []),
    ].filter((ev) => !!ev.dateRaw);
    if (all.length === 0) return null;
    all.sort((a, b) => new Date(b.dateRaw) - new Date(a.dateRaw));
    return all[0];
  };

  const loadPackages = async () => {
    try {
      setRefreshing(true);

      const saved = await AsyncStorage.getItem("savedPackages");
      const list = saved ? JSON.parse(saved) : [];

      setLoadingAll(true);

      const newEventsData = {};
      const onlyWithBoth = [];

      await Promise.all(
        list.map(async (p) => {
          try {
            const response = await fetchTrackingByCode(p.code, { language });

            const externos = response.data?.eventos_externos || [];
            const locales = response.data?.eventos_locales || [];

            const hasExternos = Array.isArray(externos) && externos.length > 0;
            const hasLocales = Array.isArray(locales) && locales.length > 0;

            if (hasLocales && hasExternos) {
              const last = getLatestEvent(locales, externos);

              newEventsData[p.code] = {
                lastEvent: last,
                fullData: response.data,
                counts: { locales: locales.length, externos: externos.length },
              };

              onlyWithBoth.push(p);
            }
          } catch (e) {
            newEventsData[p.code] = {
              lastEvent: null,
              fullData: { codigo: p.code, eventos_externos: [], eventos_locales: [] },
              counts: { locales: 0, externos: 0 },
              error: e?.message || "Error desconocido",
            };
          }
        })
      );

      setEventsData(newEventsData);
      setPackages(onlyWithBoth);
    } catch (e) {
      showSnack(t("delivered.updateListFailed", "Could not refresh the list"), "danger");
    } finally {
      setLoadingAll(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", loadPackages);
    return unsubscribe;
  }, [navigation, language]);

  useEffect(() => {
    loadPackages();
  }, [language]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return packages;

    return packages.filter((p) => {
      const name = (p.name || "").toLowerCase();
      const code = (p.code || "").toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }, [packages, query]);

  const formatLastEvent = (ev) => {
    if (!ev?.dateRaw) return t("delivered.noRecentUpdates", "No recent updates");
    const normalized = String(ev.dateRaw).replace("T", " ").replace("Z", "");
    const m = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    if (!m) return t("delivered.noRecentUpdates", "No recent updates");
    const [, y, mo, d] = m;
    const eventDate = new Date(`${y}-${mo}-${d}T00:00:00`);
    const today = new Date();

    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const e0 = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate()).getTime();

    const days = Math.floor((t0 - e0) / (1000 * 60 * 60 * 24));
    const dateStr = `${d}/${mo}/${y}`;

    const ago = formatDaysAgo(days, language);
    return `${ev.eventType} \u00B7 ${dateStr} \u00B7 ${ago}`;
  };

  const deletePackage = async (code) => {
    Alert.alert(t("delivered.deleteTitle", "Delete package"), t("delivered.deleteBody", "Do you want to remove this package from your saved list?"), [
      { text: t("common.cancel", "Cancel"), style: "cancel" },
      {
        text: t("common.delete", "Delete"),
        style: "destructive",
        onPress: async () => {
          try {
            const saved = await AsyncStorage.getItem("savedPackages");
            const list = saved ? JSON.parse(saved) : [];
            const filteredStorage = list.filter((p) => p.code !== code);
            await AsyncStorage.setItem("savedPackages", JSON.stringify(filteredStorage));

            setPackages((prev) => prev.filter((p) => p.code !== code));
            setEventsData((prev) => {
              const copy = { ...prev };
              delete copy[code];
              return copy;
            });

            if (ENABLE_SUBSCRIBE) {
              try {
                const token = await AsyncStorage.getItem("fcm_token");
                if (token) {
                  await postApiWithRetry(
                    "/api/unsubscribe",
                    { codigo: code, fcm_token: token },
                    { timeout: 10000, retries: 1 }
                  );
                }
              } catch (e) {
                showSnack(apiErrorText(e), "danger");
              }
            }

            showSnack(t("delivered.deleted", "Package deleted"), "danger");
          } catch (e) {
            showSnack(t("delivered.deleteFailed", "Could not delete"), "danger");
          }
        },
      },
    ]);
  };

  const viewPackage = (code) => {
    const data = eventsData[code]?.fullData || { codigo: code, eventos_externos: [], eventos_locales: [] };
    navigation.navigate("Result", { data });
  };

  const openEditModal = (code, currentName) => {
    setEditPackageCode(code);
    setEditPackageName(currentName || "");
    setEditModalVisible(true);
  };

  const saveEditedName = async () => {
    const name = editPackageName.trim();
    if (!name) return showSnack(t("delivered.invalidName", "Enter a valid name"), "danger");

    const saved = await AsyncStorage.getItem("savedPackages");
    const list = saved ? JSON.parse(saved) : [];
    const duplicate = list.find(
      (p) => p.code !== editPackageCode && (p.name || "").toLowerCase() === name.toLowerCase()
    );
    if (duplicate) return showSnack(t("delivered.duplicateName", "Duplicate name"), "danger");

    try {
      setPackages((prev) => prev.map((p) => (p.code === editPackageCode ? { ...p, name } : p)));

      const updated = list.map((p) => (p.code === editPackageCode ? { ...p, name } : p));
      await AsyncStorage.setItem("savedPackages", JSON.stringify(updated));

      setEditModalVisible(false);
      showSnack(t("delivered.nameUpdated", "Name updated"), "success");
    } catch (e) {
      showSnack(t("delivered.saveChangeFailed", "Could not save the change"), "danger");
    }
  };

  const renderItem = ({ item }) => {
    const meta = eventsData[item.code];
    const last = meta?.lastEvent;
    const counts = meta?.counts || { locales: 0, externos: 0 };

    return (
      <TouchableOpacity activeOpacity={0.92} onPress={() => viewPackage(item.code)}>
        <Card style={styles.itemCard}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name || item.code}</Text>
              <Text style={styles.code}>{item.code}</Text>
            </View>

            <View style={styles.iconPill}>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </View>
          </View>

          <View style={{ marginTop: 12, gap: 8 }}>
            <View style={styles.rowWrap}>
              <Chip text={t("delivered.chipDelivered", "Delivered")} color={colors.success} icon="checkmark-circle-outline" />
              <Chip text={`${t("delivered.recordsPrefix", "Records")}: ${counts.locales + counts.externos}`} color={colors.secondary} icon="list-outline" />
            </View>

            {last ? <Text style={styles.lastEvent}>{formatLastEvent(last)}</Text> : null}

            <View style={[styles.rowWrap, { marginTop: 6, justifyContent: "flex-end" }]}>
              <TouchableOpacity
                style={[styles.miniBtn, { backgroundColor: `${colors.danger}18`, borderColor: `${colors.danger}33` }]}
                onPress={() => deletePackage(item.code)}
              >
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
                <Text style={[styles.miniBtnText, { color: colors.danger }]}>{t("common.delete", "Delete")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <Card style={styles.empty}>
      <Ionicons name="checkmark-circle-outline" size={28} color={colors.muted} />
      <Text style={[typography.h2, { textAlign: "center", marginTop: 8 }]}>{t("common.noResults", "Sin resultados")}</Text>
      <Text style={[typography.p, { textAlign: "center", marginTop: 6 }]}>
        {t("delivered.noPackages", "No hay paquetes entregados (o tu bÃºsqueda no coincide).")}
      </Text>
    </Card>
  );

  return (
    <Screen>
      <View style={styles.container}>
        <Card style={styles.searchCard}>
          <AppInput icon="search" placeholder={t("saved.searchPlaceholder", "Buscar por nombre o cÃ³digo...")} value={query} onChangeText={setQuery} />
          <View style={styles.rowBetween}>
            <Chip text={`${filtered.length} ${t("saved.packagesCount", "paquetes")}`} color={colors.secondary} icon="bookmark-outline" />
            <TouchableOpacity onPress={loadPackages} style={styles.refreshPill} activeOpacity={0.9}>
              <Ionicons name="refresh" size={18} color={colors.text} />
              <Text style={styles.refreshText}>{t("common.update", "Actualizar")}</Text>
            </TouchableOpacity>
          </View>
        </Card>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.code}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          refreshing={refreshing}
          onRefresh={loadPackages}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: theme.spacing.lg,
            paddingTop: 2,
            paddingBottom: 80 + insets.bottom,
          }}
          keyboardShouldPersistTaps="always"
        />

        {loadingAll && (
          <View style={styles.loaderOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ marginTop: 10, color: colors.muted, fontWeight: "800" }}>{t("saved.loadingEvents", "Cargando eventos...")}</Text>
          </View>
        )}

        <Modal visible={editModalVisible} transparent animationType="fade" onRequestClose={() => setEditModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <Card style={styles.modalCard}>
              <Text style={typography.h2}>{t("common.editName", "Editar nombre")}</Text>
              <Text style={[typography.p, { marginTop: 6, marginBottom: 12 }]}>
                {t("saved.shortNameHelp", "Usa un nombre corto y claro (ej: \"Paquete- AudÃ­fonos\").")}
              </Text>

              <AppInput icon="create-outline" placeholder={t("delivered.newNamePlaceholder", "New name")} value={editPackageName} onChangeText={setEditPackageName} />

              <PrimaryButton title={t("common.saveChanges", "Guardar cambios")} icon="save-outline" onPress={saveEditedName} />
              <OutlineButton title={t("common.cancel", "Cancelar")} icon="close" onPress={() => setEditModalVisible(false)} />
            </Card>
          </View>
        </Modal>

        <Snackbar visible={snack.visible} text={snack.text} type={snack.type} onHide={() => setSnack((s) => ({ ...s, visible: false }))} />
      </View>
    </Screen>
  );
}

const createStyles = (t) =>
  StyleSheet.create({
    container: { flex: 1 },
    searchCard: {
      padding: 14,
      marginBottom: 12,
      marginHorizontal: t.spacing.lg,
      marginTop: t.spacing.lg,
    },

    itemCard: { padding: t.spacing.lg, marginBottom: t.spacing.md },
    rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },

    name: { fontWeight: "900", fontSize: 15, color: t.colors.text },
    code: { marginTop: 3, fontSize: 12, color: t.colors.muted, fontWeight: "700" },
    lastEvent: { marginTop: 4, color: t.colors.text, opacity: 0.8, fontWeight: "700" },

    iconPill: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: t.isDark ? "rgba(15, 23, 42, 0.7)" : "rgba(255,255,255,0.7)",
      borderWidth: 1,
      borderColor: t.colors.border,
      alignItems: "center",
      justifyContent: "center",
    },

    miniBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
    },
    miniBtnText: { fontWeight: "900", fontSize: 13 },

    refreshPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: t.isDark ? "rgba(15, 23, 42, 0.7)" : "rgba(255,255,255,0.7)",
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    refreshText: { fontWeight: "900", color: t.colors.text },

    empty: { marginTop: 60, alignItems: "center" },

    loaderOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: t.isDark ? "rgba(2, 6, 23, 0.55)" : "rgba(255, 255, 255, 0.78)",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 99,
    },

    modalOverlay: {
      flex: 1,
      backgroundColor: t.colors.overlay,
      alignItems: "center",
      justifyContent: "center",
      padding: 18,
    },
    modalCard: { width: "100%", maxWidth: 440 },
  });







