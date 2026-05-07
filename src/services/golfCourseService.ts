/**
 * Golf Course Service
 *
 * Provides golf course search functionality with:
 * 1. Local database cache (fast)
 * 2. Rakuten GORA API integration (comprehensive)
 *
 * Caching Strategy:
 * - Search local golf_courses table first
 * - If insufficient results, query Rakuten GORA API
 * - Cache API results to local table for future searches
 */

import { supabase } from './supabase';
import Constants from 'expo-constants';
import {
  GolfCourse,
  GoraApiCourse,
  GoraApiResponse,
  GoraPlanApiResponse,
  CoursePricing,
  PlanDisplayInfo,
  ServiceResponse,
} from '../types';

// Rakuten GORA API configuration
const GORA_API_ENDPOINT = 'https://app.rakuten.co.jp/services/api/Gora/GoraGolfCourseSearch/20170623';
const GORA_PLAN_API_ENDPOINT = 'https://app.rakuten.co.jp/services/api/Gora/GoraPlanSearch/20170623';

// Get Rakuten App ID from environment
const RAKUTEN_APP_ID =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_RAKUTEN_APP_ID ||
  process.env.EXPO_PUBLIC_RAKUTEN_APP_ID;

// Prefecture to GORA area code mapping
// GORA uses numeric area codes for prefectures
const PREFECTURE_TO_AREA_CODE: Record<string, string> = {
  '北海道': '1',
  '青森': '2', '岩手': '3', '宮城': '4', '秋田': '5', '山形': '6', '福島': '7',
  '茨城': '8', '栃木': '9', '群馬': '10', '埼玉': '11', '千葉': '12', '東京': '13', '神奈川': '14',
  '新潟': '15', '富山': '16', '石川': '17', '福井': '18', '山梨': '19', '長野': '20',
  '岐阜': '21', '静岡': '22', '愛知': '23', '三重': '24',
  '滋賀': '25', '京都': '26', '大阪': '27', '兵庫': '28', '奈良': '29', '和歌山': '30',
  '鳥取': '31', '島根': '32', '岡山': '33', '広島': '34', '山口': '35',
  '徳島': '36', '香川': '37', '愛媛': '38', '高知': '39',
  '福岡': '40', '佐賀': '41', '長崎': '42', '熊本': '43', '大分': '44', '宮崎': '45', '鹿児島': '46', '沖縄': '47',
};

// Extract prefecture from GORA address
function extractPrefecture(address: string): string {
  // GORA addresses typically start with prefecture name
  for (const pref of Object.keys(PREFECTURE_TO_AREA_CODE)) {
    if (address.startsWith(pref)) {
      return pref;
    }
    // Also check for "県" suffix versions
    if (address.startsWith(pref + '県') || address.startsWith(pref + '都') ||
        address.startsWith(pref + '府') || address.startsWith(pref + '道')) {
      return pref;
    }
  }
  // Fallback: try to extract first 2-4 characters
  const match = address.match(/^(.{2,4}?)[県都府道]/);
  return match ? match[1] : '不明';
}

class GolfCourseService {
  /**
   * Transform GORA API response to GolfCourse interface
   */
  private transformGoraToGolfCourse(gora: GoraApiCourse): Omit<GolfCourse, 'id' | 'created_at' | 'updated_at'> {
    return {
      gora_course_id: String(gora.golfCourseId),
      name: gora.golfCourseName,
      name_kana: gora.golfCourseNameKana,
      prefecture: gora.prefecture || extractPrefecture(gora.address),
      address: gora.address,
      latitude: gora.latitude,
      longitude: gora.longitude,
      image_url: gora.golfCourseImageUrl,
      reserve_url: gora.reserveCalUrl,
      evaluation: gora.evaluation,
    };
  }

  /**
   * Search courses from local database (fast)
   */
  async searchLocalCourses(
    query: string,
    prefecture?: string,
    limit: number = 20
  ): Promise<ServiceResponse<GolfCourse[]>> {
    try {
      let dbQuery = supabase
        .from('golf_courses')
        .select('*')
        .limit(limit);

      // Add text search if query provided
      if (query && query.trim()) {
        // Use ilike for fuzzy matching on name
        dbQuery = dbQuery.or(`name.ilike.%${query}%,name_kana.ilike.%${query}%`);
      }

      // Filter by prefecture if provided
      if (prefecture) {
        dbQuery = dbQuery.eq('prefecture', prefecture);
      }

      // Order by evaluation (rating) descending
      dbQuery = dbQuery.order('evaluation', { ascending: false, nullsFirst: false });

      const { data, error } = await dbQuery;

      if (error) throw error;

      return {
        success: true,
        data: data || [],
      };
    } catch (error: any) {
      console.error('Error searching local courses:', error);
      return {
        success: false,
        error: error.message || 'Failed to search local courses',
        data: [],
      };
    }
  }

