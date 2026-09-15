import { createContext, useContext } from "react"
import type { HistoryContextType } from "@/app/providers/history-provider"

export const HistoryContext = createContext<HistoryContextType | null>(null)

export function useHistory() {
    const ctx = useContext(HistoryContext)
    if (!ctx) throw new Error("HistoryProvider missing")
    return ctx
}
