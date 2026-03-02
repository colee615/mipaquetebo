import { useEffect, useMemo, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing, Image } from "react-native";
import { Asset } from "expo-asset";
import { useTheme } from "../theme/ui";
import { useI18n } from "../i18n/ui";

const APP_LOGO = require("../../assets/logoincio-start.png");
const PACKAGE_BOX = require("../../paquete-caja-entrega-modelo-3d.webp");

export default function LoadingScreen({ navigation }) {
  const theme = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => createStyles(theme), [theme.isDark]);
  const bar = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const packageTravel = useRef(new Animated.Value(0)).current;
  const packageHop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Warm up local assets to reduce first paint delay on Android.
    Asset.fromModule(APP_LOGO).downloadAsync().catch(() => {});
    Asset.fromModule(PACKAGE_BOX).downloadAsync().catch(() => {});
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

    shimmerAnim.start();
    Animated.sequence([
      Animated.timing(packageTravel, {
        toValue: 1,
        duration: 920,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(packageHop, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(packageHop, {
          toValue: 0,
          duration: 260,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
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
      clearTimeout(navigationTimer);
    };
  }, [bar, navigation, shimmer, packageTravel, packageHop]);

  const barWidth = bar.interpolate({ inputRange: [0, 1], outputRange: ["18%", "100%"] });
  const shimmerTranslate = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-80, 180] });
  const packageTranslateX = packageTravel.interpolate({ inputRange: [0, 1], outputRange: [180, 0] });
  const packageRotate = packageTravel.interpolate({
    inputRange: [0, 0.82, 1],
    outputRange: ["-10deg", "2deg", "0deg"],
  });
  const packageTranslateY = packageHop.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  const trailOpacity = packageTravel.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.75, 0.4, 0.08] });
  const trailScaleX = packageTravel.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] });

  return (
    <View style={styles.root}>
      <View style={styles.topAccent} />
      <View style={styles.backdropBand} />

      <View style={styles.centerPanel}>
        <View style={styles.arrivalZone}>
          <View style={styles.arrivalTrack} />
          <Animated.View style={[styles.arrivalTrail, { opacity: trailOpacity, transform: [{ scaleX: trailScaleX }] }]} />
          <Animated.View
            style={[
              styles.packageWrap,
              { transform: [{ translateX: packageTranslateX }, { translateY: packageTranslateY }, { rotate: packageRotate }] },
            ]}
          >
            <Image source={PACKAGE_BOX} style={styles.packageImage} resizeMode="contain" />
          </Animated.View>
        </View>

        <View style={styles.logoWrap}>
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
      height: 5,
      backgroundColor: t.colors.primary,
      opacity: 0.88,
    },
    backdropBand: {
      position: "absolute",
      top: 56,
      left: 0,
      right: 0,
      height: 58,
      backgroundColor: t.isDark ? "rgba(254, 204, 54, 0.06)" : "rgba(254, 204, 54, 0.08)",
    },
    centerPanel: {
      width: "100%",
      maxWidth: 420,
      borderRadius: 20,
      paddingHorizontal: 22,
      paddingVertical: 24,
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderTopWidth: 3,
      borderTopColor: t.colors.primary,
      alignItems: "center",
      ...t.shadowStrong,
    },
    arrivalZone: {
      width: "100%",
      height: 70,
      marginBottom: 10,
      justifyContent: "center",
      overflow: "hidden",
    },
    arrivalTrack: {
      position: "absolute",
      left: 0,
      right: 0,
      height: 2,
      borderRadius: 999,
      backgroundColor: t.isDark ? "rgba(42, 58, 82, 0.82)" : "rgba(218, 166, 17, 0.18)",
    },
    arrivalTrail: {
      position: "absolute",
      left: 34,
      width: 140,
      height: 4,
      borderRadius: 999,
      backgroundColor: t.isDark ? "rgba(254, 204, 54, 0.18)" : "rgba(254, 204, 54, 0.28)",
    },
    packageWrap: {
      position: "absolute",
      right: 44,
      width: 62,
      height: 62,
      alignItems: "center",
      justifyContent: "center",
    },
    packageImage: {
      width: 56,
      height: 56,
    },
    logoWrap: {
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: t.spacing.md,
    },
    logoImage: {
      width: "86%",
      height: 138,
    },
    barTrack: {
      width: "100%",
      height: 10,
      borderRadius: 999,
      backgroundColor: t.isDark ? "#2A3A52" : "#F3E8BF",
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
      marginTop: t.spacing.md,
      color: t.colors.muted,
      fontWeight: "800",
      textAlign: "center",
    },
  });
