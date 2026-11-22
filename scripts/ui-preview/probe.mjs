// Edge probe for the browser-only UI preview (`npm run preview:ui`, synthetic data only).
// It never connects to the real app or its database: it launches a local Edge with a fresh
// temporary profile, drives it over the DevTools protocol on 127.0.0.1 only, and on exit closes
// that Edge and deletes the temporary profile. Page URLs must be localhost or file: URLs; use
// http://localhost:<port> for the preview (Vite listens on ::1, so 127.0.0.1 is refused).
// Node 24, no dependencies (global fetch and WebSocket).
//
//   node scripts/ui-preview/probe.mjs shot   --url <u> --size 1440x900 [--time 22:01] [--scale 1.25]
//        [--media forced-colors=active] [--media prefers-reduced-transparency=reduce] [--eval "<js>"] --out <png>
//   node scripts/ui-preview/probe.mjs layout --url <u> --size 1180x760 [--time 22:01] [--eval "<js>"] --out <json>
//   node scripts/ui-preview/probe.mjs frames --url <u> --size 1440x900 --scroll <selector> [--seconds 5] [--cpu 4]
//        [--headed] [--trace <json>] [--out <json>]
//
// Viewport       Headless: the page is emulated at WxH (device scale --scale, default 1), with real scrollbars.
//                --headed: the window is resized so its content area is WxH at the system display scale; the
//                viewport is only emulated when --scale is given.
// --time HH:MM   Replaces Date before the page loads: `new Date()` / `Date.now()` start at today HH:MM:00 and
//                then advance in real time; `new Date(...)` with arguments is unchanged.
// --eval <js>    Runs after the page is ready via Runtime.evaluate({ awaitPromise: true, returnByValue: true }).
//                The expression may return a Promise (e.g. `new Promise(r => setTimeout(r, 6000))`, or click
//                and then wait a frame); the probe waits for it before capturing. A throw or rejection
//                counts as a console error. The whole run is limited to 120s (frames: --seconds + 120s), so an
//                expression that never settles ends the run with exit code 1.
// Ready wait     After document.fonts.ready, waits until `.nav-key[aria-current="page"]`, `.page-header h2`
//                and the page's own <main> show the page named by `?page=` (default 概览) and the <main> no
//                longer says 正在读取, then waits for fonts again and 600ms more. file: URLs (mockups) skip
//                this check. A --media feature that matchMedia does not report fails.
// Errors         Exceptions, console.error and browser log errors (failed resource loads, CSP and other
//                security errors; not the browser's own /favicon.ico request) are collected and printed to
//                stderr at the end; any of them means exit 2.
// Frames         Scrolls the element by 8px per frame (back and forth). The first 500ms are warm-up (first
//                scroll and tile raster) and are not measured; then it records rAF intervals for --seconds and
//                long animation frames over 50ms. With --trace it also records a DevTools trace of the same
//                run (load it in the Performance panel); the compositor frames counted from it (DrawFrame, or
//                presented PipelineReporter frames) win when they disagree with rAF. A trace with fewer than
//                two frames is reported as `trace: null` with a warning.
// Output         stdout: one line per written file (`shot:`, `layout:`, `trace:`) and `eval:`; for frames the
//                JSON result comes last. stderr: errors and warnings only.
//
// Exit codes: 0 ok, 1 usage or probe failure (incl. timeout or lost DevTools connection), 2 console errors or
// exceptions, 3 page not ready in 10s, 130 interrupted.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const PAGE_LABELS = {
  overview: "概览",
  software: "软件",
  background: "后台",
  statistics: "统计",
  achievements: "成就",
  settings: "设置",
};
const LAYOUT_SELECTORS = [
  ".sidebar", ".page-header", ".nav-key", ".panel", ".readout", ".software-panel", ".lcd", ".lcd-value b",
  ".lcd-ghost b", ".lcd-ghost small", ".lcd-dial", ".paper", ".ach-plate", ".toggle", ".segmented-option",
];
const VALUE_OPTIONS = new Set(["url", "size", "time", "scale", "media", "eval", "out", "scroll", "seconds", "cpu", "trace"]);
const TRACE_CATEGORIES = "devtools.timeline,disabled-by-default-devtools.timeline.frame";
const WARM_UP_MS = 500;

