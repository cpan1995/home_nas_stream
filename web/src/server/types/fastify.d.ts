import "fastify"

declare module "fastify" {
    interface FastifyInstance {
        config: {
            APP_ORIGIN?: string
            SIGNUP_ENABLED?: boolean
            DATABASE_URL?: string
            GOOGLE_CLIENT_ID?: string
            GOOGLE_CLIENT_SECRET?: string
            GOOGLE_ALLOWED_EMAILS?: string
            ALLOWED_HOSTS: string[]
            PORT: number
            HOST: string
            NODE_ENV: "development" | "production"
            TRUST_PROXY: boolean
        }
    }
}
