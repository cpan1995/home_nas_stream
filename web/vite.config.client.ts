import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import viteFastify from "@fastify/vite/plugin"

export default defineConfig({
    root: resolve(import.meta.dirname, "src", "client"),

    plugins: [
        viteFastify({
            spa: true,
            useRelativePaths: true,
        }),

        react(),

        tailwindcss(),


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
