import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useRef,
  useCallback,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { RootStackParamList } from "../types";
import { useAuth } from "./AuthContext";
import { DataProvider } from "../services";
import { supabase } from "../services/supabase";
import MatchCelebrationModal from "../components/MatchCelebrationModal";

interface Match {
  id: string;
  user1_id: string;
  user2_id: string;
  matched_at: string;
  seen_by_user1?: boolean;
  seen_by_user2?: boolean;
  user1?: {
    id: string;
    name: string;
    profile_pictures?: string[];
  };
  user2?: {
    id: string;
    name: string;
    profile_pictures?: string[];
  };
}

interface MatchContextType {
  isShowingMatch: boolean;
  currentMatch: Match | null;
}

const MatchContext = createContext<MatchContextType | undefined>(undefined);

interface MatchProviderProps {
  children: ReactNode;
}

export const MatchProvider: React.FC<MatchProviderProps> = ({ children }) => {
  const { profileId } = useAuth();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const [unseenMatches, setUnseenMatches] = useState<Match[]>([]);
  const [currentMatch, setCurrentMatch] = useState<Match | null>(null);
  const [isShowingMatch, setIsShowingMatch] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<{
    id: string;
    name: string;
    image: string;
  } | null>(null);

  const appState = useRef(AppState.currentState);
  const matchesSubscriptionRef = useRef<any>(null);
  const shownMatchIds = useRef<Set<string>>(new Set()); // Track which matches we've already shown this session

  // Subscribe to real-time match events
  useEffect(() => {
    if (!profileId) {
      // Cleanup subscription if user logs out
      if (matchesSubscriptionRef.current) {
        matchesSubscriptionRef.current.unsubscribe();
        matchesSubscriptionRef.current = null;
      }
      shownMatchIds.current.clear();
      return;
    }

    // Subscribe to new matches in real-time (filtered to current user)
    // NotificationContext also subscribes for badge/toast; this one drives the celebration modal
    const handleNewMatch = async (payload: any) => {
      const match = payload.new as any;
      if (shownMatchIds.current.has(match.id)) return;

      // Fetch full match data with user profiles
      const { data: fullMatch, error } = await supabase
        .from("matches")
        .select(`
          *,
          user1:profiles!matches_user1_id_fkey(id, name, profile_pictures),
          user2:profiles!matches_user2_id_fkey(id, name, profile_pictures)
        `)
        .eq("id", match.id)
        .single();

      if (!error && fullMatch) {
        const isUser1 = fullMatch.user1_id === profileId;
        const alreadySeen = isUser1 ? fullMatch.seen_by_user1 : fullMatch.seen_by_user2;

        if (alreadySeen) {
          console.log(`[MatchContext] Skipping match ${match.id} - already seen by user`);
          return;
        }

        console.log(`[MatchContext] Showing match popup for match ${match.id}`);
        setCurrentMatch(fullMatch as Match);
        setIsShowingMatch(true);
        shownMatchIds.current.add(match.id);
      }
    };

    // Two filtered channels instead of one unfiltered channel
    const matchesChannel1 = supabase
      .channel(`match-popup-user1-${profileId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "matches", filter: `user1_id=eq.${profileId}` },
        handleNewMatch,
      )
      .subscribe();

    const matchesChannel2 = supabase
      .channel(`match-popup-user2-${profileId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "matches", filter: `user2_id=eq.${profileId}` },
        handleNewMatch,
      )
      .subscribe();

    matchesSubscriptionRef.current = { ch1: matchesChannel1, ch2: matchesChannel2 };

    return () => {
      if (matchesSubscriptionRef.current) {
        matchesSubscriptionRef.current.ch1?.unsubscribe();
        matchesSubscriptionRef.current.ch2?.unsubscribe();
        matchesSubscriptionRef.current = null;
      }
    };
  }, [profileId]);

  // Initialize matches when user logs in (only check for existing unseen matches)
  useEffect(() => {
    if (profileId) {
      loadUnseenMatches();
      loadCurrentUserProfile();
    } else {
      setUnseenMatches([]);
      setCurrentMatch(null);
      setIsShowingMatch(false);
      shownMatchIds.current.clear();
    }
  }, [profileId]);

  // DON'T check for matches on app foreground - this causes duplicates
  // Real-time subscription handles new matches
  // Only check on initial login above

  const loadCurrentUserProfile = async () => {
    if (!profileId) return;

    try {
      const response = await DataProvider.getUser(profileId);
      if (response.success && response.data) {
        setCurrentUserProfile({
          id: response.data.id,
          name: response.data.name,
          image:
            response.data.profile_pictures && response.data.profile_pictures[0]
              ? response.data.profile_pictures[0]
              : "",
        });
      }
    } catch (error) {
      console.error("Error loading current user profile:", error);
    }
  };

  const loadUnseenMatches = async () => {
    if (!profileId) return;

    try {
      const response = await DataProvider.getUnseenMatches(profileId);
      if (response.success && response.data) {
        const matches = response.data as Match[];

        // Store unseen matches for reference but DON'T show modal on login
        // Users can view their matches on the つながり page under マッチ tab
        // Modal only shows for real-time new matches (handled by subscription)
        setUnseenMatches(matches);

        // Add all existing unseen matches to shownMatchIds to prevent
        // showing them if they come through real-time subscription
        matches.forEach(match => {
          shownMatchIds.current.add(match.id);
        });

        console.log(`[MatchContext] Loaded ${matches.length} unseen matches on login (no popup - view on つながり page)`);
      } else {
        console.error("[MatchContext] Failed to load unseen matches:", response.error);
      }
    } catch (error) {
      console.error("[MatchContext] Error loading unseen matches:", error);
    }
  };

  const markMatchAsSeen = async (matchId: string) => {
    if (!profileId) return;

    try {
      console.log(`[MatchContext] Marking match ${matchId} as seen for user ${profileId}`);
      await DataProvider.markMatchAsSeen(matchId, profileId);
      // Remove from queue
      setUnseenMatches((prev) => prev.filter((m) => m.id !== matchId));
      // Add to shown set (in case it wasn't already there)
      shownMatchIds.current.add(matchId);
    } catch (error) {
      console.error("Error marking match as seen:", error);
    }
  };

  const handleSendMessage = useCallback(async (message?: string) => {
    if (!currentMatch || !profileId) return;

    const matchId = currentMatch.id;
    const otherUserId =
      currentMatch.user1_id === profileId
        ? currentMatch.user2_id
        : currentMatch.user1_id;
    const otherUser =
      currentMatch.user1_id === profileId
        ? currentMatch.user2
        : currentMatch.user1;

    if (!otherUser) {
      console.error("Other user data not found");
      // Still close the modal even if otherUser is missing
      setIsShowingMatch(false);
      setCurrentMatch(null);
      return;
    }

    // Close the modal FIRST — don't block on async operations
    setIsShowingMatch(false);
    setCurrentMatch(null);

    // Mark match as seen in the background (non-blocking)
    markMatchAsSeen(matchId).catch((err) =>
      console.error("[MatchContext] markMatchAsSeen failed:", err),
    );

    try {
      // Get or create chat between the two users
      const chatResponse = await DataProvider.getOrCreateChatBetweenUsers(
        profileId,
        otherUserId,
        matchId,
      );

      if (chatResponse.success && chatResponse.data) {
        const chatId = chatResponse.data;

        // Send the first message if provided
        if (message) {
          try {
            await DataProvider.sendMessage(
              chatId,
              profileId,
              otherUserId,
              message,
            );
            console.log("[MatchContext] First message sent from celebration modal");
          } catch (msgError) {
            console.error("[MatchContext] Failed to send first message:", msgError);
          }
        }

        // Navigate to chat screen
        navigation.navigate("Chat", {
          chatId,
          userId: otherUserId,
          userName: otherUser.name || "ユーザー",
          userImage:
            otherUser.profile_pictures && otherUser.profile_pictures[0]
              ? otherUser.profile_pictures[0]
              : "",
        });
      } else {
        console.error("Failed to create/get chat:", chatResponse.error);
      }
    } catch (error) {
      console.error("Error navigating to chat:", error);
    }
  }, [currentMatch, profileId, navigation]);

  const handleClose = useCallback(async () => {
    if (!currentMatch || !profileId) return;

    const matchId = currentMatch.id;

    // Close the modal FIRST — don't block on async operations
    setIsShowingMatch(false);
    setCurrentMatch(null);

    // Mark match as seen in the background (non-blocking)
    markMatchAsSeen(matchId).catch((err) =>
      console.error("[MatchContext] markMatchAsSeen failed:", err),
    );
  }, [currentMatch, profileId]);

  // Note: We no longer auto-show queued matches
  // Modal only appears for real-time new matches
  // Users can view all their matches on the つながり page under マッチ tab

  // Prepare match data for the modal - memoize to prevent unnecessary re-renders
  const matchData = React.useMemo(() => {
    if (!currentMatch) return null;
    return {
      matchId: currentMatch.id,
      otherUser: {
        id:
          currentMatch.user1_id === profileId
            ? currentMatch.user2_id
            : currentMatch.user1_id,
        name:
          currentMatch.user1_id === profileId
            ? currentMatch.user2?.name || "ユーザー"
            : currentMatch.user1?.name || "ユーザー",
        image:
          currentMatch.user1_id === profileId
            ? currentMatch.user2?.profile_pictures?.[0] || ""
            : currentMatch.user1?.profile_pictures?.[0] || "",
      },
      currentUser: currentUserProfile || undefined,
    };
  }, [currentMatch, profileId, currentUserProfile]);

  const contextValue: MatchContextType = React.useMemo(() => ({
    isShowingMatch,
    currentMatch,
  }), [isShowingMatch, currentMatch]);

  return (
    <MatchContext.Provider value={contextValue}>
      {children}
      {matchData && (
        <MatchCelebrationModal
          visible={isShowingMatch}
          matchData={matchData}
          onSendMessage={handleSendMessage}
          onClose={handleClose}
        />
      )}
    </MatchContext.Provider>
  );
};

export const useMatch = (): MatchContextType => {
  const context = useContext(MatchContext);
  if (context === undefined) {
    throw new Error("useMatch must be used within MatchProvider");
  }
  return context;
};

