import type { FastifyInstance } from "fastify"
import helmet from "@fastify/helmet"

export async function registerHelmetPlugin(app: FastifyInstance) {
    await app.register(helmet, {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],

                connectSrc: ["'self'", "https:"],

                imgSrc: ["'self'", "data:", "https://image.tmdb.org"],

                workerSrc: ["'self'", "blob:"],

                // Allow embedded trailers.
                scriptSrc: ["'self'", "'unsafe-inline'", "https://www.youtube.com/iframe_api", "https://www.youtube.com/s/player/"],
                scriptSrcElem: ["'self'", "'unsafe-inline'", "https://www.youtube.com/iframe_api", "https://www.youtube.com/s/player/"],

                styleSrc: ["'self'", "'unsafe-inline'"],

                mediaSrc: ["'self'", "https:", "http:", "blob:"],
                fontSrc: ["'self'", "https:", "data:"],

                objectSrc: ["'none'"],

                baseUri: ["'self'"],
                formAction: ["'self'"],

                frameAncestors: ["'self'"],

                frameSrc: ["'self'", "https:"],

                childSrc: ["'self'", "https:"],
            },
        },

        referrerPolicy: {
            policy: "strict-origin-when-cross-origin",
        },

        crossOriginOpenerPolicy: { policy: "same-origin" },
        crossOriginResourcePolicy: { policy: "same-origin" },
    })
}
