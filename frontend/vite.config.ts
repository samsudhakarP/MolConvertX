import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages project sites are served below /<repository-name>/.
  base: "/MolConvertX/",
  plugins: [react()],
  server: { port: 5173 }
});
