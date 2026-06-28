import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Image } from "react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../theme/ui";
import { useI18n } from "../i18n/ui";
import { Screen, Card, OutlineButton } from "../components/ui";
import { fetchTrackingByCode } from "../services/trackingApi";
import { getTrackingEvents, getTrackingPresentation, isDeliveredEvent } from "../utils/packageEvents";
import countries from "i18n-iso-countries";
import esLocale from "i18n-iso-countries/langs/es.json";
import enLocale from "i18n-iso-countries/langs/en.json";

countries.registerLocale(esLocale);
countries.registerLocale(enLocale);

const readText = (value) => String(value || "").trim();
const normalizeText = (value) => readText(value).toLowerCase();
const includesAny = (text, values) => values.some((value) => text.includes(value));
const S10_REGEX = /^[A-Z]{2}\d{9}[A-Z]{2}$/;
const READY_FOR_PICKUP_TERMS = [
  "listo para entregar",
  "listo para entrega",
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
  Sucre: {
    regional: "Regional: Sucre",
    direccion: "Calle Junin Esquina Ayacucho N 699",
  },
  Trinidad: {
    regional: "Regional: Beni",
    direccion: "Calle Cipriano Barace N 10 Entre Manuel Limpias y Calle Sucre",
  },
  Cobija: {
    regional: "Regional: Pando",
    direccion: "Av. Bruno Recua N 59",
  },
};

const COUNTRY_NAMES = {
  BO: "Bolivia",
  PE: "Peru",
  ES: "Espana",
  AR: "Argentina",
  BR: "Brasil",
  CL: "Chile",
  US: "Estados Unidos",
  CO: "Colombia",
  PY: "Paraguay",
  UY: "Uruguay",
  EC: "Ecuador",
  VE: "Venezuela",
  MX: "Mexico",
  FR: "Francia",
  DE: "Alemania",
  IT: "Italia",
  GB: "Reino Unido",
  CN: "China",
  JP: "Japon",
  KR: "Corea del Sur",
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

const normalizeCountryName = (value) =>
  readText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ");

const getCountryCode = (iso2) => {
  const normalized = readText(iso2).toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : "";
};

const countryIsoFromName = (value) => {
  const normalized = normalizeCountryName(value);
  if (!normalized) return null;
  return countries.getAlpha2Code(normalized, "es") || countries.getAlpha2Code(normalized, "en") || null;
};

const countryNameFromIso = (iso2) => {
  const code = getCountryCode(iso2);
  if (!code) return "";
  return COUNTRY_NAMES[code] || countries.getName(code, "es") || countries.getName(code, "en") || code;
};

const countryNameFromOffice = (value) => {
  const text = normalizeCountryName(value);
  const match = text.match(/(?:PAIS\s+ORIGEN|COUNTRY\s*ORIGIN)\s*:\s*(.+)$/);
  return match ? readText(match[1]) : "";
};

const isGenericOriginOffice = (value) => {
  const text = normalizeText(value);
  return text.startsWith("pais origen:") || text.startsWith("country origin:");
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
    CHUQUISACA: "Sucre",
    SUCRE: "Sucre",
    TARIJA: "Tarija",
    BENI: "Trinidad",
    TRINIDAD: "Trinidad",
    PANDO: "Cobija",
    COBIJA: "Cobija",
  };
  return Object.entries(map).find(([key]) => text.includes(key))?.[1] || null;
};

const parseIsoFromCode = (code) => {
  const normalized = readText(code).toUpperCase();
  if (!S10_REGEX.test(normalized)) return null;
  return normalized.slice(-2);
};

const parseIsoFromOffice = (value) => {
  const text = readText(value).toUpperCase();
  if (!text) return null;
  const countryName = countryNameFromOffice(text);
  if (countryName) return countryIsoFromName(countryName);
  const officeCodeMatch = text.match(/^([A-Z]{2}[A-Z]{3}[A-Z0-9]*)\b/);
  if (officeCodeMatch) return officeCodeMatch[1].slice(0, 2);
  return null;
};

const extractRoute = (value) => {
  const raw = readText(value).toUpperCase();
  if (!raw || !/(RECEPTACULO|ENVASE|DESPACHO|RUTA)/.test(raw)) return null;
  const match = raw.match(/([A-Z]{2}[A-Z]{3}[A-Z0-9][A-Z]{2}[A-Z]{3}[A-Z0-9][A-Z0-9]*)/);
  if (!match || match[1].length < 12) return null;
  const originIso = match[1].slice(0, 2);
  const destinationIso = match[1].slice(6, 8);
  if (!countryNameFromIso(originIso) || !countryNameFromIso(destinationIso)) return null;
  return { originIso, destinationIso };
};

