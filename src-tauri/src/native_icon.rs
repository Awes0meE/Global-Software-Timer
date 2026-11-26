use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Arc, Mutex, MutexGuard, OnceLock, Weak};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// Pixel size of every cached icon. The largest UI icon is 44 CSS px, so this
/// stays sharp up to about 200% display scaling.
const ICON_SIZE: u32 = 96;
/// Executables are read at their largest embedded icon size, up to this, and
/// scaled here: Windows stretches smaller icons blockily, a system-size icon too.
const NATIVE_EXTRACT_SIZE: u32 = 256;
/// Bump when the icon pipeline changes, so stale disk-cached icons are not reused.
const ICON_FORMAT_VERSION: u8 = 2;
const RETRY_DELAY: Duration = Duration::from_secs(60);
const DISK_CACHE_MAX_AGE: Duration = Duration::from_secs(90 * 24 * 60 * 60);
pub(crate) const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";

/// Webview protocol that serves cached icons, so summaries carry a short URL
/// instead of the image itself.
pub const URI_SCHEME: &str = "gsticon";

/// The bundled app's page origin: Tauri serves `tauri://localhost` as
/// `http://tauri.localhost` on Windows (`useHttpsScheme` is off).
#[cfg(any(windows, target_os = "android"))]
pub const APP_ORIGIN: &str = "http://tauri.localhost";
#[cfg(not(any(windows, target_os = "android")))]
pub const APP_ORIGIN: &str = "tauri://localhost";

pub type IconBytes = Arc<Vec<u8>>;
/// Receives the icon once it is known; `None` means there is no icon.
pub type IconWaiter = Box<dyn FnOnce(Option<IconBytes>) + Send>;

enum IconState {
    Pending(Vec<IconWaiter>),
    Ready(IconBytes),
    Failed(Instant),
}

struct IconEntry {
    path: String,
    state: IconState,
    /// Bumped on each retry; it changes the URL so the webview asks again.
    attempt: u32,
}

#[derive(Default)]
struct Registry {
    keys_by_path: HashMap<String, String>,
    entries: HashMap<String, IconEntry>,
}

struct IconStore {
    registry: Mutex<Registry>,
    disk_dir: Option<PathBuf>,
    extract: fn(&str) -> Option<Vec<u8>>,
    queue: OnceLock<mpsc::Sender<String>>,
}

static STORE: OnceLock<Arc<IconStore>> = OnceLock::new();

fn store() -> &'static Arc<IconStore> {
    STORE.get_or_init(|| IconStore::new(None, native_icon_png_for_path))
}

/// Keeps extracted icons in `dir` across restarts. Call once at startup,
/// before any summary is served.
pub fn init_disk_cache(dir: PathBuf) {
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let prune_dir = dir.clone();
    std::thread::spawn(move || prune_disk_cache(&prune_dir, SystemTime::now()));
    let _ = STORE.set(IconStore::new(Some(dir), native_icon_png_for_path));
}

/// Image URL for a summary row. Shell icon lookup can block for seconds, so it
/// runs on a worker thread and the webview request waits for it instead.
pub fn icon_url(executable_path: &str) -> Option<String> {
    store().url_for(executable_path)
}

/// Answers a `gsticon` protocol request for `request_path` ("/<key>.png").
pub fn resolve_icon(request_path: &str, waiter: IconWaiter) {
    let key = request_path
        .trim_start_matches('/')
        .trim_end_matches(".png");
    store().resolve(key, waiter);
}

/// The dev server's origin (`build.devUrl`), only when tauri serves the page
/// from it: tauri-build's `dev` cfg (no `custom-protocol` feature), which is
/// what tauri's own `get_app_url` checks. It differs from `debug_assertions`
/// in `tauri dev --release` and `tauri build --debug`.
pub fn dev_server_origin(dev_url: Option<&tauri::Url>) -> Option<String> {
    if !cfg!(dev) {
        return None;
    }
    url_origin(dev_url?)
}

/// `scheme://host[:port]` of a URL; `None` for opaque origins such as `data:`.
pub fn url_origin(url: &tauri::Url) -> Option<String> {
    let origin = url.origin();
    origin.is_tuple().then(|| origin.ascii_serialization())
}

/// Debug builds print the first `Origin` a `gsticon` request carries, once, so
/// the real webview origin can be checked against the allowed ones in `tauri
/// dev`. `<img>` loads are no-cors and send no `Origin`, so they are skipped;
/// the first one logged is a poster's icon `fetch`.
pub fn log_first_request_origin(origin: Option<&str>) {
    static LOGGED: std::sync::Once = std::sync::Once::new();
    if !cfg!(debug_assertions) {
        return;
    }
    if let Some(origin) = origin {
        LOGGED.call_once(|| eprintln!("gsticon request Origin: {origin}"));
    }
}

/// The request's `Origin` when it is one of the app's own pages, so posters
/// can `fetch` icons; any other origin (or none) gets no CORS header.
pub fn allowed_cors_origin<'a>(
    origin: Option<&'a str>,
    dev_origin: Option<&str>,
) -> Option<&'a str> {
    origin.filter(|origin| *origin == APP_ORIGIN || dev_origin == Some(*origin))
}

/// `allow_origin` comes from `allowed_cors_origin`. Every response varies by
/// `Origin`, so a cached icon without the CORS header is never reused for a
/// `fetch` that needs it.
pub fn icon_response(
    icon: Option<IconBytes>,
    allow_origin: Option<&str>,
) -> tauri::http::Response<Vec<u8>> {
    let mut builder = tauri::http::Response::builder().header("Vary", "Origin");
    if let Some(origin) = allow_origin {
        builder = builder.header("Access-Control-Allow-Origin", origin);
    }
    let response = match icon {
        // The key changes with the executable, so a served icon never goes stale.
        Some(bytes) => builder
            .status(200)
            .header("Content-Type", "image/png")
            .header("Cache-Control", "max-age=31536000, immutable")
            .body(bytes.as_ref().clone()),
        None => builder
            .status(404)
            .header("Cache-Control", "no-store")
            .body(Vec::new()),
    };
    response.unwrap_or_default()
}

fn url_for_key(key: &str, attempt: u32) -> String {
    let retry = if attempt == 0 {
        String::new()
    } else {
        format!("?retry={attempt}")
    };
    if cfg!(any(windows, target_os = "android")) {
        format!("http://{URI_SCHEME}.localhost/{key}.png{retry}")
    } else {
        format!("{URI_SCHEME}://localhost/{key}.png{retry}")
    }
}

/// Stable across runs. Windows paths are case-insensitive, and the file's size
/// and modification time are included so an updated executable gets a new icon.
fn icon_key(path: &str) -> String {
    let (len, modified) = std::fs::metadata(path)
        .map(|metadata| {
            let modified = metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |since| since.as_nanos());
            (metadata.len(), modified)
        })
        .unwrap_or((0, 0));
    // FNV-1a: std's hasher is not guaranteed to be stable between Rust releases.
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    let bytes = path
        .to_lowercase()
        .into_bytes()
        .into_iter()
        .chain(len.to_le_bytes())
        .chain(modified.to_le_bytes())
        .chain([ICON_FORMAT_VERSION]);
    for byte in bytes {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:016x}")
}

