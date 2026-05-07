import { User, Session } from "@supabase/supabase-js";

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

export interface AuthFormData {
  email?: string;
  password?: string;
  phoneNumber?: string;
  otpCode?: string;
}

export interface AuthError {
  message: string;
  code?: string;
}

export interface AuthResult {
  success: boolean;
  error?: string;
  session?: Session;
  message?: string;
}

export interface IdentityProvider {
  id: string;
  name: string;
  type: "email" | "phone" | "google" | "apple";
  isLinked: boolean;
  email?: string;
  phone?: string;
}

export interface AuthNavigationParams {
  Auth: undefined;
  PhoneVerification: { phoneNumber: string };
  EmailVerification: { email: string };
  ForgotPassword: undefined;
}

export type AuthMethod = "phone" | "email" | "google" | "apple";

export interface AuthConfig {
  enablePhoneAuth: boolean;
  enableEmailAuth: boolean;
  enableGoogleAuth: boolean;
  enableAppleAuth: boolean;
  requirePhoneVerification: boolean;
  allowMultipleIdentities: boolean;
}
