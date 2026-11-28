use chrono::{NaiveDate, TimeZone, Utc};
use global_software_timer_lib::storage::{
    executable_version_key, normalize_identity_key, software_family_key, Store,
};
use rusqlite::{params, Connection};
use std::collections::HashMap;
use tempfile::NamedTempFile;

const CHATGPT_V1: &str =
    r"C:\Program Files\WindowsApps\OpenAI.Codex_26.1106.6628.0_x64__2p2nqsd0c76g0\app\ChatGPT.exe";
const CHATGPT_V2: &str =
    r"C:\Program Files\WindowsApps\OpenAI.Codex_26.1111.2228.0_x64__2p2nqsd0c76g0\app\ChatGPT.exe";

fn family(path: &str) -> String {
    software_family_key(&normalize_identity_key(path, ""))
}

#[test]
fn packaged_app_versions_share_one_family() {
    assert_eq!(family(CHATGPT_V1), family(CHATGPT_V2));
    assert_eq!(
        family(CHATGPT_V1),
        r"c:\program files\windowsapps\openai.codex_2p2nqsd0c76g0"
    );
    // Older builds of the same package shipped Codex.exe; it is the same app.
    assert_eq!(
        family(
            r"C:\Program Files\WindowsApps\OpenAI.Codex_26.519.11010.0_x64__2p2nqsd0c76g0\app\Codex.exe"
        ),
        family(CHATGPT_V2)
    );
    assert_ne!(
        family(r"C:\Program Files\WindowsApps\Sample_2.1000.1.0_x64__123456789abcd\app\sample.exe"),
        family(CHATGPT_V2)
    );
}

#[test]
fn executable_keys_ignore_versions_but_keep_package_executables_apart() {
    let key = |path: &str| executable_version_key(&normalize_identity_key(path, ""));
    assert_eq!(key(CHATGPT_V1), key(CHATGPT_V2));
    assert_eq!(
        key(CHATGPT_V2),
        r"c:\program files\windowsapps\openai.codex_2p2nqsd0c76g0\app\chatgpt.exe"
    );
    assert_ne!(
        key(r"C:\Program Files\WindowsApps\Sample_2.1000.1.0_x64__123456789abcd\app\sample.exe"),
        key(
            r"C:\Program Files\WindowsApps\Sample_2.1000.1.0_x64__123456789abcd\app\resources\worker-svc.exe"
        )
    );
}

#[test]
fn versioned_install_directories_share_one_family() {
    for (left, right) in [
        (
            r"C:\Users\me\AppData\Local\FACEIT\app-2.9.0\FACEIT.exe",
            r"C:\Users\me\AppData\Local\FACEIT\app-2.11.2\FACEIT.exe",
        ),
        (
            r"C:\Program Files\DoubaoIME\versions\v0.9.1.22\DoubaoImeSettings.exe",
            r"C:\Program Files\DoubaoIME\versions\v1.0.0.23\DoubaoImeSettings.exe",
        ),
        (
            r"C:\Program Files\miHoYo Launcher\1.16.1.364\HYP.exe",
            r"C:\Program Files\miHoYo Launcher\1.18.0.380\HYP.exe",
        ),
        (
            r"C:\Users\me\AppData\Local\OpenAI\Codex\runtimes\cua_node\57937f104cca4dc5\bin\tool.exe",
            r"C:\Users\me\AppData\Local\OpenAI\Codex\runtimes\cua_node\e4d75eceaa042f20\bin\tool.exe",
        ),
    ] {
        assert_eq!(family(left), family(right), "{left} vs {right}");
    }
}

#[test]
fn unversioned_and_distinct_paths_keep_their_keys() {
    let plain = r"D:\Software\Weixin\Weixin.exe";
    assert_eq!(family(plain), normalize_identity_key(plain, ""));
    // The file name itself is never rewritten, and different apps stay apart.
    assert_eq!(family(r"D:\Tools\1.2.exe"), r"d:\tools\1.2.exe");
    assert_ne!(
        family(r"C:\Users\me\AppData\Local\Programs\Python\Python312\python.exe"),
        family(r"C:\Users\me\AppData\Local\Programs\Python\Python313\python.exe")
    );
    assert_eq!(family("notepad.exe"), "notepad.exe");
}

