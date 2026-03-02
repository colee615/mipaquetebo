// src/components/ui.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Animated, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ui";
import { useI18n } from "../i18n/ui";

export function Screen({ children }) {
  const theme = useTheme();
  if (theme.isDark) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.colors.bg }}
        edges={["bottom", "left", "right"]}
      >
        {children}
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={{ flex: 1 }} edges={["bottom", "left", "right"]}>
      <LinearGradient colors={theme.gradient} style={{ flex: 1 }}>
        <BrandBackdrop />
        {children}
      </LinearGradient>
    </SafeAreaView>
  );
}

function BrandBackdrop() {
  const { width } = useWindowDimensions();
  const circleSize = Math.max(220, Math.min(width * 0.62, 320));
  return (
    <View pointerEvents="none" style={styles.brandBackdrop}>
      <View
        style={[
          styles.brandCircle,
          {
            width: circleSize,
            height: circleSize,
            borderRadius: circleSize / 2,
            top: -circleSize * 0.5,
            right: -circleSize * 0.28,
          },
        ]}
      />
      <View style={styles.brandBandTop} />
      <View style={styles.brandBandBottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  brandBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  brandCircle: {
    position: "absolute",
    backgroundColor: "rgba(254, 204, 54, 0.10)",
  },
  brandBandTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: "rgba(254, 204, 54, 0.95)",
  },
  brandBandBottom: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    height: 1,
    backgroundColor: "rgba(17, 24, 39, 0.06)",
  },
});

export function Card({ children, style }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme.isDark]);
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Chip({ text, color, icon, style, textStyle, numberOfLines = 2 }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme.isDark]);
  const chipColor = color || theme.colors.primary;
  return (
    <View style={[styles.chip, { backgroundColor: `${chipColor}1A`, borderColor: `${chipColor}33` }, style]}>
      {icon ? <Ionicons name={icon} size={14} color={chipColor} /> : null}
      <Text numberOfLines={numberOfLines} ellipsizeMode="tail" style={[styles.chipText, { color: chipColor }, textStyle]}>
        {text}
      </Text>
    </View>
  );
}

export function PrimaryButton({ title, icon, onPress, loading, style }) {
  const theme = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => createStyles(theme), [theme.isDark]);
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  const handlePress = async () => {
    try { await Haptics.selectionAsync(); } catch {}
    onPress?.();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handlePress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        style={[styles.btnWrap, style]}
        disabled={loading}
      >
        <LinearGradient colors={[theme.colors.primary, theme.colors.primaryDark || theme.colors.primary]} style={styles.btnGrad}>
          {icon ? <Ionicons name={icon} size={18} color={theme.colors.secondary} /> : null}
          <Text style={styles.btnText}>{loading ? t("common.loading", "Cargando...") : title}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function OutlineButton({ title, icon, onPress, style, iconColor, transparent }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme.isDark]);
  const handlePress = async () => {
    try { await Haptics.selectionAsync(); } catch {}
    onPress?.();
  };

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={handlePress}
      style={[styles.outline, transparent ? styles.outlineTransparent : null, style]}
    >
      {icon ? <Ionicons name={icon} size={18} color={iconColor || theme.colors.primary} /> : null}
      <Text style={styles.outlineText}>{title}</Text>
    </TouchableOpacity>
  );
}

export function AppInput({ value, onChangeText, placeholder, icon, autoCapitalize = "none", inputRef, ...inputProps }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme.isDark]);
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.inputWrap, focused ? styles.inputWrapFocused : null]}>
      {icon ? <Ionicons name={icon} size={18} color={focused ? theme.colors.secondary : theme.colors.muted} /> : null}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.muted}
        autoCapitalize={autoCapitalize}
        style={styles.input}
        {...inputProps}
        onFocus={(e) => {
          setFocused(true);
          inputProps?.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          inputProps?.onBlur?.(e);
        }}
      />
    </View>
  );
}

export function Snackbar({ visible, text, type = "info", onHide }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme.isDark]);
  const x = useRef(new Animated.Value(220)).current;

  useEffect(() => {
    Animated.timing(x, {
      toValue: visible ? 0 : 220,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  useEffect(() => {
    if (!visible || !onHide) return;
    const t = setTimeout(() => onHide(), 2600);
    return () => clearTimeout(t);
  }, [visible, onHide, text]);

  const bg =
    type === "success"
      ? theme.colors.success
      : type === "danger"
      ? theme.colors.danger
      : theme.colors.secondary;

  if (!text) return null;

  const opacity = x.interpolate({
    inputRange: [0, 220],
    outputRange: [1, 0],
  });

  return (
    <Animated.View
      style={[
        styles.snack,
        {
          top: 0,
          opacity,
          transform: [{ translateX: x }],
          borderColor: `${bg}44`,
        },
      ]}
    >
      <View style={[styles.snackDot, { backgroundColor: bg }]} />
      <Text style={styles.snackText}>{text}</Text>
    </Animated.View>
  );
}

const createStyles = (t) =>
  StyleSheet.create({
    card: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.xl,
      borderWidth: 1,
      borderColor: t.colors.border,
      padding: t.spacing.xl,
      borderTopWidth: 3,
      borderTopColor: t.colors.primary,
      ...t.shadow,
    },

    btnWrap: {
      borderRadius: t.radius.lg,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: `${t.colors.primaryDark}75`,
    },
    btnGrad: {
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderRadius: t.radius.lg,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      ...t.shadowStrong,
    },
    btnText: { color: t.colors.secondary, fontWeight: "900", fontSize: 15, letterSpacing: 0.25 },

    outline: {
      marginTop: t.spacing.sm,
      paddingVertical: 14,
      borderRadius: t.radius.lg,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      flexDirection: "row",
      borderWidth: 1,
      borderColor: t.isDark ? `${t.colors.border}` : "rgba(17, 24, 39, 0.14)",
      backgroundColor: t.isDark ? "rgba(23, 33, 51, 0.92)" : "rgba(255, 255, 255, 0.96)",
    },
    outlineTransparent: {
      backgroundColor: "transparent",
    },
    outlineText: { color: t.colors.secondary, fontWeight: "800", fontSize: 15, letterSpacing: 0.12 },

    inputWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: t.isDark ? t.colors.border : "rgba(17, 24, 39, 0.16)",
      backgroundColor: t.isDark ? "rgba(23, 33, 51, 0.95)" : "rgba(255, 255, 255, 0.92)",
      borderRadius: t.radius.lg,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: t.spacing.md,
    },
    inputWrapFocused: {
      borderColor: t.colors.primaryDark,
      backgroundColor: t.isDark ? "rgba(23, 33, 51, 0.98)" : "#FFFFFF",
    },
    input: { flex: 1, fontSize: 16, color: t.colors.text },

    chip: {
      flexDirection: "row",
      gap: 6,
      alignItems: "center",
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 999,
      borderWidth: 1,
      maxWidth: "100%",
      alignSelf: "flex-start",
    },
    chipText: {
      fontWeight: "900",
      fontSize: 11,
      letterSpacing: 0.35,
      textTransform: "uppercase",
      flexShrink: 1,
    },

    snack: {
      position: "absolute",
      left: 16,
      right: 16,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 16,
      backgroundColor: t.isDark ? "rgba(21, 27, 37, 0.95)" : "rgba(255,255,255,0.95)",
      borderWidth: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      zIndex: 1000,
      ...t.shadowStrong,
    },
    snackDot: { width: 10, height: 10, borderRadius: 5 },
    snackText: { flex: 1, color: t.colors.text, fontWeight: "700" },
  });
