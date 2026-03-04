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
import { postApiWithRetry } from "../config/api";
import { fetchTrackingByCode } from "../services/trackingApi";
import { getLocalizedApiErrorMessage } from "../utils/apiErrors";
import { formatPackageEventSummary, getLatestPackageEvent } from "../utils/packageEvents";

export default function SavedPackagesScreen({ navigation }) {
  const theme = useTheme();
  const { t, language } = useI18n();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { colors, typography } = theme;
  const insets = useSafeAreaInsets();

  const [packages, setPackages] = useState([]);
  const [eventsData, setEventsData] = useState({});
  const [loadingAll, setLoadingAll] = useState(false);
  const [deliveredCount, setDeliveredCount] = useState(0);

  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editPackageName, setEditPackageName] = useState("");
  const [editPackageCode, setEditPackageCode] = useState("");

  const [snack, setSnack] = useState({ visible: false, text: "", type: "info" });
  const showSnack = (text, type = "info") => setSnack({ visible: true, text, type });
  const apiErrorText = (error, overrides = {}) => getLocalizedApiErrorMessage(t, error, overrides);

  const ENABLE_SUBSCRIBE = true;

  const loadPackages = async () => {
    try {
      setRefreshing(true);

      const saved = await AsyncStorage.getItem("savedPackages");
      const list = saved ? JSON.parse(saved) : [];

      setLoadingAll(true);

      const newEventsData = {};
      const onlyWithExternalEvents = [];
      let delivered = 0;

      await Promise.all(
        list.map(async (p) => {
          try {
            const response = await fetchTrackingByCode(p.code, { language });

            const externos = response.data?.eventos_externos || [];
            const locales = response.data?.eventos_locales || [];

            const hasLocales = Array.isArray(locales) && locales.length > 0;
            const hasExternos = Array.isArray(externos) && externos.length > 0;
            const last = getLatestPackageEvent(locales, externos, t, language);

            if (hasLocales && hasExternos) {
              delivered += 1;
            }

            if (!hasLocales) {
              newEventsData[p.code] = {
                lastEvent: last,
                fullData: response.data,
                hasExternos,
              };

              onlyWithExternalEvents.push(p);
            }
          } catch (e) {
            newEventsData[p.code] = {
              lastEvent: null,
              fullData: { codigo: p.code, eventos_externos: [] },
              hasExternos: false,
              error: e?.message || "Error desconocido",
            };
          }
        })
      );

      setEventsData(newEventsData);
      setPackages(onlyWithExternalEvents);
      setDeliveredCount(delivered);
    } catch (e) {
      setDeliveredCount(0);
      showSnack(t("saved.updateListFailed", "Could not refresh the list"), "danger");
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

  const deletePackage = async (code) => {
    Alert.alert(t("saved.deleteTitle", "Delete package"), t("saved.deleteBody", "Do you want to remove this package from your saved list?"), [
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

            showSnack(t("saved.deleted", "Package deleted"), "danger");
          } catch (e) {
            showSnack(t("saved.deleteFailed", "Could not delete"), "danger");
          }
        },
      },
    ]);
  };

  const viewPackage = (code) => {
    const data = eventsData[code]?.fullData || { codigo: code, eventos_externos: [] };
    navigation.navigate("Result", { data });
  };

  const openEditModal = (code, currentName) => {
    setEditPackageCode(code);
    setEditPackageName(currentName || "");
    setEditModalVisible(true);
  };

  const saveEditedName = async () => {
    const name = editPackageName.trim();
    if (!name) return showSnack(t("saved.invalidName", "Enter a valid name"), "danger");

    const saved = await AsyncStorage.getItem("savedPackages");
    const list = saved ? JSON.parse(saved) : [];
    const duplicate = list.find(
      (p) => p.code !== editPackageCode && (p.name || "").toLowerCase() === name.toLowerCase()
    );
    if (duplicate) return showSnack(t("saved.duplicateName", "Duplicate name"), "danger");

    try {
      setPackages((prev) => prev.map((p) => (p.code === editPackageCode ? { ...p, name } : p)));

      const updated = list.map((p) => (p.code === editPackageCode ? { ...p, name } : p));
      await AsyncStorage.setItem("savedPackages", JSON.stringify(updated));

      setEditModalVisible(false);
      showSnack(t("saved.nameUpdated", "Name updated"), "success");
    } catch (e) {
      showSnack(t("saved.saveChangeFailed", "Could not save the change"), "danger");
    }
  };

  const renderItem = ({ item }) => {
    const data = eventsData[item.code];
    const last = data?.lastEvent;

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
              <Chip text={t("saved.pending", "Pending")} color={colors.primary} icon="globe-outline" />
              {last?.office ? <Chip text={last.office} color={colors.secondary} icon="business-outline" /> : null}
            </View>

            <Text style={styles.lastEvent}>{formatPackageEventSummary(last, t, language, "saved.noRecentUpdates")}</Text>

            <View style={[styles.rowBetween, { marginTop: 6 }]}>
              <TouchableOpacity
                style={[styles.miniBtn, { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}33` }]}
                onPress={() => openEditModal(item.code, item.name)}
              >
                <Ionicons name="create-outline" size={16} color={colors.primary} />
                <Text style={[styles.miniBtnText, { color: colors.primary }]}>{t("common.editName", "Edit name")}</Text>
              </TouchableOpacity>

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
      <Ionicons name="bookmark-outline" size={28} color={colors.muted} />
      <Text style={[typography.h2, { textAlign: "center", marginTop: 8 }]}>{t("common.noResults", "Sin resultados")}</Text>
      <Text style={[typography.p, { textAlign: "center", marginTop: 6 }]}>
        {t("saved.noPackages", "No hay paquetes (o tu búsqueda no coincide).")}
      </Text>
    </Card>
  );

  return (
    <Screen>
      <View style={styles.container}>
        <Card style={styles.searchCard}>
          <AppInput icon="search" placeholder={t("saved.searchPlaceholder", "Buscar por nombre o código...")} value={query} onChangeText={setQuery} />
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
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          refreshing={refreshing}
          onRefresh={loadPackages}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: theme.spacing.lg,
            paddingTop: 2,
            paddingBottom: 120 + insets.bottom,
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
                {t("saved.shortNameHelp", "Usa un nombre corto y claro (ej: \"Paquete- Audífonos\").")}
              </Text>

              <AppInput
                icon="create-outline"
                placeholder={t("saved.newNamePlaceholder", "New name")}
                value={editPackageName}
                onChangeText={setEditPackageName}
              />

              <PrimaryButton title={t("common.saveChanges", "Guardar cambios")} icon="save-outline" onPress={saveEditedName} />
              <OutlineButton title={t("common.cancel", "Cancelar")} icon="close" onPress={() => setEditModalVisible(false)} />
            </Card>
          </View>
        </Modal>

        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate("PackagesLocalExternal")}
          activeOpacity={0.9}
        >
          <View style={styles.fabIconWrap}>
            <Ionicons name="cube" size={20} color="#1F2937" />
            <View style={styles.fabBadge}>
              <Text style={styles.fabBadgeText}>{deliveredCount > 99 ? "99+" : String(deliveredCount)}</Text>
            </View>
          </View>
        </TouchableOpacity>

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

    fab: {
      position: "absolute",
      right: 18,
      bottom: 18,
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: t.colors.primary,
      alignItems: "center",
      justifyContent: "center",
      ...t.shadowStrong,
    },
    fabIconWrap: {
      width: 26,
      height: 26,
      alignItems: "center",
      justifyContent: "center",
    },
    fabBadge: {
      position: "absolute",
      right: -4,
      top: -4,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: "#fff",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 3,
    },
    fabBadgeText: { fontSize: 10, fontWeight: "900", color: "#0F172A" },
  });











