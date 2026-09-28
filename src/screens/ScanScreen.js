import { View, Text, Modal, StyleSheet, BackHandler, Alert, ScrollView, ActivityIndicator, TouchableOpacity, Pressable, Animated, Easing, Dimensions, KeyboardAvoidingView, Platform, Linking } from "react-native";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CameraView, useCameraPermissions } from "expo-camera";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "../theme/ui";
import { useI18n } from "../i18n/ui";
import { Screen, Card, PrimaryButton, OutlineButton, AppInput, Snackbar, Chip } from "../components/ui";
import { postApiWithRetry } from "../config/api";
import { fetchTrackingByCode } from "../services/trackingApi";
import { normalizeTrackingCodeInput, validateTrackingCode } from "../utils/tracking";
import { getLocalizedApiErrorMessage } from "../utils/apiErrors";
import { useGuideProgress } from "../hooks/useGuideProgress";

export default function ScanScreen({ navigation }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { colors, typography } = theme;
  const { t, language } = useI18n();
  const insets = useSafeAreaInsets();

  const [codigo, setCodigo] = useState("");
  const [permission, requestPermission] = useCameraPermissions();
  const [scanActive, setScanActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState(t("scan.loadingResult", "Loading result..."));
  const [savingPackage, setSavingPackage] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [officialInfoVisible, setOfficialInfoVisible] = useState(false);
  const [packageName, setPackageName] = useState("");
  const [lastScannedCode, setLastScannedCode] = useState("");
  const [guideVisible, setGuideVisible] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const [guideAnchors, setGuideAnchors] = useState({});
  const [guideOffsets, setGuideOffsets] = useState({});
  const [guideCardHeight, setGuideCardHeight] = useState(0);

  const [snack, setSnack] = useState({ visible: false, text: "", type: "info" });
  const showSnack = (text, type = "info") => setSnack({ visible: true, text, type });
  const apiErrorText = (error, overrides = {}) => getLocalizedApiErrorMessage(t, error, overrides);
  const [debugToken, setDebugToken] = useState("");
  const [subscribeStatus, setSubscribeStatus] = useState("");
  const arrowAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef(null);
  const guideMeasureTimer = useRef(null);
  const guideMeasureSeq = useRef(0);
  const heroRef = useRef(null);
  const scanCardRef = useRef(null);
  const inputCardRef = useRef(null);
  const OFFICIAL_SITE_URL = "https://correos.gob.bo/";
  const OFFICIAL_TRACKING_URL = "https://trackingbo.correos.gob.bo:8100/";

  const ENABLE_SUBSCRIBE = true;
  const GUIDE_KEY = "scan_onboarding_seen_v1";
  const GUIDE_STEP_KEY = "scan_onboarding_step_v1";
  const GUIDE_TARGET_Y_OFFSET = 18;
  const GUIDE_SCROLL_TOP_OFFSET = 90;
  const GUIDE_STEPS = useMemo(
    () => [
      {
        title: t("scan.guide.welcome.title", "Welcome to TrackingBo App"),
        text: t("scan.guide.welcome.body", "Here you can scan or type your code to view package tracking."),
        target: "hero",
      },
      {
        title: t("scan.guide.quick.title", "Quick scan"),
        text: t("scan.guide.quick.body", "Use this button to open camera and read the barcode."),
        target: "scan",
      },
      {
        title: t("scan.guide.input.title", "Enter code"),
        text: t("scan.guide.input.body", "You can also type the code manually and search."),
        target: "input",
      },
    ],
    [t]
  );
  const {
    restoreProgress,
    saveStep: saveGuideStep,
    completeGuide,
  } = useGuideProgress({
    seenKey: GUIDE_KEY,
    stepKey: GUIDE_STEP_KEY,
    totalSteps: GUIDE_STEPS.length,
  });

  useEffect(() => {
    const onBackPress = () => {
      if (scanActive) {
        setScanActive(false);
        return true;
      }
      return false;
    };

    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => subscription.remove();
  }, [scanActive]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: !scanActive,
    });
  }, [navigation, scanActive]);

  useEffect(() => {
    (async () => {
      try {
        const t = await AsyncStorage.getItem("fcm_token");
        if (t) setDebugToken(t);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const state = await restoreProgress();
      if (!state.shouldShow) return;
      setGuideStep(state.step);
      setGuideVisible(true);
    })();
  }, [restoreProgress]);

  useEffect(() => {
    if (!guideVisible) return;
    saveGuideStep(guideStep);
  }, [guideStep, guideVisible, saveGuideStep]);

  useEffect(() => {
    if (!guideVisible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(arrowAnim, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(arrowAnim, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [guideVisible, arrowAnim]);

  const measureOne = (ref) =>
    new Promise((resolve) => {
      if (!ref?.current || typeof ref.current.measureInWindow !== "function") {
        resolve(null);
        return;
      }
      ref.current.measureInWindow((x, y, width, height) => {
        if (!width || !height) {
          resolve(null);
          return;
        }
        resolve({ x, y, width, height });
      });
    });

  const measureGuideAnchors = async () => {
    const seq = guideMeasureSeq.current + 1;
    guideMeasureSeq.current = seq;
    const [hero, scan, input] = await Promise.all([
      measureOne(heroRef),
      measureOne(scanCardRef),
      measureOne(inputCardRef),
    ]);

    // Ignore stale async measurements from previous scroll/step positions.
    if (seq !== guideMeasureSeq.current) return;
    const shiftAnchorDown = (a) => (a ? { ...a, y: a.y + GUIDE_TARGET_Y_OFFSET } : null);
    setGuideAnchors({
      hero: shiftAnchorDown(hero),
      scan: shiftAnchorDown(scan),
      input: shiftAnchorDown(input),
    });
  };

  const captureGuideOffset = (key) => (e) => {
    const y = e?.nativeEvent?.layout?.y;
    if (typeof y !== "number") return;
    setGuideOffsets((prev) => ({ ...prev, [key]: y }));
  };

  useEffect(() => {
    if (!guideVisible || scanActive) return;
    const target = GUIDE_STEPS[guideStep]?.target;
    const y = guideOffsets[target];
    if (typeof y === "number" && scrollRef.current?.scrollTo) {
      scrollRef.current.scrollTo({ y: Math.max(0, y - GUIDE_SCROLL_TOP_OFFSET), animated: true });
    }
    const t = setTimeout(() => {
      measureGuideAnchors();
    }, 260);
    const t2 = setTimeout(() => {
      measureGuideAnchors();
    }, 520);
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, [guideVisible, guideStep, scanActive, guideOffsets]);

  const closeGuide = async () => {
    setGuideVisible(false);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    await completeGuide();
  };

  const nextGuideStep = async () => {
    if (guideStep >= GUIDE_STEPS.length - 1) {
      await closeGuide();
      return;
    }
    setGuideStep((prev) => prev + 1);
  };

  const startScan = async () => {
    if (permission?.granted) {
      setScanActive(true);
      return;
    }

    const res = await requestPermission();

    if (res.granted) {
      setScanActive(true);
      return;
    }

    if (!res.canAskAgain) {
      Alert.alert(t("scan.cameraBlockedTitle", "Camera permission blocked"), t("scan.cameraBlockedBody", "Enable camera permission in device settings to scan codes."), [{ text: t("common.understood", "Understood") }]);
      return;
    }

    // Si deniega temporalmente, no mostramos mensaje adicional.
    return;
  };

  const isSaved = async (code) => {
    const existing = await AsyncStorage.getItem("savedPackages");
    const list = existing ? JSON.parse(existing) : [];
    return list.some((p) => p.code === code);
  };

  const openSaveModal = (code) => {
    setLastScannedCode(code);
    setPackageName("");
    setModalVisible(true);
  };

  const closeSaveModal = () => {
    Keyboard.dismiss();
    setModalVisible(false);
  };

  const consultarAPI = async (code) => {
    const validated = validateTrackingCode(code);
    if (!validated.ok) {
      if (validated.reason === "empty") {
        return showSnack(t("scan.enterOrScan", "Enter or scan a code"), "danger");
      }
      return showSnack(t("scan.invalidFormat", "Invalid format. Please verify the entered code"), "danger");
    }
    const value = validated.value;

    setLastScannedCode(value);

    try {
      if (await isSaved(value)) {
        setCodigo("");
        return fetchResult(value);
      }
    } catch (storageError) {
      showSnack(t("scan.storageError", "Saved packages could not be read"), "danger");
      return;
    }

    setLoading(true);
    try {
      const response = await fetchTrackingByCode(value, { language });
      const data = response.data;

      // Some API responses omit `existe_paquete`; treat it as not-found only when explicitly false.
      if (data?.existe_paquete === false) {
        return showSnack(
          typeof data?.message === "string" && data.message.trim()
            ? data.message.trim()
            : t("scan.packageNotFound", "Package not found"),
          "danger"
        );
      }

      setCodigo("");
      openSaveModal(value);
    } catch (e) {
      showSnack(
        apiErrorText(e, { invalidCode: t("scan.invalidOrNotFound", "Invalid or not found code") }),
        "danger"
      );
    } finally {
      setLoading(false);
    }
  };

  const onBarcodeScanned = ({ data }) => {
    setScanActive(false);
    consultarAPI(data);
  };

  const fetchResult = async (code, options = {}) => {
    const validated = validateTrackingCode(code);
    if (!validated.ok) {
      showSnack(t("scan.invalidCode", "Invalid code"), "danger");
      return;
    }
    const nextLoadingText = options.loadingText || t("scan.loadingResult", "Cargando resultado...");
    setLoadingText(nextLoadingText);
    setLoading(true);
    try {
      const response = await fetchTrackingByCode(validated.value, { language });
      setCodigo("");
      navigation.navigate("Result", { data: response.data });
    } catch (e) {
      showSnack(apiErrorText(e), "danger");
    } finally {
      setLoading(false);
    }
  };

  const savePackage = async () => {
    if (savingPackage) return;
    const name = packageName.trim();
    if (!name || !lastScannedCode) return showSnack(t("scan.invalidName", "Invalid name"), "danger");

    setSavingPackage(true);
    try {
      const existing = await AsyncStorage.getItem("savedPackages");
      const list = existing ? JSON.parse(existing) : [];

      if (list.some((p) => p.name?.toLowerCase() === name.toLowerCase())) {
        return showSnack(t("scan.duplicateName", "Duplicate name"), "danger");
      }

      // Show global transition loader immediately after validation.
      setLoadingText(t("scan.redirecting", "Redirigiendo a eventos..."));
      setLoading(true);
      closeSaveModal();

      if (!list.some((p) => p.code === lastScannedCode)) {
        list.push({ code: lastScannedCode, name });
        await AsyncStorage.setItem("savedPackages", JSON.stringify(list));
      }

      if (ENABLE_SUBSCRIBE) {
        try {
          const token = await AsyncStorage.getItem("fcm_token");
          if (token) {
            await postApiWithRetry(
              "/api/subscribe",
              { codigo: lastScannedCode, fcm_token: token, package_name: name },
              { timeout: 10000, retries: 1 }
            );
            setSubscribeStatus(t("scan.subscriptionOk", "Subscription OK"));
          }
        } catch (e) {
          setSubscribeStatus(`${t("scan.subscriptionError", "Subscription error")}: ${e?.message || t("common.unknown", "unknown")}`);
        }
      }

      showSnack(t("scan.savedOk", "Saved successfully"), "success");
      fetchResult(lastScannedCode, { loadingText: t("scan.redirecting", "Redirigiendo a eventos...") });
    } catch (e) {
      setLoading(false);
      showSnack(t("scan.saveFailed", "Could not save the package"), "danger");
    } finally {
      setSavingPackage(false);
    }
  };

  const justViewEvents = () => {
    if (savingPackage) return;
    closeSaveModal();
    fetchResult(lastScannedCode, { loadingText: t("scan.redirecting", "Redirigiendo a eventos...") });
  };

  const onMainScroll = () => {
    if (!guideVisible) return;
    if (guideMeasureTimer.current) clearTimeout(guideMeasureTimer.current);
    guideMeasureTimer.current = setTimeout(() => {
      measureGuideAnchors();
    }, 60);
  };

  const openExternalLink = async (url) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        showSnack(t("common.openLinkError", "No se pudo abrir el enlace"), "danger");
        return;
      }
      await Linking.openURL(url);
    } catch {
      showSnack(t("common.openLinkError", "No se pudo abrir el enlace"), "danger");
    }
  };

  const renderOfficialInfo = () => (
    <View style={[styles.officialBubble, styles.officialModalBubble]}>
      <View style={styles.officialBubbleTail} />
      <View style={styles.officialHeader}>
        <View style={styles.officialIconBubble}>
          <Ionicons name="shield-checkmark" size={19} color={colors.secondary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.officialTitle}>{t("scan.officialInfo.title", "Fuente oficial de consulta")}</Text>
          <Text style={styles.officialKicker}>{t("scan.officialInfo.kicker", "Información verificada")}</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("common.close", "Cerrar")}
          style={styles.officialClose}
          onPress={() => setOfficialInfoVisible(false)}
          hitSlop={10}
        >
          <Ionicons name="close" size={20} color={colors.muted} />
        </TouchableOpacity>
      </View>
      <Text style={styles.officialBody}>
        {t("scan.officialInfo.body", "La informacion mostrada en esta app proviene de los sistemas de seguimiento publicados por Correos de Bolivia.")}
      </Text>
      <View style={styles.officialLinks}>
        <TouchableOpacity style={styles.officialLink} onPress={() => openExternalLink(OFFICIAL_SITE_URL)} activeOpacity={0.82}>
          <View style={styles.officialLinkIcon}>
            <Ionicons name="globe-outline" size={17} color={colors.secondary} />
          </View>
          <View style={styles.officialLinkCopy}>
            <Text style={styles.officialLinkLabel}>{t("scan.officialInfo.sourceLabel", "Sitio oficial")}</Text>
            <Text style={styles.officialLinkUrl} numberOfLines={1}>{t("scan.officialInfo.sourceValue", OFFICIAL_SITE_URL)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={colors.muted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.officialLink} onPress={() => openExternalLink(OFFICIAL_TRACKING_URL)} activeOpacity={0.82}>
          <View style={styles.officialLinkIcon}>
            <Ionicons name="navigate-outline" size={17} color={colors.secondary} />
          </View>
          <View style={styles.officialLinkCopy}>
            <Text style={styles.officialLinkLabel}>{t("scan.officialInfo.trackingLabel", "Seguimiento oficial")}</Text>
            <Text style={styles.officialLinkUrl} numberOfLines={1}>{t("scan.officialInfo.trackingValue", OFFICIAL_TRACKING_URL)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={colors.muted} />
        </TouchableOpacity>
      </View>
      <View style={styles.officialDisclaimer}>
        <Ionicons name="information-circle-outline" size={14} color={colors.muted} />
        <Text style={styles.officialDisclaimerText}>
          {t("scan.officialInfo.disclaimer", "Esta app no representa a una entidad gubernamental distinta de la fuente indicada y solo muestra informacion consultada desde los canales oficiales enlazados.")}
        </Text>
      </View>
    </View>
  );

  return (
    <Screen edges={["left", "right"]}>
      {scanActive ? (
        <View style={{ flex: 1 }}>
          <CameraView
            style={{ flex: 1 }}
            barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "code39"] }}
            onBarcodeScanned={onBarcodeScanned}
          />

          <View pointerEvents="none" style={styles.scanOverlay}>
            <View style={styles.scanTopMask} />

            <View style={styles.scanMiddleRow}>
              <View style={styles.scanSideMask} />
              <View style={styles.scanFrame}>
                <View style={[styles.scanCorner, styles.scanCornerTL]} />
                <View style={[styles.scanCorner, styles.scanCornerTR]} />
                <View style={[styles.scanCorner, styles.scanCornerBL]} />
                <View style={[styles.scanCorner, styles.scanCornerBR]} />
              </View>
              <View style={styles.scanSideMask} />
            </View>

            <View style={styles.scanBottomMask}>
              <Text style={styles.scanHelpText}>
                {t("scan.alignCode", "Align the code within the frame to scan")}</Text>
            </View>
          </View>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        >
        <ScrollView
          ref={scrollRef}
          style={styles.mainScroll}
          onScroll={onMainScroll}
          scrollEventThrottle={16}
          contentContainerStyle={[
            styles.container,
            {
              paddingTop: theme.spacing.lg,
              paddingBottom: theme.spacing.xl,
              flexGrow: 1,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View ref={heroRef} collapsable={false} onLayout={captureGuideOffset("hero")} style={styles.hero}>
            <View style={styles.heroTopRow}>
              <Text style={styles.heroKicker}>TRACKINGBO APP</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t("scan.officialInfo.title", "Fuente oficial de consulta")}
                style={styles.heroInfoButton}
                onPress={() => setOfficialInfoVisible(true)}
                activeOpacity={0.82}
                hitSlop={8}
              >
                <Ionicons name="information-circle-outline" size={21} color={colors.secondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.title}>{t("scan.title", "Rastreo de envíos")}</Text>
            <View style={styles.titleUnderline} />
            <Text style={styles.subtitle}>{t("scan.subtitle", "Consulta con el código o escanea con la cámara.")}</Text>
            <View style={styles.heroRow}>
              <Chip
                text={t("scan.heroPostal", "Correos de Bolivia")}
                color={colors.secondary}
                icon="business-outline"
                style={styles.heroChipPostal}
                textStyle={styles.heroChipText}
              />
              <Chip
                text={t("scan.heroSecure", "Entrega segura")}
                color={colors.secondary}
                icon="shield-checkmark-outline"
                style={styles.heroChipSecure}
                textStyle={styles.heroChipText}
              />
            </View>
          </View>

          <View ref={scanCardRef} collapsable={false} onLayout={captureGuideOffset("scan")}>
            <Card style={styles.scanCard}>
              <View style={styles.sectionIconRow}>
                <View style={styles.sectionIconBubble}>
                  <Ionicons name="scan-outline" size={24} color={colors.secondaryDark} />
                </View>
                <Chip
                  text={t("scan.quick", "Rápido")}
                  color={colors.primaryDark}
                  icon="flash"
                  style={styles.quickChip}
                  textStyle={styles.quickChipText}
                />
              </View>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t("scan.scan", "Escanear")}</Text>
                <Text style={styles.sectionDesc}>{t("scan.scanDesc", "La forma más rápida y segura")}</Text>
              </View>
              <PrimaryButton title={t("scan.scanWithCamera", "Escanear con cámara")} icon="scan" onPress={startScan} />
            </Card>
          </View>

          <View style={styles.orRow}>
            <View style={styles.orLine} />
            <View style={styles.orBadge}>
              <Text style={styles.orText}>{t("scan.or", "o")}</Text>
            </View>
            <View style={styles.orLine} />
          </View>

          <View ref={inputCardRef} collapsable={false} onLayout={captureGuideOffset("input")}>
            <Card style={styles.inputCard}>
              <View style={styles.sectionIconRow}>
                <View style={styles.sectionIconBubble}>
                  <Ionicons name="barcode-outline" size={24} color={colors.secondaryDark} />
                </View>
              </View>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t("scan.enterCode", "Ingresar código")}</Text>
                <Text style={styles.sectionDesc}>{t("scan.enterCodeDesc", "Ingresa tu código de rastreo")}</Text>
              </View>

              <AppInput
                icon="barcode-outline"
                placeholder={t("scan.enterCodePlaceholder", "Ingresa tu código")}
                value={codigo}
                onChangeText={(value) => setCodigo(normalizeTrackingCodeInput(value))}
                autoCapitalize="characters"
                maxLength={50}
                returnKeyType="search"
                onSubmitEditing={() => consultarAPI(codigo)}
              />

              <PrimaryButton
                title={t("scan.consult", "Consultar")}
                icon="search"
                loading={loading}
                onPress={() => consultarAPI(codigo)}
              />
            </Card>
          </View>

          {false ? <View style={styles.officialBubble}>
            <View style={styles.officialBubbleTail} />
            <View style={styles.officialHeader}>
              <View style={styles.officialIconBubble}>
                <Ionicons name="shield-checkmark" size={19} color={colors.secondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.officialTitle}>{t("scan.officialInfo.title", "Fuente oficial de consulta")}</Text>
                <Text style={styles.officialKicker}>{t("scan.officialInfo.kicker", "Información verificada")}</Text>
              </View>
            </View>
            <Text style={styles.officialBody}>
              {t("scan.officialInfo.body", "La informacion mostrada en esta app proviene de los sistemas de seguimiento publicados por Correos de Bolivia.")}
            </Text>
            <View style={styles.officialLinks}>
              <TouchableOpacity style={styles.officialLink} onPress={() => openExternalLink(OFFICIAL_SITE_URL)} activeOpacity={0.82}>
                <View style={styles.officialLinkIcon}>
                  <Ionicons name="globe-outline" size={17} color={colors.secondary} />
                </View>
                <View style={styles.officialLinkCopy}>
                  <Text style={styles.officialLinkLabel}>{t("scan.officialInfo.sourceLabel", "Sitio oficial")}</Text>
                  <Text style={styles.officialLinkUrl} numberOfLines={1}>{t("scan.officialInfo.sourceValue", OFFICIAL_SITE_URL)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={colors.muted} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.officialLink} onPress={() => openExternalLink(OFFICIAL_TRACKING_URL)} activeOpacity={0.82}>
                <View style={styles.officialLinkIcon}>
                  <Ionicons name="navigate-outline" size={17} color={colors.secondary} />
                </View>
                <View style={styles.officialLinkCopy}>
                  <Text style={styles.officialLinkLabel}>{t("scan.officialInfo.trackingLabel", "Seguimiento oficial")}</Text>
                  <Text style={styles.officialLinkUrl} numberOfLines={1}>{t("scan.officialInfo.trackingValue", OFFICIAL_TRACKING_URL)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={colors.muted} />
              </TouchableOpacity>
            </View>
            <View style={styles.officialDisclaimer}>
              <Ionicons name="information-circle-outline" size={14} color={colors.muted} />
              <Text style={styles.officialDisclaimerText}>
                {t("scan.officialInfo.disclaimer", "Esta app no representa a una entidad gubernamental distinta de la fuente indicada y solo muestra informacion consultada desde los canales oficiales enlazados.")}
              </Text>
            </View>
            <View style={styles.officialActions}>
              <OutlineButton
                title={t("scan.officialInfo.openSource", "Abrir fuente oficial")}
                icon="open-outline"
                style={styles.officialAction}
                onPress={() => openExternalLink(OFFICIAL_SITE_URL)}
              />
              <OutlineButton
                title={t("scan.officialInfo.openTracking", "Abrir seguimiento oficial")}
                icon="globe-outline"
                style={styles.officialAction}
                onPress={() => openExternalLink(OFFICIAL_TRACKING_URL)}
              />
            </View>
          </View> : null}

          {__DEV__ && !!debugToken && (
            <View style={styles.debugBox}>
              <Text style={styles.debugTitle}>FCM Token</Text>
              <Text selectable style={styles.debugText}>
                {debugToken}
              </Text>
            </View>
          )}
          {__DEV__ && !!subscribeStatus && subscribeStatus !== t("scan.noFcmToken", "No FCM token") && (
            <View style={styles.debugBox}>
              <Text style={styles.debugTitle}>{t("scan.subscription", "Subscription")}</Text>
              <Text style={styles.debugText}>{subscribeStatus}</Text>
            </View>
          )}
        </ScrollView>
        </KeyboardAvoidingView>
      )}

      <Modal
        visible={modalVisible}
        transparent
        animationType={Platform.OS === "ios" ? "fade" : "none"}
        hardwareAccelerated={Platform.OS === "android"}
        statusBarTranslucent={Platform.OS === "android"}
        navigationBarTranslucent={Platform.OS === "android"}
        presentationStyle="overFullScreen"
        onRequestClose={closeSaveModal}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            style={styles.modalKeyboardArea}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={[
                styles.modalScrollContent,
                { paddingTop: 20 + insets.top, paddingBottom: 20 + insets.bottom },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              removeClippedSubviews={false}
            >
              <View collapsable={false} renderToHardwareTextureAndroid={Platform.OS === "android"}>
                <Card style={styles.saveModalCard}>
                  <Text style={typography.h2}>{t("scan.modal.addName", "Add name")}</Text>
                  <Text style={[typography.p, { marginTop: 6, marginBottom: 10 }]}>
                    {t("scan.modal.code", "Code")}: <Text style={{ fontWeight: "900" }}>{lastScannedCode}</Text>
                  </Text>

                  <View style={{ marginBottom: 12 }}>
                    <Chip text={t("scan.modal.events", "Tracking events")} color={colors.primary} icon="trail-sign-outline" />
                  </View>

                  <AppInput
                    icon="create-outline"
                    placeholder={t("scan.modal.namePlaceholder", "e.g. Package- Earbuds")}
                    value={packageName}
                    onChangeText={setPackageName}
                    returnKeyType="done"
                    editable={!savingPackage}
                  />

                  <PrimaryButton
                    title={t("scan.modal.saveAndView", "Save and view events")}
                    icon="save"
                    onPress={savePackage}
                  />
                  <OutlineButton
                    title={t("scan.modal.viewOnly", "View events only")}
                    icon="eye"
                    onPress={() => {
                      if (savingPackage) return;
                      justViewEvents();
                    }}
                  />
                  <OutlineButton
                    title={t("common.cancel", "Cancel")}
                    icon="close"
                    onPress={() => {
                      if (savingPackage) return;
                      closeSaveModal();
                    }}
                  />
                </Card>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        visible={officialInfoVisible}
        transparent
        animationType="fade"
        statusBarTranslucent={Platform.OS === "android"}
        presentationStyle="overFullScreen"
        onRequestClose={() => setOfficialInfoVisible(false)}
      >
        <View style={styles.officialModalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityLabel={t("common.close", "Cerrar")}
            onPress={() => setOfficialInfoVisible(false)}
          />
          <ScrollView
            style={styles.officialModalScroll}
            contentContainerStyle={styles.officialModalScrollContent}
            showsVerticalScrollIndicator={false}
            bounces
            keyboardShouldPersistTaps="handled"
          >
            {renderOfficialInfo()}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={guideVisible} transparent animationType="fade" onRequestClose={closeGuide}>
        <View style={styles.coachOverlay}>
          {(() => {
            const step = GUIDE_STEPS[guideStep];
            const anchor = guideAnchors[step.target];
            const win = Dimensions.get("window");
            const verticalPadding = 12;
            const cardWidth = Math.min(280, win.width - 28);
            const maxCardHeight = Math.max(
              220,
              win.height - (insets.top + insets.bottom + verticalPadding * 2)
            );
            const centerX = anchor ? anchor.x + anchor.width / 2 : win.width / 2;
            const left = Math.max(12, Math.min(centerX - cardWidth / 2, win.width - cardWidth - 12));
            const fallbackCardHeight = Math.min(maxCardHeight, 340);
            const effectiveCardHeight = Math.min(maxCardHeight, guideCardHeight || fallbackCardHeight);
            const minTop = insets.top + verticalPadding;
            const maxTop = win.height - insets.bottom - verticalPadding - effectiveCardHeight;
            const gap = 12;
            const anchorTop = anchor?.y ?? 0;
            const anchorBottom = anchor ? anchor.y + anchor.height : 0;
            const candidateTop = (placeBelow) => {
              const rawTop = placeBelow ? anchorBottom + gap : anchorTop - effectiveCardHeight - gap;
              return Math.max(minTop, Math.min(rawTop, maxTop));
            };
            const overlapWithAnchor = (top) => {
              if (!anchor) return 0;
              const cardBottom = top + effectiveCardHeight;
              const overlapTop = Math.max(top, anchorTop);
              const overlapBottom = Math.min(cardBottom, anchorBottom);
              return Math.max(0, overlapBottom - overlapTop);
            };
            const spaceBelow = anchor ? win.height - insets.bottom - verticalPadding - (anchorBottom + gap) : 0;
            const spaceAbove = anchor ? anchorTop - (insets.top + verticalPadding + gap) : 0;
            const preferBelow = anchor ? spaceBelow >= spaceAbove : true;
            const belowTop = anchor ? candidateTop(true) : insets.top + 80;
            const aboveTop = anchor ? candidateTop(false) : insets.top + 80;
            const canPlaceBelow = anchor ? anchorBottom + gap <= maxTop : true;
            const canPlaceAbove = anchor ? anchorTop - effectiveCardHeight - gap >= minTop : true;
            const belowOverlap = overlapWithAnchor(belowTop);
            const aboveOverlap = overlapWithAnchor(aboveTop);
            const placeBelow = anchor
              ? canPlaceBelow && !canPlaceAbove
                ? true
                : canPlaceAbove && !canPlaceBelow
                ? false
                : canPlaceAbove && canPlaceBelow
                ? preferBelow
                : belowOverlap === aboveOverlap
                ? preferBelow
                : belowOverlap < aboveOverlap
              : true;
            const cardTop = placeBelow ? belowTop : aboveTop;
            const arrowBounce = arrowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 8] });

            return (
              <>
                {anchor ? (
                  <View
                    style={[
                      styles.coachHighlight,
                      {
                        left: anchor.x - 6,
                        top: anchor.y - 6,
                        width: anchor.width + 12,
                        height: anchor.height + 12,
                        borderColor: colors.primary,
                      },
                    ]}
                  />
                ) : null}

                {anchor ? (
                  <Animated.View
                    style={[
                        styles.coachArrowWrap,
                        {
                          left: centerX - 16,
                          top: placeBelow ? anchor.y + anchor.height - 6 : anchor.y - 28,
                          transform: [{ translateY: arrowBounce }],
                        },
                      ]}
                    >
                      <Ionicons
                        name={placeBelow ? "arrow-down-circle" : "arrow-up-circle"}
                        size={32}
                        color={colors.primary}
                      />
                  </Animated.View>
                ) : null}

                <View
                  onLayout={(e) => {
                    const h = e?.nativeEvent?.layout?.height;
                    if (!h) return;
                    setGuideCardHeight((prev) => (Math.abs(prev - h) > 4 ? h : prev));
                  }}
                  style={[
                    styles.coachCard,
                    {
                      width: cardWidth,
                      maxHeight: maxCardHeight,
                      left,
                      top: cardTop,
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <ScrollView
                    contentContainerStyle={styles.coachContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    <View style={styles.coachHeaderRow}>
                      <View style={[styles.coachBadge, { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}55` }]}>
                        <Ionicons name="sparkles-outline" size={14} color={colors.primary} />
                        <Text style={[styles.coachBadgeText, { color: colors.primary }]}>{t("scan.guide.badge", "Interactive guide")}</Text>
                      </View>
                      <Text style={[styles.coachStepText, { color: colors.muted }]}>
                        {guideStep + 1}/{GUIDE_STEPS.length}
                      </Text>
                    </View>

                    <Text style={[styles.coachTitle, { color: colors.text }]}>{step.title}</Text>
                    <Text style={[styles.coachBody, { color: colors.muted }]}>{step.text}</Text>

                    <View style={styles.coachProgressRow}>
                      {GUIDE_STEPS.map((_, idx) => (
                        <View
                          key={`g-dot-${idx}`}
                          style={[
                            styles.coachProgressDot,
                            {
                              backgroundColor: idx <= guideStep ? colors.primary : `${colors.border}`,
                              opacity: idx <= guideStep ? 1 : 0.9,
                            },
                          ]}
                        />
                      ))}
                    </View>

                    <PrimaryButton
                      title={guideStep === GUIDE_STEPS.length - 1 ? t("scan.guide.start", "Start") : t("scan.guide.next", "Next")}
                      icon={guideStep === GUIDE_STEPS.length - 1 ? "checkmark" : "arrow-forward"}
                      onPress={nextGuideStep}
                      style={{ marginTop: 4 }}
                    />
                    <OutlineButton title={t("scan.guide.skip", "Skip guide")} icon="close" onPress={closeGuide} />
                  </ScrollView>
                </View>
              </>
            );
          })()}
        </View>
      </Modal>

      <Snackbar
        visible={snack.visible}
        text={snack.text}
        type={snack.type}
        onHide={() => setSnack((s) => ({ ...s, visible: false }))}
      />

      {loading && (
        <View style={styles.loaderOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loaderText}>{loadingText}</Text>
        </View>
      )}
    </Screen>
  );
}

const createStyles = (t) =>
  StyleSheet.create({
    container: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingBottom: t.spacing.xl,
    },
    mainScroll: {
      flex: 1,
    },
    hero: {
      marginBottom: t.spacing.lg,
      paddingVertical: 4,
    },
    heroTopRow: {
      minHeight: 28,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    heroKicker: {
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1.2,
      color: t.colors.muted,
      marginBottom: 4,
    },
    heroInfoButton: {
      width: 34,
      height: 34,
      marginBottom: 4,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.isDark ? "rgba(254, 204, 54, 0.14)" : "rgba(255,255,255,0.72)",
      borderWidth: 1,
      borderColor: `${t.colors.primary}66`,
    },
    title: {
      ...t.typography.h1,
      fontSize: 30,
      marginTop: -4,
      color: t.colors.secondaryDark,
      lineHeight: 34,
    },
    titleUnderline: {
      width: 42,
      height: 4,
      marginTop: 4,
      borderRadius: 4,
      backgroundColor: t.colors.primary,
    },
    subtitle: {
      ...t.typography.p,
      marginTop: 6,
      maxWidth: 360,
      color: t.isDark ? t.colors.muted : "#1F2937",
    },
    heroRow: {
      marginTop: t.spacing.sm,
      flexDirection: "row",
      gap: 6,
      flexWrap: "wrap",
    },
    heroChipPostal: {
      flex: 1,
      minWidth: 0,
      justifyContent: "center",
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: t.isDark ? "rgba(254, 204, 54, 0.2)" : "#FFF0B0",
      borderColor: t.isDark ? "rgba(254, 204, 54, 0.4)" : "#FFE080",
    },
    heroChipSecure: {
      flex: 1,
      minWidth: 0,
      justifyContent: "center",
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: t.isDark ? "rgba(87, 139, 211, 0.22)" : "#E7F0FF",
      borderColor: t.isDark ? "rgba(87, 139, 211, 0.42)" : "#D0E1FA",
    },
    heroChipText: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.15,
    },
    scanCard: {
      marginBottom: t.spacing.md,
      padding: 16,
      borderRadius: 22,
      backgroundColor: t.isDark ? "rgba(23, 33, 51, 0.94)" : "rgba(255,255,255,0.94)",
      borderColor: t.isDark ? t.colors.border : "rgba(218, 229, 244, 0.9)",
      borderTopWidth: 1,
    },
    inputCard: {
      marginTop: t.spacing.sm,
      padding: 16,
      borderRadius: 22,
      backgroundColor: t.isDark ? "rgba(23, 33, 51, 0.94)" : "rgba(255,255,255,0.94)",
      borderColor: t.isDark ? t.colors.border : "rgba(218, 229, 244, 0.9)",
      borderTopWidth: 1,
    },
    sectionIconRow: {
      minHeight: 38,
      position: "absolute",
      top: 16,
      left: 16,
      right: 16,
      zIndex: 2,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    sectionIconBubble: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.isDark ? "rgba(67, 114, 190, 0.28)" : "#EAF2FF",
      borderWidth: 1,
      borderColor: t.isDark ? "rgba(110, 160, 232, 0.4)" : "#D8E7FB",
    },
    quickChip: {
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    quickChipText: {
      fontSize: 9,
      letterSpacing: 0.2,
    },
    sectionHeader: {
      minHeight: 40,
      marginLeft: 52,
      marginBottom: t.spacing.sm,
      justifyContent: "center",
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: "900",
      color: t.colors.secondaryDark,
      letterSpacing: 0.1,
    },
    sectionDesc: {
      marginTop: 4,
      color: t.colors.muted,
      fontWeight: "700",
    },
    orRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginVertical: t.spacing.sm,
    },
    orBadge: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.isDark ? "rgba(23, 33, 51, 0.94)" : "rgba(255,255,255,0.95)",
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    orLine: {
      flex: 1,
      height: 1,
      backgroundColor: t.colors.border,
    },
    orText: {
      color: t.colors.muted,
      fontWeight: "800",
    },
    officialModalOverlay: {
      flex: 1,
      paddingHorizontal: 18,
      paddingVertical: 24,
      backgroundColor: t.colors.overlay,
      justifyContent: "center",
      alignItems: "center",
    },
    officialModalScroll: {
      width: "100%",
      flexGrow: 0,
      flexShrink: 1,
      maxHeight: "92%",
    },
    officialModalScrollContent: {
      paddingVertical: 4,
    },
    officialModalBubble: {
      width: "100%",
      maxWidth: 440,
      alignSelf: "center",
      marginTop: 0,
    },
    officialClose: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.isDark ? "rgba(255,255,255,0.08)" : "rgba(18, 52, 93, 0.06)",
    },
    officialBubble: {
      position: "relative",
      marginTop: t.spacing.lg,
      padding: 18,
      borderRadius: 24,
      backgroundColor: t.isDark ? "#172133" : "rgba(255,255,255,0.96)",
      borderWidth: 1,
      borderColor: t.isDark ? "#2A3A52" : "rgba(160, 186, 218, 0.72)",
      ...t.shadow,
    },
    officialBubbleTail: {
      position: "absolute",
      top: -9,
      left: 32,
      width: 18,
      height: 18,
      backgroundColor: t.isDark ? "#172133" : "rgba(255,255,255,0.96)",
      borderLeftWidth: 1,
      borderTopWidth: 1,
      borderColor: t.isDark ? "#2A3A52" : "rgba(160, 186, 218, 0.72)",
      transform: [{ rotate: "45deg" }],
    },
    officialHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 14,
    },
    officialIconBubble: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${t.colors.primary}2B`,
      borderWidth: 1,
      borderColor: `${t.colors.primary}66`,
    },
    officialTitle: {
      fontSize: 16,
      fontWeight: "900",
      color: t.colors.text,
    },
    officialKicker: {
      marginTop: 2,
      color: t.colors.muted,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.3,
    },
    officialBody: {
      color: t.colors.text,
      lineHeight: 20,
      fontWeight: "600",
    },
    officialLinks: {
      marginTop: 14,
      gap: 8,
    },
    officialLink: {
      minHeight: 58,
      paddingHorizontal: 10,
      paddingVertical: 9,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.isDark ? "rgba(15, 23, 42, 0.48)" : "rgba(241, 246, 253, 0.84)",
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    officialLinkIcon: {
      width: 31,
      height: 31,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${t.colors.primary}22`,
    },
    officialLinkCopy: {
      flex: 1,
      minWidth: 0,
    },
    officialLinkLabel: {
      color: t.colors.text,
      fontSize: 12,
      fontWeight: "900",
    },
    officialLinkUrl: {
      marginTop: 2,
      color: t.colors.muted,
      fontSize: 11,
      fontWeight: "700",
    },
    officialDisclaimer: {
      marginTop: 12,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 7,
    },
    officialDisclaimerText: {
      flex: 1,
      color: t.colors.muted,
      lineHeight: 18,
      fontSize: 12,
      fontWeight: "600",
    },
    debugBox: {
      marginTop: t.spacing.md,
      padding: t.spacing.md,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.isDark ? "rgba(15, 23, 42, 0.7)" : "rgba(255,255,255,0.7)",
    },
    debugTitle: {
      fontWeight: "800",
      color: t.colors.muted,
      marginBottom: 6,
      fontSize: 12,
    },
    debugText: {
      color: t.colors.text,
      fontSize: 11,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: t.colors.overlay,
    },
    modalKeyboardArea: {
      flex: 1,
    },
    modalScroll: {
      flex: 1,
    },
    modalScrollContent: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: 20,
    },
    saveModalCard: {
      width: "100%",
      maxWidth: 420,
      alignSelf: "center",
      backgroundColor: t.colors.surface,
    },
    loaderOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: t.isDark ? "rgba(2, 6, 23, 0.55)" : "rgba(255, 255, 255, 0.78)",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 99,
    },
    loaderText: {
      marginTop: 10,
      color: t.colors.muted,
      fontWeight: "800",
    },
    scanOverlay: {
      ...StyleSheet.absoluteFillObject,
    },
    scanTopMask: {
      flex: 1,
      backgroundColor: "rgba(2, 6, 23, 0.55)",
    },
    scanMiddleRow: {
      height: 240,
      flexDirection: "row",
    },
    scanSideMask: {
      flex: 1,
      backgroundColor: "rgba(2, 6, 23, 0.55)",
    },
    scanFrame: {
      width: 280,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: "rgba(220, 235, 255, 0.55)",
      backgroundColor: "transparent",
      position: "relative",
    },
    scanCorner: {
      position: "absolute",
      width: 28,
      height: 28,
      borderColor: t.colors.warning,
    },
    scanCornerTL: {
      top: 10,
      left: 10,
      borderTopWidth: 4,
      borderLeftWidth: 4,
      borderTopLeftRadius: 10,
    },
    scanCornerTR: {
      top: 10,
      right: 10,
      borderTopWidth: 4,
      borderRightWidth: 4,
      borderTopRightRadius: 10,
    },
    scanCornerBL: {
      bottom: 10,
      left: 10,
      borderBottomWidth: 4,
      borderLeftWidth: 4,
      borderBottomLeftRadius: 10,
    },
    scanCornerBR: {
      bottom: 10,
      right: 10,
      borderBottomWidth: 4,
      borderRightWidth: 4,
      borderBottomRightRadius: 10,
    },
    scanBottomMask: {
      flex: 1,
      backgroundColor: "rgba(2, 6, 23, 0.55)",
      alignItems: "center",
      paddingTop: 16,
      paddingHorizontal: 24,
    },
    scanHelpText: {
      color: "#EAF2FF",
      fontWeight: "800",
      textAlign: "center",
      fontSize: 14,
    },
    coachOverlay: {
      flex: 1,
      backgroundColor: "rgba(2, 6, 23, 0.55)",
    },
    coachHighlight: {
      position: "absolute",
      borderWidth: 2,
      borderRadius: 16,
      backgroundColor: "transparent",
    },
    coachArrowWrap: {
      position: "absolute",
      zIndex: 3,
    },
    coachCard: {
      position: "absolute",
      borderWidth: 1,
      borderRadius: 14,
      zIndex: 2,
      shadowColor: "#000",
      shadowOpacity: 0.24,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
      elevation: 10,
    },
    coachContent: {
      padding: 12,
    },
    coachHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
      gap: 8,
    },
    coachBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderRadius: 999,
      paddingVertical: 5,
      paddingHorizontal: 10,
    },
    coachBadgeText: {
      fontWeight: "900",
      fontSize: 12,
    },
    coachStepText: {
      fontWeight: "800",
      fontSize: 12,
    },
    coachTitle: {
      fontSize: 16,
      fontWeight: "900",
      lineHeight: 20,
    },
    coachBody: {
      marginTop: 6,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: "700",
    },
    coachProgressRow: {
      marginTop: 12,
      marginBottom: 8,
      flexDirection: "row",
      gap: 6,
      alignItems: "center",
    },
    coachProgressDot: {
      flex: 1,
      height: 4,
      borderRadius: 999,
    },
  });











