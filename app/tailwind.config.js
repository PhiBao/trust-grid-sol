/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "action-blue": "#0066cc",
        "focus-blue": "#0071e3",
        "sky-link": "#2997ff",
        ink: "#1d1d1f",
        pearl: "#fafafc",
        parchment: "#f5f5f7",
        "tile-dark-1": "#272729",
        "tile-dark-2": "#2a2a2c",
        "tile-dark-3": "#252527",
        "chip-gray": "rgba(210, 210, 215, 0.64)",
        divider: "rgba(0, 0, 0, 0.04)",
        hairline: "rgba(0, 0, 0, 0.08)",
      },
      fontFamily: {
        display: [
          '"SF Pro Display"',
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Helvetica Neue"',
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        body: [
          '"SF Pro Text"',
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Helvetica Neue"',
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      letterSpacing: {
        "tight-display": "-0.28px",
        "tight-headline": "-0.374px",
        "tight-caption": "-0.224px",
        "tight-micro": "-0.12px",
      },
      lineHeight: {
        display: "1.07",
        headline: "1.10",
        subhead: "1.14",
        body: "1.47",
        dense: "2.41",
        tagline: "1.19",
      },
      borderRadius: {
        pill: "980px",
        card: "18px",
        chip: "11px",
        utility: "8px",
      },
      boxShadow: {
        product: "rgba(0, 0, 0, 0.22) 3px 5px 30px 0px",
      },
      maxWidth: {
        content: "980px",
        grid: "1440px",
      },
    },
  },
  plugins: [],
};
