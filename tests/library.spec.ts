import { test, expect, type Page } from "@playwright/test";
import { groupMovies, movieGroup, runtime } from "../src/media";
import type { Catalog, Movie } from "../src/bridge";

const movie = (
  id: string,
  title: string,
  extra: Partial<Movie> = {},
): Movie => ({
  id,
  title,
  year: "2021",
  filename: `${title}.mkv`,
  edition: "Original file",
  duration: 6480,
  position: 0,
  size: 1024 ** 3,
  width: 3840,
  height: 2160,
  codec: "hevc",
  image: "",
  ...extra,
});
const afterRain = movie("after-rain", "After Rain", {
  genre: "Drama",
  sourcePath: "Movies / A / After Rain.mkv",
  synopsis:
    "A photographer returns to her hometown and discovers that the memories she avoided have been waiting for her.",
});
const movies = [
  afterRain,
  movie("quiet", "All the Quiet Places", { year: "2019", duration: 7440 }),
  movie("arrival", "Arrival Point", { year: "2024", duration: 6960 }),
  movie("before", "Before Sunrise", { year: "1995", duration: 6060 }),
  movie("blue", "Blue Hour", { year: "2023", duration: 7920 }),
  movie("bright", "Bright Water", { year: "2020", duration: 6720 }),
  movie("coast", "Coast Road"),
  ...Array.from({ length: 40 }, (_, i) => movie(`z${i}`, `Zebra ${i}`)),
  movie("number", "2001"),
  movie("symbol", "!Arrival"),
  movie("nonlatin", "東京"),
];
async function fixture(
  page: Page,
  catalog: Catalog = { movies, path: "/mnt/movies" },
) {
  await page.route("**/api/library", (route) =>
    route.fulfill({ json: catalog }),
  );
  await page.goto("/");
}
const rows = (page: Page) => page.locator(".movie-row");
const selected = (page: Page) => page.locator(".movie-row[aria-current=true]");

test("alphabetical groups are stable, duplicates retained, non A–Z last", () => {
  const input = [
    movie("b", "Blue"),
    movie("x", "9 Lives"),
    movie("a2", "after Rain", { year: "2024" }),
    movie("a1", "After Rain", { year: "2020" }),
    movie("s", "!Title"),
    movie("c", "東京"),
  ];
  const groups = groupMovies(input);
  expect(groups.map((g) => g.letter)).toEqual(["A", "B", "#"]);
  expect(groups[0].movies.map((m) => m.id)).toEqual(["a1", "a2"]);
  expect(input[0].id).toBe("b");
  expect(movieGroup(movie("blank", "", { filename: "Untitled.mkv" }))).toBe(
    "U",
  );
  expect(runtime(0)).toBe("Runtime unavailable");
  expect(runtime(6480)).toBe("1h 48m");
});

