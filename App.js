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
  Image,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Linking,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import StackNavigator from "./src/navigation/StackNavigator";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { registerForPushToken } from "./src/utils/push";
import { registerBackgroundTask } from "./background";
import { ThemeProvider, useTheme } from "./src/theme/ui";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchTrackingByCode } from "./src/services/trackingApi";
import { checkAppUpdate } from "./src/services/updateCheck";
import { runStorageMigrations } from "./src/services/storageMigration";
import { normalizeTrackingCode, validateTrackingCode } from "./src/utils/tracking";
import { LanguageProvider, useI18n } from "./src/i18n/ui";
import { getLocalizedApiErrorMessage } from "./src/utils/apiErrors";

const APP_BACKGROUND = require("./assets/fondo_inicio.png");

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
  const [startupReady, setStartupReady] = useState(false);
  const [currentRouteName, setCurrentRouteName] = useState("Loading");
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
  const showBottomNav = startupReady && ["Scan", "SavedPackages", "PackagesLocalExternal"].includes(currentRouteName);

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
    } catch (error) {
      setOpeningFromNotification(false);
      Alert.alert(t("api.errorTitle", "No se pudo consultar"), getLocalizedApiErrorMessage(t, error));
      return;
    }
    setOpeningFromNotification(false);
  };

  useEffect(() => {
    (async () => {
      try {
        const appVersion = String(Constants?.expoConfig?.version || "0.0.0");
        await runStorageMigrations(appVersion);
        const update = await checkAppUpdate();
        if (update?.shouldShow) setUpdateInfo(update);
      } catch {}
      setStartupReady(true);
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
      {startupReady ? (
        <View style={styles.appShell}>
          <NavigationContainer
            ref={navigationRef}
            theme={navTheme}
            onReady={() => setCurrentRouteName(navigationRef.getCurrentRoute()?.name || "Loading")}
            onStateChange={() => setCurrentRouteName(navigationRef.getCurrentRoute()?.name || "Loading")}
          >
            <StackNavigator />
          </NavigationContainer>
          {showBottomNav ? (
            <BottomNav
              navigationRef={navigationRef}
              currentRouteName={currentRouteName}
              theme={theme}
              t={t}
            />
          ) : null}
        </View>
      ) : (
        <View
          style={[
            styles.loaderOverlay,
            {
              backgroundColor: "#FECC36",
            },
          ]}
        >
          <Image source={APP_BACKGROUND} style={styles.startupBackground} resizeMode="contain" />
          <View style={styles.startupShade} />
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loaderText, { color: theme.colors.muted }]}>
            Preparando datos de la aplicacion...
          </Text>
        </View>
      )}
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

function BottomNav({ navigationRef, currentRouteName, theme, t }) {
  const insets = useSafeAreaInsets();
  const items = [
    { route: "Scan", label: t("nav.home", "Inicio"), icon: "home", iconOutline: "home-outline" },
    { route: "SavedPackages", label: t("nav.pendingTab", "Mis pendientes"), icon: "bookmark", iconOutline: "bookmark-outline" },
    { route: "PackagesLocalExternal", label: t("nav.deliveredTab", "Entregados"), icon: "cube", iconOutline: "cube-outline" },
  ];

  return (
    <View
      style={[
        styles.bottomNav,
        {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          paddingBottom: Math.max(insets.bottom, 8),
        },
      ]}
    >
      <View style={styles.bottomNavInner}>
        {items.map((item) => {
          const active = currentRouteName === item.route;
          return (
            <TouchableOpacity
              key={item.route}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={item.label}
              onPress={() => {
                if (navigationRef.isReady()) navigationRef.navigate(item.route);
              }}
              style={styles.bottomNavItem}
            >
              <Ionicons
                name={active ? item.icon : item.iconOutline}
                size={21}
                color={active ? theme.colors.secondary : theme.colors.muted}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.bottomNavLabel,
                  { color: active ? theme.colors.secondary : theme.colors.muted },
                ]}
              >
                {item.label}
              </Text>
              {active ? <View style={[styles.bottomNavActiveMark, { backgroundColor: theme.colors.primary }]} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
  },
  bottomNav: {
    borderTopWidth: 1,
    paddingTop: 6,
    paddingHorizontal: 8,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: -3 },
    shadowRadius: 10,
    elevation: 8,
  },
  bottomNavInner: {
    height: 58,
    flexDirection: "row",
    alignItems: "stretch",
  },
  bottomNavItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    position: "relative",
    paddingHorizontal: 4,
  },
  bottomNavLabel: {
    fontSize: 11,
    fontWeight: "800",
  },
  bottomNavActiveMark: {
    position: "absolute",
    bottom: 0,
    width: 30,
    height: 3,
    borderRadius: 3,
  },
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
  startupBackground: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  startupShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
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