class ProbeExit extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { media: [] };
  const flags = new Set(["headed"]);
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg.startsWith("--")) throw new ProbeExit(1, `unexpected argument: ${arg}`);
    const name = arg.slice(2);
    if (!flags.has(name) && !VALUE_OPTIONS.has(name)) throw new ProbeExit(1, `unknown option: ${arg}`);
    if (flags.has(name)) {
      options[name] = true;
      continue;
    }
    const value = rest[i + 1];
    if (value === undefined) throw new ProbeExit(1, `missing value for --${name}`);
    i += 1;
    if (name === "media") options.media.push(value);
    else options[name] = value;
  }
  if (!["shot", "layout", "frames"].includes(command)) {
    throw new ProbeExit(1, "usage: probe.mjs shot|layout|frames --url <u> --size WxH ... (see the header comment)");
  }
  if (!options.url) throw new ProbeExit(1, "--url is required");
  const url = new URL(options.url);
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (url.protocol !== "file:" && !localHosts.has(url.hostname)) {
    throw new ProbeExit(1, `only local preview URLs are allowed, got ${url.host}`);
  }
  if (url.protocol !== "file:") {
    options.pageId = url.searchParams.get("page") ?? "overview";
    options.pageLabel = PAGE_LABELS[options.pageId];
    if (!options.pageLabel) throw new ProbeExit(1, `unknown ?page=${options.pageId}`);
  }
  const size = /^(\d+)x(\d+)$/.exec(options.size ?? "");
  if (!size) throw new ProbeExit(1, "--size WxH is required, e.g. 1440x900");
  options.width = Number(size[1]);
  options.height = Number(size[2]);
  options.emulateViewport = !options.headed || options.scale !== undefined;
  options.scale = options.scale === undefined ? 1 : Number(options.scale);
  if (!(options.scale > 0)) throw new ProbeExit(1, "--scale must be a positive number");
  if (options.time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(options.time)) {
    throw new ProbeExit(1, "--time must be HH:MM");
  }
  options.mediaFeatures = options.media.map((item) => {
    const [name, value] = item.split("=");
    if (!name || !value) throw new ProbeExit(1, `--media must be name=value, got ${item}`);
    return { name, value };
  });
  if ((command === "shot" || command === "layout") && !options.out) throw new ProbeExit(1, "--out is required");
  if (command === "frames") {
    if (!options.scroll) throw new ProbeExit(1, "--scroll <selector> is required");
    options.seconds = options.seconds === undefined ? 5 : Number(options.seconds);
    if (options.cpu !== undefined) options.cpu = Number(options.cpu);
    if (!(options.seconds > 0) || (options.cpu !== undefined && !(options.cpu >= 1))) {
      throw new ProbeExit(1, "--seconds must be > 0 and --cpu >= 1");
    }
  }
  options.command = command;
  return options;
}

