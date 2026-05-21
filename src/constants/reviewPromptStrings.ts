/**
 * Strings for the in-app review prompt feature.
 *
 * The native OS prompt (StoreReview.requestReview) uses its own copy that we
 * cannot customize. These strings are reserved for follow-up surfaces such as
 * the "Send feedback" entry point and any pre-prompt UI we might add later.
 *
 * Centralized here so the eventual i18n migration only touches one file per
 * feature instead of every component.
 */
export const reviewPromptStrings = {
  analytics: {
    eventName: 'review_prompt_requested',
    triggerFirstReply: 'first_reply',
  },
} as const;
