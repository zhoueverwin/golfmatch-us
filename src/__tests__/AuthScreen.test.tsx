import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import AuthScreen from "../screens/AuthScreen";
import { AuthProvider } from "../contexts/AuthContext";
import { authService } from "../services/authService";

jest.mock("../services/authService", () => ({
  authService: {
    signInWithGoogle: jest.fn().mockResolvedValue({ success: true }),
    signInWithApple: jest.fn().mockResolvedValue({ success: true }),
    signOut: jest.fn().mockResolvedValue({ success: true }),
    linkEmail: jest.fn().mockResolvedValue({ success: true }),
    linkGoogle: jest.fn().mockResolvedValue({ success: true }),
    linkApple: jest.fn().mockResolvedValue({ success: true }),
    deleteAccount: jest.fn().mockResolvedValue({ success: true }),
    getUserIdentities: jest.fn().mockResolvedValue({ success: true, identities: [] }),
    subscribeToAuthState: jest.fn((callback) => {
      callback({ user: null, session: null, loading: false });
      return () => {};
    }),
  },
}));

jest.mock("../services/userMappingService", () => ({
  userMappingService: {
    getProfileIdFromAuth: jest.fn().mockResolvedValue("test-profile-id"),
    clearCache: jest.fn(),
  },
}));

const wrap = (ui: React.ReactElement) => <AuthProvider>{ui}</AuthProvider>;

describe("AuthScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Layout", () => {
    it("renders the tagline and age notice", () => {
      const { getByText } = render(wrap(<AuthScreen />));
      expect(getByText("New connections that start with golf.")).toBeTruthy();
      expect(getByText("You must be 18 or older to sign up.")).toBeTruthy();
    });

    it("renders Terms of Service and Privacy Policy links", () => {
      const { getByText } = render(wrap(<AuthScreen />));
      expect(getByText("Terms of Service")).toBeTruthy();
      expect(getByText("Privacy Policy")).toBeTruthy();
    });
  });

  describe("Sign-in buttons", () => {
    it("renders the Apple sign-in button", () => {
      const { getByLabelText } = render(wrap(<AuthScreen />));
      expect(getByLabelText("Sign in with Apple")).toBeTruthy();
    });

    it("renders the Google sign-in button", () => {
      const { getByLabelText } = render(wrap(<AuthScreen />));
      expect(getByLabelText("Sign in with Google")).toBeTruthy();
    });

    it("does not render LINE or email sign-in buttons", () => {
      const { queryByLabelText } = render(wrap(<AuthScreen />));
      expect(queryByLabelText("Sign in with LINE")).toBeNull();
      expect(queryByLabelText("Sign in with Email")).toBeNull();
    });
  });

  describe("Apple sign-in", () => {
    it("calls authService.signInWithApple when pressed", async () => {
      (authService.signInWithApple as jest.Mock).mockResolvedValue({
        success: true,
        session: { user: { id: "apple123" } },
      });

      const { getByLabelText } = render(wrap(<AuthScreen />));
      fireEvent.press(getByLabelText("Sign in with Apple"));

      await waitFor(() => {
        expect(authService.signInWithApple).toHaveBeenCalled();
      });
    });

    it("surfaces a failure message when Apple sign-in fails", async () => {
      (authService.signInWithApple as jest.Mock).mockResolvedValue({
        success: false,
        error: "Apple login failed",
      });

      const { getByLabelText, findByText } = render(wrap(<AuthScreen />));
      fireEvent.press(getByLabelText("Sign in with Apple"));

      await waitFor(() => {
        expect(authService.signInWithApple).toHaveBeenCalled();
      });
      expect(await findByText("Apple login failed")).toBeTruthy();
    });
  });

  describe("Google sign-in", () => {
    it("calls authService.signInWithGoogle when pressed", async () => {
      (authService.signInWithGoogle as jest.Mock).mockResolvedValue({
        success: true,
        session: { user: { id: "google123" } },
      });

      const { getByLabelText } = render(wrap(<AuthScreen />));
      fireEvent.press(getByLabelText("Sign in with Google"));

      await waitFor(() => {
        expect(authService.signInWithGoogle).toHaveBeenCalled();
      });
    });

    it("surfaces a failure message when Google sign-in fails", async () => {
      (authService.signInWithGoogle as jest.Mock).mockResolvedValue({
        success: false,
        error: "Google login failed",
      });

      const { getByLabelText, findByText } = render(wrap(<AuthScreen />));
      fireEvent.press(getByLabelText("Sign in with Google"));

      await waitFor(() => {
        expect(authService.signInWithGoogle).toHaveBeenCalled();
      });
      expect(await findByText("Google login failed")).toBeTruthy();
    });
  });
});
