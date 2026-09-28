import { useEffect, useMemo, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing, Image, useWindowDimensions } from "react-native";
import { Asset } from "expo-asset";
import { useTheme } from "../theme/ui";
import { useI18n } from "../i18n/ui";

const APP_LOGO = require("../../assets/logoincio-transparent.png");
const APP_BACKGROUND = require("../../assets/fondo_inicio.png");
const BACKGROUND_WIDTH = 720;
const BACKGROUND_HEIGHT = 1280;

export default function LoadingScreen({ navigation }) {
  const theme = useTheme();
  const { t } = useI18n();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const styles = useMemo(() => createStyles(theme), [theme.isDark]);
  const bar = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const halo = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Warm up local assets to reduce first paint delay on Android.
    Asset.fromModule(APP_LOGO).downloadAsync().catch(() => {});
    Asset.fromModule(APP_BACKGROUND).downloadAsync().catch(() => {});
  }, []);

  useEffect(() => {
    const shimmerAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    const haloAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(halo, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(halo, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    shimmerAnim.start();
    haloAnim.start();
    Animated.timing(bar, {
      toValue: 1,
      duration: 2200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    const navigationTimer = setTimeout(() => {
      navigation.replace("Scan");
    }, 2250);

    return () => {
      shimmerAnim.stop();
      haloAnim.stop();
      clearTimeout(navigationTimer);
    };
  }, [bar, navigation, shimmer, halo]);

  const barWidth = bar.interpolate({ inputRange: [0, 1], outputRange: ["18%", "100%"] });
  const shimmerTranslate = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-80, 180] });
  const haloScale = halo.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.06] });
  const haloOpacity = halo.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.12] });
  // Slightly enlarge the artwork while keeping the original portrait proportion.
  const backgroundScale = Math.min(viewportWidth / BACKGROUND_WIDTH, viewportHeight / BACKGROUND_HEIGHT) * 1.06;
  const backgroundImageStyle = {
    width: BACKGROUND_WIDTH * backgroundScale,
    height: BACKGROUND_HEIGHT * backgroundScale,
    left: (viewportWidth - BACKGROUND_WIDTH * backgroundScale) / 2,
    top: (viewportHeight - BACKGROUND_HEIGHT * backgroundScale) / 2,
  };

  return (
    <View style={styles.root}>
      <Image source={APP_BACKGROUND} style={[styles.backgroundImage, backgroundImageStyle]} resizeMode="stretch" fadeDuration={0} />
      <View style={styles.backgroundShade} />

      <View style={[styles.centerPanel, { marginTop: Math.max(46, Math.round(viewportHeight * 0.18)) }]}>
        <View style={styles.logoWrap}>
          <Animated.View style={[styles.logoHalo, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]} />
          <Image
            source={APP_LOGO}
            style={styles.logoImage}
            resizeMode="contain"
            fadeDuration={0}
            progressiveRenderingEnabled={false}
          />
        </View>

        <View style={styles.loadingStatus}>
          <Text style={styles.connectingText}>{t("loading.preparing", "Conectando\nBolivia siempre")}</Text>
          <View style={styles.barTrack}>
            <Animated.View style={[styles.barFill, { width: barWidth }]} />
            <Animated.View style={[styles.barShimmer, { transform: [{ translateX: shimmerTranslate }] }]} />
          </View>
          <Text style={styles.caption}>{t("common.loading", "Cargando...")}</Text>
        </View>
      </View>
    </View>
  );
}

const createStyles = (t) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: "#FECC36",
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "flex-start",
      paddingHorizontal: t.spacing.xl,
    },
    backgroundImage: {
      position: "absolute",
    },
    backgroundShade: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(255, 255, 255, 0.08)",
    },
    topAccent: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 4,
      backgroundColor: t.colors.primary,
      opacity: 0.9,
    },
    bgOrb: {
      position: "absolute",
      borderRadius: 999,
    },
    bgOrbPrimary: {
      width: 260,
      height: 260,
      right: -90,
      top: 70,
      backgroundColor: t.isDark ? "rgba(254, 204, 54, 0.08)" : "rgba(254, 204, 54, 0.12)",
    },
    bgOrbSoft: {
      width: 220,
      height: 220,
      left: -110,
      bottom: 120,
      backgroundColor: t.isDark ? "rgba(148, 163, 184, 0.1)" : "rgba(203, 213, 225, 0.18)",
    },
    backdropBand: {
      position: "absolute",
      top: 64,
      left: 0,
      right: 0,
      height: 46,
      backgroundColor: t.isDark ? "rgba(254, 204, 54, 0.04)" : "rgba(254, 204, 54, 0.06)",
    },
    centerPanel: {
      width: "100%",
      maxWidth: 430,
      paddingHorizontal: 16,
      paddingVertical: 18,
      backgroundColor: "transparent",
      borderWidth: 0,
      alignItems: "center",
    },
    logoWrap: {
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: t.spacing.sm,
      position: "relative",
    },
    logoHalo: {
      position: "absolute",
      width: 220,
      height: 220,
      borderRadius: 999,
      backgroundColor: `${t.colors.primary}33`,
    },
    logoImage: {
      width: "96%",
      height: 148,
    },
    loadingStatus: {
      width: "78%",
      maxWidth: 268,
      marginTop: 2,
      alignItems: "center",
    },
    barTrack: {
      width: "100%",
      height: 7,
      borderRadius: 999,
      backgroundColor: "rgba(255,255,255,0.62)",
      overflow: "hidden",
      marginTop: 9,
    },
    barFill: {
      height: "100%",
      backgroundColor: "#0F3F7B",
      borderRadius: 999,
    },
    barShimmer: {
      position: "absolute",
      top: 0,
      left: 0,
      width: 96,
      height: "100%",
      borderRadius: 999,
      backgroundColor: "rgba(255,255,255,0.45)",
    },
    caption: {
      ...t.typography.p,
      marginTop: 10,
      color: "#0F3F7B",
      fontSize: 12,
      fontWeight: "900",
      fontStyle: "italic",
      letterSpacing: 0.15,
      textAlign: "center",
    },
    connectingText: {
      marginBottom: 0,
      color: "#0F3F7B",
      fontSize: 15,
      lineHeight: 18,
      fontWeight: "900",
      fontStyle: "italic",
      letterSpacing: 0.15,
      textAlign: "center",
    },
  });
