import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Image } from "react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../theme/ui";
import { useI18n } from "../i18n/ui";
import { Screen, Card, OutlineButton } from "../components/ui";
import { fetchTrackingByCode } from "../services/trackingApi";
import { getTrackingEvents, getTrackingPresentation } from "../utils/packageEvents";

const readText = (value) => String(value || "").trim();
const lower = (value) => readText(value).toLowerCase();
const includesAny = (text, values) => values.some((value) => text.includes(value));
const S10_REGEX = /^[A-Z]{2}\d{9}[A-Z]{2}$/;
const READY_FOR_PICKUP_TERMS = [
  "listo para entregar",
  "oficina de entrega",
  "available for pickup",
  "ready for pickup",
  "delivery office",
  "pickup office",
];

const REGIONAL_CONTACTS = {
  "La Paz": {
    regional: "Oficina Central: La Paz",
    direccion: "Avenida Mariscal Santa Cruz Esquina Calle Oruro Edificio Telecomunicaciones",
  },
  Cochabamba: {
    regional: "Regional: Cochabamba",
    direccion: "Calle Ayacucho esquina Av. Heroinas N 113",
  },
  "Santa Cruz": {
    regional: "Regional: Santa Cruz",
    direccion: "Calle Cobija Entre Sucre y Ballivian N 24",
  },
  Oruro: {
    regional: "Regional: Oruro",
    direccion: "Calle Presidente Montes Esquina Junin N 1456",
  },
  Potosi: {
    regional: "Regional: Potosi",
    direccion: "Calle Hoyos Esquina Topater, Villa Imperial de Potosi",
  },
  Tarija: {
    regional: "Regional: Tarija",
    direccion: "Calle Mariscal Sucre esquina Virginio Lema N 397",
  },
  Chuquisaca: {
    regional: "Regional: Sucre",
    direccion: "Calle Junin Esquina Ayacucho N 699",
  },
  Beni: {
    regional: "Regional: Beni",
    direccion: "Calle Cipriano Barace N 10 Entre Manuel Limpias y Calle Sucre",
  },
  Pando: {
    regional: "Regional: Pando",
    direccion: "Av. Bruno Recua N 59",
  },
};

const parseRawDateParts = (value) => {
  if (!value || typeof value !== "string") return null;
  const normalized = value.replace("T", " ").replace("Z", "");
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  const date = new Date(`${y}-${mo}-${d}T00:00:00`);
  const dayLabel = Number.isNaN(date.getTime())
    ? `${d}/${mo}/${y}`
    : new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short", year: "numeric" }).format(date);
  return {
    dayKey: `${y}-${mo}-${d}`,
    dayLabel,
    timeLabel: `${h}:${mi}`,
  };
};

const toDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const capitalizeWords = (value) =>
  readText(value)
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatLocationLabel = (value) => {
  const text = readText(value);
  if (!text) return "";
  if (/^[A-Z]{2}$/.test(text.toUpperCase())) return text.toUpperCase();
  return capitalizeWords(text);
};

const parseIsoFromCode = (code) => {
  const normalized = readText(code).toUpperCase();
  if (!S10_REGEX.test(normalized)) return null;
  return normalized.slice(-2);
};

const parseIsoFromOffice = (value) => {
  const text = readText(value).toUpperCase();
  if (!text) return null;
  const officeCodeMatch = text.match(/\b([A-Z]{2})[A-Z0-9]{4}\b/);
  if (officeCodeMatch) return officeCodeMatch[1];
  const standaloneIsoMatch = text.match(/\b([A-Z]{2})\b/);
  return standaloneIsoMatch ? standaloneIsoMatch[1] : null;
};