const getFlagUrl = (iso2) => {
  const normalized = readText(iso2).toLowerCase();
  return /^[a-z]{2}$/.test(normalized) ? `https://flagcdn.com/32x24/${normalized}.png` : "";
};

const resolveSummary = (events, codigo, serviceLabel, t) => {
  const latestEvent = events[0] || null;
  const trackingIso = parseIsoFromCode(codigo);
  const isS10Code = S10_REGEX.test(readText(codigo).toUpperCase());
  const isBolivianCode = isS10Code && trackingIso === "BO";

  const originEvent = events.find((event) => countryNameFromOffice(event.office));
  const originCountryName = originEvent ? countryNameFromOffice(originEvent.office) : "";
  const originExternalIso = originEvent
    ? parseIsoFromCode(originEvent.codigo || codigo) || countryIsoFromName(originCountryName)
    : null;
  const originCity = readText(events.find((event) => event.originCity)?.originCity);
  const originIsoFromCity = originCity ? countryIsoFromName(originCity) : null;
  const originCityFromOffice = [...events]
    .reverse()
    .map((event) => detectBoliviaDepartment(event.office) || detectBoliviaDepartment(event.nextOffice))
    .find(Boolean);
  const routeOut = [...events]
    .reverse()
    .map((event) => extractRoute(event.description) || extractRoute(event.office) || extractRoute(event.nextOffice))
    .find((route) => route?.originIso === "BO" && route?.destinationIso && route.destinationIso !== "BO");
  const preferExternalOrigin = originCountryName !== "" && originExternalIso !== "BO" && !isBolivianCode;

  let originLabel = t("scan.heroPostal", "Correos de Bolivia");
  let originIso = null;

  if (isBolivianCode && routeOut) {
    originLabel = countryNameFromIso("BO") || "Bolivia";
    originIso = "BO";
  } else if (preferExternalOrigin) {
    originLabel = originCountryName;
    originIso = originExternalIso;
  } else if (originIsoFromCity && originIsoFromCity !== "BO") {
    originLabel = countryNameFromIso(originIsoFromCity) || originCity;
    originIso = originIsoFromCity;
  } else if (originCity !== "") {
    originLabel = capitalizeWords(originCity);
    originIso = "BO";
  } else if (serviceLabel === "CONTRATO" && originCityFromOffice) {
    originLabel = originCityFromOffice;
    originIso = "BO";
  } else if (originCityFromOffice) {
    originLabel = originCityFromOffice;
    originIso = "BO";
  } else if (originEvent) {
    originLabel = originCountryName;
    originIso = originExternalIso;
  } else {
    originIso = trackingIso;
    if (originIso) originLabel = countryNameFromIso(originIso) || originIso;
  }

  const destinationCity = readText(events.find((event) => event.destinationCity)?.destinationCity);
  const destinationCityFromOffice = events
    .map((event) => detectBoliviaDepartment(event.office) || detectBoliviaDepartment(event.nextOffice))
    .find(Boolean);
  const destinationPayloadIso =
    getCountryCode(events.find((event) => getCountryCode(event.destinationCountryIso))?.destinationCountryIso) || null;
  const destinationPayloadName = readText(events.find((event) => readText(event.destinationCountryName))?.destinationCountryName);
  const destinationIsoFromCity = destinationPayloadIso || (destinationCity ? countryIsoFromName(destinationCity) : null);
  const destinationIsoCandidates = events.flatMap((event) =>
    [event.office, event.nextOffice]
      .filter((office) => readText(office) && !isGenericOriginOffice(office))
      .map((office) => parseIsoFromOffice(office))
      .filter(Boolean)
  );
  const destinationIso =
    destinationIsoCandidates.find((iso) => String(iso).toUpperCase() !== "BO") ||
    destinationIsoCandidates[0] ||
    null;
  const hasEdiInboundSignals = events.some((event) => {
    const name = normalizeText(event.nombre_evento || event.title);
    const source = normalizeText(event.tabla_origen);
    return (
      name.includes("(entrada)") ||
      name.includes(" entrada ") ||
      name.includes("(inb)") ||
      name.includes(" inb") ||
      source.includes("ips5db-edi") ||
      source.includes("-edi")
    );
  });
  const forceInternational = isS10Code && isBolivianCode && destinationCity === "" && hasEdiInboundSignals;
  const destinationOnlyBoliviaOffice = isBolivianCode && destinationCity === "" && !routeOut && destinationIso === "BO";
  const isNationalDestination =
    !forceInternational &&
    !destinationOnlyBoliviaOffice &&
    ((destinationCity !== "" && destinationIsoFromCity === null) || destinationIso === "BO" || serviceLabel === "CONTRATO");
  const explicitInternationalEntry =
    !isBolivianCode &&
    originIso !== null &&
    originIso !== "BO" &&
    destinationPayloadIso === null &&
    destinationPayloadName === "" &&
    destinationCityFromOffice !== undefined;

  let destinationFlagIso = null;
  let destinationLabel = "Internacional";

  if (destinationIsoFromCity !== null) {
    destinationFlagIso = destinationIsoFromCity;
    destinationLabel = destinationPayloadName !== "" ? destinationPayloadName : countryNameFromIso(destinationFlagIso) || destinationCity;
  } else if (explicitInternationalEntry) {
    destinationFlagIso = "BO";
    destinationLabel = destinationCityFromOffice || "Bolivia";
  } else if (isBolivianCode && routeOut) {
    destinationFlagIso = routeOut.destinationIso;
    destinationLabel = countryNameFromIso(destinationFlagIso) || destinationFlagIso;
  } else if (destinationOnlyBoliviaOffice) {
    destinationFlagIso = null;
    destinationLabel = "Internacional";
  } else {
    destinationLabel = destinationCity !== "" ? capitalizeWords(destinationCity) : isNationalDestination ? "Nacional" : destinationIso || "Internacional";
    destinationFlagIso = isNationalDestination ? "BO" : destinationIso;
  }

  return {
    latestEvent,
    originIso,
    originLabel,
    destinationIso: destinationFlagIso,
    destinationLabel,
    isNationalDestination,
  };
};