enum Resolution {
    Answer(Option<IconBytes>),
    Wait,
}

impl IconStore {
    fn new(disk_dir: Option<PathBuf>, extract: fn(&str) -> Option<Vec<u8>>) -> Arc<Self> {
        Arc::new(Self {
            registry: Mutex::default(),
            disk_dir,
            extract,
            queue: OnceLock::new(),
        })
    }

    fn lock(&self) -> MutexGuard<'_, Registry> {
        self.registry
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn url_for(self: &Arc<Self>, executable_path: &str) -> Option<String> {
        let path = executable_path.trim();
        // The key and the lookup touch the file, which on a network path reaches another computer.
        if !crate::local_path::is_local_drive_path(path) {
            return None;
        }
        {
            let mut registry = self.lock();
            if let Some(key) = registry.keys_by_path.get(path).cloned() {
                return Some(self.current_url(&mut registry, &key));
            }
        }

        let key = icon_key(path);
        let on_disk = self.read_disk(&key);
        let mut registry = self.lock();
        registry.keys_by_path.insert(path.to_owned(), key.clone());
        if !registry.entries.contains_key(&key) {
            let needs_lookup = on_disk.is_none();
            let state = on_disk.map_or_else(|| IconState::Pending(Vec::new()), IconState::Ready);
            registry.entries.insert(
                key.clone(),
                IconEntry {
                    path: path.to_owned(),
                    state,
                    attempt: 0,
                },
            );
            if needs_lookup {
                self.enqueue(&key);
            }
        }
        Some(self.current_url(&mut registry, &key))
    }

    /// Summaries refresh every few seconds, so a failed lookup is queued again
    /// here once the cooldown has passed, under a new URL the webview requests.
    fn current_url(self: &Arc<Self>, registry: &mut Registry, key: &str) -> String {
        let Some(entry) = registry.entries.get_mut(key) else {
            return url_for_key(key, 0);
        };
        if matches!(entry.state, IconState::Failed(at) if at.elapsed() >= RETRY_DELAY) {
            entry.attempt += 1;
            entry.state = IconState::Pending(Vec::new());
            self.enqueue(key);
        }
        url_for_key(key, entry.attempt)
    }

    fn resolve(&self, key: &str, waiter: IconWaiter) {
        let mut registry = self.lock();
        let resolution = match registry.entries.get(key).map(|entry| &entry.state) {
            None => Resolution::Answer(None),
            Some(IconState::Ready(bytes)) => Resolution::Answer(Some(Arc::clone(bytes))),
            Some(IconState::Pending(_)) => Resolution::Wait,
            Some(IconState::Failed(_)) => Resolution::Answer(None),
        };
        match resolution {
            Resolution::Answer(icon) => {
                drop(registry);
                waiter(icon);
            }
            Resolution::Wait => {
                if let Some(IconState::Pending(waiters)) =
                    registry.entries.get_mut(key).map(|entry| &mut entry.state)
                {
                    waiters.push(waiter);
                }
            }
        }
    }

    fn enqueue(self: &Arc<Self>, key: &str) {
        let queue = self.queue.get_or_init(|| {
            let (sender, receiver) = mpsc::channel::<String>();
            // Weak, so a dropped store closes the channel and ends the worker.
            let store: Weak<Self> = Arc::downgrade(self);
            std::thread::spawn(move || {
                for key in receiver {
                    let Some(store) = store.upgrade() else {
                        break;
                    };
                    // A panic must not end the worker: later requests would hang.
                    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        store.look_up(&key);
                    }));
                }
            });
            sender
        });
        let _ = queue.send(key.to_owned());
    }

    fn look_up(&self, key: &str) {
        let Some(path) = self.lock().entries.get(key).map(|entry| entry.path.clone()) else {
            return;
        };
        let extract = self.extract;
        let icon = std::panic::catch_unwind(|| extract(&path))
            .ok()
            .flatten()
            .map(Arc::new);
        if let Some(bytes) = &icon {
            self.write_disk(key, bytes);
        }
        let waiters = {
            let mut registry = self.lock();
            let Some(entry) = registry.entries.get_mut(key) else {
                return;
            };
            let state = icon
                .clone()
                .map_or_else(|| IconState::Failed(Instant::now()), IconState::Ready);
            match std::mem::replace(&mut entry.state, state) {
                IconState::Pending(waiters) => waiters,
                _ => Vec::new(),
            }
        };
        for waiter in waiters {
            waiter(icon.clone());
        }
    }

    fn disk_path(&self, key: &str) -> Option<PathBuf> {
        Some(self.disk_dir.as_ref()?.join(format!("{key}.png")))
    }

    fn read_disk(&self, key: &str) -> Option<IconBytes> {
        let bytes = std::fs::read(self.disk_path(key)?).ok()?;
        bytes.starts_with(PNG_SIGNATURE).then(|| Arc::new(bytes))
    }

    fn write_disk(&self, key: &str, bytes: &[u8]) {
        let Some(path) = self.disk_path(key) else {
            return;
        };
        // Write then rename, so a crash never leaves a truncated icon behind.
        let temp = path.with_extension("png.tmp");
        if std::fs::write(&temp, bytes).is_ok() {
            let _ = std::fs::rename(&temp, &path);
        }
    }
}

