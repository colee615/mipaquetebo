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
  const results = Array.isArray(payload.resultado) ? payload.resultado : [];

  const queue = [];
  const push = (text) => {
    const raw = String(text || "").trim();
    if (!raw) return;
    queue.push(raw);
  };

  for (const item of results) {
    const events = Array.isArray(item?.eventos) ? item.eventos : [];
    for (const ev of events) {
      push(ev?.nombre_evento);
      push(ev?.servicio);
      push(ev?.condition);
    }
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
    resultado: results.map((item) => ({
      ...item,
      eventos: (Array.isArray(item?.eventos) ? item.eventos : []).map((ev) => ({
        ...ev,
        nombre_evento: tr(ev?.nombre_evento),
        servicio: tr(ev?.servicio),
        condition: tr(ev?.condition),
      })),
    })),
  };
}
