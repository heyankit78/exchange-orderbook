import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontSize: {
        xs: "0.7rem",
        sm: "0.8rem",
      },
      colors: {
        greenBackgroundTransparent: 'rgba(0,194,120,.12)',
        redBackgroundTransparent: 'rgba(234,56,59,.12)',
        baseBackgroundL2: "rgb(32,33,39)",
        baseBackgroundL3: "rgb(40,41,50)",
        greenPrimaryButtonBackground: "rgb(0,194,120)",
        baseBackgroundL1: "rgb(20,21,27)",
        greenText: "rgb(0,194,120)",
        redText: "rgb(234,56,59)",
        baseTextHighEmphasis: "rgb(244,244,246)",
        baseTextMedEmphasis: "rgb(148,158,166)",
        accentBlue: "rgb(76,148,255)",
        baseBorderLight: "rgb(32,33,39)",
        baseBorderMed: "rgb(50,51,57)",
        baseBorderFocus: "rgb(80,81,92)",
      },
      borderColor: {
        redBorder: 'rgba(234,56,59,.5)',
        greenBorder: 'rgba(0,194,120,.4)',
        baseBorderMed: 'rgb(50,51,57)',
        accentBlue: "rgb(76,148,255)",
        baseBorderLight: "rgb(32,33,39)",
        baseBorderFocus: "rgb(80,81,92)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      textColor: {
        greenPrimaryButtonText: "rgb(20,21,27)",
        greenText: "rgb(0,194,120)",
        redText: "rgb(234,56,59)",
        baseTextHighEmphasis: "rgb(244,244,246)",
        baseTextMedEmphasis: "rgb(148,158,166)",
      },
    },
  },
  plugins: [],
};
export default config;
