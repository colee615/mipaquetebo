// src/theme/ui.js
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Platform, useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const LIGHT = {
  bg: "#EEF3FB",
  surface: "#FFFFFF",
  text: "#12345D",
  muted: "#5D7596",
  border: "rgba(162, 186, 219, 0.55)",
  primary: "#FECC36",
  primaryDark: "#D9A913",
  success: "#3EA52F",
  warning: "#FECC36",
  danger: "#CA4646",
  secondary: "#12345D",
  secondaryDark: "#0F3F7B",
  overlay: "rgba(15, 23, 42, 0.42)",
  gradA: "#EEF3FB",
  gradB: "#E5EDF9",
};

const DARK = {
  bg: "#101827",
  surface: "#172133",
  text: "#E9EEF8",
  muted: "#9CABBF",
  border: "#2A3A52",
  primary: "#FECC36",
  primaryDark: "#D1A622",
  success: "#22C55E",
  warning: "#FECC36",
  danger: "#F87171",
  secondary: "#E9EEF8",
  secondaryDark: "#CDD8EA",
  overlay: "rgba(2, 6, 23, 0.7)",
  gradA: "#111827",
  gradB: "#141F32",
};

export const RADIUS = { sm: 10, md: 14, lg: 18, xl: 22 };
export const SPACING = { xs: 6, sm: 10, md: 14, lg: 18, xl: 24 };

const SHADOW_LIGHT = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 14,
  },
  android: { elevation: 3 },
});

const SHADOW_STRONG_LIGHT = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
  },
  android: { elevation: 7 },
});

const SHADOW_DARK = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
  },
  android: { elevation: 6 },
});

const SHADOW_STRONG_DARK = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOpacity: 0.32,
    shadowOffset: { width: 0, height: 16 },
    shadowRadius: 30,
  },
  android: { elevation: 12 },
});

function buildTheme(colors, isDark) {
  return {
    isDark,
    colors,
    radius: RADIUS,
    spacing: SPACING,
    shadow: isDark ? SHADOW_DARK : SHADOW_LIGHT,
    shadowStrong: isDark ? SHADOW_STRONG_DARK : SHADOW_STRONG_LIGHT,
    typography: {
      h1: { fontSize: 26, fontWeight: "900", color: colors.text, letterSpacing: 0.2 },
      h2: { fontSize: 18, fontWeight: "800", color: colors.text, letterSpacing: 0.1 },
      p: { fontSize: 14, color: colors.muted, lineHeight: 21 },
    },
    gradient: [colors.gradA, colors.gradB],
  };
}

export function getTheme(scheme) {
  const isDark = scheme === "dark";
  return buildTheme(isDark ? DARK : LIGHT, isDark);
}

const ThemeContext = createContext({
  mode: "system",
  setMode: () => {},
});

const THEME_MODE_KEY = "theme_mode";
const THEME_INIT_KEY = "theme_initialized";

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState("light"); // system | light | dark
  useEffect(() => {
    (async () => {
      try {
        const initialized = await AsyncStorage.getItem(THEME_INIT_KEY);

        // Primer inicio real: forzar tema blanco y dejar marcado.
        if (!initialized) {
          setMode("light");
          await AsyncStorage.setItem(THEME_MODE_KEY, "light");
          await AsyncStorage.setItem(THEME_INIT_KEY, "1");
          return;
        }

        const saved = await AsyncStorage.getItem(THEME_MODE_KEY);
        if (saved === "light" || saved === "dark" || saved === "system") {
          setMode(saved);
        }
      } catch {}
    })();
  }, []);
  const setModePersisted = (next) => {
    setMode(next);
    try {
      AsyncStorage.setItem(THEME_MODE_KEY, next);
      AsyncStorage.setItem(THEME_INIT_KEY, "1");
    } catch {}
  };
  const value = useMemo(() => ({ mode, setMode: setModePersisted }), [mode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const scheme = useColorScheme();
  const { mode, setMode } = useContext(ThemeContext);
  const effective = mode === "system" ? scheme : mode;
  const theme = getTheme(effective);
  return { ...theme, mode, setMode };
}
