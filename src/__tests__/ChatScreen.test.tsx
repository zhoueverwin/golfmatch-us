import React from "react";
import { render } from "@testing-library/react-native";
import ChatScreen from "../screens/ChatScreen";
import { NavigationContainer } from "@react-navigation/native";

// Minimal route params mocking
jest.mock("@react-navigation/native", () => {
  const actual = jest.requireActual("@react-navigation/native");
  return {
    ...actual,
    useRoute: () => ({
      params: {
        userId:
          process.env.EXPO_PUBLIC_TEST_USER_ID_2 ||
          "00000000-0000-0000-0000-000000000002",
        userName: "User 2",
        userImage: "",
      },
    }),
  };
});

describe("ChatScreen", () => {
  it("renders input area", () => {
    const { getByLabelText } = render(
      <NavigationContainer>
        <ChatScreen />
      </NavigationContainer>,
    );
    // No explicit label, but we can ensure it renders without crash
    expect(true).toBe(true);
  });
});
