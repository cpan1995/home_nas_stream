import { useMemo, useState } from "react";
import type { Movie } from "../bridge";
import { groupMovies } from "../media";

export function useMovieSelection(movies: Movie[]) {
  const groups = useMemo(() => groupMovies(movies), [movies]);
  const ordered = useMemo(
    () => groups.flatMap((group) => group.movies),
    [groups],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    ordered.find((movie) => movie.id === selectedId) || ordered[0];
  return { groups, ordered, selected, select: setSelectedId };
}
