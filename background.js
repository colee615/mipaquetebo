import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchTrackingByCode } from "./src/services/trackingApi";
import { normalizeTrackingCode, validateTrackingCode } from "./src/utils/tracking";

const TASK_NAME = "TRACKING_CHECK_TASK";

async function getSavedPackages() {
  const raw = await AsyncStorage.getItem("savedPackages");
  const list = raw ? JSON.parse(raw) : [];
  return Array.isArray(list) ? list : [];
}

function getLatestEventSignature(locales = [], externos = [], packages = []) {
  const items = [];
  const localList = Array.isArray(locales) ? locales : [];
  const externalList = Array.isArray(externos) ? externos : [];
  const packageList = Array.isArray(packages) ? packages : [];

  for (const ev of localList) {
    const date = ev?.updated_at || ev?.created_at || null;
    if (date) items.push({ kind: "local", date, ev });
  }

  for (const ev of externalList) {
    const date = ev?.eventDate || null;
    if (date) items.push({ kind: "external", date, ev });
  }

  for (const ev of packageList) {
    const date = ev?.updated_at || ev?.created_at || null;
    if (date) items.push({ kind: "package", date, ev });
  }

  if (!items.length) return null;
  items.sort((a, b) => new Date(b.date) - new Date(a.date));

  const last = items[0];
  if (last.kind === "local") {
    return `local|${last.date}|${last.ev?.id || ""}|${last.ev?.action || ""}|${last.ev?.descripcion || ""}`;
  }
  if (last.kind === "external") {
    return `external|${last.date}|${last.ev?.mailitM_PID || ""}|${last.ev?.eventType || ""}|${last.ev?.office || ""}`;
  }
  return `package|${last.date}|${last.ev?.id || ""}|${last.ev?.ESTADO || ""}|${last.ev?.OBSERVACIONES || ""}`;
}

function getLatestEventPayload(locales = [], externos = [], packages = []) {
  const items = [];
  const localList = Array.isArray(locales) ? locales : [];
  const externalList = Array.isArray(externos) ? externos : [];
  const packageList = Array.isArray(packages) ? packages : [];

  for (const ev of localList) {
    const date = ev?.updated_at || ev?.created_at || null;
    if (date) {
      items.push({
        source: "local",
        eventDate: date,
        eventTitle: ev?.action || "Evento local",
        eventBody: ev?.descripcion || "",
        office: "",
        condition: "",
        nextOffice: "",
      });
    }
  }

  for (const ev of externalList) {
    const date = ev?.eventDate || null;
    if (date) {
      items.push({
        source: "external",
        eventDate: date,
        eventTitle: ev?.eventType || "Evento externo",
        eventBody: "",
        office: ev?.office || "",
        condition: ev?.condition || "",
        nextOffice: ev?.nextOffice || "",
      });
    }
  }

  for (const ev of packageList) {
    const date = ev?.updated_at || ev?.created_at || null;
    if (date) {
      items.push({
        source: "package",
        eventDate: date,
        eventTitle: ev?.ESTADO || "Actualizacion de paquete",
        eventBody: ev?.OBSERVACIONES || "",
        office: "",
        condition: "",
        nextOffice: "",
      });
    }
  }

  if (!items.length) return null;
  items.sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate));
  return items[0];
}

function buildNotificationContent(pkg, latest, sig) {
  const packageName = (pkg?.name || "").trim() || pkg?.code || "Paquete";
  const eventTitle = (latest?.eventTitle || "Actualizacion registrada").trim();

  return {
    title: "Mi PaqueteBO | Actualizacion de envio",
    body: `Paquete: ${packageName}\nCodigo: ${pkg.code}\nEvento: ${eventTitle}`,
    sound: true,
    data: {
      codigo: pkg.code,
      packageName,
      eventSource: latest?.source || "",
      eventDate: latest?.eventDate || "",
      eventTitle: latest?.eventTitle || "",
      eventBody: latest?.eventBody || "",
      office: latest?.office || "",
      condition: latest?.condition || "",
      nextOffice: latest?.nextOffice || "",
      highlightSig: sig || "",
    },
  };
}

async function checkCode(code) {
  const normalized = normalizeTrackingCode(code);
  const valid = validateTrackingCode(normalized);
  if (!valid.ok) return null;

  const res = await fetchTrackingByCode(valid.value, { timeout: 15000, retries: 1 });

  const externos = res.data?.eventos_externos || [];
  const locales = res.data?.eventos_locales || [];
  const packages = res.data?.packages || [];

  const sig = getLatestEventSignature(locales, externos, packages);
  const latest = getLatestEventPayload(locales, externos, packages);
  if (!sig) return null;

  const key = `last_sig_${code}`;
  const prev = await AsyncStorage.getItem(key);

  if (prev === null) {
    await AsyncStorage.setItem(key, sig);
    return null;
  }

  if (prev !== sig) {
    await AsyncStorage.setItem(key, sig);
    return { changed: true, latest, sig };
  }

  return null;
}

TaskManager.defineTask(TASK_NAME, async () => {
  try {
    const saved = await getSavedPackages();
    if (!saved.length) return BackgroundFetch.BackgroundFetchResult.NoData;

    let anyNew = false;

    for (const p of saved) {
      const result = await checkCode(p.code);
      if (result?.changed) {
        anyNew = true;

        await Notifications.scheduleNotificationAsync({
          content: buildNotificationContent(p, result.latest, result.sig),
          trigger: null,
        });
      }
    }

    return anyNew
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (e) {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function runTrackingCheckOnce() {
  try {
    const saved = await getSavedPackages();
    if (!saved.length) return { ok: false, reason: "NO_SAVED" };

    let anyNew = false;

    for (const p of saved) {
      const result = await checkCode(p.code);
      if (result?.changed) {
        anyNew = true;

        await Notifications.scheduleNotificationAsync({
          content: buildNotificationContent(p, result.latest, result.sig),
          trigger: null,
        });
      }
    }

    return { ok: true, anyNew };
  } catch (e) {
    return { ok: false, reason: "ERROR" };
  }
}

export async function registerBackgroundTask() {
  const status = await BackgroundFetch.getStatusAsync();
  if (
    status === BackgroundFetch.BackgroundFetchStatus.Denied ||
    status === BackgroundFetch.BackgroundFetchStatus.Restricted
  ) {
    return false;
  }

  const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
  if (!isRegistered) {
    await BackgroundFetch.registerTaskAsync(TASK_NAME, {
      minimumInterval: 5 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  }

  return true;
}


