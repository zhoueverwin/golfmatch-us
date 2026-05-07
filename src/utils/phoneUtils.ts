/**
 * Phone number utility functions
 */

export const formatJapanesePhoneNumber = (input: string): string => {
  // Remove all non-digit characters
  const digits = input.replace(/\D/g, "");

  // Handle different Japanese phone number formats
  if (digits.startsWith("0")) {
    // Remove leading 0 and add +81
    return "+81" + digits.substring(1);
  }

  if (digits.startsWith("81")) {
    // Add + prefix
    return "+" + digits;
  }

  // If it doesn't start with 0 or 81, assume it's already formatted
  return digits.startsWith("+") ? digits : "+81" + digits;
};

export const validateE164PhoneNumber = (phone: string): boolean => {
  // E.164 format: + followed by 1-3 digit country code and 6-14 digit number
  const phoneRegex = /^\+[1-9]\d{6,14}$/;
  return phoneRegex.test(phone);
};

export const formatPhoneNumberForDisplay = (phone: string): string => {
  // Format +819012345678 as +81 90-1234-5678
  if (phone.startsWith("+81")) {
    const number = phone.substring(3);
    if (number.length >= 10) {
      return `+81 ${number.substring(0, 2)}-${number.substring(2, 6)}-${number.substring(6)}`;
    }
  }
  return phone;
};

// Test function to demonstrate the formatting
export const testPhoneFormatting = () => {
  console.log("🧪 Testing Japanese Phone Number Formatting:");

  const testCases = [
    "08022582038", // Japanese mobile starting with 0
    "0312345678", // Japanese landline starting with 0
    "819012345678", // Japanese number with country code
    "+819012345678", // Already formatted
    "9012345678", // Japanese number without leading 0
  ];

  testCases.forEach((testCase) => {
    const formatted = formatJapanesePhoneNumber(testCase);
    const isValid = validateE164PhoneNumber(formatted);
    const display = formatPhoneNumberForDisplay(formatted);

    console.log(`Input: ${testCase}`);
    console.log(`Formatted: ${formatted}`);
    console.log(`Valid: ${isValid ? "✅" : "❌"}`);
    console.log(`Display: ${display}`);
    console.log("---");
  });
};
