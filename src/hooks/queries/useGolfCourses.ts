/**
 * React Query hooks for Golf Course search
 *
 * Provides:
 * - Course search with debouncing
 * - Popular courses query
 * - Single course query
 */

import { useQuery } from '@tanstack/react-query';
import { golfCourseService } from '../../services/golfCourseService';
import { GolfCourse, PREFECTURE_REGIONS } from '../../types';
import { normalizePrefecture } from '../../utils/formatters';

// Query key factory
export const golfCourseKeys = {
  all: ['golfCourses'] as const,
  search: (query: string, prefecture?: string) => [...golfCourseKeys.all, 'search', query, prefecture] as const,
  detail: (id: string) => [...golfCourseKeys.all, 'detail', id] as const,
  popular: (prefecture?: string) => [...golfCourseKeys.all, 'popular', prefecture] as const,
  pricing: (goraCourseId: string, playDate: string) =>
    [...golfCourseKeys.all, 'pricing', goraCourseId, playDate] as const,
  areaSearch: (prefecture: string, keyword: string) =>
    [...golfCourseKeys.all, 'area', prefecture, keyword] as const,
  recommended: (prefecture: string) => [...golfCourseKeys.all, 'recommended', prefecture] as const,
};

interface UseSearchCoursesOptions {
  query: string;
  prefecture?: string;
  limit?: number;
  enabled?: boolean;
}

/**
 * Hook for searching golf courses
 *
 * Searches local database first, then Rakuten GORA API if needed.
 * Results are cached for future searches.
 *
 * @example
 * ```tsx
 * const { courses, isLoading } = useSearchCourses({
 *   query: 'Tokyo',
 *   prefecture: '東京',
 * });
 * ```
 */
export const useSearchCourses = ({
  query,
  prefecture,
  limit = 20,
  enabled = true,
}: UseSearchCoursesOptions) => {
  const result = useQuery({
    queryKey: golfCourseKeys.search(query, prefecture),
    queryFn: async () => {
      const response = await golfCourseService.searchCourses(query, prefecture, limit);
      if (!response.success) {
        throw new Error(response.error || 'Failed to search courses');
      }
      return response.data || [];
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - course data doesn't change often
    gcTime: 60 * 60 * 1000, // 1 hour
    // Only search if query has at least 2 characters (or filtering by prefecture)
    enabled: enabled && (query.length >= 2 || !!prefecture),
    // Don't refetch on focus/reconnect since data is fairly static
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return {
    courses: result.data || [],
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
  };
};

/**
 * Hook for fetching a single course by ID
 */
export const useCourse = (courseId: string, enabled = true) => {
  return useQuery({
    queryKey: golfCourseKeys.detail(courseId),
    queryFn: async () => {
      const response = await golfCourseService.getCourse(courseId);
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch course');
      }
      return response.data;
    },
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000,
    enabled: !!courseId && enabled,
    refetchOnWindowFocus: false,
  });
};

/**
 * Hook for fetching popular courses
 *
 * Returns courses sorted by rating (evaluation).
 */
export const usePopularCourses = (prefecture?: string, limit = 10, enabled = true) => {
  const result = useQuery({
    queryKey: golfCourseKeys.popular(prefecture),
    queryFn: async () => {
      const response = await golfCourseService.getPopularCourses(prefecture, limit);
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch popular courses');
      }
      return response.data || [];
    },
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000,
    enabled,
    refetchOnWindowFocus: false,
  });

  return {
    courses: result.data || [],
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error,
  };
};

/**
 * Hook for fetching course pricing (plans) for a specific date.
 * Uses the Rakuten GORA Plan Search API.
 */
export const useCoursePricing = (
  goraCourseId: string,
  playDate: string,
  enabled = true
) => {
  return useQuery({
    queryKey: golfCourseKeys.pricing(goraCourseId, playDate),
    queryFn: async () => {
      const response = await golfCourseService.getCoursePricing(goraCourseId, playDate);
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch pricing');
      }
      return response.data;
    },
    staleTime: 15 * 60 * 1000, // 15 minutes - pricing can change
    gcTime: 30 * 60 * 1000,
    enabled: !!goraCourseId && !!playDate && enabled,
    refetchOnWindowFocus: false,
  });
};

/**
 * Hook for searching courses by prefecture (area-based browsing).
 * Used on the Course Search screen for discovery.
 */
export const useAreaCourses = (
  prefecture: string,
  keyword?: string,
  limit = 30,
  enabled = true
) => {
  const result = useQuery({
    queryKey: golfCourseKeys.areaSearch(prefecture, keyword || ''),
    queryFn: async () => {
      const response = await golfCourseService.searchCourses(
        keyword || '',
        prefecture,
        limit
      );
      if (!response.success) {
        throw new Error(response.error || 'Failed to search courses');
      }
      return response.data || [];
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    enabled: !!prefecture && enabled,
    refetchOnWindowFocus: false,
  });

  return {
    courses: result.data || [],
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
  };
};

/**
 * Get nearby prefectures for a given prefecture (same region).
 * E.g., 東京 → [東京, 神奈川, 埼玉, 千葉, 茨城, 栃木, 群馬]
 */
function getNearbyPrefectures(prefecture: string): string[] {
  const normalized = normalizePrefecture(prefecture);
  if (!normalized) return [];

  const region = PREFECTURE_REGIONS.find(r =>
    r.prefectures.includes(normalized)
  );
  return region ? region.prefectures : [normalized];
}

/**
 * Hook for fetching personalized recommended courses.
 *
 * Strategy (API-first for accurate data):
 * 1. Find the user's region based on their profile prefecture
 * 2. Call golfCourseService.searchCourses() for each prefecture in the region
 *    - This calls GORA API when local cache is insufficient
 *    - Auto-caches API results to golf_courses table
 * 3. Merge all results, deduplicate, sort by rating descending
 */
export const useRecommendedCourses = (
  userPrefecture: string | undefined,
  limit = 10,
  enabled = true
) => {
  const normalizedPref = userPrefecture ? normalizePrefecture(userPrefecture) : '';

  const result = useQuery({
    queryKey: golfCourseKeys.recommended(normalizedPref),
    queryFn: async () => {
      if (!normalizedPref) {
        // No prefecture set — fetch nationwide top-rated via GORA API
        const response = await golfCourseService.searchGoraApi('', undefined, 1, limit);
        if (response.success && response.data) {
          return response.data
            .sort((a, b) => (b.evaluation || 0) - (a.evaluation || 0))
            .slice(0, limit);
        }
        return [];
      }

      const nearbyPrefs = getNearbyPrefectures(normalizedPref);

      // Fetch courses for each prefecture in the region (parallelized)
      const results = await Promise.allSettled(
        nearbyPrefs.map(pref =>
          golfCourseService.searchCourses('', pref, 10)
        )
      );

      // Merge, deduplicate, sort by rating
      const allCourses: GolfCourse[] = [];
      const seenIds = new Set<string>();

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.success && r.value.data) {
          for (const course of r.value.data) {
            const key = course.gora_course_id || course.id;
            if (!seenIds.has(key)) {
              seenIds.add(key);
              allCourses.push(course);
            }
          }
        }
      }

      return allCourses
        .sort((a, b) => (b.evaluation || 0) - (a.evaluation || 0))
        .slice(0, limit);
    },
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000,
    enabled: enabled,
    refetchOnWindowFocus: false,
  });

  return {
    courses: result.data || [],
    regionName: normalizedPref
      ? PREFECTURE_REGIONS.find(r => r.prefectures.includes(normalizedPref))?.region || ''
      : '',
    isLoading: result.isLoading,
    isError: result.isError,
  };
};
