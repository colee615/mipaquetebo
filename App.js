import { useEffect, useRef, useState } from "react";
import {
  NavigationContainer,
  createNavigationContainerRef,
  DefaultTheme,
  DarkTheme,
} from "@react-navigation/native";
import {
  StatusBar,
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Linking,
  Platform,
  Alert,
} from "react-native";
import StackNavigator from "./src/navigation/StackNavigator";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { registerForPushToken } from "./src/utils/push";
import { registerBackgroundTask } from "./background";
import { ThemeProvider, useTheme } from "./src/theme/ui";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fetchTrackingByCode } from "./src/services/trackingApi";
import { checkAppUpdate } from "./src/services/updateCheck";
import { normalizeTrackingCode, validateTrackingCode } from "./src/utils/tracking";
import { LanguageProvider, useI18n } from "./src/i18n/ui";

export default function App() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <ThemeProvider>
          <AppRoot />
        </ThemeProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}

function AppRoot() {
  const navigationRef = useRef(createNavigationContainerRef()).current;
  const theme = useTheme();
  const { t } = useI18n();
  const [openingFromNotification, setOpeningFromNotification] = useState(false);
  const [showLegacyNotifPrompt, setShowLegacyNotifPrompt] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const baseTheme = theme.isDark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...baseTheme,
    dark: theme.isDark,
    colors: {
      ...baseTheme.colors,
      primary: theme.colors.primary,
      background: theme.colors.bg,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      notification: theme.colors.primary,
    },
  };

  const responseListener = useRef();
  const LEGACY_NOTIF_PROMPT_SEEN_KEY = "legacy_notif_prompt_seen_v1";

  const hideLegacyPrompt = async () => {
    setShowLegacyNotifPrompt(false);
    try {
      await AsyncStorage.setItem(LEGACY_NOTIF_PROMPT_SEEN_KEY, "1");
    } catch {}
  };

  const openPackageByCode = async (codigo) => {
    const normalized = normalizeTrackingCode(codigo);
    const valid = validateTrackingCode(normalized);
    if (!valid.ok || !navigationRef?.isReady?.()) return;
    setOpeningFromNotification(true);
    try {
      const response = await fetchTrackingByCode(valid.value);
      navigationRef.navigate("Result", { data: response.data });
    } catch {
      setOpeningFromNotification(false);
      return;
    }
    setOpeningFromNotification(false);
  };

  useEffect(() => {
    (async () => {
      try {
        const update = await checkAppUpdate();
        if (update?.shouldShow) setUpdateInfo(update);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (Constants.appOwnership !== "expo") {
        const isLegacyAndroid = Platform.OS === "android" && Number(Platform.Version) < 33;
        const r = await registerForPushToken(() => {});
        if (isLegacyAndroid) {
          const seen = await AsyncStorage.getItem(LEGACY_NOTIF_PROMPT_SEEN_KEY);
          if (!seen) setShowLegacyNotifPrompt(true);
        }
        if (!r.ok) return;
        await registerBackgroundTask();
      }
    })();

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const nData = response?.notification?.request?.content?.data || {};
      const codigo = nData?.codigo;
      if (codigo) openPackageByCode(codigo);
    });

    (async () => {
      const last = await Notifications.getLastNotificationResponseAsync();
      const nData = last?.notification?.request?.content?.data || {};
      const codigo = nData?.codigo;
      if (codigo) openPackageByCode(codigo);
    })();

    return () => {
      if (responseListener.current && typeof responseListener.current.remove === "function")
        responseListener.current.remove();
    };
  }, []);

  return (
    <>
      <StatusBar
        barStyle={theme.isDark ? "light-content" : "dark-content"}
        backgroundColor={theme.colors.bg}
      />
      <NavigationContainer ref={navigationRef} theme={navTheme}>
        <StackNavigator />
      </NavigationContainer>
      {openingFromNotification && (
        <View style={[styles.loaderOverlay, { backgroundColor: theme.isDark ? "rgba(2, 6, 23, 0.6)" : "rgba(255, 255, 255, 0.82)" }]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loaderText, { color: theme.colors.muted }]}>{t("common.loading", "Cargando...")}</Text>
        </View>
      )}
      <Modal
        visible={showLegacyNotifPrompt}
        transparent
        animationType="fade"
        onRequestClose={hideLegacyPrompt}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>{t("app.notif.title", "Activa notificaciones")}</Text>
            <Text style={[styles.modalText, { color: theme.colors.muted }]}>
              {t("app.notif.body", "Para recibir cambios de estado de tus paquetes, habilita las notificaciones en ajustes.")}
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: theme.colors.border }]}
                onPress={hideLegacyPrompt}
              >
                <Text style={[styles.modalBtnText, { color: theme.colors.text }]}>{t("app.notif.later", "Ahora no")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: theme.colors.primary }]}
                onPress={async () => {
                  await hideLegacyPrompt();
                  Linking.openSettings();
                }}
              >
                <Text style={styles.modalBtnPrimaryText}>{t("app.notif.openSettings", "Abrir ajustes")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={!!updateInfo}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (updateInfo?.isForce) return;
          setUpdateInfo(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
              {updateInfo?.title || "Nueva version disponible"}
            </Text>
            <Text style={[styles.modalText, { color: theme.colors.muted }]}>
              {updateInfo?.message || "Hay una nueva version disponible."}
            </Text>
            <Text style={[styles.modalText, { color: theme.colors.muted, marginTop: 0 }]}>
              Version actual: {updateInfo?.currentVersion} | Ultima: {updateInfo?.latestVersion}
            </Text>
            <View style={styles.modalActions}>
              {!updateInfo?.isForce ? (
                <TouchableOpacity
                  style={[styles.modalBtn, { borderColor: theme.colors.border }]}
                  onPress={() => setUpdateInfo(null)}
                >
                  <Text style={[styles.modalBtnText, { color: theme.colors.text }]}>Despues</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: theme.colors.primary }]}
                onPress={async () => {
                  const ok = await Linking.canOpenURL(updateInfo?.storeUrl || "");
                  if (!ok) {
                    Alert.alert("No se pudo abrir la tienda");
                    return;
                  }
                  Linking.openURL(updateInfo.storeUrl);
                }}
              >
                <Text style={styles.modalBtnPrimaryText}>Actualizar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </>
  );
}

const styles = StyleSheet.create({
  loaderOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  loaderText: {
    marginTop: 10,
    fontWeight: "800",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  modalText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  modalBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  modalBtnPrimary: {
    borderWidth: 0,
  },
  modalBtnText: {
    fontSize: 14,
    fontWeight: "800",
  },
  modalBtnPrimaryText: {
    color: "#1F2937",
    fontSize: 14,
    fontWeight: "900",
  },
});

