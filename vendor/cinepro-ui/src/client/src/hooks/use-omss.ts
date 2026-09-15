import { useContext } from "react"
import { OmssContext } from "@/app/providers/omss-provider"

export function useOmss() {
    const ctx = useContext(OmssContext)
    if (!ctx) throw new Error("OmssProvider missing")
    return ctx
}
