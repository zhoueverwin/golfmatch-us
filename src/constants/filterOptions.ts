/**
 * Filter Options Constants
 * Contains all the filter options for the search/filter functionality
 *
 * DATA MIGRATION REQUIRED: This file used to ship Japanese prefectures.
 * Existing rows in profiles.prefecture (and any other column referencing the
 * legacy JP names) must be migrated to US states before launch.
 */

// ============================================================================
// LOCATION OPTIONS (50 US states + DC)
// `prefecture` is the legacy column name in the database; the value space
// is now US states.
// ============================================================================
export const PREFECTURES = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "District of Columbia",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
] as const;

// ============================================================================
// REGION MAPPING (US Census Bureau regions)
// ============================================================================
export const REGION_MAP: Record<string, string[]> = {
  Northeast: [
    "Connecticut",
    "Maine",
    "Massachusetts",
    "New Hampshire",
    "New Jersey",
    "New York",
    "Pennsylvania",
    "Rhode Island",
    "Vermont",
  ],
  Midwest: [
    "Illinois",
    "Indiana",
    "Iowa",
    "Kansas",
    "Michigan",
    "Minnesota",
    "Missouri",
    "Nebraska",
    "North Dakota",
    "Ohio",
    "South Dakota",
    "Wisconsin",
  ],
  South: [
    "Alabama",
    "Arkansas",
    "Delaware",
    "District of Columbia",
    "Florida",
    "Georgia",
    "Kentucky",
    "Louisiana",
    "Maryland",
    "Mississippi",
    "North Carolina",
    "Oklahoma",
    "South Carolina",
    "Tennessee",
    "Texas",
    "Virginia",
    "West Virginia",
  ],
  West: [
    "Alaska",
    "Arizona",
    "California",
    "Colorado",
    "Hawaii",
    "Idaho",
    "Montana",
    "Nevada",
    "New Mexico",
    "Oregon",
    "Utah",
    "Washington",
    "Wyoming",
  ],
};

/** Get all prefectures in the same region as the given prefecture */
export function getRegionPrefectures(prefecture: string): string[] {
  for (const prefectures of Object.values(REGION_MAP)) {
    if (prefectures.includes(prefecture)) {
      return prefectures;
    }
  }
  return [prefecture];
}

// ============================================================================
// GENDER OPTIONS
// ============================================================================
export const GENDER_OPTIONS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
] as const;

// ============================================================================
// GOLF SKILL LEVEL OPTIONS
// `value` is what is stored in profiles.golf_skill_level. Requires the matching
// DB enum migration: ビギナー→Beginner, 中級者→Intermediate, 上級者→Advanced, プロ→Pro.
// ============================================================================
export const SKILL_LEVELS = [
  { value: "Beginner", label: "Beginner" },
  { value: "Intermediate", label: "Intermediate" },
  { value: "Advanced", label: "Advanced" },
  { value: "Pro", label: "Pro" },
] as const;

// ============================================================================
// AGE DECADE OPTIONS
// ============================================================================
export const AGE_DECADES = [
  { value: 20, label: "20s", ageMin: 20, ageMax: 29 },
  { value: 30, label: "30s", ageMin: 30, ageMax: 39 },
  { value: 40, label: "40s", ageMin: 40, ageMax: 49 },
  { value: 50, label: "50s", ageMin: 50, ageMax: 59 },
  { value: 60, label: "60s", ageMin: 60, ageMax: 69 },
  { value: 70, label: "70+", ageMin: 70, ageMax: 120 },
] as const;

// ============================================================================
// AVERAGE SCORE OPTIONS (Maximum score filter)
// ============================================================================
export const SCORE_OPTIONS = [
  { value: 80, label: "80 or below" },
  { value: 90, label: "90 or below" },
  { value: 100, label: "100 or below" },
  { value: 110, label: "110 or below" },
  { value: 120, label: "120 or below" },
  { value: 130, label: "130 or below" },
  { value: 999, label: "Any" },
] as const;

// ============================================================================
// LAST LOGIN OPTIONS (Activity filter)
// ============================================================================
export const LAST_LOGIN_OPTIONS = [
  { value: 1, label: "Within 24 hours" },
  { value: 3, label: "Within 3 days" },
  { value: 7, label: "Within 7 days" },
  { value: 30, label: "Within 30 days" },
  { value: null, label: "Any" },
] as const;

// ============================================================================
// FILTER LABELS (for display)
// ============================================================================
export const FILTER_LABELS = {
  gender: "Gender",
  prefecture: "Location",
  ageDecade: "Age",
  skillLevel: "Golf level",
  averageScore: "Average score",
  lastLogin: "Last login",
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert age decades to age range
 * @param decades Array of decade values (e.g., [20, 30])
 * @returns Object with age_min and age_max
 */
export function decadesToAgeRange(decades: number[]): {
  age_min: number;
  age_max: number;
} | null {
  if (!decades || decades.length === 0) return null;

  const sortedDecades = [...decades].sort((a, b) => a - b);
  const minDecade = AGE_DECADES.find((d) => d.value === sortedDecades[0]);
  const maxDecade = AGE_DECADES.find(
    (d) => d.value === sortedDecades[sortedDecades.length - 1]
  );

  if (!minDecade || !maxDecade) return null;

  return {
    age_min: minDecade.ageMin,
    age_max: maxDecade.ageMax,
  };
}

/**
 * Get label for selected gender
 */
export function getGenderLabel(gender: string | undefined): string {
  if (!gender) return "Any";
  const option = GENDER_OPTIONS.find((g) => g.value === gender);
  return option ? option.label : "Any";
}

/**
 * Get label for selected prefecture
 */
export function getPrefectureLabel(prefecture: string | undefined): string {
  if (!prefecture) return "Any";
  return prefecture;
}

/**
 * Get label for selected skill level
 */
export function getSkillLevelLabel(skillLevel: string | undefined): string {
  if (!skillLevel) return "Any";
  const skill = SKILL_LEVELS.find((s) => s.value === skillLevel);
  return skill ? skill.label : "Any";
}

/**
 * Get label for selected age decades
 */
export function getAgeDecadesLabel(decades: number[] | undefined): string {
  if (!decades || decades.length === 0) return "Any";
  const labels = decades
    .sort((a, b) => a - b)
    .map((d) => AGE_DECADES.find((age) => age.value === d)?.label)
    .filter(Boolean);
  return labels.join(", ");
}

/**
 * Get label for selected score
 */
export function getScoreLabel(score: number | undefined): string {
  if (!score || score === 999) return "Any";
  return `${score} or below`;
}

/**
 * Get label for last login days
 */
export function getLastLoginLabel(days: number | null | undefined): string {
  if (days === null || days === undefined) return "Any";
  const option = LAST_LOGIN_OPTIONS.find((opt) => opt.value === days);
  return option ? option.label : "Any";
}

