import { useEffect, useState } from "react"
import { H2, H3, H4 } from "@/components/ui/typography.tsx"
import "@/styles/animation.css"
import { useTranslation } from "react-i18next"
import Favicon from "../layout/Favicon"

type StartupPhase = "loading" | "brand" | "closing" | "done"
const startupOverlayKey = "app.startup-overlay-done"

export default function StartupOverlay() {
    const { t } = useTranslation("common")

    const [phase, setPhase] = useState<StartupPhase>(() => {
        return window.sessionStorage.getItem(startupOverlayKey) === "true" ? "done" : "loading"
    })

    useEffect(() => {
        if (phase === "done") return

        let timer: number

        // Performance reason: the splash previously blocked real content behind a blur for
        // 4.5s on every first visit of a session. Keeping the brand moment but cutting the
        // artificial wait makes the app feel far less "heavy" without removing the splash.
        if (phase === "loading") {
            timer = window.setTimeout(() => setPhase("brand"), 600)
        } else if (phase === "brand") {
            timer = window.setTimeout(() => setPhase("closing"), 900)
        } else if (phase === "closing") {
            timer = window.setTimeout(() => setPhase("done"), 350)
        }

        return () => clearTimeout(timer)
    }, [phase])

    useEffect(() => {
        const app = document.getElementById("app-root")

        if (phase === "done") {
            window.sessionStorage.setItem(startupOverlayKey, "true")
        }

        document.body.style.overflow = phase === "done" ? "" : "hidden"

        if (app) {
            if (phase === "closing") {
                app.style.filter = "blur(0px)"
            } else if (phase !== "done") {
                app.style.filter = "blur(6px)"
            } else {
                app.style.filter = ""
            }
        }

        return () => {
            document.body.style.overflow = ""
            if (app) app.style.filter = ""
        }
    }, [phase])

    if (phase === "done") return null

    return (
        <div
            className={`fixed inset-0 z-500 flex items-center justify-center bg-background transition-all duration-500 ease-out ${
                phase === "closing" ? "scale-105 opacity-0" : "scale-100 opacity-100"
            }`}
        >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08)_0%,transparent_45%)]" />

            {phase === "loading" ? (
                <div className="relative z-10 flex w-[min(88vw,420px)] flex-col items-center gap-5">
                    <div className="inline-flex size-48 items-center justify-center transition-all duration-500 sm:size-28">
                        <div className="flex size-full items-center justify-center">
                            <Favicon />
                        </div>
                    </div>

                    <H2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{t("projectName")}</H2>

                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className={`animate-startup-loading-bar h-full rounded-full bg-linear-to-r from-primary via-accent to-primary`} />
                    </div>

                    <H4 className="text-xs tracking-[0.3em] text-muted-foreground uppercase italic">{t("loading")}</H4>
                </div>
            ) : (
                <div className="relative z-10 flex flex-col items-center gap-4 transition-all duration-500">
                    <div className={`inline-flex size-48 items-center justify-center transition-all duration-500 sm:size-28 ${phase === "closing" ? "scale-110 opacity-0" : "scale-100 opacity-100"}`}>
                        <div className="flex size-full items-center justify-center">
                            <Favicon />
                        </div>
                    </div>

                    <div className="text-center">
                        <H2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{t("welcome", { projectName: t("projectName") })}</H2>
                        <H3 className="mt-2 text-sm tracking-[0.24em] text-muted-foreground uppercase">{t("slogan")}</H3>
                    </div>
                </div>
            )}
        </div>
    )
}
