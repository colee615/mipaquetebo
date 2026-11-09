import { formatDaysAgo } from "./eventText";

const STAGE_ADMISSION = 0;
const STAGE_DISPATCH = 1;
const STAGE_EXPEDITION = 2;
const STAGE_COUNTER = 3;
const STAGE_COURIER = 4;
const STAGE_DELIVERED = 5;

const UPU_STAGES = {
  1: STAGE_ADMISSION, 2: STAGE_DISPATCH, 3: STAGE_DISPATCH, 5: STAGE_DISPATCH,
  4: STAGE_EXPEDITION, 6: STAGE_EXPEDITION, 7: STAGE_EXPEDITION, 8: STAGE_EXPEDITION,
  12: STAGE_EXPEDITION, 30: STAGE_EXPEDITION, 32: STAGE_COUNTER, 35: STAGE_EXPEDITION,
  38: STAGE_EXPEDITION,
  36: STAGE_COURIER, 37: STAGE_DELIVERED, 39: STAGE_COURIER, 40: STAGE_EXPEDITION,
  42: STAGE_EXPEDITION, 43: STAGE_EXPEDITION, 44: STAGE_EXPEDITION, 45: STAGE_ADMISSION,
  68: STAGE_ADMISSION, 67: STAGE_COURIER, 71: STAGE_EXPEDITION, 72: STAGE_EXPEDITION,
  73: STAGE_COUNTER, 74: STAGE_COURIER, 75: STAGE_COUNTER, 77: STAGE_EXPEDITION,
  78: STAGE_ADMISSION, 1250: STAGE_DELIVERED,
};

const LOCAL_STAGES = {
  165: STAGE_COURIER, 181: STAGE_DISPATCH, 182: STAGE_EXPEDITION, 183: STAGE_COUNTER,
  184: STAGE_COURIER, 185: STAGE_COUNTER, 295: STAGE_ADMISSION, 296: STAGE_DISPATCH,
  297: STAGE_DISPATCH, 299: STAGE_DISPATCH, 302: STAGE_EXPEDITION, 306: STAGE_EXPEDITION,
  310: STAGE_EXPEDITION, 312: STAGE_COUNTER, 315: STAGE_COURIER, 316: STAGE_DELIVERED,
  319: STAGE_EXPEDITION, 2238: STAGE_COUNTER, 2239: STAGE_ADMISSION, 2240: STAGE_DISPATCH,
  2241: STAGE_EXPEDITION, 2242: STAGE_DISPATCH, 4477: STAGE_COURIER, 4478: STAGE_COUNTER,
};

const readText = (value) => String(value ?? "").trim();
const normalizeText = (value) =>
  readText(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const includesAny = (text, values) => values.some((value) => text.includes(value));
const numericValue = (value) => {
  if ((typeof value !== "string" && typeof value !== "number") || readText(value) === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
};
const rawEventText = (event) => normalizeText(event?._raw_nombre_evento || event?.nombre_evento);

export const getTrackingResults = (payload) => (Array.isArray(payload?.resultado) ? payload.resultado : []);

export const getTrackingEvents = (payload) => {
  const first = getTrackingResults(payload)[0];
  return Array.isArray(first?.eventos) ? first.eventos : [];
};

const getEventTimestamp = (event) => {
  if (typeof event?._sort_ts === "number") return event._sort_ts * 1000;
  const raw = event?.created_at || event?.updated_at || null;
  if (!raw) return 0;
  const match = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})[T\s]+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const [, year, month, day, hour, minute, second = "0"] = match;
    return Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  }
  const parsed = new Date(raw).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const getSortedTrackingEvents = (payload) =>
  [...getTrackingEvents(payload)].sort((a, b) => getEventTimestamp(b) - getEventTimestamp(a));

export const getLatestPackageEvent = (payload) => getSortedTrackingEvents(payload)[0] || null;

export const getPackageEventOffice = (event) => readText(event?.office);

const isDeliveredText = (text) => {
  if (includesAny(text, ["listo para entregar", "oficina de entrega", "intento fallido", "no entregado", "pendiente de entrega"])) return false;
  return includesAny(text, [
    "entregado exitosamente", "entregado al cliente", "entregado al destinatario", "entrega realizada",
    "envio entregado", "paquete entregado", "recepcionado por destinatario", "recibido por destinatario",
    "entregar envio", "entregar envio con firma",
  ]);
};

