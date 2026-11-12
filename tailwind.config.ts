import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#142132",
        navy: "#173B57",
        mint: "#0D9488",
        coral: "#E76F51",
        paper: "#F5F7FA",
        line: "#E5EAF0"
      },
      boxShadow: { card: "0 8px 30px rgba(20,33,50,.06)" }
    }
  },
  plugins: []
};
export default config;
