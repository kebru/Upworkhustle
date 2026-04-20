import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0d1f1a",
        accent: "#f0924a",
        surface: "#132a22",
        muted: "#8fb3a6",
      },
    },
  },
  plugins: [],
};
export default config;
