const TRANSLATE_CACHE = new Map();
const TRANSLATE_TIMEOUT_MS = 4000;

const isLikelyTrackCode = (value) => /^[A-Z0-9-]{6,}$/i.test(String(value || "").trim());

const hasLetters = (value) => /[a-zA-Z\u00C0-\u024F]/.test(String(value || ""));

async function fetchJsonWithTimeout(url, timeoutMs = TRANSLATE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function translateText(text, targetLanguage = "en") {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (targetLanguage !== "en") return raw;
  if (!hasLetters(raw) || isLikelyTrackCode(raw)) return raw;

  const cacheKey = `${targetLanguage}|${raw}`;
  if (TRANSLATE_CACHE.has(cacheKey)) return TRANSLATE_CACHE.get(cacheKey);

  try {
    const url =
      "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto" +
      `&tl=${encodeURIComponent(targetLanguage)}&dt=t&q=${encodeURIComponent(raw)}`;
    const payload = await fetchJsonWithTimeout(url);
    const translated = Array.isArray(payload?.[0])
      ? payload[0].map((part) => part?.[0] || "").join("").trim()
      : "";
    const finalText = translated || raw;
    TRANSLATE_CACHE.set(cacheKey, finalText);
    return finalText;
  } catch {
    return raw;
  }
}

export async function translateTrackingPayload(payload, language = "es") {
  if (!payload || language !== "en") return payload;

  const locales = Array.isArray(payload.eventos_locales) ? payload.eventos_locales : [];
  const externos = Array.isArray(payload.eventos_externos) ? payload.eventos_externos : [];

  const queue = [];
  const push = (text) => {
    const raw = String(text || "").trim();
    if (!raw) return;
    queue.push(raw);
  };

  for (const ev of locales) {
    push(ev?.action);
    push(ev?.descripcion);
  }
  for (const ev of externos) {
    push(ev?.eventType);
    push(ev?.condition);
    push(ev?.nextOffice);
  }

  const unique = Array.from(new Set(queue));
  if (!unique.length) return payload;

  const translatedPairs = await Promise.all(
    unique.map(async (txt) => [txt, await translateText(txt, "en")])
  );
  const dict = new Map(translatedPairs);
  const tr = (value) => dict.get(String(value || "").trim()) || value || "";

  return {
    ...payload,
    eventos_locales: locales.map((ev) => ({
      ...ev,
      action: tr(ev?.action),
      descripcion: tr(ev?.descripcion),
    })),
    eventos_externos: externos.map((ev) => ({
      ...ev,
      eventType: tr(ev?.eventType),
      condition: tr(ev?.condition),
      nextOffice: tr(ev?.nextOffice),
    })),
  };
}
