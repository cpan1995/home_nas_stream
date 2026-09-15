import React, { createContext, useEffect, useMemo, useState } from "react"
import { createOmssClient, type OmssClient } from "@omss/sdk"
import { usePersistentState } from "@/hooks/use-localstorage.ts"
import { useDebouncedValue } from "@/hooks/use-debounce.ts"
import { screeningRoom } from "@/lib/screening-room"

type OmssContextType = {
    client: OmssClient
    baseUrl: string
    setBaseUrl: (baseUrl: string) => void
    valid: boolean
}

const OmssContext = createContext<OmssContextType | null>(null)

export function OmssProvider({ children }: { children: React.ReactNode }) {
    const [baseUrl, setBaseUrl] = usePersistentState<string>("app.omssUrl", import.meta.env.VITE_OMSS_API_URL ?? "")

    const [valid, setValid] = useState(screeningRoom)
    const debouncedBaseUrl = useDebouncedValue(baseUrl, 500)

    useEffect(() => {
        if (screeningRoom) return
        const params = new URLSearchParams(window.location.search)
        const urlFromQuery = params.get("omssurl")

        if (urlFromQuery) {
            setBaseUrl(urlFromQuery)

            // remove query param from URL without reload
            params.delete("omssurl")
            const newUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : "") + window.location.hash

            window.history.replaceState({}, "", newUrl)
        }
    }, [setBaseUrl])

    const client = useMemo(() => {
        return createOmssClient({
            baseUrl: debouncedBaseUrl,
        })
    }, [debouncedBaseUrl])

    useEffect(() => {
        if (screeningRoom) return
        let cancelled = false

        async function validate() {
            try {
                const result = await client.getHealthStatus()
                const health = result.data

                const isValid = health?.spec === "omss" && health?.status === "operational"

                if (!cancelled) {
                    setValid((prev) => (prev !== isValid ? isValid : prev))
                }
            } catch {
                if (!cancelled) {
                    setValid((prev) => (prev ? false : prev))
                }
            }
        }

        void validate()

        return () => {
            cancelled = true
        }
    }, [client])

    const value = useMemo(
        () => ({
            client,
            baseUrl,
            setBaseUrl,
            valid,
        }),
        [client, baseUrl, setBaseUrl, valid]
    )

    return <OmssContext.Provider value={value}>{children}</OmssContext.Provider>
}

export { OmssContext }
