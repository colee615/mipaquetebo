import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export async function registerForPushToken(debugLog = () => {}) {
  try {
    if (Constants.appOwnership === "expo") {
      debugLog("Expo Go: push remoto no soportado");
      return { ok: false, reason: "EXPO_GO", token: null };
    }

    debugLog("Verificando dispositivo fisico...");
    if (!Device.isDevice) {
      debugLog("No es dispositivo real");
      return { ok: false, reason: "NO_DEVICE", token: null };
    }

    debugLog("Configurando canal Android...");
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    debugLog("Verificando permisos...");
    const perm = await Notifications.getPermissionsAsync();
    let status = perm.status;

    if (status !== "granted") {
      debugLog("Permiso no concedido. Solicitando...");
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }

    if (status !== "granted") {
      debugLog("Permiso DENEGADO");
      return { ok: false, reason: "PERMISSION_DENIED", token: null };
    }

    debugLog("Solicitando token de dispositivo (FCM en Android)...");
    const tokenRes = await Notifications.getDevicePushTokenAsync();

    const token = tokenRes?.data;
    debugLog("TOKEN RAW: " + token);
    if (tokenRes?.type) {
      debugLog("TOKEN TYPE: " + tokenRes.type);
    }
    if (Platform.OS !== "android") {
      debugLog("NOTE: iOS uses APNs token (not FCM)");
    }

    if (!token) {
      debugLog("Token vacio");
      return { ok: false, reason: "NO_TOKEN", token: null };
    }

    if (token.startsWith("ExponentPushToken")) {
      debugLog("TOKEN DE EXPO GO DETECTADO");
    }

    if (token.startsWith("ExpoPushToken")) {
      debugLog("TOKEN VALIDO PARA PUSH REAL");
    }

    try {
      await AsyncStorage.setItem("fcm_token", token);
    } catch {}

    return { ok: true, reason: "OK", token };
  } catch (e) {
    debugLog("ERROR: " + (e?.message || "desconocido"));
    return { ok: false, reason: "EXCEPTION", token: null };
  }
}
