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
        sm: "8px",    
        md: "14px",   
        lg: "20px",   
        xl: "12px",   // buttons
        "3xl": "24px", // cards
        full: "9999px",
        DEFAULT: "var(--radius)",
      },

      colors: {
        // TripMate / Stitch brand tokens
        "solar-amber": "#F59E0B",
        "explorer-blue": "#1E3A8A",
        "emerald-horizon": "#10B981",
        "ink-gray": "#111827",
        "alabaster-white": "#FFFFFF",

        // iOS compat bridge
        "ios-blue": "var(--ios-blue)",
        "ios-orange": "var(--ios-orange)",
        "ios-green": "var(--ios-green)",
        "ios-red": "var(--ios-red)",
        "ios-gray": "var(--ios-gray)",
        "ios-dark": "var(--ios-dark)",
        "ios-darker": "var(--ios-darker)",
        "ios-card": "var(--ios-card)",

        // shadcn/radix CSS variable mappings
        // NOTE: the CSS custom properties below store bare "H S% L%" triplets
        // (e.g. --background: 211 46% 11%), so every mapping here MUST wrap
        // them in hsl(...) — "var(--background)" alone is not a valid CSS
        // color and silently renders transparent.
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },

      // ─── Typography ───────────────────────────────────────────────
      fontFamily: {
        sans: ["DM Sans", "var(--font-sans)", "-apple-system", "BlinkMacSystemFont", "system-ui", "Helvetica Neue", "sans-serif"],
        display: ["Playfair Display", "Georgia", "serif"],
        serif: ["Playfair Display", "Georgia", "serif"],
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
