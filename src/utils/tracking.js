export const normalizeTrackingCode = (raw) =>
  String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

// Align mobile validation with bolipost backend rules:
// required|string|max:50|regex:/^[A-Za-z0-9]+$/
export const isValidTrackingCode = (code) =>
  typeof code === "string" &&
  code.length > 0 &&
  code.length <= 50 &&
  /^[A-Z0-9]+$/.test(code);

export const validateTrackingCode = (raw) => {
  const normalized = normalizeTrackingCode(raw);

  if (!normalized) {
    return { ok: false, value: "", reason: "empty" };
  }

  if (!isValidTrackingCode(normalized)) {
    return { ok: false, value: normalized, reason: "format" };
  }

  return { ok: true, value: normalized, reason: "ok" };
};
