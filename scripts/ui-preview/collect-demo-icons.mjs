// Copies real app icons for the UI preview's demo software from this machine's
// GST icon cache into scripts/ui-preview/demo-icons/ (gitignored: the icons are
// third-party artwork and are only used to take README screenshots locally).
//
// Usage: node scripts/ui-preview/collect-demo-icons.mjs [database]
// The database defaults to the installed app's; it is opened read-only.
// Software that is not installed here keeps the preview's letter tile.
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Demo key -> process names to look for (lower case), in order of preference.
const DEMO = {
  code: ["code.exe"],
  chrome: ["chrome.exe"],
  wechat: ["weixin.exe", "wechat.exe"],
  excel: ["excel.exe"],
  typora: ["typora.exe"],
  steam: ["steam.exe"],
  matlab: ["matlab.exe"],
  notion: ["notion.exe"],
  terminal: ["windowsterminal.exe"],
  cloudmusic: ["cloudmusic.exe"],
  snipaste: ["snipaste.exe"],
  onedrive: ["onedrive.exe"],
};

// Must match icon_key() and ICON_FORMAT_VERSION in src-tauri/src/native_icon.rs.
const ICON_FORMAT_VERSION = 2;

function iconKey(path) {
  let len = 0n;
  let modified = 0n;
  try {
    const stat = statSync(path, { bigint: true });
    len = stat.size;
    modified = stat.mtimeNs;
  } catch {
    // A missing file hashes like the app does: length and time 0.
  }
  const bytes = [...Buffer.from(path.toLowerCase(), "utf8")];
  const le = (value, size) => Array.from({ length: size }, (_, i) => Number((value >> BigInt(8 * i)) & 0xffn));
  bytes.push(...le(len, 8), ...le(modified, 16), ICON_FORMAT_VERSION);
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

const appData = join(process.env.LOCALAPPDATA ?? "", "com.globalsoftwaretimer.app");
const database = process.argv[2] ?? join(process.env.APPDATA ?? "", "com.globalsoftwaretimer.app", "global-software-timer.sqlite3");
const cache = join(appData, "icons");
const out = join(dirname(fileURLToPath(import.meta.url)), "demo-icons");

const db = new DatabaseSync(database, { readOnly: true });
const apps = db.prepare("SELECT process_name, executable_path FROM apps").all();
db.close();
mkdirSync(out, { recursive: true });

for (const [key, names] of Object.entries(DEMO)) {
  const match = names
    .flatMap((name) => apps.filter((app) => app.process_name?.toLowerCase() === name))
    .map((app) => join(cache, `${iconKey(app.executable_path)}.png`))
    .find((png) => existsSync(png));
  if (match) copyFileSync(match, join(out, `${key}.png`));
  console.log(`${key}: ${match ? "copied" : "not found, keeps the letter tile"}`);
}
