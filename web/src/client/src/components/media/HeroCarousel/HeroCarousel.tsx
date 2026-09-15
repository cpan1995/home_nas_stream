import { useMemo, useState } from "react"
import type { TMDB } from "@lorenzopant/tmdb"
import { Carousel, type CarouselApi, CarouselContent, CarouselItem } from "@/components/ui/carousel"
import { useHeroSlides } from "./use-heroslides"
import type { HeroFetcherResult } from "./types"
import { useHeroAutoplay } from "./use-hero-autoplay"
import { Button } from "@/components/ui/button.tsx"
import { StarRating } from "@/components/media/StarRating"
import "@/styles/animation.css"
import { useMediaDrawer } from "@/components/media/drawer/hooks/useMediaDrawer"
import { useIsMobile } from "@/hooks/use-mobile.ts"
import { useNavigate } from "react-router-dom"

export function HeroCarousel({ tmdb, fetcher }: { tmdb: TMDB; fetcher: HeroFetcherResult }) {
    const { open } = useMediaDrawer()
    const { slides, loading } = useHeroSlides(tmdb, fetcher)
    const isMobile = useIsMobile()
    const navigate = useNavigate()

    const [heroApi, setHeroApi] = useState<CarouselApi>()
    const [activeSlide, setActiveSlide] = useState(0)
    const [progressKey, setProgressKey] = useState(0)

    useHeroAutoplay({
        heroApi,
        enabled: true,
        slideCount: slides.length,
        onSelect: (index) => {
            setActiveSlide(index)
            setProgressKey((p) => p + 1)
        },
    })

    const heroEmptyState = useMemo(
        () => (
            <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
                <h1 className="animate-pulse text-2xl font-semibold">Loading content...</h1>
            </div>
        ),
        []
    )

    if (loading) return heroEmptyState
    if (slides.length === 0) return <div className="pt-32" />

    return (
        <Carousel setApi={setHeroApi} opts={{ loop: true }} className="h-full w-full">
            <CarouselContent className="ml-0 h-full">
                {slides.map((slide, index) => (
                    <CarouselItem key={`${slide.type}-${slide.id}`} className="pl-0" inert={activeSlide !== index ? true : undefined}>
                        <section className="relative h-[80vh] w-full overflow-hidden md:h-screen">
                            <div className="absolute inset-0">
                                <img src={slide.image} alt={slide.title} className="h-full w-full object-cover object-center" />
                            </div>
                            <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(0,0,0,0.92)_10%,rgba(0,0,0,0.45)_45%,rgba(0,0,0,0.82)_100%)]" />
                            <div className="relative z-10 flex h-full items-end">
                                <div className="mx-auto w-full max-w-7xl px-6 pb-18 sm:px-8 lg:px-12 lg:pb-23">
                                    <div className="max-w-2xl space-y-5">
                                        <img className="max-h-34 max-w-[50vw] sm:max-w-140" src={slide.logo} alt={slide.title} />
                                        <div className="flex flex-wrap items-center gap-4 text-sm text-white/70 sm:text-base">
                                            <StarRating rating={slide.rating} className="font-semibold" />
                                            <span>{new Date(slide.year).toLocaleDateString()}</span>
                                            <span>{slide.runtime}</span>
                                        </div>

                                        <p className="max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
                                            {slide.description.length > (isMobile ? 100 : 235)
                                                ? `${slide.description
                                                      .slice(0, isMobile ? 100 : 235)
                                                      .split(" ")
                                                      .slice(0, -1)
                                                      .join(" ")}...`
                                                : slide.description}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-3 pt-4">
                                            <Button
                                                className="rounded-full px-7"
                                                onClick={() => {
                                                    if (slide.type === "movie") {
                                                        navigate("/watch/movie/" + slide.id)
                                                    } else if (slide.type === "tv") {
                                                        navigate("/watch/tv/" + slide.id + "?s=1&e=1")
                                                    }
                                                }}
                                            >
                                                Play
                                            </Button>

                                            <Button
                                                variant="outline"
                                                className="rounded-full border-white/30 bg-white/10 px-7 text-white backdrop-blur-md hover:bg-white/20 hover:text-white"
                                                onClick={() => open({ type: slide.type, id: slide.id })}
                                            >
                                                Learn more
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </CarouselItem>
                ))}
            </CarouselContent>

            <div className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 gap-3">
                {slides.map((slide, index) => {
                    const isActive = activeSlide === index

                    return (
                        <button
                            aria-label={`Show ${slide.title}`}
                            key={`dot-${slide.title}-${slide.year}`}
                            onClick={() => {
                                heroApi?.scrollTo(index)
                                setProgressKey((p) => p + 1)
                            }}
                            className={`relative h-2.5 overflow-hidden rounded-full transition-all duration-300 ${isActive ? "w-10 bg-primary/20" : "w-2.5 bg-white/30 hover:bg-white/50"}`}
                        >
                            {isActive && <div key={`${progressKey}-${index}`} className="animate-carousel-progress absolute inset-0 origin-left rounded-full bg-primary" />}
                        </button>
                    )
                })}
            </div>
        </Carousel>
    )
}
