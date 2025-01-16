import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.tsx",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
