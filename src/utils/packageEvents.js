import { formatDaysAgo, localizeEventAction, localizeExternalEventType } from "./eventText";

export const getLatestPackageEvent = (locales = [], externos = [], t, language = "es") => {
  const normalize = (ev, source) => ({
    source,
    dateRaw: source === "local" ? ev?.updated_at || ev?.created_at || null : ev?.eventDate || null,
    eventType:
      source === "local"
        ? localizeEventAction(ev?.action, t, language)
        : localizeExternalEventType(ev?.eventType, t, language),
    office: ev?.office || "",
    condition: ev?.condition || "",
    nextOffice: ev?.nextOffice || "",
  });

  const all = [
    ...(Array.isArray(locales) ? locales.map((ev) => normalize(ev, "local")) : []),
    ...(Array.isArray(externos) ? externos.map((ev) => normalize(ev, "external")) : []),
  ].filter((ev) => !!ev.dateRaw);

  if (!all.length) return null;
  all.sort((a, b) => new Date(b.dateRaw) - new Date(a.dateRaw));
  return all[0];
};

export const formatPackageEventSummary = (event, t, language = "es", emptyKey = "saved.noRecentUpdates") => {
  if (!event?.dateRaw) return t(emptyKey, "No recent updates");
  const normalized = String(event.dateRaw).replace("T", " ").replace("Z", "");
  const m = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (!m) return t(emptyKey, "No recent updates");
  const [, y, mo, d] = m;
  const eventDate = new Date(`${y}-${mo}-${d}T00:00:00`);
  const today = new Date();

  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const e0 = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate()).getTime();

  const days = Math.floor((t0 - e0) / (1000 * 60 * 60 * 24));
  const dateStr = `${d}/${mo}/${y}`;
  const ago = formatDaysAgo(days, language);
  return `${event.eventType} · ${dateStr} · ${ago}`;
};
