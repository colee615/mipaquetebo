import { View, Text, Modal, ScrollView, StyleSheet, ActivityIndicator, Image, Linking, TouchableOpacity, Pressable, useWindowDimensions } from "react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../theme/ui";
import { useI18n } from "../i18n/ui";
import { Screen, Card, OutlineButton } from "../components/ui";
import { fetchTrackingByCode } from "../services/trackingApi";
import { getLocalizedApiErrorMessage } from "../utils/apiErrors";
import { getTrackingEvents, getTrackingPresentation, isDeliveredEvent } from "../utils/packageEvents";
import countries from "i18n-iso-countries";
import esLocale from "i18n-iso-countries/langs/es.json";
import enLocale from "i18n-iso-countries/langs/en.json";

countries.registerLocale(esLocale);
countries.registerLocale(enLocale);

const readText = (value) => String(value || "").trim();
const normalizeText = (value) => readText(value).toLowerCase();
const S10_REGEX = /^[A-Z]{2}\d{9}[A-Z]{2}$/;
const OFFICIAL_TRACKING_URL = "https://trackingbo.correos.gob.bo:8100/";
const OFFICIAL_SITE_URL = "https://correos.gob.bo/";

// React Native only bundles local images referenced with a static require.
// Keep this map in sync with tracking-demo.blade.php in bolipost.
const TRACKING_STEP_IMAGES = {
  Admision: {
    active: require("../../assets/eventos/admision.png"),
    pending: require("../../assets/eventos/admision-blanco.png"),
  },
  Clasificacion: {
    active: require("../../assets/eventos/admision.png"),
    pending: require("../../assets/eventos/admision-blanco.png"),
  },
  Despacho: {
    active: require("../../assets/eventos/despacho.png"),
    pending: require("../../assets/eventos/despacho-blanco.png"),
  },
  Expedicion: {
    active: require("../../assets/eventos/expedision.png"),
    pending: require("../../assets/eventos/expedision-blanco.png"),
  },
  Aduana: {
    active: require("../../assets/eventos/aduana.png"),
    pending: require("../../assets/eventos/aduana.png"),
  },
  Ventanilla: {
    active: require("../../assets/eventos/ventanilla.png"),
    pending: require("../../assets/eventos/ventanilla-blanco.png"),
  },
  Cartero: {
    active: require("../../assets/eventos/cartero.png"),
    pending: require("../../assets/eventos/cartero-blanco.png"),
  },
  Entregado: {
    active: require("../../assets/eventos/entregado.png"),
    pending: require("../../assets/eventos/entregado-blanco.png"),
  },
  "Devolución": {
    active: require("../../assets/eventos/expedision.png"),
    pending: require("../../assets/eventos/expedision-blanco.png"),
  },
  "Retorno recibido": {
    active: require("../../assets/eventos/ventanilla.png"),
    pending: require("../../assets/eventos/ventanilla-blanco.png"),
  },
  "Devuelto al remitente": {
    active: require("../../assets/eventos/entregado.png"),
    pending: require("../../assets/eventos/entregado-blanco.png"),
  },
};

const REGIONAL_CONTACTS = {
  "La Paz": {
    regional: "Oficina Central: La Paz",
    direccion: "Avenida Mariscal Santa Cruz Esquina Calle Oruro Edificio Telecomunicaciones",
    coords: "-16.4980703,-68.1355719",
  },
  Cochabamba: {
    regional: "Regional: Cochabamba",
    direccion: "Calle Ayacucho esquina Av. Heroinas N° 113",
    coords: "17°23'34.1\"S 66°09'31.0\"W",
  },
  "Santa Cruz": {
    regional: "Regional: Santa Cruz",
    direccion: "Calle Adriana Coimbra, entre 3er Anillo Externo y 4to Anillo",
    coords: "-17.7567141,-63.1787119",
  },
  Oruro: {
    regional: "Regional: Oruro",
    direccion: "Calle Presidente Montes Esquina Junin N° 1456",
    coords: "17°58'07.3\"S 67°06'53.6\"W",
  },
  Potosi: {
    regional: "Regional: Potosi",
    direccion: "Calle Hoyos Esquina Topater, Villa Imperial de Potosi",
    coords: "19°35'19.3\"S 65°44'56.2\"W",
  },
  Tarija: {
    regional: "Regional: Tarija",
    direccion: "Calle Mariscal Sucre esquina Virginio Lema N° 397",
    coords: "21°32'10.0\"S 64°44'04.5\"W",
  },
  Sucre: {
    regional: "Regional: Sucre",
    direccion: "Calle Junin Esquina Ayacucho N° 699",
    coords: "19°02'49.8\"S 65°15'41.0\"W",
  },
  Trinidad: {
    regional: "Regional: Trinidad",
    direccion: "Calle Cipriano Barace N°10 Entre Manuel Limpias y Calle Sucre",
    coords: "14°50'04.0\"S 64°54'11.8\"W",
  },
  Cobija: {
    regional: "Regional: Cobija",
    direccion: "Av. Bruno Recua N.- 59",
    coords: "11°01'03.8\"S 68°45'15.9\"W",
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
  NL: "Paises Bajos",
  CA: "Canada",
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
    numericLabel: `${d}/${mo}/${y}`,
    timeLabel: `${h}:${mi}`,
  };
};

