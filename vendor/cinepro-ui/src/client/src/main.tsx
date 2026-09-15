import "@/lib/local-api"
import { createRoot } from "react-dom/client"
import "@/index.css"
import App from "@/app/App"
import AppProviders from "@/app/AppProviders"
import { AppSettingsProvider } from "@/app/providers/settings-provider.tsx"
import { lazy, Suspense } from "react"
const AnimeStreamPlayer = lazy(() => import("@/components/player/AnimeStreamPlayer").then(module => ({ default: module.AnimeStreamPlayer })))

createRoot(document.getElementById("root")!).render(
    location.pathname.startsWith("/anime-player/") ? <Suspense fallback={null}><AnimeStreamPlayer /></Suspense> :
    <AppSettingsProvider>
        <AppProviders>
            <App />
        </AppProviders>
    </AppSettingsProvider>
)
