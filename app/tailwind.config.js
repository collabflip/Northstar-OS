/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // shadcn tokens (mapped to Northstar brand in index.css)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Northstar core palette
        paper: "#FAF8F4",
        surface: "#FFFFFF",
        "surface-2": "#F4F1EA",
        ink: "#1D1B17",
        "ink-2": "#5B564C",
        "ink-3": "#8D877A",
        line: "#E7E2D6",
        "line-strong": "#D5CFC0",
        pine: "#12312C",
        "pine-2": "#1A423B",
        accent: {
          DEFAULT: "#0E5A50",
          hover: "#0B4A42",
          tint: "#E3EFEB",
        },
        maple: "#A8503B",
        // Evidence & state palette (10-state signature system)
        ev: {
          verified: "#1E7A4F",
          external: "#54677A",
          estimate: "#9A6A1B",
          generated: "#6E6A86",
          assumption: "#5B564C",
          missing: "#9B9587",
          conflict: "#C2492B",
          ai: "#0E5A50",
          approved: "#1E7A4F",
          blocked: "#75706A",
        },
        // Autonomy levels A0-A4
        aut: {
          a0: "#54677A",
          a1: "#6E6A86",
          a2: "#9A6A1B",
          a3: "#0E5A50",
          a4: "#C2492B",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["'Source Serif 4'", "Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        xl: "12px",
        lg: "10px",
        md: "8px",
        sm: "6px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(29,27,23,0.04)",
        lift: "0 4px 12px rgba(29,27,23,0.08)",
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
        "pulse-dot": {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        twinkle: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
        "pulse-dot": "pulse-dot 2.4s ease-in-out infinite",
        twinkle: "twinkle 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
