import "@/lib/local-api"
import { createRoot } from "react-dom/client"
import "@/index.css"
import App from "@/app/App"
import AppProviders from "@/app/AppProviders"
import { AppSettingsProvider } from "@/app/providers/settings-provider.tsx"
import AuthGate from "@/components/auth/AuthGate"

createRoot(document.getElementById("root")!).render(
    <AuthGate>
        <AppSettingsProvider>
            <AppProviders>
                <App />
            </AppProviders>
        </AppSettingsProvider>
    </AuthGate>
)
