import React from "react";
import { Text } from "react-native";
import { render } from "@testing-library/react-native";
import ErrorBoundary from "../components/ErrorBoundary";

const Boom: React.FC = () => {
  throw new Error("Boom");
};

describe("ErrorBoundary", () => {
  it("shows fallback when child throws", () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(getByText("エラーが発生しました")).toBeTruthy();
  });
});
