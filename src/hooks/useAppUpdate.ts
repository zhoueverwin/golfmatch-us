import { useEffect, useRef, useState, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";
import versionService, { VersionCheckResult } from "../services/versionService";

interface UseAppUpdateOptions {
  enabled?: boolean;
  checkOnMount?: boolean;
}

interface UseAppUpdateReturn {
  updateInfo: VersionCheckResult | null;
  showPrompt: boolean;
  isLoading: boolean;
  dismissPrompt: () => void;
  openStore: () => void;
  checkForUpdate: () => Promise<void>;
}

export function useAppUpdate(options: UseAppUpdateOptions = {}): UseAppUpdateReturn {
  const { enabled = true, checkOnMount = true } = options;

  const [updateInfo, setUpdateInfo] = useState<VersionCheckResult | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const appStateRef = useRef(AppState.currentState);
  const hasCheckedRef = useRef(false);

  const checkForUpdate = useCallback(async () => {
    if (!enabled || isLoading) return;

    setIsLoading(true);
    try {
      const result = await versionService.checkForUpdate();

      if (result && result.needsUpdate) {
        setUpdateInfo(result);
        setShowPrompt(true);
      } else {
        setUpdateInfo(null);
        setShowPrompt(false);
      }
    } catch (error) {
      console.error("[useAppUpdate] Error checking for update:", error);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, isLoading]);

  useEffect(() => {
    if (checkOnMount && enabled && !hasCheckedRef.current) {
      hasCheckedRef.current = true;
      checkForUpdate();
    }
  }, [checkOnMount, enabled, checkForUpdate]);

  useEffect(() => {
    if (!enabled) return;

    const subscription = AppState.addEventListener(
      "change",
      (nextAppState: AppStateStatus) => {
        if (
          appStateRef.current.match(/inactive|background/) &&
          nextAppState === "active"
        ) {
          hasCheckedRef.current = false;
          checkForUpdate();
        }
        appStateRef.current = nextAppState;
      }
    );

    return () => {
      subscription.remove();
    };
  }, [enabled, checkForUpdate]);

  const dismissPrompt = useCallback(() => {
    if (updateInfo?.isForced) return;
    setShowPrompt(false);
  }, [updateInfo?.isForced]);

  const openStore = useCallback(() => {
    if (updateInfo?.storeUrl) {
      versionService.openStore(updateInfo.storeUrl);
    }
  }, [updateInfo]);

  return {
    updateInfo,
    showPrompt,
    isLoading,
    dismissPrompt,
    openStore,
    checkForUpdate,
  };
}
