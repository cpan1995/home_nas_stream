import { Link } from "react-router-dom"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { Bug, Film, Github, Info, Tv } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTranslation } from "react-i18next"
import Favicon from "./Favicon"

export default function Footer() {
    const { t } = useTranslation(["footer", "common"])

    return (
        <footer id="footer" className="z-1 mt-8 border-t border-border bg-background py-4 md:py-12">
            <div className="mx-auto w-[min(92vw,1240px)]">
                <div className="mb-6 grid grid-cols-2 gap-6 md:mb-8 md:grid-cols-3 md:gap-8">
                    {/* Brand */}
                    <div className="col-span-2 md:col-span-1">
                        <div className="mb-3 flex items-center gap-2 md:mb-4">
                            <Favicon width={40} height={40} />
                            <span className="text-lg font-bold md:text-xl">{t("common:projectName")}</span>
                        </div>
                        <p className="text-xs text-muted-foreground md:text-sm">{t("tagline")}</p>
                    </div>

                    {/* Pages */}
                    <div>
                        <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold md:mb-4 md:text-base">Pages</h3>
                        <ul className="space-y-1 md:space-y-2">
                            <li>
                                <Link to="/movies" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground md:text-sm" target="_self" rel="noopener">
                                    <Film className="h-4 w-4" /> {t("common:movie.plural")}
                                </Link>
                            </li>
                            <li>
                                <Link to="/shows" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground md:text-sm" target="_self" rel="noopener">
                                    <Tv className="h-4 w-4" /> {t("common:tvShow.plural")}
                                </Link>
                            </li>
                            <li>
                                <Link to="/disclaimer" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground md:text-sm" target="_self" rel="noopener">
                                    <Info className="h-4 w-4" /> {t("common:disclaimer.label")}
                                </Link>
                            </li>
                        </ul>
                    </div>

                    {/* Links */}
                    <div>
                        <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold md:mb-4 md:text-base">Links</h3>
                        <ul className="space-y-1 md:space-y-2">
                            <li>
                                <Link
                                    to={t("common:opensource.git-url")}
                                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground md:text-sm"
                                    target="_blank"
                                    rel="noopener"
                                >
                                    <Github className="h-4 w-4" /> {t("links.git")}
                                </Link>
                            </li>
                            <li>
                                <Link
                                    to={t("common:opensource.git-url") + "/blob/main/README.md"}
                                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground md:text-sm"
                                    target="_blank"
                                    rel="noopener"
                                >
                                    <Info className="h-4 w-4" /> {t("links.about")}
                                </Link>
                            </li>
                            <li>
                                <Link
                                    to={t("common:opensource.git-url") + "/issues"}
                                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground md:text-sm"
                                    target="_blank"
                                    rel="noopener"
                                >
                                    <Bug className="h-4 w-4" />
                                    {t("links.report-issue")}
                                </Link>
                            </li>
                        </ul>
                    </div>
                </div>

                <Separator className="mb-6 md:mb-8" />

                <div className="flex flex-col items-center justify-between md:flex-row">
                    <p className="text-center text-xs text-muted-foreground md:text-left md:text-sm">
                        © {new Date().getFullYear()} {t("common:projectName")} by{" "}
                        <Link to={t("common:opensource.git-url")} className="underline" target="_blank" rel="noopener">
                            {t("common:authors")}
                        </Link>
                        . All rights reserved.
                    </p>

                    <div className="z-1 mt-4 flex flex-wrap justify-center gap-4 md:mt-0">
                        <Button
                            onClick={(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
                                e.preventDefault()
                                toast.success(t("cookie-policy.value"))
                            }}
                            variant={"outline"}
                        >
                            <Info className="h-4 w-4" />
                            {t("cookie-policy.label")}
                        </Button>
                    </div>
                </div>
            </div>
        </footer>
    )
}
