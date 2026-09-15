import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  Circle,
  Film,
  List,
  MoreHorizontal,
  Play,
  Search,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import type { Movie } from "../bridge";
import cineproLogo from "../assets/cinepro.svg";
import { movieGroup, movieTitle, resumable, sourcePath } from "../media";
import { ActionButton } from "./Controls";
import { MediaArtwork, MediaMetadata } from "./Media";

export function SearchControl({ onSearch }: { onSearch: () => void }) {
  return (
    <ActionButton className="search-control" onClick={onSearch}>
      <Search size={22} />
      Search movies
    </ActionButton>
  );
}
export function DirectoryHeader({
  onSearch,
  onRefresh,
  loading,
}: {
  onSearch: () => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <header className="directory-header">
      <span>MOVIE DIRECTORY</span>
      <div className="header-controls">
        <SearchControl onSearch={onSearch} />
        <ActionButton
          className="refresh-control"
          aria-label="Refresh library"
          title="Refresh library"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw size={24} />
        </ActionButton>
      </div>
    </header>
  );
}
export function SplitPaneLayout({ children }: { children: ReactNode }) {
  return <div className="split-pane">{children}</div>;
}
export function AlphabetRail({
  groups,
  selected,
  onSelect,
  onRefresh,
  onCinePro,
  loading,
  onRemote,
  refreshLabel = "Refresh library",
}: {
  groups: ListProps["groups"];
  selected?: Movie;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  loading: boolean;
  onRemote?: () => void;
  refreshLabel?: string;
  onCinePro: () => void;
}) {
  const active = selected ? movieGroup(selected) : "";
  return (
    <nav className="alphabet-rail" aria-label="Browse by first letter">
      <div className="library-shortcuts">
        <button
          className="library-mark focus-ring"
          aria-label={refreshLabel}
          title={refreshLabel}
          onClick={onRefresh}
          disabled={loading}
        >
          <Film size={30} strokeWidth={1.7} />
        </button>
        <button
          type="button"
          className="library-mark cinepro-shortcut focus-ring"
          aria-label="Open CinePro"
          title="Open CinePro"
          onClick={onCinePro}
        >
          <img src={cineproLogo} width="38" height="34" alt="" />
        </button>
      </div>
      {onRemote && (
        <button
          type="button"
          className="library-mark focus-ring"
          aria-label="Phone remote"
          title="Phone remote"
          onClick={onRemote}
        >
          <Smartphone size={28} />
        </button>
      )}
      <div
        className="alphabet-links"
        style={
          {
            "--active-index": ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].indexOf(
              active,
            ),
          } as CSSProperties
        }
      >
        {active && <span className="alphabet-indicator" aria-hidden="true" />}
        {["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((letter) => {
          const first = groups.find((group) => group.letter === letter)
            ?.movies[0];
          return (
            <button
              key={letter}
              className="alphabet-letter focus-ring"
              data-letter={letter}
              aria-label={
                letter === "#"
                  ? "Browse numbers and symbols"
                  : `Browse ${letter}`
              }
              aria-current={active === letter ? "true" : undefined}
              disabled={!first}
              tabIndex={active === letter ? 0 : -1}
              onClick={() => first && onSelect(first.id)}
            >
              {letter}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
export function MovieListRow({
  movie,
  selected,
  onSelect,
  onPlay,
}: {
  movie: Movie;
  selected: boolean;
  onSelect: (id: string) => void;
  onPlay: (movie: Movie) => void;
}) {
  return (
    <button
      className={`movie-row focus-ring ${selected ? "selected" : ""}`}
      data-movie-id={movie.id}
      tabIndex={selected ? 0 : -1}
      aria-current={selected ? "true" : undefined}
      title={`${movieTitle(movie)} — ${movie.sourcePath || movie.filename}`}
      onFocus={() => onSelect(movie.id)}
      onClick={() => {
        onSelect(movie.id);
        onPlay(movie);
      }}
    >
      {selected && (
        <Play
          className="row-play"
          size={30}
          fill="currentColor"
          strokeWidth={0}
          aria-hidden="true"
        />
      )}
      <span className="row-copy">
        <span className="row-title">{movieTitle(movie)}</span>
        <MediaMetadata movie={movie} compact />
      </span>
      <ChevronRight size={22} aria-hidden="true" />
    </button>
  );
}
type ListProps = {
  groups: { letter: string; movies: Movie[] }[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onPlay: (movie: Movie) => void;
};
export function AlphabetSection({
  letter,
  movies,
  selectedId,
  onSelect,
  onPlay,
}: ListProps["groups"][number] & Omit<ListProps, "groups">) {
  return (
    <section
      className="alphabet-section"
      aria-label={`Titles beginning with ${letter}`}
    >
      <h3>
        <span>{letter}</span>
      </h3>
      <ul>
        {movies.map((movie) => (
          <li key={movie.id}>
            <MovieListRow
              movie={movie}
              selected={movie.id === selectedId}
              onSelect={onSelect}
              onPlay={onPlay}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
export function AlphabeticalMovieList(
  props: ListProps & { onSearch: () => void },
) {
  const count = props.groups.reduce(
    (total, group) => total + group.movies.length,
    0,
  );
  return (
    <section
      className="directory-list panel"
      aria-label="Alphabetical movie directory"
    >
      <div className="list-heading">
        <h1>Movies A–Z</h1>
        <span>
          {count} {count === 1 ? "title" : "titles"}
        </span>
      </div>
      <SearchControl onSearch={props.onSearch} />
      <div className="list-scroll">
        {props.groups.map((group) => (
          <AlphabetSection
            key={group.letter}
            {...group}
            selectedId={props.selectedId}
            onSelect={props.onSelect}
            onPlay={props.onPlay}
          />
        ))}
      </div>
    </section>
  );
}
export function SelectedMoviePanel({
  movie,
  path,
  onPlay,
  onOptions,
}: {
  movie: Movie;
  path: string;
  onPlay: (movie: Movie) => void;
  onOptions: () => void;
}) {
  const copy = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = copy.current?.animate(
      [
        { opacity: 0.65, transform: "translateY(6px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
    return () => animation?.cancel();
  }, [movie.id]);
  return (
    <section
      className="selected-panel panel"
      aria-label="Selected movie"
      data-selected-id={movie.id}
    >
      <MediaArtwork movie={movie} />
      <div className="selected-copy" ref={copy}>
        <h2 title={movieTitle(movie)}>{movieTitle(movie)}</h2>
        <MediaMetadata movie={movie} />
        <p className="synopsis">
          {movie.synopsis || "No synopsis is available for this movie."}
        </p>
        {movie.duration > 0 && (
          <div className="watch-progress">
            <div className="progress-label">
              <span>Progress</span>
              <span>
                {movie.position > 0
                  ? `${Math.max(0, Math.ceil((movie.duration - movie.position) / 60))} min remaining`
                  : "Not started"}
              </span>
            </div>
            <progress
              aria-label="Movie progress"
              max={movie.duration}
              value={Math.min(movie.duration, Math.max(0, movie.position))}
            />
          </div>
        )}
        <div className="panel-actions">
          <ActionButton
            variant="primary"
            aria-label="Play movie"
            onClick={() => onPlay(movie)}
          >
            <Play size={23} fill="currentColor" />
            {resumable(movie) ? "Resume" : "Play"}
          </ActionButton>
          <ActionButton onClick={onOptions}>
            <List size={26} />
            Movie options
          </ActionButton>
        </div>
        <div className="panel-footer">
          <p className="source-path" title={sourcePath(movie, path)}>
            {movie.filename}
          </p>
          <p className="remote-hints">
            <span>
              <ArrowUp size={18} />
              <ArrowDown size={18} /> Browse
            </span>
            <span>
              <Search size={20} /> Search
            </span>
            <span>
              <MoreHorizontal size={22} /> Actions
            </span>
            <span>
              <Circle size={18} /> OK Play
            </span>
            <span>
              <ArrowLeft size={22} /> Back
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
