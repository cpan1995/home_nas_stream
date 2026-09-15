import "fastify"

declare module "fastify" {
    interface FastifyInstance {
        config: {
            VITE_TMDB_API_KEY: string
            VITE_OMSS_API_URL?: string
            VITE_STANDALONE: boolean
            ALLOWED_HOSTS: string[]
            PORT: number
            HOST: string
            NODE_ENV: "development" | "production"
            TRUST_PROXY: boolean
        }
    }
}