function edgePath() {
  const candidates = [process.env["ProgramFiles(x86)"], process.env.ProgramFiles]
    .filter(Boolean)
    .map((root) => join(root, "Microsoft", "Edge", "Application", "msedge.exe"));
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new ProbeExit(1, "msedge.exe not found under Program Files");
  return found;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
// A timeout that loses a Promise.race must not keep the process alive.
const deadline = (ms) => new Promise((done) => setTimeout(done, ms).unref());

// The Edge this run started, so the interrupt handler can clean it up at any point after its profile exists.
let currentEdge = null;

async function launchEdge(options) {
  const executable = edgePath();
  const profile = mkdtempSync(join(tmpdir(), "gst-probe-"));
  const edge = { child: null, profile, port: null, browserPid: null, closing: null };
  currentEdge = edge;
  const args = [
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    `--window-size=${options.width},${options.height}`,
    "--window-position=0,0",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-sync",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    ...(options.headed ? [] : ["--headless=new"]),
    "about:blank",
  ];
  try {
    // msedge.exe may hand off to a relaunched browser process and exit, so the spawned pid is not the browser.
    edge.child = spawn(executable, args, { stdio: "ignore", windowsHide: !options.headed });
    edge.child.on("error", () => {});
    const portFile = join(profile, "DevToolsActivePort");
    for (let waited = 0; waited < 15000 && !edge.port; waited += 100) {
      if (edge.closing) throw new ProbeExit(1, "interrupted while starting Edge");
      let port = 0;
      try {
        port = Number(readFileSync(portFile, "utf8").trim().split(/\s+/)[0]);
      } catch {
        // Not written yet, or Edge still holds it open.
      }
      if (port > 0) edge.port = port;
      else await sleep(100);
    }
    if (!edge.port) throw new ProbeExit(1, "Edge did not open a DevTools port");
    const browser = await connectBrowser(edge);
    try {
      const { processInfo } = await browser.send("SystemInfo.getProcessInfo");
      edge.browserPid = processInfo.find((item) => item.type === "browser")?.id ?? null;
    } finally {
      browser.close();
    }
    return edge;
  } catch (error) {
    await closeEdge(edge);
    throw error;
  }
}

async function connectBrowser(edge) {
  const version = await (await fetch(`http://127.0.0.1:${edge.port}/json/version`)).json();
  return Cdp.connect(version.webSocketDebuggerUrl);
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function profilePids(profile) {
  // Fallback when the browser pid is unknown: every msedge.exe started with this temporary profile.
  // The path goes through an environment variable so quotes or wildcard characters in it stay literal.
  const script = "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | "
    + "Where-Object { $_.CommandLine -and $_.CommandLine.Contains($env:GST_PROBE_PROFILE) } | "
    + "ForEach-Object { $_.ProcessId }";
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    env: { ...process.env, GST_PROBE_PROFILE: profile },
  });
  return (result.stdout ?? "").split(/\s+/).filter(Boolean).map(Number);
}

function closeEdge(edge) {
  edge.closing ??= closeEdgeOnce(edge);
  return edge.closing;
}

async function closeEdgeOnce(edge) {
  // Give Edge time to exit by itself only when it was asked to close; otherwise kill it straight away.
  let graceMs = 0;
  if (edge.port) {
    graceMs = 5000;
    await Promise.race([
      (async () => {
        const browser = await connectBrowser(edge);
        await browser.send("Browser.close").catch(() => {});
        browser.close();
      })().catch(() => {}),
      deadline(3000),
    ]);
  }
  const waitGone = async (pids) => {
    for (let waited = 0; pids.some(alive) && waited < graceMs; waited += 100) await sleep(100);
    for (const pid of pids.filter(alive)) spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    for (let waited = 0; pids.some(alive) && waited < 5000; waited += 100) await sleep(100);
  };
  const started = edge.child?.pid ? [edge.child.pid] : [];
  await waitGone(edge.browserPid ? [edge.browserPid] : [...started, ...profilePids(edge.profile)]);
  graceMs = 1000;
  for (let attempt = 0; ; attempt += 1) {
    try {
      rmSync(edge.profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      await sleep(300);
      if (!existsSync(edge.profile)) return;
      throw new Error("a leftover Edge process wrote to it again");
    } catch (error) {
      // Helpers such as crashpad can outlive the browser process for a moment.
      if (attempt === 2) {
        console.error(`warning: could not delete the temporary Edge profile ${edge.profile}: ${error.message}`);
        return;
      }
      await waitGone(profilePids(edge.profile));
    }
  }
}

class Cdp {
  static connect(wsUrl) {
    const target = new URL(wsUrl);
    if (target.hostname !== "127.0.0.1") target.hostname = "127.0.0.1";
    return new Promise((ok, fail) => {
      const socket = new WebSocket(target.href);
      socket.addEventListener("open", () => ok(new Cdp(socket)), { once: true });
      socket.addEventListener("error", () => fail(new ProbeExit(1, `cannot connect to ${target.href}`)), { once: true });
    });
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.waiters = new Set();
    this.closed = false;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { ok, fail, method } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) fail(new ProbeExit(1, `${method}: ${message.error.message}`));
        else ok(message.result);
      } else if (message.method) {
        for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
      }
    });
    // If Edge crashes or is killed, every outstanding call fails instead of leaving the event loop empty.
    const lost = () => {
      if (this.closed) return;
      this.closed = true;
      const error = new ProbeExit(1, "DevTools connection closed");
      for (const { fail } of this.pending.values()) fail(error);
      this.pending.clear();
      for (const fail of this.waiters) fail(error);
      this.waiters.clear();
    };
    socket.addEventListener("close", lost);
    socket.addEventListener("error", lost);
  }

  send(method, params = {}) {
    if (this.closed) return Promise.reject(new ProbeExit(1, `${method}: DevTools connection closed`));
    const id = this.nextId++;
    const result = new Promise((ok, fail) => this.pending.set(id, { ok, fail, method }));
    this.socket.send(JSON.stringify({ id, method, params }));
    return result;
  }

  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(listener);
  }

  once(method) {
    const result = new Promise((ok, fail) => {
      const listener = (params) => {
        this.listeners.set(method, this.listeners.get(method).filter((item) => item !== listener));
        this.waiters.delete(fail);
        ok(params);
      };
      this.waiters.add(fail);
      this.on(method, listener);
    });
    // Callers may stop waiting (e.g. after a deadline); a later connection loss must not crash the process.
    result.catch(() => {});
    return result;
  }

  close() {
    this.socket.close();
  }
}

