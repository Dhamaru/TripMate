import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      // ─── Border Radius (Airbnb scale) ─────────────────────────────
      borderRadius: {
        none: "0px",
        xs: "4px",
        sm: "8px",    // buttons
        md: "14px",   // cards, modals
        lg: "20px",   // large panels
        xl: "32px",   // hero sections
        full: "9999px", // pills, search bars, avatars
        // shadcn compat
        DEFAULT: "var(--radius)",
      },

      // ─── Colors ───────────────────────────────────────────────────
      colors: {
        // Airbnb brand tokens
        rausch: "#ff385c",
        "rausch-active": "#e00b41",
        "rausch-disabled": "#ffd1da",
        "airbnb-ink": "#222222",
        "airbnb-body": "#3f3f3f",
        "airbnb-muted": "#6a6a6a",
        "airbnb-muted-soft": "#929292",
        "airbnb-hairline": "#dddddd",
        "airbnb-hairline-soft": "#ebebeb",
        "airbnb-border-strong": "#c1c1c1",
        "airbnb-canvas": "#ffffff",
        "airbnb-surface": "#f7f7f7",
        "airbnb-surface-strong": "#f2f2f2",
        "airbnb-luxe": "#460479",
        "airbnb-plus": "#92174d",
        "airbnb-teal": "#00a699",
        "airbnb-orange": "#fc642d",
        "airbnb-link": "#428bff",

        // iOS compat bridge — existing components still reference these
        "ios-blue": "var(--ios-blue)",
        "ios-orange": "var(--ios-orange)",
        "ios-green": "var(--ios-green)",
        "ios-red": "var(--ios-red)",
        "ios-gray": "var(--ios-gray)",
        "ios-dark": "var(--ios-dark)",
        "ios-darker": "var(--ios-darker)",
        "ios-card": "var(--ios-card)",

        // shadcn/radix CSS variable mappings
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        chart: {
          "1": "var(--chart-1)",
          "2": "var(--chart-2)",
          "3": "var(--chart-3)",
          "4": "var(--chart-4)",
          "5": "var(--chart-5)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
      },

      // ─── Typography ───────────────────────────────────────────────
      fontFamily: {
        sans: ["Inter", "var(--font-sans)", "-apple-system", "BlinkMacSystemFont", "system-ui", "Roboto", "Helvetica Neue", "sans-serif"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },

      // ─── Spacing (Airbnb 4px base) ────────────────────────────────
      spacing: {
        "airbnb-xxs": "2px",
        "airbnb-section": "64px",
        "airbnb-hero": "96px",
      },

      // ─── Shadows (Airbnb elevation system) ────────────────────────
      boxShadow: {
        "card-resting": "0 1px 2px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05)",
        "card-hover": "rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px 0, rgba(0,0,0,0.1) 0 4px 8px 0",
        "search-bar": "0 1px 2px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05)",
        "modal": "0 8px 32px rgba(0,0,0,0.12)",
      },

      // ─── Keyframes ────────────────────────────────────────────────
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-slow": {
          "0%, 100%": { opacity: "0.3", transform: "scale(1)" },
          "50%": { opacity: "0.6", transform: "scale(1.1)" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0) rotate(0deg)" },
          "50%": { transform: "translateY(-20px) rotate(2deg)" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-slow": "pulse-slow 8s ease-in-out infinite",
        "float": "float 6s ease-in-out infinite",
        "fade-in": "fade-in 0.2s ease-out",
        "scale-in": "scale-in 0.15s ease-out",
      },

      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
