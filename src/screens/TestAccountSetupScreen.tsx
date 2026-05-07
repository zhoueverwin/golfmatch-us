import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../constants/colors";
import Button from "../components/Button";
import Loading from "../components/Loading";
import { Typography } from "../constants/typography";
import {
  runTestAccountSetup,
  createCustomTestAccount,
  listTestAccounts,
  validateTestEnvironment,
} from "../utils/runTestAccounts";

const TestAccountSetupScreen: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [environmentValid, setEnvironmentValid] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    checkEnvironment();
  }, []);

  const checkEnvironment = () => {
    const envCheck = validateTestEnvironment();
    setEnvironmentValid(envCheck.isValid);
  };

  const handleRunSetup = async () => {
    setLoading(true);
    setResults([]);

    try {
      await runTestAccountSetup();
      Alert.alert("Success", "Test account setup completed!");
    } catch (error) {
      console.error("Setup failed:", error);
      Alert.alert(
        "Error",
        "Test account setup failed. Check console for details.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustomAccount = async () => {
    const email = `custom.${Date.now()}@golfmatch.com`;
    const password = "Custom123!";

    setLoading(true);

    try {
      await createCustomTestAccount(email, password, "Custom User");
      Alert.alert(
        "Success",
        `Custom account created:\n${email}\nPassword: ${password}`,
      );
    } catch (error) {
      console.error("Custom account creation failed:", error);
      Alert.alert("Error", "Failed to create custom account");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckEnvironment = () => {
    checkEnvironment();
    Alert.alert(
      "Environment Check",
      environmentValid
        ? "✅ Environment is properly configured!"
        : "❌ Environment configuration issues. Check your .env file.",
    );
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>🧪 Test Account Setup</Text>
          <Text style={styles.subtitle}>
            Create test accounts for development and testing
          </Text>
        </View>

        <View style={styles.statusSection}>
          <Text style={styles.sectionTitle}>Environment Status</Text>
          <View
            style={[
              styles.statusIndicator,
              environmentValid === null
                ? styles.statusUnknown
                : environmentValid
                  ? styles.statusGood
                  : styles.statusBad,
            ]}
          >
            <Text style={styles.statusText}>
              {environmentValid === null
                ? "Checking..."
                : environmentValid
                  ? "✅ Valid"
                  : "❌ Invalid"}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleCheckEnvironment}
            style={styles.checkButton}
          >
            <Text style={styles.checkButtonText}>Check Environment</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>Setup Actions</Text>

          <Button
            title="🚀 Run Full Setup"
            onPress={handleRunSetup}
            style={styles.primaryButton}
            disabled={environmentValid === false}
          />

          <Button
            title="➕ Create Custom Account"
            onPress={handleCreateCustomAccount}
            style={styles.secondaryButton}
            disabled={environmentValid === false}
          />
        </View>

        <View style={styles.accountsSection}>
          <Text style={styles.sectionTitle}>Default Test Accounts</Text>
          {listTestAccounts().map((account, index) => (
            <View key={index} style={styles.accountCard}>
              <Text style={styles.accountEmail}>{account.email}</Text>
              <Text style={styles.accountPassword}>
                Password: {account.password}
              </Text>
              {account.name && (
                <Text style={styles.accountName}>Name: {account.name}</Text>
              )}
              {account.phone && (
                <Text style={styles.accountPhone}>Phone: {account.phone}</Text>
              )}
            </View>
          ))}
        </View>

        <View style={styles.instructionsSection}>
          <Text style={styles.sectionTitle}>Usage Instructions</Text>
          <Text style={styles.instructionText}>
            • After setup, use these accounts in the AuthScreen{`\n`}• Test
            email/password authentication{`\n`}• Test phone OTP authentication
            {`\n`}• Test account linking features{`\n`}• Remove this screen
            before production
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 24,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    fontFamily: Typography.getFontFamily("bold"),
    color: Colors.text.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.text.secondary,
    textAlign: "center",
  },
  statusSection: {
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    fontFamily: Typography.getFontFamily("600"),
    color: Colors.text.primary,
    marginBottom: 16,
  },
  statusIndicator: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  statusUnknown: {
    backgroundColor: Colors.warning,
  },
  statusGood: {
    backgroundColor: Colors.success,
  },
  statusBad: {
    backgroundColor: Colors.error,
  },
  statusText: {
    color: Colors.white,
    fontWeight: "600",
    textAlign: "center",
  },
  checkButton: {
    padding: 12,
    backgroundColor: Colors.primary,
    borderRadius: 8,
  },
  checkButtonText: {
    color: Colors.white,
    fontWeight: "600",
    textAlign: "center",
  },
  actionsSection: {
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    marginBottom: 12,
  },
  secondaryButton: {
    backgroundColor: Colors.secondary,
  },
  accountsSection: {
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  accountCard: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  accountEmail: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: Typography.getFontFamily("600"),
    color: Colors.text.primary,
    marginBottom: 4,
  },
  accountPassword: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginBottom: 2,
  },
  accountName: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginBottom: 2,
  },
  accountPhone: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  instructionsSection: {
    padding: 24,
  },
  instructionText: {
    fontSize: 14,
    color: Colors.text.secondary,
    lineHeight: 20,
  },
});

export default TestAccountSetupScreen;