function dateOverride(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return `(() => {
    const RealDate = Date;
    const realNow = RealDate.now.bind(RealDate);
    const start = new RealDate();
    start.setHours(${hours}, ${minutes}, 0, 0);
    const offset = start.getTime() - realNow();
    function FakeDate(...args) {
      if (!new.target) return new RealDate(realNow() + offset).toString();
      return Reflect.construct(RealDate, args.length ? args : [realNow() + offset], new.target);
    }
    Object.defineProperty(FakeDate, "name", { value: "Date" });
    Object.defineProperty(FakeDate, "length", { value: 7 });
    FakeDate.prototype = RealDate.prototype;
    FakeDate.now = () => realNow() + offset;
    FakeDate.parse = RealDate.parse;
    FakeDate.UTC = RealDate.UTC;
    globalThis.Date = FakeDate;
  })();`;
}

function describeRemote(value) {
  if (!value) return "";
  if (value.description) return value.description;
  if ("value" in value) return typeof value.value === "string" ? value.value : JSON.stringify(value.value);
  return value.type;
}

async function evaluate(page, expression) {
  const result = await page.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    const details = result.exceptionDetails;
    throw new Error(describeRemote(details.exception) || details.text);
  }
  return result.result.value;
}

async function waitFor(page, expression, timeoutMs) {
  let last;
  for (let waited = 0; waited <= timeoutMs; waited += 100) {
    last = await evaluate(page, expression).catch((error) => {
      if (page.closed) throw error;
      return undefined;
    });
    if (last && last.ready) return last;
    await sleep(100);
  }
  return last ?? null;
}

function readyExpression(pageId, label) {
  return `(() => {
    const text = (selector) => document.querySelector(selector)?.textContent.trim() ?? null;
    const nav = text('.nav-key[aria-current="page"]');
    const title = text(".page-header h2");
    const main = document.getElementById(${JSON.stringify(`${pageId}-content`)});
    const mounted = Boolean(main && main.className);
    const loading = Boolean(main && main.textContent.includes("正在读取"));
    return { ready: nav === ${JSON.stringify(label)} && title === ${JSON.stringify(label)} && mounted && !loading, nav, title, mounted, loading };
  })()`;
}

async function sizeHeadedWindow(page, options) {
  // Make the window's content area WxH instead of emulating a viewport the window cannot show.
  const { windowId } = await page.send("Browser.getWindowForTarget");
  await page.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
  const frame = await evaluate(page, "({ width: outerWidth - innerWidth, height: outerHeight - innerHeight })");
  await page.send("Browser.setWindowBounds", {
    windowId,
    bounds: { left: 0, top: 0, width: options.width + frame.width, height: options.height + frame.height },
  });
  let inner = null;
  for (let waited = 0; waited <= 2000; waited += 100) {
    inner = await evaluate(page, "({ width: innerWidth, height: innerHeight })");
    if (inner.width === options.width && inner.height === options.height) return;
    await sleep(100);
  }
  throw new ProbeExit(1, `headed window content is ${inner.width}x${inner.height}, not ${options.width}x${options.height} (screen too small?)`);
}

