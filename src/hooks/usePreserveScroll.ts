import { useCallback, useRef } from "react";
import type { NativeSyntheticEvent, NativeScrollEvent, ScrollView } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

/**
 * Preserve a screen's ScrollView position across child-screen navigation.
 *
 * Why this exists:
 *   React Navigation's stack navigator keeps parent screens "mounted" when
 *   you push a child screen, but in practice the native ScrollView's
 *   internal offset can be lost — depending on the device, the navigator
 *   config, or focus-driven re-renders inside the parent screen. The user-
 *   facing symptom is "I scrolled down on MyPage, opened Settings, came
 *   back, and now I'm at the top again."
 *
 * What this hook does:
 *   - Captures the scroll offset on every onScroll event.
 *   - On every focus, restores that offset via scrollTo({ animated: false }).
 *   - Defers the restore by one animation frame so the ScrollView has
 *     completed its layout pass before we set the offset (without this,
 *     the scrollTo silently no-ops on the first focus after mount).
 *
 * Why animated:false matters:
 *   A visible "snap back" animation feels worse than the bug we're fixing.
 *   Setting animated:false makes the restoration imperceptible — the user
 *   experiences the scroll as if it never reset at all.
 *
 * Usage:
 *   const scroll = usePreserveScroll();
 *   ...
 *   <ScrollView
 *     ref={scroll.ref}
 *     onScroll={scroll.onScroll}
 *     scrollEventThrottle={scroll.scrollEventThrottle}
 *   >
 */
export interface PreserveScrollResult {
  ref: React.RefObject<ScrollView | null>;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
}

export function usePreserveScroll(): PreserveScrollResult {
  const ref = useRef<ScrollView>(null);
  const offsetRef = useRef(0);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetRef.current = e.nativeEvent.contentOffset.y;
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      const target = offsetRef.current;
      if (target <= 0) return;
      const raf = requestAnimationFrame(() => {
        ref.current?.scrollTo({ y: target, animated: false });
      });
      return () => cancelAnimationFrame(raf);
    }, []),
  );

  return { ref, onScroll, scrollEventThrottle: 16 };
}
