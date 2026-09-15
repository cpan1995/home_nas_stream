import { useCallback, useEffect, useRef } from "react"
import type { CarouselApi } from "@/components/ui/carousel"

const AUTOPLAY_DELAY = 6500

type Params = {
    heroApi?: CarouselApi
    enabled: boolean
    slideCount: number
    onSelect: (index: number) => void
}

export function useHeroAutoplay({ heroApi, enabled, slideCount, onSelect }: Params) {
    const autoplayRef = useRef<number | null>(null)

    const restartAutoplay = useCallback(() => {
        if (!heroApi || !enabled) return

        if (autoplayRef.current) {
            window.clearTimeout(autoplayRef.current)
        }

        autoplayRef.current = window.setTimeout(() => {
            if (!heroApi) return

            if (heroApi.canScrollNext()) {
                heroApi.scrollNext()
            } else {
                heroApi.scrollTo(0)
            }
        }, AUTOPLAY_DELAY)
    }, [heroApi, enabled])

    // carousel binding
    useEffect(() => {
        if (!heroApi || slideCount === 0) return

        const handleSelect = () => {
            const index = heroApi.selectedScrollSnap()

            onSelect(index)
            restartAutoplay()
        }

        handleSelect()

        heroApi.on("select", handleSelect)
        heroApi.on("reInit", handleSelect)

        restartAutoplay()

        return () => {
            heroApi.off("select", handleSelect)
            heroApi.off("reInit", handleSelect)

            if (autoplayRef.current) {
                window.clearTimeout(autoplayRef.current)
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [heroApi, slideCount, restartAutoplay])

    // cleanup on unmount
    useEffect(() => {
        return () => {
            if (autoplayRef.current) {
                window.clearTimeout(autoplayRef.current)
            }
        }
    }, [])
}
