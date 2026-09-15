import { AccountMenu } from "@/components/auth/AuthGate"
import { useId } from "react"
import { Button } from "@/components/ui/button"
import { useElementSize } from "@/hooks/use-element-size"
import { SearchDialog } from "@/components/layout/SearchDialog.tsx"
import { LucideGlobeLock, LucideGlobeX, LucideSearch, Settings2 } from "lucide-react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useAppSettings } from "@/hooks/use-appsettings.ts"
import { useOmss } from "@/hooks/use-omss"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { GlassFilter } from "@/components/ui/glass-filter"

const NAV_LINKS = [
    { to: "/", labelKey: "common:home" },
    { to: "/movies", labelKey: "common:movie.plural" },
    { to: "/shows", labelKey: "common:tvShow.plural" },
    { to: "/discover", labelKey: "common:discover" },
] as const

const iconButtonClass = "text-white/70 hover:bg-white/10 hover:text-white"

export default function Header() {
    const { t } = useTranslation(["header", "common", "settings"])
    const { setShowSearch, showSearch } = useAppSettings()
    const { valid } = useOmss()
    const navigate = useNavigate()
    const location = useLocation()
    const [glassRef, { width: glassWidth, height: glassHeight }] = useElementSize<HTMLDivElement>()
    const filterId = `header-glass-${useId().replace(/:/g, "")}`
    const hasGlassSize = glassWidth > 0 && glassHeight > 0

    return (
        <>
            <header className="fixed top-0 left-0 z-19 flex w-full justify-center py-4">
                <div
                    ref={glassRef}
                    className="relative inline-flex items-center gap-1 overflow-hidden rounded-full bg-black/20 px-1.5 py-1.5 shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.1),0_4px_16px_rgba(0,0,0,0.1),0_8px_24px_rgba(0,0,0,0.08)] transition-opacity duration-[260ms] ease-out"
                    style={hasGlassSize ? { backdropFilter: `url(#${filterId}) saturate(1)` } : undefined}
                >
                    {/* Nav links (hidden below sm to avoid overflowing the pill on narrow screens) */}
                    <div className="hidden items-center sm:flex">
                        {NAV_LINKS.map((link) => {
                            const active = location.pathname === link.to
                            return (
                                <Link key={link.to} to={link.to} className="relative px-4 py-2">
                                    <span className={`relative z-10 text-sm font-medium transition-colors ${active ? "text-white" : "text-white/70 hover:text-white"}`}>{t(link.labelKey)}</span>
                                    <div className={`absolute inset-0 rounded-full bg-white/15 transition-opacity ${active ? "opacity-100" : "opacity-0"}`} />
                                </Link>
                            )
                        })}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 px-1">
                        <Button variant="ghost" size="icon" className={iconButtonClass} onClick={() => setShowSearch(!showSearch)} aria-label={t("header:searchPlaceholder")}>
                            <LucideSearch className="size-5" />
                        </Button>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button aria-label="Streaming connection" variant="ghost" size="icon" className={`${iconButtonClass} ${valid ? "hover:cursor-default" : ""}`} onClick={() => navigate("/settings?tab=omss")}>
                                    {valid ? <LucideGlobeLock className="size-5" /> : <LucideGlobeX className="size-5" />}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent className="text-center">
                                {valid ? (
                                    "Streaming is connected."
                                ) : (
                                    <>
                                        Streaming is unavailable.
                                        <br />
                                        Contact your administrator if this continues.
                                    </>
                                )}
                            </TooltipContent>
                        </Tooltip>

                        <Button asChild variant="ghost" size="icon" className={iconButtonClass}>
                            <Link to="/settings" aria-label={t("settings:title")}>
                                <Settings2 className="size-5" />
                            </Link>
                        </Button>
                        <AccountMenu />
                    </div>
                </div>

                {hasGlassSize && <GlassFilter id={filterId} width={glassWidth} height={glassHeight} radius={glassHeight / 2} />}
            </header>

            <SearchDialog />
        </>
    )
}