export const isDeliveredEvent = (event) => {
  const upuCode = numericValue(event?.codigo_evento);
  const localEventId = numericValue(event?.evento_id);
  if (UPU_STAGES[upuCode] === STAGE_DELIVERED || LOCAL_STAGES[localEventId] === STAGE_DELIVERED) return true;
  return isDeliveredText(rawEventText(event));
};

const stageFromText = (text) => {
  if (isDeliveredText(text)) return STAGE_DELIVERED;
  if (includesAny(text, ["cartero", "agente de entrega", "entrega fisica", "intento fallido"])) return STAGE_COURIER;
  if (includesAny(text, ["ventanilla", "listo para entregar", "oficina de entrega", "punto de entrega", "punto de recogida"])) return STAGE_COUNTER;
  if (includesAny(text, ["expedicion", "saca", "transito", "extranjero", "oficina de cambio", "ubicacion nacional"])) return STAGE_EXPEDITION;
  if (includesAny(text, ["despacho", "centro de clasificacion", "centro de procesamiento"])) return STAGE_DISPATCH;
  if (includesAny(text, ["admision", "recibir envio del cliente", "paquete recibido del cliente"])) return STAGE_ADMISSION;
  return null;
};

const stageFor = (event) => {
  const upuCode = numericValue(event?.codigo_evento);
  if (Object.prototype.hasOwnProperty.call(UPU_STAGES, upuCode)) return UPU_STAGES[upuCode];
  const localEventId = numericValue(event?.evento_id);
  if (Object.prototype.hasOwnProperty.call(LOCAL_STAGES, localEventId)) return LOCAL_STAGES[localEventId];
  return stageFromText(rawEventText(event));
};

const isIncident = (event) => {
  const eventCode = numericValue(event?.codigo_evento);
  if (eventCode === 1251) return true;
  // IPS 38 es la devolución del control aduanero y 194 describe la saca,
  // no una incidencia propia del paquete.
  if ([38, 194].includes(eventCode)) return false;
  return includesAny(rawEventText(event), [
    "fallido", "incidencia", "devuelto", "devolver", "devolucion", "retorno", "retenido", "retener", "detenida",
    "detenido", "cancelado", "cancelada", "eliminado", "eliminada",
  ]);
};

const isCancelled = (event) => includesAny(rawEventText(event), ["envio cancelado", "paquete cancelado"]);

const isReturnStatus = (event) => {
  const code = numericValue(event?.postal_status_cd ?? event?.codigo_estado_postal);
  const returnText = normalizeText(`${event?.postal_status || event?.estado_postal || ""} ${rawEventText(event)}`);
  if (includesAny(returnText, [
    "being returned", "return in progress", "return to sender", "returned to sender",
    "devolucion en curso", "en devolucion", "retorno al remitente", "devuelto al remitente",
  ])) return true;

  // En IPS.POST 22 y 23 identifican motivos de no entrega; por sí solos no
  // confirman que el paquete ya esté en devolución. Evita además confundir
  // Aduana→flujo postal y una llegada a ventanilla con un retorno al remitente.
  if ([22, 23, 38].includes(code) || isPickupAvailable(event) || isCustomsReturnedToPostalFlow(event)) return false;
  return [6, 7].includes(code);
};

const returnStatusCode = (events) => {
  for (const event of events) {
    const code = numericValue(event?.postal_status_cd);
    if ([6, 7].includes(code)) return code;
  }
  return null;
};

const isCustomsEvent = (event) => {
  if (readText(event?.event_tag || event?.eventTag || event?.event_code || event?.eventCode).toUpperCase() === "EME"
    || [4, 6, 31, 34, 38, 76].includes(numericValue(event?.codigo_evento))) return true;
  return includesAny(rawEventText(event), [
    "send item to customs", "record item customs information", "stop item import",
    "enviado a control aduanero", "enviado a aduana", "registrar informacion de aduanas",
    "held by customs", "held by import customs", "retenido por aduana", "retenido en aduana",
    "retener envio en aduana", "retencion aduanera",
  ]);
};

const isInboundCustomsFlowEvent = (event) =>
  [31, 34, 38, 76].includes(numericValue(event?.codigo_evento))
  || readText(event?.event_tag || event?.eventTag || event?.event_code || event?.eventCode).toUpperCase() === "EME";

