import assert from "node:assert/strict";
import fs from "node:fs";

async function loadModule(file, replacements = []) {
  let source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
  for (const [search, replacement] of replacements) source = source.replace(search, replacement);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const tracking = await loadModule("../src/utils/tracking.js");
const events = await loadModule("../src/utils/packageEvents.js", [[
  'import { formatDaysAgo } from "./eventText";',
  'const formatDaysAgo = (days, language) => days <= 0 ? (language === "en" ? "today" : "hoy") : String(days);',
]]);

const wrap = (items) => ({ resultado: [{ eventos: items }] });
const resolve = (items, service = "EMS") => events.getTrackingPresentation(wrap(
  items.map((item) => ({ servicio: service, ...item }))
));

assert.deepEqual(tracking.validateTrackingCode(" ab-12/34 "), { ok: true, value: "AB1234", reason: "ok" });
assert.deepEqual(tracking.validateTrackingCode("AB_12"), { ok: true, value: "AB12", reason: "ok" });
assert.equal(tracking.validateTrackingCode("A".repeat(51)).reason, "format");

let progress = resolve([
  { codigo_evento: 35, nombre_evento: "Enviar envio a ubicacion nacional", created_at: "2026-01-02 01:00:00" },
  { codigo_evento: 1, nombre_evento: "Recibir envio del cliente", created_at: "2026-01-01 01:00:00" },
]);
assert.equal(progress.currentStep, 2);
assert.equal(progress.globalStatus, "En transito");

progress = resolve([
  { evento_id: 316, nombre_evento: "Paquete entregado exitosamente.", created_at: "2026-01-03 01:00:00" },
  { evento_id: 4477, nombre_evento: "Asignado a cartero", created_at: "2026-01-02 01:00:00" },
], "CERTI");
assert.deepEqual(progress.rawSteps, ["Clasificacion", "Despacho", "Expedicion", "Ventanilla", "Cartero", "Entregado"]);
assert.equal(progress.currentStep, 5);
assert.equal(progress.delivered, true);

progress = resolve([
  { evento_id: 4470, nombre_evento: "Envio cancelado desde encargado.", created_at: "2026-01-03 01:00:00" },
]);
assert.equal(progress.currentStep, 1);
assert.equal(progress.globalStatus, "Envio cancelado");
assert.equal(progress.isCancelled, true);
assert.equal(progress.delivered, false);

progress = resolve([
  { codigo_evento: 34, nombre_evento: "Registrar informacion de aduanas sobre el envio", created_at: "2026-01-03 01:00:00" },
  { codigo_evento: 30, nombre_evento: "Paquete recibido en oficina de transito", created_at: "2026-01-02 01:00:00" },
]);
assert.deepEqual(progress.rawSteps, ["Admision", "Despacho", "Expedicion", "Ventanilla = Aduana", "Entregado"]);
assert.equal(progress.currentStep, 3);
assert.equal(progress.isCustoms, true);
assert.equal(progress.statusCategory, "customs");
assert.equal(progress.customsSubstep, "customs");

progress = resolve([
  { codigo_evento: 32, nombre_evento: "Paquete listo para entregar en oficina", created_at: "2026-01-04 01:00:00" },
  { codigo_evento: 34, nombre_evento: "Registrar informacion de aduanas sobre el envio", created_at: "2026-01-03 01:00:00" },
  { codigo_evento: 30, nombre_evento: "Paquete recibido en oficina de transito", created_at: "2026-01-02 01:00:00" },
]);
assert.deepEqual(progress.rawSteps, ["Admision", "Despacho", "Expedicion", "Ventanilla = Aduana", "Entregado"]);
assert.equal(progress.currentStep, 3);
assert.equal(progress.isCustoms, false);
assert.equal(progress.isPickupAvailable, true);
assert.equal(progress.customsSubstep, "counter");
assert.equal(progress.statusCategory, "pickup");

progress = resolve([
  { codigo_evento: 32, nombre_evento: "Receive item at delivery office (Inb)", created_at: "2026-01-05 01:00:00" },
  { codigo_evento: 75, nombre_evento: "Receive item at collection point", created_at: "2026-01-04 01:00:00" },
]);
assert.equal(progress.isPickupAvailable, true);
assert.equal(progress.statusCategory, "pickup");
assert.equal(progress.globalStatus, "Listo para recoger");

progress = resolve([
  { codigo_evento: 32, nombre_evento: "Receive item at delivery office (Inb)", office: "BOSRZA - SANTA CRUZ DE LA SIERRA", ciudad_destino: "La Paz", created_at: "2026-01-04 01:00:00" },
]);
assert.equal(progress.isPickupAvailable, false);
assert.equal(progress.pickupAtNonDestinationOffice, true);
assert.equal(progress.statusCategory, "transit");

progress = resolve([
  { codigo_evento: 1251, nombre_evento: "Evento con código de incidencia", created_at: "2026-01-05 01:00:00" },
]);
assert.equal(progress.hasIncident, true);
assert.equal(progress.statusCategory, "incident");

progress = resolve([
  { codigo_evento: 194, nombre_evento: "Paquete retenido por anomalía de saca", created_at: "2026-01-05 01:00:00" },
]);
assert.equal(progress.hasIncident, false);

progress = resolve([
  { codigo_evento: 6, nombre_evento: "Motivo de retención de envío por parte de aduana", created_at: "2026-01-05 01:00:00" },
]);
assert.equal(progress.isHeldByCustoms, true);
assert.equal(progress.hasIncident, true);
assert.equal(progress.statusCategory, "held");

progress = resolve([
  { codigo_evento: 38, nombre_evento: "Return item from customs (Inb)", office: "BOORUB - ORURO", ciudad_destino: "Oruro", created_at: "2026-01-03 01:00:00" },
  { codigo_evento: 31, nombre_evento: "Send item to customs (Inb)", office: "BOSRZA - SANTA CRUZ DE LA SIERRA", ciudad_destino: "Oruro", created_at: "2026-01-02 01:00:00" },
]);
assert.deepEqual(progress.rawSteps, ["Admision", "Despacho", "Expedicion", "Ventanilla = Aduana", "Entregado"]);
assert.equal(progress.currentStep, 3);
assert.equal(progress.globalStatus, "Listo para recoger");
assert.equal(progress.pickupReadyAtDestinationCustoms, true);
assert.equal(progress.customsSubstep, "counter");

progress = resolve([
  { codigo_evento: 34, nombre_evento: "Registrar informacion de aduanas sobre el envio (entrada)", office: "BOORUB - ORURO", ciudad_destino: "Oruro", created_at: "2026-01-03 01:00:00" },
  { codigo_evento: 31, nombre_evento: "Send item to customs (Inb)", office: "BOSRZA - SANTA CRUZ DE LA SIERRA", ciudad_destino: "Oruro", created_at: "2026-01-02 01:00:00" },
]);
assert.equal(progress.pickupReadyAtDestinationCustoms, false);
assert.equal(progress.isPickupAvailable, false);
assert.equal(progress.statusCategory, "customs");

progress = resolve([
  { codigo_evento: 34, nombre_evento: "Registrar informacion de aduanas sobre el envio (entrada)", office: "BOORUB - ORURO", ciudad_destino: "Oruro", created_at: "2026-01-03 01:00:00" },
  { codigo_evento: 31, nombre_evento: "Send item to customs (Inb)", office: "BOSRZA - SANTA CRUZ DE LA SIERRA", ciudad_destino: "Oruro", created_at: "2026-01-02 01:00:00" },
]);
assert.equal(progress.pickupReadyAtDestinationCustoms, false);
assert.equal(progress.isPickupAvailable, false);
assert.equal(progress.statusCategory, "customs");

progress = resolve([
  { codigo_evento: 31, nombre_evento: "Send item to customs (Inb)", office: "BOSRZA - SANTA CRUZ DE LA SIERRA", ciudad_destino: "La Paz", created_at: "2026-01-03 01:00:00" },
  { codigo_evento: 30, nombre_evento: "Receive item at inward office of exchange", office: "BOSRZA - SANTA CRUZ DE LA SIERRA", ciudad_destino: "La Paz", created_at: "2026-01-02 01:00:00" },
  { codigo_evento: 32, nombre_evento: "Receive item at delivery office (Inb)", office: "BOSRZA - SANTA CRUZ DE LA SIERRA", ciudad_destino: "La Paz", created_at: "2026-01-01 01:00:00" },
]);
assert.deepEqual(progress.rawSteps, ["Admision", "Despacho", "Expedicion", "Ventanilla = Aduana", "Entregado"]);
assert.equal(progress.currentStep, 3);
assert.equal(progress.globalStatus, "En Aduana");
assert.equal(progress.isPickupAvailable, false);

progress = resolve([
  { codigo_evento: 38, nombre_evento: "Return item from customs (Inb)", created_at: "2026-01-03 01:00:00" },
  { codigo_evento: 31, nombre_evento: "Send item to customs (Inb)", created_at: "2026-01-02 01:00:00" },
]);
assert.equal(progress.isReturning, false);
assert.equal(progress.isCustoms, false);
assert.equal(progress.customsReturnedToPostalFlow, true);

progress = resolve([
  { codigo_evento: 70, nombre_evento: "Retener envio en oficina de cambio (entrada)", created_at: "2026-01-03 01:00:00" },
  { codigo_evento: 35, nombre_evento: "Enviar envio a ubicacion nacional (entrada)", created_at: "2026-01-02 01:00:00" },
]);
assert.equal(progress.currentStep, 2);
assert.equal(progress.globalStatus, "Retenido en oficina de cambio");
assert.equal(progress.isHeldAtExchange, true);

progress = resolve([
  { evento_id: 2241, nombre_evento: "Delivery Express enviado en saca interna.", created_at: "2026-01-03 01:00:00" },
  { evento_id: 2240, nombre_evento: "Delivery Express recibido en almacen.", created_at: "2026-01-02 01:00:00" },
  { evento_id: 2239, nombre_evento: "Delivery Express registrado.", created_at: "2026-01-01 01:00:00" },
]);
assert.equal(progress.currentStep, 2);

progress = resolve([
  { codigo_evento: 38, postal_status_cd: 0, postal_status: "Normal", nombre_evento: "Devolver envío desde aduana (entrada)", created_at: "2026-01-03 01:00:00" },
  { codigo_evento: 31, postal_status_cd: 0, postal_status: "Normal", nombre_evento: "Envío remitido a Aduana", created_at: "2026-01-02 01:00:00" },
]);
assert.equal(progress.isReturning, false);
assert.equal(progress.customsReturnedToPostalFlow, true);
assert.equal(progress.statusCategory, "transit");
assert.ok(progress.rawSteps.includes("Ventanilla = Aduana"));

progress = resolve([
  { codigo_evento: 38, nombre_evento: "Devolver envío desde aduana (entrada)", office: "BOCBBA - COCHABAMBA", ciudad_destino: "Cochabamba", created_at: "2026-01-03 01:00:00" },
]);
assert.equal(progress.pickupReadyAtDestinationCustoms, true);
assert.equal(progress.isPickupAvailable, true);
assert.equal(progress.statusCategory, "pickup");

progress = resolve([
  { codigo_evento: 38, nombre_evento: "Devolver envío desde aduana (entrada)", office: "BOCBBA - COCHABAMBA", ciudad_destino: "La Paz", created_at: "2026-01-03 01:00:00" },
]);
assert.equal(progress.pickupReadyAtDestinationCustoms, false);
assert.equal(progress.isPickupAvailable, false);
assert.equal(progress.customsSubstep, "counter");

progress = resolve([
  { codigo_evento: 32, postal_status_cd: 22, postal_status: "Normal", nombre_evento: "Receive item at delivery office (Inb)", created_at: "2026-01-04 01:00:00" },
]);
assert.equal(progress.isReturning, false);
assert.equal(progress.isPickupAvailable, true);
assert.equal(progress.statusCategory, "pickup");
assert.equal(progress.globalStatus, "Listo para recoger");

progress = resolve([
  { codigo_evento: 30, nombre_evento: "Receive item at inward office of exchange", created_at: "2026-01-03 01:00:00" },
  { codigo_evento: 37, nombre_evento: "Deliver item (Inb)", created_at: "2026-01-02 01:00:00" },
]);
assert.equal(progress.delivered, false);
assert.equal(progress.currentStep, 2);
assert.equal(progress.statusCategory, "transit");

const returnedPayload = wrap([
  { codigo_evento: 1, postal_status_cd: 0, postal_status: "Returned to sender", nombre_evento: "Retorno al remitente", created_at: "2026-01-03 01:00:00" },
  { codigo_evento: 37, nombre_evento: "Entregado al destinatario", created_at: "2026-01-02 01:00:00" },
]);
progress = events.getTrackingPresentation(returnedPayload);
assert.equal(progress.globalStatus, "Devuelto al remitente");
assert.equal(progress.isReturnCompleted, true);
assert.equal(progress.isReturning, true);
assert.equal(events.isPayloadDelivered(returnedPayload), false);

progress = resolve([
  { nombre_evento: "Package delivered", created_at: "2026-01-03 01:00:00" },
]);
assert.equal(progress.currentStep, 0);
assert.equal(progress.delivered, false);

progress = resolve([
  { evento_id: 316, nombre_evento: "Paquete entregado exitosamente.", created_at: "2026-01-03 01:00:00" },
  { evento_id: 4470, nombre_evento: "Envio cancelado desde encargado.", created_at: "2026-01-02 01:00:00" },
]);
assert.equal(progress.isCancelled, false);
assert.equal(progress.delivered, true);

assert.equal(progress.rawSteps.at(-1), "Entregado");

console.log("Tracking parity: todos los flujos validados.");
