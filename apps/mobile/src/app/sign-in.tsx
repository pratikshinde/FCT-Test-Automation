import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { login, getApiUrl, ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { colors, spacing } from "@/lib/theme";

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const signIn = useAuthStore((s) => s.signIn);

  const mutation = useMutation({
    mutationFn: () => login({ email, password }),
    onSuccess: async (session) => {
      // Mirrors the admin site's own role gate (planner 4.3: operators/supervisors only).
      if (session.user.role === "ADMIN") {
        setError("This account cannot access the operator app.");
        return;
      }
      setError(null);
      await signIn(session);
      router.replace("/home");
    },
    onError: (err: any) => {
      console.error("[Login Error]", err);
      const targetUrl = getApiUrl();
      setError(
        err instanceof ApiError
          ? err.message
          : `Could not reach server at ${targetUrl}. Make sure your phone and computer are on the same Wi-Fi network.`
      );
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>FCT Station</Text>
      <Text style={styles.subtitle}>Sign in to load, program and test PCBs.</Text>

      <View style={styles.field}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Email</Text>
          <Pressable
            onPress={() => {
              setEmail("operator@fct.local");
              setPassword("operator123");
            }}
          >
            <Text style={styles.demoFill}>⚡ Auto-fill Demo Login</Text>
          </Pressable>
        </View>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="operator@fct.local"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="operator123"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.button, mutation.isPending && styles.buttonDisabled]}
        onPress={() => mutation.mutate()}
        disabled={mutation.isPending || !email || !password}
      >
        {mutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: "center", padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 28, fontWeight: "700", color: colors.text, textAlign: "center" },
  subtitle: { fontSize: 14, color: colors.textMuted, textAlign: "center", marginBottom: spacing.md },
  field: { gap: 4 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { fontSize: 13, color: colors.textMuted },
  demoFill: { fontSize: 12, color: colors.confirm, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 16,
  },
  error: { color: colors.fail, fontSize: 13 },
  button: {
    backgroundColor: colors.confirm,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
