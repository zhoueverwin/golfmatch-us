/**
 * YouTube URL detection and parsing utilities.
 *
 * Supports:
 * - youtube.com/watch?v=VIDEO_ID
 * - youtu.be/VIDEO_ID
 * - youtube.com/shorts/VIDEO_ID
 * - m.youtube.com/watch?v=VIDEO_ID
 */

export interface YouTubeVideo {
  videoId: string;
  thumbnailUrl: string;
  embedUrl: string;
}

// Matches all common YouTube URL formats
const YOUTUBE_REGEX =
  /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)([\w-]{11})(?:[^\s]*)?/g;

/**
 * Quick check whether text contains at least one YouTube URL.
 * Cheaper than running full extraction when we only need a boolean.
 */
export function containsYouTubeUrl(text: string | null | undefined): boolean {
  if (!text) return false;
  // Reset lastIndex since the regex is global
  YOUTUBE_REGEX.lastIndex = 0;
  return YOUTUBE_REGEX.test(text);
}

/**
 * Extract all YouTube video references from a block of text.
 * Returns deduplicated results ordered by first appearance.
 */
export function extractYouTubeVideos(
  text: string | null | undefined,
): YouTubeVideo[] {
  if (!text) return [];

  const seen = new Set<string>();
  const results: YouTubeVideo[] = [];

  // Reset lastIndex since the regex is global
  YOUTUBE_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = YOUTUBE_REGEX.exec(text)) !== null) {
    const videoId = match[1];
    if (seen.has(videoId)) continue;
    seen.add(videoId);

    results.push({
      videoId,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      embedUrl: `https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0`,
    });
  }

  return results;
}
