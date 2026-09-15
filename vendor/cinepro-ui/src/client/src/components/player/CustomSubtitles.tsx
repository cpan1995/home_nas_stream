import { useEffect, useState, useMemo } from "react"
import DOMPurify from "dompurify"
import { parseVTT } from "./utils/subtitle"

interface CustomSubtitlesProps {
    url: string
    currentTime: number
}

export function CustomSubtitles({ url, currentTime }: CustomSubtitlesProps) {
    const [cues, setCues] = useState<{ start: number; end: number; text: string }[]>([])

    useEffect(() => {
        if (!url) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setCues([])
            return
        }

        fetch(url)
            .then((res) => res.text())
            .then((text) => {
                const parsed = parseVTT(text)
                setCues(parsed)
            })
            .catch((err) => {
                console.error("Failed to load subtitles:", err)
                setCues([])
            })
    }, [url])

    const activeCue = useMemo(() => {
        return cues.find((cue) => currentTime >= cue.start && currentTime <= cue.end)
    }, [cues, currentTime])

    if (!activeCue) return null

    const safeHtml = DOMPurify.sanitize(activeCue.text, {
        ALLOWED_TAGS: ["b", "i", "u", "c", "font", "ruby", "rt", "v", "lang"],
        ALLOWED_ATTR: ["style"],
    })

    return (
        <div className="pointer-events-none absolute right-0 bottom-[15%] left-0 flex justify-center px-4">
            <div className="rounded bg-black/30 px-3 py-1 text-center text-lg whitespace-pre-wrap text-white shadow-lg backdrop-blur-sm md:text-2xl" dangerouslySetInnerHTML={{ __html: safeHtml }} />
        </div>
    )
}
