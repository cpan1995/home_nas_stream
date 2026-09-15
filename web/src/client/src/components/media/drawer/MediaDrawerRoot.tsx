import React, { Suspense, lazy } from "react"
import { useMediaDrawer } from "@/components/media/drawer/hooks/useMediaDrawer"

// Performance reason: MediaDrawer pulls in the vaul drawer plus cast/episodes/
// recommendations/trailer UI, none of which is needed until a card is opened. Loading it
// lazily keeps that weight out of the bundle every other route pays for.
const MediaDrawer = lazy(() => import("@/components/media/drawer/MediaDrawer").then((m) => ({ default: m.MediaDrawer })))

export const MediaDrawerRoot: React.FC = () => {
    const { stack } = useMediaDrawer()

    const top = stack[stack.length - 1]
    if (!top) return null

    // Performance reason: mounting every stacked entry kept every previous drawer's vaul
    // overlay, scroll-lock and useMediaDetails fetch alive underneath the new one, so each
    // "open recommendation" push compounded full drawers on top of each other. Only the
    // top of the stack is ever visible, so only it needs to be mounted.
    return (
        <Suspense fallback={null}>
            <MediaDrawer key={`${top.type}-${top.id}-${stack.length}`} payload={top} canGoBack={stack.length > 1} isOpen={true} />
        </Suspense>
    )
}
