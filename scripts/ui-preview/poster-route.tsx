// Preview-only poster route: ?poster=daily|achievement&theme=dark|light[&software=<identity key>][&name=<text>][&date=YYYY-MM-DD]
// [&scale=<k>] shows one poster alone at 540×720 (top left) for screenshots, from the preview's synthetic data only;
// &scale shows it under transform: scale(k), as the 成就海报 dialog does (0.5 -> 270×360).
// window.__posterReady turns true once fonts, icons and layout are settled (the probe waits for it);
// window.__renderPoster() renders the PNG exactly as an export does and resolves to its data: URL.
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { getDashboardSummary, getMilestoneSoftware } from "../../src/api";
import {
  AchievementPoster,
  DailyPoster,
  achievementPosterModel,
  dailyPosterModel,
  iconToDataUrl,
  loadPosterFonts,
  renderPosterPng,
  withIcons,
  type AchievementPosterModel,
  type DailyPosterModel,
  type PosterTheme,
} from "../../src/posters";

declare global {
  interface Window {
    __posterReady?: boolean;
    __renderPoster?: () => Promise<string>;
  }
}

type Poster = { kind: "daily"; model: DailyPosterModel } | { kind: "achievement"; model: AchievementPosterModel };

async function loadPoster(params: URLSearchParams): Promise<Poster> {
  if (params.get("poster") === "achievement") {
    const list = await getMilestoneSoftware(true);
    const wanted = params.get("software");
    const latest = [...list].sort((left, right) => right.reached_on.localeCompare(left.reached_on))[0];
    const software = list.find((item) => item.identity_key === wanted) ?? latest;
    if (!software) throw new Error("poster route: no milestone software");
    const [model] = await withIcons([achievementPosterModel(software)], iconToDataUrl);
    // &name=<text> tries a long name (fit, two lines, ellipsis) on a real record.
    return { kind: "achievement", model: { ...model, name: params.get("name") ?? model.name } };
  }

  const summary = await getDashboardSummary(params.get("date") ?? undefined);
  const model = dailyPosterModel(summary, summary.usage_date, summary.is_today);
  const columns = await withIcons(model.columns, iconToDataUrl);
  // &name=<text> renames the first tray column (shrink, ellipsis).
  const name = params.get("name");
  return { kind: "daily", model: { ...model, columns: columns.map((column, index) => (index === 0 && name ? { ...column, name } : column)) } };
}

function PosterRoute({ params }: { params: URLSearchParams }) {
  const theme: PosterTheme = params.get("theme") === "light" ? "light" : "dark";
  const [poster, setPoster] = useState<Poster | null>(null);
  const node = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadPoster(params).then(setPoster);
  }, [params]);

  useEffect(() => {
    if (!poster || !node.current) return;
    const element = node.current;
    window.__renderPoster = async () => {
      const bytes = await renderPosterPng(element);
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return `data:image/png;base64,${btoa(binary)}`;
    };
    void (async () => {
      await loadPosterFonts();
      await Promise.all(Array.from(element.querySelectorAll("img")).map((img) => img.decode().catch(() => undefined)));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.__posterReady = true;
    })();
  }, [poster]);

  if (!poster) return null;
  const element =
    poster.kind === "daily" ? (
      <DailyPoster ref={node} model={poster.model} theme={theme} />
    ) : (
      <AchievementPoster ref={node} model={poster.model} theme={theme} />
    );
  const scale = Number(params.get("scale"));
  if (!(scale > 0) || scale === 1) return element;
  return <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0", width: 540, height: 720 }}>{element}</div>;
}

export function mountPosterRoute(params: URLSearchParams) {
  document.documentElement.style.cssText = "margin:0;background:#000;";
  document.body.style.cssText = "margin:0;background:#000;";
  createRoot(document.getElementById("root") as HTMLElement).render(<PosterRoute params={params} />);
}
