import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const domToBlob = vi.hoisted(() => vi.fn());
vi.mock("modern-screenshot", () => ({ domToBlob }));

import { AchievementPoster } from "../posters/AchievementPoster";
import { capturePoster } from "../posters/capturePoster";
import { DailyPoster } from "../posters/DailyPoster";
import { iconToDataUrl } from "../posters/iconToDataUrl";
import type { AchievementPosterModel, DailyPosterModel } from "../posters/models";
import {
  FRAME_TIMEOUT_MS,
  nextFrame,
  POSTER_BASE_COLORS,
  POSTER_SCALE,
  renderPosterPng,
  withoutPhysChunk,
} from "../posters/renderPosterPng";
import posterCss from "../posters/posters.css?raw";

const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

/** A PNG signature + IHDR header claiming `width`×`height`. */
function fakePng(width: number, height: number): Blob {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return new Blob([bytes], { type: "image/png" });
}

/** A response body that starts with the PNG signature. */
function pngBody(): Uint8Array<ArrayBuffer> {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
}

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(handler);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const daily: DailyPosterModel = {
  dateText: "11月25日 周三",
  label: "今日活跃",
  hero: "6.3",
  share: 0.656,
  recorded: "9.6",
  columns: [
    { key: "1", name: "Visual Studio Code", icon: PNG_DATA_URL, hours: "2.4" },
    { key: "2", name: "Google Chrome", icon: null, hours: "1.5" },
  ],
};

const achievement: AchievementPosterModel = {
  key: "code",
  name: "Visual Studio Code",
  icon: null,
  dateText: "2026年11月20日",
  tier: "6666",
  days: "1046",
  focus: "6702.4",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  domToBlob.mockReset();
});

describe("DailyPoster", () => {
  it("draws the day, the hero, the recorded line and one tray column per software", () => {
    const { container } = render(<DailyPoster model={daily} theme="dark" />);
    const poster = container.querySelector(".gst-poster");
    expect(poster).toHaveClass("is-dark");
    expect(screen.getByText("11月25日 周三")).toBeInTheDocument();
    expect(screen.getByText("今日活跃")).toBeInTheDocument();
    expect(container.querySelector(".poster-hero")?.textContent).toBe("6.3");
    expect(screen.getByText("9.6")).toBeInTheDocument();
    expect(container.querySelector<HTMLElement>(".poster-bar i")?.style.width).toMatch(/^65\.6/);
    expect(container.querySelectorAll(".poster-tray")).toHaveLength(1);
    expect(screen.getByText("Visual Studio Code")).toBeInTheDocument();
    expect(container.querySelector("img.poster-icon")).toHaveAttribute("src", PNG_DATA_URL);
    // No icon: a letter tile with the first character.
    expect(container.querySelector(".poster-tile")?.textContent).toBe("G");
    expect(screen.getByText("全局软件计时器")).toBeInTheDocument();
  });

  it("draws no tray when the day has no software", () => {
    const { container } = render(<DailyPoster model={{ ...daily, columns: [] }} theme="light" />);
    expect(container.querySelector(".gst-poster")).toHaveClass("is-light");
    expect(container.querySelector(".poster-tray")).toBeNull();
  });
});

describe("AchievementPoster", () => {
  it("draws the header, the software, the tier and the two facts", () => {
    const { container } = render(<AchievementPoster model={achievement} theme="light" />);
    expect(screen.getByText("成就")).toBeInTheDocument();
    expect(screen.getByText("2026年11月20日")).toBeInTheDocument();
    expect(screen.getByText("专注里程碑")).toBeInTheDocument();
    expect(container.querySelector(".poster-hero")?.textContent).toBe("6666");
    expect(screen.getByText("1046")).toBeInTheDocument();
    expect(screen.getByText("6702.4")).toBeInTheDocument();
    expect(container.querySelector(".poster-tile")?.textContent).toBe("V");
    expect(container.querySelector("[data-maxw]")).toHaveAttribute("data-lines", "2");
  });
});

/** A PNG chunk: length, type, data and a CRC (zeros: the reader here does not check it). */
function chunk(type: string, data: number[]): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(12 + data.length);
  new DataView(bytes.buffer).setUint32(0, data.length);
  bytes.set(Array.from(type, (char) => char.charCodeAt(0)), 4);
  bytes.set(data, 8);
  return bytes;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

