import type { Config } from "tailwindcss";
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 950: "#070b16", 900: "#0b1222", 800: "#111a30", 700: "#1a2541", 600: "#24314f" },
        charcoal: { 900: "#16181d", 800: "#1e2128", 700: "#2a2e37" },
        gold: { 50: "#fbf7ee", 100: "#f4ead2", 200: "#e9d6a7", 300: "#dcc07c", 400: "#cfa95a", 500: "#b8913f", 600: "#967332" },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: { card: "0 1px 2px rgba(0,0,0,.04), 0 8px 24px -12px rgba(11,18,34,.18)" },
      keyframes: {
        fadeUp: { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "none" } },
        pulseDot: { "0%,100%": { opacity: "1" }, "50%": { opacity: ".35" } },
      },
      animation: { fadeUp: "fadeUp .35s ease-out both", pulseDot: "pulseDot 1.4s ease-in-out infinite" },
    },
  },
  plugins: [],
};
export default config;