/// Icons of replaced executables are never requested again. Files written more
/// than `DISK_CACHE_MAX_AGE` ago are dropped; one still in use is re-extracted.
fn prune_disk_cache(dir: &Path, now: SystemTime) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let expired = entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .ok()
            .and_then(|modified| now.duration_since(modified).ok())
            .is_some_and(|age| age > DISK_CACHE_MAX_AGE);
        if expired {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum IconLookupStep {
    DirectImageFile(PathBuf),
    NativeExecutable,
    ExplicitLocalFile(PathBuf),
    DiscoveredLocalFile(PathBuf),
    PackageFile(PathBuf),
}

/// PNG bytes of the best icon found for `key`, an executable or image path.
fn native_icon_png_for_path(key: &str) -> Option<Vec<u8>> {
    let path = Path::new(key);
    icon_lookup_steps_for_path(path)
        .into_iter()
        .find_map(|step| match step {
            IconLookupStep::DirectImageFile(candidate)
            | IconLookupStep::ExplicitLocalFile(candidate)
            | IconLookupStep::DiscoveredLocalFile(candidate)
            | IconLookupStep::PackageFile(candidate) => image_file_png(&candidate),
            IconLookupStep::NativeExecutable => extract_native_icon_png(key),
        })
}

fn icon_lookup_steps_for_path(path: &Path) -> Vec<IconLookupStep> {
    let mut steps = vec![
        IconLookupStep::DirectImageFile(path.to_path_buf()),
        IconLookupStep::NativeExecutable,
    ];
    let mut seen = HashSet::new();

    for candidate in local_explicit_icon_candidates_for_path(path) {
        push_file_lookup_step(
            &mut steps,
            &mut seen,
            IconLookupStep::ExplicitLocalFile(candidate),
        );
    }
    for candidate in local_discovered_icon_candidates_for_path(path) {
        push_file_lookup_step(
            &mut steps,
            &mut seen,
            IconLookupStep::DiscoveredLocalFile(candidate),
        );
    }
    for candidate in package_icon_candidates(path) {
        push_file_lookup_step(
            &mut steps,
            &mut seen,
            IconLookupStep::PackageFile(candidate),
        );
    }

    steps
}

fn push_file_lookup_step(
    steps: &mut Vec<IconLookupStep>,
    seen: &mut HashSet<PathBuf>,
    step: IconLookupStep,
) {
    let path = match &step {
        IconLookupStep::DirectImageFile(path)
        | IconLookupStep::ExplicitLocalFile(path)
        | IconLookupStep::DiscoveredLocalFile(path)
        | IconLookupStep::PackageFile(path) => path,
        IconLookupStep::NativeExecutable => return,
    };
    if seen.insert(path.clone()) {
        steps.push(step);
    }
}

fn image_file_png(path: &Path) -> Option<Vec<u8>> {
    let extension = path.extension()?.to_string_lossy().to_lowercase();
    if !matches!(extension.as_str(), "ico" | "png") {
        return None;
    }

    let image = image::ImageReader::open(path)
        .ok()?
        .decode()
        .ok()?
        .to_rgba8();
    let (width, height) = image.dimensions();
    let mut rgba = image.into_raw();
    premultiply_alpha(&mut rgba);
    premultiplied_rgba_to_icon_png(rgba, width, height)
}

/// Scales premultiplied RGBA to `ICON_SIZE` and encodes it as a normal
/// (straight-alpha) PNG. Scaling premultiplied pixels keeps the colour of fully
/// transparent pixels from bleeding into antialiased edges.
fn premultiplied_rgba_to_icon_png(rgba: Vec<u8>, width: u32, height: u32) -> Option<Vec<u8>> {
    let image = image::RgbaImage::from_raw(width, height, rgba)?;
    let image = if width == ICON_SIZE && height == ICON_SIZE {
        image
    } else {
        image::DynamicImage::ImageRgba8(image)
            .resize(ICON_SIZE, ICON_SIZE, image::imageops::FilterType::Lanczos3)
            .into_rgba8()
    };
    let (width, height) = image.dimensions();
    let mut rgba = image.into_raw();
    unpremultiply_alpha(&mut rgba);
    encode_rgba_png(&rgba, width, height)
}

fn premultiply_alpha(rgba: &mut [u8]) {
    for pixel in rgba.chunks_exact_mut(4) {
        let alpha = u32::from(pixel[3]);
        for channel in &mut pixel[..3] {
            *channel = ((u32::from(*channel) * alpha + 127) / 255) as u8;
        }
    }
}

fn unpremultiply_alpha(rgba: &mut [u8]) {
    for pixel in rgba.chunks_exact_mut(4) {
        let alpha = u32::from(pixel[3]);
        match alpha {
            0 => pixel[..3].fill(0),
            255 => {}
            _ => {
                for channel in &mut pixel[..3] {
                    *channel = ((u32::from(*channel) * 255 + alpha / 2) / alpha).min(255) as u8;
                }
            }
        }
    }
}

#[cfg(test)]
fn explicit_icon_candidates_for_path(path: &Path) -> Vec<PathBuf> {
    let mut candidates = local_explicit_icon_candidates_for_path(path);
    candidates.extend(local_discovered_icon_candidates_for_path(path));
    candidates
}

fn local_explicit_icon_candidates_for_path(path: &Path) -> Vec<PathBuf> {
    local_icon_candidates_for_path(path, |dir, _executable_stem| {
        explicit_icon_candidates_in_dir(dir)
    })
}

fn local_discovered_icon_candidates_for_path(path: &Path) -> Vec<PathBuf> {
    local_icon_candidates_for_path(path, discover_icon_assets)
}

fn local_icon_candidates_for_path<F>(path: &Path, mut candidates_in_dir: F) -> Vec<PathBuf>
where
    F: FnMut(&Path, &str) -> Vec<PathBuf>,
{
    let start_dir = if path.is_dir() {
        path
    } else {
        match path.parent() {
            Some(parent) => parent,
            None => return Vec::new(),
        }
    };
    let executable_stem = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let mut candidates = Vec::new();
    let mut seen = HashSet::new();
    let mut dir = Some(start_dir);
    for _ in 0..5 {
        let Some(current_dir) = dir else {
            break;
        };

        for candidate in candidates_in_dir(current_dir, &executable_stem) {
            if candidate.exists() && seen.insert(candidate.clone()) {
                candidates.push(candidate);
            }
        }
        dir = current_dir.parent();
    }

    candidates
}

fn icon_candidates_in_dir(dir: &Path, executable_stem: &str) -> Vec<PathBuf> {
    let mut candidates = explicit_icon_candidates_in_dir(dir);
    candidates.extend(discover_icon_assets(dir, executable_stem));
    candidates
}

fn explicit_icon_candidates_in_dir(dir: &Path) -> Vec<PathBuf> {
    vec![
        dir.join("resources").join("icon.ico"),
        dir.join("resources").join("icon.png"),
        dir.join("resources").join("app.ico"),
        dir.join("resources").join("app.png"),
        dir.join("assets").join("Square150x150Logo.png"),
        dir.join("assets").join("Square44x44Logo.png"),
        dir.join("assets").join("icon.png"),
        dir.join("Assets").join("Square150x150Logo.png"),
        dir.join("Assets").join("Square44x44Logo.png"),
        dir.join("Assets").join("icon.png"),
        dir.join("icons").join("icon.ico"),
        dir.join("icons").join("icon.png"),
        dir.join("icon.ico"),
        dir.join("icon.png"),
    ]
}

fn discover_icon_assets(dir: &Path, executable_stem: &str) -> Vec<PathBuf> {
    let search_dirs = [
        dir.to_path_buf(),
        dir.join("resources"),
        dir.join("assets"),
        dir.join("Assets"),
        dir.join("icons"),
        dir.join("Images"),
        dir.join("images"),
        dir.join("media"),
        dir.join("webview-ui"),
        dir.join("webview-ui").join("assets"),
    ];
    let mut scored_candidates = Vec::new();

    for search_dir in search_dirs {
        let Ok(entries) = std::fs::read_dir(search_dir) else {
            continue;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let score = icon_asset_score(&path, executable_stem, is_broad_icon_search_dir(dir));
            if score > 0 {
                scored_candidates.push((score, path));
            }
        }
    }

    scored_candidates.sort_by(|left, right| {
        right
            .0
            .cmp(&left.0)
            .then_with(|| left.1.file_name().cmp(&right.1.file_name()))
    });
    scored_candidates
        .into_iter()
        .map(|(_, path)| path)
        .collect()
}

fn icon_asset_score(path: &Path, executable_stem: &str, broad_dir: bool) -> i32 {
    let extension = path
        .extension()
        .map(|extension| extension.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if !matches!(extension.as_str(), "ico" | "png") {
        return 0;
    }

    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let matches_executable = !executable_stem.is_empty() && file_name.contains(executable_stem);
    if broad_dir && !matches_executable {
        return 0;
    }

    let mut score = 0;
    if matches_executable {
        score += 110;
    }
    if file_name.contains("appicon") {
        score += 90;
    }
    if file_name.contains("icon") {
        score += 80;
    }
    if file_name.contains("logo") {
        score += 70;
    }
    if file_name.contains("square") {
        score += 55;
    }
    if file_name.contains("codex") {
        score += 45;
    }
    if extension == "ico" {
        score += 10;
    }

    score
}

fn is_broad_icon_search_dir(dir: &Path) -> bool {
    let name = dir
        .file_name()
        .map(|name| name.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    matches!(
        name.as_str(),
        "temp" | "tmp" | "windowsapps" | "program files" | "program files (x86)"
    )
}

fn package_icon_candidates(path: &Path) -> Vec<PathBuf> {
    package_icon_candidates_for_roots(path, &default_package_roots_for_path(path))
}

#[cfg(target_os = "windows")]
fn default_package_roots_for_path(path: &Path) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let mut seen = HashSet::new();
    if let Some(root) = windowsapps_root_from_path(path) {
        if seen.insert(root.clone()) {
            roots.push(root);
        }
    }
    for variable in ["ProgramFiles", "ProgramW6432"] {
        if let Some(root) = std::env::var_os(variable).map(PathBuf::from) {
            let windows_apps = root.join("WindowsApps");
            if seen.insert(windows_apps.clone()) {
                roots.push(windows_apps);
            }
        }
    }
    let fallback = PathBuf::from(r"C:\Program Files\WindowsApps");
    if seen.insert(fallback.clone()) {
        roots.push(fallback);
    }
    roots
}

#[cfg(not(target_os = "windows"))]
fn default_package_roots_for_path(_path: &Path) -> Vec<PathBuf> {
    Vec::new()
}

fn package_icon_candidates_for_roots(path: &Path, package_roots: &[PathBuf]) -> Vec<PathBuf> {
    let package_prefixes = inferred_package_prefixes(path);
    if package_prefixes.is_empty() {
        return Vec::new();
    }
    let executable_stem = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let mut packages = Vec::new();
    for root in package_roots {
        let Ok(entries) = std::fs::read_dir(root) else {
            continue;
        };
        for entry in entries.flatten() {
            let package_dir = entry.path();
            let name = package_dir
                .file_name()
                .map(|name| name.to_string_lossy().to_lowercase())
                .unwrap_or_default();
            if package_prefixes
                .iter()
                .any(|prefix| name.starts_with(&format!("{}_", prefix)))
                && package_dir.is_dir()
            {
                packages.push(package_dir);
            }
        }
    }

    packages.sort_by(|left, right| right.file_name().cmp(&left.file_name()));

    let mut candidates = Vec::new();
    let mut seen = HashSet::new();
    for package_dir in packages {
        let preferred_candidates = [
            package_dir.join("assets").join("icon.png"),
            package_dir.join("assets").join("Square150x150Logo.png"),
            package_dir.join("assets").join("Square44x44Logo.png"),
            package_dir.join("app").join("resources").join("icon.ico"),
            package_dir.join("app").join("resources").join("icon.png"),
            package_dir.join("resources").join("icon.ico"),
            package_dir.join("resources").join("icon.png"),
        ];
        for candidate in preferred_candidates {
            if candidate.exists() && seen.insert(candidate.clone()) {
                candidates.push(candidate);
            }
        }
        for candidate in icon_candidates_in_dir(&package_dir, &executable_stem)
            .into_iter()
            .chain(icon_candidates_in_dir(
                &package_dir.join("app"),
                &executable_stem,
            ))
        {
            if candidate.exists() && seen.insert(candidate.clone()) {
                candidates.push(candidate);
            }
        }
    }

    candidates
}

fn inferred_package_prefixes(path: &Path) -> Vec<String> {
    let segments = normal_path_segments(path);
    let mut prefixes = Vec::new();
    let mut seen = HashSet::new();

    for (index, segment) in segments.iter().enumerate() {
        if segment.eq_ignore_ascii_case("windowsapps") {
            if let Some(package_name) = segments.get(index + 1) {
                if let Some(prefix) = package_name.split('_').next() {
                    push_package_prefix(prefix, &mut prefixes, &mut seen);
                }
            }
        }
    }

    for pair in segments.windows(2) {
        let left = package_name_part(&pair[0]);
        let right = package_name_part(&pair[1]);
        if let (Some(left), Some(right)) = (left, right) {
            push_package_prefix(&format!("{left}.{right}"), &mut prefixes, &mut seen);
        }
    }

    prefixes
}

fn normal_path_segments(path: &Path) -> Vec<String> {
    path.components()
        .filter_map(|component| match component {
            std::path::Component::Normal(value) => Some(value.to_string_lossy().to_string()),
            _ => None,
        })
        .collect()
}

fn package_name_part(segment: &str) -> Option<String> {
    let normalized = segment.trim();
    if normalized.is_empty() {
        return None;
    }
    let lower = normalized.to_lowercase();
    if matches!(
        lower.as_str(),
        "users"
            | "appdata"
            | "local"
            | "roaming"
            | "program files"
            | "program files (x86)"
            | "windowsapps"
            | "programs"
            | "bin"
            | "app"
            | "resources"
            | "assets"
    ) || lower.ends_with(".exe")
        || looks_like_hash_segment(&lower)
    {
        return None;
    }

    let part = normalized
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect::<String>();
    (!part.is_empty()).then_some(part)
}

fn looks_like_hash_segment(segment: &str) -> bool {
    segment.len() >= 8
        && segment
            .chars()
            .all(|character| character.is_ascii_hexdigit())
}

fn push_package_prefix(prefix: &str, prefixes: &mut Vec<String>, seen: &mut HashSet<String>) {
    let normalized = prefix.trim().to_lowercase();
    if normalized.is_empty() || !normalized.contains('.') {
        return;
    }
    if seen.insert(normalized.clone()) {
        prefixes.push(normalized);
    }
}

fn windowsapps_root_from_path(path: &Path) -> Option<PathBuf> {
    let mut root = PathBuf::new();
    for component in path.components() {
        root.push(component.as_os_str());
        if component
            .as_os_str()
            .to_string_lossy()
            .eq_ignore_ascii_case("windowsapps")
        {
            return Some(root);
        }
    }

    None
}

fn encode_rgba_png(rgba: &[u8], width: u32, height: u32) -> Option<Vec<u8>> {
    use image::{codecs::png::PngEncoder, ColorType, ImageEncoder};

    let mut png = Vec::new();
    PngEncoder::new(&mut png)
        .write_image(rgba, width, height, ColorType::Rgba8.into())
        .ok()?;
    Some(png)
}

#[cfg(target_os = "windows")]
fn extract_native_icon_png(executable_path: &str) -> Option<Vec<u8>> {
    use std::ffi::OsStr;
    use std::mem::{size_of, zeroed};
    use std::os::windows::ffi::OsStrExt;
    use std::ptr::null_mut;
    use windows_sys::Win32::Graphics::Gdi::{
        CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, SelectObject, BITMAPINFO,
        BITMAPINFOHEADER, DIB_RGB_COLORS,
    };
    use windows_sys::Win32::UI::Shell::{ExtractIconExW, SHDefExtractIconW};
    use windows_sys::Win32::UI::WindowsAndMessaging::{DestroyIcon, DrawIconEx, DI_NORMAL};

    if !looks_like_windows_executable(Path::new(executable_path)) {
        return None;
    }

    let wide_path = OsStr::new(executable_path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let icon_count = unsafe { ExtractIconExW(wide_path.as_ptr(), -1, null_mut(), null_mut(), 0) };
    if icon_count == 0 {
        return None;
    }

    let extract_size = largest_embedded_icon_size(&wide_path)
        .unwrap_or(NATIVE_EXTRACT_SIZE)
        .clamp(16, NATIVE_EXTRACT_SIZE);
    let mut icon = null_mut();
    let result = unsafe {
        SHDefExtractIconW(
            wide_path.as_ptr(),
            0,
            0,
            &mut icon,
            null_mut(),
            extract_size,
        )
    };
    if result != 0 || icon.is_null() {
        return None;
    }

    let size = extract_size as i32;
    let bitmap_info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: size,
            biHeight: -size,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: 0,
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        },
        bmiColors: [unsafe { zeroed() }],
    };
    let mut bits = null_mut();

    let memory_dc = unsafe { CreateCompatibleDC(null_mut()) };
    if memory_dc.is_null() {
        unsafe {
            DestroyIcon(icon);
        }
        return None;
    }

    let bitmap = unsafe {
        CreateDIBSection(
            memory_dc,
            &bitmap_info,
            DIB_RGB_COLORS,
            &mut bits,
            null_mut(),
            0,
        )
    };
    if bitmap.is_null() || bits.is_null() {
        unsafe {
            DeleteDC(memory_dc);
            DestroyIcon(icon);
        }
        return None;
    }

    let old_object = unsafe { SelectObject(memory_dc, bitmap) };
    let byte_len = (size * size * 4) as usize;
    let draw_on = |background: u8| -> Option<Vec<u8>> {
        unsafe {
            std::ptr::write_bytes(bits.cast::<u8>(), background, byte_len);
            if DrawIconEx(memory_dc, 0, 0, icon, size, size, 0, null_mut(), DI_NORMAL) == 0 {
                return None;
            }
            Some(std::slice::from_raw_parts(bits.cast::<u8>(), byte_len).to_vec())
        }
    };
    let on_black = draw_on(0);
    // Legacy icons have no alpha channel; drawing them on white as well shows
    // which pixels their mask leaves transparent.
    let on_white = on_black
        .as_deref()
        .filter(|pixels| !has_alpha_channel(pixels))
        .and_then(|_| draw_on(0xff));

    unsafe {
        SelectObject(memory_dc, old_object);
        DeleteObject(bitmap);
        DeleteDC(memory_dc);
        DestroyIcon(icon);
    }

    let rgba = drawn_icon_to_premultiplied_rgba(&on_black?, on_white.as_deref())?;
    premultiplied_rgba_to_icon_png(rgba, extract_size, extract_size)
}

/// Width of the largest image in the executable's first icon group: the one
/// `SHDefExtractIconW` index 0 reads.
#[cfg(target_os = "windows")]
fn largest_embedded_icon_size(wide_path: &[u16]) -> Option<u32> {
    use windows_sys::core::PCWSTR;
    use windows_sys::Win32::Foundation::{FreeLibrary, BOOL, HMODULE};
    use windows_sys::Win32::System::LibraryLoader::{
        EnumResourceNamesW, FindResourceW, LoadLibraryExW, LoadResource, LockResource,
        SizeofResource, LOAD_LIBRARY_AS_DATAFILE, LOAD_LIBRARY_AS_IMAGE_RESOURCE,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::RT_GROUP_ICON;

    unsafe extern "system" fn first_group(
        module: HMODULE,
        _kind: PCWSTR,
        name: PCWSTR,
        result: isize,
    ) -> BOOL {
        let resource = FindResourceW(module, name, RT_GROUP_ICON);
        let data = LockResource(LoadResource(module, resource));
        if !resource.is_null() && !data.is_null() {
            let len = SizeofResource(module, resource) as usize;
            let directory = std::slice::from_raw_parts(data.cast::<u8>(), len);
            *(result as *mut Option<u32>) = largest_icon_in_group(directory);
        }
        0 // Stop after the first group.
    }

    let module = unsafe {
        LoadLibraryExW(
            wide_path.as_ptr(),
            std::ptr::null_mut(),
            LOAD_LIBRARY_AS_DATAFILE | LOAD_LIBRARY_AS_IMAGE_RESOURCE,
        )
    };
    if module.is_null() {
        return None;
    }
    let mut largest: Option<u32> = None;
    unsafe {
        EnumResourceNamesW(
            module,
            RT_GROUP_ICON,
            Some(first_group),
            &mut largest as *mut Option<u32> as isize,
        );
        FreeLibrary(module);
    }
    largest
}

/// Parses a GRPICONDIR: a 6-byte header with the entry count at offset 4,
/// then 14-byte entries starting with the width (0 means 256).
fn largest_icon_in_group(directory: &[u8]) -> Option<u32> {
    let count = usize::from(u16::from_le_bytes([*directory.get(4)?, *directory.get(5)?]));
    (0..count)
        .filter_map(|index| directory.get(6 + index * 14))
        .map(|&width| if width == 0 { 256 } else { u32::from(width) })
        .max()
}

fn has_alpha_channel(bgra: &[u8]) -> bool {
    bgra.chunks_exact(4).any(|pixel| pixel[3] != 0)
}

/// Converts an icon drawn by `DrawIconEx` to premultiplied RGBA. On a black
/// background an icon with an alpha channel leaves premultiplied colour and its
/// alpha. A legacy masked icon leaves alpha at 0, so its coverage comes from the
/// copy drawn on white: transparent pixels turn white there, while opaque ones
/// (black outlines included) stay the same. Returns `None` for a blank icon.
fn drawn_icon_to_premultiplied_rgba(on_black: &[u8], on_white: Option<&[u8]>) -> Option<Vec<u8>> {
    let mut rgba = Vec::with_capacity(on_black.len());
    for (index, pixel) in on_black.chunks_exact(4).enumerate() {
        let alpha = match on_white {
            Some(on_white) if !has_alpha_channel(on_black) => {
                let white = on_white.get(index * 4..index * 4 + 3)?;
                let shown = pixel[..3]
                    .iter()
                    .zip(white)
                    .map(|(black, white)| white.saturating_sub(*black))
                    .max()
                    .unwrap_or(0);
                255 - shown
            }
            _ => pixel[3],
        };
        if alpha == 0 {
            rgba.extend_from_slice(&[0, 0, 0, 0]);
        } else {
            rgba.extend_from_slice(&[pixel[2], pixel[1], pixel[0], alpha]);
        }
    }
    rgba.chunks_exact(4)
        .any(|pixel| pixel[3] != 0)
        .then_some(rgba)
}

#[cfg(target_os = "windows")]
fn looks_like_windows_executable(path: &Path) -> bool {
    use std::io::Read;

    // Only the DOS header is needed; Electron executables can be 200 MB.
    let mut header = [0u8; 2];
    std::fs::File::open(path)
        .and_then(|mut file| file.read_exact(&mut header))
        .is_ok_and(|()| header == *b"MZ")
}

#[cfg(not(target_os = "windows"))]
fn extract_native_icon_png(_executable_path: &str) -> Option<Vec<u8>> {
    None
}

#[cfg(test)]
mod alpha_tests {

    #[test]
    fn keeps_real_alpha_and_finds_the_mask_of_legacy_icons() {
        use super::drawn_icon_to_premultiplied_rgba as convert;
        // BGRA pixels: a half-covered alpha pixel, then a transparent one.
        assert_eq!(
            convert(&[1, 2, 3, 128, 0, 0, 0, 0], None),
            Some(vec![3, 2, 1, 128, 0, 0, 0, 0])
        );
        // Legacy icon: a black outline pixel, a red pixel and a masked-out one.
        let on_black = [0, 0, 0, 0, 0, 0, 200, 0, 0, 0, 0, 0];
        let on_white = [0, 0, 0, 255, 0, 0, 200, 255, 255, 255, 255, 255];
        assert_eq!(
            convert(&on_black, Some(&on_white)),
            Some(vec![0, 0, 0, 255, 200, 0, 0, 255, 0, 0, 0, 0])
        );
        assert_eq!(convert(&[0; 8], Some(&[255; 8])), None);
    }

    #[test]
    fn converts_premultiplied_edges_back_to_their_real_colour() {
        // A half-transparent white edge pixel arrives premultiplied as 128 grey.
        let mut pixels = vec![128, 128, 128, 128, 7, 7, 7, 0, 10, 20, 30, 255];
        super::unpremultiply_alpha(&mut pixels);
        assert_eq!(
            pixels,
            vec![255, 255, 255, 128, 0, 0, 0, 0, 10, 20, 30, 255]
        );

        let mut straight = vec![255, 255, 255, 128];
        super::premultiply_alpha(&mut straight);
        assert_eq!(straight, vec![128, 128, 128, 128]);
    }

    #[test]
    fn reads_the_largest_size_from_an_icon_group() {
        let entry = |width: u8| {
            let mut bytes = vec![0u8; 14];
            bytes[0] = width;
            bytes
        };
        let mut group = vec![0, 0, 1, 0, 3, 0];
        group.extend(entry(16));
        group.extend(entry(48));
        group.extend(entry(32));
        assert_eq!(super::largest_icon_in_group(&group), Some(48));
        group.extend(entry(0));
        group[4] = 4;
        assert_eq!(super::largest_icon_in_group(&group), Some(256));
        assert_eq!(super::largest_icon_in_group(&[0, 0, 1, 0]), None);
        // A count larger than the data reads only the entries present.
        assert_eq!(
            super::largest_icon_in_group(&[0, 0, 1, 0, 9, 0, 24]),
            Some(24)
        );
    }

    #[test]
    fn every_icon_is_scaled_to_the_shared_size() {
        let size = 8;
        let rgba = [128u8, 128, 128, 128].repeat((size * size) as usize);
        let png = super::premultiplied_rgba_to_icon_png(rgba, size, size).expect("png");
        let image = image::load_from_memory(&png).expect("decode").to_rgba8();
        assert_eq!(image.dimensions(), (super::ICON_SIZE, super::ICON_SIZE));
        assert_eq!(image.get_pixel(48, 48).0, [255, 255, 255, 128]);
    }
}

#[cfg(test)]
mod cors_tests {
    use super::{allowed_cors_origin, dev_server_origin, icon_response, url_origin, APP_ORIGIN};
    use std::sync::Arc;

    const DEV: Option<&str> = Some("http://localhost:1420");

    #[test]
    fn the_production_origin_matches_the_tauri_webview() {
        #[cfg(windows)]
        assert_eq!(APP_ORIGIN, "http://tauri.localhost");
        assert_eq!(
            allowed_cors_origin(Some(APP_ORIGIN), None),
            Some(APP_ORIGIN)
        );
        assert_eq!(allowed_cors_origin(Some(APP_ORIGIN), DEV), Some(APP_ORIGIN));
    }

    #[test]
    fn the_dev_server_origin_is_allowed_only_when_given() {
        assert_eq!(
            allowed_cors_origin(Some("http://localhost:1420"), DEV),
            Some("http://localhost:1420")
        );
        assert_eq!(
            allowed_cors_origin(Some("http://localhost:1420"), None),
            None
        );
    }

    #[test]
    fn other_or_missing_origins_get_no_cors_header() {
        for origin in [
            "https://tauri.localhost",
            "http://tauri.localhost.evil.example",
            "http://TAURI.localhost",
            "http://localhost:1421",
            "http://localhost",
            "http://gsticon.localhost",
            "null",
            "",
        ] {
            assert_eq!(allowed_cors_origin(Some(origin), DEV), None, "{origin}");
        }
        assert_eq!(allowed_cors_origin(None, DEV), None);
    }

    #[test]
    fn a_url_origin_is_scheme_host_and_port() {
        let dev_url = tauri::Url::parse("http://localhost:1420/").unwrap();
        assert_eq!(
            url_origin(&dev_url).as_deref(),
            Some("http://localhost:1420")
        );
        let default_port = tauri::Url::parse("http://tauri.localhost/index.html").unwrap();
        assert_eq!(
            url_origin(&default_port).as_deref(),
            Some("http://tauri.localhost")
        );
        let opaque = tauri::Url::parse("data:text/html,x").unwrap();
        assert_eq!(url_origin(&opaque), None);
    }

    #[test]
    fn the_dev_origin_is_allowed_only_when_tauri_serves_the_dev_url() {
        let dev_url = tauri::Url::parse("http://localhost:1420/").unwrap();
        let expected = cfg!(dev).then(|| "http://localhost:1420".to_string());
        assert_eq!(dev_server_origin(Some(&dev_url)), expected);
        assert_eq!(dev_server_origin(None), None);
    }

    #[test]
    fn icon_responses_carry_the_allowed_origin_and_always_vary_by_origin() {
        let icon = Some(Arc::new(b"png".to_vec()));
        let allowed = icon_response(icon.clone(), Some(APP_ORIGIN));
        assert_eq!(allowed.status(), 200);
        assert_eq!(allowed.headers()["Access-Control-Allow-Origin"], APP_ORIGIN);
        assert_eq!(allowed.headers()["Vary"], "Origin");
        assert_eq!(allowed.headers()["Content-Type"], "image/png");
        assert_eq!(allowed.body(), b"png");

        let other = icon_response(icon, None);
        assert!(other.headers().get("Access-Control-Allow-Origin").is_none());
        assert_eq!(other.headers()["Vary"], "Origin");

        let missing = icon_response(None, Some(APP_ORIGIN));
        assert_eq!(missing.status(), 404);
        assert_eq!(missing.headers()["Access-Control-Allow-Origin"], APP_ORIGIN);
    }
}

#[cfg(test)]
mod store_tests {
    use super::{IconBytes, IconState, IconStore, PNG_SIGNATURE, RETRY_DELAY};
    use std::sync::mpsc;
    use std::time::{Duration, Instant};

    fn fake_png(_path: &str) -> Option<Vec<u8>> {
        Some(PNG_SIGNATURE.to_vec())
    }

    fn no_icon(_path: &str) -> Option<Vec<u8>> {
        None
    }

    fn key_of(url: &str) -> String {
        url.rsplit('/')
            .next()
            .unwrap()
            .trim_end_matches(".png")
            .to_owned()
    }

    fn resolve_blocking(store: &std::sync::Arc<IconStore>, key: &str) -> Option<IconBytes> {
        let (sender, receiver) = mpsc::channel();
        store.resolve(
            key,
            Box::new(move |icon| {
                let _ = sender.send(icon);
            }),
        );
        receiver
            .recv_timeout(Duration::from_secs(5))
            .expect("protocol request answered")
    }

    #[test]
    fn same_executable_shares_one_short_url_regardless_of_case() {
        let store = IconStore::new(None, fake_png);
        let url = store.url_for(r" C:\Apps\Tool.exe ").expect("url");
        assert_eq!(store.url_for(r"c:\apps\tool.EXE"), Some(url.clone()));
        assert_ne!(store.url_for(r"C:\Apps\Other.exe"), Some(url.clone()));
        assert!(url.len() < 64, "{url}");
        assert_eq!(store.url_for("  "), None);
    }

    // A restored backup can hold paths written by someone else.
    #[test]
    fn network_and_device_paths_get_no_icon_and_no_lookup() {
        let store = IconStore::new(None, fake_png);
        for path in [
            r"\\attacker.example\share\Code.exe",
            r"\\attacker.example@80\x.ico",
            "//attacker.example/share/Code.exe",
            r"\\?\UNC\attacker.example\share\Code.exe",
            r"\\.\pipe\x",
        ] {
            assert_eq!(store.url_for(path), None, "{path}");
        }
        let registry = store.lock();
        assert!(registry.keys_by_path.is_empty() && registry.entries.is_empty());
    }

    #[test]
    fn a_request_waits_for_the_lookup_and_unknown_keys_get_nothing() {
        let store = IconStore::new(None, fake_png);
        let key = key_of(&store.url_for(r"C:\Apps\Tool.exe").unwrap());
        assert_eq!(
            resolve_blocking(&store, &key).as_deref(),
            Some(&PNG_SIGNATURE.to_vec())
        );
        assert_eq!(resolve_blocking(&store, "0123456789abcdef"), None);
    }

    #[test]
    fn a_failed_lookup_is_retried_only_after_the_cooldown() {
        let store = IconStore::new(None, no_icon);
        let key = key_of(&store.url_for(r"C:\Apps\Plain.exe").unwrap());
        assert_eq!(resolve_blocking(&store, &key), None);
        assert!(matches!(
            store.lock().entries[&key].state,
            IconState::Failed(_)
        ));

        // Before the cooldown the URL stays the same and nothing is queued.
        let url = store.url_for(r"C:\Apps\Plain.exe").unwrap();
        assert!(!url.contains("retry"), "{url}");

        let expired = Instant::now()
            .checked_sub(RETRY_DELAY)
            .expect("old instant");
        store.lock().entries.get_mut(&key).unwrap().state = IconState::Failed(expired);
        let retry_url = store.url_for(r"C:\Apps\Plain.exe").unwrap();
        assert!(retry_url.ends_with(".png?retry=1"), "{retry_url}");
        assert_eq!(resolve_blocking(&store, &key), None);
        let IconState::Failed(at) = store.lock().entries[&key].state else {
            panic!("lookup should have failed again");
        };
        assert!(at > expired);
    }

    #[test]
    fn extracted_icons_survive_a_restart_through_the_disk_cache() {
        let dir = tempfile::tempdir().expect("temp dir");
        let first = IconStore::new(Some(dir.path().to_path_buf()), fake_png);
        let key = key_of(&first.url_for(r"C:\Apps\Tool.exe").unwrap());
        assert!(resolve_blocking(&first, &key).is_some());
        assert!(dir.path().join(format!("{key}.png")).exists());

        let restarted = IconStore::new(Some(dir.path().to_path_buf()), no_icon);
        restarted.url_for(r"C:\Apps\Tool.exe").unwrap();
        assert!(matches!(
            restarted.lock().entries[&key].state,
            IconState::Ready(_)
        ));
    }

    #[test]
    fn pruning_removes_only_files_written_long_ago() {
        let dir = tempfile::tempdir().expect("temp dir");
        std::fs::write(dir.path().join("a.png"), PNG_SIGNATURE).unwrap();
        let now = std::time::SystemTime::now();
        super::prune_disk_cache(dir.path(), now);
        assert!(dir.path().join("a.png").exists());
        super::prune_disk_cache(dir.path(), now + super::DISK_CACHE_MAX_AGE * 2);
        assert!(!dir.path().join("a.png").exists());
    }
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::native_icon_png_for_path;
    use std::path::Path;

    #[test]
    fn finds_packaged_icon_files_near_executable() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let app_dir = temp_dir.path().join("app");
        let resources_dir = app_dir.join("resources");
        std::fs::create_dir_all(&resources_dir).expect("resources dir");
        let executable_path = app_dir.join("Codex.exe");
        let icon_path = resources_dir.join("icon.ico");
        std::fs::write(&executable_path, []).expect("exe placeholder");
        std::fs::write(&icon_path, []).expect("icon placeholder");

        let candidates = super::explicit_icon_candidates_for_path(&executable_path);

        assert_eq!(candidates.first(), Some(&icon_path));
    }

    #[test]
    fn finds_named_logo_assets_near_executable() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let app_dir = temp_dir.path().join("app");
        let resources_dir = app_dir.join("resources");
        std::fs::create_dir_all(&resources_dir).expect("resources dir");
        let executable_path = app_dir.join("Codex.exe");
        let icon_path = resources_dir.join("codex-logo.png");
        std::fs::write(&executable_path, []).expect("exe placeholder");
        std::fs::write(&icon_path, []).expect("icon placeholder");

        let candidates = super::explicit_icon_candidates_for_path(&executable_path);

        assert!(candidates.contains(&icon_path));
    }

    #[test]
    fn lookup_order_prefers_native_executable_before_discovered_assets() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let app_dir = temp_dir.path().join("Listary");
        let images_dir = app_dir.join("Images");
        std::fs::create_dir_all(&images_dir).expect("images dir");
        let executable_path = app_dir.join("Listary.exe");
        let discovered_icon_path = images_dir.join("expand-icon.png");
        std::fs::write(&executable_path, b"MZ").expect("exe placeholder");
        std::fs::write(&discovered_icon_path, []).expect("icon placeholder");

        let steps = super::icon_lookup_steps_for_path(&executable_path);
        let native_position = steps
            .iter()
            .position(|step| step == &super::IconLookupStep::NativeExecutable)
            .expect("native step");
        let discovered_position = steps
            .iter()
            .position(|step| {
                step == &super::IconLookupStep::DiscoveredLocalFile(discovered_icon_path.clone())
            })
            .expect("discovered asset step");

        assert!(native_position < discovered_position);
    }

    #[test]
    fn finds_installed_codex_package_icon_for_local_codex_binary() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let local_codex_dir = temp_dir
            .path()
            .join("AppData")
            .join("Local")
            .join("OpenAI")
            .join("Codex")
            .join("bin")
            .join("7dea4a003bc76627");
        let package_assets_dir = temp_dir
            .path()
            .join("Program Files")
            .join("WindowsApps")
            .join("OpenAI.Codex_26.527.3686.0_x64__2p2nqsd0c76g0")
            .join("assets");
        std::fs::create_dir_all(&local_codex_dir).expect("local codex dir");
        std::fs::create_dir_all(&package_assets_dir).expect("package assets dir");
        let executable_path = local_codex_dir.join("codex.exe");
        let icon_path = package_assets_dir.join("icon.png");
        std::fs::write(&executable_path, []).expect("exe placeholder");
        std::fs::write(&icon_path, []).expect("icon placeholder");

        let candidates = super::package_icon_candidates_for_roots(
            &executable_path,
            &[temp_dir.path().join("Program Files").join("WindowsApps")],
        );

        assert_eq!(candidates.first(), Some(&icon_path));
    }

    #[test]
    fn finds_installed_package_icon_for_local_vendor_app_binary() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let local_app_dir = temp_dir
            .path()
            .join("AppData")
            .join("Local")
            .join("Acme")
            .join("Notebook")
            .join("bin")
            .join("abc123");
        let package_assets_dir = temp_dir
            .path()
            .join("Program Files")
            .join("WindowsApps")
            .join("Acme.Notebook_1.2.3.0_x64__abc")
            .join("assets");
        std::fs::create_dir_all(&local_app_dir).expect("local app dir");
        std::fs::create_dir_all(&package_assets_dir).expect("package assets dir");
        let executable_path = local_app_dir.join("notebook.exe");
        let icon_path = package_assets_dir.join("icon.png");
        std::fs::write(&executable_path, []).expect("exe placeholder");
        std::fs::write(&icon_path, []).expect("icon placeholder");

        let candidates = super::package_icon_candidates_for_roots(
            &executable_path,
            &[temp_dir.path().join("Program Files").join("WindowsApps")],
        );

        assert_eq!(candidates.first(), Some(&icon_path));
    }

    #[test]
    fn finds_current_codex_package_icon_for_stale_windowsapps_path() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let windows_apps_dir = temp_dir.path().join("Program Files").join("WindowsApps");
        let current_assets_dir = windows_apps_dir
            .join("OpenAI.Codex_26.527.3686.0_x64__2p2nqsd0c76g0")
            .join("assets");
        std::fs::create_dir_all(&current_assets_dir).expect("package assets dir");
        let stale_executable_path = windows_apps_dir
            .join("OpenAI.Codex_26.519.11010.0_x64__2p2nqsd0c76g0")
            .join("app")
            .join("Codex.exe");
        let icon_path = current_assets_dir.join("icon.png");
        std::fs::write(&icon_path, []).expect("icon placeholder");

        let candidates =
            super::package_icon_candidates_for_roots(&stale_executable_path, &[windows_apps_dir]);

        assert_eq!(candidates.first(), Some(&icon_path));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn ignores_generic_shell_icon_for_executable_without_embedded_icon() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let executable_path = temp_dir.path().join("helper.exe");
        std::fs::write(&executable_path, []).expect("exe placeholder");

        let icon = native_icon_png_for_path(&executable_path.to_string_lossy());

        assert!(icon.is_none());
    }

    #[test]
    fn reads_embedded_icon_sizes_of_real_executables() {
        use std::os::windows::ffi::OsStrExt;
        let system = Path::new(&std::env::var("WINDIR").expect("WINDIR")).join("System32");
        let size = |name: &str| {
            let wide: Vec<u16> = system
                .join(name)
                .as_os_str()
                .encode_wide()
                .chain(Some(0))
                .collect();
            super::largest_embedded_icon_size(&wide)
        };
        assert_eq!(size("notepad.exe"), Some(256));
        // An older tool with small icons only; it must not be stretched to 256.
        assert!(size("certutil.exe").is_some_and(|size| size < 256));
        assert_eq!(size("does-not-exist.exe"), None);
    }

    #[test]
    fn extracts_shell_icon_for_existing_executable() {
        let windows_dir = std::env::var("WINDIR").expect("WINDIR");
        let notepad = Path::new(&windows_dir).join("System32").join("notepad.exe");
        let png = native_icon_png_for_path(&notepad.to_string_lossy()).expect("icon");
        let image = image::load_from_memory(&png).expect("decode").to_rgba8();

        assert_eq!(image.dimensions(), (super::ICON_SIZE, super::ICON_SIZE));
        // Straight alpha: a light antialiased edge is brighter than its coverage.
        // Premultiplied output (the old dark-fringe bug) never is.
        assert!(image.pixels().any(|pixel| {
            let [red, green, blue, alpha] = pixel.0;
            alpha > 0 && alpha < 255 && red.max(green).max(blue) > alpha
        }));
    }
}
