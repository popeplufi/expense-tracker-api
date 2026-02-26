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
          50: "#fef6ef",
          100: "#fde8d8",
          200: "#fbd0b1",
          300: "#f8b180",
          400: "#f38a4f",
          500: "#ea6a2a",
          600: "#d6541f",
          700: "#b2441d",
        },
        ocean: {
          50: "#eefcfb",
          100: "#d5f6f4",
          200: "#abede8",
          300: "#78e0d9",
          400: "#43cabf",
          500: "#21aba1",
          600: "#188b84",
        },
      },
      boxShadow: {
        soft: "0 20px 45px -22px rgba(17, 24, 39, 0.35)",
      },
      backgroundImage: {
        "mesh-light":
          "radial-gradient(circle at 20% 10%, rgba(234, 106, 42, 0.24), transparent 36%), radial-gradient(circle at 80% 0%, rgba(67, 202, 191, 0.28), transparent 34%), linear-gradient(160deg, #f7fafc 0%, #fff7f1 50%, #f1fffc 100%)",
        "mesh-dark":
          "radial-gradient(circle at 20% 10%, rgba(234, 106, 42, 0.25), transparent 38%), radial-gradient(circle at 80% 0%, rgba(67, 202, 191, 0.22), transparent 34%), linear-gradient(160deg, #0b1220 0%, #131b2f 52%, #111a26 100%)",
      },
    },
  },
  plugins: [],
};
