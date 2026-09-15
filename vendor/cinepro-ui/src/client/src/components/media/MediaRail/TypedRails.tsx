import { MediaRail, type MediaRailProps } from "./MediaRail.tsx"
import { MediaCard } from "./MediaCard.tsx"
import type { MovieResultItem, TVSeriesResultItem } from "@lorenzopant/tmdb"

type BaseMediaRailProps<T> = Omit<MediaRailProps<T>, "renderItem" | "getKey">

export type MovieRailProps = BaseMediaRailProps<MovieResultItem>

export function MovieRail(props: MovieRailProps) {
    return (
        <MediaRail<MovieResultItem>
            {...props}
            getKey={(movie) => movie.id}
            renderItem={(movie) => (
                <MediaCard
                    title={movie.title}
                    imagePath={movie.poster_path}
                    imageAlt={movie.title}
                    id={movie.id}
                    type={"movie"}
                    year={new Date(movie.release_date).getFullYear()}
                    rating={movie.vote_average}
                />
            )}
        />
    )
}

export type TvRailProps = BaseMediaRailProps<TVSeriesResultItem>

export function TvRail(props: TvRailProps) {
    return (
        <MediaRail<TVSeriesResultItem>
            {...props}
            getKey={(tv) => tv.id}
            renderItem={(tv) => (
                <MediaCard title={tv.name} imagePath={tv.poster_path} imageAlt={tv.name} id={tv.id} type={"tv"} year={new Date(tv.first_air_date).getFullYear()} rating={tv.vote_average} />
            )}
        />
    )
}
