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

function getTrackingEvents(payload) {
  const first = Array.isArray(payload?.resultado) ? payload.resultado[0] : null;
  return Array.isArray(first?.eventos) ? first.eventos : [];
}

function getLatestEvent(events = []) {
  const list = Array.isArray(events) ? [...events] : [];
  if (!list.length) return null;
  list.sort((a, b) => {
    const left = typeof b?._sort_ts === "number" ? b._sort_ts * 1000 : new Date(b?.created_at || 0).getTime();
    const right = typeof a?._sort_ts === "number" ? a._sort_ts * 1000 : new Date(a?.created_at || 0).getTime();
    return left - right;
  });
  return list[0] || null;
}

function getLatestEventSignature(events = []) {
  const latest = getLatestEvent(events);
  if (!latest) return null;
  return [
    latest?.codigo || "",
    latest?.created_at || "",
    latest?.nombre_evento || "",
    latest?.office || "",
    latest?.next_office || "",
  ].join("|");
}

function buildNotificationContent(pkg, latest, sig) {
  const packageName = (pkg?.name || "").trim() || pkg?.code || "Paquete";
  const eventTitle = String(latest?.nombre_evento || "Actualizacion registrada").trim();

  return {
    title: "TrackingBo App | Actualizacion de envio",
    body: `Paquete: ${packageName}\nCodigo: ${pkg.code}\nEvento: ${eventTitle}`,
    sound: true,
    data: {
      codigo: pkg.code,
      packageName,
      eventDate: latest?.created_at || "",
      eventTitle,
      office: latest?.office || "",
      nextOffice: latest?.next_office || "",
      highlightSig: sig || "",
    },
  };
}

async function checkCode(code) {
  const normalized = normalizeTrackingCode(code);
  const valid = validateTrackingCode(normalized);
  if (!valid.ok) return null;

  const res = await fetchTrackingByCode(valid.value, { timeout: 15000, retries: 1 });
  if (!res?.data?.existe_paquete) return null;

  const events = getTrackingEvents(res.data);
  const sig = getLatestEventSignature(events);
  const latest = getLatestEvent(events);
  if (!sig || !latest) return null;

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

    return anyNew ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
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
  } catch {
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
