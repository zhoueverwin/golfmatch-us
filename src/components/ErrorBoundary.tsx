import React, { Component, ReactNode } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleRetry = () => {
    // Reset error state
    this.setState({ hasError: false, error: undefined });
  };

  componentDidUpdate(prevProps: Props) {
    // Reset error state when children change (e.g., navigation to different screen)
    if (this.state.hasError && prevProps.children !== this.props.children) {
      this.setState({ hasError: false, error: undefined });
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Try to recover silently for common errors that don't need user notification
      const error = this.state.error;
      const errorMessage = error?.message?.toLowerCase() || "";
      
      // Identify recoverable errors
      const isNavigationError = errorMessage.includes("navigation") || 
                                errorMessage.includes("navigate") ||
                                errorMessage.includes("screen") ||
                                errorMessage.includes("route");
      
      const isNetworkError = errorMessage.includes("network") ||
                             errorMessage.includes("fetch") ||
                             errorMessage.includes("connection") ||
                             errorMessage.includes("timeout");
      
      const isStateError = errorMessage.includes("state") ||
                           errorMessage.includes("undefined") ||
                           errorMessage.includes("null") ||
                           errorMessage.includes("cannot read");
      
      // For recoverable errors in production, try silent recovery
      if ((isNavigationError || isNetworkError || isStateError) && !__DEV__) {
        console.warn("[ErrorBoundary] Recoverable error caught, attempting silent recovery:", error?.message);
        // Reset error state after a short delay to allow system to settle
        setTimeout(() => {
          this.setState({ hasError: false, error: undefined });
        }, 100);
        // Return children while recovering
        return this.props.children;
      }

      // For critical errors, show user-friendly error screen
      return (
        <View style={styles.container}>
          <View style={styles.errorContainer}>
            <Ionicons name="warning-outline" size={48} color={Colors.error} />
            <Text style={styles.errorTitle}>問題が発生しました</Text>
            <Text style={styles.errorMessage}>
              申し訳ございません。予期しない問題が発生しました。{"\n"}アプリを再起動してください。
            </Text>
            {__DEV__ && this.state.error && (
              <Text style={styles.errorDetails}>
                {this.state.error.message}
              </Text>
            )}
            <TouchableOpacity
              style={styles.retryButton}
              onPress={this.handleRetry}
            >
              <Text style={styles.retryButtonText}>再試行</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  errorContainer: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: "center",
    shadowColor: Colors.black,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    maxWidth: 300,
  },
  errorTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  errorMessage: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    textAlign: "center",
    lineHeight: Typography.lineHeight.normal * Typography.fontSize.base,
    marginBottom: Spacing.lg,
  },
  errorDetails: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.tertiary,
    textAlign: "center",
    fontFamily: "monospace", // Keep monospace for error details (code/technical)
    backgroundColor: Colors.gray[100],
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.lg,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  retryButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.white,
  },
});

export default ErrorBoundary;
