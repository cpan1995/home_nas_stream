import { useEffect, useRef, useState } from "react";
import { Film } from "lucide-react";
import type { Movie } from "../bridge";
import { fallbackArtwork } from "../bridge";
import { localArtwork, movieTitle, runtime } from "../media";

export function MediaArtwork({
  movie,
  lazy = false,
}: {
  movie: Movie;
  lazy?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!lazy);
  useEffect(() => {
    if (visible || !root.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [visible]);
  const [failed, setFailed] = useState<string[]>([]);
  const [fallback, setFallback] = useState({ id: "", image: "" });
  const remote = [movie.image, movie.backdropUrl, movie.posterUrl]
    .map((url) => localArtwork(url || ""))
    .find((url) => url && !failed.includes(url));
  useEffect(() => {
    let active = true;
    if (visible && !remote && movie.hasThumbnail) {
      fallbackArtwork(movie.id).then((image) => {
        if (active) setFallback({ id: movie.id, image });
      });
    }
    return () => {
      active = false;
    };
  }, [visible, remote, movie.id, movie.hasThumbnail]);
  const image =
    remote ||
    (fallback.id === movie.id ? localArtwork(fallback.image) : undefined);
  return (
    <div className="media-artwork" ref={root}>
      {visible && image && !failed.includes(image) ? (
        <img
          key={image}
          src={image}
          alt={`Artwork for ${movieTitle(movie)}`}
          referrerPolicy="no-referrer"
          onError={() => setFailed((urls) => [...urls, image])}
        />
      ) : (
        <div className="artwork-placeholder">
          <Film size={64} strokeWidth={1.3} />
          <span>Artwork unavailable</span>
        </div>
      )}
    </div>
  );
}
export function MediaMetadata({
  movie,
  compact = false,
}: {
  movie: Movie;
  compact?: boolean;
}) {
  const items = [
    movie.year || "Year unavailable",
    ...(!compact && movie.genre
      ? movie.genre.split(/\s*[·,]\s*/).filter(Boolean)
      : []),
    runtime(movie.duration),
  ];
  if (!compact && movie.width > 0)
    items.push(movie.width >= 3800 ? "4K" : movie.width >= 1280 ? "HD" : "SD");
  return (
    <span className={`media-metadata ${compact ? "compact" : ""}`}>
      {items.map((item, index) => (
        <span key={index}>{item}</span>
      ))}
    </span>
  );
}
