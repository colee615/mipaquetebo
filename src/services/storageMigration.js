import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_SCHEMA_VERSION_KEY = "storage_schema_version";
const APP_LAST_VERSION_KEY = "app_last_version";
const CURRENT_STORAGE_SCHEMA_VERSION = 1;

const readText = (value) => String(value || "").trim();

const safeJsonParse = (raw, fallback) => {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const normalizeSavedPackages = (input) => {
  if (!Array.isArray(input)) return [];

  const byCode = new Map();
  const usedNames = new Set();

  for (const item of input) {
    const code = readText(item?.code).toUpperCase();
    const name = readText(item?.name);
    if (!code || !name) continue;
    if (byCode.has(code)) continue;

    let finalName = name;
    if (usedNames.has(finalName.toLowerCase())) {
      finalName = `${name} (${code})`;
    }

    usedNames.add(finalName.toLowerCase());
    byCode.set(code, {
      code,
      name: finalName,
    });
  }

  return Array.from(byCode.values());
};

const migrateSavedPackages = async () => {
  const raw = await AsyncStorage.getItem("savedPackages");
  if (!raw) return;

  const parsed = safeJsonParse(raw, []);
  const normalized = normalizeSavedPackages(parsed);
  await AsyncStorage.setItem("savedPackages", JSON.stringify(normalized));
};

const migrateThemeMode = async () => {
  const raw = await AsyncStorage.getItem("theme_mode");
  if (!raw) return;

  const mode = readText(raw).toLowerCase();
  if (mode === "light" || mode === "dark" || mode === "system") return;
  await AsyncStorage.setItem("theme_mode", "light");
};

const runSchemaMigrations = async (fromVersion) => {
  if (fromVersion < 1) {
    await migrateSavedPackages();
    await migrateThemeMode();
  }
};

export const runStorageMigrations = async (appVersion) => {
  const rawSchemaVersion = await AsyncStorage.getItem(STORAGE_SCHEMA_VERSION_KEY);
  const currentSchemaVersion = Number.parseInt(String(rawSchemaVersion || "0"), 10) || 0;

  if (currentSchemaVersion < CURRENT_STORAGE_SCHEMA_VERSION) {
    await runSchemaMigrations(currentSchemaVersion);
    await AsyncStorage.setItem(
      STORAGE_SCHEMA_VERSION_KEY,
      String(CURRENT_STORAGE_SCHEMA_VERSION)
    );
  }

  if (appVersion) {
    await AsyncStorage.setItem(APP_LAST_VERSION_KEY, String(appVersion));
  }
};

export const getStorageMaintenanceInfo = () => ({
  schemaVersionKey: STORAGE_SCHEMA_VERSION_KEY,
  currentSchemaVersion: CURRENT_STORAGE_SCHEMA_VERSION,
  appLastVersionKey: APP_LAST_VERSION_KEY,
});
