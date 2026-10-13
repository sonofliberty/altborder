import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Generated design studies are not application entry points.
  optimizeDeps: { entries: ["index.html"] },
  worker: { format: "es" },
});