const detectBoliviaDepartment = (value) => {
  const text = readText(value).toUpperCase();
  if (!text) return null;
  const map = {
    "LA PAZ": "La Paz",
    ORURO: "Oruro",
    POTOSI: "Potosi",
    COCHABAMBA: "Cochabamba",
    "SANTA CRUZ": "Santa Cruz",
    CHUQUISACA: "Chuquisaca",
    SUCRE: "Chuquisaca",
    TARIJA: "Tarija",
    BENI: "Beni",
    PANDO: "Pando",
  };
  return Object.entries(map).find(([key]) => text.includes(key))?.[1] || null;
};

const getFlagUrl = (iso2) => {
  const normalized = readText(iso2).toLowerCase();
  return /^[a-z]{2}$/.test(normalized) ? `https://flagcdn.com/32x24/${normalized}.png` : "";
};

const getCountryCode = (iso2) => {
  const normalized = readText(iso2).toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : "";
};

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

  const codigo = readText(data?.filtro?.codigo || initialData?.filtro?.codigo || "");
  const exists = data?.existe_paquete !== false;
  const cacheMeta = data?.meta_cache || {};

  const refreshFromApi = useCallback(async () => {
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
  }, [codigo, language, t]);

  useFocusEffect(
    useCallback(() => {
      refreshFromApi();
    }, [refreshFromApi])
  );

  const events = useMemo(() => {
    return getTrackingEvents(data)
      .map((event) => ({
        ...event,
        createdAt: event?.created_at || event?.updated_at || null,
        date: toDate(event?.created_at || event?.updated_at),
        dayParts: parseRawDateParts(event?.created_at || event?.updated_at || null),
        title: readText(event?.nombre_evento) || t("event.default", "Event"),
        service: readText(event?.servicio),
        office: readText(event?.office),
        nextOffice: readText(event?.next_office),
        originCity: readText(event?.ciudad_origen),
        destinationCity: readText(event?.ciudad_destino),
        sourceKind: event?.tabla_origen === "api_sqlserver" ? "external" : "local",
      }))
      .filter((event) => !!event.date)
      .sort((a, b) => b.date - a.date);
  }, [data, t]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const event of events) {
      const key = event?.dayParts?.dayKey;
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(event);
    }
    return Array.from(map.keys())
      .sort((a, b) => (a < b ? 1 : -1))
      .map((key) => ({
        dayKey: key,
        dayLabel: map.get(key)?.[0]?.dayParts?.dayLabel || key,
        events: map.get(key) || [],
      }));
  }, [events]);

  const presentation = useMemo(() => getTrackingPresentation(data, t), [data, t]);
  const latestEvent = events[0] || null;
  const latestDateParts = parseRawDateParts(latestEvent?.createdAt || null);
  const serviceLabel = readText(latestEvent?.service).toUpperCase() || "EMS";
  const originCity = readText(events.find((event) => event.originCity)?.originCity);
  const destinationCity = readText(events.find((event) => event.destinationCity)?.destinationCity);
  const destinationIso = events.reduce(
    (found, event) => found || parseIsoFromOffice(event.office) || parseIsoFromOffice(event.nextOffice),
    null
  );
  const trackingIso = parseIsoFromCode(codigo);
  const isNationalDestination = !!destinationCity || destinationIso === "BO" || trackingIso === "BO";
  const originIso = originCity ? "BO" : trackingIso;
  const originLabel = originCity
    ? formatLocationLabel(originCity)
    : originIso
      ? getCountryCode(originIso)
      : t("scan.heroPostal", "Correos de Bolivia");
  const destinationLabel = destinationCity
    ? formatLocationLabel(destinationCity)
    : isNationalDestination
      ? "BO"
      : destinationIso
        ? getCountryCode(destinationIso)
        : "-";

  const pickupNotice = useMemo(() => {
    if (presentation.delivered) {
      return {
        message: t("result.notice.delivered", "Tu paquete ya fue entregado. No tienes acciones pendientes en oficina."),
        detail: null,
      };
    }
    const readyEvent = events.find((event) => includesAny(lower(event.title), READY_FOR_PICKUP_TERMS));
    if (!readyEvent) return null;
    const officeIso = parseIsoFromOffice(readyEvent.office);
    const isBolivia = officeIso === "BO" || parseIsoFromCode(codigo) === "BO";
    if (!isBolivia) return null;
    const department = detectBoliviaDepartment(readyEvent.office);
    const detail = REGIONAL_CONTACTS[department] || REGIONAL_CONTACTS["La Paz"] || null;
    return {
      message: department
        ? t("result.notice.pickupDepartment", `Tu paquete esta listo para entregar. Debes pasar a recoger en el departamento de ${department}.`).replace("{department}", department)
        : t("result.notice.pickupBolivia", "Tu paquete esta listo para entregar. Debes pasar a recoger en tu oficina de destino en Bolivia."),
      detail,
    };
  }, [codigo, events, presentation.delivered]);

  const isHighlightedEvent = (event) => {
    if (!highlight) return false;
    const sameDate = !highlight.eventDate || highlight.eventDate === event.createdAt;
    const sameTitle = !highlight.eventTitle || highlight.eventTitle === event.title;
    const sameOffice = !highlight.office || highlight.office === event.office;
    return sameDate && sameTitle && sameOffice;
  };

  if (!data) {
    return (
      <Screen>
        <View style={styles.emptyWrap}>
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{t("result.noData", "Sin datos para mostrar")}</Text>
            <Text style={styles.emptyText}>{t("result.noDataDesc", "Vuelve atras y consulta un codigo nuevamente.")}</Text>
          </Card>
        </View>
      </Screen>
    );
  }

  if (!exists || !codigo) {
    return (
      <Screen>
        <View style={styles.emptyWrap}>
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{t("result.noEvents", "No events")}</Text>
            <Text style={styles.emptyText}>{readText(data?.message) || t("api.invalidCode", "No existe dicho paquete")}</Text>
          </Card>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 14,
          paddingTop: 14,
          paddingBottom: 20 + insets.bottom,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.statusCard}>
          <View style={styles.statusBanner}>
            <View style={[styles.statusIcon, { backgroundColor: presentation.delivered ? `${colors.success}18` : `${colors.primary}18` }]}>
              <Ionicons
                name={presentation.delivered ? "checkmark" : "ellipse"}
                size={22}
                color={presentation.delivered ? colors.success : colors.primaryDark}
              />
            </View>
            <View style={styles.statusBody}>
              <Text style={styles.statusTitle}>{presentation.globalStatus}</Text>
              <Text style={styles.statusSubtitle}>{latestEvent?.title || t("event.default", "Event")}</Text>
              <Text style={styles.statusCode}>Tracking: {codigo}</Text>
            </View>
          </View>

          <View style={styles.summaryGrid}>
            <SummaryTile label={t("result.origin", "Origen")} value={originLabel} iso2={originIso} styles={styles} />
            <SummaryTile label={t("result.destination", "Destino")} value={destinationLabel} iso2={isNationalDestination ? "BO" : destinationIso} styles={styles} />
            <SummaryTile label={t("result.service", "Servicio")} value={serviceLabel} styles={styles} />
            <SummaryTile
              label={t("result.lastUpdate", "Ultima actualizacion")}
              value={latestDateParts ? `${latestDateParts.dayLabel} ${latestDateParts.timeLabel}` : "-"}
              styles={styles}
            />
          </View>

          {cacheMeta?.fromCache ? (
            <Text style={styles.cacheText}>
              {cacheMeta?.stale ? t("result.cacheStale", "Data saved a while ago") : t("result.cacheFresh", "Recently saved data")}
            </Text>
          ) : null}
          {refreshError ? (
            <View style={styles.refreshWrap}>
              <Text style={styles.refreshText}>{refreshError}</Text>
              <OutlineButton title={t("result.retryUpdate", "Retry update")} icon="refresh" onPress={refreshFromApi} />
            </View>
          ) : null}
        </Card>

        <Card style={styles.progressCard}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>{t("result.progressTitle", "Progreso del envio")}</Text>
            <Text style={styles.cardMeta}>
              {t("result.currentStep", "Paso actual")}: <Text style={styles.cardMetaStrong}>{presentation.currentStepLabel}</Text>
            </Text>
          </View>

          <View style={styles.progressTrack}>
            {presentation.steps.map((step, index) => {
              const done = index < presentation.currentStep;
              const current = index === presentation.currentStep;
              const lineLeftDone = index <= presentation.currentStep;
              const lineRightDone = index < presentation.currentStep;
              return (
                <View key={step} style={styles.progressStep}>
                  <View style={styles.progressNodeRow}>
                    <View style={[styles.progressLineSide, index === 0 ? styles.progressLineHidden : null, lineLeftDone ? styles.progressLineDone : null]} />
                    <View style={[styles.progressDot, done ? styles.progressDotDone : null, current ? styles.progressDotCurrent : null]}>
                      <Ionicons name={done ? "checkmark" : current ? "ellipse" : "ellipse-outline"} size={10} color={done || current ? "#fff" : colors.muted} />
                    </View>
                    <View
                      style={[
                        styles.progressLineSide,
                        index === presentation.steps.length - 1 ? styles.progressLineHidden : null,
                        lineRightDone ? styles.progressLineDone : null,
                      ]}
                    />
                  </View>
                  <Text style={[styles.progressLabel, done || current ? styles.progressLabelActive : null]} numberOfLines={2}>
                    {step}
                  </Text>
                </View>
              );
            })}
          </View>
        </Card>

        {pickupNotice ? (
          <Card style={styles.noticeCard}>
            <Text style={styles.noticeText}>{pickupNotice.message}</Text>
            {pickupNotice.detail ? (
              <View style={styles.noticeDetail}>
                <InfoRow label={t("result.office", "Office")} value={pickupNotice.detail.regional} icon="business-outline" styles={styles} theme={theme} />
                <InfoRow label={t("result.address", "Direccion")} value={pickupNotice.detail.direccion} icon="location-outline" styles={styles} theme={theme} />
              </View>
            ) : null}
          </Card>
        ) : null}

        <Card style={styles.historyCard}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>{t("result.historyTitle", "Historial de seguimiento")}</Text>
          </View>

          {events.length === 0 ? (
            <View style={styles.emptyHistory}>
              <Text style={[typography.h2, { textAlign: "center" }]}>{t("result.noEvents", "No events")}</Text>
              <Text style={[typography.p, { textAlign: "center", marginTop: 6 }]}>{readText(data?.message) || t("result.noEventsDesc", "Este codigo no tiene registros de seguimiento.")}</Text>
            </View>
          ) : (
            grouped.map((group) => (
              <View key={group.dayKey} style={styles.historyGroup}>
                <View style={styles.historyGroupHead}>
                  <Text style={styles.historyGroupTitle}>{group.dayLabel}</Text>
                  <Text style={styles.historyGroupCount}>{group.events.length} {t("result.eventCount", "evento(s)")}</Text>
                </View>

                <View style={styles.historyFeed}>
                  {group.events.map((event, index) => {
                    const isLatest = index === 0 && group.dayKey === grouped[0]?.dayKey;
                    return (
                      <View key={`${group.dayKey}-${index}`} style={[styles.historyEvent, isLatest ? styles.historyEventLatest : null, isHighlightedEvent(event) ? styles.historyEventNew : null]}>
                        <View style={styles.historySide}>
                          <Text style={styles.historyTime}>{event?.dayParts?.timeLabel || "--:--"}</Text>
                        </View>
                        <View style={styles.historyBody}>
                          <Text style={styles.historyEventTitle}>{event.title}</Text>
                          <View style={styles.historyMeta}>
                            <InfoRow label={t("result.office", "Office")} value={event.office} icon="business-outline" styles={styles} theme={theme} />
                            <InfoRow label={t("result.nextOffice", "Next office")} value={event.nextOffice} icon="navigate-outline" styles={styles} theme={theme} />
                            {event.sourceKind === "external" ? (
                              <>
                                <InfoRow label={t("result.origin", "Origen")} value={event.originCity} icon="navigate-circle-outline" styles={styles} theme={theme} />
                                <InfoRow label={t("result.destination", "Destino")} value={event.destinationCity} icon="flag-outline" styles={styles} theme={theme} />
                              </>
                            ) : null}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))
          )}
        </Card>
      </ScrollView>

      {refreshingData ? (
        <View style={styles.loaderOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loaderText}>{t("result.updatingEvents", "Updating events...")}</Text>
        </View>
      ) : null}
    </Screen>
  );
}

function SummaryTile({ label, value, iso2, styles }) {
  const flagUrl = getFlagUrl(iso2);
  return (
    <View style={styles.summaryTile}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <View style={styles.summaryValueRow}>
        <Text style={styles.summaryValue}>{value || "-"}</Text>
        {flagUrl ? <Image source={{ uri: flagUrl }} style={styles.summaryFlag} /> : null}
      </View>
    </View>
  );
}

function InfoRow({ label, value, icon, theme, styles }) {
  if (!readText(value)) return null;
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color={theme.colors.muted} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={3}>
        {String(value)}
      </Text>
    </View>
  );
}

const createStyles = (t) =>
  StyleSheet.create({
    container: { flex: 1 },
    emptyWrap: { flex: 1, justifyContent: "center", padding: 18 },
    emptyCard: { borderTopWidth: 0, borderRadius: 22, paddingVertical: 24, alignItems: "center" },
    emptyTitle: { color: t.colors.text, fontWeight: "900", fontSize: 18, textAlign: "center" },
    emptyText: { marginTop: 8, color: t.colors.muted, fontWeight: "700", textAlign: "center", lineHeight: 21 },
    statusCard: { padding: 14, borderRadius: 22, borderTopWidth: 0, backgroundColor: t.isDark ? "rgba(15, 23, 42, 0.96)" : "#F8FAFC", marginBottom: 12 },
    statusBanner: { flexDirection: "row", gap: 12, alignItems: "center", padding: 14, borderRadius: 18, backgroundColor: t.isDark ? "rgba(255,255,255,0.03)" : "#FFFFFF", borderWidth: 1, borderColor: t.colors.border },
    statusIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    statusBody: { flex: 1 },
    statusTitle: { fontSize: 21, fontWeight: "900", color: t.colors.text, lineHeight: 25 },
    statusSubtitle: { marginTop: 3, fontSize: 13, fontWeight: "700", color: t.colors.text, opacity: 0.9, lineHeight: 18 },
    statusCode: { marginTop: 5, color: t.colors.muted, fontSize: 11, fontWeight: "800" },
    summaryGrid: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 },
    summaryTile: { width: "48%", minHeight: 74, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.isDark ? "rgba(255,255,255,0.03)" : "#FFFFFF" },
    summaryLabel: { color: t.colors.muted, fontSize: 9, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.7 },
    summaryValueRow: { marginTop: 7, flexDirection: "row", alignItems: "center", gap: 8 },
    summaryValue: { flex: 1, color: t.colors.text, fontWeight: "900", fontSize: 13, lineHeight: 18 },
    summaryFlag: { width: 22, height: 16, borderRadius: 3, borderWidth: 1, borderColor: t.colors.border },
    metaRow: { marginTop: 10, flexDirection: "row", justifyContent: "space-between", gap: 10 },
    metaText: { color: t.colors.muted, fontWeight: "700", fontSize: 11 },
    cacheText: { marginTop: 7, color: t.colors.muted, fontWeight: "700", fontSize: 11 },
    refreshWrap: { marginTop: 10 },
    refreshText: { marginBottom: 8, color: t.colors.text, fontWeight: "700", fontSize: 12 },
    progressCard: { padding: 14, borderRadius: 22, borderTopWidth: 0, backgroundColor: t.isDark ? "rgba(15, 23, 42, 0.96)" : "#F8FAFC", marginBottom: 12 },
    cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    cardTitle: { fontSize: 16, fontWeight: "900", color: t.colors.text },
    cardMeta: { color: t.colors.muted, fontWeight: "700", fontSize: 11 },
    cardMetaStrong: { color: t.colors.text, fontWeight: "900" },
    progressTrack: { marginTop: 14, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: 2 },
    progressStep: { flex: 1, alignItems: "center", minWidth: 0 },
    progressNodeRow: { width: "100%", flexDirection: "row", alignItems: "center", marginBottom: 8 },
    progressDot: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.colors.surface },
    progressDotDone: { backgroundColor: t.colors.success, borderColor: t.colors.success },
    progressDotCurrent: { backgroundColor: t.colors.primaryDark, borderColor: t.colors.primaryDark },
    progressLineSide: { flex: 1, height: 2, borderRadius: 99, backgroundColor: t.colors.border },
    progressLineHidden: { backgroundColor: "transparent" },
    progressLineDone: { backgroundColor: t.colors.success },
    progressLabel: { color: t.colors.muted, fontSize: 9, fontWeight: "800", textAlign: "center", lineHeight: 12, paddingHorizontal: 3, maxWidth: "100%", minHeight: 26 },
    progressLabelActive: { color: t.colors.text },
    noticeCard: { padding: 14, borderRadius: 20, borderTopWidth: 0, backgroundColor: t.isDark ? "rgba(15, 23, 42, 0.96)" : "#F8FAFC", marginBottom: 12 },
    noticeText: { color: t.colors.text, fontWeight: "800", lineHeight: 20, fontSize: 13 },
    noticeDetail: { marginTop: 10, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.isDark ? "rgba(255,255,255,0.03)" : "#FFFFFF" },
    historyCard: { padding: 14, borderRadius: 22, borderTopWidth: 0, backgroundColor: t.isDark ? "rgba(15, 23, 42, 0.96)" : "#F8FAFC" },
    emptyHistory: { alignItems: "center", paddingVertical: 20 },
    historyGroup: { marginTop: 16 },
    historyGroupHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: t.colors.border },
    historyGroupTitle: { color: t.colors.text, fontWeight: "900", fontSize: 14 },
    historyGroupCount: { color: t.colors.muted, fontWeight: "800", fontSize: 10 },
    historyFeed: { marginTop: 12, gap: 10 },
    historyEvent: { flexDirection: "row", gap: 10, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.isDark ? "rgba(255,255,255,0.03)" : "#FFFFFF" },
    historyEventLatest: { borderColor: `${t.colors.primaryDark}55`, backgroundColor: t.isDark ? "rgba(254, 204, 54, 0.08)" : "#FFF9E8" },
    historyEventNew: { borderColor: `${t.colors.success}66`, backgroundColor: t.isDark ? "rgba(34, 197, 94, 0.10)" : "rgba(34, 197, 94, 0.08)" },
    historySide: { width: 42, alignItems: "center", justifyContent: "flex-start", paddingTop: 2 },
    historyTime: { color: t.colors.muted, fontWeight: "900", fontSize: 11 },
    historyBody: { flex: 1 },
    historyEventTitle: { color: t.colors.text, fontWeight: "900", fontSize: 14, lineHeight: 19 },
    historyMeta: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: t.colors.border },
    infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: 6 },
    infoLabel: { color: t.colors.muted, fontWeight: "900", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.35 },
    infoValue: { flex: 1, color: t.colors.text, fontWeight: "700", lineHeight: 17, fontSize: 12, opacity: 0.95 },
    loaderOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: t.isDark ? "rgba(2, 6, 23, 0.55)" : "rgba(255, 255, 255, 0.78)", zIndex: 99 },
    loaderText: { marginTop: 10, color: t.colors.muted, fontWeight: "800" },
  });
