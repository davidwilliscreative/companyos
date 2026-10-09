import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      colors: {
        ink: { DEFAULT: "#1c2230", soft: "#4a5263", muted: "#6b7385" },
        canvas: "#f7f7f5",
        line: "#e4e4df",
        accent: { DEFAULT: "#2f5d8a", soft: "#e8eff6" },
        good: { DEFAULT: "#2e6b4f", soft: "#e7f1ec" },
        warn: { DEFAULT: "#8a5a12", soft: "#fbf1de" },
        bad: { DEFAULT: "#a33a2e", soft: "#f8e7e4" },
      },
    },
  },
  plugins: [],
};
export default config;
