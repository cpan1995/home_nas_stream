import { Suspense } from "react"
import { Outlet } from "react-router-dom"

const PAGE_FALLBACK = (
    <div className="flex min-h-screen w-full items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
)

export default function BlankLayout() {
    return (
        <div className="min-h-screen w-full bg-background text-foreground">
            <Suspense fallback={PAGE_FALLBACK}>
                <Outlet />
            </Suspense>
        </div>
    )
}
