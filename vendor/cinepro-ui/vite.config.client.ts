import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import viteFastify from "@fastify/vite/plugin"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
    root: resolve(import.meta.dirname, "src", "client"),

    plugins: [
        viteFastify({
            spa: true,
            useRelativePaths: true,
        }),

        react(),

        tailwindcss(),

        VitePWA({
            registerType: "autoUpdate",

            outDir: process.env.NODE_ENV !== "production" ? resolve(import.meta.dirname, "src", "client") : resolve(import.meta.dirname, "build", "client", "client"),

            injectRegister: "auto",

            includeAssets: ["favicon.svg", "robots.txt"],

            manifest: {
                name: "CinePro",

                short_name: "CinePro",

                description: "CinePro is a modern, open-source web app for browsing and streaming movies and TV shows directly in your browser without ads and tracking.",

                lang: "en-US",

                dir: "ltr",

                start_url: "/",

                scope: "/",

                display: "standalone",

                display_override: ["window-controls-overlay", "standalone", "minimal-ui", "browser"],

                orientation: "any",

                theme_color: "#212121",

                background_color: "#212121",

                categories: ["entertainment", "video", "streaming"],

                icons: [
                    {
                        src: "/favicon.svg",
                        sizes: "any",
                        type: "image/svg+xml",
                        purpose: "any",
                    },

                    {
                        src: "/favicon.svg",
                        sizes: "any",
                        type: "image/svg+xml",
                        purpose: "maskable",
                    },
                ],

                screenshots: [
                    {
                        src: "/images/home.png",
                        sizes: "1920x1440",
                        type: "image/png",
                        form_factor: "wide",
                    },

                    {
                        src: "/images/phone.png",
                        sizes: "1920x1440",
                        type: "image/png",
                        form_factor: "wide",
                    },

                    {
                        src: "/images/drawer.png",
                        sizes: "1920x1440",
                        type: "image/png",
                        form_factor: "wide",
                    },

                    {
                        src: "/images/player.png",
                        sizes: "1920x1440",
                        type: "image/png",
                        form_factor: "wide",
                    },
                ],

                shortcuts: [
                    {
                        name: "Home",
                        short_name: "Home",
                        description: "Welcome to CinePro!",
                        url: "/",
                        icons: [
                            {
                                src: "/favicon.svg",
                                sizes: "any",
                                type: "image/svg+xml",
                            },
                        ],
                    },

                    {
                        name: "Browse Movies",
                        short_name: "Movies",
                        description: "Browse the latest movies",
                        url: "/movies",
                        icons: [
                            {
                                src: "/favicon.svg",
                                sizes: "any",
                                type: "image/svg+xml",
                            },
                        ],
                    },

                    {
                        name: "Browse TV Shows",
                        short_name: "TV Shows",
                        description: "Browse TV series and episodes",
                        url: "/shows",
                        icons: [
                            {
                                src: "/favicon.svg",
                                sizes: "any",
                                type: "image/svg+xml",
                            },
                        ],
                    },

                    {
                        name: "Settings",
                        short_name: "Settings",
                        description: "Configure CinePro to your liking.",
                        url: "/settings",
                        icons: [
                            {
                                src: "/favicon.svg",
                                sizes: "any",
                                type: "image/svg+xml",
                            },
                        ],
                    },
                ],

                prefer_related_applications: false,
            },

            workbox:
                process.env.VITE_STANDALONE === "true"
                    ? {
                          globPatterns: ["**/*.{js,css,html,svg,ico,json}"],

                          navigateFallback: "/",

                          cleanupOutdatedCaches: true,

                          clientsClaim: true,

                          skipWaiting: true,

                          runtimeCaching: [
                              {
                                  urlPattern: /^https:\/\/image\.tmdb\.org\/.*/i,

                                  handler: "StaleWhileRevalidate",

                                  options: {
                                      cacheName: "tmdb-images",

                                      cacheableResponse: {
                                          statuses: [0, 200],
                                      },

                                      expiration: {
                                          maxEntries: 500,
                                          maxAgeSeconds: 60 * 60 * 24 * 30,
                                      },

                                      fetchOptions: {
                                          mode: "no-cors",
                                      },
                                  },
                              },
                              {
                                  urlPattern: /^https:\/\/api\.themoviedb\.org\/.*/i,

                                  handler: "NetworkFirst",

                                  options: {
                                      cacheName: "tmdb-api",

                                      networkTimeoutSeconds: 5,

                                      expiration: {
                                          maxEntries: 100,
                                          maxAgeSeconds: 60 * 60 * 24,
                                      },

                                      cacheableResponse: {
                                          statuses: [0, 200],
                                      },
                                  },
                              },
                          ],
                      }
                    : {},

            devOptions: {
                enabled: process.env.NODE_ENV !== "production" ? true : false,
            },
        }),
    ],

    resolve: {
        alias: {
            "@": resolve(import.meta.dirname, "src", "client", "src"),

            "@/app": resolve(import.meta.dirname, "src", "client", "src", "app"),

            "@/features": resolve(import.meta.dirname, "src", "client", "src", "features"),

            "@/shared": resolve(import.meta.dirname, "src", "client", "src", "shared"),
        },
    },

    build: {
        emptyOutDir: true,

        outDir: resolve(import.meta.dirname, "build", "client"),
    },
})