async function openPage(edge, options, errors) {
  const targets = await (await fetch(`http://127.0.0.1:${edge.port}/json/list`)).json();
  const target = targets.find((item) => item.type === "page");
  if (!target) throw new ProbeExit(1, "no Edge page target");
  const page = await Cdp.connect(target.webSocketDebuggerUrl);
  page.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    errors.push(`exception: ${describeRemote(exceptionDetails.exception) || exceptionDetails.text}`);
  });
  page.on("Runtime.consoleAPICalled", ({ type, args }) => {
    if (type === "error") errors.push(`console.error: ${args.map(describeRemote).join(" ")}`);
  });
  // Errors DevTools shows in red that do not come from page scripts: failed resource loads, CSP, security.
  // The browser's own /favicon.ico request is skipped: the preview has none and the desktop app never asks.
  page.on("Log.entryAdded", ({ entry }) => {
    const favicon = entry.url && new URL(entry.url).pathname === "/favicon.ico";
    if (entry.level === "error" && entry.source !== "console-api" && entry.source !== "javascript" && !favicon) {
      errors.push(`${entry.source}: ${entry.text}${entry.url ? ` (${entry.url})` : ""}`);
    }
  });
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Log.enable");
  if (options.headed) await sizeHeadedWindow(page, options);
  if (options.emulateViewport) {
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: options.width,
      height: options.height,
      deviceScaleFactor: options.scale,
      mobile: false,
    });
  }
  if (options.mediaFeatures.length) {
    await page.send("Emulation.setEmulatedMedia", { features: options.mediaFeatures });
  }
  if (options.time) {
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: dateOverride(options.time) });
  }

  const loaded = page.once("Page.loadEventFired");
  const navigation = await page.send("Page.navigate", { url: options.url });
  if (navigation.errorText) throw new ProbeExit(1, `navigation failed: ${navigation.errorText}`);
  await Promise.race([loaded, deadline(15000)]);

  for (const { name, value } of options.mediaFeatures) {
    const matches = await evaluate(page, `matchMedia(${JSON.stringify(`(${name}: ${value})`)}).matches`);
    if (!matches) throw new ProbeExit(1, `media emulation not applied: (${name}: ${value})`);
  }
  await evaluate(page, "document.fonts.ready.then(() => true)");

  if (options.pageId) {
    const state = await waitFor(page, readyExpression(options.pageId, options.pageLabel), 10000);
    if (!state?.ready) {
      throw new ProbeExit(3, `page not ready after 10s: expected ${options.pageLabel}, got ${JSON.stringify(state)}`);
    }
    // Lazy pages bring their own CSS, which can request fonts only after the switch.
    await evaluate(page, "document.fonts.ready.then(() => true)");
  }
  await sleep(600);

  if (options.eval) {
    const started = Date.now();
    try {
      const value = await evaluate(page, options.eval);
      console.log(`eval: ${Date.now() - started}ms -> ${JSON.stringify(value)}`);
    } catch (error) {
      if (error instanceof ProbeExit) throw error;
      errors.push(`eval: ${error.message}`);
    }
  }
  return page;
}

function writeOut(file, data) {
  const target = resolve(file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, data);
  return target;
}

async function shot(page, options) {
  const { data } = await page.send("Page.captureScreenshot", { format: "png" });
  console.log(`shot: ${writeOut(options.out, Buffer.from(data, "base64"))}`);
}

function runInfo(options) {
  return {
    url: options.url,
    size: `${options.width}x${options.height}`,
    time: options.time ?? null,
    scale: options.emulateViewport ? options.scale : null,
  };
}

async function layout(page, options) {
  const result = await evaluate(page, `(() => {
    const half = (value) => Math.round(value * 2) / 2;
    const elements = {};
    for (const selector of ${JSON.stringify(LAYOUT_SELECTORS)}) {
      elements[selector] = Array.from(document.querySelectorAll(selector), (element) => {
        const rect = element.getBoundingClientRect();
        return { x: half(rect.x), y: half(rect.y), width: half(rect.width), height: half(rect.height) };
      });
    }
    const root = document.documentElement;
    const pages = Array.from(document.querySelectorAll(".workspace main"), (main) => ({
      id: main.id,
      className: main.className,
      scrollWidth: main.scrollWidth,
      clientWidth: main.clientWidth,
      overflow: main.scrollWidth > main.clientWidth,
    }));
    const documentOverflow = root.scrollWidth > root.clientWidth;
    return {
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      now: new Date().toString(),
      elements,
      horizontalOverflow: {
        any: documentOverflow || pages.some((item) => item.overflow),
        document: { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, overflow: documentOverflow },
        pages,
      },
    };
  })()`);
  const output = { ...runInfo(options), ...result };
  const target = writeOut(options.out, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`layout: ${target} (horizontal overflow: ${result.horizontalOverflow.any})`);
}

