import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Lumina colors from lumina-tokens.ts
        primary: "#006b54",
        "on-primary": "#ffffff",
        "primary-container": "#6dcfb0",
        "on-primary-container": "#005744",
        "inverse-primary": "#76d8b9",
        "primary-fixed": "#93f5d4",
        "primary-fixed-dim": "#76d8b9",
        "on-primary-fixed": "#002118",
        "on-primary-fixed-variant": "#00513f",

        secondary: "#00677d",
        "on-secondary": "#ffffff",
        "secondary-container": "#75e0ff",
        "on-secondary-container": "#006277",
        "secondary-fixed": "#b2ebff",
        "secondary-fixed-dim": "#68d4f3",
        "on-secondary-fixed": "#001f27",
        "on-secondary-fixed-variant": "#004e5e",

        tertiary: "#4f5e82",
        "on-tertiary": "#ffffff",
        "tertiary-container": "#aebde6",
        "on-tertiary-container": "#3d4c6f",
        "tertiary-fixed": "#d9e2ff",
        "tertiary-fixed-dim": "#b7c6ef",
        "on-tertiary-fixed": "#0a1a3b",
        "on-tertiary-fixed-variant": "#384669",

        error: "#ba1a1a",
        "on-error": "#ffffff",
        "error-container": "#ffdad6",
        "on-error-container": "#93000a",

        surface: "#f7f9fb",
        "on-surface": "#191c1e",
        "surface-variant": "#e0e3e5",
        "on-surface-variant": "#3e4944",
        "surface-dim": "#d8dadc",
        "surface-bright": "#f7f9fb",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f2f4f6",
        "surface-container": "#eceef0",
        "surface-container-high": "#e6e8ea",
        "surface-container-highest": "#e0e3e5",
        "inverse-surface": "#2d3133",
        "inverse-on-surface": "#eff1f3",

        background: "#f7f9fb",
        "on-background": "#191c1e",

        outline: "#6e7a74",
        "outline-variant": "#bdc9c3",

        "surface-tint": "#006b54",
      },
      spacing: {
        unit: "4px",
        "stack-sm": "8px",
        "stack-md": "16px",
        "stack-lg": "32px",
        gutter: "24px",
        margin: "32px",
      },
      borderRadius: {
        sm: "0.25rem",
        md: "0.5rem",
        lg: "0.75rem",
        xl: "0.75rem",
        full: "9999px",
      },
      fontFamily: {
        "body-md": "DM Sans, sans-serif",
        "headline-h1": "DM Sans, sans-serif",
        "label-caps": "DM Sans, sans-serif",
      },
    },
  },
  plugins: [],
};
export default config;
