import { lazy, useEffect } from "react"
import { Toaster } from "@/components/ui/sonner"
import { Route, Routes } from "react-router-dom"
import { useIsMobile } from "@/hooks/use-mobile.ts"
import Lenis from "lenis"

const HomePage = lazy(() => import("@/pages/home/Home"))
const MoviesPage = lazy(() => import("@/pages/movies/Movies"))
const WatchMoviePage = lazy(() => import("@/pages/watch/movie/WatchMoviePage.tsx"))
const WatchTvPage = lazy(() => import("@/pages/watch/tv/WatchTvPage.tsx"))
const ShowsPage = lazy(() => import("@/pages/shows/Shows"))
const DiscoverPage = lazy(() => import("@/pages/discover/Discover"))
const NotFound = lazy(() => import("@/pages/404/NotFound"))
const Settings = lazy(() => import("@/pages/settings/Settings"))
const Disclaimer = lazy(() => import("@/pages/disclaimer/Disclaimer"))

import AppLayout from "@/app/AppLayout.tsx"
import BlankLayout from "@/app/BlankLayout"

export default function App() {
    const isMobile = useIsMobile()

    useEffect(() => {
        if (!isMobile) {
            const lenis = new Lenis({
                autoRaf: true,
                prevent: (node) => node.classList.contains("lenis-disabled"),
            })

            return () => lenis.destroy()
        }
    }, [isMobile])

    return (
        <>
            {/* Performance reason: the Suspense boundary used to wrap the whole <Routes>
                tree, so React held back AppLayout (header, branding, background) from
                painting at all until the lazy page chunk for the matched route had loaded.
                Each layout now owns its own Suspense around just its <Outlet/>, so the
                shell paints immediately and only the page content shows a fallback. */}
            <Routes>
                {/* MAIN APP */}
                <Route element={<AppLayout />}>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/movies" element={<MoviesPage />} />
                    <Route path="/shows" element={<ShowsPage />} />
                    <Route path="/discover" element={<DiscoverPage />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/disclaimer" element={<Disclaimer />} />
                    <Route path="*" element={<NotFound />} />
                </Route>

                <Route element={<BlankLayout />}>
                    <Route path="/watch/movie/:id" element={<WatchMoviePage />} />
                    <Route path="/watch/tv/:id" element={<WatchTvPage />} />
                </Route>
            </Routes>

            <Toaster />
        </>
    )
}
