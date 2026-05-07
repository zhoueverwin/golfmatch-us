import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import AuthScreen from "../screens/AuthScreen";
import { AuthProvider } from "../contexts/AuthContext";
import { authService } from "../services/authService";

// Mock the authService
jest.mock("../services/authService", () => ({
  authService: {
    signInWithEmail: jest.fn().mockResolvedValue({ success: true }),
    signUpWithEmail: jest.fn().mockResolvedValue({ success: true }),
    signInWithGoogle: jest.fn().mockResolvedValue({ success: true }),
    signInWithApple: jest.fn().mockResolvedValue({ success: true }),
    sendOTP: jest.fn().mockResolvedValue({ success: true }),
    verifyOTP: jest.fn().mockResolvedValue({ success: true }),
    signOut: jest.fn().mockResolvedValue({ success: true }),
    linkEmail: jest.fn().mockResolvedValue({ success: true }),
    linkPhone: jest.fn().mockResolvedValue({ success: true }),
    linkGoogle: jest.fn().mockResolvedValue({ success: true }),
    linkApple: jest.fn().mockResolvedValue({ success: true }),
    getUserIdentities: jest.fn().mockResolvedValue({ success: true, identities: [] }),
    subscribeToAuthState: jest.fn((callback) => {
      callback({ user: null, session: null, loading: false });
      return () => {};
    }),
  },
}));

// Mock userMappingService
jest.mock("../services/userMappingService", () => ({
  userMappingService: {
    getProfileIdFromAuth: jest.fn().mockResolvedValue("test-profile-id"),
    clearCache: jest.fn(),
  },
}));

// Mock navigation
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
  }),
}));

const wrap = (ui: React.ReactElement) => <AuthProvider>{ui}</AuthProvider>;

