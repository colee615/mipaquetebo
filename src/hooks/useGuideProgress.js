import { useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export function useGuideProgress({ seenKey, stepKey, totalSteps }) {
  const restoreProgress = useCallback(async () => {
    try {
      const seen = await AsyncStorage.getItem(seenKey);
      if (seen) return { shouldShow: false, step: 0 };
      const raw = Number(await AsyncStorage.getItem(stepKey));
      const safeStep = Number.isInteger(raw) && raw >= 0 && raw < totalSteps ? raw : 0;
      return { shouldShow: true, step: safeStep };
    } catch {
      return { shouldShow: true, step: 0 };
    }
  }, [seenKey, stepKey, totalSteps]);

  const saveStep = useCallback(async (step) => {
    try {
      await AsyncStorage.setItem(stepKey, String(step));
    } catch {}
  }, [stepKey]);

  const completeGuide = useCallback(async () => {
    try {
      await Promise.all([AsyncStorage.setItem(seenKey, "1"), AsyncStorage.removeItem(stepKey)]);
    } catch {}
  }, [seenKey, stepKey]);

  const restartGuide = useCallback(async () => {
    try {
      await Promise.all([AsyncStorage.removeItem(seenKey), AsyncStorage.setItem(stepKey, "0")]);
    } catch {}
  }, [seenKey, stepKey]);

  return {
    restoreProgress,
    saveStep,
    completeGuide,
    restartGuide,
  };
}
