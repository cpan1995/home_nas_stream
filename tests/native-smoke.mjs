import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { connectDesktop } from "./cdp.mjs";

export async function checkPlayback(port = 9223, resumePosition) {
  const desktop = await connectDesktop(port);
  const callNative = desktop.call;
  desktop.call = async (method, ...args) => {
    try {
      return await callNative(method, ...args);
    } catch (error) {
      throw new Error(`${method}: ${error.message}`, { cause: error });
    }
  };
  const state = async () => JSON.parse(await desktop.call("playbackState"));
  const ui = async () => JSON.parse(await desktop.call("testState"));
  const click = async (name) => {
    // Allow Qt to finish layout after a popup or track model changes.
    await delay(300);
    assert(
      await desktop.call("testClick", name),
      `Native control must be visible: ${name}`,
    );
  };
  const until = async (read, predicate, message) => {
    let value;
    for (let attempt = 0; attempt < 80; attempt++) {
      value = await read();
      if (predicate(value)) return value;
      await delay(250);
    }
    assert.fail(`${message}: ${JSON.stringify(value)}`);
  };
  try {
    await until(
      () => desktop.evaluate("!!window.__screeningPlayer"),
      Boolean,
      "The native bridge must connect",
    );
    assert.equal(
      (await ui()).collectionVisible,
      true,
      "Native test hooks must be enabled",
    );
    const library = JSON.parse(await desktop.call("library"));
    assert(library.movies.length > 0, "The fixture library must have a movie");
    await desktop.evaluate(
      "document.querySelector('.selected-panel .primary').focus()",
    );
    await desktop.click(".selected-panel .primary");
    await until(
      state,
      (s) => s.duration > 100 && s.position > 0 && !s.loading,
      "Playback must advance",
    );
    assert.equal(
      (await ui()).collectionVisible,
      false,
      "Qt controls must replace the collection during playback",
    );
    await delay(750); // Let Qt lay out controls after replacing the WebEngine view.
    await until(
      ui,
      (s) => s.renderedFrames > 5,
      "Video frames must actually be rendered",
    );
    assert.equal((await ui()).renderer, "software");
    await desktop.call("capture", "native-before-pause.png");
    await click("pause-button");
    await until(state, (s) => s.paused, "Qt Pause must pause mpv");
    assert(
      (await ui()).audioChannels > 0,
      "mpv must configure an audio stream",
    );
    const expectedAudio =
      process.env.SCREENING_ROOM_AO ||
      (["unix:/mnt/wslg/PulseServer", "/mnt/wslg/PulseServer"].includes(
        process.env.PULSE_SERVER,
      )
        ? "pulse"
        : undefined);
    if (expectedAudio && !expectedAudio.includes(",")) {
      assert.equal(
        (await ui()).audioOutput,
        expectedAudio,
        "Playback must use the requested audio output, including WSLg's PulseAudio default",
      );
    }
    if (resumePosition !== undefined) {
      const resumed = await state();
      assert(
        Math.abs(resumed.position - resumePosition) < 5,
        `Restart must resume near ${resumePosition}, got ${resumed.position}`,
      );
      await desktop.call("testKey", "Escape");
      await until(state, (s) => !s.id, "Escape must return to collection");
      console.log("PASS: saved progress survives application restart.");
      return;
    }
    const seeksBeforeClick = (await ui()).seekCommands;
    await click("timeline");
    await until(
      state,
      (s) => Math.abs(s.position - s.duration / 2) < 3,
      "Qt timeline click must seek to its midpoint",
    );
    await delay(250);
    assert.equal(
      (await ui()).seekCommands,
      seeksBeforeClick + 1,
      "One timeline release must submit exactly one seek",
    );
    const seeksBeforeBurst = (await ui()).seekCommands;
    await desktop.evaluate(
      "[25, 45, 70].forEach(position => window.__screeningPlayer.seek(position))",
    );
    await until(
      state,
      (s) => Math.abs(s.position - 70) < 1,
      "A seek burst must land on the latest requested position",
    );
    assert.equal(
      (await ui()).seekCommands,
      seeksBeforeBurst + 1,
      "Rapid seeks must be coalesced",
    );
    assert.equal(
      (await state()).paused,
      true,
      "Seeking must preserve pause state",
    );
    await desktop.call("testFocus", "timeline");
    await desktop.call("testKey", "Home");
    await until(
      state,
      (s) => s.position < 3,
      "Qt timeline Home key must seek to the beginning",
    );
    await click("forward-button");
    await until(
      state,
      (s) => Math.abs(s.position - 10) < 3,
      "Forward must seek ten seconds",
    );
    await click("rewind-button");
    await until(
      state,
      (s) => s.position < 3,
      "Rewind must seek ten seconds back",
    );
    await click("mute-button");
    await until(state, (s) => s.volume === 0, "Mute must silence the player");
    await click("mute-button");
    await until(state, (s) => s.volume > 0, "Unmute must restore volume");
    await click("volume-slider");
    await until(
      state,
      (s) => Math.abs(s.volume - 50) < 5,
      "Volume slider must update mpv",
    );
    await click("mute-button");
    await until(state, (s) => s.volume === 0, "Mute at reduced volume");
    await click("mute-button");
    await until(
      state,
      (s) => Math.abs(s.volume - 50) < 5,
      "Unmute must restore the previous volume",
    );
    await desktop.call("testFocus", "pause-button");
    const beforeRemote = (await state()).position;
    await desktop.call("testKey", "Right");
    await until(
      ui,
      (s) => s.focusedControl === "rewind-button",
      "Right must move toolbar focus",
    );
    assert(
      Math.abs((await state()).position - beforeRemote) < 1,
      "Toolbar navigation must not seek",
    );
    await desktop.call("testKey", "Right");
    await until(
      ui,
      (s) => s.focusedControl === "forward-button",
      "D-pad must reach Forward",
    );
    await desktop.call("testKey", "Return");
    await until(
      state,
      (s) => Math.abs(s.position - beforeRemote - 10) < 3,
      "OK must activate the focused skip button",
    );
    await desktop.call("testKey", "Up");
    await until(
      ui,
      (s) => s.focusedControl === "timeline",
      "Up must reach the timeline",
    );
    await desktop.call("testKey", "Right");
    await until(
      state,
      (s) => Math.abs(s.position - beforeRemote - 20) < 3,
      "Timeline D-pad must seek ten seconds",
    );
    await desktop.call("testKey", "Down");
    await until(
      ui,
      (s) => s.focusedControl === "pause-button",
      "Down must return to transport controls",
    );
    await desktop.call("capture", "native-remote-focus.png");
    await click("tracks-button");
    await until(ui, (s) => s.tracksOpen, "Qt audio/subtitle popup must open");
    await until(
      ui,
      (s) => s.focusedControl === "close-tracks",
      "Dialog must receive remote focus",
    );
    const tracks = (await state()).tracks;
    assert(
      tracks.filter((t) => t.type === "audio").length >= 2,
      "Fixture must have two audio tracks",
    );
    const alternateAudio = tracks.find(
      (t) => t.type === "audio" && !t.selected,
    );
    const subtitle = tracks.find((t) => t.type === "sub");
    assert(subtitle, "Fixture must have a selectable subtitle");
    await desktop.call("testKey", "Down");
    await desktop.call("testKey", "Down");
    await until(
      ui,
      (s) => s.focusedControl === `audio-track-${alternateAudio.id}`,
      "D-pad must navigate to alternate audio",
    );
    await desktop.call("testKey", "Return");
    await until(
      state,
      (s) =>
        s.tracks.some(
          (t) => t.type === "audio" && t.id === alternateAudio.id && t.selected,
        ),
      "OK must select alternate audio",
    );
    await delay(400);
    assert.equal(
      (await ui()).focusedControl,
      `audio-track-${alternateAudio.id}`,
      "Track selection must preserve remote focus",
    );
    await desktop.call("capture", "native-tracks.png");
    await click(`audio-track-${alternateAudio.id}`);
    await until(
      state,
      (s) =>
        s.tracks.some(
          (t) => t.type === "audio" && t.id === alternateAudio.id && t.selected,
        ),
      "Qt audio selection must switch tracks",
    );
    await click(`sub-track-${subtitle.id}`);
    await until(
      state,
      (s) =>
        s.tracks.some(
          (t) => t.type === "sub" && t.id === subtitle.id && t.selected,
        ),
      "Qt subtitle selection must enable subtitles",
    );
    await click("sub-off");
    await until(
      state,
      (s) => !s.tracks.some((t) => t.type === "sub" && t.selected),
      "Subtitles Off must deselect subtitle tracks",
    );
    await click("close-tracks");
    await until(ui, (s) => !s.tracksOpen, "Close must dismiss the Qt popup");
    assert.equal(
      (await ui()).focusedControl,
      "tracks-button",
      "Closing the menu must restore its button focus",
    );
    await desktop.call("testKey", "F");
    await until(ui, (s) => s.fullscreen, "F must enter fullscreen");
    await desktop.call("testKey", "F");
    await until(ui, (s) => !s.fullscreen, "F must leave fullscreen");
    await delay(350); // Allow the window system to restore shortcut focus.
    await desktop.call("testKey", "Space");
    await until(state, (s) => !s.paused, "Space must resume playback");
    await until(
      ui,
      (s) => s.audioChannels > 0,
      "Selected audio must be configured after resuming",
    );
    const beforePlayingSeek = (await ui()).seekCommands;
    await desktop.evaluate(
      "[30, 50, 80].forEach(position => window.__screeningPlayer.seek(position))",
    );
    await until(
      state,
      (s) => s.position >= 80 && s.position < 84 && !s.paused,
      "Seeking while playing must resume at the requested position",
    );
    assert.equal((await ui()).seekCommands, beforePlayingSeek + 1);
    const playingStart = (await state()).position;
    await until(
      state,
      (s) => s.position > playingStart + 2 && !s.paused,
      "Playback must continue advancing after seeking",
    );
    await until(
      ui,
      (s) => !s.controlsVisible,
      "Controls must auto-hide during playback",
    );
    console.log("Playback diagnostics:", JSON.stringify(await ui()));
    await desktop.call("testKey", "Down");
    await until(
      ui,
      (s) => s.controlsVisible && s.focusedControl === "pause-button",
      "Remote must wake controls and restore focus",
    );
    await desktop.call("testKey", "Space");
    await until(state, (s) => s.paused, "Space must pause playback");
    await click("timeline");
    const saved = await until(
      state,
      (s) => Math.abs(s.position - s.duration / 2) < 3,
      "Seek before saving progress",
    );
    await desktop.call("capture", "native-player.png");
    await click("back-button");
    await until(
      ui,
      (s) => s.collectionVisible,
      "Back must restore the collection",
    );
    assert.equal((await state()).id, "");
    await until(
      () =>
        desktop.evaluate(
          "document.activeElement?.matches('.selected-panel .primary')",
        ),
      Boolean,
      "Returning from playback must restore Play focus",
    );
    const updated = JSON.parse(await desktop.call("library"));
    assert(
      updated.movies.some((m) => Math.abs(m.position - saved.position) < 2),
      "Watch progress must be saved",
    );
    await desktop.call("capture", "native-library.png");
    await desktop.call("play", "missing-test-movie", false);
    await until(
      () =>
        desktop.evaluate(
          "document.querySelector('[role=alert]')?.textContent || ''",
        ),
      (text) => text.includes("no longer available"),
      "Missing native media must display a recoverable playback error",
    );
    await desktop.click(".modal-actions .primary");
    await until(
      () =>
        desktop.evaluate(
          "!document.querySelector('dialog[open]') && document.activeElement?.matches('.selected-panel .primary')",
        ),
      Boolean,
      "Dismissing playback failure must restore focus",
    );
    console.log(
      "PASS: native pause, timeline mouse/keyboard seeking, skip, volume, track selection, fullscreen, return, and saved progress.",
    );
    return saved.position;
  } catch (error) {
    console.error("Native failure state:", await ui().catch(() => ({})));
    await desktop.call("capture", "native-failure.png").catch(() => {});
    throw error;
  } finally {
    desktop.close();
  }
}