#[test]
fn new_versions_of_a_running_app_join_the_existing_identity() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let v1 = store
        .upsert_app("chatgpt.exe", CHATGPT_V1, "ChatGPT")
        .expect("v1");
    let v2 = store
        .upsert_app("chatgpt.exe", CHATGPT_V2, "ChatGPT")
        .expect("v2");
    assert_ne!(v1.id, v2.id, "raw executable history stays per path");

    let identity = store
        .software_identity_key_for_app(v1.id)
        .expect("identity")
        .expect("key");
    assert_eq!(
        store
            .software_identity_key_for_app(v2.id)
            .expect("identity"),
        Some(identity.clone())
    );
    assert_eq!(
        store
            .software_identity_member_ids(&identity)
            .expect("members"),
        vec![v1.id, v2.id]
    );
}

#[test]
fn startup_folds_legacy_per_version_identities_into_one() {
    let db_file = NamedTempFile::new().expect("temp db");
    let date = NaiveDate::from_ymd_opt(2026, 11, 18).unwrap();
    let (v1_id, v2_id) = {
        let store = Store::open(db_file.path()).expect("open store");
        store.migrate().expect("migrate");
        let v1 = store
            .upsert_app("chatgpt.exe", CHATGPT_V1, "ChatGPT")
            .expect("v1");
        let v2 = store
            .upsert_app("chatgpt.exe", CHATGPT_V2, "ChatGPT")
            .expect("v2");
        (v1.id, v2.id)
    };

    // Rebuild the pre-fix layout: one identity per versioned path.
    let old_v1 = format!("app:{}", normalize_identity_key(CHATGPT_V1, ""));
    let old_v2 = format!("app:{}", normalize_identity_key(CHATGPT_V2, ""));
    {
        let conn = Connection::open(db_file.path()).expect("raw open");
        conn.execute_batch(
            "DELETE FROM software_identity_members; DELETE FROM software_identities;",
        )
        .expect("reset identities");
        for (key, app_id, opened) in [
            (&old_v1, v1_id, "2026-11-10T08:00:00+00:00"),
            (&old_v2, v2_id, "2026-11-18T08:00:00+00:00"),
        ] {
            conn.execute(
                "INSERT INTO software_identities (identity_key, display_name, process_name, representative_executable_path, last_opened_at)
                 VALUES (?1, 'ChatGPT', 'chatgpt.exe', '', ?2)",
                params![key, opened],
            )
            .expect("identity");
            conn.execute(
                "INSERT INTO software_identity_members (identity_key, app_id) VALUES (?1, ?2)",
                params![key, app_id],
            )
            .expect("member");
        }
        for (key, foreground, background, focused) in
            [(&old_v1, 3_600, 600, 1_200), (&old_v2, 1_800, 0, 900)]
        {
            conn.execute(
                "INSERT INTO daily_software_runtime_usage (usage_date, identity_key, foreground_seconds, background_seconds, first_recorded_at, last_recorded_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
                params![
                    date.to_string(),
                    key,
                    foreground,
                    background,
                    "2026-11-18T01:00:00+00:00"
                ],
            )
            .expect("runtime");
            conn.execute(
                "INSERT INTO daily_software_focus_usage VALUES (?1, ?2, ?3)",
                params![date.to_string(), key, focused],
            )
            .expect("focus");
        }
        conn.execute(
            "INSERT INTO focused_software_identities (identity_key) VALUES (?1)",
            params![old_v1],
        )
        .expect("focused mark");
    }

    let store = Store::open(db_file.path()).expect("reopen");
    store.migrate().expect("migrate folds identities");
    store.migrate().expect("folding is idempotent");

    let rows = store
        .software_page_rows(
            Utc.with_ymd_and_hms(2026, 11, 18, 0, 0, 0).unwrap(),
            Utc.with_ymd_and_hms(2026, 11, 18, 12, 0, 0).unwrap(),
            date,
            &HashMap::new(),
        )
        .expect("rows");
    assert_eq!(rows.discovered.len(), 1, "{:?}", rows.discovered);
    let row = &rows.discovered[0];
    assert_eq!(row.display_name, "ChatGPT");
    assert_eq!(row.app_ids, vec![v1_id, v2_id]);
    assert_eq!(row.mark, "focused");
    assert_eq!(row.today_foreground_seconds, 5_400);
    assert_eq!(row.today_background_seconds, 600);
    assert_eq!(row.today_focused_seconds, 2_100);
    assert_eq!(
        row.last_opened_at,
        Some(Utc.with_ymd_and_hms(2026, 11, 18, 8, 0, 0).unwrap())
    );
    assert_eq!(rows.focused.len(), 1);
    assert_eq!(
        store
            .focused_software_identity_keys()
            .expect("focused keys"),
        vec![row.identity_key.clone()]
    );
}

