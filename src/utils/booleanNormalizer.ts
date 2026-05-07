/**
 * Utility function to normalize boolean values that might come from database as strings
 * Converts string booleans ("true", "false", "t", "1", etc.) to actual JavaScript booleans
 */

export function normalizeBoolean(value: any): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  
  if (typeof value === 'boolean') {
    return value;
  }
  
  if (typeof value === 'string') {
    const lowerValue = value.toLowerCase().trim();
    return lowerValue === 'true' || lowerValue === 't' || lowerValue === '1' || lowerValue === 'yes';
  }
  
  if (typeof value === 'number') {
    return value !== 0;
  }
  
  return Boolean(value);
}

/**
 * Normalize boolean fields in an object
 * Also normalizes nested objects recursively if they contain boolean fields
 */
export function normalizeBooleanFields<T extends Record<string, any>>(
  obj: T,
  booleanFields: string[],
  nestedObjectFields?: string[]
): T {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  const normalized = { ...obj } as any;
  
  // Normalize top-level boolean fields
  for (const field of booleanFields) {
    if (field in normalized) {
      normalized[field] = normalizeBoolean(normalized[field]);
    }
  }
  
  // Normalize nested objects if specified
  if (nestedObjectFields && Array.isArray(nestedObjectFields)) {
    for (const nestedField of nestedObjectFields) {
      if (nestedField in normalized && normalized[nestedField] && typeof normalized[nestedField] === 'object') {
        // Recursively normalize nested object (e.g., user1, user2 profiles)
        // Check for common boolean fields in profiles
        const nestedObj = normalized[nestedField];
        const profileBooleanFields = ['is_verified', 'is_online'];
        normalized[nestedField] = normalizeBooleanFields(
          nestedObj,
          profileBooleanFields.filter(field => field in nestedObj)
        );
      }
    }
  }
  
  return normalized;
}

/**
 * Normalize boolean fields in an array of objects
 * Also supports normalizing nested objects if specified
 */
export function normalizeBooleanFieldsInArray<T extends Record<string, any>>(
  array: T[],
  booleanFields: string[],
  nestedObjectFields?: string[]
): T[] {
  if (!Array.isArray(array)) {
    return array;
  }
  
  return array.map(item => normalizeBooleanFields(item, booleanFields, nestedObjectFields));
}