const hasPurchaseProofReason = (event) =>
  ["retention_reason_cd", "RETENTION_REASON_CD", "retentionReasonCode"]
    .some((key) => numericValue(event?.[key]) === 65)
  || includesAny(rawEventText(event), ["awaiting proof of purchase", "proof of purchase/value", "prueba de compra/valor"]);

const isHeldByCustoms = (event) =>
  hasPurchaseProofReason(event)
  || readText(event?.event_tag || event?.eventTag || event?.event_code || event?.eventCode).toUpperCase() === "EME"
  || numericValue(event?.codigo_evento) === 6
  || includesAny(rawEventText(event), [
    "held by customs", "held by import customs", "retenido por aduana", "retenido en aduana",
    "retener envio en aduana", "retencion aduanera", "reason for retention by customs",
    "motivo de retencion de envio por parte de aduana",
  ]);

const isHeldAtExchange = (event) => numericValue(event?.codigo_evento) === 70
  && includesAny(rawEventText(event), ["retain", "held", "retener", "retenido"]);

const isCustomsReturnedToPostalFlow = (event) =>
  numericValue(event?.codigo_evento) === 38
  || includesAny(rawEventText(event), ["return item from customs", "returned from customs", "devolver envio desde aduana"]);

const isCurrentlyInCustoms = (event) => isCustomsEvent(event) && !isCustomsReturnedToPostalFlow(event);

const isPickupAvailable = (event) =>
  [32, 75].includes(numericValue(event?.codigo_evento))
  || includesAny(rawEventText(event), [
    "listo para entregar", "listo para recoger", "oficina de entrega", "punto de recogida",
    "received at collection point", "receive item at collection point", "available for collection",
    "item available for collection", "collection point for pick-up", "collection point for pickup",
  ]);

const isPickupAtNonDestinationOffice = (event, events) => {
  if (!isPickupAvailable(event)) return false;

  const destinationEvent = events.find((candidate) => {
    const city = readText(candidate?.ciudad_destino || candidate?.destinationCity);
    return city && !["bo", "bolivia", "plurinational state of bolivia"].includes(normalizeText(city));
  });
  const destination = normalizeText(destinationEvent?.ciudad_destino || destinationEvent?.destinationCity)
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  const office = normalizeText(event?.office)
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

  return !!destination && !!office && !office.includes(destination);
};

const isCustomsReadyAtDestination = (event, events) => {
  // Event 34 only records customs information; release back to postal flow is
  // event 38. Pickup is ready only if that release happened at the destination.
  if (!isCustomsReturnedToPostalFlow(event) || isHeldByCustoms(event)) return false;

  const destination = normalizeText(
    events.find((candidate) => readText(candidate?.ciudad_destino || candidate?.destinationCity))?.ciudad_destino
      || events.find((candidate) => readText(candidate?.ciudad_destino || candidate?.destinationCity))?.destinationCity,
  ).replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  if (!destination || ["bolivia", "plurinational state of bolivia"].includes(destination)) return false;

  const office = normalizeText(event?.office || event?.next_office)
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  return !!office && office.includes(destination);
};

const stepIndex = (stage, hasCourierStep, hasCustomsStep) => {
  const customsOffset = hasCustomsStep && stage >= STAGE_COUNTER ? 1 : 0;
  if (stage === STAGE_DELIVERED) return (hasCourierStep ? 5 : 4) + customsOffset;
  if (stage === STAGE_COURIER) return 4 + customsOffset;
  return stage + customsOffset;
};

const translateStep = (step, t) => {
  const keys = {
    Clasificacion: ["result.step.classification", "Clasificacion"],
    Admision: ["result.step.admission", "Admision"],
    Despacho: ["result.step.dispatch", "Despacho"],
    Expedicion: ["result.step.forwarding", "Expedicion"],
    Aduana: ["result.step.counter", "Ventanilla"],
    "Ventanilla = Aduana": ["result.step.counter", "Ventanilla"],
    Ventanilla: ["result.step.counter", "Ventanilla"],
    Cartero: ["result.step.carrier", "Cartero"],
    Entregado: ["result.step.delivered", "Entregado"],
    Cancelado: ["result.step.cancelled", "Cancelado"],
    "Devolución": ["result.step.returning", "Devolución"],
    "Retorno recibido": ["result.step.returnReceived", "Retorno recibido"],
    "Devuelto al remitente": ["result.step.returnedToSender", "Devuelto al remitente"],
  };
  const [key, fallback] = keys[step] || [step, step];
  return t(key, fallback);
};

