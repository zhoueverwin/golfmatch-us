// Shared formatting utilities
// Consolidated from duplicate code across multiple files

/**
 * Convert age to Japanese age range string
 * @param age - The age number
 * @returns Japanese age range string (e.g., "30代前半")
 */
export const getAgeRange = (age: number): string => {
  if (age < 25) return "20代前半";
  if (age < 30) return "20代後半";
  if (age < 35) return "30代前半";
  if (age < 40) return "30代後半";
  if (age < 45) return "40代前半";
  if (age < 50) return "40代後半";
  return "50代以上";
};

/**
 * Convert golf skill level to Japanese display text
 * Handles both Japanese and English skill level values
 * @param level - The skill level string (can be null/undefined)
 * @returns Japanese skill level text
 */
export const getSkillLevelText = (level: string | null | undefined): string => {
  if (!level) return "未設定";

  switch (level) {
    // Japanese values (from database)
    case "ビギナー":
      return "ビギナー";
    case "中級者":
      return "中級者";
    case "上級者":
      return "上級者";
    case "プロ":
      return "プロ";
    // English values (for backward compatibility)
    case "beginner":
      return "ビギナー";
    case "intermediate":
      return "中級者";
    case "advanced":
      return "上級者";
    case "professional":
      return "プロ";
    default:
      return "未設定";
  }
};

/**
 * Format a timestamp to relative time (e.g., "5分前", "3時間前")
 * @param timestamp - ISO timestamp string
 * @returns Formatted relative time string in Japanese
 */
export const formatRelativeTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) {
    return "たった今";
  } else if (minutes < 60) {
    return `${minutes}分前`;
  } else if (hours < 24) {
    return `${hours}時間前`;
  } else if (days < 7) {
    return `${days}日前`;
  } else {
    return date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
  }
};

/**
 * Check if a user is online based on last_active_at timestamp
 * @param lastActiveAt - ISO timestamp string or null
 * @param thresholdMinutes - Minutes threshold for "online" status (default: 5)
 * @returns boolean indicating if user is online
 */
export const isUserOnline = (
  lastActiveAt: string | null | undefined,
  thresholdMinutes: number = 5
): boolean => {
  if (!lastActiveAt) return false;
  const now = new Date().getTime();
  const lastActive = new Date(lastActiveAt).getTime();
  return now - lastActive < thresholdMinutes * 60 * 1000;
};

/**
 * Calculate age from birth date
 * @param birthDate - ISO date string (YYYY-MM-DD) or Date object
 * @returns Age in years
 */
export const calculateAge = (birthDate: string | Date): number => {
  const birth = typeof birthDate === 'string' ? new Date(birthDate) : birthDate;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
};

/**
 * Format birth date for display in Japanese
 * @param birthDate - ISO date string (YYYY-MM-DD)
 * @returns Formatted string like "1990年5月15日"
 */
export const formatBirthDateJapanese = (birthDate: string): string => {
  const date = new Date(birthDate);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
};

/**
 * Convert HTML text to plain text with preserved line breaks
 * Useful for API responses that contain HTML formatting (like Rakuten GORA captions)
 * @param html - HTML string to convert
 * @returns Plain text with line breaks preserved
 */
export const htmlToPlainText = (html: string | null | undefined): string => {
  if (!html) return '';

  let text = html;

  // Convert <br>, <br/>, <br /> to newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Convert </p> and <p> to double newlines (paragraph breaks)
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<p[^>]*>/gi, '');

  // Convert </div> to newlines
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<div[^>]*>/gi, '');

  // Decode common HTML entities
  text = text.replace(/&nbsp;/gi, ' ');
  text = text.replace(/&amp;/gi, '&');
  text = text.replace(/&lt;/gi, '<');
  text = text.replace(/&gt;/gi, '>');
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#39;/gi, "'");
  text = text.replace(/&yen;/gi, '¥');
  text = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));

  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Clean up multiple consecutive newlines (max 2)
  text = text.replace(/\n{3,}/g, '\n\n');

  // Trim whitespace from each line while preserving line breaks
  text = text
    .split('\n')
    .map(line => line.trim())
    .join('\n');

  // Trim start and end
  text = text.trim();

  return text;
};

/**
 * Normalize prefecture name by removing 都/府/県/道 suffix.
 * Profiles use "東京都", "千葉県" etc. but GORA/golf_courses use "東京", "千葉".
 */
export function normalizePrefecture(prefecture: string): string {
  if (!prefecture || prefecture === '未設定') return '';
  // 北海道 stays as-is (removing 道 would leave just 北海)
  if (prefecture === '北海道') return '北海道';
  return prefecture.replace(/[都府県]$/, '');
}

/**
 * Format Japanese text with natural line breaks for better readability
 * Adds line breaks after Japanese sentence endings and before URLs
 * Useful for API responses that return continuous text (like Rakuten GORA captions)
 * @param text - Plain text string to format
 * @returns Formatted text with natural line breaks
 */
export const formatJapaneseText = (text: string | null | undefined): string => {
  if (!text) return '';

  let formatted = text;

  // First apply HTML conversion if any HTML exists
  formatted = htmlToPlainText(formatted);

  // Add line break before URLs (http:// or https://)
  formatted = formatted.replace(/(https?:\/\/)/g, '\n$1');

  // Add line break after Japanese sentence endings (。) but not if followed by 」or another punctuation
  formatted = formatted.replace(/。(?![」）\)])/g, '。\n');

  // Add line break after specific markers that indicate new sections
  formatted = formatted.replace(/([♪★●◆■▼▲])/g, '\n$1');

  // Add line break before 【 and after 】 (Japanese bracket sections like 【お得情報】)
  formatted = formatted.replace(/【/g, '\n\n【');
  formatted = formatted.replace(/】/g, '】\n');

  // Add line break after access information patterns (ICより followed by distance)
  formatted = formatted.replace(/(ICより\d+km（\d+分）)/g, '$1\n');

  // Clean up multiple consecutive newlines (max 2)
  formatted = formatted.replace(/\n{3,}/g, '\n\n');

  // Trim whitespace from each line
  formatted = formatted
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0) // Remove empty lines
    .join('\n');

  return formatted.trim();
};
