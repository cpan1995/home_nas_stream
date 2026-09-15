import * as React from "react"
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import { cn } from "@/lib/utils.ts"

export interface MediaRailProps<T> {
    title?: React.ReactNode | string
    fetcher: () => Promise<{ results: T[] } | T[]>
    getKey: (item: T) => string | number
    renderItem: (item: T) => React.ReactNode
    onSelect?: (item: T) => void
    className?: string
    itemClassName?: string
    skeletonCount?: number
    renderSkeleton?: (index: number) => React.ReactNode
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMediaRail<T>(fetcher: () => Promise<{ results: T[] } | T[]>) {
    const [items, setItems] = React.useState<T[]>([])
    const [isLoading, setIsLoading] = React.useState(true)
    const [error, setError] = React.useState<Error | null>(null)

    const fetchData = React.useCallback(async () => {
        setIsLoading(true)
        try {
            const data = await fetcher()
            const results = Array.isArray(data) ? data : data.results
            setItems(results || [])
            setError(null)
        } catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)))
        } finally {
            setIsLoading(false)
        }
    }, [fetcher])

    React.useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchData()
    }, [fetchData])

    return { items, isLoading, error, refetch: fetchData }
}

export function MediaRail<T>({ title, fetcher, getKey, renderItem, className, itemClassName, skeletonCount = 6, renderSkeleton }: MediaRailProps<T>) {
    const { items, isLoading, error } = useMediaRail(fetcher)

    if (error) {
        return null
    }

    const defaultRenderSkeleton = (index: number) => (
        <div key={`skeleton-${index}`} className="space-y-3">
            <Skeleton className="aspect-2/3 w-full" />
        </div>
    )

    return (
        <div data-remote-rail className={cn("space-y-4", className)}>
            {typeof title === "string" ? <h2 className="text-2xl font-semibold">{title}</h2> : title}
            <Carousel
                data-remote-row
                opts={{
                    align: "start",
                    loop: false,
                    dragFree: true,
                }}
                className="w-full"
            >
                <CarouselContent className="-ml-2 md:-ml-4">
                    {isLoading
                        ? Array.from({ length: skeletonCount }).map((_, i) => (
                              <CarouselItem key={`skeleton-${i}`} className={cn("basis-1/2 pl-2 sm:basis-1/3 md:basis-1/4 md:pl-4 lg:basis-1/5 xl:basis-1/7", itemClassName)}>
                                  {renderSkeleton ? renderSkeleton(i) : defaultRenderSkeleton(i)}
                              </CarouselItem>
                          ))
                        : items.map((item) => (
                              <CarouselItem key={getKey(item)} className={cn("basis-1/2 pl-2 sm:basis-1/3 md:basis-1/4 md:pl-4 lg:basis-1/5 xl:basis-1/7", itemClassName)}>
                                  <div>{renderItem(item)}</div>
                              </CarouselItem>
                          ))}
                </CarouselContent>
                {!isLoading && items.length > 0 && (
                    <>
                        <CarouselPrevious className="hidden md:flex" />
                        <CarouselNext className="hidden md:flex" />
                    </>
                )}
            </Carousel>
        </div>
    )
}
