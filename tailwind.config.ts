import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        ink: { DEFAULT: "#0e1015", soft: "#454a57", muted: "#7c8190", faint: "#a6aab5" },
        canvas: "#f5f5f7",
        surface: "#ffffff",
        line: { DEFAULT: "#e7e7ec", strong: "#d6d7de" },
        sidebar: { DEFAULT: "#0e1015", soft: "#1a1d24", line: "#262a33", text: "#a3a8b5" },
        accent: { DEFAULT: "#5b54e8", strong: "#4a43d4", soft: "#efeefe", line: "#dcdafc" },
        good: { DEFAULT: "#13795b", soft: "#e9f7f1", line: "#c7ebdc" },
        warn: { DEFAULT: "#a35a00", soft: "#fff5e5", line: "#fbe1b3" },
        bad: { DEFAULT: "#c0352b", soft: "#fdeeec", line: "#f8cfca" },
        violet: { DEFAULT: "#6b46c1", soft: "#f4effd", line: "#e3d8f8" },
      },
      boxShadow: {
        card: "0 1px 2px rgba(14,16,21,0.04), 0 1px 1px rgba(14,16,21,0.02)",
        lift: "0 4px 16px -4px rgba(14,16,21,0.10), 0 2px 4px -2px rgba(14,16,21,0.06)",
        pop: "0 24px 48px -12px rgba(14,16,21,0.25)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      letterSpacing: {
        tightest: "-0.035em",
      },
    },
  },
  plugins: [],
};
export default config;
