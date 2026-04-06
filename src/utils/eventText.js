const readText = (value) => String(value || "").trim();

export function localizeEventAction(action, t) {
  return readText(action) || t("event.default", "Event");
}

export function localizeExternalEventType(eventType, t) {
  return readText(eventType) || t("event.default", "Event");
}

export function formatDaysAgo(days, language) {
  if (days <= 0) return language === "en" ? "today" : "hoy";
  if (language === "en") return `${days} day${days === 1 ? "" : "s"} ago`;
  return `hace ${days} dia${days === 1 ? "" : "s"}`;
}

export function localizeTrackingBody(text) {
  return readText(text);
}

export function localizeCountryName(country) {
  return readText(country);
}
