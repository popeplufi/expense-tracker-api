/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', "sans-serif"],
        body: ['"DM Sans"', "sans-serif"],
      },
      colors: {
        brand: {
          50: "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          300: "#6ee7b7",
          400: "#34d399",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
        },
        ocean: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
        },
      },
      boxShadow: {
        soft: "0 20px 45px -22px rgba(17, 24, 39, 0.35)",
      },
      backgroundImage: {
        scene:
          "radial-gradient(circle at 10% -10%, rgba(16, 185, 129, 0.22), transparent 34%), radial-gradient(circle at 100% 0%, rgba(59, 130, 246, 0.22), transparent 36%), linear-gradient(160deg, #f6fbff 0%, #f8fffc 54%, #f4fbf9 100%)",
        "scene-dark":
          "radial-gradient(circle at 10% -10%, rgba(16, 185, 129, 0.22), transparent 34%), radial-gradient(circle at 100% 0%, rgba(59, 130, 246, 0.22), transparent 36%), linear-gradient(165deg, #0b1324 0%, #101a2f 48%, #0d1a28 100%)",
        "mesh-light":
          "radial-gradient(circle at 20% 10%, rgba(234, 106, 42, 0.24), transparent 36%), radial-gradient(circle at 80% 0%, rgba(67, 202, 191, 0.28), transparent 34%), linear-gradient(160deg, #f7fafc 0%, #fff7f1 50%, #f1fffc 100%)",
        "mesh-dark":
          "radial-gradient(circle at 20% 10%, rgba(234, 106, 42, 0.25), transparent 38%), radial-gradient(circle at 80% 0%, rgba(67, 202, 191, 0.22), transparent 34%), linear-gradient(160deg, #0b1220 0%, #131b2f 52%, #111a26 100%)",
      },
    },
  },
  plugins: [],
};