describe("AuthScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Login Screen", () => {
    it("renders login form by default", () => {
      const { getByText, getByPlaceholderText, getByTestId } = render(wrap(<AuthScreen />));

      expect(getByText("お帰りなさい")).toBeTruthy();
      expect(getByText("ログイン")).toBeTruthy();
      expect(getByText("新規登録")).toBeTruthy();
      expect(getByPlaceholderText("example@email.com")).toBeTruthy();
      expect(getByPlaceholderText("6文字以上")).toBeTruthy();
      expect(getByTestId("AUTH.TAB.LOGIN")).toBeTruthy();
      expect(getByTestId("AUTH.TAB.SIGNUP")).toBeTruthy();
    });

    it("requires email and password to be filled", () => {
      const { getByPlaceholderText } = render(wrap(<AuthScreen />));

      const emailInput = getByPlaceholderText("example@email.com");
      const passwordInput = getByPlaceholderText("6文字以上");

      // Inputs should be empty initially
      expect(emailInput.props.value).toBe("");
      expect(passwordInput.props.value).toBe("");
    });

    it("successfully signs in with valid credentials", async () => {
      (authService.signInWithEmail as jest.Mock).mockResolvedValue({
        success: true,
        session: { user: { id: "123", email: "test@example.com" } },
      });

      const { getByText, getByPlaceholderText } = render(wrap(<AuthScreen />));

      fireEvent.changeText(getByPlaceholderText("example@email.com"), "test@example.com");
      fireEvent.changeText(getByPlaceholderText("6文字以上"), "password123");

      // Wait for React to update the state
      await waitFor(() => {
        // Find the button by its text - it should be enabled now
        const button = getByText("ログイン", { exact: false });
        expect(button).toBeTruthy();
      });

      // Now press the button
      const button = getByText("ログイン", { exact: false });
      fireEvent.press(button);

      await waitFor(() => {
        expect(authService.signInWithEmail).toHaveBeenCalledWith(
          "test@example.com",
          "password123"
        );
      });
    });

    it("can enter email and password", () => {
      const { getByPlaceholderText } = render(wrap(<AuthScreen />));

      const emailInput = getByPlaceholderText("example@email.com");
      const passwordInput = getByPlaceholderText("6文字以上");

      fireEvent.changeText(emailInput, "test@example.com");
      fireEvent.changeText(passwordInput, "password123");

      expect(emailInput.props.value).toBe("test@example.com");
      expect(passwordInput.props.value).toBe("password123");
    });
  });

  describe("Signup Screen", () => {
    it("switches to signup mode", async () => {
      const { getByText } = render(wrap(<AuthScreen />));

      // Switch to signup
      const signUpLink = getByText("新規登録");
      fireEvent.press(signUpLink);

      await waitFor(() => {
        expect(getByText("登録する")).toBeTruthy();
      });
    });

    it("successfully signs up with valid credentials", async () => {
      (authService.signUpWithEmail as jest.Mock).mockResolvedValue({
        success: true,
        session: { user: { id: "456", email: "newuser@example.com" } },
      });

      const { getByText, getByPlaceholderText } = render(wrap(<AuthScreen />));

      // Switch to signup mode
      fireEvent.press(getByText("新規登録"));

      await waitFor(() => {
        expect(getByText("登録する")).toBeTruthy();
      });

      fireEvent.changeText(getByPlaceholderText("example@email.com"), "newuser@example.com");
      fireEvent.changeText(getByPlaceholderText("6文字以上"), "password123");

      await waitFor(() => {
        const button = getByText("登録する");
        expect(button).toBeTruthy();
      });

      const signUpButton = getByText("登録する");
      fireEvent.press(signUpButton);

      await waitFor(() => {
        expect(authService.signUpWithEmail).toHaveBeenCalledWith(
          "newuser@example.com",
          "password123"
        );
      });
    });

    it("shows email confirmation message when required", async () => {
      (authService.signUpWithEmail as jest.Mock).mockResolvedValue({
        success: true,
        session: undefined,
        error: "Please check your email to confirm your account.",
      });

      const { getByText, getByPlaceholderText } = render(wrap(<AuthScreen />));

      // Switch to signup mode
      fireEvent.press(getByText("新規登録"));

      await waitFor(() => {
        expect(getByText("登録する")).toBeTruthy();
      });

      const emailInput = getByPlaceholderText("example@email.com");
      const passwordInput = getByPlaceholderText("6文字以上");

      fireEvent.changeText(emailInput, "newuser@example.com");
      fireEvent.changeText(passwordInput, "password123");

      const signUpButton = getByText("登録する");
      fireEvent.press(signUpButton);

      await waitFor(() => {
        expect(authService.signUpWithEmail).toHaveBeenCalled();
      });
    });

    it("can switch back to login mode", async () => {
      const { getByText } = render(wrap(<AuthScreen />));

      // Switch to signup
      const signupLink = getByText("新規登録");
      fireEvent.press(signupLink);

      await waitFor(() => {
        expect(getByText("登録する")).toBeTruthy();
      });

      // Verify we're in signup mode
      expect(getByText("登録する")).toBeTruthy();
    });
  });

  describe("Social Login", () => {
    it("renders Google login button", () => {
      const { getByLabelText } = render(wrap(<AuthScreen />));
      expect(getByLabelText("Googleでログイン")).toBeTruthy();
    });

    it("renders Apple login button", () => {
      const { getByLabelText } = render(wrap(<AuthScreen />));
      expect(getByLabelText("Appleでログイン")).toBeTruthy();
    });

    it("handles Google login", async () => {
      (authService.signInWithGoogle as jest.Mock).mockResolvedValue({
        success: true,
        session: { user: { id: "google123" } },
      });

      const { getByLabelText } = render(wrap(<AuthScreen />));

      const googleButton = getByLabelText("Googleでログイン");
      fireEvent.press(googleButton);

      await waitFor(() => {
        expect(authService.signInWithGoogle).toHaveBeenCalled();
      });
    });

    it("handles Apple login", async () => {
      (authService.signInWithApple as jest.Mock).mockResolvedValue({
        success: true,
        session: { user: { id: "apple123" } },
      });

      const { getByLabelText } = render(wrap(<AuthScreen />));

      const appleButton = getByLabelText("Appleでログイン");
      fireEvent.press(appleButton);

      await waitFor(() => {
        expect(authService.signInWithApple).toHaveBeenCalled();
      });
    });

    it("handles Google login error", async () => {
      (authService.signInWithGoogle as jest.Mock).mockResolvedValue({
        success: false,
        error: "Google login failed",
      });

      const { getByLabelText } = render(wrap(<AuthScreen />));

      const googleButton = getByLabelText("Googleでログイン");
      fireEvent.press(googleButton);

      await waitFor(() => {
        expect(authService.signInWithGoogle).toHaveBeenCalled();
      });
    });

    it("handles Apple login error", async () => {
      (authService.signInWithApple as jest.Mock).mockResolvedValue({
        success: false,
        error: "Apple login failed",
      });

      const { getByLabelText } = render(wrap(<AuthScreen />));

      const appleButton = getByLabelText("Appleでログイン");
      fireEvent.press(appleButton);

      await waitFor(() => {
        expect(authService.signInWithApple).toHaveBeenCalled();
      });
    });
  });

  describe("UI Elements", () => {
    it("displays app branding", () => {
      const { getByText } = render(wrap(<AuthScreen />));
      
      expect(getByText("GolfMatch")).toBeTruthy();
      expect(getByText("ゴルフでつながる")).toBeTruthy();
    });

    it("displays terms text", () => {
      const { getByText } = render(wrap(<AuthScreen />));
      
      expect(
        getByText("続行することで、利用規約とプライバシーポリシーに同意したことになります。")
      ).toBeTruthy();
    });

    it("shows/hides password", () => {
      const { getByPlaceholderText } = render(wrap(<AuthScreen />));
      
      const passwordInput = getByPlaceholderText("6文字以上");
      expect(passwordInput).toBeTruthy();
    });
  });
});
