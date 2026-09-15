import * as React from "react"
import { Card, CardContent } from "@/components/ui/card.tsx"
import { cn } from "@/lib/utils.ts"
import { useMediaDrawer } from "@/components/media/drawer/hooks/useMediaDrawer"
import { StarRating } from "@/components/media/StarRating"

export interface MediaCardProps {
    title: string
    imagePath?: string | null
    imageAlt?: string
    aspectRatio?: "portrait" | "landscape"
    className?: string
    type: "movie" | "tv"
    id: number
    rating: number
    year: number
}

// Performance reason: rails render 6-20+ of these per page; without memo, every rail
// re-render (e.g. a sibling rail loading) re-rendered every card in every other rail too.
export const MediaCard = React.memo(
    React.forwardRef<HTMLDivElement, MediaCardProps>(({ title, imagePath, imageAlt, aspectRatio = "portrait", className, rating, year, id, type }, ref) => {
        const { open } = useMediaDrawer()

        return (
            <Card ref={ref} role="button" tabIndex={0} aria-label={title} data-remote-card data-remote-id={`media-${type}-${id}`}
                onKeyDown={event => { if ((event.key === "Enter" || event.key === " ") && !event.repeat) { event.preventDefault(); open({ type, id }) } }}
                className={cn("group overflow-hidden border-none py-0 transition-all", className)} onClick={() => open({ type: type, id: id })}>
                <CardContent className="p-0">
                    <div className={cn("relative overflow-hidden rounded-md bg-muted", aspectRatio === "portrait" ? "aspect-2/3" : "aspect-video")}>
                        <img
                            src={imagePath ?? "/favicon.svg"}
                            alt={imageAlt || title}
                            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.08]"
                            loading="lazy"
                        />

                        {/* Hover overlay */}
                        <div className="remote-card-caption pointer-events-none absolute inset-0 flex items-end opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                            {/* Gradient shadow */}
                            <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/30 to-transparent" />

                            {/* Text content */}
                            <div className="relative z-10 w-full p-3 text-white">
                                <div className="text-sm leading-tight font-semibold">{title}</div>

                                <div className={"mt-1 flex w-full justify-between text-xs font-medium"}>
                                    <StarRating rating={rating} />
                                    <span>{year}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        )
    })
)

MediaCard.displayName = "MediaCard"