export default function ResultScreen({ route }) {
  const theme = useTheme();
  const { t, language } = useI18n();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { colors } = theme;
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
        codigo: readText(event?.codigo || codigo),
        createdAt: event?.created_at || event?.updated_at || null,
        date: toDate(event?.created_at || event?.updated_at),
        dayParts: parseRawDateParts(event?.created_at || event?.updated_at || null),
        title: readText(event?.nombre_evento) || t("event.default", "Event"),
        service: readText(event?.servicio),
        office: readText(event?.office),
        nextOffice: readText(event?.next_office),
        description: readText(event?.descripcion),
        originCity: readText(event?.ciudad_origen),
        destinationCity: readText(event?.ciudad_destino),
        destinationCountryIso: readText(event?.pais_destino_iso2),
        destinationCountryName: readText(event?.pais_destino_nombre),
        tabla_origen: readText(event?.tabla_origen),
      }))
      .filter((event) => !!event.date)
      .sort((a, b) => b.date - a.date);
  }, [codigo, data, t]);

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
  const latestDateParts = parseRawDateParts(events[0]?.createdAt || null);
  const serviceLabel = readText(events[0]?.service).toUpperCase() || "EMS";
  const summary = useMemo(() => resolveSummary(events, codigo, serviceLabel, t), [events, codigo, serviceLabel, t]);

  const pickupNotice = useMemo(() => {
    if (presentation.delivered) {
      return {
        message: t("result.notice.delivered", "Tu paquete ya fue entregado. No tienes acciones pendientes en oficina."),
        detail: null,
      };
    }
    const readyEvent = events.find((event) => includesAny(normalizeText(event.title), READY_FOR_PICKUP_TERMS));
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
  }, [codigo, events, presentation.delivered, t]);

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
            <View style={[styles.statusOrb, styles.statusOrbA]} />
            <View style={[styles.statusOrb, styles.statusOrbB]} />
            <View style={styles.statusIcon}>
              <Ionicons
                name={presentation.delivered ? "checkmark" : "ellipse"}
                size={18}
                color={presentation.delivered ? "#3EA52F" : "#0F3F7B"}
              />
            </View>
            <View style={styles.statusBody}>
              <Text style={styles.statusTitle}>{presentation.globalStatus}</Text>
              <Text style={styles.statusSubtitle}>{summary.latestEvent?.title || t("event.default", "Event")}</Text>
              <Text style={styles.statusCode}>Tracking: {codigo}</Text>
            </View>
          </View>

          <View style={styles.summaryGrid}>
            <SummaryTile label="Origen postal" value={summary.originLabel} iso2={summary.originIso} accentStyle={styles.metaAccentA} styles={styles} />
            <SummaryTile label="Destino de entrega" value={summary.destinationLabel} iso2={summary.destinationIso} accentStyle={styles.metaAccentB} styles={styles} />
            <SummaryTile label="Servicio" value={serviceLabel} accentStyle={styles.metaAccentC} styles={styles} />
            <SummaryTile label="Ultima actualizacion" value={latestDateParts ? `${latestDateParts.dayLabel} ${latestDateParts.timeLabel}` : "-"} accentStyle={styles.metaAccentD} styles={styles} />
          </View>

          {cacheMeta?.fromCache ? (
            <Text style={styles.cacheText}>
              {cacheMeta?.stale ? t("result.cacheStale", "Datos guardados hace un tiempo") : t("result.cacheFresh", "Datos guardados recientemente")}
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
            <Text style={styles.cardTitle}>Progreso del envio</Text>
            <Text style={styles.cardMeta}>
              Paso actual: <Text style={styles.cardMetaStrong}>{presentation.currentStepLabel}</Text>
            </Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.progressTrack}>
            {presentation.steps.map((step, index) => {
              const done = index < presentation.currentStep;
              const current = index === presentation.currentStep;
              return (
                <View key={step} style={styles.progressStep}>
                  <View style={styles.progressNodeRow}>
                    <View style={[styles.progressLine, index === 0 ? styles.progressLineHidden : null, done || current ? styles.progressLineDone : null]} />
                    <View style={[styles.progressDot, done ? styles.progressDotDone : null, current ? styles.progressDotCurrent : null]}>
                      <Ionicons name={done ? "checkmark" : current ? "ellipse" : "ellipse-outline"} size={10} color={done || current ? "#fff" : "#8CA1BC"} />
                    </View>
                    <View style={[styles.progressLine, index === presentation.steps.length - 1 ? styles.progressLineHidden : null, done ? styles.progressLineDone : null]} />
                  </View>
                  <Text style={[styles.progressLabel, done || current ? styles.progressLabelActive : null]} numberOfLines={2}>
                    {step}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        </Card>

        {pickupNotice ? (
          <Card style={styles.noticeCard}>
            <Text style={styles.noticeText}>{pickupNotice.message}</Text>
            {pickupNotice.detail ? (
              <View style={styles.noticeDetail}>
                <InfoRow label="Oficina" value={pickupNotice.detail.regional} icon="business-outline" styles={styles} theme={theme} />
                <InfoRow label="Direccion" value={pickupNotice.detail.direccion} icon="location-outline" styles={styles} theme={theme} />
              </View>
            ) : null}
          </Card>
        ) : null}

        <Card style={styles.historyCard}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Historial de seguimiento</Text>
          </View>

          {events.length === 0 ? (
            <View style={styles.emptyHistory}>
              <Text style={styles.emptyTitle}>{t("result.noEvents", "No events")}</Text>
              <Text style={styles.emptyText}>{readText(data?.message) || t("result.noEventsDesc", "Este codigo no tiene registros de seguimiento.")}</Text>
            </View>
          ) : (
            grouped.map((group) => (
              <View key={group.dayKey} style={styles.historyGroup}>
                <View style={styles.historyGroupHead}>
                  <Text style={styles.historyGroupTitle}>{group.dayLabel}</Text>
                  <Text style={styles.historyGroupCount}>{group.events.length} evento(s)</Text>
                </View>

                <View style={styles.historyFeed}>
                  {group.events.map((event, index) => {
                    const isTopEvent = index === 0 && group.dayKey === grouped[0]?.dayKey;
                    return (
                      <View key={`${group.dayKey}-${index}`} style={[styles.historyEvent, isTopEvent ? styles.historyEventLatest : null, isHighlightedEvent(event) ? styles.historyEventNew : null]}>
                        <View style={styles.historySide}>
                          <Text style={styles.historyTime}>{event?.dayParts?.timeLabel || "--:--"}</Text>
                        </View>
                        <View style={styles.historyBody}>
                          <Text style={styles.historyEventTitle}>{event.title}</Text>
                          <View style={styles.historyMeta}>
                            <InfoRow
                              label="Oficina"
                              value={event.office}
                              icon="business-outline"
                              styles={styles}
                              theme={theme}
                              hideRow={isGenericOriginOffice(event.office)}
                              iso2={parseIsoFromOffice(event.office) || countryIsoFromName(countryNameFromOffice(event.office))}
                            />
                            <InfoRow
                              label="Siguiente oficina"
                              value={event.nextOffice}
                              icon="navigate-outline"
                              styles={styles}
                              theme={theme}
                              iso2={parseIsoFromOffice(event.nextOffice) || countryIsoFromName(countryNameFromOffice(event.nextOffice))}
                            />
                          </View>
                          {isDeliveredEvent(event) ? (
                            <View style={styles.latestBadge}>
                              <Text style={styles.latestBadgeText}>Entregado</Text>
                            </View>
                          ) : null}
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

function SummaryTile({ label, value, iso2, accentStyle, styles }) {
  const flagUrl = getFlagUrl(iso2);
  return (
    <View style={[styles.summaryTile, accentStyle]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <View style={styles.summaryValueRow}>
        <Text style={styles.summaryValue} numberOfLines={2}>
          {value || "-"}
        </Text>
        {flagUrl ? <Image source={{ uri: flagUrl }} style={styles.summaryFlag} /> : null}
      </View>
    </View>
  );
}

function InfoRow({ label, value, icon, theme, styles, iso2, hideRow = false }) {
  if (!readText(value) || hideRow) return null;
  const flagUrl = getFlagUrl(iso2);
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoBadge}>
        <Ionicons name={icon} size={13} color={theme.colors.muted} />
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={styles.infoValue} numberOfLines={3}>
        {String(value)}
      </Text>
      {flagUrl ? <Image source={{ uri: flagUrl }} style={styles.infoFlag} /> : null}
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
    statusCard: { padding: 0, borderRadius: 20, borderWidth: 1, borderColor: "rgba(162, 186, 219, 0.65)", borderTopWidth: 1, backgroundColor: "rgba(255,255,255,0.82)", overflow: "hidden", marginBottom: 12 },
    statusBanner: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 18, paddingHorizontal: 18, backgroundColor: "#0F3F7B", position: "relative", overflow: "hidden" },
    statusOrb: { position: "absolute", borderRadius: 999 },
    statusOrbA: { width: 108, height: 108, right: -20, top: -20, backgroundColor: "rgba(254,203,52,0.32)" },
    statusOrbB: { width: 78, height: 78, right: 120, bottom: -28, backgroundColor: "rgba(76,160,255,0.28)" },
    statusIcon: { width: 42, height: 42, borderRadius: 999, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", shadowColor: "#fff", shadowOpacity: 0.2, shadowOffset: { width: 0, height: 0 }, shadowRadius: 8, elevation: 3 },
    statusBody: { flex: 1 },
    statusTitle: { color: "#FFFFFF", fontWeight: "900", fontSize: 24, lineHeight: 28 },
    statusSubtitle: { marginTop: 4, color: "rgba(255,255,255,0.96)", fontWeight: "700", fontSize: 14, lineHeight: 18 },
    statusCode: { marginTop: 6, color: "#FFEA9B", fontSize: 12, fontWeight: "900" },
    summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, backgroundColor: "rgba(255,255,255,0.94)" },
    summaryTile: { width: "48%", minHeight: 78, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: "#D9E5F4", backgroundColor: "#FFFFFF" },
    metaAccentA: { borderTopWidth: 3, borderTopColor: "#2D7FD7" },
    metaAccentB: { borderTopWidth: 3, borderTopColor: "#34A37A" },
    metaAccentC: { borderTopWidth: 3, borderTopColor: "#F3BA1A" },
    metaAccentD: { borderTopWidth: 3, borderTopColor: "#8F77F0" },
    summaryLabel: { color: "#5D7596", fontSize: 10, fontWeight: "800" },
    summaryValueRow: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 8 },
    summaryValue: { flex: 1, color: "#112F52", fontWeight: "900", fontSize: 13, lineHeight: 18 },
    summaryFlag: { width: 20, height: 15, borderRadius: 2, borderWidth: 1, borderColor: "#CDDCF0" },
    cacheText: { paddingHorizontal: 16, paddingBottom: 12, color: "#5D7596", fontWeight: "700", fontSize: 11 },
    refreshWrap: { paddingHorizontal: 16, paddingBottom: 16 },
    refreshText: { marginBottom: 8, color: t.colors.text, fontWeight: "700", fontSize: 12 },
    progressCard: { paddingTop: 14, paddingBottom: 16, paddingHorizontal: 0, borderRadius: 14, borderTopWidth: 1, borderColor: "rgba(160, 186, 218, 0.65)", backgroundColor: "rgba(255,255,255,0.82)", marginBottom: 12 },
    cardHead: { paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    cardTitle: { fontSize: 17, fontWeight: "900", color: "#122F54" },
    cardMeta: { color: "#5D7596", fontWeight: "700", fontSize: 11 },
    cardMetaStrong: { color: "#1A549A", fontWeight: "900" },
    progressTrack: { paddingHorizontal: 12, paddingTop: 16, gap: 0 },
    progressStep: { width: 96, alignItems: "center" },
    progressNodeRow: { width: "100%", flexDirection: "row", alignItems: "center", marginBottom: 8 },
    progressLine: { flex: 1, height: 2, backgroundColor: "#BCCCE2" },
    progressLineHidden: { backgroundColor: "transparent" },
    progressLineDone: { backgroundColor: "#3EA52F" },
    progressDot: { width: 34, height: 34, borderRadius: 999, borderWidth: 2, borderColor: "#B8C8DC", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
    progressDotDone: { borderColor: "#3EA52F", backgroundColor: "#3EA52F" },
    progressDotCurrent: { borderColor: "#3EA52F", backgroundColor: "#3EA52F" },
    progressLabel: { color: "#4D6788", fontSize: 11, fontWeight: "700", textAlign: "center", lineHeight: 14, minHeight: 30, paddingHorizontal: 4 },
    progressLabelActive: { color: "#2B7E22", fontWeight: "900" },
    noticeCard: { padding: 14, borderRadius: 14, borderTopWidth: 1, borderColor: "#B8DFC2", backgroundColor: "#F3FFF6", marginBottom: 12 },
    noticeText: { color: "#1F5B33", fontWeight: "900", lineHeight: 20, fontSize: 13 },
    noticeDetail: { marginTop: 10, gap: 8 },
    historyCard: { paddingTop: 14, paddingBottom: 12, paddingHorizontal: 0, borderRadius: 14, borderTopWidth: 1, borderColor: "rgba(160, 186, 218, 0.65)", backgroundColor: "rgba(255,255,255,0.82)" },
    emptyHistory: { alignItems: "center", paddingVertical: 20, paddingHorizontal: 16 },
    historyGroup: { marginTop: 14, paddingHorizontal: 16 },
    historyGroupHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 },
    historyGroupTitle: { color: "#173F70", fontWeight: "900", fontSize: 15 },
    historyGroupCount: { color: "#6A7F99", fontWeight: "700", fontSize: 11 },
    historyFeed: { gap: 10 },
    historyEvent: { flexDirection: "row", gap: 0, borderWidth: 1, borderColor: "#DFE9F5", borderRadius: 12, backgroundColor: "#FFFFFF", overflow: "hidden" },
    historyEventLatest: { borderColor: "#C6E8D2", backgroundColor: "#FFFFFF" },
    historyEventNew: { borderColor: "#A7E0B6" },
    historySide: { width: 72, alignItems: "center", justifyContent: "center", backgroundColor: "#F7FAFF", borderRightWidth: 1, borderRightColor: "#DEE8F5", paddingVertical: 12, paddingHorizontal: 8 },
    historyTime: { color: "#163D6C", fontWeight: "900", fontSize: 13 },
    historyBody: { flex: 1, padding: 12 },
    historyEventTitle: { color: "#142F52", fontWeight: "900", fontSize: 14, lineHeight: 19 },
    historyMeta: { marginTop: 10, gap: 6 },
    infoRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#E1EAF5", borderRadius: 8, backgroundColor: "#F7FBFF", paddingHorizontal: 8, paddingVertical: 6 },
    infoBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingRight: 4 },
    infoLabel: { color: "#5F7898", fontWeight: "900", fontSize: 10, textTransform: "uppercase" },
    infoValue: { flex: 1, color: "#213F61", fontWeight: "700", lineHeight: 17, fontSize: 12 },
    infoFlag: { width: 18, height: 12, borderRadius: 2, borderWidth: 1, borderColor: "#CDDCF0" },
    latestBadge: { alignSelf: "flex-start", marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "#EAF8EE", borderWidth: 1, borderColor: "#C6E5CC" },
    latestBadgeText: { color: "#277D31", fontSize: 11, fontWeight: "900" },
    loaderOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255, 255, 255, 0.78)", zIndex: 99 },
    loaderText: { marginTop: 10, color: t.colors.muted, fontWeight: "800" },
  });
