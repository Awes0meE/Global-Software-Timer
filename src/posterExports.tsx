// The poster exports (spec v0.4.3 A, B, D and C.5): read what the poster shows, inline its icons, render it
// off screen to PNG bytes and save them through the native dialog. App loads this module on demand, so the
// posters stay out of the startup bundle.
import { getDashboardSummary, saveBinaryExport, type MilestoneSoftware } from "./api";
import {
  AchievementPoster,
  DailyPoster,
  achievementPosterFileName,
  achievementPosterModel,
  capturePoster,
  dailyPosterFileName,
  dailyPosterModel,
  iconToDataUrl,
  withIcons,
} from "./posters";
import { paintedTheme } from "./theme";

/** 日报海报 of the viewed day: resolves to the saved path, or null when the save dialog was cancelled. */
export async function saveDailyPoster(viewedDate: string, today: string): Promise<string | null> {
  // Today goes through the live path; only a past day is asked for by date.
  const summary = await getDashboardSummary(viewedDate < today ? viewedDate : undefined);
  const model = dailyPosterModel(summary, summary.usage_date, summary.is_today);
  const columns = await withIcons(model.columns, iconToDataUrl);
  const png = await capturePoster(<DailyPoster model={{ ...model, columns }} theme={paintedTheme()} />);
  return saveBinaryExport(png, dailyPosterFileName(summary.usage_date));
}

/** 成就海报 of one software: resolves to the saved path, or null when the save dialog was cancelled. */
export async function saveAchievementPoster(software: MilestoneSoftware): Promise<string | null> {
  const [model] = await withIcons([achievementPosterModel(software)], iconToDataUrl);
  const png = await capturePoster(<AchievementPoster model={model} theme={paintedTheme()} />);
  return saveBinaryExport(png, achievementPosterFileName(software.display_name, software.reached_on));
}
