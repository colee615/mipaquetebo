// src/components/ui.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Animated, useWindowDimensions, Modal, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ui";
import { useI18n } from "../i18n/ui";

export function Screen({ children, edges = ["bottom", "left", "right"] }) {
  const theme = useTheme();
  if (theme.isDark) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.colors.bg }}
        edges={edges}
      >
        {children}
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={{ flex: 1 }} edges={edges}>
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

export function PrimaryButton({ title, icon, onPress, loading, style, accessibilityLabel, accessibilityHint, ...touchableProps }) {
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
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || title}
        accessibilityHint={accessibilityHint}
        {...touchableProps}
      >
        <LinearGradient colors={[theme.colors.primary, theme.colors.primaryDark || theme.colors.primary]} style={styles.btnGrad}>
          {icon ? <Ionicons name={icon} size={18} color={theme.colors.secondary} /> : null}
          <Text style={styles.btnText}>{loading ? t("common.loading", "Cargando...") : title}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function OutlineButton({ title, icon, onPress, style, iconColor, transparent, accessibilityLabel, accessibilityHint, ...touchableProps }) {
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
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityHint={accessibilityHint}
      {...touchableProps}
    >
      {icon ? <Ionicons name={icon} size={18} color={iconColor || theme.colors.primary} /> : null}
      <Text style={styles.outlineText}>{title}</Text>
    </TouchableOpacity>
  );
}

export function ConfirmDialog({
  visible,
  title,
  message,
  detailTitle,
  detailSubtitle,
  confirmText,
  cancelText,
  loadingText,
  loading = false,
  onConfirm,
  onCancel,
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme.isDark]);
  const close = () => {
    if (!loading) onCancel?.();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={close}
    >
      <View style={styles.confirmOverlay}>
        <Pressable style={styles.confirmBackdrop} onPress={close} disabled={loading} />
        <View style={styles.confirmCard}>
          <View style={styles.confirmHeader}>
            <View style={styles.confirmIconWrap}>
              <Ionicons name="trash-outline" size={23} color={theme.colors.danger} />
            </View>
            <Text style={styles.confirmTitle}>{title}</Text>
          </View>

          <Text style={styles.confirmMessage}>{message}</Text>

          {detailTitle || detailSubtitle ? (
            <View style={styles.confirmDetails}>
              {detailTitle ? <Text style={styles.confirmDetailTitle}>{detailTitle}</Text> : null}
              {detailSubtitle ? <Text style={styles.confirmDetailSubtitle}>{detailSubtitle}</Text> : null}
            </View>
          ) : null}

          <View style={styles.confirmActions}>
            <TouchableOpacity
              style={[styles.confirmDeleteButton, loading && styles.confirmDeleteButtonDisabled]}
              onPress={onConfirm}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={loading ? loadingText : confirmText}
            >
              {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="trash-outline" size={17} color="#FFFFFF" />}
              <Text style={styles.confirmDeleteText}>{loading ? loadingText : confirmText}</Text>
            </TouchableOpacity>
            <OutlineButton
              title={cancelText}
              icon="close"
              onPress={close}
              disabled={loading}
              style={styles.confirmCancelButton}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function AppInput({ value, onChangeText, placeholder, icon, autoCapitalize = "none", inputRef, accessibilityLabel, ...inputProps }) {
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
        accessibilityLabel={accessibilityLabel || placeholder}
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

export function Snackbar({ visible, text, type = "info", onHide, topOffset = 0 }) {
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
          top: topOffset,
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
    confirmOverlay: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      backgroundColor: "rgba(10, 20, 38, 0.58)",
    },
    confirmBackdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    confirmCard: {
      width: "100%",
      maxWidth: 420,
      padding: 22,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderTopWidth: 3,
      borderTopColor: t.colors.primary,
      backgroundColor: t.colors.surface,
      ...t.shadowStrong,
    },
    confirmHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 13,
      marginBottom: 14,
    },
    confirmIconWrap: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${t.colors.danger}18`,
      borderWidth: 1,
      borderColor: `${t.colors.danger}33`,
    },
    confirmTitle: {
      flex: 1,
      color: t.colors.text,
      fontSize: 20,
      fontWeight: "900",
    },
    confirmMessage: {
      color: t.colors.muted,
      fontSize: 15,
      lineHeight: 22,
    },
    confirmDetails: {
      marginTop: 16,
      padding: 13,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.isDark ? "rgba(15, 23, 42, 0.58)" : "rgba(235, 242, 252, 0.7)",
    },
    confirmDetailTitle: {
      color: t.colors.text,
      fontSize: 14,
      fontWeight: "900",
    },
    confirmDetailSubtitle: {
      color: t.colors.muted,
      fontSize: 12,
      fontWeight: "700",
      marginTop: 4,
    },
    confirmActions: {
      gap: 10,
      marginTop: 18,
    },
    confirmDeleteButton: {
      minHeight: 48,
      paddingHorizontal: 16,
      borderRadius: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      backgroundColor: t.colors.danger,
    },
    confirmDeleteButtonDisabled: {
      opacity: 0.65,
    },
    confirmDeleteText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "900",
    },
    confirmCancelButton: {
      width: "100%",
      minHeight: 46,
    },
  });
