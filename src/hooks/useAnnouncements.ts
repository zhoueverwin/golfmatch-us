import { useEffect, useRef, useState, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";
import { supabase } from "../services/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useRevenueCat } from "../contexts/RevenueCatContext";

export interface Announcement {
  id: string;
  title: string;
  body: string | null;
  image_url: string | null;
  cta_text: string;
  cta_url: string | null;
  cta_screen: string | null;
}

interface UseAnnouncementsOptions {
  enabled?: boolean;
}

interface UseAnnouncementsReturn {
  announcement: Announcement | null;
  dismiss: () => Promise<void>;
}

const STALE_MS = 30 * 60 * 1000; // 30 minutes

export function useAnnouncements(
  options: UseAnnouncementsOptions = {}
): UseAnnouncementsReturn {
  const { enabled = true } = options;
  const { profileId } = useAuth();
  const { isProMember } = useRevenueCat();

  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const lastFetchRef = useRef<number>(0);
  const isFetchingRef = useRef(false);

  const fetchAnnouncement = useCallback(async () => {
    if (!enabled || !profileId || isFetchingRef.current) return;

    // Staleness check — don't re-fetch within 30 minutes
    const now = Date.now();
    if (now - lastFetchRef.current < STALE_MS) return;

    isFetchingRef.current = true;
    try {
      // Step 1: Fetch user gender for targeting
      const { data: profile } = await supabase
        .from("profiles")
        .select("gender")
        .eq("id", profileId)
        .single();

      const userGender = profile?.gender ?? null;

      // Step 2: Get IDs the user already dismissed
      const { data: dismissed } = await supabase
        .from("dismissed_announcements")
        .select("announcement_id")
        .eq("user_id", profileId);

      const dismissedIds = (dismissed ?? []).map((d) => d.announcement_id);

      // Step 3: Query active announcements with targeting filters
      const nowISO = new Date().toISOString();
      let query = supabase
        .from("announcements")
        .select("id, title, body, image_url, cta_text, cta_url, cta_screen")
        .eq("is_active", true)
        .lte("start_at", nowISO)
        .or(`end_at.is.null,end_at.gt.${nowISO}`)
        .or(`target_premium.is.null,target_premium.eq.${isProMember}`)
        .order("priority", { ascending: false })
        .limit(1);

      // Exclude already-dismissed announcements
      if (dismissedIds.length > 0) {
        query = query.not("id", "in", `(${dismissedIds.join(",")})`);
      }

      // Target gender: show if target_gender matches user or is null (all)
      if (userGender) {
        query = query.or(`target_gender.is.null,target_gender.eq.${userGender}`);
      } else {
        query = query.is("target_gender", null);
      }

      const { data, error } = await query;

      if (error) {
        console.error("[useAnnouncements] Fetch error:", error.message);
        return;
      }

      if (data && data.length > 0) {
        const row = data[0];
        setAnnouncement({
          id: row.id,
          title: row.title,
          body: row.body,
          image_url: row.image_url,
          cta_text: row.cta_text,
          cta_url: row.cta_url,
          cta_screen: row.cta_screen,
        });
      } else {
        setAnnouncement(null);
      }

      lastFetchRef.current = now;
    } catch (err) {
      console.error("[useAnnouncements] Unexpected error:", err);
    } finally {
      isFetchingRef.current = false;
    }
  }, [enabled, profileId, isProMember]);

  // Fetch on mount
  useEffect(() => {
    fetchAnnouncement();
  }, [fetchAnnouncement]);

  // Re-fetch when app comes to foreground
  useEffect(() => {
    if (!enabled) return;

    const subscription = AppState.addEventListener(
      "change",
      (nextAppState: AppStateStatus) => {
        if (
          appStateRef.current.match(/inactive|background/) &&
          nextAppState === "active"
        ) {
          fetchAnnouncement();
        }
        appStateRef.current = nextAppState;
      }
    );

    return () => {
      subscription.remove();
    };
  }, [enabled, fetchAnnouncement]);

  const dismiss = useCallback(async () => {
    if (!announcement || !profileId) return;

    const announcementId = announcement.id;
    setAnnouncement(null);

    try {
      const { error } = await supabase
        .from("dismissed_announcements")
        .insert({ user_id: profileId, announcement_id: announcementId });

      if (error) {
        console.error("[useAnnouncements] Dismiss error:", error.message);
      }
    } catch (err) {
      console.error("[useAnnouncements] Dismiss unexpected error:", err);
    }
  }, [announcement, profileId]);

  return { announcement, dismiss };
}
