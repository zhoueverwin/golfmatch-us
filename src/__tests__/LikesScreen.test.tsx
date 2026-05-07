import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import LikesScreen from "../screens/LikesScreen";
import { AuthProvider } from "../contexts/AuthContext";
import { NavigationContainer } from "@react-navigation/native";

const wrap = (ui: React.ReactElement) => (
  <AuthProvider>
    <NavigationContainer>{ui}</NavigationContainer>
  </AuthProvider>
);

describe("LikesScreen", () => {
  it("renders and shows empty state when no likes", async () => {
    const { findByText } = render(wrap(<LikesScreen />));
    expect(await findByText("いいね")).toBeTruthy();
  });
});
