import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
export const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3100",
  plugins: [
    expoClient({
      scheme: "receiptvault",
      storagePrefix: "receiptvault",
      storage: SecureStore,
    }),
  ],
});