function summarize(intervals) {
  if (!intervals.length) return { frames: 0, avgFps: 0, maxFrameMs: 0, over50ms: 0 };
  const total = intervals.reduce((sum, value) => sum + value, 0);
  const round = (value) => Math.round(value * 10) / 10;
  return {
    frames: intervals.length,
    avgFps: round((1000 * intervals.length) / total),
    maxFrameMs: round(Math.max(...intervals)),
    over50ms: intervals.filter((value) => value > 50).length,
  };
}

async function readStream(page, handle) {
  const chunks = [];
  for (;;) {
    const { data, eof, base64Encoded } = await page.send("IO.read", { handle, size: 1 << 20 });
    chunks.push(base64Encoded ? Buffer.from(data, "base64") : Buffer.from(data, "utf8"));
    if (eof) break;
  }
  await page.send("IO.close", { handle });
  return Buffer.concat(chunks).toString("utf8");
}

function traceFrames(trace) {
  const events = Array.isArray(trace) ? trace : trace.traceEvents ?? [];
  const marks = events.filter((event) => event.name === "TimeStamp" && typeof event.args?.data?.message === "string");
  const start = marks.find((event) => event.args.data.message === "gst-probe-start");
  const end = marks.find((event) => event.args.data.message === "gst-probe-end");
  if (!start || !end) return null;
  const inRun = (ts) => ts >= start.ts && ts <= end.ts;

  let source = "DrawFrame";
  let times = events
    .filter((event) => event.name === "DrawFrame" && event.pid === start.pid && inRun(event.ts))
    .map((event) => event.ts);
  if (times.length < 2) {
    // Newer builds: a presented PipelineReporter frame ends ('e') at presentation. Ids are reused, so pair
    // each 'b' with the next 'e' of the same thread and id; forked reports of one frame share frame_sequence.
    source = "PipelineReporter";
    const open = new Map();
    const presented = new Map();
    const reports = events
      .filter((event) => event.name === "PipelineReporter" && event.pid === start.pid)
      .sort((a, b) => a.ts - b.ts);
    for (const event of reports) {
      const key = `${event.tid}:${event.id2?.local ?? event.id2?.global ?? event.id ?? ""}`;
      if (event.ph === "b") {
        if (!open.has(key)) open.set(key, []);
        open.get(key).push(event);
      } else if (event.ph === "e") {
        const begin = open.get(key)?.shift();
        const report = begin?.args?.frame_reporter ?? begin?.args?.chrome_frame_reporter;
        if (!report || !String(report.state).startsWith("STATE_PRESENTED") || !inRun(event.ts)) continue;
        const sequence = report.frame_sequence ?? `${key}@${begin.ts}`;
        presented.set(sequence, Math.min(presented.get(sequence) ?? Infinity, event.ts));
      }
    }
    times = [...presented.values()];
  }
  times = [...new Set(times)].sort((a, b) => a - b);
  if (times.length < 2) return null;
  const intervals = times.slice(1).map((ts, index) => (ts - times[index]) / 1000);
  return { source, ...summarize(intervals) };
}

