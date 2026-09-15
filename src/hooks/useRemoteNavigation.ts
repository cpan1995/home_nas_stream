import { useEffect, type RefObject } from "react";

export function focusControl(node: HTMLElement | null | undefined) {
  if (!node) return;
  node.focus({ preventScroll: true });
  node.scrollIntoView({
    block: "nearest",
    inline: "nearest",
    behavior: "instant",
  });
}

export function moveSpatially(
  root: HTMLElement,
  target: HTMLElement,
  key: string,
) {
  const horizontal = key === "ArrowLeft" || key === "ArrowRight";
  const sign = key === "ArrowRight" || key === "ArrowDown" ? 1 : -1;
  const origin = target.getBoundingClientRect();
  const controls = [
    ...root.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled)",
    ),
  ].filter(
    (node) =>
      node !== target &&
      node.getClientRects().length &&
      !node.closest("[inert], [hidden]"),
  );
  const candidates = controls
    .map((node) => {
      const rect = node.getBoundingClientRect();
      const dx = rect.x + rect.width / 2 - origin.x - origin.width / 2;
      const dy = rect.y + rect.height / 2 - origin.y - origin.height / 2;
      const forward = (horizontal ? dx : dy) * sign;
      return {
        node,
        forward,
        score: forward + Math.abs(horizontal ? dy : dx) * 4,
      };
    })
    .filter((item) => item.forward > 2)
    .sort((a, b) => a.score - b.score);
  focusControl(candidates[0]?.node);
}

export function useRemoteNavigation({
  root,
  selectedId,
  blocked,
  onBack,
}: {
  root: RefObject<HTMLElement | null>;
  selectedId?: string;
  blocked: boolean;
  onBack: () => void;
}) {
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (blocked || event.defaultPrevented || !root.current) return;
      const target = event.target as HTMLElement;
      const dialog = root.current.querySelector<HTMLElement>("dialog[open]");
      const scope =
        dialog ||
        root.current.querySelector<HTMLElement>(".search-screen") ||
        root.current;
      if (event.key === "Enter" && event.repeat) {
        event.preventDefault();
        return;
      }
      if (event.key === "Tab") {
        const controls = [
          ...scope.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled)",
          ),
        ].filter(
          (node) =>
            node.tabIndex >= 0 &&
            node.getClientRects().length &&
            !node.closest("[hidden], [inert]"),
        );
        if (controls.length) {
          event.preventDefault();
          const index = controls.indexOf(target);
          focusControl(
            controls[
              (index + (event.shiftKey ? -1 : 1) + controls.length) %
                controls.length
            ],
          );
        }
        return;
      }
      if (
        event.key === "Escape" ||
        event.key === "BrowserBack" ||
        (event.key === "Backspace" && target.tagName !== "INPUT")
      ) {
        event.preventDefault();
        onBack();
        return;
      }
      if (
        !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
      )
        return;
      if (
        target.tagName === "INPUT" &&
        ["ArrowLeft", "ArrowRight"].includes(event.key)
      )
        return;
      event.preventDefault();
      if (!dialog && !scope.classList.contains("search-screen")) {
        const rows = [
          ...root.current.querySelectorAll<HTMLElement>(".movie-row"),
        ];
        const index = rows.indexOf(target);
        const selectedRow =
          rows.find((row) => row.dataset.movieId === selectedId) || rows[0];
        if (index >= 0) {
          if (event.key === "ArrowLeft")
            focusControl(
              root.current.querySelector<HTMLElement>(
                ".alphabet-letter[aria-current=true]",
              ),
            );
          if (event.key === "ArrowUp")
            focusControl(
              index
                ? rows[index - 1]
                : root.current.querySelector<HTMLElement>(".search-control"),
            );
          if (event.key === "ArrowDown")
            focusControl(rows[Math.min(rows.length - 1, index + 1)]);
          if (event.key === "ArrowRight")
            focusControl(
              root.current.querySelector<HTMLElement>(
                ".selected-panel .primary",
              ),
            );
          return;
        }
        if (target.closest(".alphabet-rail")) {
          if (event.key === "ArrowRight") focusControl(selectedRow);
          else {
            const letters = [
              ...root.current.querySelectorAll<HTMLElement>(
                ".alphabet-rail button:not(:disabled)",
              ),
            ];
            const current = letters.indexOf(target);
            const next =
              current +
              (event.key === "ArrowDown"
                ? 1
                : event.key === "ArrowUp"
                  ? -1
                  : 0);
            focusControl(
              letters[Math.max(0, Math.min(letters.length - 1, next))],
            );
          }
          return;
        }
        if (target.closest(".panel-actions") && event.key === "ArrowLeft") {
          focusControl(selectedRow);
          return;
        }
        if (
          (target.closest(".directory-header") ||
            target.closest(".search-control")) &&
          event.key === "ArrowDown" &&
          selectedRow
        ) {
          focusControl(selectedRow);
          return;
        }
      }
      moveSpatially(scope, target, event.key);
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [root, selectedId, blocked, onBack]);
}
