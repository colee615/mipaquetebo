import countries from "i18n-iso-countries";
import esLocale from "i18n-iso-countries/langs/es.json";

countries.registerLocale(esLocale);

const S10_REGEX = /^[A-Z]{2}\d{9}[A-Z]{2}$/;

const EVENT_STATUS = {
  DELIVERED: "DELIVERED",
  READY_FOR_DELIVERY: "READY_FOR_DELIVERY",
  EXPORTED: "EXPORTED",
  IN_TRANSIT: "IN_TRANSIT",
  ACCEPTED: "ACCEPTED",
  UNKNOWN: "UNKNOWN",
};

const EVENT_STATUS_LABEL = {
  [EVENT_STATUS.DELIVERED]: "Entregado",
  [EVENT_STATUS.READY_FOR_DELIVERY]: "Listo para entrega",
  [EVENT_STATUS.EXPORTED]: "Exportado",
  [EVENT_STATUS.IN_TRANSIT]: "En tránsito",
  [EVENT_STATUS.ACCEPTED]: "Recibido",
  [EVENT_STATUS.UNKNOWN]: "Sin clasificar",
};

const COUNTRY_CONFIDENCE = {
  OFFICE_PREFIX: "HIGH",
  CONTEXT_INFERRED: "MEDIUM",
  S10_ORIGIN_INFERRED: "LOW",
  S10_DESTINATION_INFERRED: "LOW",
};

const TYPE_TO_SERVICE = {
  CP: "PARCEL",
  EE: "EMS",
  RR: "REGISTERED",
};

const includesAny = (txt, list) => list.some((w) => txt.includes(w));
const normalizeText = (value) => String(value || "").trim().toLowerCase();

const looksLikeReverseDestinationEvent = (eventType) => {
  const txt = normalizeText(eventType);
  if (!txt) return false;
  return includesAny(txt, [
    "recibido del cliente",
    "oficina origen",
    "saca de envio",
    "saca de envio.",
    "enviado a aduana",
    "devolucion desde la aduana",
    "devolucion",
  ]);
};

const toDateMs = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
};

const iso2ToCountry = (iso2) => {
  if (!iso2 || !/^[A-Z]{2}$/.test(iso2)) return null;
  return countries.getName(iso2, "es") || iso2;
};

const classifyEventStatus = (eventType) => {
  const txt = normalizeText(eventType);
  if (!txt) return EVENT_STATUS.UNKNOWN;
  if (includesAny(txt, ["entregado", "entrega realizada", "delivered"])) return EVENT_STATUS.DELIVERED;
  if (includesAny(txt, ["listo para entregar", "oficina de entrega", "out for delivery"])) return EVENT_STATUS.READY_FOR_DELIVERY;
  if (includesAny(txt, ["enviado al extranjero", "despatched to overseas", "dispatch item abroad"])) return EVENT_STATUS.EXPORTED;
  if (includesAny(txt, ["en camino", "transito", "tránsito", "incluido en la saca"])) return EVENT_STATUS.IN_TRANSIT;
  if (includesAny(txt, ["recibido del cliente", "accepted"])) return EVENT_STATUS.ACCEPTED;
  return EVENT_STATUS.UNKNOWN;
};

const inferCountryFromOffice = (office) => {
  const prefix = String(office || "").trim().slice(0, 3).toUpperCase();
  const iso2 = countries.alpha3ToAlpha2(prefix) || null;
  if (!iso2) return null;
  return { iso2, country: iso2ToCountry(iso2), source: "OFFICE_PREFIX" };
};

export const getEventStatusLabel = (status) => EVENT_STATUS_LABEL[status] || EVENT_STATUS_LABEL.UNKNOWN;

export const isValidS10 = (codigo) => S10_REGEX.test(String(codigo || "").trim().toUpperCase());

export const parseS10 = (codigo) => {
  const clean = String(codigo || "").trim().toUpperCase();
  if (!isValidS10(clean)) return null;
  const type = clean.slice(0, 2);
  const serial = clean.slice(2, 11);
  const originIso2 = clean.slice(-2);
  return {
    code: clean,
    type,
    serial,
    service: TYPE_TO_SERVICE[type] || "OTHER",
    originIso2,
    originCountry: iso2ToCountry(originIso2),
  };
};

