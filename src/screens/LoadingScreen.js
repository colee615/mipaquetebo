import { useEffect, useMemo, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing, Image } from "react-native";
import { Asset } from "expo-asset";
import { useTheme } from "../theme/ui";
import { useI18n } from "../i18n/ui";

const APP_LOGO = require("../../assets/logoincio-start.png");

export default function LoadingScreen({ navigation }) {
  const theme = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => createStyles(theme), [theme.isDark]);
  const bar = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const halo = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Warm up local assets to reduce first paint delay on Android.
    Asset.fromModule(APP_LOGO).downloadAsync().catch(() => {});
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

  return (
    <View style={styles.root}>
      <View style={styles.topAccent} />
      <View style={[styles.bgOrb, styles.bgOrbPrimary]} />
      <View style={[styles.bgOrb, styles.bgOrbSoft]} />
      <View style={styles.backdropBand} />

      <View style={styles.centerPanel}>
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

        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, { width: barWidth }]} />
          <Animated.View style={[styles.barShimmer, { transform: [{ translateX: shimmerTranslate }] }]} />
        </View>

        <Text style={styles.caption}>{t("loading.preparing", "Preparando tu seguimiento")}</Text>
      </View>
    </View>
  );
}

const createStyles = (t) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: t.colors.bg,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: t.spacing.xl,
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
      borderRadius: 24,
      paddingHorizontal: 24,
      paddingVertical: 26,
      backgroundColor: t.isDark ? "rgba(15, 23, 42, 0.78)" : "rgba(255,255,255,0.86)",
      borderWidth: 1,
      borderColor: t.colors.border,
      borderTopWidth: 2,
      borderTopColor: t.colors.primary,
      alignItems: "center",
      ...t.shadowStrong,
    },
    logoWrap: {
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: t.spacing.md,
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
      width: "88%",
      height: 132,
    },
    barTrack: {
      width: "100%",
      height: 9,
      borderRadius: 999,
      backgroundColor: t.isDark ? "rgba(51, 65, 85, 0.7)" : "#F3E8BF",
      overflow: "hidden",
      marginTop: t.spacing.md,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    barFill: {
      height: "100%",
      backgroundColor: t.colors.primary,
      borderRadius: 999,
    },
    barShimmer: {
      position: "absolute",
      top: 0,
      left: 0,
      width: 96,
      height: "100%",
      borderRadius: 999,
      backgroundColor: t.isDark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.56)",
    },
    caption: {
      ...t.typography.p,
      marginTop: t.spacing.sm,
      color: t.colors.muted,
      fontWeight: "700",
      textAlign: "center",
    },
  });
