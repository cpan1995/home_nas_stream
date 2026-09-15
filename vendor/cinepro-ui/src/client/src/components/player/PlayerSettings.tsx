import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Check, Settings, Captions, Volume2, HardDrive, Gauge, Clapperboard } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useMediaWatchContext } from "./providers/MediaWatchProvider"
import { useSubtitles } from "./hooks/useSubtitles"
import { useAudioTracks } from "./hooks/useAudioTracks"
import { Badge } from "@/components/ui/badge"
import { normalizeQuality } from "@/lib/strings.utils.ts"

interface PlayerSettingsProps {
    ref: React.RefObject<HTMLDivElement | null>

    playbackRate: number
    onPlaybackRateChange: (rate: number) => void

    qualities: {
        index: number
        height: number
        label: string
    }[]

    currentQuality: number
    onQualityChange: (level: number) => void
}

export function PlayerSettings({ ref, playbackRate, onPlaybackRateChange, qualities, currentQuality, onQualityChange }: PlayerSettingsProps) {
    const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null)
    const { t } = useTranslation("player")
    const { state, selectSource } = useMediaWatchContext()
    const { subtitles, selectedSubtitle, selectSubtitle } = useSubtitles()
    const { audioTracks, selectedAudioTrack, selectAudioTrack } = useAudioTracks()

    const sources = useMemo(() => {
        return [...(state.media?.playback.sources || [])].reverse()
    }, [state.media?.playback.sources])

    const selectedSource = state.media?.playback.selectedSource

    const groupedSources = useMemo(() => {
        return sources.reduce<Record<string, typeof sources>>((acc, source) => {
            const provider = source.provider.name
            if (!acc[provider]) {
                acc[provider] = []
            }
            acc[provider].push(source)
            return acc
        }, {})
    }, [sources])

    return (
        <Popover onOpenChange={open => { if (open) setPortalContainer(ref.current) }}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" title={t("controls.settings")}>
                    <Settings className="h-5 w-5" />
                </Button>
            </PopoverTrigger>
            <PopoverContent container={portalContainer} align="end" className="w-full bg-black/50 backdrop-blur-md">
                <Tabs defaultValue="source" className="w-full">
                    <TabsList className="w-full justify-start p-0">
                        <TabsTrigger value="source">
                            <HardDrive className="mr-2" />
                            {t("settings.tabs.source")}
                        </TabsTrigger>
                        <TabsTrigger value="subtitles">
                            <Captions className="mr-2" />
                            {t("settings.tabs.subtitles")}
                        </TabsTrigger>
                        <TabsTrigger value="audio">
                            <Volume2 className="mr-2" />
                            {t("settings.tabs.audio")}
                        </TabsTrigger>

                        <TabsTrigger value="quality">
                            <Clapperboard className="mr-2" />
                            Quality
                        </TabsTrigger>

                        <TabsTrigger value="speed">
                            <Gauge className="mr-2" />
                            Speed
                        </TabsTrigger>
                    </TabsList>

                    <ScrollArea className="h-72">
                        <TabsContent value="source" className="m-0 p-2">
                            {Object.entries(groupedSources).map(([provider, providerSources]) => (
                                <div key={provider} className="mb-4 last:mb-0">
                                    <div className="px-2 py-1 text-xs font-semibold tracking-wider text-zinc-500 uppercase">{provider}</div>
                                    <div className="mt-1 space-y-1">
                                        {providerSources.map((source, idx) => {
                                            const isSelected = selectedSource?.url === source.url
                                            return (
                                                <button
                                                    key={`${source.provider.id}-${idx}`}
                                                    onClick={() => selectSource(source)}
                                                    className={`flex w-full items-center justify-between rounded-md px-2 py-2 transition-colors ${
                                                        isSelected ? "bg-primary/20 text-primary" : "text-zinc-300 hover:bg-zinc-800"
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium">{t("selectors.sourceNumber", { number: idx + 1 })}</span>
                                                        <Badge variant="outline" className="border-zinc-700 py-0 text-[10px]">
                                                            {normalizeQuality(source.quality)}
                                                        </Badge>
                                                    </div>
                                                    {isSelected && <Check className="" />}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))}
                        </TabsContent>

                        <TabsContent value="subtitles" className="m-0 p-2">
                            <button
                                onClick={() => selectSubtitle(undefined)}
                                className={`flex w-full items-center justify-between rounded-md px-2 py-2 transition-colors ${
                                    !selectedSubtitle ? "bg-primary/20 text-primary" : "text-zinc-300 hover:bg-zinc-800"
                                }`}
                            >
                                <span className="text-sm font-medium">{t("selectors.subtitlesOff")}</span>
                                {!selectedSubtitle && <Check className="" />}
                            </button>
                            {subtitles.map((sub, idx) => (
                                <button
                                    key={`${sub.url}-${idx}`}
                                    onClick={() => selectSubtitle(sub)}
                                    className={`flex w-full items-center justify-between rounded-md px-2 py-2 transition-colors ${
                                        selectedSubtitle?.url === sub.url ? "bg-primary/20 text-primary" : "text-zinc-300 hover:bg-zinc-800"
                                    }`}
                                >
                                    <span className="text-sm font-medium">{sub.label}</span>
                                    {selectedSubtitle?.url === sub.url && <Check className="" />}
                                </button>
                            ))}
                        </TabsContent>

                        <TabsContent value="audio" className="m-0 p-2">
                            {audioTracks.length > 0 ? (
                                audioTracks.map((track, idx) => (
                                    <button
                                        key={`${track.language}-${idx}`}
                                        onClick={() => selectAudioTrack(track)}
                                        className={`flex w-full items-center justify-between rounded-md px-2 py-2 transition-colors ${
                                            selectedAudioTrack?.language === track.language ? "bg-primary/20 text-primary" : "text-zinc-300 hover:bg-zinc-800"
                                        }`}
                                    >
                                        <span className="text-sm font-medium">{track.label || track.language}</span>
                                        {selectedAudioTrack?.language === track.language && <Check className="" />}
                                    </button>
                                ))
                            ) : (
                                <div className="p-4 text-center text-sm text-zinc-500">{t("settings.noAudioTracks")}</div>
                            )}
                        </TabsContent>

                        <TabsContent value="speed" className="m-0 p-2">
                            {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((speed) => (
                                <button
                                    key={speed}
                                    onClick={() => onPlaybackRateChange(speed)}
                                    className={`flex w-full items-center justify-between rounded-md px-2 py-2 transition-colors ${
                                        playbackRate === speed ? "bg-primary/20 text-primary-foreground" : ""
                                    }`}
                                >
                                    <span className="text-sm font-medium">{speed}x</span>

                                    {playbackRate === speed && <Check className="" />}
                                </button>
                            ))}
                        </TabsContent>

                        <TabsContent value="quality" className="m-0 p-2">
                            <button
                                onClick={() => onQualityChange(-1)}
                                className={`flex w-full items-center justify-between rounded-md px-2 py-2 transition-colors ${currentQuality === -1 ? "bg-primary/20 text-primary" : ""}`}
                            >
                                <span className="text-sm font-medium">Auto</span>

                                {currentQuality === -1 && <Check className="" />}
                            </button>

                            {qualities.map((quality) => (
                                <button
                                    key={quality.index}
                                    onClick={() => onQualityChange(quality.index)}
                                    className={`flex w-full items-center justify-between rounded-md px-2 py-2 transition-colors ${
                                        currentQuality === quality.index ? "bg-primary/20 text-primary" : ""
                                    }`}
                                >
                                    <span className="text-sm font-medium">{quality.label}</span>

                                    {currentQuality === quality.index && <Check className="" />}
                                </button>
                            ))}
                        </TabsContent>
                    </ScrollArea>
                </Tabs>
            </PopoverContent>
        </Popover>
    )
}
