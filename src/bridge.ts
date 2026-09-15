export type Movie = {
  id: string;
  title: string;
  year: string;
  filename: string;
  edition: string;
  duration: number;
  position: number;
  size: number;
  width: number;
  height: number;
  codec: string;
  image: string;
  sourcePath?: string;
  synopsis?: string;
  genre?: string;
  tmdbId?: number;
  posterUrl?: string;
  backdropUrl?: string;
  hasThumbnail?: boolean;
  metadataStatus?: string;
};
export type Catalog = { movies: Movie[]; path: string; error?: string };
export type Track = {
  id: number;
  type: "audio" | "sub";
  title: string;
  lang: string;
  selected: boolean;
};
export type Playback = {
  id: string;
  position: number;
  duration: number;
  paused: boolean;
  loading: boolean;
  volume: number;
  ended: boolean;
  tracks: Track[];
};
export const initialPlayback: Playback = {
  id: "",
  position: 0,
  duration: 0,
  paused: false,
  loading: false,
  volume: 100,
  ended: false,
  tracks: [],
};
type Signal = { connect: (fn: (value: string) => void) => void };
type Native = {
  remoteUrls: (done: (value: string[]) => void) => void;
  library: (done: (value: string) => void) => void;
  refreshLibrary: (done: (value: string) => void) => void;
  requestThumbnail: (id: string) => void;
  thumbnailReady: {
    connect: (fn: (id: string, image: string) => void) => void;
  };
  playbackState: (done: (value: string) => void) => void;
  play: (id: string, restart: boolean) => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  volume: (value: number) => void;
  track: (type: string, id: number) => void;
  fullscreen: () => void;
  openCinePro: () => void;
  playbackChanged: Signal;
  libraryChanged: Signal;
  playbackError: Signal;
};
declare global {
  interface Window {
    qt?: { webChannelTransport: unknown };
    QWebChannel?: new (
      transport: unknown,
      ready: (channel: { objects: { player: Native } }) => void,
    ) => unknown;
  }
}

export interface PlayerBridge {
  native: boolean;
  remoteUrls: () => Promise<string[]>;
  library: () => Promise<Catalog>;
  refresh: () => Promise<Catalog>;
  play: (id: string, restart?: boolean) => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  volume: (value: number) => void;
  track: (type: string, id: number) => void;
  fullscreen: () => void;
  openCinePro: () => void;
}

let thumbnailPlayer: Native | undefined;
const thumbnailRequests = new Map<string, ((image: string) => void)[]>();
export function fallbackArtwork(id: string): Promise<string> {
  if (!thumbnailPlayer) return Promise.resolve(`/artwork/${id}.jpg`);
  return new Promise((resolve) => {
    const waiting = thumbnailRequests.get(id);
    if (waiting) {
      waiting.push(resolve);
      return;
    }
    thumbnailRequests.set(id, [resolve]);
    thumbnailPlayer!.requestThumbnail(id);
  });
}

export async function connectPlayer(
  onState: (s: Playback) => void,
  onLibrary: (c: Catalog) => void,
  onError: (e: string) => void,
): Promise<PlayerBridge> {
  if (!window.qt) {
    const library = async () => {
      const review = (window as Window & { __screeningReview?: Catalog })
        .__screeningReview;
      if (review) return review;
      // Static review builds include a snapshot; the Vite preview reads the live index.
      if (new URLSearchParams(location.search).has("review")) {
        const response = await fetch("./library-preview.json");
        if (!response.ok)
          throw Error("The review library could not be loaded.");
        return (await response.json()) as Catalog;
      }
      const response = await fetch("/api/library");
      const value = await response.json();
      if (!response.ok) throw Error(value.error);
      return value as Catalog;
    };
    const noop = () => {};
    return {
      native: false,
      remoteUrls: async () => [],
      library,
      refresh: library,
      play: () =>
        onError(
          "Open the desktop app to play this movie. Playback is unavailable in the browser preview.",
        ),
      pause: noop,
      stop: noop,
      seek: noop,
      volume: noop,
      track: noop,
      openCinePro: () =>
        onError("Open the desktop app to use the CinePro tab."),
      fullscreen: () => {
        document.documentElement.requestFullscreen().catch(() => {});
      },
    };
  }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "qrc:///qtwebchannel/qwebchannel.js";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(Error("Could not connect to the native player."));
    document.head.append(script);
  });
  return new Promise((resolve, reject) => {
    if (!window.QWebChannel) {
      reject(Error("The native player connection is missing."));
      return;
    }
    new window.QWebChannel(
      window.qt!.webChannelTransport,
      ({ objects: { player } }) => {
        thumbnailPlayer = player;
        player.thumbnailReady.connect((id, image) => {
          const waiting = thumbnailRequests.get(id) || [];
          thumbnailRequests.delete(id);
          waiting.forEach((resolve) => resolve(image));
        });
        // Reuse the existing channel for desktop integration checks; never create a second one.
        Object.defineProperty(window, "__screeningPlayer", {
          value: player,
          configurable: true,
        });
        player.playbackChanged.connect((value) => onState(JSON.parse(value)));
        player.libraryChanged.connect((value) => onLibrary(JSON.parse(value)));
        player.playbackError.connect(onError);
        player.playbackState((value) => onState(JSON.parse(value)));
        resolve({
          native: true,
          remoteUrls: () => new Promise((done) => player.remoteUrls(done)),
          library: () =>
            new Promise((done) =>
              player.library((value) => done(JSON.parse(value))),
            ),
          refresh: () =>
            new Promise((done) =>
              player.refreshLibrary((value) => done(JSON.parse(value))),
            ),
          play: (id, restart = false) => player.play(id, restart),
          pause: () => player.pause(),
          stop: () => player.stop(),
          seek: (time) => player.seek(time),
          volume: (value) => player.volume(value),
          track: (type, id) => player.track(type, id),
          fullscreen: () => player.fullscreen(),
          openCinePro: () => player.openCinePro(),
        });
      },
    );
  });
}
