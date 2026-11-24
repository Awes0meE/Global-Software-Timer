// Share posters (spec v0.4.3 A, B, F). Typical export:
//   const model = { ...achievementPosterModel(software) };
//   model.icon = model.icon && (await iconToDataUrl(model.icon));
//   const png = await capturePoster(<AchievementPoster model={model} theme={resolvedTheme} />);
//   await saveBinaryExport(png, achievementPosterFileName(software.display_name, software.reached_on));
export { AchievementPoster } from "./AchievementPoster";
export { DailyPoster } from "./DailyPoster";
export { PosterPortal, capturePoster } from "./capturePoster";
export { achievementPosterFileName, dailyPosterFileName, fileNameSafe } from "./fileNames";
export { loadPosterFonts } from "./fonts";
export { iconToDataUrl } from "./iconToDataUrl";
export {
  achievementPosterModel,
  dailyPosterModel,
  withIcons,
  type AchievementPosterModel,
  type DailyPosterModel,
  type MilestoneSoftware,
  type PosterTheme,
} from "./models";
export { renderPosterPng } from "./renderPosterPng";
