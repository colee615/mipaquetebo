export const normalizeTrackingCodeInput = (raw) =>
  String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\/-]/g, "");

export const normalizeTrackingCode = (raw) =>
  normalizeTrackingCodeInput(raw).replace(/[\/-]+/g, "");

// Align mobile validation with bolipost backend rules:
// The backend accepts separators and removes them before searching.
export const isValidTrackingCode = (code) =>
  typeof code === "string" &&
  code.length > 0 &&
  code.length <= 50 &&
  /^[A-Z0-9]+$/.test(code);

export const validateTrackingCode = (raw) => {
  const input = normalizeTrackingCodeInput(raw);
  const normalized = normalizeTrackingCode(input);

  if (!input || !normalized) {
    return { ok: false, value: "", reason: "empty" };
  }

  if (input.length > 50 || !/^[A-Z0-9\/-]+$/.test(input) || !isValidTrackingCode(normalized)) {
    return { ok: false, value: normalized, reason: "format" };
  }

  return { ok: true, value: normalized, reason: "ok" };
};
