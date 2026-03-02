import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { useCallback, useMemo, useState, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ui";
import { useI18n } from "../i18n/ui";
import { Screen, Card, Chip, OutlineButton } from "../components/ui";
import { fetchTrackingByCode } from "../services/trackingApi";
import {
  localizeEventAction,
  localizeExternalEventType,
  localizeTrackingBody,
  localizeCountryName,
} from "../utils/eventText";

export default function ResultScreen({ route }) {
  const theme = useTheme();
  const { t, language } = useI18n();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { colors, typography } = theme;
  const insets = useSafeAreaInsets();

  const initialData = route?.params?.data;
  const highlight = route?.params?.highlight || null;
  const [data, setData] = useState(initialData || null);
  const [refreshingData, setRefreshingData] = useState(false);
  const [refreshError, setRefreshError] = useState("");

  useEffect(() => {
    setData(initialData || null);
  }, [initialData]);

  const refreshFromApi = useCallback(async () => {
    const codigo = initialData?.codigo;
    if (!codigo) return;
    setRefreshingData(true);
    setRefreshError("");
    try {
      const response = await fetchTrackingByCode(codigo, { language });
      setData(response.data);
    } catch {
      setRefreshError(t("result.refreshError", "Could not update. Showing available data."));
    } finally {
      setRefreshingData(false);
    }
  }, [initialData?.codigo, t, language]);

  useFocusEffect(
    useCallback(() => {
      refreshFromApi();
    }, [refreshFromApi])
  );

  if (!data) {
    return (
      <Screen>
        <View style={{ flex: 1, padding: 18, justifyContent: "center" }}>
          <Card>
            <Text style={{ fontSize: 18, fontWeight: "900", color: colors.text }}>
              {t("result.noData", "Sin datos para mostrar")}
            </Text>
            <Text style={{ marginTop: 8, color: colors.muted, fontWeight: "700" }}>
              {t("result.noDataDesc", "Vuelve atrÃ¡s y consulta un cÃ³digo nuevamente.")}
            </Text>
          </Card>
        </View>
      </Screen>
    );
  }

  const codigo = data?.codigo || "-";
  const meta = data?.meta_tracking || {};

  const localesRaw = Array.isArray(data?.eventos_locales) ? data.eventos_locales : [];
  const externosRaw = Array.isArray(data?.eventos_externos) ? data.eventos_externos : [];

  const parseRawDateParts = (value) => {
    if (!value || typeof value !== "string") return null;
    const normalized = value.replace("T", " ").replace("Z", "");
    const m = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    if (!m) return null;
    const [, y, mo, d, h, mi] = m;
    return {
      y,
      mo,
      d,
      h,
      mi,
      dayKey: `${y}-${mo}-${d}`,
      dayLabel: `${d}/${mo}/${y}`,
      timeLabel: `${h}:${mi}`,
    };
  };

  const toDate = (value) => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const niceTime = (value) => {
    const parts = parseRawDateParts(value);
    if (!parts) return "";
    return parts.timeLabel;
  };

  const normalized = useMemo(() => {
    const loc = localesRaw
      .map((ev) => ({
        source: "local",
        dateRaw: ev?.created_at || ev?.updated_at || null,
        date: toDate(ev?.created_at || ev?.updated_at),
        dayParts: parseRawDateParts(ev?.created_at || ev?.updated_at || null),
        title: localizeEventAction(ev?.action, t, language),
        subtitle: localizeTrackingBody(ev?.descripcion || "", t, language),
        office: "",
        condition: "",
        nextOffice: "",
      }))
      .filter((x) => !!x.date);

    const ext = externosRaw
      .map((ev) => ({
        source: "external",
        dateRaw: ev?.eventDate || null,
        date: toDate(ev?.eventDate),
        dayParts: parseRawDateParts(ev?.eventDate || null),
        title: localizeExternalEventType(ev?.eventType, t, language),
        subtitle: "",
        country: ev?.country || "",
        countryIso2: ev?.countryIso2 || "",
        countrySource: ev?.countrySource || "",
        office: ev?.office || "",
        condition: ev?.condition || "",
        nextOffice: ev?.nextOffice || "",
      }))
      .filter((x) => !!x.date);

    loc.sort((a, b) => b.date - a.date);
    ext.sort((a, b) => b.date - a.date);

    return [...loc, ...ext];
  }, [localesRaw, externosRaw, t, language]);

  const isHighlightedEvent = (ev) => {
    if (!highlight) return false;
    const hasIdentifier =
      !!highlight.eventDate || !!highlight.eventTitle || !!highlight.eventBody || !!highlight.office;
    if (!hasIdentifier) return false;
    const sameSource = !highlight.source || highlight.source === ev.source;
    const sameDate = !highlight.eventDate || highlight.eventDate === ev.dateRaw;
    const sameTitle = !highlight.eventTitle || highlight.eventTitle === ev.title;
    const sameBody = !highlight.eventBody || highlight.eventBody === ev.subtitle;
    const sameOffice = !highlight.office || highlight.office === ev.office;
    return sameSource && sameDate && sameTitle && sameBody && sameOffice;
  };

  const grouped = useMemo(() => {
    const map = new Map();

    for (const ev of normalized) {
      const k = ev?.dayParts?.dayKey;
      if (!k) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(ev);
    }

    const keys = Array.from(map.keys()).sort((a, b) => (a < b ? 1 : -1));

    return keys.map((k) => {
      const list = map.get(k) || [];
      list.sort((a, b) => {
        const pa = a.source === "local" ? 0 : 1;
        const pb = b.source === "local" ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return b.date - a.date;
      });
      const dayLabel = list[0]?.dayParts?.dayLabel || k;
      return { dayKey: k, dayLabel, events: list };
    });
  }, [normalized]);

  return (
    <Screen>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.lg,
          paddingBottom: 26 + insets.bottom,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.headerCard}>
          <Text style={[typography.p, { fontWeight: "900" }]}>{t("result.code", "CÃ³digo")}</Text>
          <Text style={styles.code}>{codigo}</Text>

          <View style={styles.headerRow}>
            <Chip text={`${t("result.events", "Eventos")}: ${normalized.length}`} color={colors.primary} icon="trail-sign-outline" numberOfLines={1} />
          </View>
          {meta?.currentCountry ? (
            <View style={styles.headerCountryRow}>
              <Chip
                text={`${t("result.currentCountry", "País actual")}: ${localizeCountryName(meta.currentCountry, meta.currentCountryIso2, language)}`}
                color={colors.secondary}
                icon="flag-outline"
                style={styles.countryChip}
                numberOfLines={2}
              />
            </View>
          ) : null}
          {refreshError ? (
            <View style={{ marginTop: 10 }}>
              <Text style={{ color: colors.danger, fontWeight: "700", marginBottom: 8 }}>{refreshError}</Text>
              <OutlineButton title={t("result.retryUpdate", "Retry update")} icon="refresh" onPress={refreshFromApi} />
            </View>
          ) : null}
        </Card>

        {normalized.length === 0 ? (
          <Card style={styles.empty}>
            <Ionicons name="information-circle-outline" size={30} color={colors.muted} />
            <Text style={[typography.h2, { marginTop: 10, textAlign: "center" }]}>{t("result.noEvents", "No events")}</Text>
            <Text style={[typography.p, { marginTop: 6, textAlign: "center" }]}>
              {t("result.noEventsDesc", "Este cÃ³digo no tiene registros de seguimiento.")}
            </Text>
          </Card>
        ) : (
          <View style={{ marginTop: 14 }}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="list-outline" size={18} color={colors.text} />
                <Text style={styles.sectionTitle}>{t("result.trackingEvents", "Tracking events")}</Text>
              </View>
            </View>

            {grouped.map((g) => (
              <View key={g.dayKey} style={{ marginTop: 14 }}>
                <View style={styles.dayHeader}>
                  <Ionicons name="calendar-outline" size={16} color={colors.muted} />
                  <Text style={styles.dayText}>{g.dayLabel}</Text>
                  <Text style={styles.dayCount}>
                    {g.events.length} {t("result.events", "Eventos")}
                  </Text>
                </View>

                <View style={{ marginTop: 10 }}>
                  {g.events.map((ev, idx) => (
                    <View key={`${g.dayKey}-${idx}`} style={styles.timelineRow}>
                      <View style={styles.lineCol}>
                        <Text style={styles.traceTime}>{niceTime(ev.dateRaw) || "--:--"}</Text>
                        <View style={styles.traceRail}>
                          <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                          {idx !== g.events.length - 1 ? <View style={styles.line} /> : <View style={styles.lineEnd} />}
                        </View>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Card style={[styles.eventCard, isHighlightedEvent(ev) ? styles.eventCardNew : null]}>
                          <View style={styles.topRow}>
                            <Text style={styles.eventType}>{ev.title}</Text>
                          </View>

                          {isHighlightedEvent(ev) ? (
                            <View style={styles.newPill}>
                              <Ionicons name="notifications" size={13} color={colors.success} />
                              <Text style={styles.newPillText}>{t("result.new", "New")}</Text>
                            </View>
                          ) : null}

                          {!!ev.subtitle && <Text style={styles.subtitle}>{ev.subtitle}</Text>}

                          {(ev.office ||
                            ev.nextOffice ||
                            localizeCountryName(ev.country, ev.countryIso2, language)) && (
                            <>
                              <View style={styles.divider} />

                              <InfoRow
                                label={t("result.office", "Office")}
                                value={ev.office}
                                icon="business-outline"
                                theme={theme}
                                styles={styles}
                              />
                              <InfoRow
                                label={
                                  ev.countrySource === "S10_ORIGIN_INFERRED"
                                    ? t("result.countryOrigin", "PaÃ­s Origen")
                                    : ev.countrySource === "S10_DESTINATION_INFERRED"
                                    ? t("result.countryDestination", "PaÃ­s Destino")
                                    : t("result.country", "PaÃ­s")
                                }
                                value={localizeCountryName(ev.country, ev.countryIso2, language)}
                                icon="flag-outline"
                                theme={theme}
                                styles={styles}
                              />
                              <InfoRow
                                label={t("result.nextOffice", "Next office")}
                                value={ev.nextOffice}
                                icon="navigate-outline"
                                theme={theme}
                                styles={styles}
                              />
                            </>
                          )}
                        </Card>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
      {refreshingData && (
        <View style={styles.loaderOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loaderText}>{t("result.updatingEvents", "Updating events...")}</Text>
        </View>
      )}
    </Screen>
  );
}

function InfoRow({ label, value, icon, theme, styles }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color={theme.colors.muted} />
      <Text style={styles.infoLabel}>{label}:</Text>
      <Text style={styles.infoValue} numberOfLines={3}>
        {String(value)}
      </Text>
    </View>
  );
}

const createStyles = (t) =>
  StyleSheet.create({
    container: { flex: 1 },

    headerCard: { padding: t.spacing.xl },
    code: {
      marginTop: 6,
      fontSize: 20,
      fontWeight: "900",
      color: t.colors.text,
      letterSpacing: 0.4,
    },
    headerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
    headerCountryRow: { marginTop: 8 },
    countryChip: { width: "100%" },

    empty: { marginTop: 40, alignItems: "center" },

    sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    sectionTitle: { fontSize: 16, fontWeight: "900", color: t.colors.text },

    dayHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 8,
      paddingHorizontal: 2,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: "transparent",
      borderBottomColor: t.colors.border,
      backgroundColor: "transparent",
    },
    dayText: { fontWeight: "900", color: t.colors.text, flex: 1 },
    dayCount: { fontWeight: "700", color: t.colors.muted, fontSize: 12 },

    timelineRow: { flexDirection: "row", gap: 10, marginBottom: 10, alignItems: "stretch" },
    lineCol: { width: 62, alignItems: "center", paddingTop: 12 },
    traceTime: { fontSize: 12, fontWeight: "800", color: t.colors.muted, marginBottom: 8 },
    traceRail: { flex: 1, width: 12, alignItems: "center" },
    dot: { width: 8, height: 8, borderRadius: 4 },
    line: { flex: 1, width: 2, backgroundColor: t.colors.border, marginTop: 5, borderRadius: 2 },
    lineEnd: { flex: 1, width: 2, backgroundColor: "transparent" },

    eventCard: { padding: t.spacing.md, borderRadius: t.radius.lg },
    eventCardNew: {
      borderColor: `${t.colors.success}66`,
      borderWidth: 2,
      backgroundColor: t.isDark ? "rgba(34, 197, 94, 0.12)" : "rgba(34, 197, 94, 0.08)",
    },
    topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    eventType: { fontSize: 15, fontWeight: "900", color: t.colors.text, flex: 1 },
    newPill: {
      marginTop: 8,
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: `${t.colors.success}66`,
      backgroundColor: `${t.colors.success}1A`,
    },
    newPillText: { color: t.colors.success, fontWeight: "900", fontSize: 12 },

    subtitle: {
      marginTop: 8,
      color: t.colors.text,
      opacity: 0.8,
      fontWeight: "600",
    },

    divider: {
      height: 1,
      backgroundColor: t.colors.border,
      marginTop: 12,
      marginBottom: 10,
    },

    infoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
    infoLabel: { color: t.colors.muted, fontWeight: "900" },
    infoValue: { flex: 1, color: t.colors.text, fontWeight: "800", opacity: 0.9 },
    loaderOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.isDark ? "rgba(2, 6, 23, 0.55)" : "rgba(255, 255, 255, 0.78)",
      zIndex: 99,
    },
    loaderText: { marginTop: 10, color: t.colors.muted, fontWeight: "800" },
  });






