import { View, Text, Modal, ScrollView, StyleSheet, ActivityIndicator, Image, Linking, TouchableOpacity, Pressable, useWindowDimensions, Alert } from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../theme/ui";
import { useI18n } from "../i18n/ui";
import { Screen, Card, OutlineButton } from "../components/ui";
import { fetchTrackingByCode } from "../services/trackingApi";
import { getLocalizedApiErrorMessage } from "../utils/apiErrors";
import { getTrackingEvents, getTrackingPresentation } from "../utils/packageEvents";
import countries from "i18n-iso-countries";
import esLocale from "i18n-iso-countries/langs/es.json";
import enLocale from "i18n-iso-countries/langs/en.json";

countries.registerLocale(esLocale);
countries.registerLocale(enLocale);

const readText = (value) => String(value || "").trim();
const normalizeText = (value) => readText(value).toLowerCase();
const S10_REGEX = /^[A-Z]{2}\d{9}[A-Z]{2}$/;
const OFFICIAL_TRACKING_URL = "https://trackingbo.correos.gob.bo/";
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

const VENTANILLA_PROCESS_IMAGE = require("../../assets/tracking/ventanilla-proceso.png");

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

const getRegionalMapUrl = (contact) => {
  if (!contact) return null;
  const query = contact.coords || `${contact.direccion} ${contact.regional} Bolivia`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
};

