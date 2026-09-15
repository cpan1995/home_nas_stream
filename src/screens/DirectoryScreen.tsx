import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  PhoneRemoteCorner,
  PhoneRemoteDialog,
} from "../components/PhoneRemoteDialog";
import type { Movie } from "../bridge";
import { useMediaLibrary } from "../hooks/useMediaLibrary";
import tmdbLogo from "../assets/tmdb.svg";
import { useMovieSelection } from "../hooks/useMovieSelection";
import {
  focusControl,
  useRemoteNavigation,
} from "../hooks/useRemoteNavigation";
import {
  AlphabeticalMovieList,
  AlphabetRail,
  DirectoryHeader,
  SelectedMoviePanel,
  SplitPaneLayout,
} from "../components/Directory";
import {
  DisconnectedLibraryState,
  EmptyLibraryState,
  LoadingState,
  PlaybackErrorState,
} from "../components/LibraryStates";
import { ActionButton, Modal } from "../components/Controls";
import { SearchScreen } from "../components/SearchScreen";
import { MediaMetadata } from "../components/Media";
import { movieTitle, resumable, sourcePath } from "../media";

export function DirectoryScreen() {
  const media = useMediaLibrary();
  const { groups, ordered, selected, select } = useMovieSelection(
    media.catalog.movies,
  );
  const [searching, setSearching] = useState(false);
  const [remote, setRemote] = useState(false);
  const [options, setOptions] = useState(false);
  const root = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const playing = Boolean(media.playback.id);
  const [scale, setScale] = useState(() =>
    Math.min(innerWidth / 1920, innerHeight / 1080),
  );
  useEffect(() => {
    const resize = () =>
      setScale(Math.min(innerWidth / 1920, innerHeight / 1080));
    addEventListener("resize", resize);
    return () => removeEventListener("resize", resize);
  }, []);
  const focusRow = () =>
    focusControl(
      [...root.current!.querySelectorAll<HTMLElement>(".movie-row")].find(
        (row) => row.dataset.movieId === selected?.id,
      ),
    );
  const back = () => {
    if (media.playbackError) media.dismissPlaybackError();
    else if (remote) setRemote(false);
    else if (options) setOptions(false);
    else if (searching) setSearching(false);
    else focusRow();
  };
  useRemoteNavigation({
    root,
    selectedId: selected?.id,
    blocked: playing,
    onBack: back,
  });
  useLayoutEffect(() => {
    if (playing || searching || options || remote || media.playbackError)
      return;
    if (
      returnFocus.current?.isConnected &&
      !returnFocus.current.closest("[hidden]")
    ) {
      focusControl(returnFocus.current);
      returnFocus.current = null;
    } else if (!media.loading && !media.libraryError && selected) focusRow();
    else
      focusControl(
        root.current?.querySelector<HTMLElement>(".library-state button") ||
          root.current?.querySelector<HTMLElement>(".search-control"),
      );
  }, [
    playing,
    searching,
    options,
    remote,
    media.playbackError,
    media.loading,
    media.libraryError,
    selected?.id,
  ]);
  const play = (movie: Movie, restart = false) => {
    returnFocus.current = options
      ? root.current?.querySelector<HTMLElement>(".panel-actions .secondary") ||
        null
      : (document.activeElement as HTMLElement);
    setOptions(false);
    media.play(movie, restart);
  };
  return (
    <main
      ref={root}
      className="tv-stage"
      style={
        {
          "--ui-scale": scale,
          transform: `translate(-50%, -50%) scale(${scale})`,
        } as CSSProperties
      }
    >
      <div className="directory-screen" hidden={searching} inert={playing}>
        <PhoneRemoteCorner
          loadUrls={media.remoteUrls}
          open={() => setRemote(true)}
        />
        <AlphabetRail
          groups={groups}
          selected={selected}
          onSelect={(id) => {
            select(id);
            requestAnimationFrame(() =>
              focusControl(
                [
                  ...root.current!.querySelectorAll<HTMLElement>(".movie-row"),
                ].find((row) => row.dataset.movieId === id),
              ),
            );
          }}
          onRefresh={media.refresh}
          onCinePro={media.openCinePro}
          loading={media.loading}
        />
        {(media.loading || media.libraryError || !selected) && (
          <DirectoryHeader
            onSearch={() => setSearching(true)}
            onRefresh={media.refresh}
            loading={media.loading}
          />
        )}
        {media.loading ? (
          <LoadingState />
        ) : media.libraryError ? (
          <DisconnectedLibraryState
            retry={media.refresh}
            error={media.libraryError}
            path={media.catalog.path}
          />
        ) : !selected ? (
          <EmptyLibraryState retry={media.refresh} path={media.catalog.path} />
        ) : (
          <SplitPaneLayout>
            <AlphabeticalMovieList
              groups={groups}
              selectedId={selected.id}
              onSelect={select}
              onPlay={play}
              onSearch={() => setSearching(true)}
            />
            <SelectedMoviePanel
              movie={selected}
              path={media.catalog.path}
              onPlay={play}
              onOptions={() => setOptions(true)}
            />
          </SplitPaneLayout>
        )}
      </div>
      {searching && (
        <SearchScreen
          onCinePro={media.openCinePro}
          movies={ordered}
          close={() => setSearching(false)}
          choose={(id) => {
            select(id);
            setSearching(false);
          }}
        />
      )}
      {remote && (
        <PhoneRemoteDialog
          loadUrls={media.remoteUrls}
          close={() => setRemote(false)}
        />
      )}
      {options && selected && (
        <Modal title="Movie options" close={() => setOptions(false)}>
          <h3 className="option-title">{movieTitle(selected)}</h3>
          <MediaMetadata movie={selected} />
          <p>
            {selected.edition || "Original file"}
            {selected.codec ? ` · ${selected.codec.toUpperCase()}` : ""}
            {selected.size > 0
              ? ` · ${(selected.size / 1024 ** 3).toFixed(1)} GB`
              : ""}
          </p>
          <p className="source-path">
            {sourcePath(selected, media.catalog.path)}
          </p>
          {selected.tmdbId && (
            <section className="metadata-credits" aria-label="Metadata credits">
              <img src={tmdbLogo} width="110" alt="TMDB" />
              <p>
                This product uses the TMDB API but is not endorsed or certified
                by TMDB.
              </p>
            </section>
          )}
          <div className="modal-actions">
            <ActionButton
              variant="primary"
              data-autofocus
              onClick={() => play(selected)}
            >
              {resumable(selected) ? "Resume movie" : "Play movie"}
            </ActionButton>
            {resumable(selected) && (
              <ActionButton onClick={() => play(selected, true)}>
                Play from beginning
              </ActionButton>
            )}
            <ActionButton onClick={() => setOptions(false)}>Back</ActionButton>
          </div>
        </Modal>
      )}
      {media.playbackError && (
        <PlaybackErrorState
          error={media.playbackError}
          close={media.dismissPlaybackError}
          retry={() => {
            media.dismissPlaybackError();
            if (selected) play(selected);
          }}
        />
      )}
    </main>
  );
}
