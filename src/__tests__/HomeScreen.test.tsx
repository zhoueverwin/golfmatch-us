import React from "react";
import { render } from "@testing-library/react-native";
import HomeScreen from "../screens/HomeScreen";
import { AuthProvider } from "../contexts/AuthContext";
import { NavigationContainer } from "@react-navigation/native";

const wrap = (ui: React.ReactElement) => (
  <AuthProvider>
    <NavigationContainer>{ui}</NavigationContainer>
  </AuthProvider>
);

describe("HomeScreen", () => {
  it("renders feed empty state", async () => {
    const { findByText } = render(wrap(<HomeScreen />));
    expect(await findByText("まだ投稿がありません")).toBeTruthy();
  });
});
