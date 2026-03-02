import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useTheme } from "../theme/ui";
import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity, View, Text } from "react-native";
import { useI18n } from "../i18n/ui";

import LoadingScreen from "../screens/LoadingScreen";
import ScanScreen from "../screens/ScanScreen";
import ResultScreen from "../screens/ResultScreen";
import SavedPackagesScreen from "../screens/SavedPackagesScreen";
import PackagesLocalExternalScreen from "../screens/PackagesLocalExternalScreen";

const Stack = createNativeStackNavigator();

export default function StackNavigator() {
  const { colors, mode, setMode, isDark } = useTheme();
  const { t, language, setLanguage } = useI18n();
  const headerTextColor = isDark ? colors.text : colors.secondary;

  return (
    <Stack.Navigator
      initialRouteName="Loading"
      screenOptions={({ navigation }) => ({
        headerTitleAlign: "center",
        headerStyle: {
          backgroundColor: colors.surface,
          borderBottomColor: isDark ? colors.border : "rgba(17, 24, 39, 0.10)",
          borderBottomWidth: 1,
        },
        headerShadowVisible: true,
        headerTintColor: headerTextColor,
        headerTitleStyle: { fontWeight: "900", color: headerTextColor, letterSpacing: 0.35, fontSize: 17 },
        contentStyle: { backgroundColor: colors.bg },
        statusBarStyle: mode === "dark" ? "light" : "dark",
        statusBarColor: colors.bg,
        animation: "none",
        headerLeft: ({ canGoBack }) => (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {canGoBack ? (
              <TouchableOpacity onPress={() => navigation.goBack()} style={{ paddingHorizontal: 6, paddingVertical: 6 }}>
                <Ionicons name="chevron-back" size={22} color={headerTextColor} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={() => setLanguage(language === "es" ? "en" : "es")}
              style={{
                minWidth: 44,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: isDark ? colors.border : "rgba(17, 24, 39, 0.14)",
                backgroundColor: isDark ? "rgba(23, 33, 51, 0.95)" : "rgba(255, 255, 255, 0.95)",
              }}
            >
              <Text style={{ fontWeight: "900", color: headerTextColor, textAlign: "center" }}>
                {language === "es" ? t("language.es", "ES") : t("language.en", "EN")}
              </Text>
            </TouchableOpacity>
          </View>
        ),
        headerRight: () => (
          <TouchableOpacity
            onPress={() => setMode(isDark ? "light" : "dark")}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: isDark ? colors.border : "rgba(17, 24, 39, 0.14)",
              backgroundColor: isDark ? "rgba(23, 33, 51, 0.95)" : "rgba(255, 255, 255, 0.95)",
            }}
          >
            <Ionicons
              name={isDark ? "moon" : "sunny"}
              size={20}
              color={colors.secondary}
            />
          </TouchableOpacity>
        ),
      })}
    >
      <Stack.Screen name="Loading" component={LoadingScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Scan" component={ScanScreen} options={{ title: t("nav.scan", "Buscar envío") }} />
      <Stack.Screen name="Result" component={ResultScreen} options={{ title: t("nav.result", "Resultado") }} />
      <Stack.Screen
        name="SavedPackages"
        component={SavedPackagesScreen}
        options={{ title: t("nav.pending", "Pendientes") }}
      />
      <Stack.Screen
        name="PackagesLocalExternal"
        component={PackagesLocalExternalScreen}
        options={{ title: t("nav.delivered", "Entregados") }}
      />
    </Stack.Navigator>
  );
}
