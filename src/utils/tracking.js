export const normalizeTrackingCode = (raw) => (raw || "").trim().toUpperCase();

export const isValidTrackingCode = (code) => /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(code);

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

