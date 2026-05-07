// Shared formatting utilities
// Consolidated from duplicate code across multiple files

/**
 * Convert age to age range string
 * @param age - The age number
 * @returns Age range string (e.g., "Early 30s")
 */
export const getAgeRange = (age: number): string => {
  if (age < 25) return "Early 20s";
  if (age < 30) return "Late 20s";
  if (age < 35) return "Early 30s";
  if (age < 40) return "Late 30s";
  if (age < 45) return "Early 40s";
  if (age < 50) return "Late 40s";
  return "50+";
};

/**
 * Convert golf skill level to display text
 * Handles both Japanese and English skill level values (database may contain legacy JP values)
 * @param level - The skill level string (can be null/undefined)
 * @returns Skill level display text
 */
export const getSkillLevelText = (level: string | null | undefined): string => {
  if (!level) return "Not set";

  switch (level) {
    case "Beginner":
    case "Intermediate":
    case "Advanced":
    case "Pro":
      return level;
    // Lowercase variants from older clients
    case "beginner":
      return "Beginner";
    case "intermediate":
      return "Intermediate";
    case "advanced":
      return "Advanced";
    case "professional":
      return "Pro";
    default:
      return "Not set";
  }
};

/**
 * Format a timestamp to relative time (e.g., "5 min ago", "3 hours ago")
 * @param timestamp - ISO timestamp string
 * @returns Formatted relative time string
 */
export const formatRelativeTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) {
    return "Just now";
  } else if (minutes < 60) {
    return `${minutes} min ago`;
  } else if (hours < 24) {
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  } else if (days < 7) {
    return `${days} ${days === 1 ? "day" : "days"} ago`;
  } else {
    return date.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
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
 * Format birth date for display
 * @param birthDate - ISO date string (YYYY-MM-DD)
 * @returns Formatted string like "May 15, 1990"
 */
export const formatBirthDateJapanese = (birthDate: string): string => {
  const date = new Date(birthDate);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
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

