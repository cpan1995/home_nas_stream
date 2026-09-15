import { usePlayerState } from "./hooks/usePlayerState"
import { Badge } from "@/components/ui/badge"
import { Calendar, Clock } from "lucide-react"

export function MediaInfoPanel() {
    const { media } = usePlayerState()

    if (!media) return null

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <div className="flex items-center gap-3">
                    <h1 className="text-3xl font-bold">{media.title}</h1>
                    <Badge variant="secondary" className="uppercase">
                        {media.type}
                    </Badge>
                </div>

                {media.type === "tv" && media.episodeTitle && (
                    <h2 className="text-xl text-muted-foreground">
                        S{media.seasonNumber} E{media.episodeNumber}: {media.episodeTitle}
                    </h2>
                )}

                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {media.releaseDate && (
                        <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {new Date(media.releaseDate).getFullYear()}
                        </div>
                    )}
                    {media.runtime && (
                        <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {media.runtime} min
                        </div>
                    )}
                </div>
            </div>

            <p className="max-w-3xl text-lg leading-relaxed text-zinc-300">{media.overview}</p>
        </div>
    )
}
