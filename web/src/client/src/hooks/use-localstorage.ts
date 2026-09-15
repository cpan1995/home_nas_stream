import { useEffect, useState } from "react"

export function usePersistentState<T>(key: string, initialValue: T) {
    const [value, setValue] = useState<T>(() => {
        if (typeof window === "undefined") return initialValue

        try {
            const stored = localStorage.getItem(key)
            return stored ? (JSON.parse(stored) as T) : initialValue
        } catch {
            return initialValue
        }
    })

    useEffect(() => {
        if (typeof window === "undefined") return

        try {
            localStorage.setItem(key, JSON.stringify(value))
        } catch {
            // ignore
        }
    }, [key, value])

    return [value, setValue] as const
}