test("Home selection updates details, panes navigate and search restores focus", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await fixture(page);
  await expect(selected(page)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(selected(page)).toContainText("All the Quiet Places");
  await expect(page.locator(".selected-panel h2")).toHaveText(
    "All the Quiet Places",
  );
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("button", { name: "Play movie", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("button", { name: "Movie options", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Back", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Movie options", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(selected(page)).toBeFocused();
  await page
    .getByRole("button", { name: "Search movies", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Search movies" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(selected(page)).toBeFocused();
  await expect(selected(page)).toContainText("All the Quiet Places");
  expect(errors).toEqual([]);
});

test("alphabet rail jumps to available groups and returns to the selected row", async ({
  page,
}) => {
  await fixture(page);
  await expect(selected(page)).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("button", { name: "Browse A", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("button", { name: "Browse B", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(selected(page)).toContainText("Before Sunrise");
  await expect(selected(page)).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Browse B", exact: true }),
  ).toHaveAttribute("aria-current", "true");
  await expect(
    page.getByRole("button", { name: "Browse X", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  await expect(selected(page)).toBeFocused();
});

test("watch progress reflects the saved position", async ({ page }) => {
  await fixture(page, {
    path: "/movies",
    movies: [movie("resume", "Resume me", { duration: 7200, position: 5760 })],
  });
  await expect(
    page.getByRole("progressbar", { name: "Movie progress" }),
  ).toHaveAttribute("value", "5760");
  await expect(page.locator(".watch-progress")).toContainText(
    "24 min remaining",
  );
  await expect(
    page.getByRole("button", { name: "Play movie", exact: true }),
  ).toHaveText("Resume");
});

test("alphabet positions stay fixed and the selection circle centers on its letter", async ({
  page,
}) => {
  await fixture(page);
  const positions = () =>
    page.locator(".alphabet-letter").evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }),
    );
  const before = await positions();
  const rowHeights = await rows(page).evaluateAll((nodes) =>
    nodes.map((n) => n.getBoundingClientRect().height),
  );
  await page.getByRole("button", { name: "Browse Z", exact: true }).click();
  await expect(selected(page)).toContainText("Zebra");
  expect(await positions()).toEqual(before);
  expect(
    await rows(page).evaluateAll((nodes) =>
      nodes.map((n) => n.getBoundingClientRect().height),
    ),
  ).toEqual(rowHeights);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const marker = document
          .querySelector(".alphabet-indicator")!
          .getBoundingClientRect();
        const letter = document
          .querySelector(".alphabet-letter[aria-current=true]")!
          .getBoundingClientRect();
        return Math.abs(
          marker.y + marker.height / 2 - letter.y - letter.height / 2,
        );
      }),
    )
    .toBeLessThan(1);
  await page.getByRole("button", { name: "Browse A", exact: true }).click();
  expect(await positions()).toEqual(before);
});

test("reduced motion disables selection transitions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fixture(page);
  await expect(selected(page)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(selected(page)).toContainText("All the Quiet Places");
  expect(
    await page
      .locator(".alphabet-indicator")
      .evaluate((n) => getComputedStyle(n).transitionDuration),
  ).toBe("0s");
  expect(
    await page
      .locator(".selected-copy")
      .evaluate((n) => n.getAnimations().length),
  ).toBe(0);
});

test("held Down scrolls only the directory and keeps focus visible", async ({
  page,
}) => {
  await fixture(page);
  const before = await page.locator(".selected-panel").boundingBox();
  for (let i = 0; i < movies.length + 5; i++)
    await page.keyboard.down("ArrowDown");
  await page.keyboard.up("ArrowDown");
  await expect(rows(page).last()).toBeFocused();
  expect(await page.locator(".selected-panel").boundingBox()).toEqual(before);
  const visible = await selected(page).evaluate((node) => {
    const row = node.getBoundingClientRect(),
      pane = node.closest(".list-scroll")!.getBoundingClientRect();
    return row.top >= pane.top && row.bottom <= pane.bottom;
  });
  expect(visible).toBe(true);
  expect(
    await page.locator(".list-scroll").evaluate((node) => node.scrollTop),
  ).toBeGreaterThan(0);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await expect(rows(page).last()).toBeFocused();
});

test("remote keyboard, filtering, no results, and choosing a result", async ({
  page,
}) => {
  await fixture(page);
  await page
    .getByRole("button", { name: "Search movies", exact: true })
    .click();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".keyboard button:focus")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox")).not.toHaveValue("");
  await page.getByRole("textbox").fill("Blue Hour");
  await expect(page.locator(".search-result")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page.locator(".search-result")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(selected(page)).toContainText("Blue Hour");
  await expect(selected(page)).toBeFocused();
  await page
    .getByRole("button", { name: "Search movies", exact: true })
    .click();
  await page.getByRole("textbox").fill("No matching movie");
  await expect(page.getByRole("status")).toContainText("No movies found");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.locator(".search-result")).toHaveCount(movies.length);
});

test("search keyboard arrows follow rows and preserve the column on return", async ({
  page,
}) => {
  await fixture(page);
  await page
    .getByRole("button", { name: "Search movies", exact: true })
    .click();
  const input = page.getByRole("textbox");
  const keyboard = page.locator(".keyboard");
  const key = (name: string) =>
    keyboard.getByRole("button", { name, exact: true });
  await expect(input).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(key("Q")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(key("Q")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(input).toBeFocused();
  await page.keyboard.press("ArrowDown");
  for (const name of "WERTYUIOP") {
    await page.keyboard.press("ArrowRight");
    await expect(key(name)).toBeFocused();
  }
  for (const name of ["L", "Delete", "Done", "Done"]) {
    await page.keyboard.press("ArrowDown");
    await expect(key(name)).toBeFocused();
  }
  for (const name of ["Delete", "L", "P"]) {
    await page.keyboard.press("ArrowUp");
    await expect(key(name)).toBeFocused();
  }
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".search-result.selected")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(key("P")).toBeFocused();
  await input.fill("no matching movie");
  await key("Delete").focus();
  await page.keyboard.press("ArrowRight");
  await expect(key("Delete")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(key("Clear")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(key("Clear")).toBeFocused();
});

test("physical typing resumes search after using an on-screen key", async ({
  page,
}) => {
  await fixture(page);
  await page
    .getByRole("button", { name: "Search movies", exact: true })
    .click();
  const input = page.getByRole("textbox");
  await page
    .locator(".keyboard")
    .getByRole("button", { name: "B", exact: true })
    .click();
  await page.keyboard.type("lue Hour");
  await expect(input).toHaveValue("Blue Hour");
  await expect(input).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".search-result.selected")).toBeFocused();
});

test("remote-only search enters a title, deletes and opens the result", async ({
  page,
}) => {
  await fixture(page, { movies: [movie("top", "Top Gun")], path: "/movies" });
  await page
    .getByRole("button", { name: "Search movies", exact: true })
    .click();
  const input = page.getByRole("textbox");
  await expect(input).toBeFocused();
  await page.keyboard.press("ArrowDown");
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter"); // T
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter"); // O
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter"); // P
  await expect(input).toHaveValue("TOP");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter"); // Delete
  await expect(input).toHaveValue("TO");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter"); // P
  await expect(input).toHaveValue("TOP");
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter"); // Done
  await expect(page.locator(".search-result.selected")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(selected(page)).toContainText("Top Gun");
});

test("replacing selected text with itself still advances the search cursor", async ({
  page,
}) => {
  await fixture(page);
  await page
    .getByRole("button", { name: "Search movies", exact: true })
    .click();
  const input = page.getByRole("textbox");
  const keyboard = page.locator(".keyboard");
  await input.fill("TAP");
  await input.evaluate((node: HTMLInputElement) =>
    node.setSelectionRange(1, 2),
  );
  await keyboard.getByRole("button", { name: "A", exact: true }).click();
  await keyboard.getByRole("button", { name: "B", exact: true }).click();
  await expect(input).toHaveValue("TABP");
});

test("Enter plays via bridge and browser failure is recoverable", async ({
  page,
}) => {
  await fixture(page);
  await expect(selected(page)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText("desktop app");
  await expect(
    page.getByRole("button", { name: "Back to directory" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(selected(page)).toBeFocused();
  await expect(selected(page)).toContainText("All the Quiet Places");
});

test("QWERTY search edits at the cursor and supports numbers, Delete and Done", async ({
  page,
}) => {
  await fixture(page);
  await page
    .getByRole("button", { name: "Search movies", exact: true })
    .click();
  const input = page.getByRole("textbox", { name: "Search movies" });
  const keyboard = page.locator(".keyboard");
  await input.fill("TOP");
  await input.evaluate((node: HTMLInputElement) =>
    node.setSelectionRange(1, 2),
  );
  await keyboard.getByRole("button", { name: "A", exact: true }).click();
  await expect(input).toHaveValue("TAP");
  await keyboard.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(input).toHaveValue("TP");
  await keyboard
    .getByRole("button", { name: "Show numbers and symbols" })
    .click();
  await keyboard.getByRole("button", { name: "2", exact: true }).click();
  await expect(input).toHaveValue("T2P");
  await page.keyboard.press("Backspace");
  await expect(input).toHaveValue("TP");
  await keyboard.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(input).toHaveValue("");
  await input.fill("Blue Hour");
  await keyboard.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".search-result[aria-current=true]")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(
    keyboard.getByRole("button", { name: "Done", exact: true }),
  ).toBeFocused();
  await input.fill("no such title");
  await expect(
    keyboard.getByRole("button", { name: "Done", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("No movies found");
});

test("search result navigation updates hero artwork and keeps the keyboard query", async ({
  page,
}) => {
  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  );
  await page.route("**/search-art-*.png", (route) =>
    route.fulfill({ contentType: "image/png", body: pixel }),
  );
  await fixture(page, {
    path: "/movies",
    movies: [
      movie("one", "One", { image: "/search-art-one.png" }),
      movie("two", "Two", { image: "/search-art-two.png" }),
    ],
  });
  await page
    .getByRole("button", { name: "Search movies", exact: true })
    .click();
  await page.getByRole("textbox").fill("o");
  await page.keyboard.press("Enter");
  await expect(page.locator(".search-result.selected")).toContainText("One");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".search-result.selected")).toContainText("Two");
  await expect(page.locator(".search-hero img")).toHaveAttribute(
    "src",
    /search-art-two\.png$/,
  );
  await expect(page.getByRole("textbox")).toHaveValue("o");
  await page.keyboard.press("Enter");
  await expect(selected(page)).toContainText("Two");
});

test("loading, disconnected NAS, empty library, and retry recovery", async ({
  page,
}) => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/library", async (route) => {
    await wait;
    await route.fulfill({
      json: {
        movies: [],
        path: "/mnt/movies",
        error: "Movie folder is unavailable.",
      },
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Loading movies" }),
  ).toBeVisible();
  release();
  await expect(
    page.getByRole("heading", { name: "Library unavailable" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeFocused();
  await page.route("**/api/library", (route) =>
    route.fulfill({ json: { movies: [], path: "/mnt/movies" } }),
  );
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "No movies yet" }),
  ).toBeVisible();
  await page.route("**/api/library", (route) =>
    route.fulfill({ json: { movies, path: "/mnt/movies" } }),
  );
  await page.locator(".library-state button").click();
  await expect(selected(page)).toBeFocused();
});

test("missing metadata, long duplicate titles, and external artwork", async ({
  page,
}) => {
  const title = "A very long movie title ".repeat(15);
  const external: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith("https://external.invalid"))
      external.push(request.url());
  });
  await fixture(page, {
    path: "/mnt/movies",
    movies: [
      movie("a", title, {
        year: "",
        duration: 0,
        width: 0,
        image: "https://external.invalid/image.jpg",
      }),
      movie("b", title, { year: "2025", sourcePath: "other/duplicate.mkv" }),
    ],
  });
  await expect(rows(page)).toHaveCount(2);
  await expect(page.locator(".selected-panel")).toContainText(
    "Runtime unavailable",
  );
  await expect(page.locator(".selected-panel")).toContainText(
    "Artwork unavailable",
  );
  await expect(page.locator(".selected-panel .primary")).toBeInViewport();
  expect(
    await page
      .locator(".selected-panel")
      .evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  expect(external).toEqual([]);
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".selected-panel")).toHaveAttribute(
    "data-selected-id",
    "b",
  );
});

test("refresh retains a movie ID, updates details, and recovers from its removal", async ({
  page,
}) => {
  await fixture(page);
  await expect(selected(page)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.route("**/api/library", (route) =>
    route.fulfill({
      json: {
        movies: [
          afterRain,
          movie("quiet", "All the Quiet Places", {
            synopsis: "Updated local metadata",
          }),
        ],
        path: "/mnt/movies",
      },
    }),
  );
  await page.getByRole("button", { name: "Refresh library" }).click();
  await expect(selected(page)).toContainText("All the Quiet Places");
  await expect(page.locator(".synopsis")).toHaveText("Updated local metadata");
  await expect(selected(page)).toBeFocused();
  await page.route("**/api/library", (route) =>
    route.fulfill({ json: { movies: [afterRain], path: "/mnt/movies" } }),
  );
  await page.getByRole("button", { name: "Refresh library" }).click();
  await expect(selected(page)).toContainText("After Rain");
  await expect(selected(page)).toBeFocused();
});

test("broken local artwork falls back without interrupting navigation", async ({
  page,
}) => {
  await page.route("**/broken.jpg", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await fixture(page, {
    path: "/mnt/movies",
    movies: [{ ...afterRain, image: "/broken.jpg" }],
  });
  await expect(page.locator(".artwork-placeholder")).toBeVisible();
  await expect(selected(page)).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "Play movie" })).toBeFocused();
});

test("TMDB artwork loads by URL and a failed backdrop falls back to poster then video frame", async ({
  page,
}) => {
  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  );
  await page.route("https://image.tmdb.org/t/p/w1280/backdrop.jpg", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await page.route("https://image.tmdb.org/t/p/w500/poster.jpg", (route) =>
    route.fulfill({ contentType: "image/png", body: pixel }),
  );
  await fixture(page, {
    path: "/mnt/movies",
    movies: [
      movie("art", "Alien", {
        tmdbId: 348,
        image: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
        posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
        hasThumbnail: true,
      }),
    ],
  });
  await expect(page.locator(".media-artwork img")).toHaveAttribute(
    "src",
    "https://image.tmdb.org/t/p/w500/poster.jpg",
  );
  await expect(page.locator(".media-artwork img")).toHaveJSProperty(
    "naturalWidth",
    1,
  );
  await page.route("https://image.tmdb.org/t/p/w500/poster.jpg", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await page.route("**/artwork/art.jpg", (route) =>
    route.fulfill({ contentType: "image/png", body: pixel }),
  );
  await page.reload();
  await expect(page.locator(".media-artwork img")).toHaveAttribute(
    "src",
    /\/artwork\/art.jpg$/,
  );
  await expect(page.locator(".media-artwork img")).toHaveJSProperty(
    "naturalWidth",
    1,
  );
  await expect(selected(page)).toBeFocused();
});

test("TV dialogs scale and Tab focus stays in the application", async ({
  page,
}) => {
  for (const [width, height] of [
    [1920, 1080],
    [3840, 2160],
    [1250, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await fixture(page);
    await page.getByRole("button", { name: "Movie options" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const rect = await dialog.boundingBox();
    expect(rect!.width).toBeCloseTo(
      1000 * Math.min(width / 1920, height / 1080),
      0,
    );
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press("Tab");
      expect(
        await dialog.evaluate((node) => node.contains(document.activeElement)),
      ).toBe(true);
    }
    await page.screenshot({ path: `.local/screenshots/options-${width}.png` });
    await page.keyboard.press("Escape");
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      expect(
        await page
          .locator(".tv-stage")
          .evaluate((node) => node.contains(document.activeElement)),
      ).toBe(true);
    }
    await page.getByRole("button", { name: "Search movies" }).click();
    await page.screenshot({ path: `.local/screenshots/search-${width}.png` });
  }
});

for (const [width, height] of [
  [1920, 1080],
  [3840, 2160],
  [1440, 900],
  [768, 1024],
]) {
  test(`logical TV canvas scales at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await fixture(page);
    await expect(selected(page)).toBeFocused();
    await page.evaluate(() => document.fonts.ready);
    const stage = await page.locator(".tv-stage").boundingBox();
    const scale = Math.min(width / 1920, height / 1080);
    expect(stage!.width).toBeCloseTo(1920 * scale, 0);
    expect(stage!.height).toBeCloseTo(1080 * scale, 0);
    expect(stage!.x).toBeGreaterThanOrEqual(-1);
    expect(stage!.y).toBeGreaterThanOrEqual(-1);
    await page.screenshot({
      path: `.local/screenshots/directory-${width}.png`,
    });
  });
}

test("real local library uses the same directory and native playback boundary", async ({
  page,
}) => {
  await page.goto("/");
  const response = await page.request.get("/api/library");
  test.skip(!response.ok(), "A scanned local library is not available");
  const catalog: Catalog = await response.json();
  await expect(rows(page)).toHaveCount(catalog.movies.length);
  if (catalog.movies.length) {
    await expect(selected(page)).toBeFocused();
    await page.screenshot({ path: ".local/screenshots/directory-real.png" });
  }
});
