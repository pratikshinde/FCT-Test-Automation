import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pass: "#16a34a",
        fail: "#dc2626",
        confirm: "#2563eb",
        ack: "#d97706",
      },
    },
  },
  plugins: [],
};

export default config;