#[test]
fn folding_keeps_hidden_mark_when_versions_conflict_and_caps_a_day() {
    let db_file = NamedTempFile::new().expect("temp db");
    let date = NaiveDate::from_ymd_opt(2026, 11, 18).unwrap();
    let (v1_id, v2_id) = {
        let store = Store::open(db_file.path()).expect("open store");
        store.migrate().expect("migrate");
        let v1 = store
            .upsert_app("chatgpt.exe", CHATGPT_V1, "ChatGPT")
            .expect("v1");
        let v2 = store
            .upsert_app("chatgpt.exe", CHATGPT_V2, "ChatGPT")
            .expect("v2");
        (v1.id, v2.id)
    };
    let old_v1 = format!("app:{}", normalize_identity_key(CHATGPT_V1, ""));
    let old_v2 = format!("app:{}", normalize_identity_key(CHATGPT_V2, ""));
    {
        let conn = Connection::open(db_file.path()).expect("raw open");
        conn.execute_batch(
            "DELETE FROM software_identity_members; DELETE FROM software_identities;",
        )
        .expect("reset identities");
        for (key, app_id) in [(&old_v1, v1_id), (&old_v2, v2_id)] {
            conn.execute(
                "INSERT INTO software_identities (identity_key, display_name, process_name, representative_executable_path)
                 VALUES (?1, 'ChatGPT', 'chatgpt.exe', '')",
                params![key],
            )
            .expect("identity");
            conn.execute(
                "INSERT INTO software_identity_members (identity_key, app_id) VALUES (?1, ?2)",
                params![key, app_id],
            )
            .expect("member");
            conn.execute(
                "INSERT INTO daily_software_runtime_usage (usage_date, identity_key, foreground_seconds, background_seconds, first_recorded_at, last_recorded_at)
                 VALUES (?1, ?2, 80000, 0, ?3, ?3)",
                params![date.to_string(), key, "2026-11-18T01:00:00+00:00"],
            )
            .expect("runtime");
        }
        conn.execute(
            "INSERT INTO focused_software_identities (identity_key) VALUES (?1)",
            params![old_v1],
        )
        .expect("focused");
        conn.execute(
            "INSERT INTO hidden_software_identities (identity_key) VALUES (?1)",
            params![old_v2],
        )
        .expect("hidden");
    }

    let store = Store::open(db_file.path()).expect("reopen");
    store.migrate().expect("migrate");
    let rows = store
        .software_page_rows(
            Utc.with_ymd_and_hms(2026, 11, 18, 0, 0, 0).unwrap(),
            Utc.with_ymd_and_hms(2026, 11, 18, 12, 0, 0).unwrap(),
            date,
            &HashMap::new(),
        )
        .expect("rows");
    assert_eq!(rows.discovered.len(), 1);
    assert_eq!(rows.discovered[0].mark, "hidden");
    assert_eq!(rows.discovered[0].today_foreground_seconds, 86_400);
    assert!(store
        .focused_software_identity_keys()
        .expect("focused")
        .is_empty());
    assert_eq!(
        store.hidden_software_identity_keys().expect("hidden").len(),
        1
    );
}

