import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["pwa-icon.svg", "pwa-192.png", "pwa-512.png"],
      manifest: {
        name: "FROTA BLU-GASPAR",
        short_name: "FROTA BLU",
        description: "Controle de carretas no pátio e nas docas.",
        theme_color: "#14263a",
        background_color: "#f5f7fa",
        lang: "pt-BR",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2}"]
      }
    })
  ],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8000"
    }
  }
});
