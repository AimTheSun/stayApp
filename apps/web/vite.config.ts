import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseUrl = env.VITE_SUPABASE_URL || "https://placeholder.supabase.co";

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["icon.svg", "apple-touch-icon.png"],
        // Mapbox GL is ~2.3 MB; raise the precache ceiling so the SW includes it.
        workbox: { maximumFileSizeToCacheInBytes: 4 * 1024 * 1024 },
        manifest: {
          name: "Stay",
          short_name: "Stay",
          description: "A quiet record of where your time goes.",
          theme_color: "#0E0D0B",
          background_color: "#0E0D0B",
          display: "standalone",
          orientation: "portrait",
          start_url: "/",
          icons: [
            { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
            { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
            {
              src: "pwa-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
      }),
    ],
    server: {
      // Mirror the Vercel /sb rewrite for local dev.
      proxy: {
        "/sb": {
          target: supabaseUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/sb/, ""),
        },
      },
    },
  };
});
