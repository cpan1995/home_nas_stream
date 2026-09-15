import { Spinner } from "@/components/ui/spinner"
import React from "react"
import { useTranslation } from "react-i18next"

export function LoadingState({ message }: { message?: string | React.ReactNode }) {
    const { t } = useTranslation("player")
    const displayMessage = message || t("states.loading")

    return (
        <div className="flex h-screen min-h-100 w-full flex-col items-center justify-center gap-4 rounded-xl bg-background/80 backdrop-blur-sm">
            <Spinner className="h-12 w-12 text-primary" />
            <div className="animate-pulse text-muted-foreground">{displayMessage}</div>
        </div>
    )
}
