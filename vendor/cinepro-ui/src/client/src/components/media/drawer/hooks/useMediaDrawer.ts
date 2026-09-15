import { useContext } from "react"
import { MediaDrawerContext } from "../providers/MediaDrawerProvider"

export function useMediaDrawer() {
    const context = useContext(MediaDrawerContext)
    if (!context) {
        throw new Error("useMediaDrawer must be used within MediaDrawerProvider")
    }
    return context
}
