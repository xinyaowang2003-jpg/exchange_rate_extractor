import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/datafeed": {
        target: "https://datafeed.dukascopy.com",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