async function frames(page, options) {
  const selector = JSON.stringify(options.scroll);
  const metrics = await evaluate(page, `(() => {
    const element = document.querySelector(${selector});
    return element ? { scrollHeight: element.scrollHeight, clientHeight: element.clientHeight } : null;
  })()`);
  if (!metrics) throw new ProbeExit(1, `no element matches ${options.scroll}`);
  if (metrics.scrollHeight <= metrics.clientHeight) {
    throw new ProbeExit(1, `${options.scroll} does not scroll: scrollHeight ${metrics.scrollHeight} <= clientHeight ${metrics.clientHeight}`);
  }
  if (options.cpu) await page.send("Emulation.setCPUThrottlingRate", { rate: options.cpu });

  let tracing = null;
  if (options.trace) {
    tracing = page.once("Tracing.tracingComplete");
    await page.send("Tracing.start", { categories: TRACE_CATEGORIES, transferMode: "ReturnAsStream" });
  }

  const run = await evaluate(page, `new Promise((done) => {
    const element = document.querySelector(${selector});
    const loaf = [];
    let observer = null;
    let runStart = Infinity;
    const keep = (entries) => {
      for (const entry of entries) if (entry.startTime >= runStart && entry.duration > 50) loaf.push(entry.duration);
    };
    try {
      observer = new PerformanceObserver((list) => keep(list.getEntries()));
      observer.observe({ type: "long-animation-frame", buffered: true });
    } catch {}
    const intervals = [];
    let warmEnd = null;
    let last = null;
    let direction = 1;
    let end = 0;
    const step = (now) => {
      if (warmEnd === null) warmEnd = now + ${WARM_UP_MS};
      if (last === null && now >= warmEnd) {
        runStart = now;
        end = now + ${options.seconds * 1000};
        console.timeStamp("gst-probe-start");
        last = now;
      } else if (last !== null) {
        intervals.push(now - last);
        last = now;
      }
      const max = element.scrollHeight - element.clientHeight;
      let next = element.scrollTop + 8 * direction;
      if (next >= max) { next = max; direction = -1; }
      else if (next <= 0) { next = 0; direction = 1; }
      element.scrollTop = next;
      if (last === null || now < end) {
        requestAnimationFrame(step);
        return;
      }
      console.timeStamp("gst-probe-end");
      setTimeout(() => {
        if (observer) { keep(observer.takeRecords()); observer.disconnect(); }
        done({ intervals, loaf, loafSupported: observer !== null });
      }, 300);
    };
    requestAnimationFrame(step);
  })`);

  let trace = null;
  if (tracing) {
    await page.send("Tracing.end");
    const { stream } = await tracing;
    const text = await readStream(page, stream);
    console.log(`trace: ${writeOut(options.trace, text)}`);
    trace = traceFrames(JSON.parse(text));
    if (!trace) console.error("warning: no compositor frames found in the trace; reporting trace: null");
  }
  if (options.cpu) await page.send("Emulation.setCPUThrottlingRate", { rate: 1 });

  const output = {
    ...runInfo(options),
    ...summarize(run.intervals),
    loafOver50ms: run.loafSupported ? run.loaf.length : null,
    trace,
    scrollHeight: metrics.scrollHeight,
    clientHeight: metrics.clientHeight,
    mode: options.headed ? "headed" : "headless",
    cpu: options.cpu ?? 1,
    seconds: options.seconds,
    warmUpMs: WARM_UP_MS,
  };
  const json = JSON.stringify(output, null, 2);
  if (options.out) writeOut(options.out, `${json}\n`);
  console.log(json);
}

// Ctrl+C, Ctrl+Break and closing the console window: clean up whatever exists so far, then exit 130.
const interrupt = () => {
  const cleanup = currentEdge ? closeEdge(currentEdge) : Promise.resolve();
  cleanup.finally(() => process.exit(130));
};
const SIGNALS = ["SIGINT", "SIGBREAK", "SIGHUP"];
for (const signal of SIGNALS) process.on(signal, interrupt);

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const errors = [];
  let page = null;
  const limitMs = options.command === "frames" ? (options.seconds + 120) * 1000 : 120000;
  let timer = null;
  const watchdog = new Promise((_, fail) => {
    timer = setTimeout(() => fail(new ProbeExit(1, `timed out after ${limitMs / 1000}s`)), limitMs);
  });
  const work = async () => {
    const edge = await launchEdge(options);
    page = await openPage(edge, options, errors);
    if (options.command === "shot") await shot(page, options);
    else if (options.command === "layout") await layout(page, options);
    else await frames(page, options);
  };
  try {
    await Promise.race([work(), watchdog]);
  } finally {
    clearTimeout(timer);
    page?.close();
    if (currentEdge) await closeEdge(currentEdge);
    for (const signal of SIGNALS) process.off(signal, interrupt);
    for (const error of errors) console.error(error);
  }
  if (errors.length) throw new ProbeExit(2, `${errors.length} console error(s)`);
}

main().catch((error) => {
  console.error(error instanceof ProbeExit ? error.message : error.stack ?? error);
  process.exitCode = error instanceof ProbeExit ? error.code : 1;
});
