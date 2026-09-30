import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuthStore } from "@/lib/auth-store";
import { colors } from "@/lib/theme";

export default function Index() {
  const status = useAuthStore((s) => s.status);

  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  return <Redirect href={status === "signedIn" ? "/home" : "/sign-in"} />;
}