export const getTrackingPresentation = (payload, t = (key, fallback) => fallback || key) => {
  const events = getSortedTrackingEvents(payload);
  const latestEvent = events[0] || null;
  const service = readText(latestEvent?._raw_servicio || latestEvent?.servicio).toUpperCase() || "EMS";
  const firstStep = ["ORDI", "CERTI"].includes(service) ? "Clasificacion" : "Admision";
  const cancelled = !!latestEvent && isCancelled(latestEvent);
  const returning = !!latestEvent && isReturnStatus(latestEvent);
  let inCustoms = !!latestEvent && isCurrentlyInCustoms(latestEvent);
  const hasCustomsStep = events.some(isCustomsEvent);
  const hasCustomsCounterFlow = events.some(isInboundCustomsFlowEvent);
  const heldByCustoms = !!latestEvent && isHeldByCustoms(latestEvent);
  const heldAtExchange = !!latestEvent && isHeldAtExchange(latestEvent);
  const customsActionRequired = !!latestEvent && (heldByCustoms || hasPurchaseProofReason(latestEvent));
  const pickupReadyAtDestination = !!latestEvent && isCustomsReadyAtDestination(latestEvent, events);
  const pickupAtNonDestinationOffice = !!latestEvent && isPickupAtNonDestinationOffice(latestEvent, events);
  const pickupAvailable = !!latestEvent
    && ((isPickupAvailable(latestEvent) && !pickupAtNonDestinationOffice) || pickupReadyAtDestination);
  const customsReturnedToPostalFlow = !!latestEvent && isCustomsReturnedToPostalFlow(latestEvent);
  if (pickupReadyAtDestination && !heldByCustoms && !customsActionRequired) inCustoms = false;
  let highestStage = STAGE_ADMISSION;
  let hasCourierEvent = false;
  let hasIncident = false;

  for (const event of events) {
    const stage = stageFor(event);
    if (stage !== null) {
      highestStage = Math.max(highestStage, stage);
      hasCourierEvent = hasCourierEvent || stage === STAGE_COURIER;
    }
    hasIncident = hasIncident || isIncident(event);
  }
  const latestStage = latestEvent ? stageFor(latestEvent) : null;
  const deliveredStage = latestStage === STAGE_DELIVERED
    || (latestStage === null && highestStage === STAGE_DELIVERED);
  const currentStage = deliveredStage ? STAGE_DELIVERED : (latestStage ?? highestStage);

  let rawSteps;
  let currentStep;
  let statusKey;
  let statusFallback;
  let returnStatus = null;
  let returnCompleted = false;
  let statusCategory = "transit";

  if (cancelled) {
    rawSteps = [firstStep, "Cancelado", "Expedicion", "Ventanilla", "Entregado"];
    currentStep = 1;
    statusKey = "result.status.cancelled";
    statusFallback = "Envio cancelado";
    hasIncident = true;
    statusCategory = "cancelled";
  } else if (returning) {
    rawSteps = [firstStep, "Despacho", "Expedicion"];
    if (hasCustomsStep) rawSteps.push("Aduana");
    if (hasCourierEvent) rawSteps.push("Cartero");
    rawSteps.push("Devolución", "Retorno recibido", "Devuelto al remitente");
    returnStatus = returnStatusCode(events);
    const returnText = normalizeText(`${latestEvent?.postal_status || latestEvent?.estado_postal || ""} ${rawEventText(latestEvent)}`);
    returnCompleted = includesAny(returnText, [
      "returned to sender", "devuelto al remitente", "retorno al remitente",
      "retorno completado", "devolucion completada",
    ]);
    currentStep = returnCompleted ? rawSteps.length - 1 : rawSteps.length - 3;
    statusKey = returnCompleted ? "result.status.returned" : "result.status.returning";
    statusFallback = returnCompleted ? "Devuelto al remitente" : "Devolución en curso";
    hasIncident = true;
    statusCategory = returnCompleted ? "returned" : "returning";
  } else {
    rawSteps = [firstStep, "Despacho", "Expedicion"];
    if (hasCustomsStep) rawSteps.push(hasCustomsCounterFlow ? "Ventanilla = Aduana" : "Aduana");
    if (!hasCustomsCounterFlow) rawSteps.push("Ventanilla");
    if (hasCourierEvent) rawSteps.push("Cartero");
    rawSteps.push("Entregado");
    const customsCounterCurrent = hasCustomsCounterFlow
      && (inCustoms || pickupReadyAtDestination || customsReturnedToPostalFlow || currentStage >= STAGE_COUNTER);
    currentStep = latestStage === STAGE_DELIVERED
      ? rawSteps.length - 1
      : customsCounterCurrent
        ? 3
        : inCustoms ? 3 : stepIndex(currentStage, hasCourierEvent, hasCustomsStep && !hasCustomsCounterFlow);
    statusCategory = heldByCustoms
      ? "held"
      : pickupReadyAtDestination && !customsActionRequired
        ? "pickup"
        : inCustoms
          ? "customs"
          : heldAtExchange
            ? "exchangeHeld"
          : deliveredStage
            ? "delivered"
            : pickupAvailable
              ? "pickup"
            : hasIncident ? "incident" : "transit";
    statusKey = statusCategory === "delivered"
      ? "result.status.delivered"
      : statusCategory === "pickup"
        ? "result.status.pickup"
        : statusCategory === "customs"
          ? "result.status.customs"
          : statusCategory === "held"
            ? "result.status.heldByCustoms"
            : statusCategory === "exchangeHeld"
              ? "result.status.heldAtExchange"
            : hasIncident ? "result.status.inTransitIssue" : "result.status.inTransit";
    statusFallback = statusCategory === "delivered"
      ? "Entregado"
      : statusCategory === "pickup"
        ? "Listo para recoger"
        : statusCategory === "customs"
          ? "En Ventanilla"
          : statusCategory === "held"
            ? "En Ventanilla"
            : statusCategory === "exchangeHeld"
              ? "Retenido en oficina de cambio"
            : hasIncident ? "En transito con incidencia" : "En transito";
  }

  const displayRawSteps = [];
  const visibleIndexByRawIndex = [];
  rawSteps.forEach((step, index) => {
    const displayStep = ["Aduana", "Ventanilla = Aduana"].includes(step) ? "Ventanilla" : step;
    const previousDisplayStep = displayRawSteps[displayRawSteps.length - 1];
    if (displayStep === "Ventanilla" && previousDisplayStep === "Ventanilla") {
      visibleIndexByRawIndex[index] = displayRawSteps.length - 1;
      return;
    }
    visibleIndexByRawIndex[index] = displayRawSteps.push(displayStep) - 1;
  });
  const rawCurrentStep = currentStep;
  currentStep = visibleIndexByRawIndex[currentStep] ?? 0;
  const steps = displayRawSteps.map((step) => translateStep(step, t));
  const publicStatus = inCustoms && !cancelled
    ? t("result.status.customs", "En Ventanilla")
    : t(statusKey, statusFallback);
  const delivered = !cancelled && !returning && deliveredStage;

  return {
    steps,
    rawSteps,
    displayRawSteps,
    rawCurrentStep,
    currentStep,
    currentStepLabel: steps[currentStep] || steps[0],
    delivered,
    progressComplete: delivered,
    globalStatus: publicStatus,
    hasIncident: hasIncident || heldByCustoms || heldAtExchange,
    isCancelled: cancelled,
    isCustoms: inCustoms,
    hasCustomsCounterFlow,
    customsActionRequired,
    customsPurchaseProofRequired: !!latestEvent && hasPurchaseProofReason(latestEvent),
    customsReturnedToPostalFlow,
    isHeldByCustoms: heldByCustoms,
    isHeldAtExchange: heldAtExchange,
    isPickupAvailable: pickupAvailable,
    pickupAtNonDestinationOffice,
    pickupReadyAtDestinationCustoms: pickupReadyAtDestination,
    customsSubstep: hasCustomsCounterFlow
      ? pickupAvailable || customsReturnedToPostalFlow || pickupAtNonDestinationOffice ? "counter" : inCustoms ? "customs" : null
      : null,
    statusCategory,
    isReturning: returning,
    returnStatusCode: returnStatus,
    isReturnCompleted: returnCompleted,
  };
};

export const isPayloadDelivered = (payload) => getTrackingPresentation(payload).delivered;

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
