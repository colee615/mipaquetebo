import axios from "axios";
import Constants from "expo-constants";

const extra = Constants?.expoConfig?.extra || Constants?.manifest2?.extra || {};
const envToken = (process?.env?.EXPO_PUBLIC_API_BEARER_TOKEN || "").trim();

const API_BASE_URL = (extra.apiBaseUrl || "").trim();
const API_BEARER_TOKEN = envToken || (extra.apiBearerToken || "").trim();

const apiClient = axios.create({
  baseURL: API_BASE_URL || undefined,
  timeout: 12000,
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const getApiConfig = () => ({
  baseUrl: API_BASE_URL,
  hasToken: !!API_BEARER_TOKEN,
  tokenSource: envToken ? "env" : extra.apiBearerToken ? "embedded" : "none",
});

export const buildAuthHeaders = (headers = {}) => {
  if (!API_BEARER_TOKEN) return headers;
  return {
    ...headers,
    Authorization: `Bearer ${API_BEARER_TOKEN}`,
  };
};

export const getApiErrorKind = (error) => {
  if (!error) return "unknown";
  if (error?.code === "ECONNABORTED") return "timeout";
  if (error?.response?.status) return "http";
  if (error?.message === "API_CONFIG_MISSING") return "config";
  if (error?.request && !error?.response) return "network";
  return "unknown";
};

export const getApiErrorMessage = (error, custom = {}) => {
  const kind = getApiErrorKind(error);
  const status = error?.response?.status;

  if (kind === "config") {
    return custom.config || "Configuracion de API incompleta";
  }
  if (kind === "timeout") {
    return custom.timeout || "La consulta tardo demasiado, intenta de nuevo";
  }
  if (kind === "network") {
    return custom.network || "No se pudo conectar al servidor";
  }
  if (kind === "http") {
    if (status === 400 || status === 404 || status === 422) {
      return custom.invalidCode || "Codigo invalido o no encontrado";
    }
    if (status === 401 || status === 403) {
      return custom.auth || "Credenciales de API invalidas";
    }
    if (status >= 500) {
      return custom.server || "El servidor presento un problema";
    }
    return custom.http || "Error al consultar datos";
  }
  return custom.unknown || "Ocurrio un error inesperado";
};

const shouldRetry = (error) => {
  const status = error?.response?.status;
  const kind = getApiErrorKind(error);
  if (kind === "timeout" || kind === "network") return true;
  if (status === 429) return true;
  if (typeof status === "number" && status >= 500) return true;
  return false;
};

export const postApi = async (path, payload, config = {}) => {
  if (!API_BASE_URL && typeof path === "string" && path.startsWith("/")) {
    throw new Error("API_CONFIG_MISSING");
  }

  const headers = buildAuthHeaders(config.headers);
  return apiClient.post(path, payload, { ...config, headers });
};

export const getApi = async (path, config = {}) => {
  if (!API_BASE_URL && typeof path === "string" && path.startsWith("/")) {
    throw new Error("API_CONFIG_MISSING");
  }

  const headers = buildAuthHeaders(config.headers);
  return apiClient.get(path, { ...config, headers });
};

export const postApiWithRetry = async (path, payload, options = {}) => {
  const { retries = 1, retryDelayMs = 500, ...requestConfig } = options;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await postApi(path, payload, requestConfig);
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !shouldRetry(error)) break;
      await sleep(retryDelayMs * (attempt + 1));
    }
  }

  throw lastError;
};

export const getApiWithRetry = async (path, options = {}) => {
  const { retries = 1, retryDelayMs = 500, ...requestConfig } = options;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await getApi(path, requestConfig);
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !shouldRetry(error)) break;
      await sleep(retryDelayMs * (attempt + 1));
    }
  }

  throw lastError;
};
