import { create } from "zustand";
import type { LoginResponse } from "@fct/contracts";
import { secureStorage } from "./secure-storage";

const TOKEN_KEY = "fct_operator_token";
const USER_KEY = "fct_operator_user";

type SessionUser = LoginResponse["user"];

interface AuthState {
  status: "loading" | "signedOut" | "signedIn";
  token: string | null;
  user: SessionUser | null;
  hydrate: () => Promise<void>;
  signIn: (session: LoginResponse) => Promise<void>;
  signOut: () => Promise<void>;
}

/**
 * Persisted via secureStorage (Keychain/Keystore on native, localStorage on web).
 * hydrate() is called once at app launch so a returning operator lands straight on
 * Home with no network round-trip — "works offline after first sign-in" (planner 4.3).
 */
export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  token: null,
  user: null,

  hydrate: async () => {
    const [token, userJson] = await Promise.all([
      secureStorage.getItem(TOKEN_KEY),
      secureStorage.getItem(USER_KEY),
    ]);
    if (token && userJson) {
      set({ status: "signedIn", token, user: JSON.parse(userJson) });
    } else {
      set({ status: "signedOut", token: null, user: null });
    }
  },

  signIn: async (session) => {
    await Promise.all([
      secureStorage.setItem(TOKEN_KEY, session.accessToken),
      secureStorage.setItem(USER_KEY, JSON.stringify(session.user)),
    ]);
    set({ status: "signedIn", token: session.accessToken, user: session.user });
  },

  signOut: async () => {
    await Promise.all([secureStorage.deleteItem(TOKEN_KEY), secureStorage.deleteItem(USER_KEY)]);
    set({ status: "signedOut", token: null, user: null });
  },
}));
