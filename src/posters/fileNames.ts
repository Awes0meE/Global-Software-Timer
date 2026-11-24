// Suggested file names for the poster PNGs (spec v0.4.3 A.9 and B.9).

/** 日报海报 of the viewed day. */
export function dailyPosterFileName(date: string): string {
  return `GST-日报-${date}.png`;
}

/** Characters Windows does not allow in file names: \ / : * ? " < > | and control characters. */
const INVALID_FILE_NAME_CHARS = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

/** A software name made safe for a Windows file name; never empty. */
export function fileNameSafe(name: string): string {
  const cleaned = name.replace(INVALID_FILE_NAME_CHARS, "").trim().replace(/[. ]+$/, "");
  return cleaned === "" ? "软件" : cleaned;
}

/** 成就海报: dated the day the software reached its highest tier. */
export function achievementPosterFileName(softwareName: string, reachedOn: string): string {
  return `GST-成就-${fileNameSafe(softwareName)}-${reachedOn}.png`;
}
