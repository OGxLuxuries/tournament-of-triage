import plugin from "tailwindcss/plugin";

/**
 * BitPoint Arcade — Tailwind custom utility layer.
 *
 * Adds the synthwave palette, arcade typography, neon box-shadows,
 * cabinet animations (TILT screen-shake, INSERT COIN blink, laser fire,
 * DEFEATED stamp, urgent countdown pulse) and a `text-glow-*` /
 * `pixel-frame-*` utility plugin.
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        neon: {
          magenta: "#ff2ec4",
          cyan: "#22f7ff",
          yellow: "#ffe600",
          green: "#39ff14",
          red: "#ff2244",
          purple: "#a855f7",
        },
        abyss: {
          950: "#08000f",
          900: "#12002b",
          800: "#1a0533",
          700: "#2a0f45",
          600: "#3a1a5e",
          500: "#4c2578",
        },
      },
      fontFamily: {
        arcade: ['"Press Start 2P"', "monospace"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        "neon-magenta":
          "0 0 6px #ff2ec4, 0 0 18px rgba(255,46,196,0.65), 0 0 44px rgba(255,46,196,0.3)",
        "neon-cyan":
          "0 0 6px #22f7ff, 0 0 18px rgba(34,247,255,0.65), 0 0 44px rgba(34,247,255,0.3)",
        "neon-yellow":
          "0 0 6px #ffe600, 0 0 18px rgba(255,230,0,0.6), 0 0 40px rgba(255,230,0,0.28)",
        "neon-green":
          "0 0 6px #39ff14, 0 0 18px rgba(57,255,20,0.6), 0 0 40px rgba(57,255,20,0.28)",
        "neon-red":
          "0 0 6px #ff2244, 0 0 18px rgba(255,34,68,0.65), 0 0 44px rgba(255,34,68,0.3)",
        pixel: "0 6px 0 0 #08000f",
      },
      keyframes: {
        shake: {
          "0%, 100%": { transform: "translate(0, 0) rotate(0deg)" },
          "10%": { transform: "translate(-10px, 4px) rotate(-0.8deg)" },
          "25%": { transform: "translate(9px, -5px) rotate(0.7deg)" },
          "40%": { transform: "translate(-8px, -3px) rotate(-0.5deg)" },
          "55%": { transform: "translate(7px, 5px) rotate(0.6deg)" },
          "70%": { transform: "translate(-6px, 2px) rotate(-0.4deg)" },
          "85%": { transform: "translate(5px, -2px) rotate(0.3deg)" },
        },
        blink: {
          "0%, 49%": { opacity: "1" },
          "50%, 100%": { opacity: "0" },
        },
        flicker: {
          "0%, 100%": { opacity: "1" },
          "41%": { opacity: "1" },
          "42%": { opacity: "0.72" },
          "43%": { opacity: "1" },
          "78%": { opacity: "1" },
          "79%": { opacity: "0.85" },
          "80%": { opacity: "1" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-7px)" },
        },
        "stamp-in": {
          "0%": { transform: "scale(3.2) rotate(-14deg)", opacity: "0" },
          "70%": { transform: "scale(0.92) rotate(-11deg)", opacity: "1" },
          "100%": { transform: "scale(1) rotate(-12deg)", opacity: "1" },
        },
        "slide-up": {
          "0%": { transform: "translateY(28px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(60px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "pulse-urgent": {
          "0%, 100%": { transform: "scale(1)", filter: "brightness(1)" },
          "50%": { transform: "scale(1.08)", filter: "brightness(1.5)" },
        },
        "boss-hit": {
          "0%, 100%": { filter: "none", transform: "translateX(0)" },
          "20%": { filter: "invert(1) brightness(2)", transform: "translateX(-6px)" },
          "40%": { filter: "none", transform: "translateX(5px)" },
          "60%": { filter: "invert(1) brightness(2)", transform: "translateX(-4px)" },
          "80%": { filter: "none", transform: "translateX(3px)" },
        },
        "tilt-flash": {
          "0%, 100%": { color: "#ffe600", textShadow: "0 0 24px #ffe600" },
          "50%": { color: "#ff2244", textShadow: "0 0 40px #ff2244" },
        },
        hue: {
          "0%": { filter: "hue-rotate(0deg)" },
          "100%": { filter: "hue-rotate(360deg)" },
        },
      },
      animation: {
        shake: "shake 0.45s linear infinite",
        blink: "blink 1.1s step-end infinite",
        flicker: "flicker 4s linear infinite",
        float: "float 3s ease-in-out infinite",
        "stamp-in": "stamp-in 0.5s cubic-bezier(0.2, 2, 0.4, 1) forwards",
        "slide-up": "slide-up 0.45s ease-out both",
        "slide-in-right": "slide-in-right 0.5s ease-out both",
        "pulse-urgent": "pulse-urgent 0.9s ease-in-out infinite",
        "boss-hit": "boss-hit 0.55s linear 2",
        "tilt-flash": "tilt-flash 0.28s step-end infinite",
        hue: "hue 8s linear infinite",
      },
    },
  },
  plugins: [
    plugin(({ matchUtilities, theme }) => {
      // text-glow-magenta, text-glow-cyan, ... — neon text shadows
      matchUtilities(
        {
          "text-glow": (value) => ({
            color: value,
            textShadow: `0 0 4px ${value}, 0 0 14px ${value}, 0 0 38px ${value}55`,
          }),
        },
        { values: theme("colors.neon") },
      );
      // pixel-frame-magenta, ... — chunky offset borders that read as 8-bit
      matchUtilities(
        {
          "pixel-frame": (value) => ({
            border: `3px solid ${value}`,
            boxShadow: `0 0 0 3px #08000f, 0 0 18px ${value}66, inset 0 0 14px ${value}22`,
            imageRendering: "pixelated",
          }),
        },
        { values: { ...theme("colors.neon"), dim: "#4c2578" } },
      );
    }),
  ],
};
