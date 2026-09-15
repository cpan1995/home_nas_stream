import React, { createContext, useEffect, useMemo, useState } from "react"
import { createOmssClient, type OmssClient } from "@omss/sdk"

type OmssContextType = {
    client: OmssClient
    baseUrl: string
    valid: boolean
}

const OmssContext = createContext<OmssContextType | null>(null)

export function OmssProvider({ children }: { children: React.ReactNode }) {
    const baseUrl = new URL("/api/cinepro", location.origin).href
    const [valid, setValid] = useState(false)
    const client = useMemo(() => createOmssClient({ baseUrl }), [baseUrl])

    useEffect(() => {
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
            valid,
        }),
        [client, baseUrl, valid]
    )

    return <OmssContext.Provider value={value}>{children}</OmssContext.Provider>
}

export { OmssContext }