export const normalizeTrackingPayload = (payload) => {
  if (!payload || typeof payload !== "object") return payload;

  const s10 = parseS10(payload.codigo);
  const originIso2 = s10?.originIso2 || null;
  const originCountry = s10?.originCountry || null;

  const externos = Array.isArray(payload.eventos_externos) ? payload.eventos_externos : [];
  const timeline = externos
    .map((ev, idx) => ({ idx, ev }))
    .sort((a, b) => toDateMs(a.ev?.eventDate) - toDateMs(b.ev?.eventDate));

  let seenExport = false;
  let lastKnownCountryIso2 = null;
  let lastKnownCountry = null;
  const normalizedByIndex = new Map();

  for (const row of timeline) {
    const ev = row.ev || {};
    const eventType = ev.eventType || "";
    const status = classifyEventStatus(eventType);
    if (status === EVENT_STATUS.EXPORTED) seenExport = true;

    const officeGuess = inferCountryFromOffice(ev.office);
    let countryIso2 = officeGuess?.iso2 || null;
    let country = officeGuess?.country || null;
    let countrySource = officeGuess?.source || null;

    if (countryIso2) {
      lastKnownCountryIso2 = countryIso2;
      lastKnownCountry = country;
    } else if (!String(ev.office || "").trim()) {
      const forceReverseDestination =
        originIso2 &&
        lastKnownCountryIso2 &&
        lastKnownCountryIso2 !== originIso2 &&
        looksLikeReverseDestinationEvent(eventType);

      if (forceReverseDestination) {
        countryIso2 = originIso2;
        country = originCountry;
        countrySource = "S10_DESTINATION_INFERRED";
        lastKnownCountryIso2 = countryIso2;
        lastKnownCountry = country;
      } else if (lastKnownCountryIso2) {
        countryIso2 = lastKnownCountryIso2;
        country = lastKnownCountry;
        countrySource = "CONTEXT_INFERRED";
      } else if (!seenExport && originIso2) {
        countryIso2 = originIso2;
        country = originCountry;
        countrySource = "S10_ORIGIN_INFERRED";
      }
    }

    normalizedByIndex.set(row.idx, {
      ...ev,
      countryIso2,
      country,
      countrySource,
      countryConfidence: COUNTRY_CONFIDENCE[countrySource] || null,
      eventStatus: status,
      eventStatusLabel: getEventStatusLabel(status),
    });
  }

  const normalizedExternos = externos.map((ev, idx) => normalizedByIndex.get(idx) || ev);
  const latest =
    [...normalizedExternos].sort((a, b) => toDateMs(b?.eventDate) - toDateMs(a?.eventDate))[0] || null;

  return {
    ...payload,
    eventos_externos: normalizedExternos,
    meta_tracking: {
      isS10: !!s10,
      type: s10?.type || null,
      service: s10?.service || null,
      serial: s10?.serial || null,
      originCountryIso2: originIso2,
      originCountry,
      currentCountryIso2: latest?.countryIso2 || originIso2,
      currentCountry: latest?.country || originCountry,
      currentCountrySource: latest?.countrySource || null,
      currentCountryConfidence: latest?.countryConfidence || null,
      currentStatus: latest?.eventStatus || EVENT_STATUS.UNKNOWN,
      currentStatusLabel: latest?.eventStatusLabel || EVENT_STATUS_LABEL.UNKNOWN,
      delivered: latest?.eventStatus === EVENT_STATUS.DELIVERED,
    },
  };
};

export const runTrackingParserSelfTest = () => {
  const forward = normalizeTrackingPayload({
    codigo: "RR123456789PE",
    eventos_externos: [
      { eventType: "Paquete recibido del cliente.", eventDate: "2025-10-24 18:20:15", office: "" },
      { eventType: "Paquete enviado al extranjero.", eventDate: "2025-11-04 21:44:15", office: "" },
      {
        eventType: "Paquete recibido en oficina de entrega(Listo para entregar).",
        eventDate: "2025-11-12 13:50:02",
        office: "BOLPBA - LA PAZ LC/AO",
      },
    ],
  });

  const reverse = normalizeTrackingPayload({
    codigo: "RR090790959AE",
    eventos_externos: [
      {
        eventType: "Paquete recibido en oficina de entrega(Listo para entregar).",
        eventDate: "2025-09-11 14:19:01",
        office: "BOLPBA - LA PAZ LC/AO",
      },
      { eventType: "Paquete recibido del cliente.", eventDate: "2025-09-15 19:11:12", office: "" },
    ],
  });

  const globalOffice = normalizeTrackingPayload({
    codigo: "RR111111111DE",
    eventos_externos: [
      { eventType: "Evento", eventDate: "2025-01-01 10:00:00", office: "DEUPBA - BERLIN AO" },
    ],
  });

  const firstForward = forward?.eventos_externos?.[0];
  const lastForward = forward?.eventos_externos?.[2];
  const reverseLast = reverse?.eventos_externos?.[1];
  const globalOfficeLast = globalOffice?.eventos_externos?.[0];

  return (
    forward?.meta_tracking?.originCountryIso2 === "PE" &&
    firstForward?.countryIso2 === "PE" &&
    firstForward?.countrySource === "S10_ORIGIN_INFERRED" &&
    lastForward?.countryIso2 === "BO" &&
    lastForward?.countryConfidence === "HIGH" &&
    forward?.meta_tracking?.currentStatus === EVENT_STATUS.READY_FOR_DELIVERY &&
    reverseLast?.countryIso2 === "AE" &&
    reverseLast?.countrySource === "S10_DESTINATION_INFERRED" &&
    globalOfficeLast?.countryIso2 === "DE"
  );
};