  /**
   * Search courses from Rakuten GORA API
   */
  async searchGoraApi(
    keyword: string,
    prefecture?: string,
    page: number = 1,
    hits: number = 30
  ): Promise<ServiceResponse<GolfCourse[]>> {
    if (!RAKUTEN_APP_ID) {
      console.warn('Rakuten App ID not configured, skipping GORA API search');
      return {
        success: false,
        error: 'Rakuten API not configured',
        data: [],
      };
    }

    try {
      // Build API URL
      const params = new URLSearchParams({
        format: 'json',
        applicationId: RAKUTEN_APP_ID,
        hits: String(hits),
        page: String(page),
      });

      if (keyword && keyword.trim()) {
        params.append('keyword', keyword);
      }

      if (prefecture && PREFECTURE_TO_AREA_CODE[prefecture]) {
        params.append('areaCode', PREFECTURE_TO_AREA_CODE[prefecture]);
      }

      const url = `${GORA_API_ENDPOINT}?${params.toString()}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`GORA API error: ${response.status}`);
      }

      const data: GoraApiResponse = await response.json();

      if (!data.Items || data.Items.length === 0) {
        return {
          success: true,
          data: [],
        };
      }

      // Transform API response to GolfCourse objects
      const courses = data.Items.map(item => {
        const transformed = this.transformGoraToGolfCourse(item.Item);
        return {
          id: '', // Will be assigned when cached
          ...transformed,
        } as GolfCourse;
      });

      return {
        success: true,
        data: courses,
      };
    } catch (error: any) {
      console.error('Error searching GORA API:', error);
      return {
        success: false,
        error: error.message || 'Failed to search GORA API',
        data: [],
      };
    }
  }

  /**
   * Cache a course from GORA API to local database
   * Uses upsert to handle duplicates gracefully
   */
  async cacheCourse(course: Omit<GolfCourse, 'id' | 'created_at' | 'updated_at'>): Promise<ServiceResponse<GolfCourse>> {
    try {
      const { data, error } = await supabase
        .from('golf_courses')
        .upsert(
          {
            gora_course_id: course.gora_course_id,
            name: course.name,
            name_kana: course.name_kana,
            prefecture: course.prefecture,
            address: course.address,
            latitude: course.latitude,
            longitude: course.longitude,
            image_url: course.image_url,
            reserve_url: course.reserve_url,
            evaluation: course.evaluation,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'gora_course_id',
            ignoreDuplicates: false,
          }
        )
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data: data,
      };
    } catch (error: any) {
      console.error('Error caching course:', error);
      return {
        success: false,
        error: error.message || 'Failed to cache course',
      };
    }
  }

  /**
   * Main search function: searches local first, then GORA API if needed
   * Caches API results for future searches
   */
  async searchCourses(
    query: string,
    prefecture?: string,
    limit: number = 20
  ): Promise<ServiceResponse<GolfCourse[]>> {
    try {
      // 1. Search local database first
      const localResult = await this.searchLocalCourses(query, prefecture, limit);

      if (localResult.success && localResult.data && localResult.data.length >= limit) {
        // Sufficient local results
        return localResult;
      }

      // 2. If insufficient local results, search GORA API
      const goraResult = await this.searchGoraApi(query, prefecture, 1, limit);

      if (!goraResult.success || !goraResult.data || goraResult.data.length === 0) {
        // Return whatever local results we have
        return localResult;
      }

      // 3. Cache GORA results and get their database IDs
      const coursesToCache = goraResult.data.filter(c => c.gora_course_id);
      const cachedCourses: GolfCourse[] = [];

      // Cache courses synchronously to ensure IDs are available when user selects
      await Promise.all(
        coursesToCache.map(async (course) => {
          const result = await this.cacheCourse({
            gora_course_id: course.gora_course_id,
            name: course.name,
            name_kana: course.name_kana,
            prefecture: course.prefecture,
            address: course.address,
            latitude: course.latitude,
            longitude: course.longitude,
            image_url: course.image_url,
            reserve_url: course.reserve_url,
            evaluation: course.evaluation,
          });
          if (result.success && result.data) {
            cachedCourses.push(result.data);
          }
        })
      );

      // 4. Merge local and cached GORA results, avoiding duplicates
      const localCourses = localResult.data || [];
      const localGoraIds = new Set(localCourses.map(c => c.gora_course_id).filter(Boolean));

      // Use cached courses (with proper IDs) instead of raw GORA results
      const newCourses = cachedCourses.filter(
        c => !localGoraIds.has(c.gora_course_id)
      );

      const mergedCourses = [...localCourses, ...newCourses].slice(0, limit);

      return {
        success: true,
        data: mergedCourses,
      };
    } catch (error: any) {
      console.error('Error in searchCourses:', error);
      return {
        success: false,
        error: error.message || 'Failed to search courses',
        data: [],
      };
    }
  }

  /**
   * Get a course by ID
   */
  async getCourse(courseId: string): Promise<ServiceResponse<GolfCourse | null>> {
    try {
      const { data, error } = await supabase
        .from('golf_courses')
        .select('*')
        .eq('id', courseId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Not found
          return {
            success: true,
            data: null,
          };
        }
        throw error;
      }

      return {
        success: true,
        data: data,
      };
    } catch (error: any) {
      console.error('Error getting course:', error);
      return {
        success: false,
        error: error.message || 'Failed to get course',
      };
    }
  }

  /**
   * Get a course by GORA ID
   */
  async getCourseByGoraId(goraId: string): Promise<ServiceResponse<GolfCourse | null>> {
    try {
      const { data, error } = await supabase
        .from('golf_courses')
        .select('*')
        .eq('gora_course_id', goraId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return {
            success: true,
            data: null,
          };
        }
        throw error;
      }

      return {
        success: true,
        data: data,
      };
    } catch (error: any) {
      console.error('Error getting course by GORA ID:', error);
      return {
        success: false,
        error: error.message || 'Failed to get course',
      };
    }
  }

  /**
   * Get popular courses (by evaluation rating)
   */
  async getPopularCourses(
    prefecture?: string,
    limit: number = 10
  ): Promise<ServiceResponse<GolfCourse[]>> {
    try {
      let query = supabase
        .from('golf_courses')
        .select('*')
        .not('evaluation', 'is', null)
        .order('evaluation', { ascending: false })
        .limit(limit);

      if (prefecture) {
        query = query.eq('prefecture', prefecture);
      }

      const { data, error } = await query;

      if (error) throw error;

      return {
        success: true,
        data: data || [],
      };
    } catch (error: any) {
      console.error('Error getting popular courses:', error);
      return {
        success: false,
        error: error.message || 'Failed to get popular courses',
        data: [],
      };
    }
  }

  /**
   * Get pricing information for a course on a specific date
   * Uses the Rakuten GORA Plan Search API
   */
  async getCoursePricing(
    goraCourseId: string,
    playDate: string // Format: YYYY-MM-DD
  ): Promise<ServiceResponse<CoursePricing | null>> {
    if (!RAKUTEN_APP_ID) {
      return {
        success: false,
        error: 'Rakuten API not configured',
        data: null,
      };
    }

    try {
      // Build API URL
      const params = new URLSearchParams({
        format: 'json',
        applicationId: RAKUTEN_APP_ID,
        golfCourseId: goraCourseId,
        playDate: playDate, // API expects YYYY-MM-DD format
        hits: '30', // Get enough plans to find min/max
      });

      const url = `${GORA_PLAN_API_ENDPOINT}?${params.toString()}`;
      const response = await fetch(url);

      if (!response.ok) {
        // API returns 400 for invalid dates (past dates, dates outside booking window)
        // This is expected behavior - silently return null instead of throwing
        return {
          success: true,
          data: null,
        };
      }

      const data: GoraPlanApiResponse = await response.json();

      if (!data.Items || data.Items.length === 0) {
        return {
          success: true,
          data: null, // No plans available for this date
        };
      }

      const courseData = data.Items[0].Item;
      const planInfo = courseData.planInfo || [];

      if (planInfo.length === 0) {
        return {
          success: true,
          data: null, // No plans available
        };
      }

      // Extract prices from planInfo array
      const prices = planInfo.map(p => p.plan.price);
      const hasLunchIncluded = planInfo.some(p => p.plan.lunch === 1);
      const caption = courseData.golfCourseCaption;

      // Build plan display info for bottom sheet
      // Use PC URLs for affiliate tracking (rafcid parameter)
      const plans: PlanDisplayInfo[] = planInfo.map(p => ({
        planId: p.plan.planId,
        planName: p.plan.planName,
        price: p.plan.price,
        hasLunch: p.plan.lunch === 1,
        hasCart: p.plan.cart > 0,
        hasCaddie: p.plan.caddie === 1,
        round: p.plan.round,
        reserveUrl: p.plan.callInfo?.reservePageUrlPC,
        stockStatus: p.plan.callInfo?.stockStatus,
      })).sort((a, b) => a.price - b.price); // Sort by price ascending

      const pricing: CoursePricing = {
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        planCount: planInfo.length,
        hasLunchIncluded,
        caption,
        plans,
      };

      return {
        success: true,
        data: pricing,
      };
    } catch (error: any) {
      console.error('Error fetching course pricing:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch pricing',
        data: null,
      };
    }
  }
}

export const golfCourseService = new GolfCourseService();
export default golfCourseService;
