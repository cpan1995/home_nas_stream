const connection = document.querySelector("#connection");
const retry = document.querySelector("#retry");
const pad = document.querySelector("#trackpad");
const feedback = document.querySelector("#feedback");
const volume = document.querySelector("#volume");
const volumeValue = document.querySelector("#volume-value");
let adjustingVolume = false;
let volumeUpdated = 0;
let volumeAvailable = false;
async function readVolume() {
  if (
    !online ||
    adjustingVolume ||
    pending ||
    Date.now() - volumeUpdated < 1500
  )
    return;
  try {
    const response = await fetch("/remote/state", {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return;
    const state = await response.json();
    if (adjustingVolume || pending || Date.now() - volumeUpdated < 1500) return;
    volumeAvailable =
      Number.isInteger(state.volume) &&
      state.volume >= 0 &&
      state.volume <= 100;
    volume.disabled = !online || !volumeAvailable;
    if (volumeAvailable) {
      volume.value = String(state.volume);
      volumeValue.textContent = `${state.volume}%`;
    } else volumeValue.textContent = "Start playback";
  } catch {
    /* The connection check handles receiver availability. */
  }
}
volume.addEventListener("pointerdown", () => {
  adjustingVolume = true;
});
volume.addEventListener("input", () => {
  volumeValue.textContent = `${volume.value}%`;
});
volume.addEventListener("change", () => {
  volumeUpdated = Date.now();
  adjustingVolume = false;
  send(`Volume_${volume.value}`);
});
window.addEventListener("pointerup", () => {
  adjustingVolume = false;
});
volume.addEventListener("pointercancel", () => {
  adjustingVolume = false;
});
volume.addEventListener("blur", () => {
  adjustingVolume = false;
});
const controls = [
  ...document.querySelectorAll(
    "[data-command], #trackpad, #keyboard-toggle, #remote-text, #send-text",
  ),
];
let online = false;
let queue = Promise.resolve();
let pending = 0;
let generation = 0;
let checking = false;
let feedbackTimer;
function setOnline(value) {
  online = value;
  controls.forEach((control) => {
    control.disabled = !value;
  });
  connection.dataset.state = value ? "online" : "offline";
  connection.textContent = value
    ? "Connected to your player"
    : "Player unavailable. Check that it is on and on the same Wi-Fi.";
  retry.hidden = value;
  volume.disabled = !value || !volumeAvailable;
}
async function check() {
  if (checking || pending) return;
  checking = true;
  try {
    const response = await fetch("/query/device-info", {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    setOnline(response.ok && (await response.text()).includes("<device-info>"));
    await readVolume();
  } catch {
    setOnline(false);
  } finally {
    checking = false;
  }
}
function send(key) {
  if (!online || pending >= 8) return Promise.resolve(false);
  const batch = generation;
  pending++;
  // Preserve gesture order; never replay commands after a failed connection.
  queue = queue
    .then(async () => {
      if (!online || batch !== generation) return false;
      try {
        const response = await fetch(
          `/remote/command/${encodeURIComponent(key)}`,
          {
            method: "POST",
            signal: AbortSignal.timeout(2000),
          },
        );
        if (!response.ok) throw Error("Command rejected");
        feedback.textContent =
          { Up: "↑", Down: "↓", Left: "←", Right: "→", Select: "✓" }[key] ||
          "OK";
        clearTimeout(feedbackTimer);
        feedbackTimer = setTimeout(() => {
          feedback.textContent = "OK";
        }, 350);
        return true;
      } catch {
        generation++;
        setOnline(false);
        return false;
      }
    })
    .finally(() => {
      pending--;
    });
  return queue;
}
document
  .querySelectorAll("[data-command]")
  .forEach((button) =>
    button.addEventListener("click", () => send(button.dataset.command)),
  );
let gesture;
pad.addEventListener("pointerdown", (event) => {
  if (!online || !event.isPrimary || event.button !== 0 || gesture) return;
  pad.setPointerCapture(event.pointerId);
  gesture = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    moved: false,
    start: performance.now(),
  };
  pad.classList.add("pressed");
});
function move(event) {
  if (!gesture || gesture.id !== event.pointerId) return;
  const dx = event.clientX - gesture.x,
    dy = event.clientY - gesture.y;
  const distance = Math.max(Math.abs(dx), Math.abs(dy));
  if (distance > 10) gesture.moved = true;
  if (distance < 36) return;
  send(
    Math.abs(dx) > Math.abs(dy)
      ? dx > 0
        ? "Right"
        : "Left"
      : dy > 0
        ? "Down"
        : "Up",
  );
  gesture.x = event.clientX;
  gesture.y = event.clientY;
}
pad.addEventListener("pointermove", move);
pad.addEventListener("pointerup", (event) => {
  if (!gesture || gesture.id !== event.pointerId) return;
  move(event);
  if (!gesture.moved && performance.now() - gesture.start < 700) send("Select");
  cancel();
});
function cancel() {
  gesture = undefined;
  pad.classList.remove("pressed");
}
pad.addEventListener("pointercancel", cancel);
pad.addEventListener("lostpointercapture", cancel);
pad.addEventListener("contextmenu", (event) => event.preventDefault());
// Keyboard and assistive-technology activation have no pointer gesture.
pad.addEventListener("click", (event) => {
  if (event.detail === 0) send("Select");
});
pad.addEventListener("keydown", (event) => {
  const key = {
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
  }[event.key];
  if (key) {
    event.preventDefault();
    send(key);
  }
});
retry.addEventListener("click", check);
document.addEventListener("visibilitychange", () => {
  cancel();
  generation++;
  if (!document.hidden) check();
});
window.addEventListener("online", check);
window.addEventListener("offline", () => {
  generation++;
  cancel();
  setOnline(false);
});
controls.forEach((control) => {
  control.disabled = true;
});
check();
setInterval(() => {
  if (!document.hidden) check();
}, 5000);

setInterval(() => {
  if (!document.hidden) readVolume();
}, 2000);

const keyboardToggle = document.querySelector("#keyboard-toggle");
const keyboardPanel = document.querySelector("#keyboard-panel");
const remoteText = document.querySelector("#remote-text");
const keyboardStatus = document.querySelector("#keyboard-status");
let composing = false;
let sendingText = false;
keyboardToggle.addEventListener("click", () => {
  const open = keyboardPanel.hidden;
  keyboardPanel.hidden = !open;
  keyboardToggle.setAttribute("aria-expanded", String(open));
  keyboardToggle.textContent = open ? "Done typing" : "Keyboard";
  document.querySelector(".navigation").hidden = open;
  document.querySelector(".volume-control").hidden = open;
  if (open) {
    // Focus synchronously within the tap so iOS opens its native keyboard.
    remoteText.focus();
    send("Search");
  } else {
    remoteText.blur();
    keyboardToggle.focus();
  }
});
remoteText.addEventListener("compositionstart", () => {
  composing = true;
});
remoteText.addEventListener("compositionend", () => {
  composing = false;
});
keyboardPanel.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (composing || sendingText || !remoteText.value || !online) return;
  const text = remoteText.value;
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(text)) {
    keyboardStatus.textContent = "Please enter a single line of text.";
    return;
  }
  sendingText = true;
  remoteText.readOnly = true;
  keyboardStatus.textContent = "Sending…";
  const sent = await send("Lit_" + text);
  if (sent) remoteText.value = "";
  keyboardStatus.textContent = sent
    ? "Text sent to TV."
    : "Text not sent. Reconnect and try again.";
  remoteText.readOnly = false;
  sendingText = false;
});
