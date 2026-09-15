import { Star } from "lucide-react"
import { cn } from "@/lib/utils"

interface StarRatingProps {
    rating: number | string
    className?: string
}

export function StarRating({ rating, className }: StarRatingProps) {
    const formatted = typeof rating === "number" ? rating.toFixed(1) : rating
    return (
        <span className={cn("inline-flex items-center gap-1", className)}>
            <Star className="size-3.5 fill-primary text-primary" />
            <span>{formatted}</span>
        </span>
    )
}
