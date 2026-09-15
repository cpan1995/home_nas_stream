import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { PLAYBACK_CONSTANTS } from "./constants/playback"

interface EpisodeAutoplayOverlayProps {
    onNext: () => void
    onCancel: () => void
    show: boolean
}

export function EpisodeAutoplayOverlay({ onNext, onCancel, show }: EpisodeAutoplayOverlayProps) {
    const { t } = useTranslation("player")
    const [progress, setProgress] = useState(0)
    const duration = PLAYBACK_CONSTANTS.AUTOPLAY_NEXT_DELAY

    useEffect(() => {
        if (!show) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setProgress(0)
            return
        }

        const start = Date.now()
        const timer = setInterval(() => {
            const elapsed = Date.now() - start
            const newProgress = (elapsed / duration) * 100

            if (newProgress >= 100) {
                clearInterval(timer)
                onNext()
            } else {
                setProgress(newProgress)
            }
        }, 100)

        return () => clearInterval(timer)
    }, [show, onNext, duration])

    if (!show) return null

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
            <div className="w-full max-w-sm space-y-6 p-8 text-center">
                <h3 className="text-2xl font-bold">{t("autoplay.nextEpisode")}</h3>
                <Progress value={progress} className="h-2" />
                <div className="flex gap-4">
                    <Button onClick={onNext} className="flex-1">
                        {t("autoplay.playingNow")}
                    </Button>
                    <Button onClick={onCancel} variant="outline" className="flex-1">
                        {t("autoplay.cancel")}
                    </Button>
                </div>
            </div>
        </div>
    )
}