describe("withoutPhysChunk", () => {
  it("removes only the pHYs chunk and keeps every other byte", () => {
    const ihdr = chunk("IHDR", Array.from({ length: 13 }, (_, index) => index));
    const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const png = concat(signature, ihdr, chunk("pHYs", [0, 0, 29, 135, 0, 0, 29, 135, 1]), chunk("IDAT", [1, 2, 3]), chunk("IEND", []));

    expect(Array.from(withoutPhysChunk(png))).toEqual(Array.from(concat(signature, ihdr, chunk("IDAT", [1, 2, 3]), chunk("IEND", []))));
  });

  it("returns bytes it cannot walk unchanged", () => {
    const truncated = concat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), new Uint8Array([0, 0, 0, 99, 0x49]));
    expect(withoutPhysChunk(truncated)).toBe(truncated);
  });
});

describe("renderPosterPng", () => {
  it("captures at an explicit scale of 2 with the theme's base colour and the embedded poster fonts", async () => {
    stubFetch(async () => new Response(new Blob(["font"]), { status: 200 }));
    domToBlob.mockResolvedValue(fakePng(1080, 1440));
    const { container } = render(<AchievementPoster model={achievement} theme="dark" />);
    const poster = container.querySelector<HTMLElement>(".gst-poster") as HTMLElement;

    const bytes = await renderPosterPng(poster);

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(POSTER_SCALE).toBe(2);
    expect(domToBlob).toHaveBeenCalledTimes(1);
    const [node, options] = domToBlob.mock.calls[0];
    expect(node).toBe(poster);
    expect(options).toMatchObject({ scale: 2, width: 540, height: 720, backgroundColor: "#121218", type: "image/png" });
    const css: string = options.font.cssText;
    expect(css).toContain('font-family:"GST Poster Inter"');
    expect(css).toContain('font-family:"GST Poster Noto SC"');
    expect(css).toContain("data:font/woff2;base64,");
    expect(css).toContain("font-weight:100 900");
  });

  it("uses the light base colour for a light poster", async () => {
    stubFetch(async () => new Response(new Blob(["font"]), { status: 200 }));
    domToBlob.mockResolvedValue(fakePng(1080, 1440));
    const { container } = render(<DailyPoster model={daily} theme="light" />);
    await renderPosterPng(container.querySelector<HTMLElement>(".gst-poster") as HTMLElement);
    expect(domToBlob.mock.calls[0][1]).toMatchObject({ backgroundColor: "#f3f3f8", scale: 2 });
  });

  it("drops the capture's 192 DPI pHYs chunk, so documents place the poster at its pixel size", async () => {
    stubFetch(async () => new Response(new Blob(["font"]), { status: 200 }));
    const head = new Uint8Array(await fakePng(1080, 1440).arrayBuffer());
    domToBlob.mockResolvedValue(new Blob([concat(head, chunk("pHYs", [0, 0, 29, 135, 0, 0, 29, 135, 1]), chunk("IEND", []))]));
    const { container } = render(<DailyPoster model={daily} theme="dark" />);

    const bytes = await renderPosterPng(container.querySelector<HTMLElement>(".gst-poster") as HTMLElement);

    expect(Array.from(bytes)).toEqual(Array.from(concat(head, chunk("IEND", []))));
  });

  it("rejects a capture that is not 1080x1440", async () => {
    stubFetch(async () => new Response(new Blob(["font"]), { status: 200 }));
    domToBlob.mockResolvedValue(fakePng(540, 720));
    const { container } = render(<DailyPoster model={daily} theme="dark" />);
    await expect(renderPosterPng(container.querySelector<HTMLElement>(".gst-poster") as HTMLElement)).rejects.toThrow(
      "poster_render_failed",
    );
  });

  it("paints the capture background in the same base colour as posters.css", () => {
    const base = (selector: string) => {
      const block = posterCss.slice(posterCss.indexOf(selector));
      return /--p-base:\s*([^;]+);/.exec(block)?.[1].trim();
    };
    expect(base(".gst-poster.is-dark")).toBe(POSTER_BASE_COLORS.dark);
    expect(base(".gst-poster.is-light")).toBe(POSTER_BASE_COLORS.light);
  });

  it("does not wait for an animation frame that never comes (window hidden in the tray)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    let done = false;
    void nextFrame().then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(FRAME_TIMEOUT_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
  });

  it("resolves on the animation frame when it comes", async () => {
    let fire: FrameRequestCallback = () => undefined;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        fire = callback;
        return 7;
      }),
    );
    const clear = vi.spyOn(globalThis, "clearTimeout");
    const frame = nextFrame();
    fire(0);
    await expect(frame).resolves.toBeUndefined();
    expect(clear).toHaveBeenCalled();
  });

  it("captures a poster mounted off screen and removes it afterwards", async () => {
    stubFetch(async () => new Response(new Blob(["font"]), { status: 200 }));
    let host: HTMLElement | null = null;
    domToBlob.mockImplementation(async (node: HTMLElement) => {
      host = node.parentElement;
      return fakePng(1080, 1440);
    });

    const bytes = await capturePoster(<AchievementPoster model={achievement} theme="dark" />);

    expect(bytes.length).toBe(33);
    expect(host).not.toBeNull();
    const style = (host as unknown as HTMLElement).style;
    expect(style.position).toBe("fixed");
    expect(style.left).toBe("-10000px");
    expect(style.display).not.toBe("none");
    expect(host).toHaveAttribute("aria-hidden", "true");
    expect(document.body.contains(host)).toBe(false);
  });
});

