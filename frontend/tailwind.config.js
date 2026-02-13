/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./pages/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        arena: {
          bg: "#0f0f0f",
          panel: "#171717",
          red: "#d62828",
          gold: "#f2c14e",
          ember: "#ff6b35",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
      boxShadow: {
        glowRed: "0 0 16px rgba(214, 40, 40, 0.65)",
        glowGold: "0 0 16px rgba(242, 193, 78, 0.75)",
      },
      keyframes: {
        pulseCrown: {
          "0%, 100%": { transform: "translateY(0px) scale(1)" },
          "50%": { transform: "translateY(-2px) scale(1.1)" },
        },
      },
      animation: {
        pulseCrown: "pulseCrown 1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
