import { test, expect } from "@playwright/test";

test("phone trackpad sends ordered gestures, taps, shortcuts, and recovers from disconnect", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const commands: string[] = [];
  let available = true;
  await page.route("**/query/device-info", (route) =>
    route.fulfill({
      status: available ? 200 : 503,
      body: "<device-info></device-info>",
    }),
  );
  await page.route("**/remote/command/*", (route) => {
    commands.push(route.request().url().split("/").at(-1)!);
    return route.fulfill({ status: available ? 200 : 503, json: {} });
  });
  await page.route("**/remote/state", (route) =>
    route.fulfill({ json: { volume: 75 } }),
  );
  await page.goto("/remote/");
  await expect(page.locator("#connection")).toContainText("Connected");
  const pad = page.locator("#trackpad");
  await pad.click();
  await expect.poll(() => commands).toEqual(["Select"]);
  const box = (await pad.boundingBox())!;
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  for (const [dx, dy] of [
    [50, 0],
    [-50, 0],
    [0, -50],
    [0, 50],
  ]) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy);
    await page.mouse.up();
  }
  await expect
    .poll(() => commands)
    .toEqual(["Select", "Right", "Left", "Up", "Down"]);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await pad.dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  await page.getByRole("button", { name: "CinePro home" }).click();
  await page.getByRole("button", { name: "NAS home" }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect
    .poll(() => commands.slice(5))
    .toEqual(["CineProHome", "Home", "Back"]);
  await pad.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => commands.length).toBe(9);
  available = false;
  await pad.click();
  await expect(page.locator("#connection")).toContainText("Player unavailable");
  await expect(pad).toBeDisabled();
  available = true;
  await page.getByRole("button", { name: "Reconnect" }).click();
  await expect(pad).toBeEnabled();
  expect(commands.length).toBe(10);
  const volume = page.getByRole("slider", { name: "Volume", exact: true });
  await expect(volume).toBeEnabled();
  await volume.fill("35");
  await volume.dispatchEvent("change");
  await expect.poll(() => commands.at(-1)).toBe("Volume_35");
  await expect(page.locator("#volume-value")).toHaveText("35%");
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/screenshots/remote-${width}.png`,
      fullPage: true,
    });
  }
});

test("NAS phone remote is reachable by keyboard and closes with Back", async ({
  page,
}) => {
  await page.route("**/api/library", (route) =>
    route.fulfill({ json: { movies: [], path: "/movies" } }),
  );
  await page.goto("/");
  const button = page.getByRole("button", {
    name: "Phone remote",
    exact: true,
  });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText(
    "The phone remote is unavailable",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(button).toBeFocused();
});

test("phone keyboard opens search, sends Unicode literally, and preserves failed text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const commands: string[] = [];
  let available = true;
  await page.route("**/query/device-info", (route) =>
    route.fulfill({ body: "<device-info></device-info>" }),
  );
  await page.route("**/remote/state", (route) =>
    route.fulfill({ json: { volume: 75 } }),
  );
  await page.route("**/remote/command/*", (route) => {
    commands.push(decodeURIComponent(route.request().url().split("/").at(-1)!));
    return route.fulfill({ status: available ? 200 : 503, json: {} });
  });
  await page.goto("/remote/");
  await page.getByRole("button", { name: "Keyboard", exact: true }).click();
  const text = page.getByRole("textbox", { name: "Type with your phone" });
  await expect(text).toBeFocused();
  await expect.poll(() => commands).toEqual(["Search"]);
  await text.fill("Movie /电影? #50% 😀");
  await text.press("Enter");
  await expect.poll(() => commands.at(-1)).toBe("Lit_Movie /电影? #50% 😀");
  await expect(text).toHaveValue("");
  await page.getByRole("button", { name: "Backspace on TV" }).click();
  await expect.poll(() => commands.at(-1)).toBe("Backspace");
  await page.getByRole("button", { name: "Enter", exact: true }).click();
  await expect.poll(() => commands.at(-1)).toBe("Enter");
  await page.screenshot({
    path: ".local/screenshots/remote-keyboard.png",
    fullPage: true,
  });
  available = false;
  await text.fill("Keep this draft");
  await page.getByRole("button", { name: "Send text" }).click();
  await expect(page.locator("#keyboard-status")).toContainText("Text not sent");
  await expect(text).toHaveValue("Keep this draft");
});
