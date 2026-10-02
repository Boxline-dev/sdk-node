/** Readers for the API's streamed replies: NDJSON (exec, scripts) and server-sent events (event streams). */

/** Lines of a response body; leaving early (break, return) closes the connection. */
export async function* lines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let finished = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        yield line.endsWith("\r") ? line.slice(0, -1) : line;
      }
    }
    buf += decoder.decode();
    if (buf) yield buf;
    finished = true;
  } finally {
    // Leaving early closes the connection. Not awaited: a cancel can wait on other readers of the same body.
    if (!finished) void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** One JSON value per non-empty line (lines that are not JSON are skipped). */
export async function* ndjson<T = Record<string, unknown>>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  for await (const line of lines(body)) {
    const t = line.trim();
    if (!t) continue;
    try {
      yield JSON.parse(t) as T;
    } catch {
      /* not JSON */
    }
  }
}

/** The `data:` of each server-sent event, parsed as JSON (comments such as keep-alive pings are skipped). */
export async function* sse<T = Record<string, unknown>>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  let data: string[] = [];
  const flush = function* () {
    if (!data.length) return;
    const text = data.join("\n");
    data = [];
    try {
      yield JSON.parse(text) as T;
    } catch {
      /* not JSON */
    }
  };
  for await (const line of lines(body)) {
    if (line === "") yield* flush();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    // ":" comments (pings), "event:", "id:" and "retry:" lines carry nothing the API uses.
  }
  yield* flush();
}
