import { formatDaysAgo } from "./eventText";

const readText = (value) => String(value || "").trim();
const normalizeText = (value) => readText(value).toLowerCase();
const includesAny = (text, values) => values.some((value) => text.includes(value));
const READY_FOR_PICKUP_TERMS = [
  "listo para entregar",
  "oficina de entrega",
  "available for pickup",
  "ready for pickup",
  "delivery office",
  "pickup office",
];
const DELIVERED_EXCLUSIONS = [
  ...READY_FOR_PICKUP_TERMS,
  "intento fallido",
  "no entregado",
  "pendiente de entrega",
  "failed attempt",
  "not delivered",
  "delivery pending",
];
const DELIVERED_CONFIRMATIONS = [
  "entregado exitosamente",
  "entregado al cliente",
  "entregado al destinatario",
  "entrega realizada",
  "envio entregado",
  "paquete entregado",
  "recepcionado por destinatario",
  "recibido por destinatario",
  "successfully delivered",
  "delivered to customer",
  "delivered to addressee",
  "delivery completed",
  "shipment delivered",
  "package delivered",
  "received by addressee",
];
const CLASSIFICATION_TERMS = ["clasific", "recibid", "registr", "classif", "receiv", "regist"];
const DISPATCH_TERMS = ["despach", "dispatch"];
const FORWARDING_TERMS = ["exped", "transit", "saca", "forward"];
const COUNTER_TERMS = ["ventanilla", "oficina", "listo", "counter", "office", "pickup", "available"];
const CARRIER_TERMS = ["cartero", "distrib", "domicilio", "intento", "carrier", "courier", "delivery attempt"];
const INCIDENT_TERMS = ["fall", "incid", "devuelt", "failed", "incident", "return"];

export const getTrackingResults = (payload) => (Array.isArray(payload?.resultado) ? payload.resultado : []);

export const getTrackingEvents = (payload) => {
  const first = getTrackingResults(payload)[0];
  return Array.isArray(first?.eventos) ? first.eventos : [];
};

const getEventTimestamp = (event) => {
  if (typeof event?._sort_ts === "number") return event._sort_ts * 1000;
  const raw = event?.updated_at || event?.created_at || null;
  if (!raw) return 0;
  const parsed = new Date(raw).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getSortedTrackingEvents = (payload) => (
  [...getTrackingEvents(payload)].sort((a, b) => getEventTimestamp(b) - getEventTimestamp(a))
);

export const getLatestPackageEvent = (payload) => {
  const events = getSortedTrackingEvents(payload);
  if (!events.length) return null;
  return events[0] || null;
};

export const getPackageEventOffice = (event) => readText(event?.office);

export const isDeliveredEvent = (event) => {
  const text = normalizeText(event?.nombre_evento);
  if (!text) return false;

  if (DELIVERED_EXCLUSIONS.some((term) => text.includes(term))) return false;
  return DELIVERED_CONFIRMATIONS.some((term) => text.includes(term));
};

export const getTrackingPresentation = (payload, t = (key, fallback) => fallback || key) => {
  const events = getSortedTrackingEvents(payload);
  const eventTexts = events.map((event) => normalizeText(event?.nombre_evento)).join(" | ");
  const latestEvent = events[0] || null;
  const service = readText(latestEvent?.servicio).toUpperCase() || "EMS";
  const firstStep =
    service === "ORDI" || service === "CERTI"
      ? t("result.step.classification", "Clasificacion")
      : t("result.step.admission", "Admision");
  const includeCarrierStep = includesAny(eventTexts, CARRIER_TERMS);

  const steps = [
    firstStep,
    t("result.step.dispatch", "Despacho"),
    t("result.step.forwarding", "Expedicion"),
    t("result.step.counter", "Ventanilla"),
  ];
  if (includeCarrierStep) steps.push(t("result.step.carrier", "Cartero"));
  steps.push(t("result.step.delivered", "Entregado"));

  const deliveredIndex = includeCarrierStep ? 5 : 4;
  let currentStep = 0;

  if (
    (service === "ORDI" || service === "CERTI"
      ? includesAny(eventTexts, CLASSIFICATION_TERMS)
      : includesAny(eventTexts, ["admi", ...CLASSIFICATION_TERMS]))
  ) {
    currentStep = Math.max(currentStep, 0);
  }
  if (includesAny(eventTexts, DISPATCH_TERMS)) currentStep = Math.max(currentStep, 1);
  if (includesAny(eventTexts, FORWARDING_TERMS)) currentStep = Math.max(currentStep, 2);
  if (includesAny(eventTexts, COUNTER_TERMS)) currentStep = Math.max(currentStep, 3);
  if (includeCarrierStep && includesAny(eventTexts, CARRIER_TERMS)) {
    currentStep = Math.max(currentStep, 4);
  }

  const delivered = events.some((event) => isDeliveredEvent(event));
  if (delivered) currentStep = Math.max(currentStep, deliveredIndex);

  const hasIncident = includesAny(eventTexts, INCIDENT_TERMS);
  let globalStatus = delivered
    ? t("result.status.delivered", "Entregado")
    : t("result.status.inTransit", "En transito");
  if (hasIncident && !delivered) globalStatus = t("result.status.inTransitIssue", "En transito con incidencia");

  return {
    steps,
    currentStep,
    currentStepLabel: steps[currentStep] || steps[0],
    delivered,
    progressComplete: currentStep >= deliveredIndex,
    globalStatus,
  };
};

export const isPayloadDelivered = (payload) => getTrackingPresentation(payload).progressComplete;

export const formatPackageEventSummary = (event, t, language = "es", emptyKey = "saved.noRecentUpdates") => {
  if (!event || typeof event !== "object") return t(emptyKey, "No recent updates");

  const rawDate = event?.created_at || event?.updated_at || null;
  if (!rawDate) return t(emptyKey, "No recent updates");

  const normalized = String(rawDate).replace("T", " ").replace("Z", "");
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (!match) return t(emptyKey, "No recent updates");

  const [, year, month, day] = match;
  const eventDate = new Date(`${year}-${month}-${day}T00:00:00`);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const eventStart = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate()).getTime();
  const days = Math.floor((todayStart - eventStart) / (1000 * 60 * 60 * 24));

  return `${readText(event?.nombre_evento) || t(emptyKey, "No recent updates")} | ${day}/${month}/${year} | ${formatDaysAgo(days, language)}`;
};
