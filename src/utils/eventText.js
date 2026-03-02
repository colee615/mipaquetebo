const normalize = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export function localizeEventAction(action, t) {
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
  return raw;
}

export function localizeExternalEventType(eventType, t) {
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

  return raw;
}

export function formatDaysAgo(days, language) {
  if (days <= 0) return language === "en" ? "today" : "hoy";
  if (language === "en") return `${days} day${days === 1 ? "" : "s"} ago`;
  return `hace ${days} dia${days === 1 ? "" : "s"}`;
}

export function localizeTrackingBody(text, t) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const n = normalize(raw);

  if (n.includes("entrega de paquete en ventanilla en oficina postal regional")) {
    return t("event.body.deliveredCounter", "Package delivered at Regional Post Office counter");
  }
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
