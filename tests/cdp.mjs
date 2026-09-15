// Qt implements page-level CDP but not Playwright's browser-context management.
export async function connectDesktop(port = 9223, urlPart = "/ui/index.html") {
  const pages = await (
    await fetch(`http://127.0.0.1:${port}/json/list`)
  ).json();
  const page = pages.find((p) => p.url.includes(urlPart));
  if (!page) throw Error("Desktop application page is unavailable");
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let sequence = 0;
  const requests = new Map();
  socket.onmessage = (event) => {
    const reply = JSON.parse(event.data);
    const request = requests.get(reply.id);
    if (!request) return;
    requests.delete(reply.id);
    clearTimeout(request.timeout);
    if (reply.error) request.reject(Error(JSON.stringify(reply.error)));
    else request.resolve(reply.result);
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timeout = setTimeout(() => {
        requests.delete(id);
        reject(Error(`CDP timed out: ${method}`));
      }, 15000);
      requests.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const call = (method, ...args) =>
    evaluate(
      `new Promise(resolve => window.__screeningPlayer[${JSON.stringify(method)}](...${JSON.stringify(args)}, resolve))`,
    );
  const click = (selector) =>
    evaluate(
      `(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) throw Error('Missing button'); node.click(); })()`,
    );
  return { send, evaluate, call, click, close: () => socket.close() };
}
