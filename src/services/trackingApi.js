import AsyncStorage from "@react-native-async-storage/async-storage";
import { postApiWithRetry } from "../config/api";
import { normalizeTrackingPayload } from "../utils/trackingParser";
import { translateTrackingPayload } from "../utils/runtimeTranslate";

const TRACKING_CACHE_PREFIX = "tracking_cache_v1_";
const TRACKING_CACHE_TTL_MS = 1000 * 60 * 60 * 12;

const getCacheKey = (codigo) => `${TRACKING_CACHE_PREFIX}${String(codigo || "").trim().toUpperCase()}`;

const readCache = async (codigo) => {
  try {
    const raw = await AsyncStorage.getItem(getCacheKey(codigo));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data || !parsed?.savedAt) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeCache = async (codigo, data) => {
  try {
    const payload = { savedAt: Date.now(), data };
    await AsyncStorage.setItem(getCacheKey(codigo), JSON.stringify(payload));
  } catch {}
};

export const fetchTrackingByCode = async (codigo, options = {}) => {
  const { language = "es", ...requestOptions } = options || {};
  try {
    const response = await postApiWithRetry(
      "/api/busqueda-rr",
      { codigo },
      { timeout: 12000, retries: 1, ...requestOptions }
    );

    const normalized = normalizeTrackingPayload(response.data);
    const rawWithCacheMeta = {
      ...normalized,
      meta_cache: {
        fromCache: false,
        stale: false,
        savedAt: Date.now(),
      },
    };
    await writeCache(codigo, rawWithCacheMeta);
    const translatedData = await translateTrackingPayload(rawWithCacheMeta, language);
    return {
      ...response,
      data: translatedData,
    };
  } catch (error) {
    const cached = await readCache(codigo);
    if (!cached?.data) throw error;

    const age = Date.now() - Number(cached.savedAt || 0);
    const stale = age > TRACKING_CACHE_TTL_MS;
    const rawFallbackData = {
      ...cached.data,
      meta_cache: {
        fromCache: true,
        stale,
        savedAt: cached.savedAt,
        fallbackReason: "NETWORK_OR_SERVER_ERROR",
      },
    };
    const translatedFallbackData = await translateTrackingPayload(rawFallbackData, language);
    return {
      status: 200,
      data: translatedFallbackData,
      fromCacheFallback: true,
    };
  }
};
