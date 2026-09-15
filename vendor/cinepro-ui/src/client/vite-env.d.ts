/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_TMDB_API_KEY: string
    readonly VITE_OMSS_API_URL?: string
    readonly VITE_STANDALONE: string
    readonly VITE_LOCAL_API?: string
    readonly NODE_ENV: "development" | "production"
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