describe("iconToDataUrl", () => {
  it("reads a PNG icon into a data: URL without the HTTP cache", async () => {
    const fetchMock = stubFetch(
      async () => new Response(pngBody(), { status: 200, headers: { "Content-Type": "image/png" } }),
    );
    await expect(iconToDataUrl("http://gsticon.localhost/abc")).resolves.toMatch(/^data:image\/png;base64,/);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });

  it("accepts a PNG content type with parameters", async () => {
    stubFetch(async () => new Response(pngBody(), { status: 200, headers: { "Content-Type": "image/png; charset=binary" } }));
    await expect(iconToDataUrl("http://gsticon.localhost/abc")).resolves.toMatch(/^data:image\/png;base64,iVBORw0KGgo/);
  });

  it("returns null for an empty body labelled image/png", async () => {
    stubFetch(async () => new Response(new Uint8Array(0), { status: 200, headers: { "Content-Type": "image/png" } }));
    await expect(iconToDataUrl("http://gsticon.localhost/abc")).resolves.toBeNull();
  });

  it("returns null for a body labelled image/png that is not a PNG", async () => {
    stubFetch(async () => new Response("GIF89a not a png", { status: 200, headers: { "Content-Type": "image/png" } }));
    await expect(iconToDataUrl("http://gsticon.localhost/abc")).resolves.toBeNull();
  });

  it("returns null for a failed response", async () => {
    stubFetch(async () => new Response("missing", { status: 404, headers: { "Content-Type": "image/png" } }));
    await expect(iconToDataUrl("http://gsticon.localhost/abc")).resolves.toBeNull();
  });

  it("returns null for anything but a PNG", async () => {
    stubFetch(async () => new Response("<svg/>", { status: 200, headers: { "Content-Type": "image/svg+xml" } }));
    await expect(iconToDataUrl("http://gsticon.localhost/abc")).resolves.toBeNull();
  });

  it("returns null when the request fails", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(iconToDataUrl("http://gsticon.localhost/abc")).resolves.toBeNull();
  });

  it("gives up after the timeout", async () => {
    vi.useFakeTimers();
    stubFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const result = iconToDataUrl("http://gsticon.localhost/slow");
    await vi.advanceTimersByTimeAsync(3000);
    await expect(result).resolves.toBeNull();
  });
});

describe("poster fonts", () => {
  it("rejects with poster_font_unavailable when a font cannot be read, and retries on the next call", async () => {
    vi.resetModules();
    const { posterFontEmbedCss } = await import("../posters/fonts");
    const fetchMock = stubFetch(async () => new Response("missing", { status: 404 }));
    await expect(posterFontEmbedCss()).rejects.toThrow("poster_font_unavailable");

    fetchMock.mockImplementation(async () => new Response(new Blob(["font"]), { status: 200 }));
    await expect(posterFontEmbedCss()).resolves.toContain("data:font/woff2;base64,");
  });

  it("still resolves when a font face fails to load (the fallback fonts draw the poster)", async () => {
    vi.resetModules();
    const added: unknown[] = [];
    class FailingFace {
      constructor(
        public family: string,
        public source: string,
      ) {}
      load() {
        return Promise.reject(new DOMException("bad font", "NetworkError"));
      }
    }
    vi.stubGlobal("FontFace", FailingFace);
    const fonts = {
      add: vi.fn((face: unknown) => added.push(face)),
      load: vi.fn(() => Promise.reject(new Error("no font"))),
    };
    Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
    try {
      const { loadPosterFonts } = await import("../posters/fonts");
      await expect(loadPosterFonts()).resolves.toBeUndefined();
      expect(added).toHaveLength(2);
      expect(fonts.load).toHaveBeenCalled();
    } finally {
      delete (document as unknown as { fonts?: unknown }).fonts;
    }
  });
});