const toDate = (value) => {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[T\s]+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const [, year, month, day, hour, minute, second = "0"] = match;
    return new Date(+year, +month - 1, +day, +hour, +minute, +second);
  }
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

const getUpuOfficeCode = (value) => {
  const match = readText(value).toUpperCase().match(/^([A-Z]{2}[A-Z]{3}[A-Z0-9])(?:\b|\s*-)/);
  return match?.[1] || null;
};

const cleanOfficeLabel = (value) => {
  const original = readText(value);
  if (!original) return "";
  const country = countryNameFromOffice(original);
  if (country) return countryNameFromIso(countryIsoFromName(country)) || country;
  const upuCode = getUpuOfficeCode(original);
  const match = original.match(/^[A-Z]{2}[A-Z]{3}[A-Z0-9]\s*-\s*(.+)$/i);
  if (!upuCode || !match?.[1]) return original;
  const label = readText(match[1]);
  const codeIso = upuCode.slice(0, 2);
  const labelIso = countryIsoFromName(label);
  return !labelIso || labelIso === codeIso ? label : original;
};

const cleanEventTitle = (value) => {
  const original = readText(value);
  if (!original) return "Evento de seguimiento";
  const match = original.match(/^(.*?)-\s*([A-Z]{2}[A-Z]{3}[A-Z0-9]\s*-\s*.+)$/i);
  if (!match || !getUpuOfficeCode(match[2])) return original;
  const location = cleanOfficeLabel(match[2]);
  const prefix = readText(match[1]).replace(/[-\s]+$/, "");
  return prefix && location ? `${prefix} - ${location}` : original;
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
    SUCRE: "Sucre",
    TARIJA: "Tarija",
    TRINIDAD: "Trinidad",
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
  const directCountryIso = countryIsoFromName(text);
  if (directCountryIso) return directCountryIso;
  const officeCode = getUpuOfficeCode(text);
  if (officeCode) return officeCode.slice(0, 2);
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
  } else if (!isBolivianCode && trackingIso) {
    // Igual que la web: el sufijo S10 identifica con mayor fiabilidad a la
    // administracion postal emisora que un texto libre del evento.
    originIso = trackingIso;
    originLabel = countryNameFromIso(originIso) || originIso;
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
    destinationPayloadName === "";

  let destinationFlagIso = null;
  let destinationLabel = "Internacional";

  if (destinationIsoFromCity !== null) {
    destinationFlagIso = destinationIsoFromCity;
    destinationLabel = destinationPayloadName !== "" ? destinationPayloadName : countryNameFromIso(destinationFlagIso) || destinationCity;
  } else if (explicitInternationalEntry) {
    destinationFlagIso = "BO";
    destinationLabel = "Bolivia";
  } else if (isBolivianCode && routeOut) {
    destinationFlagIso = routeOut.destinationIso;
    destinationLabel = countryNameFromIso(destinationFlagIso) || destinationFlagIso;
  } else if (destinationOnlyBoliviaOffice) {
    destinationFlagIso = null;
    destinationLabel = "Internacional";
  } else {
    destinationFlagIso = isNationalDestination ? "BO" : destinationIso;
    destinationLabel = destinationCity !== ""
      ? capitalizeWords(destinationCity)
      : isNationalDestination
        ? destinationFlagIso === "BO" ? "Bolivia" : "Nacional"
        : destinationIso || "Internacional";
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
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const initialData = route?.params?.data;
  const highlight = route?.params?.highlight || null;
  const [data, setData] = useState(initialData || null);
  const [refreshingData, setRefreshingData] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [officialInfoVisible, setOfficialInfoVisible] = useState(false);
  const apiErrorText = useCallback((error, overrides = {}) => getLocalizedApiErrorMessage(t, error, overrides), [t]);
  const openExternalLink = useCallback(async (url) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) return;
      await Linking.openURL(url);
    } catch {}
  }, []);

  const renderOfficialInfo = () => (
    <View style={styles.officialModalCard}>
      <View style={styles.officialModalHeader}>
        <View style={styles.officialModalIcon}>
          <Ionicons name="shield-checkmark" size={19} color={colors.secondary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.officialModalTitle}>{t("scan.officialInfo.title", "Fuente oficial de consulta")}</Text>
          <Text style={styles.officialModalKicker}>{t("scan.officialInfo.kicker", "Información verificada")}</Text>
        </View>
        <TouchableOpacity
          style={styles.officialModalClose}
          onPress={() => setOfficialInfoVisible(false)}
          accessibilityLabel={t("common.close", "Cerrar")}
          hitSlop={10}
        >
          <Ionicons name="close" size={20} color={colors.muted} />
        </TouchableOpacity>
      </View>
      <Text style={styles.officialModalBody}>
        {t("scan.officialInfo.body", "La informacion mostrada en esta app proviene de los sistemas de seguimiento publicados por Correos de Bolivia.")}
      </Text>
      <View style={styles.officialModalLinks}>
        <TouchableOpacity style={styles.officialModalLink} onPress={() => openExternalLink(OFFICIAL_SITE_URL)} activeOpacity={0.82}>
          <Ionicons name="globe-outline" size={17} color={colors.secondary} />
          <View style={styles.officialModalLinkCopy}>
            <Text style={styles.officialModalLinkLabel}>{t("scan.officialInfo.sourceLabel", "Sitio oficial")}</Text>
            <Text style={styles.officialModalLinkUrl} numberOfLines={1}>{t("scan.officialInfo.sourceValue", OFFICIAL_SITE_URL)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={colors.muted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.officialModalLink} onPress={() => openExternalLink(OFFICIAL_TRACKING_URL)} activeOpacity={0.82}>
          <Ionicons name="navigate-outline" size={17} color={colors.secondary} />
          <View style={styles.officialModalLinkCopy}>
            <Text style={styles.officialModalLinkLabel}>{t("scan.officialInfo.trackingLabel", "Seguimiento oficial")}</Text>
            <Text style={styles.officialModalLinkUrl} numberOfLines={1}>{t("scan.officialInfo.trackingValue", OFFICIAL_TRACKING_URL)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={colors.muted} />
        </TouchableOpacity>
      </View>
      <View style={styles.officialModalDisclaimer}>
        <Ionicons name="information-circle-outline" size={14} color={colors.muted} />
        <Text style={styles.officialModalDisclaimerText}>
          {t("scan.officialInfo.disclaimer", "Esta app no representa a una entidad gubernamental distinta de la fuente indicada y solo muestra informacion consultada desde los canales oficiales enlazados.")}
        </Text>
      </View>
    </View>
  );

  useEffect(() => {
    setData(initialData || null);
  }, [initialData]);

  const codigo = readText(data?.filtro?.codigo || initialData?.filtro?.codigo || "");
  const exists = data?.existe_paquete !== false;

  const refreshFromApi = useCallback(async () => {
    if (!codigo) return;
    setRefreshingData(true);
    setRefreshError("");
    try {
      const response = await fetchTrackingByCode(codigo, { language });
      setData(response.data);
    } catch (error) {
      setRefreshError(apiErrorText(error, { server: t("result.refreshError", "Could not update. Showing available data.") }));
    } finally {
      setRefreshingData(false);
    }
  }, [apiErrorText, codigo, language, t]);

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
        title: cleanEventTitle(readText(event?._raw_nombre_evento || event?.nombre_evento)) || t("event.default", "Event"),
        rawTitle: readText(event?._raw_nombre_evento || event?.nombre_evento),
        service: readText(event?._raw_servicio || event?.servicio),
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
  const progressStepWidth = Math.max(88, Math.floor((windowWidth - 52) / Math.min(3, presentation.steps.length || 1)));
  const flowComplete = presentation.currentStep === presentation.steps.length - 1;
  const latestDateParts = parseRawDateParts(events[0]?.createdAt || null);
  const serviceLabel = readText(events[0]?.service).toUpperCase() || "EMS";
  const summary = useMemo(() => resolveSummary(events, codigo, serviceLabel, t), [events, codigo, serviceLabel, t]);

  const pickupNotice = useMemo(() => {
    if (presentation.isReturning) {
      const message = presentation.isReturnCompleted
        ? t("result.notice.returned", "La devolucion fue completada. El envio ya fue retornado al remitente.")
        : presentation.returnStatusCode === 6
          ? t("result.notice.returnRedirected", "Este envio esta siendo redirigido en transito hacia su retorno.")
          : t("result.notice.returning", "Este envio esta en devolucion.");
      return { message, detail: null, kind: "return" };
    }
    if (presentation.delivered) {
      return {
        message: t("result.notice.delivered", "Tu paquete ya fue entregado. No tienes acciones pendientes en oficina."),
        detail: null,
      };
    }
    const latestEvent = events[0] || null;
    if (!latestEvent) return null;

    const department = detectBoliviaDepartment(
      presentation.customsReturnedToPostalFlow ? latestEvent.office : (latestEvent.office || latestEvent.nextOffice),
    );
    const destinationCity = readText(latestEvent.destinationCity);
    const hasSpecificDestinationCity = !!destinationCity
      && !["bo", "bolivia", "plurinational state of bolivia"].includes(destinationCity.toLowerCase());

    if (presentation.pickupAtNonDestinationOffice) {
      return {
        message: department && hasSpecificDestinationCity
          ? t("result.notice.counterOutsideDestination", "El paquete figura en Ventanilla de {department}, pero su destino es {destination}. Espera la llegada a destino antes de recogerlo.")
            .replace("{department}", department).replace("{destination}", destinationCity)
          : t("result.notice.counterOutsideDestinationUnknown", "El paquete figura en una oficina de tránsito. Espera la confirmación de llegada a tu destino antes de recogerlo."),
        detail: null,
      };
    }

    if (presentation.customsReturnedToPostalFlow && !presentation.pickupReadyAtDestinationCustoms) {
      if (department && hasSpecificDestinationCity && department.toLowerCase() !== destinationCity.toLowerCase()) {
        return {
          message: t(
            "result.notice.customsReturnedBeforeDestination",
            "Aduana liberó tu paquete en {department}. Aún no aparece en Ventanilla de {destination}.",
          ).replace("{department}", department).replace("{destination}", destinationCity),
          detail: null,
        };
      }
      const message = department
        ? t(
          "result.notice.customsReturnedToPostalAtOffice",
          "Aduana liberó tu paquete en {department}. Si ese es tu destino, consulta en Ventanilla para recogerlo.",
        ).replace("{department}", department)
        : t(
          "result.notice.customsReturnedToPostal",
          "Aduana liberó tu paquete. Espera el aviso de Ventanilla para saber dónde recogerlo.",
        );
      return {
        message,
        detail: null,
      };
    }
    if (presentation.customsPurchaseProofRequired) {
      return {
        message: t("result.notice.customsProof", "Aduana solicita el respaldo de compra o valor del envío. Revisa las indicaciones para completar la gestión."),
        detail: null,
      };
    }
    if (presentation.isHeldByCustoms) {
      return {
        message: t("result.notice.customsHeld", "Aduana retuvo tu envío. Revisa las indicaciones disponibles antes de realizar una gestión."),
        detail: null,
      };
    }
    if (presentation.isHeldAtExchange) {
      return {
        message: t("result.notice.heldAtExchange", "El envío está retenido en una oficina de cambio. Espera una nueva actualización del seguimiento."),
        detail: null,
      };
    }
    if (presentation.isCustoms) {
      return {
        message: department
          ? t("result.notice.customsInTransit", "Tu envío está en gestión aduanera en {department}. Aún no figura como listo para recoger; espera una nueva actualización.").replace("{department}", department)
          : t("result.notice.customsInTransitUnknown", "Tu envío está en gestión aduanera. Aún no figura como listo para recoger; espera una nueva actualización."),
        detail: null,
      };
    }

    if (!presentation.isPickupAvailable) return null;

    const officeIso = parseIsoFromOffice(latestEvent.office || latestEvent.nextOffice);
    const isBolivia = officeIso === "BO" || department !== null || summary.isNationalDestination;
    if (!isBolivia) return null;

    return {
      message: presentation.customsReturnedToPostalFlow && presentation.pickupReadyAtDestinationCustoms
        ? (department
          ? t("result.notice.customsReleasedReady", "Aduana liberó tu paquete en {department}. Ya puedes recogerlo en Ventanilla.").replace("{department}", department)
          : t("result.notice.customsReleasedReadyUnknown", "Aduana liberó tu paquete en la oficina de destino. Ya puedes recogerlo en Ventanilla."))
        : department
          ? t("result.notice.pickupDepartment", `Tu paquete está listo para entregar. Debes pasar a recogerlo en el departamento de ${department}.`).replace("{department}", department)
          : t("result.notice.pickupBolivia", "Tu paquete está listo para entregar. Debes pasar a recogerlo en tu oficina de destino en Bolivia."),
      detail: department ? REGIONAL_CONTACTS[department] || null : null,
    };
  }, [codigo, events, presentation, summary.isNationalDestination, t]);

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
            <TouchableOpacity
              style={styles.resultInfoButton}
              onPress={() => setOfficialInfoVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={t("scan.officialInfo.title", "Fuente oficial de consulta")}
              hitSlop={8}
            >
              <Ionicons name="information-circle-outline" size={19} color={colors.secondary} />
            </TouchableOpacity>
            <View style={[styles.statusOrb, styles.statusOrbA]} />
            <View style={[styles.statusOrb, styles.statusOrbB]} />
            <View style={styles.statusIcon}>
              <Ionicons
                name={flowComplete ? "checkmark" : presentation.isCancelled ? "close" : presentation.isReturning ? "return-up-back" : "ellipse"}
                size={18}
                color={flowComplete ? "#3EA52F" : presentation.isCancelled ? "#C0392B" : presentation.isReturning ? "#B26A00" : "#0F3F7B"}
              />
            </View>
            <View style={styles.statusBody}>
              <Text style={styles.statusTitle}>{presentation.globalStatus}</Text>
              <Text style={styles.statusSubtitle}>
                {presentation.isReturning
                  ? t("result.returnSubtitle", "El paquete esta regresando al remitente.")
                  : summary.latestEvent?.title || t("event.default", "Event")}
              </Text>
              <Text style={styles.statusCode}>Tracking: {codigo}</Text>
            </View>
          </View>

          <View style={styles.summaryGrid}>
            <SummaryTile label="Origen postal" value={summary.originLabel} iso2={summary.originIso} accentStyle={styles.metaAccentA} styles={styles} />
            <SummaryTile label="Destino de entrega" value={summary.destinationLabel} iso2={summary.destinationIso} accentStyle={styles.metaAccentB} styles={styles} />
            <SummaryTile label="Servicio" value={serviceLabel} accentStyle={styles.metaAccentC} styles={styles} />
            <SummaryTile label="Ultima actualizacion" value={latestDateParts ? `${latestDateParts.numericLabel} ${latestDateParts.timeLabel}` : "-"} accentStyle={styles.metaAccentD} styles={styles} />
          </View>

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
              const rawStep = presentation.rawSteps?.[index] || step;
              const combinedCustomsStep = rawStep === "Ventanilla = Aduana";
              const stepImages = TRACKING_STEP_IMAGES[rawStep];
              const stepImage = stepImages?.[done || current ? "active" : "pending"];
              return (
                <View key={`${rawStep}-${index}`} style={[styles.progressStep, { width: progressStepWidth }]}>
                  <View style={styles.progressNodeRow}>
                    <View style={[styles.progressLine, index === 0 ? styles.progressLineHidden : null, done || current ? styles.progressLineDone : null]} />
                    <View style={[
                      styles.progressDot,
                      done ? styles.progressDotDone : null,
                      current ? styles.progressDotCurrent : null,
                      current && presentation.isCancelled ? styles.progressDotCancelled : null,
                      current && presentation.isCustoms ? styles.progressDotCustoms : null,
                      current && presentation.isReturning ? styles.progressDotReturning : null,
                    ]}>
                      {combinedCustomsStep ? (
                        <View style={[styles.progressSplitArt, !done && !current ? styles.progressSplitArtPending : null]}>
                          <View style={styles.progressSplitHalfLeft}>
                            <Image source={TRACKING_STEP_IMAGES.Ventanilla.active} style={[styles.progressSplitSource, presentation.customsSubstep === "customs" ? styles.progressSplitSourceDimmed : null]} resizeMode="contain" />
                          </View>
                          <View style={styles.progressSplitHalfRight}>
                            <Image source={TRACKING_STEP_IMAGES.Aduana.active} style={[styles.progressSplitSource, styles.progressSplitSourceRight, presentation.customsSubstep === "counter" ? styles.progressSplitSourceDimmed : null]} resizeMode="contain" />
                          </View>
                        </View>
                      ) : stepImage ? (
                        <Image source={stepImage} style={styles.progressImage} resizeMode="contain" />
                      ) : (
                        <Text style={styles.progressFallback}>{presentation.isCancelled && current ? "!" : "○"}</Text>
                      )}
                    </View>
                    <View style={[styles.progressLine, index === presentation.steps.length - 1 ? styles.progressLineHidden : null, done ? styles.progressLineDone : null]} />
                  </View>
                  {combinedCustomsStep ? (
                    <View style={styles.combinedStageLabels}>
                      <Text style={[styles.combinedStageLabel, done ? styles.progressLabelActive : null, current && presentation.customsSubstep === "counter" ? styles.combinedStageLabelCurrent : null]} numberOfLines={1}>{t("result.step.counter", "Ventanilla")}</Text>
                      <Text style={styles.combinedStageEquals}>=</Text>
                      <Text style={[styles.combinedStageLabel, done ? styles.progressLabelActive : null, current && presentation.customsSubstep === "customs" ? styles.combinedStageLabelCurrent : null]} numberOfLines={1}>{t("result.step.customs", "Aduana")}</Text>
                    </View>
                  ) : (
                    <Text style={[styles.progressLabel, done || current ? styles.progressLabelActive : null]} numberOfLines={2}>
                      {step}
                    </Text>
                  )}
                  <Text style={[
                    styles.progressState,
                    done ? styles.progressStateDone : null,
                    current ? styles.progressStateCurrent : null,
                    current && presentation.isCancelled ? styles.progressStateCancelled : null,
                    current && presentation.isCustoms ? styles.progressStateCustoms : null,
                    current && presentation.isReturning ? styles.progressStateReturning : null,
                  ]}>
                    {done
                      ? t("result.progress.done", "Listo")
                      : current
                        ? presentation.isCancelled
                          ? t("result.step.cancelled", "Cancelado")
                          : presentation.isReturning
                            ? t("result.status.returning", "Devolucion en curso")
                            : presentation.delivered
                              ? t("result.step.delivered", "Entregado")
                              : t("result.progress.current", "En curso")
                        : t("result.progress.pending", "Pendiente")}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        </Card>

        {pickupNotice ? (
          <Card style={[styles.noticeCard, pickupNotice.kind === "return" ? styles.returnNoticeCard : null]}>
            <Text style={styles.noticeText}>{pickupNotice.message}</Text>
            {pickupNotice.detail ? (
              <View style={styles.noticeDetail}>
                <InfoRow label="Oficina" value={pickupNotice.detail.regional} icon="business-outline" styles={styles} theme={theme} />
                <InfoRow
                  label="Direccion"
                  value={pickupNotice.detail.direccion}
                  icon="location-outline"
                  styles={styles}
                  theme={theme}
                  onPress={() => openExternalLink(
                    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      pickupNotice.detail.coords || `${pickupNotice.detail.direccion} ${pickupNotice.detail.regional} Bolivia`
                    )}`
                  )}
                />
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
                              label="Lugar"
                              value={cleanOfficeLabel(event.office)}
                              icon="business-outline"
                              styles={styles}
                              theme={theme}
                              hideRow={isGenericOriginOffice(event.office)}
                              iso2={parseIsoFromOffice(event.office) || countryIsoFromName(countryNameFromOffice(event.office))}
                            />
                            <InfoRow
                              label="Siguiente"
                              value={cleanOfficeLabel(event.nextOffice)}
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

      <Modal
        visible={officialInfoVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setOfficialInfoVisible(false)}
      >
        <View style={styles.officialModalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOfficialInfoVisible(false)} />
          <ScrollView
            style={styles.officialModalScroll}
            contentContainerStyle={styles.officialModalScrollContent}
            showsVerticalScrollIndicator={false}
            bounces
            keyboardShouldPersistTaps="handled"
          >
            {renderOfficialInfo()}
          </ScrollView>
        </View>
      </Modal>

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

function InfoRow({ label, value, icon, theme, styles, iso2, hideRow = false, onPress }) {
  if (!readText(value) || hideRow) return null;
  const flagUrl = getFlagUrl(iso2);
  const Row = onPress ? TouchableOpacity : View;
  return (
    <Row style={styles.infoRow} onPress={onPress} accessibilityRole={onPress ? "link" : undefined}>
      <View style={styles.infoBadge}>
        <Ionicons name={icon} size={13} color={theme.colors.muted} />
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={styles.infoValue} numberOfLines={3}>
        {String(value)}
      </Text>
      {flagUrl ? <Image source={{ uri: flagUrl }} style={styles.infoFlag} /> : null}
    </Row>
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
    resultInfoButton: { position: "absolute", top: 10, right: 10, zIndex: 4, width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.92)" },
    statusOrb: { position: "absolute", borderRadius: 999 },
    statusOrbA: { width: 108, height: 108, right: -20, top: -20, backgroundColor: "rgba(254,203,52,0.32)" },
    statusOrbB: { width: 78, height: 78, right: 120, bottom: -28, backgroundColor: "rgba(76,160,255,0.28)" },
    statusIcon: { width: 42, height: 42, borderRadius: 999, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", shadowColor: "#fff", shadowOpacity: 0.2, shadowOffset: { width: 0, height: 0 }, shadowRadius: 8, elevation: 3 },
    statusBody: { flex: 1, paddingRight: 24 },
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
    refreshWrap: { paddingHorizontal: 16, paddingBottom: 16 },
    refreshText: { marginBottom: 8, color: t.colors.text, fontWeight: "700", fontSize: 12 },
    progressCard: { paddingTop: 14, paddingBottom: 16, paddingHorizontal: 0, borderRadius: 14, borderTopWidth: 1, borderColor: "rgba(160, 186, 218, 0.65)", backgroundColor: "rgba(255,255,255,0.82)", marginBottom: 12 },
    cardHead: { paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    cardTitle: { fontSize: 17, fontWeight: "900", color: "#122F54" },
    cardMeta: { color: "#5D7596", fontWeight: "700", fontSize: 11 },
    cardMetaStrong: { color: "#1A549A", fontWeight: "900" },
    progressTrack: { paddingHorizontal: 12, paddingTop: 16, gap: 0 },
    progressStep: { width: 112, alignItems: "center" },
    progressNodeRow: { width: "100%", flexDirection: "row", alignItems: "center", marginBottom: 8 },
    progressLine: { flex: 1, height: 0, borderTopWidth: 2, borderTopColor: "#BCCCE2", borderStyle: "dashed" },
    progressLineHidden: { flex: 0, width: 0, borderTopWidth: 0 },
    progressLineDone: { borderTopColor: "#3EA52F" },
    progressDot: { width: 68, height: 68, borderRadius: 999, borderWidth: 2, borderColor: "#D3E0EE", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", overflow: "hidden" },
    progressDotDone: { borderColor: "#3EA52F", backgroundColor: "#3EA52F" },
    progressDotCurrent: { borderColor: "#3EA52F", backgroundColor: "#3EA52F" },
    progressDotCancelled: { borderColor: "#C0392B", backgroundColor: "#C0392B" },
    progressDotCustoms: { borderColor: "#2474C6", backgroundColor: "#2474C6" },
    progressDotReturning: { borderColor: "#B26A00", backgroundColor: "#B26A00" },
    progressImage: { width: "100%", height: "100%" },
    progressSplitArt: { position: "absolute", width: 68, height: 68, borderRadius: 999, overflow: "hidden" },
    progressSplitArtPending: { opacity: 0.42 },
    progressSplitHalfLeft: { position: "absolute", left: 0, top: 0, bottom: 0, width: "50%", overflow: "hidden" },
    progressSplitHalfRight: { position: "absolute", right: 0, top: 0, bottom: 0, width: "50%", overflow: "hidden" },
    progressSplitSource: { position: "absolute", left: 0, top: 0, width: 68, height: 68 },
    progressSplitSourceRight: { left: -34 },
    progressSplitSourceDimmed: { opacity: 0.42 },
    progressFallback: { color: "#FFFFFF", fontSize: 24, lineHeight: 28, fontWeight: "900" },
    progressLabel: { color: "#4D6788", fontSize: 11, fontWeight: "700", textAlign: "center", lineHeight: 14, minHeight: 30, paddingHorizontal: 4 },
    progressLabelActive: { color: "#2B7E22", fontWeight: "900" },
    combinedStageLabels: { minHeight: 30, flexDirection: "row", alignItems: "flex-start", justifyContent: "center", gap: 3, paddingHorizontal: 1 },
    combinedStageLabel: { color: "#71839A", fontSize: 8, lineHeight: 13, fontWeight: "800", borderWidth: 1, borderColor: "#D7E2EE", borderRadius: 999, paddingHorizontal: 4, paddingVertical: 1, overflow: "hidden" },
    combinedStageLabelCurrent: { color: "#1764AB", backgroundColor: "#E6F3FF", borderColor: "#B9D8F3", fontWeight: "900" },
    combinedStageEquals: { color: "#71839A", fontSize: 9, lineHeight: 14, fontWeight: "900" },
    progressState: { marginTop: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: "#D7E2EE", backgroundColor: "#F5F8FB", color: "#71839A", fontSize: 8, lineHeight: 10, fontWeight: "900", textAlign: "center", textTransform: "uppercase" },
    progressStateDone: { borderColor: "#C6E5CC", backgroundColor: "#ECF8EE", color: "#287D32" },
    progressStateCurrent: { borderColor: "#BDD7F0", backgroundColor: "#EAF4FF", color: "#1A609F" },
    progressStateCancelled: { borderColor: "#E6B7B7", backgroundColor: "#FFF0F0", color: "#A92B2B" },
    progressStateCustoms: { borderColor: "#B9D8F3", backgroundColor: "#E6F3FF", color: "#1764AB" },
    progressStateReturning: { borderColor: "#E8C58D", backgroundColor: "#FFF8E8", color: "#9B5B00" },
    noticeCard: { padding: 14, borderRadius: 14, borderTopWidth: 1, borderColor: "#B8DFC2", backgroundColor: "#F3FFF6", marginBottom: 12 },
    returnNoticeCard: { borderColor: "#E8C58D", backgroundColor: "#FFF8E8" },
    noticeText: { color: "#1F5B33", fontWeight: "900", lineHeight: 20, fontSize: 13 },
    noticeDetail: { marginTop: 10, gap: 8 },
    historyCard: { paddingTop: 14, paddingBottom: 12, paddingHorizontal: 0, borderRadius: 14, borderTopWidth: 1, borderColor: "rgba(160, 186, 218, 0.65)", backgroundColor: "rgba(255,255,255,0.82)" },
    officialModalOverlay: { flex: 1, paddingHorizontal: 18, paddingVertical: 24, backgroundColor: t.colors.overlay, justifyContent: "center", alignItems: "center" },
    officialModalScroll: { width: "100%", flexGrow: 0, flexShrink: 1, maxHeight: "92%" },
    officialModalScrollContent: { paddingVertical: 4 },
    officialModalCard: { width: "100%", maxWidth: 440, alignSelf: "center", padding: 18, borderRadius: 24, borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.colors.surface, ...t.shadow },
    officialModalHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
    officialModalIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: `${t.colors.primary}2B`, borderWidth: 1, borderColor: `${t.colors.primary}66` },
    officialModalTitle: { color: t.colors.text, fontSize: 16, fontWeight: "900" },
    officialModalKicker: { marginTop: 2, color: t.colors.muted, fontSize: 11, fontWeight: "800" },
    officialModalClose: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: t.isDark ? "rgba(255,255,255,0.08)" : "rgba(18, 52, 93, 0.06)" },
    officialModalBody: { color: t.colors.text, lineHeight: 20, fontWeight: "600" },
    officialModalLinks: { marginTop: 14, gap: 8 },
    officialModalLink: { minHeight: 56, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 16, borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.isDark ? "rgba(15, 23, 42, 0.48)" : "rgba(241, 246, 253, 0.84)", flexDirection: "row", alignItems: "center", gap: 10 },
    officialModalLinkCopy: { flex: 1, minWidth: 0 },
    officialModalLinkLabel: { color: t.colors.text, fontSize: 12, fontWeight: "900" },
    officialModalLinkUrl: { marginTop: 2, color: t.colors.muted, fontSize: 11, fontWeight: "700" },
    officialModalDisclaimer: { marginTop: 12, flexDirection: "row", alignItems: "flex-start", gap: 7 },
    officialModalDisclaimerText: { flex: 1, color: t.colors.muted, lineHeight: 18, fontSize: 12, fontWeight: "600" },
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
