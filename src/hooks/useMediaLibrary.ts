import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectPlayer,
  initialPlayback,
  type Catalog,
  type Movie,
  type PlayerBridge,
} from "../bridge";

export function useMediaLibrary() {
  const [catalog, setCatalog] = useState<Catalog>({ movies: [], path: "" });
  const [playback, setPlayback] = useState(initialPlayback);
  const [loading, setLoading] = useState(true);
  const [libraryError, setLibraryError] = useState("");
  const [playbackError, setPlaybackError] = useState("");
  const bridge = useRef<PlayerBridge | null>(null);
  const live = useRef(false);
  const accept = useCallback((value: Catalog) => {
    setCatalog(value);
    setLibraryError(value.error || "");
  }, []);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (!bridge.current)
        throw Error(
          "The media connection is unavailable. Reopen the application.",
        );
      const result = await bridge.current.refresh();
      if (live.current) accept(result);
    } catch (error) {
      if (live.current) setLibraryError((error as Error).message);
    } finally {
      if (live.current) setLoading(false);
    }
  }, [accept]);
  useEffect(() => {
    live.current = true;
    let active = true;
    connectPlayer(
      (value) => {
        if (active) setPlayback(value);
      },
      (value) => {
        if (active) accept(value);
      },
      (error) => {
        if (!active) return;
        setPlaybackError(error);
        // The native surface hides WebEngine. Return to it to display failures.
        bridge.current?.stop();
      },
    )
      .then(async (player) => {
        if (!active) return;
        bridge.current = player;
        const value = await player.library();
        if (active) accept(value);
      })
      .catch((error) => {
        if (active) setLibraryError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      live.current = false;
    };
  }, [accept]);
  const remoteUrls = useCallback(
    () => bridge.current?.remoteUrls() || Promise.resolve([]),
    [],
  );
  const play = (movie: Movie, restart = false) =>
    bridge.current?.play(movie.id, restart);
  return {
    catalog,
    loading,
    libraryError,
    playback,
    playbackError,
    refresh,
    play,
    remoteUrls,
    openCinePro: () => bridge.current?.openCinePro(),
    dismissPlaybackError: () => setPlaybackError(""),
  };
}