/// A migrated database with ChatGPT's two versions under the pre-fold
/// per-version identities. Returns the file, both app ids and both old keys.
fn legacy_per_version_identities() -> (NamedTempFile, i64, String, String) {
    let db_file = NamedTempFile::new().expect("temp db");
    let (v1_id, v2_id) = {
        let store = Store::open(db_file.path()).expect("open store");
        store.migrate().expect("migrate");
        let v1 = store
            .upsert_app("chatgpt.exe", CHATGPT_V1, "ChatGPT")
            .expect("v1");
        let v2 = store
            .upsert_app("chatgpt.exe", CHATGPT_V2, "ChatGPT")
            .expect("v2");
        (v1.id, v2.id)
    };
    let old_v1 = format!("app:{}", normalize_identity_key(CHATGPT_V1, ""));
    let old_v2 = format!("app:{}", normalize_identity_key(CHATGPT_V2, ""));
    let conn = Connection::open(db_file.path()).expect("raw open");
    conn.execute_batch("DELETE FROM software_identity_members; DELETE FROM software_identities;")
        .expect("reset identities");
    for (key, app_id) in [(&old_v1, v1_id), (&old_v2, v2_id)] {
        conn.execute(
            "INSERT INTO software_identities (identity_key, display_name, process_name, representative_executable_path, last_opened_at)
             VALUES (?1, 'ChatGPT', 'chatgpt.exe', '', '2026-11-18T08:00:00+00:00')",
            params![key],
        )
        .expect("identity");
        conn.execute(
            "INSERT INTO software_identity_members (identity_key, app_id) VALUES (?1, ?2)",
            params![key, app_id],
        )
        .expect("member");
    }
    (db_file, v1_id, old_v1, old_v2)
}

