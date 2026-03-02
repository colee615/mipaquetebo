const normalize = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const ES_KEYWORD_RE =
  /\b(paquete|recibido|entregado|entrega|oficina|enviado|aduana|transito|cliente|destino|origen|clasificacion|postal|regional|ventanilla|saca|extranjero|devuelto|devuelta|devolucion)\b/;

const EN_REPLACEMENTS = [
  ["entrega de paquete en ventanilla en oficina postal regional", "package delivered at regional post office counter"],
  ["recibido del cliente", "received from customer"],
  ["listo para entregar", "ready for delivery"],
  ["oficina de entrega", "delivery office"],
  ["enviado al extranjero", "sent abroad"],
  ["procesamiento en aduana", "customs processing"],
  ["en proceso de clasificacion", "in sorting process"],
  ["incluido en la saca", "included in dispatch bag"],
  ["siguiente oficina", "next office"],
  ["devuelto", "returned"],
  ["devuelta", "returned"],
  ["devolucion", "return"],
  ["en transito", "in transit"],
  ["en transito hacia", "in transit to"],
  ["transito", "transit"],
  ["entrega", "delivery"],
  ["entregado", "delivered"],
  ["recibido", "received"],
  ["envio", "shipment"],
  ["paquete", "package"],
  ["oficina", "office"],
  ["aduana", "customs"],
  ["clasificacion", "sorting"],
  ["cliente", "customer"],
  ["destino", "destination"],
  ["origen", "origin"],
  ["extranjero", "abroad"],
];

const sentenceCase = (value) => {
  const txt = String(value || "").trim();
  if (!txt) return "";
  return txt.charAt(0).toUpperCase() + txt.slice(1);
};

function translateToEnglishOnTheFly(raw) {
  const input = String(raw || "").trim();
  if (!input) return "";

  const normalized = normalize(input);
  if (!ES_KEYWORD_RE.test(normalized)) return input;

  let out = normalized;
  for (const [from, to] of EN_REPLACEMENTS) {
    const re = new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    out = out.replace(re, to);
  }

  out = out.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
  return sentenceCase(out || input);
}

export function localizeEventAction(action, t, language = "es") {
  const raw = String(action || "").trim();
  if (!raw) return t("event.default", "Event");
  const n = normalize(raw);

  if (n.includes("entregado") || n.includes("delivered")) {
    return t("event.external.delivered", "Delivered");
  }
  if (n.includes("listo para entregar") || n.includes("oficina de entrega") || n.includes("out for delivery")) {
    return t("event.external.readyForDelivery", "Ready for delivery");
  }
  if (n.includes("enviado al extranjero") || n.includes("despatched to overseas") || n.includes("dispatch item abroad")) {
    return t("event.external.sentAbroad", "Sent abroad");
  }
  if (n.includes("transito") || n.includes("en camino") || n.includes("incluido en la saca")) {
    return t("event.external.inTransit", "In transit");
  }
  if (n === "recibido" || n === "received" || n.startsWith("recibido ")) {
    return t("event.action.received", "Received");
  }
  if (n === "leido" || n === "leida" || n === "read" || n.includes("leido")) {
    return t("event.action.read", "Read");
  }
  if (n.includes("devuelto") || n.includes("devuelta") || n.includes("returned")) {
    return t("event.action.returned", "Returned");
  }
  if (language === "en") return translateToEnglishOnTheFly(raw);
  return raw;
}

export function localizeExternalEventType(eventType, t, language = "es") {
  const raw = String(eventType || "").trim();
  if (!raw) return t("event.default", "Event");
  const n = normalize(raw);

  if (n.includes("entregado") || n.includes("delivered")) {
    return t("event.external.delivered", "Delivered");
  }
  if (n.includes("listo para entregar") || n.includes("oficina de entrega") || n.includes("out for delivery")) {
    return t("event.external.readyForDelivery", "Ready for delivery");
  }
  if (n.includes("enviado al extranjero") || n.includes("despatched to overseas") || n.includes("dispatch item abroad")) {
    return t("event.external.sentAbroad", "Sent abroad");
  }
  if (n.includes("recibido del cliente") || n.includes("accepted")) {
    return t("event.external.receivedFromCustomer", "Received from customer");
  }
  if (n.includes("transito") || n.includes("en camino") || n.includes("incluido en la saca")) {
    return t("event.external.inTransit", "In transit");
  }
  if (n.includes("aduana") || n.includes("customs")) {
    return t("event.external.customs", "Customs processing");
  }
  if (n.includes("devuelto") || n.includes("devuelta") || n.includes("returned")) {
    return t("event.action.returned", "Returned");
  }

  if (language === "en") return translateToEnglishOnTheFly(raw);
  return raw;
}

export function formatDaysAgo(days, language) {
  if (days <= 0) return language === "en" ? "today" : "hoy";
  if (language === "en") return `${days} day${days === 1 ? "" : "s"} ago`;
  return `hace ${days} dia${days === 1 ? "" : "s"}`;
}

export function localizeTrackingBody(text, t, language = "es") {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const n = normalize(raw);

  if (n.includes("entrega de paquete en ventanilla en oficina postal regional")) {
    return t("event.body.deliveredCounter", "Package delivered at Regional Post Office counter");
  }
  if (language === "en") return translateToEnglishOnTheFly(raw);
  return raw;
}

export function localizeCountryName(country, iso2, language) {
  const c = String(country || "").trim();
  const iso = String(iso2 || "").trim().toUpperCase();
  if (language === "en") {
    if (iso === "AE" || normalize(c) === "emiratos arabes unidos") return "United Arab Emirates";
  }
  if (language === "es") {
    if (iso === "AE" || normalize(c) === "united arab emirates") return "Emiratos Arabes Unidos";
  }
  return c;
}
