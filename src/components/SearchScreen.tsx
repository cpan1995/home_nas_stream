import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowBigUp,
  ArrowLeft,
  ChevronRight,
  CircleDot,
  Delete,
  Move,
  Play,
  Search,
  Trash2,
} from "lucide-react";
import type { Movie } from "../bridge";
import { groupMovies, matchesQuery, movieTitle } from "../media";
import { ActionButton } from "./Controls";
import { AlphabetRail } from "./Directory";
import { MediaArtwork, MediaMetadata } from "./Media";
import { focusControl } from "../hooks/useRemoteNavigation";

export function SearchScreen({
  movies,
  close,
  choose,
  onCinePro,
}: {
  movies: Movie[];
  close: () => void;
  choose: (id: string) => void;
  onCinePro: () => void;
}) {
  const [query, setQuery] = useState("");
  const [symbols, setSymbols] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLElement>(null);
  const caret = useRef<number | null>(null);
  const keyboardFocus = useRef<HTMLElement | null>(null);
  const keyboardColumn = useRef<number | null>(null);
  const results = movies.filter((movie) => matchesQuery(movie, query));
  const selected =
    results.find((movie) => movie.id === selectedId) || results[0];
  const count = `${results.length} ${results.length === 1 ? "result" : "results"}`;
  useEffect(() => {
    focusControl(input.current);
  }, []);
  useLayoutEffect(() => {
    if (caret.current !== null) {
      input.current?.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [query]);
  const edit = (text: string, remove = false) => {
    const start = input.current?.selectionStart ?? query.length;
    const end = input.current?.selectionEnd ?? start;
    const from = remove && start === end ? Math.max(0, start - 1) : start;
    caret.current = from + text.length;
    const next = query.slice(0, from) + text + query.slice(end);
    if (next === query) {
      // React skips the render when the selected text is replaced by itself.
      input.current?.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
    setQuery(next);
  };
  const focusResult = () =>
    focusControl(
      root.current?.querySelector<HTMLElement>(
        ".search-result[aria-current=true]",
      ),
    );
  const focusKeyboard = () => {
    const previous = keyboardFocus.current;
    focusControl(
      previous?.isConnected && !previous.matches(":disabled")
        ? previous
        : root.current?.querySelector<HTMLElement>(".keyboard button"),
    );
  };
  const navigateKeyboard = (target: HTMLElement, key: string) => {
    const keyboardRows = [
      ...root.current!.querySelectorAll<HTMLElement>(
        ".keyboard-row, .keyboard-actions",
      ),
    ].map((row) => [
      ...row.querySelectorAll<HTMLElement>("button:not(:disabled)"),
    ]);
    const rowIndex = keyboardRows.findIndex((row) => row.includes(target));
    if (rowIndex < 0) return;
    const row = keyboardRows[rowIndex];
    if (key === "ArrowLeft" || key === "ArrowRight") {
      keyboardColumn.current = null;
      const next = row.indexOf(target) + (key === "ArrowRight" ? 1 : -1);
      if (next === row.length) focusResult();
      else focusControl(row[Math.max(0, next)]);
      return;
    }
    const nextRow = rowIndex + (key === "ArrowDown" ? 1 : -1);
    if (nextRow < 0) {
      focusControl(input.current);
      return;
    }
    if (nextRow >= keyboardRows.length) return;
    const center = (node: HTMLElement) => {
      const rect = node.getBoundingClientRect();
      return rect.left + rect.width / 2;
    };
    // Keep the original column across the wider Space/Clear/Done keys.
    const column = keyboardColumn.current ?? center(target);
    const nearest = keyboardRows[nextRow].reduce((best, node) =>
      Math.abs(center(node) - column) < Math.abs(center(best) - column)
        ? node
        : best,
    );
    focusControl(nearest);
    keyboardColumn.current = column;
  };
  const rows = symbols
    ? ["1234567890", "-&'().!?:", "@/#%+_="]
    : ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
  return (
    <section
      ref={root}
      className="search-screen"
      aria-label="Search"
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        if (
          target.closest(".keyboard, .search-result") &&
          event.key.length === 1 &&
          event.key !== " " &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          !event.nativeEvent.isComposing
        ) {
          event.preventDefault();
          edit(event.key);
          focusControl(input.current);
          return;
        }
        if (event.key === "Backspace" && target.tagName !== "INPUT") {
          event.preventDefault();
          event.stopPropagation();
          edit("", true);
          return;
        }
        if (
          target.closest(".keyboard") &&
          ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
            event.key,
          )
        ) {
          event.preventDefault();
          event.stopPropagation();
          navigateKeyboard(target, event.key);
          return;
        }
        const result = target.closest<HTMLElement>(".search-result");
        if (
          result &&
          ["ArrowUp", "ArrowDown", "ArrowLeft"].includes(event.key)
        ) {
          event.preventDefault();
          event.stopPropagation();
          if (event.key === "ArrowLeft") {
            focusKeyboard();
            return;
          }
          const nodes = [
            ...root.current!.querySelectorAll<HTMLElement>(".search-result"),
          ];
          const index =
            nodes.indexOf(result) + (event.key === "ArrowDown" ? 1 : -1);
          focusControl(nodes[Math.max(0, Math.min(nodes.length - 1, index))]);
        }
      }}
    >
      <AlphabetRail
        groups={groupMovies(movies)}
        selected={selected}
        onSelect={choose}
        onRefresh={close}
        onCinePro={onCinePro}
        refreshLabel="Back to directory"
        loading={false}
      />
      <div className="search-layout">
        <div className="search-editor">
          <header className="list-heading">
            <h1>Movies A–Z</h1>
            <span aria-live="polite">{count}</span>
          </header>
          <div className="search-input">
            <Search size={32} />
            <input
              ref={input}
              aria-label="Search movies"
              placeholder="Search movies"
              value={query}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                caret.current = null;
                setQuery(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  focusResult();
                }
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  event.stopPropagation();
                  if (event.key === "ArrowDown") focusKeyboard();
                }
              }}
            />
          </div>
          <div
            className="keyboard"
            aria-label="On-screen keyboard"
            onFocusCapture={(event) => {
              keyboardFocus.current = event.target as HTMLElement;
              keyboardColumn.current = null;
            }}
          >
            {rows.map((letters, index) => (
              <div className="keyboard-row" key={index}>
                {index === 2 && (
                  <ActionButton
                    className="mode-key"
                    aria-label={
                      symbols ? "Show letters" : "Show numbers and symbols"
                    }
                    aria-pressed={symbols}
                    onClick={() => setSymbols((value) => !value)}
                  >
                    {symbols ? (
                      "ABC"
                    ) : (
                      <ArrowBigUp size={30} fill="currentColor" />
                    )}
                  </ActionButton>
                )}
                {[...letters].map((key) => (
                  <ActionButton key={key} onClick={() => edit(key)}>
                    {key}
                  </ActionButton>
                ))}
                {index === 2 && (
                  <ActionButton
                    aria-label="Delete"
                    onClick={() => edit("", true)}
                  >
                    <Delete size={31} />
                  </ActionButton>
                )}
              </div>
            ))}
            <div className="keyboard-actions">
              <ActionButton onClick={() => edit(" ")}>Space</ActionButton>
              <ActionButton
                onClick={() => {
                  caret.current = 0;
                  setQuery("");
                }}
              >
                Clear
              </ActionButton>
              <ActionButton onClick={focusResult} disabled={!results.length}>
                Done
              </ActionButton>
            </div>
          </div>
        </div>
        <section className="search-results" aria-label="Search results">
          <div className="search-hero">
            {selected ? (
              <MediaArtwork movie={selected} />
            ) : (
              <div className="empty-search-art">
                <Search size={72} strokeWidth={1} />
              </div>
            )}
          </div>
          <div className="search-results-body">
            <h2>{count}</h2>
            <div className="results-scroll">
              {results.length ? (
                results.map((movie) => (
                  <ActionButton
                    className={`search-result ${movie.id === selected?.id ? "selected" : ""}`}
                    key={movie.id}
                    aria-current={
                      movie.id === selected?.id ? "true" : undefined
                    }
                    onFocus={() => setSelectedId(movie.id)}
                    onClick={() => choose(movie.id)}
                  >
                    <MediaArtwork movie={movie} lazy />
                    <Play
                      className="result-play"
                      size={34}
                      fill="currentColor"
                      strokeWidth={0}
                    />
                    <span className="result-copy">
                      <span className="result-title">{movieTitle(movie)}</span>
                      <MediaMetadata movie={movie} compact />
                    </span>
                    <ChevronRight size={28} />
                  </ActionButton>
                ))
              ) : (
                <p className="search-empty" role="status">
                  No movies found. Try another title or folder.
                </p>
              )}
            </div>
            <footer className="search-footer">
              <span>
                <Move size={28} />
                Move
              </span>
              <span>
                <CircleDot size={27} />
                Select
              </span>
              <button
                className="focus-ring"
                onClick={() => edit("", true)}
                aria-label="Delete character"
              >
                <Trash2 size={27} />
                Delete
              </button>
              <button className="focus-ring" onClick={close}>
                <ArrowLeft size={29} />
                Back
              </button>
            </footer>
          </div>
        </section>
      </div>
    </section>
  );
}
