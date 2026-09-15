import { useTranslation } from "react-i18next"
import { Link, useNavigate, useSearchParams } from "react-router-dom"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"

import { useAppSettings } from "@/hooks/use-appsettings.ts"
import { supportedLocales, type SupportedLocales } from "@/hooks/use-appsettings"
import { supportedRegions, useTmdb } from "@/hooks/use-tmdb.ts"
import { useOmss } from "@/hooks/use-omss.ts"
import { useHistory } from "@/hooks/use-history.ts"

import type { CountryISO3166_1 } from "@lorenzopant/tmdb"


import { Badge } from "@/components/ui/badge.tsx"
import { Item, ItemContent } from "@/components/ui/item.tsx"
import { H1, P } from "@/components/ui/typography.tsx"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

import ConfirmDialog from "@/components/layout/ConfirmDialog.tsx"

import { Monitor, Moon, RefreshCcw, Star, Sun, Trash2 } from "lucide-react"
import { useEffect } from "react"
import i18n from "i18next"
import { useTheme } from "@/app/providers/theme-provider"
import { useColorTheme } from "@/hooks/use-color-theme"
import { colorThemes } from "@/hooks/use-color-theme"
import { cn } from "@/lib/utils"

export default function Settings() {
    const { t } = useTranslation(["settings", "common", "header"])
    const navigate = useNavigate()

    const [searchParams, setSearchParams] = useSearchParams()

    const validTabs = ["general", "appearance", "history", "playback", "omss", "tmdb"] as const

    type Tab = (typeof validTabs)[number]

    const tabFromUrl = searchParams.get("tab")

    const currentTab: Tab = validTabs.includes(tabFromUrl as Tab) ? (tabFromUrl as Tab) : "general"

    useEffect(() => {
        // if no tab is specified in the URL, redirect to the first tab
        if (!tabFromUrl) {
            navigate({ pathname: location.pathname, search: `?tab=${validTabs[0]}` }, { replace: true })
        }
    }, [])

    const { theme, setTheme } = useTheme()
    const { colorTheme, setColorTheme } = useColorTheme()

    const { region, locale, autoplayNext, setLocale, setAutoplayNext, setRegion } = useAppSettings()
    const tmdb = useTmdb()

    const handleLanguageChange = (value: string) => {
        setLocale(value as SupportedLocales)
        // set i18n
        i18n.changeLanguage(value).catch((err) => {
            console.error("Failed to change language:", err)
        })
        // tmdb cache
        tmdb.cache?.clear()
        location.reload()
    }

    const { valid } = useOmss()
    const { clear, history, remove } = useHistory()
    const { cache } = useTmdb()

    return (
        <section className="mx-auto mt-25 min-h-[60vh] max-w-3xl space-y-6 px-4 sm:px-6">
            <H1>{t("title")}</H1>

            <Tabs
                value={currentTab}
                onValueChange={(value) => {
                    const params = new URLSearchParams(searchParams)

                    if (value === "general") {
                        params.delete("tab")
                    } else {
                        params.set("tab", value)
                    }

                    setSearchParams(params, {
                        replace: true,
                    })
                }}
                className="w-full px-3"
            >
                {/* Tabs header */}
                <div className="max-w-full overflow-x-auto pb-1">
                <TabsList variant="line" aria-label="Settings sections">
                    <TabsTrigger value="general">{t("general.title")}</TabsTrigger>
                    <TabsTrigger value="appearance">{t("tabs.appearance")}</TabsTrigger>
                    <TabsTrigger value="history">{t("tabs.history")}</TabsTrigger>
                    <TabsTrigger value="playback">{t("tabs.playback")}</TabsTrigger>
                    <TabsTrigger value="omss">Connection</TabsTrigger>
                    <TabsTrigger value="tmdb">{t("tabs.tmdb")}</TabsTrigger>
                </TabsList>
                </div>

                {/* ---------------- GENERAL ---------------- */}
                <TabsContent value="general">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t("general.title")}</CardTitle>
                            <CardDescription>{t("general.description")}</CardDescription>
                            <CardAction>
                                <Button asChild>
                                    <Link to={t("common:opensource.git-url")} target="_blank" rel="noopener noreferrer">
                                        <Star />
                                        <span className="ml-1 hidden sm:inline">
                                            {t("header:githubButton", {
                                                platform: t("common:opensource.git-platform"),
                                            })}
                                        </span>
                                    </Link>
                                </Button>
                            </CardAction>
                        </CardHeader>

                        <CardContent className="space-y-6">
                            <div className="mt-3 flex justify-between">
                                <div>
                                    <Label>{t("general.language.cardlabel")}</Label>
                                    <span className="flex pt-1 text-muted-foreground">{t("general.language.info", { gitUrl: t("common:opensource.git-url") })}</span>
                                    <span className="flex pt-1 font-semibold text-muted-foreground">
                                        Translations for languages other than English were generated with AI assistance and may contain inaccuracies. If you want to contribute a better translation for
                                        your language, please visit the url above.
                                    </span>
                                </div>

                                <Select value={locale} onValueChange={(value) => handleLanguageChange(value)}>
                                    <SelectTrigger className="max-w-min">
                                        <SelectValue placeholder={t("general.language.placeholder")} />
                                    </SelectTrigger>

                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectLabel>{t("general.language.selectlabel")}</SelectLabel>
                                            {[...supportedLocales]
                                                .sort((a, b) => a.label.localeCompare(b.label))
                                                .map((l) => (
                                                    <SelectItem key={l.iso639} value={l.iso639}>
                                                        {l.label}
                                                    </SelectItem>
                                                ))}
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="mt-3 flex justify-between">
                                <div>
                                    <Label>{t("general.reset.label")}</Label>
                                    <span className="flex pt-1 text-muted-foreground">{t("general.reset.info")}</span>
                                </div>
                                <ConfirmDialog
                                    title={t("general.reset.title")}
                                    description={t("general.reset.description")}
                                    onConfirm={() => {
                                        localStorage.clear()
                                        location.reload()
                                    }}
                                    trigger={
                                        <Button variant="destructive" className={"max-w-min"}>
                                            <RefreshCcw />
                                            <span className={"ml-1 hidden sm:inline"}>{t("general.reset.button")}</span>
                                        </Button>
                                    }
                                />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ---------------- APPEARANCE ---------------- */}
                <TabsContent value="appearance">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t("appearance.title")}</CardTitle>
                            <CardDescription>{t("appearance.description")}</CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-8">
                            {/* Light / Dark / System */}
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <Label>{t("appearance.theme.label")}</Label>
                                    <p className="pt-1 text-sm text-muted-foreground">{t("appearance.theme.info")}</p>
                                </div>

                                <div className="flex shrink-0 gap-1 rounded-lg border p-1">
                                    <button
                                        type="button"
                                        onClick={() => setTheme("light")}
                                        className={cn(
                                            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-all",
                                            theme === "light" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        <Sun className="size-4" />
                                        <span className="hidden sm:inline">{t("appearance.theme.light")}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setTheme("dark")}
                                        className={cn(
                                            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-all",
                                            theme === "dark" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        <Moon className="size-4" />
                                        <span className="hidden sm:inline">{t("appearance.theme.dark")}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setTheme("system")}
                                        className={cn(
                                            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-all",
                                            theme === "system" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        <Monitor className="size-4" />
                                        <span className="hidden sm:inline">{t("appearance.theme.system")}</span>
                                    </button>
                                </div>
                            </div>

                            {/* Color theme swatches */}
                            <div>
                                <Label>{t("appearance.colorTheme.label")}</Label>
                                <p className="pt-1 text-sm text-muted-foreground">{t("appearance.colorTheme.info")}</p>

                                <div className="mt-4 flex flex-wrap gap-4">
                                    {colorThemes.map((ct) => (
                                        <button type="button" key={ct.id} onClick={() => setColorTheme(ct.id)} className="group flex flex-col items-center gap-2" title={ct.label}>
                                            <div
                                                className={cn(
                                                    `swatch-${ct.id}`,
                                                    "size-9 rounded-full ring-offset-2 ring-offset-background transition-all",
                                                    colorTheme === ct.id ? "scale-110 ring-2 ring-foreground" : "hover:scale-105 hover:ring-2 hover:ring-foreground/40"
                                                )}
                                            />
                                            <span className={cn("text-xs transition-colors", colorTheme === ct.id ? "font-medium text-foreground" : "text-muted-foreground")}>{ct.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ---------------- HISTORY ---------------- */}
                <TabsContent value="history">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t("history.title")}</CardTitle>
                            <CardDescription>{t("history.description")}</CardDescription>

                            <CardAction>
                                <ConfirmDialog
                                    title={t("history.clear.title")}
                                    description={t("history.clear.description")}
                                    onConfirm={clear}
                                    trigger={
                                        <Button variant="destructive" className={"max-w-min"} disabled={!history.length}>
                                            <Trash2 />
                                            <span className={"ml-1 hidden sm:inline"}>{t("history.clear.button")}</span>
                                        </Button>
                                    }
                                />
                            </CardAction>
                        </CardHeader>

                        <CardContent className="space-y-4">
                            {!history.length ? (
                                <Empty className="rounded-lg border py-10">
                                    <EmptyHeader>
                                        <EmptyMedia variant="icon">
                                            <Trash2 className="size-5" />
                                        </EmptyMedia>
                                        <EmptyTitle>{t("history.empty.title")}</EmptyTitle>
                                        <EmptyDescription>{t("history.empty.description")}</EmptyDescription>
                                    </EmptyHeader>
                                </Empty>
                            ) : (
                                <div className="space-y-2">
                                    {history.map((item) => {
                                        const title = item.kind === "movie" ? item.item.title : `${item.item.tvshowtitle} • S${item.item.season_number}E${item.item.episode_number}`

                                        return (
                                            <Item key={title} className="lenis-stopped flex items-center justify-between border-dashed border-border">
                                                <ItemContent>
                                                    <P>{title}</P>
                                                </ItemContent>

                                                <ConfirmDialog
                                                    title={t("history.item.removeTitle")}
                                                    description={t("history.item.removeDescription")}
                                                    onConfirm={() => remove(item)}
                                                    trigger={
                                                        <Button variant="secondary" size="sm">
                                                            <Trash2 />
                                                            {t("history.item.removeButton")}
                                                        </Button>
                                                    }
                                                />
                                            </Item>
                                        )
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ---------------- PLAYBACK ---------------- */}
                <TabsContent value="playback">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t("playback.title")}</CardTitle>
                            <CardDescription>{t("playback.description")}</CardDescription>
                        </CardHeader>

                        <CardContent>
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <Label>{t("playback.autoplayNext.label")}</Label>
                                    <p className="text-sm text-muted-foreground">{t("playback.autoplayNext.description")}</p>
                                </div>

                                <Switch checked={autoplayNext} onCheckedChange={setAutoplayNext} />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ---------------- OMSS ---------------- */}
                <TabsContent value="omss">
                    <Card>
                        <CardHeader>
                            <CardTitle>Streaming connection</CardTitle>
                            <CardDescription>Connection status for playback.</CardDescription>
                            <CardAction>{valid ? <Badge>{t("omss.connection.connected")}</Badge> : <Badge variant="destructive">{t("omss.connection.disconnected")}</Badge>}</CardAction>
                        </CardHeader>

                        <CardContent>
                            <p className="text-sm text-muted-foreground">Streaming is managed by your administrator.</p>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ---------------- TMDB ---------------- */}
                <TabsContent value="tmdb">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t("tmdb.title")}</CardTitle>
                            <CardDescription>{t("tmdb.description")}</CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-4">
                            <div className="mt-3 flex flex-col justify-between md:flex-row">
                                <div>
                                    <Label>{t("tmdb.region.cardlabel")}</Label>

                                    <span className="flex py-2 pr-0 text-muted-foreground md:pr-4">
                                        {t("tmdb.region.info", {
                                            projectName: t("common:projectName"),
                                        })}
                                    </span>
                                </div>

                                <Select
                                    value={region}
                                    onValueChange={(value) => {
                                        setRegion(value as CountryISO3166_1)
                                        cache?.clear()
                                        location.reload()
                                    }}
                                >
                                    <SelectTrigger className="w-full md:w-3/5">
                                        <SelectValue placeholder={t("tmdb.region.placeholder")} />
                                    </SelectTrigger>

                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectLabel>{t("tmdb.region.selectlabel")}</SelectLabel>
                                        </SelectGroup>

                                        {supportedRegions.map((r) => (
                                            <SelectItem key={r.value} value={r.value}>
                                                {r.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </section>
    )
}
