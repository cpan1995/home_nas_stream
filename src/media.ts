import type { Movie } from "./bridge";

const collator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});
export const movieTitle = (movie: Movie) =>
  movie.title?.trim() || movie.filename || "Untitled movie";
export const movieGroup = (movie: Movie) => {
  const first = movieTitle(movie).charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : "#";
};
export function groupMovies(movies: Movie[]) {
  const sorted = [...movies].sort((a, b) => {
    const groupA = movieGroup(a),
      groupB = movieGroup(b);
    return (
      (groupA === "#" ? 1 : 0) - (groupB === "#" ? 1 : 0) ||
      collator.compare(groupA, groupB) ||
      collator.compare(movieTitle(a), movieTitle(b)) ||
      collator.compare(a.year || "", b.year || "") ||
      collator.compare(
        a.sourcePath || a.filename,
        b.sourcePath || b.filename,
      ) ||
      a.id.localeCompare(b.id)
    );
  });
  const groups: { letter: string; movies: Movie[] }[] = [];
  for (const movie of sorted) {
    const letter = movieGroup(movie);
    if (groups.at(-1)?.letter !== letter) groups.push({ letter, movies: [] });
    groups.at(-1)!.movies.push(movie);
  }
  return groups;
}
export const runtime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "Runtime unavailable";
  const minutes = Math.max(1, Math.floor(seconds / 60));
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`
    : `${minutes}m`;
};
export const resumable = (movie: Movie) =>
  movie.position > 10 && movie.position < movie.duration - 30;
export const sourcePath = (movie: Movie, root = "") =>
  movie.sourcePath ||
  [root.replace(/[\\/]$/, ""), movie.filename].filter(Boolean).join("/");
export const matchesQuery = (movie: Movie, query: string) =>
  [
    movieTitle(movie),
    movie.year,
    movie.edition,
    movie.genre,
    movie.sourcePath,
    movie.filename,
  ]
    .join(" ")
    .toLocaleLowerCase()
    .includes(query.trim().toLocaleLowerCase());

// Never send artwork requests to a remote host. Native art is a local data URL.
export function localArtwork(src: string) {
  if (!src) return undefined;
  if (/^data:image\/(png|jpeg|webp|avif);base64,/i.test(src)) return src;
  try {
    const url = new URL(src, window.location.href);
    if (
      url.protocol === "https:" &&
      url.hostname === "image.tmdb.org" &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname.startsWith("/t/p/")
    )
      return url.href;
    if (["file:", "qrc:"].includes(url.protocol)) return url.href;
    if (
      url.origin === window.location.origin &&
      ["http:", "https:"].includes(url.protocol)
    )
      return url.href;
  } catch {
    /* Invalid artwork falls back to the local placeholder. */
  }
  return undefined;
}
