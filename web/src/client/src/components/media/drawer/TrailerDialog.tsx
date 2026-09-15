import React from "react"
import { Film } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface TrailerDialogProps {
    trailerId: string | null
    title: string
}

export const TrailerDialog: React.FC<TrailerDialogProps> = ({ trailerId, title }) => {
    if (!trailerId) return null

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant={"outline"} className={"rounded-full border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"}>
                    <Film className="h-4 w-4" aria-hidden />
                    <span className="ml-2 text-sm font-medium">Trailer</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="min-w-xl gap-0 overflow-hidden border-none p-0">
                <DialogHeader className={"mb-0 border-b bg-popover/80 p-6 backdrop-blur"}>
                    <DialogTitle>{title} Trailer</DialogTitle>
                </DialogHeader>
                <div className="mt-0 aspect-video w-full pt-0">
                    <iframe
                        width="100%"
                        height="100%"
                        src={`https://www.youtube-nocookie.com/embed/${trailerId}?autoplay=1`}
                        title={`${title} Trailer`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    />
                </div>
            </DialogContent>
        </Dialog>
    )
}
