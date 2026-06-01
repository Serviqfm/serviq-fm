import type { Config } from "tailwindcss";
// ServiqFM brand kit — merged alongside the existing Lumina tokens. The brand kit
// uses a `brand-*` prefix so it never collides with `primary`, `secondary`, etc.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const brand = require("./src/brand/tailwind.brand.js");

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ServiqFM brand kit (namespaced)
        ...brand.theme.extend.colors,

        // The existing UI tokens (primary, secondary, etc) are now mapped to the
        // ServiqFM brand palette so every page picks up the new colours without
        // touching component code. See web/src/brand/tokens.ts for the source.
        // Brand Navy   #182848  → primary
        // Signal Blue  #2898C8  → secondary
        // Service Teal #48B8C0  → tertiary
        // Sky Light    #A0D0E0  → *-container
        // Sky Pale     #E0F0F8  → soft surfaces
        // Subtitle Grey #A0B0B8 → outline
        primary: "#182848",
        "on-primary": "#ffffff",
        "primary-container": "#A0D0E0",
        "on-primary-container": "#182848",
        "inverse-primary": "#2898C8",
        "primary-fixed": "#A0D0E0",
        "primary-fixed-dim": "#2898C8",
        "on-primary-fixed": "#0A1428",
        "on-primary-fixed-variant": "#182848",

        secondary: "#2898C8",
        "on-secondary": "#ffffff",
        "secondary-container": "#E0F0F8",
        "on-secondary-container": "#182848",
        "secondary-fixed": "#E0F0F8",
        "secondary-fixed-dim": "#A0D0E0",
        "on-secondary-fixed": "#0A1428",
        "on-secondary-fixed-variant": "#182848",

        tertiary: "#48B8C0",
        "on-tertiary": "#ffffff",
        "tertiary-container": "#E0F0F8",
        "on-tertiary-container": "#182848",
        "tertiary-fixed": "#E0F0F8",
        "tertiary-fixed-dim": "#A0D0E0",
        "on-tertiary-fixed": "#0A1428",
        "on-tertiary-fixed-variant": "#182848",

        error: "#C8324C",
        "on-error": "#ffffff",
        "error-container": "#FCE4E8",
        "on-error-container": "#7A1E2E",

        surface: "#F8FBFD",
        "on-surface": "#182848",
        "surface-variant": "#E0F0F8",
        "on-surface-variant": "#303A4E",
        "surface-dim": "#E0F0F8",
        "surface-bright": "#FFFFFF",
        "surface-container-lowest": "#FFFFFF",
        "surface-container-low": "#F8FBFD",
        "surface-container": "#F0F6FA",
        "surface-container-high": "#E8F0F6",
        "surface-container-highest": "#E0F0F8",
        "inverse-surface": "#182848",
        "inverse-on-surface": "#F8FBFD",

        background: "#F8FBFD",
        "on-background": "#182848",

        outline: "#A0B0B8",
        "outline-variant": "#C8D0DC",

        "surface-tint": "#182848",
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
        ...brand.theme.extend.fontFamily,
      },
      boxShadow: {
        ...brand.theme.extend.boxShadow,
      },
      backgroundImage: {
        ...brand.theme.extend.backgroundImage,
      },
    },
  },
  plugins: [],
};
export default config;