const getTrackingStepHelp = (step, presentation, t) => {
  if (step === "Ventanilla") {
    if (presentation.isPickupAvailable) return t("result.step.help.counterAvailable", "Tu envío está disponible para recoger en Ventanilla.");
    if (presentation.pickupAtNonDestinationOffice) return t("result.step.help.counterTransit", "El envío está en una oficina de tránsito. Espera su llegada a la oficina de destino antes de recogerlo.");
    if (presentation.customsPurchaseProofRequired) return t("result.step.help.counterProof", "Presenta el respaldo de compra o valor solicitado para completar la gestión en Ventanilla.");
    if (presentation.customsActionRequired) return t("result.step.help.counterAction", "Completa la gestión indicada en Ventanilla.");
    if (presentation.isCustoms && !presentation.isCancelled && !presentation.isReturning) {
      return t("result.statusSubtitle.ventanilla", "Tu envío está en Ventanilla.");
    }
    if (presentation.customsReturnedToPostalFlow) return t("result.step.help.counterPostal", "Tu envío continúa en la red postal hacia Ventanilla.");
  }

  const helpKeys = {
    Admision: ["result.step.help.admission", "Tu envío fue recibido y registrado."],
    Clasificacion: ["result.step.help.classification", "Tu envío fue recibido y clasificado."],
    Despacho: ["result.step.help.dispatch", "Fue preparado para su traslado."],
    Expedicion: presentation.isReturning
      ? ["result.step.help.forwardingReturn", "El envío fue marcado por IPS para devolución al remitente."]
      : ["result.step.help.forwarding", "Está en movimiento dentro de la red postal."],
    Ventanilla: ["result.step.help.counter", "Etapa de atención en oficina postal."],
    Cartero: ["result.step.help.carrier", "Está con el cartero para su entrega."],
    Entregado: ["result.step.help.delivered", "La entrega fue confirmada."],
    "Devolución": ["result.step.help.returning", "IPS marcó el envío para devolución al remitente."],
    "Retorno recibido": ["result.step.help.returnReceived", "La oficina de origen recibió el retorno."],
    "Devuelto al remitente": ["result.step.help.returnedToSender", "La devolución al remitente fue completada."],
    Cancelado: ["result.step.help.cancelled", "El envío fue cancelado."],
  };
  const [key, fallback] = helpKeys[step] || ["result.step.help.counter", "Etapa de atención en oficina postal."];
  return t(key, fallback);
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

  let destinationCity = readText(events.find((event) => event.destinationCity)?.destinationCity);
  const latestEventName = normalizeText(latestEvent?._raw_nombre_evento || latestEvent?.nombre_evento || latestEvent?.title);
  const latestEventConfirmsPickup = [32, 75].includes(Number(latestEvent?.codigo_evento))
    || latestEventName.includes("oficina de entrega")
    || latestEventName.includes("available for collection")
    || latestEventName.includes("collection point for pick-up")
    || latestEventName.includes("collection point for pickup");
  const destinationCityFromOffice = events
    .map((event) => detectBoliviaDepartment(event.office) || detectBoliviaDepartment(event.next_office))
    .find(Boolean);
  if (!destinationCity && latestEventConfirmsPickup && destinationCityFromOffice) {
    destinationCity = destinationCityFromOffice;
  }
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
  const destinationCityIsSpecific = destinationCity !== ""
    && !["bo", "bolivia", "plurinational state of bolivia"].includes(destinationCity.toLowerCase());

  if (destinationCityIsSpecific) {
    destinationFlagIso = destinationPayloadIso || "BO";
    destinationLabel = capitalizeWords(destinationCity);
  } else if (destinationIsoFromCity !== null) {
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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const initialData = route?.params?.data;
  const isPreview = route?.params?.preview === true;
  const highlight = route?.params?.highlight || null;
  const [data, setData] = useState(initialData || null);
  const [refreshingData, setRefreshingData] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [progressViewportWidth, setProgressViewportWidth] = useState(0);
  const [progressScrollOffset, setProgressScrollOffset] = useState(0);
  const [officialInfoVisible, setOfficialInfoVisible] = useState(false);
  const [dismissedTrackingModalKey, setDismissedTrackingModalKey] = useState(null);
  const progressScrollRef = useRef(null);
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
      if (!isPreview) refreshFromApi();
    }, [isPreview, refreshFromApi])
  );

  const events = useMemo(() => {
    return getTrackingEvents(data)
      .map((event) => {
        const rawTitle = readText(event?._raw_nombre_evento || event?.nombre_evento);
        return {
          ...event,
          codigo: readText(event?.codigo || codigo),
          createdAt: event?.created_at || event?.updated_at || null,
          date: toDate(event?.created_at || event?.updated_at),
          dayParts: parseRawDateParts(event?.created_at || event?.updated_at || null),
          title: rawTitle ? cleanEventTitle(rawTitle) : `Evento #${readText(event?.evento_id) || "-"}`,
          rawTitle,
          service: readText(event?._raw_servicio || event?.servicio),
          office: readText(event?.office),
          nextOffice: readText(event?.next_office),
          description: readText(event?.descripcion),
          originCity: readText(event?.ciudad_origen),
          destinationCity: readText(event?.ciudad_destino),
          destinationCountryIso: readText(event?.pais_destino_iso2),
          destinationCountryName: readText(event?.pais_destino_nombre),
          tabla_origen: readText(event?.tabla_origen),
        };
      })
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
  const paymentNotice = data?.aviso_pago_qr || data?.avisoPagoQr || null;
  const progressGrid = windowWidth > 720;
  const progressCompact = !progressGrid;
  const visibleProgressSteps = progressGrid
    ? Math.min(windowWidth <= 980 ? 3 : presentation.steps.length || 1, presentation.steps.length || 1)
    : Math.min(3, presentation.steps.length || 1);
  const progressStepWidth = progressCompact
    ? 96
    : Math.max(88, Math.floor(((progressViewportWidth || windowWidth) - 24) / visibleProgressSteps));
  const progressMaxScroll = progressGrid || !progressViewportWidth
    ? 0
    : Math.max(0, progressStepWidth * presentation.steps.length + 24 - progressViewportWidth);
  const progressHasOverflow = progressMaxScroll > 8;
  const flowComplete = presentation.currentStep === presentation.steps.length - 1;
  const completedStages = presentation.delivered ? presentation.steps.length : presentation.currentStep;
  const progressCountText = t("result.progress.completedCount", "{completed} de {total} etapas completadas")
    .replace("{completed}", String(completedStages))
    .replace("{total}", String(presentation.steps.length));
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

    const department = detectBoliviaDepartment(latestEvent.office || latestEvent.nextOffice);
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
            "Tu paquete continúa en tránsito en {department}. Espera su llegada a Ventanilla de {destination} antes de recogerlo.",
          ).replace("{department}", department).replace("{destination}", destinationCity),
          detail: null,
        };
      }
      const message = department
        ? t(
          "result.notice.customsReturnedToPostalAtOffice",
          "Tu paquete continúa su recorrido desde {department}. Espera la confirmación de llegada a Ventanilla antes de recogerlo.",
        ).replace("{department}", department)
        : t(
          "result.notice.customsReturnedToPostal",
          "Tu paquete continúa en tránsito. Espera la actualización de llegada a Ventanilla antes de recogerlo.",
        );
      return {
        message,
        detail: null,
      };
    }
    if (presentation.customsReturnedToPostalFlow && presentation.pickupReadyAtDestinationCustoms) {
      return {
        message: department
          ? t(
            "result.notice.customsReleasedReady",
            "Tu paquete ya llegó a la oficina de destino en {department}. Ya puedes recogerlo en Ventanilla.",
          ).replace("{department}", department)
          : t(
            "result.notice.customsReleasedReadyUnknown",
            "Tu paquete ya llegó a la oficina de destino. Ya puedes recogerlo en Ventanilla.",
          ),
        detail: department ? REGIONAL_CONTACTS[department] || null : null,
      };
    }
    if (presentation.customsPurchaseProofRequired) {
      return {
        message: t("result.notice.customsProof", "Tu envío requiere el respaldo de compra o valor. Consulta en Ventanilla cómo completar la gestión."),
        detail: department ? REGIONAL_CONTACTS[department] || null : null,
      };
    }
    if (presentation.isHeldByCustoms) {
      return {
        message: t("result.notice.customsHeld", "Tu envío requiere completar una gestión en Ventanilla. Consulta las indicaciones de la oficina."),
        detail: department ? REGIONAL_CONTACTS[department] || null : null,
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
          ? t(
            "result.notice.customsInTransit",
            "Tu envío está en Ventanilla, en el departamento de {department}. Consulta en la oficina cómo completar el trámite.",
          ).replace("{department}", department)
          : t(
            "result.notice.customsInTransitUnknown",
            "Tu envío está en Ventanilla. Consulta en la oficina cómo completar el trámite.",
          ),
        detail: department ? REGIONAL_CONTACTS[department] || null : null,
      };
    }

    if (!presentation.isPickupAvailable) return null;

    const officeIso = parseIsoFromOffice(latestEvent.office || latestEvent.nextOffice);
    const isBolivia = officeIso === "BO" || department !== null || summary.isNationalDestination;
    if (!isBolivia) {
      return {
        message: t(
          "result.notice.pickupInternational",
          "Tu paquete está listo para entregar. Puedes pasar a recogerlo en el punto de Ventanilla indicado en el seguimiento.",
        ),
        detail: null,
      };
    }

    return {
      message: department
        ? t("result.notice.pickupDepartment", "Tu paquete esta listo para entregar. Debes pasar a recoger en el departamento de {department}.").replace("{department}", department)
        : t("result.notice.pickupBolivia", "Tu paquete esta listo para entregar. Debes pasar a recoger en tu oficina de destino en Bolivia."),
      detail: department ? REGIONAL_CONTACTS[department] || null : null,
    };
  }, [codigo, events, presentation, summary.isNationalDestination, t]);

  const activeTrackingModalType = presentation.isPickupAvailable
    ? "ready"
    : presentation.hasCustomsCounterFlow
      && presentation.isCustoms
      && !presentation.isCancelled
      && !presentation.isReturning
      ? "ventanilla"
      : paymentNotice
        ? "payment"
        : null;
  const activeTrackingModalKey = activeTrackingModalType
    ? `${codigo}:${activeTrackingModalType}:${events[0]?.createdAt || events[0]?.rawTitle || "actual"}:${paymentNotice?.importe || ""}`
    : null;
  const trackingModalVisible = !!activeTrackingModalKey && dismissedTrackingModalKey !== activeTrackingModalKey;
  const closeTrackingModal = () => setDismissedTrackingModalKey(activeTrackingModalKey);

  useEffect(() => {
    if (progressGrid || !progressViewportWidth || !presentation.steps.length) return;
    const requestedOffset = progressStepWidth * presentation.currentStep - progressViewportWidth / 2 + progressStepWidth / 2;
    const offset = Math.min(Math.max(requestedOffset, 0), progressMaxScroll);
    setProgressScrollOffset(offset);
    requestAnimationFrame(() => progressScrollRef.current?.scrollTo({ x: offset, animated: false }));
  }, [progressGrid, progressMaxScroll, progressStepWidth, progressViewportWidth, presentation.currentStep, presentation.steps.length]);

  const scrollProgressByStep = (direction) => {
    const nextOffset = Math.min(
      Math.max(progressScrollOffset + direction * progressStepWidth, 0),
      progressMaxScroll,
    );
    setProgressScrollOffset(nextOffset);
    progressScrollRef.current?.scrollTo({ x: nextOffset, animated: true });
  };

  const isHighlightedEvent = (event) => {
    if (!highlight) return false;
    const sameDate = !highlight.eventDate || highlight.eventDate === event.createdAt;
    const sameTitle = !highlight.eventTitle || highlight.eventTitle === event.title;
    const sameOffice = !highlight.office || highlight.office === event.office;
    return sameDate && sameTitle && sameOffice;
  };

  const progressStepContent = presentation.steps.map((step, index) => {
    const done = index < presentation.currentStep;
    const current = index === presentation.currentStep;
    const rawStep = presentation.displayRawSteps?.[index] || step;
    const stepImage = TRACKING_STEP_IMAGES[rawStep]?.[done || current ? "active" : "pending"];
    const stepState = done
      ? t("result.progress.done", "Listo")
      : current
        ? presentation.isCancelled
          ? t("result.step.cancelled", "Cancelado")
          : presentation.isReturning
            ? t("result.status.returning", "Devolución en curso")
            : presentation.delivered
              ? t("result.step.delivered", "Entregado")
              : t("result.progress.current", "En curso")
        : t("result.progress.pending", "Pendiente");
    const stepHelp = getTrackingStepHelp(rawStep, presentation, t);
    return (
      <View key={`${rawStep}-${index}`} style={[styles.progressStep, progressCompact ? styles.progressStepCompact : null, { width: progressStepWidth }]}>
        <View style={[styles.progressNodeRow, progressCompact ? styles.progressNodeRowCompact : null]}>
          <View style={[styles.progressLine, styles.progressLineLeft, progressCompact ? styles.progressLineCompact : null, index === 0 ? styles.progressLineHidden : null, done || current ? styles.progressLineDone : null]} />
          <TouchableOpacity
            style={[
              styles.progressDot,
              progressCompact ? styles.progressDotCompact : null,
              done ? styles.progressDotDone : null,
              current ? styles.progressDotCurrent : null,
              current && presentation.isCancelled ? styles.progressDotCancelled : null,
              current && presentation.isReturning ? styles.progressDotReturning : null,
            ]}
            onPress={() => Alert.alert(step, `${stepHelp}\n\n${stepState}`)}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={`${step}. ${stepHelp}. Estado: ${stepState}`}
          >
            {stepImage ? (
              <Image source={stepImage} style={styles.progressImage} resizeMode="contain" />
            ) : (
              <Text style={styles.progressFallback}>{presentation.isCancelled && current ? "!" : "○"}</Text>
            )}
          </TouchableOpacity>
          <View style={[styles.progressLine, styles.progressLineRight, progressCompact ? styles.progressLineCompact : null, index === presentation.steps.length - 1 ? styles.progressLineHidden : null, done ? styles.progressLineDone : null]} />
        </View>
        <Text style={[styles.progressLabel, done || current ? styles.progressLabelActive : null]} numberOfLines={2} ellipsizeMode="tail">
          {step}
        </Text>
        <Text style={[
          styles.progressState,
          done ? styles.progressStateDone : null,
          current ? styles.progressStateCurrent : null,
          current && presentation.isCancelled ? styles.progressStateCancelled : null,
          current && presentation.isReturning ? styles.progressStateReturning : null,
        ]} numberOfLines={2} ellipsizeMode="tail">
          {stepState}
        </Text>
      </View>
    );
  });

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
                  : presentation.isCustoms
                    ? t("result.statusSubtitle.ventanilla", "Tu envío está en Ventanilla.")
                    : summary.latestEvent?.title || t("event.default", "Event")}
              </Text>
              <Text style={styles.statusCode}>{t("result.trackingCode", "Tracking")}: {codigo}</Text>
            </View>
          </View>

          <View style={styles.summaryGrid}>
            <SummaryTile label={t("result.originPostal", "Origen postal")} value={summary.originLabel} iso2={summary.originIso} accentStyle={styles.metaAccentA} styles={styles} />
            <SummaryTile label={t("result.destinationDelivery", "Destino de entrega")} value={summary.destinationLabel} iso2={summary.destinationIso} accentStyle={styles.metaAccentB} styles={styles} />
            <SummaryTile label={t("result.service", "Servicio")} value={serviceLabel} accentStyle={styles.metaAccentC} styles={styles} />
            <SummaryTile label={t("result.lastUpdate", "Última actualización")} value={latestDateParts ? `${latestDateParts.numericLabel} ${latestDateParts.timeLabel}` : "-"} accentStyle={styles.metaAccentD} styles={styles} />
          </View>

          {refreshError ? (
            <View style={styles.refreshWrap}>
              <Text style={styles.refreshText}>{refreshError}</Text>
              <OutlineButton title={t("result.retryUpdate", "Retry update")} icon="refresh" onPress={refreshFromApi} />
            </View>
          ) : null}

        </Card>

        <Card style={styles.progressCard}>
          <View style={[styles.cardHead, styles.progressCardHead]}>
            <View style={styles.progressHeadingCopy}>
              <View style={styles.progressTitleRow}>
                <View style={styles.progressTitleAccent} />
                <Text style={styles.cardTitle}>{t("result.progressTitle", "Progreso del envío")}</Text>
              </View>
              <View style={styles.progressHelpRow}>
                <View style={styles.progressHelpIcon}><Text style={styles.progressHelpIconText}>i</Text></View>
                <Text style={styles.progressHelp}>{t("result.progress.help", "Toca un icono para ver los detalles.")}</Text>
              </View>
            </View>
            <View style={styles.progressStatus}>
              <Text style={styles.progressCompleted}>{progressCountText}</Text>
              <View style={[styles.progressStatusChip, presentation.delivered ? styles.progressStatusChipDelivered : null, presentation.isReturning ? styles.progressStatusChipReturning : null]}>
                <Text style={styles.progressStatusLabel}>
                  {presentation.delivered
                    ? t("result.progress.shipmentLabel", "Envío:")
                    : t("result.progress.inProgressLabel", "En curso:")}
                </Text>
                <Text style={[styles.progressStatusValue, presentation.delivered ? styles.progressStatusValueDelivered : null, presentation.isReturning ? styles.progressStatusValueReturning : null]}>
                  {presentation.delivered
                    ? t("result.step.delivered", "Entregado")
                    : presentation.currentStepLabel}
                </Text>
              </View>
            </View>
          </View>

          <View
            style={progressGrid ? styles.progressGridViewport : styles.progressViewport}
            onLayout={(event) => {
              const width = event?.nativeEvent?.layout?.width || 0;
              if (width > 0 && Math.abs(width - progressViewportWidth) > 1) {
                setProgressViewportWidth(width);
              }
            }}
          >
            {progressGrid ? (
              <View style={styles.progressGridTrack}>{progressStepContent}</View>
            ) : (
              <>
                <ScrollView
                  ref={progressScrollRef}
                  horizontal
                  style={styles.progressScroll}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.progressTrack}
                  scrollEventThrottle={100}
                  onScroll={(event) => {
                    const nextOffset = event?.nativeEvent?.contentOffset?.x || 0;
                    setProgressScrollOffset((current) => Math.abs(nextOffset - current) > 8 ? nextOffset : current);
                  }}
                >
                  {progressStepContent}
                </ScrollView>
                {progressHasOverflow ? (
                  <>
                    <TouchableOpacity
                      style={[styles.progressNavButton, styles.progressNavButtonCompact]}
                      onPress={() => scrollProgressByStep(-1)}
                      disabled={progressScrollOffset <= 8}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={t("result.progress.previous", "Ver etapas anteriores")}
                    >
                      <Ionicons name="chevron-back" size={17} color="#1A549A" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.progressNavButton, styles.progressNavButtonNextCompact]}
                      onPress={() => scrollProgressByStep(1)}
                      disabled={progressScrollOffset >= progressMaxScroll - 8}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={t("result.progress.next", "Ver etapas siguientes")}
                    >
                      <Ionicons name="chevron-forward" size={17} color="#1A549A" />
                    </TouchableOpacity>
                  </>
                ) : null}
              </>
            )}
          </View>
        </Card>

        {pickupNotice ? (
          <Card style={[styles.noticeCard, pickupNotice.kind === "return" ? styles.returnNoticeCard : null]}>
            <Text style={styles.noticeText}>{pickupNotice.message}</Text>
            {pickupNotice.detail ? (
              <View style={styles.noticeDetail}>
                <View style={styles.noticeContactRow}>
                  <Text style={styles.noticeContactLabel}>{t("result.office", "Oficina")}</Text>
                  <Text style={styles.noticeContactValue}>{pickupNotice.detail.regional}</Text>
                </View>
                <TouchableOpacity
                  style={styles.noticeContactRow}
                  onPress={() => openExternalLink(getRegionalMapUrl(pickupNotice.detail))}
                  activeOpacity={0.8}
                  accessibilityRole="link"
                  accessibilityLabel={`${t("result.address", "Dirección")}: ${pickupNotice.detail.direccion}`}
                >
                  <Text style={styles.noticeContactLabel}>{t("result.address", "Dirección")}</Text>
                  <Text style={[styles.noticeContactValue, styles.noticeContactLink]}>{pickupNotice.detail.direccion}</Text>
                </TouchableOpacity>
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
              <Text style={styles.emptyTitle}>{t("result.noEvents", "No events")}</Text>
              <Text style={styles.emptyText}>{readText(data?.message) || t("result.noEventsDesc", "Este codigo no tiene registros de seguimiento.")}</Text>
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
                    const isTopEvent = index === 0 && group.dayKey === grouped[0]?.dayKey;
                    return (
                      <View key={`${group.dayKey}-${index}`} style={[styles.historyEvent, isTopEvent ? styles.historyEventLatest : null, isHighlightedEvent(event) ? styles.historyEventNew : null]}>
                        <View style={styles.historySide}>
                          <Text style={styles.historyTime}>{event?.dayParts?.timeLabel || "--:--"}</Text>
                        </View>
                        <View style={styles.historyBody}>
                          <Text style={styles.historyEventTitle}>{event.title}</Text>
                          {Number(event?.codigo_evento) === 37 && readText(event?.delivery_mode) ? (
                            <View style={styles.historyDeliveryMode}>
                              <Ionicons name="car-outline" size={13} color="#2B679F" />
                              <Text style={styles.historyDeliveryModeText}>
                                {t("result.deliveryMethod", "Entrega")}: {event.delivery_mode === "DOMICILIARIA"
                                  ? t("result.deliveryHome", "Cartero · domiciliaria")
                                  : t("result.deliveryCounter", "Ventanilla · no domiciliaria")}
                              </Text>
                            </View>
                          ) : null}
                          <View style={styles.historyMeta}>
                            <InfoRow
                              label={t("result.location", "Lugar")}
                              value={cleanOfficeLabel(event.office)}
                              icon="business-outline"
                              styles={styles}
                              theme={theme}
                              hideRow={isGenericOriginOffice(event.office)}
                              iso2={parseIsoFromOffice(event.office) || countryIsoFromName(countryNameFromOffice(event.office))}
                            />
                            <InfoRow
                              label={t("result.next", "Siguiente")}
                              value={cleanOfficeLabel(event.nextOffice)}
                              icon="navigate-outline"
                              styles={styles}
                              theme={theme}
                              iso2={parseIsoFromOffice(event.nextOffice) || countryIsoFromName(countryNameFromOffice(event.nextOffice))}
                            />
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

      <TrackingUpdateModal
        visible={trackingModalVisible}
        type={activeTrackingModalType}
        office={pickupNotice?.detail || null}
        paymentNotice={paymentNotice}
        styles={styles}
        t={t}
        wide={windowWidth > 520}
        large={windowWidth > 760}
        stacked={windowWidth <= 520}
        compact={windowWidth <= 360}
        windowWidth={windowWidth}
        windowHeight={windowHeight}
        onClose={closeTrackingModal}
        onOpenMap={openExternalLink}
      />

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

function TrackingUpdateModal({
  visible,
  type,
  office,
  paymentNotice,
  styles,
  t,
  wide,
  large,
  stacked,
  compact,
  windowWidth,
  windowHeight,
  onClose,
  onOpenMap,
}) {
  const ready = type === "ready";
  const ventanilla = type === "ventanilla";
  const hasPaymentNotice = !!paymentNotice?.importe;
  const paymentStage = paymentNotice?.etapa || "Cartero";
  const paymentAmount = String(paymentNotice?.importe || "");
  const paymentTitle = paymentStage === "Expedicion"
    ? t("result.payment.onWayTitle", "Tu paquete sigue en camino")
    : paymentStage === "Ventanilla"
      ? t("result.payment.counterTitle", "Tu envío continúa en Ventanilla")
      : t("result.payment.deliveryTitle", "Tu paquete va camino a ti");
  const paymentStatus = paymentStage === "Expedicion"
    ? t("result.payment.onWayState", "En camino")
    : paymentStage === "Ventanilla"
      ? t("result.payment.counterState", "Ventanilla")
      : t("result.payment.deliveryState", "En reparto");
  const paymentDescription = paymentStage === "Expedicion"
    ? t("result.payment.onWayDescription", "Tu envío está avanzando por la red postal. Tiene un pago pendiente de Bs {amount}. Cuando llegue a ventanilla o salga a reparto, podrás pagar con QR para completar la entrega.")
      .replace("{amount}", paymentAmount)
    : paymentStage === "Ventanilla"
      ? t("result.payment.counterDescription", "Tu envío tiene un pago pendiente. Cuando esté listo para recoger, podrás completar el pago con QR en Ventanilla.")
      : t("result.payment.deliveryDescription", "Tu paquete está con el cartero. Para completar la entrega, por favor realiza el pago con QR al recibirlo.");
  const paymentTip = ready || paymentStage === "Ventanilla"
    ? t("result.payment.counterTip", "Puedes completar el pago con QR en Ventanilla al momento de recogerlo.")
    : paymentStage === "Expedicion"
      ? t("result.payment.onWayTip", "Al llegar el paquete, solicita el QR en ventanilla o al cartero. Ten a mano tu código de seguimiento.")
      : t("result.payment.deliveryTip", "Solicita el QR al cartero cuando recibas tu paquete.");
  const mapUrl = getRegionalMapUrl(office);
  const title = ready
    ? t("result.modal.readyTitle", "¡Ya puedes recoger tu paquete!")
    : ventanilla
      ? t("result.modal.ventanillaTitle", "Tu envío está en Ventanilla")
      : paymentTitle;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.trackingModalOverlay, stacked ? styles.trackingModalOverlayStacked : null]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("common.close", "Cerrar")}
        />
        <View
          style={[
            styles.trackingModalPanel,
            ready ? styles.trackingModalPanelReady : null,
            ventanilla ? styles.trackingModalPanelProgress : null,
            stacked ? styles.trackingModalPanelStacked : null,
            {
              width: Math.max(0, Math.min(windowWidth - (stacked ? 18 : 32), ventanilla ? (large ? 700 : 680) : 540)),
              maxHeight: Math.max(0, Math.min(windowHeight * (stacked ? 0.9 : 0.88), windowHeight - (stacked ? 16 : 48))),
            },
          ]}
          accessibilityViewIsModal
        >
          <View style={styles.trackingModalAccent}>
            <View style={styles.trackingModalAccentYellow} />
            <View style={styles.trackingModalAccentBlue} />
          </View>
          <TouchableOpacity
            style={styles.trackingModalClose}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t("common.close", "Cerrar")}
            hitSlop={8}
          >
            <Ionicons name="close" size={20} color="#60758F" />
          </TouchableOpacity>

          <ScrollView
            style={styles.trackingModalScroll}
            contentContainerStyle={[styles.trackingModalScrollContent, stacked ? styles.trackingModalScrollContentStacked : null]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {ready ? (
              <>
                <View style={styles.trackingModalReadyHeader}>
                  <View style={styles.trackingModalReadyIcon}>
                    <Ionicons name="cube-outline" size={30} color="#1B5CA2" />
                  </View>
                  <View style={styles.trackingModalReadyCopy}>
                    <Text style={styles.trackingModalEyebrow}>{t("result.modal.readyLabel", "BUENAS NOTICIAS")}</Text>
                    <Text style={styles.trackingModalReadyState}>{t("result.modal.readyState", "Listo para recoger")}</Text>
                  </View>
                </View>
                <Text style={styles.trackingModalTitle}>{title}</Text>
                <Text style={styles.trackingModalDescription}>
                  {t("result.modal.readyDescription", "Tu paquete ya llegó a la oficina de destino. Presenta tu código de seguimiento al recogerlo.")}
                </Text>
              </>
            ) : ventanilla ? (
              <View style={[styles.trackingModalProgressLayout, wide ? styles.trackingModalProgressLayoutWide : null, large ? styles.trackingModalProgressLayoutLarge : null]}>
                <Image
                  source={VENTANILLA_PROCESS_IMAGE}
                  style={[
                    styles.trackingModalIllustration,
                    wide ? styles.trackingModalIllustrationWide : null,
                    large ? styles.trackingModalIllustrationLarge : null,
                    compact ? styles.trackingModalIllustrationCompact : null,
                  ]}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                />
                <View style={[styles.trackingModalInfo, wide ? styles.trackingModalInfoWide : null]}>
                  <Text style={styles.trackingModalTitle}>{title}</Text>
                  {office ? (
                    <View style={[styles.trackingModalOfficeCard, stacked ? styles.trackingModalOfficeCardStacked : null]}>
                      <View style={styles.trackingModalOfficeDetails}>
                        <Text style={styles.trackingModalEyebrow}>{t("result.modal.pointOfAttention", "Punto de atención")}</Text>
                        <Text style={styles.trackingModalOfficeName}>{office.regional}</Text>
                        <Text style={styles.trackingModalAddress}>{office.direccion}</Text>
                      </View>
                      {mapUrl ? (
                        <TouchableOpacity
                          style={[styles.trackingModalMapButton, stacked ? styles.trackingModalMapButtonStacked : null]}
                          onPress={() => onOpenMap(mapUrl)}
                          activeOpacity={0.82}
                          accessibilityRole="link"
                          accessibilityLabel={t("result.modal.viewMap", "Ver en mapa")}
                        >
                          <Text style={styles.trackingModalMapText}>{t("result.modal.viewMap", "Ver en mapa")}</Text>
                          <Ionicons name="open-outline" size={14} color="#24588F" />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </View>
            ) : (
              <>
                <View style={styles.trackingModalReadyHeader}>
                  <View style={styles.trackingModalReadyIcon}>
                    <Ionicons name="qr-code-outline" size={27} color="#1B5CA2" />
                  </View>
                  <View style={styles.trackingModalReadyCopy}>
                    <Text style={styles.trackingModalEyebrow}>{t("result.payment.information", "INFORMACIÓN DEL ENVÍO")}</Text>
                    <Text style={styles.trackingModalReadyState}>{paymentStatus}</Text>
                  </View>
                </View>
                <Text style={styles.trackingModalTitle}>{title}</Text>
                <Text style={styles.trackingModalDescription}>{paymentDescription}</Text>
              </>
            )}

            {ready && office ? (
              <View style={[styles.trackingModalOfficeCard, stacked ? styles.trackingModalOfficeCardStacked : null]}>
                <View style={styles.trackingModalOfficeDetails}>
                  <Text style={styles.trackingModalEyebrow}>{t("result.modal.destinationOffice", "Oficina de destino")}</Text>
                  <Text style={styles.trackingModalOfficeName}>{office.regional}</Text>
                  <Text style={styles.trackingModalAddress}>{office.direccion}</Text>
                </View>
                {mapUrl ? (
                  <TouchableOpacity
                    style={[styles.trackingModalMapButton, stacked ? styles.trackingModalMapButtonStacked : null]}
                    onPress={() => onOpenMap(mapUrl)}
                    activeOpacity={0.82}
                    accessibilityRole="link"
                    accessibilityLabel={t("result.modal.viewMap", "Ver en mapa")}
                  >
                    <Text style={styles.trackingModalMapText}>{t("result.modal.viewMap", "Ver en mapa")}</Text>
                    <Ionicons name="open-outline" size={14} color="#24588F" />
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {hasPaymentNotice ? (
              <>
                <View style={styles.trackingModalPaymentCard}>
                  <Text style={styles.trackingModalPaymentLabel}>
                    {ready
                      ? t("result.payment.readyAmountLabel", "Pago pendiente al recoger")
                      : t("result.payment.amountLabel", "Importe final de tu envío")}
                  </Text>
                  <Text style={styles.trackingModalPaymentAmount}><Text style={styles.trackingModalPaymentCurrency}>Bs</Text> {paymentAmount}</Text>
                  <Text style={styles.trackingModalPaymentFootnote}>{t("result.payment.amountDescription", "Este es el total registrado para tu paquete.")}</Text>
                </View>
                <View style={styles.trackingModalPaymentTip}>
                  <View style={styles.trackingModalPaymentTipIcon}><Text style={styles.trackingModalPaymentTipIconText}>i</Text></View>
                  <Text style={styles.trackingModalPaymentTipText}>{paymentTip}</Text>
                </View>
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
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
    cardHead: { alignSelf: "stretch", paddingHorizontal: 16, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
    progressCardHead: { paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: "rgba(182, 204, 230, 0.7)" },
    progressHeadingCopy: { flexShrink: 1, minWidth: 0, gap: 3 },
    progressTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    progressTitleAccent: { width: 5, height: 22, borderRadius: 999, backgroundColor: "#F5C52D" },
    progressHelpRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    progressHelpIcon: { width: 15, height: 15, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#E6F1FF" },
    progressHelpIconText: { color: "#1B67AB", fontSize: 10, lineHeight: 12, fontWeight: "900" },
    cardTitle: { flexShrink: 1, minWidth: 0, maxWidth: "100%", fontSize: 17, fontWeight: "900", color: "#122F54" },
    cardMeta: { flexShrink: 1, minWidth: 0, maxWidth: "100%", color: "#5D7596", fontWeight: "700", fontSize: 11, textAlign: "right" },
    cardMetaStrong: { color: "#1A549A", fontWeight: "900" },
    progressStatus: { flexShrink: 0, alignItems: "flex-end", gap: 4 },
    progressCompleted: { color: "#6C8097", fontSize: 9, lineHeight: 12, fontWeight: "700", textAlign: "right" },
    progressStatusChip: { minHeight: 22, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "#D3E3F2", borderRadius: 999, backgroundColor: "#F1F7FD", flexDirection: "row", alignItems: "center", gap: 3 },
    progressStatusChipDelivered: { borderColor: "#C6E5CC", backgroundColor: "#ECF8EE" },
    progressStatusChipReturning: { borderColor: "#E8C58D", backgroundColor: "#FFF8E8" },
    progressStatusLabel: { color: "#5D7596", fontSize: 9, fontWeight: "700", textTransform: "uppercase" },
    progressStatusValue: { color: "#1A549A", fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
    progressStatusValueDelivered: { color: "#287D32" },
    progressStatusValueReturning: { color: "#9B5B00" },
    progressHelp: { color: "#6C8097", fontSize: 10, lineHeight: 14, fontWeight: "600" },
    progressViewport: { width: "100%", minWidth: 0, position: "relative" },
    progressGridViewport: { width: "100%", minWidth: 0 },
    progressScroll: { width: "100%" },
    progressTrack: { paddingHorizontal: 12, paddingTop: 16, gap: 0 },
    progressGridTrack: { width: "100%", flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, paddingTop: 16 },
    progressNavButton: { position: "absolute", zIndex: 2, width: 30, height: 30, borderWidth: 1, borderColor: "#CFE0F2", borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.96)", ...t.shadow },
    progressNavButtonCompact: { top: 25, left: 5 },
    progressNavButtonNextCompact: { top: 25, right: 5 },
    progressStep: { width: 112, alignItems: "center" },
    progressStepCompact: { width: 96, flex: 0, alignItems: "center" },
    progressNodeRow: { width: "100%", height: 68, position: "relative", alignItems: "center", justifyContent: "center", marginBottom: 8 },
    progressNodeRowCompact: { height: 48, marginBottom: 6 },
    progressLine: { position: "absolute", top: 33, width: "50%", height: 0, borderTopWidth: 2, borderTopColor: "#BCCCE2", borderStyle: "dashed" },
    progressLineCompact: { top: 23 },
    progressLineLeft: { left: 0 },
    progressLineRight: { right: 0 },
    progressLineHidden: { display: "none" },
    progressLineDone: { borderTopColor: "#3EA52F" },
    progressDot: { zIndex: 1, width: 68, height: 68, borderRadius: 999, borderWidth: 2, borderColor: "#D3E0EE", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", overflow: "hidden" },
    progressDotCompact: { width: 48, height: 48 },
    progressDotDone: { borderColor: "#3EA52F", backgroundColor: "#3EA52F" },
    progressDotCurrent: { borderColor: "#3EA52F", backgroundColor: "#3EA52F" },
    progressDotCancelled: { borderColor: "#C0392B", backgroundColor: "#C0392B" },
    progressDotReturning: { borderColor: "#B26A00", backgroundColor: "#B26A00" },
    progressImage: { width: "100%", height: "100%" },
    progressFallback: { color: "#FFFFFF", fontSize: 24, lineHeight: 28, fontWeight: "900" },
    progressLabel: { width: "100%", maxWidth: "100%", flexShrink: 1, alignSelf: "stretch", color: "#4D6788", fontSize: 11, fontWeight: "700", textAlign: "center", lineHeight: 14, minHeight: 30, paddingHorizontal: 4 },
    progressLabelActive: { color: "#2B7E22", fontWeight: "900" },
    progressState: { alignSelf: "center", maxWidth: "100%", flexShrink: 1, marginTop: 3, paddingHorizontal: 5, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: "#D7E2EE", backgroundColor: "#F5F8FB", color: "#71839A", fontSize: 8, lineHeight: 10, fontWeight: "900", textAlign: "center", textTransform: "uppercase" },
    progressStateDone: { borderColor: "#C6E5CC", backgroundColor: "#ECF8EE", color: "#287D32" },
    progressStateCurrent: { borderColor: "#BDD7F0", backgroundColor: "#EAF4FF", color: "#1A609F" },
    progressStateCancelled: { borderColor: "#E6B7B7", backgroundColor: "#FFF0F0", color: "#A92B2B" },
    progressStateReturning: { borderColor: "#E8C58D", backgroundColor: "#FFF8E8", color: "#9B5B00" },
    noticeCard: { padding: 14, borderRadius: 14, borderTopWidth: 1, borderColor: "#B8DFC2", backgroundColor: "#F3FFF6", marginBottom: 12 },
    returnNoticeCard: { borderColor: "#E8C58D", backgroundColor: "#FFF8E8" },
    noticeText: { color: "#1F5B33", fontWeight: "900", lineHeight: 20, fontSize: 13 },
    noticeDetail: { marginTop: 10, gap: 7 },
    noticeContactRow: { paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: "#DDE8F3", borderRadius: 10, backgroundColor: "rgba(255,255,255,0.72)" },
    noticeContactLabel: { color: "#6C8097", fontSize: 9, fontWeight: "900", letterSpacing: 0.7, textTransform: "uppercase" },
    noticeContactValue: { marginTop: 3, color: "#203E60", fontSize: 12, lineHeight: 17, fontWeight: "800" },
    noticeContactLink: { color: "#1E5FA8", textDecorationLine: "underline" },
    historyCard: { paddingTop: 14, paddingBottom: 12, paddingHorizontal: 0, borderRadius: 14, borderTopWidth: 1, borderColor: "rgba(160, 186, 218, 0.65)", backgroundColor: "rgba(255,255,255,0.82)" },
    trackingModalOverlay: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, paddingVertical: 24, backgroundColor: "rgba(7, 25, 52, 0.58)" },
    trackingModalOverlayStacked: { justifyContent: "flex-end", paddingHorizontal: 9, paddingTop: 16, paddingBottom: 8 },
    trackingModalPanel: { width: "100%", maxWidth: 700, borderWidth: 1, borderColor: "#DCE6F2", borderRadius: 24, backgroundColor: "#FBFCFF", overflow: "hidden", ...t.shadowStrong },
    trackingModalPanelReady: { backgroundColor: "#FBFFFC" },
    trackingModalPanelProgress: { backgroundColor: "#FBFCFF" },
    trackingModalPanelStacked: { borderBottomLeftRadius: 15, borderBottomRightRadius: 15 },
    trackingModalAccent: { height: 4, flexDirection: "row" },
    trackingModalAccentYellow: { width: "24%", backgroundColor: "#F5C52D" },
    trackingModalAccentBlue: { flex: 1, backgroundColor: "#1B4F91" },
    trackingModalClose: { position: "absolute", zIndex: 3, top: 13, right: 13, width: 40, height: 40, borderWidth: 1, borderColor: "#E1E9F2", borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" },
    trackingModalScroll: { flexShrink: 1 },
    trackingModalScrollContent: { padding: 28, paddingTop: 30, paddingBottom: 24 },
    trackingModalScrollContentStacked: { padding: 17, paddingTop: 21, paddingBottom: 16 },
    trackingModalReadyHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginRight: 42, marginBottom: 14 },
    trackingModalReadyIcon: { width: 54, height: 54, borderRadius: 17, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#D1E2F5", backgroundColor: "#EFF6FF" },
    trackingModalReadyCopy: { flex: 1, minWidth: 0, gap: 5 },
    trackingModalEyebrow: { color: "#647A94", fontSize: 9, fontWeight: "900", letterSpacing: 1.1, textTransform: "uppercase" },
    trackingModalReadyState: { alignSelf: "flex-start", overflow: "hidden", paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: "#C9DDF3", borderRadius: 999, backgroundColor: "#F0F6FD", color: "#24588F", fontSize: 10, fontWeight: "900" },
    trackingModalTitle: { marginRight: 38, marginBottom: 10, color: "#173F70", fontSize: 23, lineHeight: 29, fontWeight: "900" },
    trackingModalDescription: { marginBottom: 16, color: "#5A708B", fontSize: 13, lineHeight: 20, fontWeight: "500" },
    trackingModalProgressLayout: { alignItems: "center", gap: 8 },
    trackingModalProgressLayoutWide: { flexDirection: "row", alignItems: "center", gap: 14 },
    trackingModalProgressLayoutLarge: { gap: 20 },
    trackingModalIllustration: { width: 136, height: 116, borderRadius: 20, backgroundColor: "#F2F7FD" },
    trackingModalIllustrationWide: { flex: 0, width: 150, height: 140 },
    trackingModalIllustrationLarge: { width: 180, height: 158 },
    trackingModalIllustrationCompact: { width: 128, height: 106 },
    trackingModalInfo: { width: "100%", minWidth: 0 },
    trackingModalInfoWide: { flex: 1, width: "auto" },
    trackingModalOfficeCard: { marginTop: 4, padding: 13, borderWidth: 1, borderColor: "#DCE6F0", borderRadius: 15, backgroundColor: "#F8FAFC", flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 9 },
    trackingModalOfficeCardStacked: { flexDirection: "column", alignItems: "stretch" },
    trackingModalOfficeDetails: { flex: 1, minWidth: 0 },
    trackingModalOfficeName: { marginTop: 3, color: "#203E60", fontSize: 13, lineHeight: 18, fontWeight: "900" },
    trackingModalAddress: { marginTop: 3, color: "#647991", fontSize: 11, lineHeight: 16, fontWeight: "600" },
    trackingModalMapButton: { minHeight: 38, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: "#D8E2EE", borderRadius: 10, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
    trackingModalMapButtonStacked: { alignSelf: "flex-start" },
    trackingModalMapText: { color: "#24588F", fontSize: 11, fontWeight: "900" },
    trackingModalPaymentCard: { marginTop: 14, padding: 13, borderWidth: 1, borderColor: "#DCE6F0", borderRadius: 14, backgroundColor: "#F8FAFC" },
    trackingModalPaymentLabel: { color: "#647991", fontSize: 11, fontWeight: "800" },
    trackingModalPaymentAmount: { marginTop: 4, color: "#173F70", fontSize: 24, lineHeight: 30, fontWeight: "900" },
    trackingModalPaymentCurrency: { color: "#647991", fontSize: 14, fontWeight: "800" },
    trackingModalPaymentFootnote: { marginTop: 3, color: "#647991", fontSize: 11, lineHeight: 16, fontWeight: "600" },
    trackingModalPaymentTip: { marginTop: 9, padding: 11, borderWidth: 1, borderColor: "#DCE6F0", borderRadius: 12, backgroundColor: "#F3F8FD", flexDirection: "row", alignItems: "flex-start", gap: 8 },
    trackingModalPaymentTipIcon: { width: 19, height: 19, borderRadius: 10, backgroundColor: "#DDEBFA", alignItems: "center", justifyContent: "center" },
    trackingModalPaymentTipIconText: { color: "#24588F", fontSize: 12, lineHeight: 15, fontWeight: "900" },
    trackingModalPaymentTipText: { flex: 1, color: "#506A85", fontSize: 11, lineHeight: 16, fontWeight: "600" },
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
    historyDeliveryMode: { marginTop: 5, flexDirection: "row", alignItems: "center", gap: 5 },
    historyDeliveryModeText: { flex: 1, color: "#5B7695", fontSize: 11, lineHeight: 16, fontWeight: "700" },
    historyMeta: { marginTop: 10, gap: 6 },
    infoRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#E1EAF5", borderRadius: 8, backgroundColor: "#F7FBFF", paddingHorizontal: 8, paddingVertical: 6 },
    infoBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingRight: 4 },
    infoLabel: { color: "#5F7898", fontWeight: "900", fontSize: 10, textTransform: "uppercase" },
    infoValue: { flex: 1, color: "#213F61", fontWeight: "700", lineHeight: 17, fontSize: 12 },
    infoFlag: { width: 18, height: 12, borderRadius: 2, borderWidth: 1, borderColor: "#CDDCF0" },
    loaderOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255, 255, 255, 0.78)", zIndex: 99 },
    loaderText: { marginTop: 10, color: t.colors.muted, fontWeight: "800" },
  });