#[test]
fn startup_fold_adds_tray_time_caps_it_at_background_and_keeps_unknown_days_unknown() {
    let (db_file, _, old_v1, old_v2) = legacy_per_version_identities();
    {
        let conn = Connection::open(db_file.path()).expect("raw open");
        // (date, key, window, background, tray): a plain sum, a day capped at 24 hours,
        // and a day one version recorded before tray time was kept apart.
        let rows: [(&str, &String, i64, i64, Option<i64>); 6] = [
            ("2026-11-16", &old_v1, 0, 600, Some(400)),
            ("2026-11-16", &old_v2, 0, 300, Some(200)),
            ("2026-11-17", &old_v1, 80_000, 5_000, Some(5_000)),
            ("2026-11-17", &old_v2, 0, 5_000, Some(5_000)),
            ("2026-11-18", &old_v1, 0, 100, None),
            ("2026-11-18", &old_v2, 0, 50, Some(50)),
        ];
        for (date, key, window, background, tray) in rows {
            conn.execute(
                "INSERT INTO daily_software_runtime_usage
                     (usage_date, identity_key, foreground_seconds, background_seconds, tray_seconds,
                      first_recorded_at, last_recorded_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
                params![date, key, window, background, tray, format!("{date}T01:00:00+00:00")],
            )
            .expect("runtime");
        }
    }

    let store = Store::open(db_file.path()).expect("reopen");
    store.migrate().expect("migrate");
    let conn = Connection::open(db_file.path()).expect("raw open");
    let merged: Vec<(String, i64, i64, Option<i64>)> = conn
        .prepare(
            "SELECT usage_date, foreground_seconds, background_seconds, tray_seconds
             FROM daily_software_runtime_usage ORDER BY usage_date",
        )
        .unwrap()
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    assert_eq!(
        merged,
        vec![
            ("2026-11-16".to_string(), 0, 900, Some(600)),
            ("2026-11-17".to_string(), 80_000, 6_400, Some(6_400)),
            ("2026-11-18".to_string(), 0, 150, None),
        ]
    );
}

#[test]
fn startup_fold_moves_timeline_focus_keys_to_the_new_identity() {
    let (db_file, v1_id, old_v1, old_v2) = legacy_per_version_identities();
    {
        let conn = Connection::open(db_file.path()).expect("raw open");
        for (start, end, key) in [
            (
                "2026-11-18T01:00:00.000+00:00",
                "2026-11-18T01:10:00.000+00:00",
                Some(&old_v1),
            ),
            (
                "2026-11-18T01:10:00.000+00:00",
                "2026-11-18T01:20:00.000+00:00",
                Some(&old_v2),
            ),
            (
                "2026-11-18T01:20:00.000+00:00",
                "2026-11-18T01:30:00.000+00:00",
                None,
            ),
        ] {
            conn.execute(
                "INSERT INTO timeline_segments
                     (usage_date, start_utc, end_utc, credited_seconds, focus_identity_key, is_active, start_reason)
                 VALUES ('2026-11-18', ?1, ?2, 600, ?3, 1, 'tracker_started')",
                params![start, end, key],
            )
            .expect("segment");
        }
    }

    let store = Store::open(db_file.path()).expect("reopen");
    store.migrate().expect("migrate folds identities");

    let new_key = store
        .software_identity_key_for_app(v1_id)
        .expect("identity")
        .expect("key");
    assert_ne!(new_key, old_v1);
    let conn = Connection::open(db_file.path()).expect("raw open");
    let rows = conn
        .prepare("SELECT focus_identity_key, credited_seconds FROM timeline_segments ORDER BY id")
        .expect("prepare")
        .query_map([], |r| {
            Ok((r.get::<_, Option<String>>(0)?, r.get::<_, i64>(1)?))
        })
        .expect("query")
        .collect::<Result<Vec<_>, _>>()
        .expect("rows");
    assert_eq!(
        rows,
        vec![
            (Some(new_key.clone()), 600),
            (Some(new_key), 600),
            (None, 600),
        ]
    );
}

#[test]
fn startup_fold_moves_window_spans_and_keeps_overlapping_rows() {
    let (db_file, v1_id, old_v1, old_v2) = legacy_per_version_identities();
    {
        let conn = Connection::open(db_file.path()).expect("raw open");
        for (key, start, end, seconds) in [
            (
                &old_v1,
                "2026-11-18T01:00:00.000+00:00",
                "2026-11-18T01:10:00.000+00:00",
                600,
            ),
            (
                &old_v2,
                "2026-11-18T01:05:00.000+00:00",
                "2026-11-18T01:15:00.000+00:00",
                600,
            ),
        ] {
            conn.execute(
                "INSERT INTO timeline_window_spans
                     (usage_date, identity_key, start_utc, end_utc, credited_seconds, start_reason)
                 VALUES ('2026-11-18', ?1, ?2, ?3, ?4, 'window_opened')",
                params![key, start, end, seconds],
            )
            .expect("window span");
        }
    }

    let store = Store::open(db_file.path()).expect("reopen");
    store.migrate().expect("migrate folds identities");

    let new_key = store
        .software_identity_key_for_app(v1_id)
        .expect("identity")
        .expect("key");
    let conn = Connection::open(db_file.path()).expect("raw open");
    let rows = conn
        .prepare("SELECT identity_key, start_utc, end_utc, credited_seconds FROM timeline_window_spans ORDER BY id")
        .expect("prepare")
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, i64>(3)?,
            ))
        })
        .expect("query")
        .collect::<Result<Vec<_>, _>>()
        .expect("rows");
    assert_eq!(
        rows,
        vec![
            (
                new_key.clone(),
                "2026-11-18T01:00:00.000+00:00".to_string(),
                "2026-11-18T01:10:00.000+00:00".to_string(),
                600,
            ),
            (
                new_key,
                "2026-11-18T01:05:00.000+00:00".to_string(),
                "2026-11-18T01:15:00.000+00:00".to_string(),
                600,
            ),
        ]
    );
}
