import Constants from "expo-constants";

import { getApiWithRetry } from "../config/api";

const extra = Constants?.expoConfig?.extra || Constants?.manifest2?.extra || {};

const DEFAULT_UPDATE_PATH = "/api/public/app-version";
const DEFAULT_ANDROID_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.colee_615.scannerapp";

const normalizeVersion = (value) =>
  String(value || "")
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .map((part) => Number.parseInt(String(part || "0").replace(/\D+/g, ""), 10) || 0);

const compareSemver = (a, b) => {
  const aa = normalizeVersion(a);
  const bb = normalizeVersion(b);
  const max = Math.max(aa.length, bb.length);

  for (let i = 0; i < max; i += 1) {
    const av = aa[i] || 0;
    const bv = bb[i] || 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }

  return 0;
};

const getCurrentAppVersion = () => String(Constants?.expoConfig?.version || "0.0.0");

export const checkAppUpdate = async () => {
  if (extra.enableUpdateCheck === false) {
    return {
      shouldShow: false,
      isForce: false,
      currentVersion: getCurrentAppVersion(),
      latestVersion: "",
      minimumVersion: "",
      storeUrl: extra.playStoreUrl || DEFAULT_ANDROID_STORE_URL,
      title: "Nueva version disponible",
      message: "Hay una nueva version de la app disponible.",
    };
  }

  const path = (extra.updateCheckPath || DEFAULT_UPDATE_PATH).trim() || DEFAULT_UPDATE_PATH;
  const response = await getApiWithRetry(path, { timeout: 8000, retries: 0 });

  const data = response?.data || {};
  const currentVersion = getCurrentAppVersion();
  const latestVersion = String(data.latestVersion || "").trim();
  const minimumVersion = String(data.minimumVersion || "").trim();

  if (!latestVersion) {
    return {
      shouldShow: false,
      isForce: false,
      currentVersion,
      latestVersion: "",
      minimumVersion,
      storeUrl: data.playStoreUrl || extra.playStoreUrl || DEFAULT_ANDROID_STORE_URL,
      title: data.title || "Nueva version disponible",
      message: data.message || "Hay una nueva version de la app disponible.",
    };
  }

  const hasNewer = compareSemver(latestVersion, currentVersion) > 0;
  const belowMinimum = minimumVersion && compareSemver(currentVersion, minimumVersion) < 0;
  const forceByFlag = !!data.forceUpdate;
  const isForce = !!(belowMinimum || forceByFlag);

  return {
    shouldShow: hasNewer,
    isForce,
    currentVersion,
    latestVersion,
    minimumVersion,
    storeUrl: data.playStoreUrl || extra.playStoreUrl || DEFAULT_ANDROID_STORE_URL,
    title: data.title || "Nueva version disponible",
    message:
      data.message ||
      (isForce
        ? "Debes actualizar la aplicacion para continuar."
        : "Te recomendamos actualizar para obtener mejoras y correcciones."),
  };
};
