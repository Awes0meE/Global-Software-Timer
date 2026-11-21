use chrono::{DateTime, Duration, NaiveDate, TimeZone, Utc};
use global_software_timer_lib::storage::Store;
use std::collections::HashMap;
use tempfile::NamedTempFile;

fn migrated_store() -> (NamedTempFile, Store) {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    (db_file, store)
}

fn app_id_for(store: &Store, process_name: &str) -> i64 {
    store
        .upsert_app(
            process_name,
            &format!(r"C:\Apps\{process_name}"),
            process_name,
        )
        .expect("app")
        .id
}

fn identity_for(store: &Store, process_name: &str) -> String {
    let app_id = app_id_for(store, process_name);
    store
        .upsert_software_identity_for_app(app_id)
        .expect("identity")
        .identity_key
}

fn date(year: i32, month: u32, day: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(year, month, day).unwrap()
}

fn utc(year: i32, month: u32, day: u32, hour: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(year, month, day, hour, 0, 0).unwrap()
}

#[test]
fn start_dates_are_none_on_an_empty_database() {
    let (_file, store) = migrated_store();

    assert_eq!(store.data_start_date().unwrap(), None);
    assert_eq!(store.software_detail_start_date().unwrap(), None);
}

#[test]
fn start_dates_return_the_earliest_usage_date_of_each_table() {
    let (_file, store) = migrated_store();
    let key = identity_for(&store, "chatgpt.exe");
    store
        .increment_daily_system_usage(date(2026, 11, 5), 60, 60, 60)
        .unwrap();
    store
        .increment_daily_system_usage(date(2026, 5, 29), 60, 60, 60)
        .unwrap();
    store
        .increment_daily_software_runtime_usage(date(2026, 11, 7), &key, 60, 0, utc(2026, 11, 7, 9))
        .unwrap();
    store
        .increment_daily_software_runtime_usage(date(2026, 6, 18), &key, 0, 60, utc(2026, 6, 18, 9))
        .unwrap();

    assert_eq!(store.data_start_date().unwrap(), Some(date(2026, 5, 29)));
    assert_eq!(
        store.software_detail_start_date().unwrap(),
        Some(date(2026, 6, 18))
    );
}

#[test]
fn system_usage_range_returns_only_dates_inside_the_range() {
    let (_file, store) = migrated_store();
    for (day, active) in [(1, 600), (2, 1200), (3, 1800), (4, 2400)] {
        store
            .increment_daily_system_usage(date(2026, 11, day), active * 2, active, active * 3)
            .unwrap();
    }

    let rows = store
        .daily_system_usage_range(date(2026, 11, 2), date(2026, 11, 3))
        .unwrap();

    assert_eq!(
        rows.iter()
            .map(|row| (row.date, row.active_seconds))
            .collect::<Vec<_>>(),
        vec![(date(2026, 11, 2), 1200), (date(2026, 11, 3), 1800)]
    );
    assert_eq!(rows[0].recorded_seconds, 2400);
    assert_eq!(rows[0].tracker_uptime_seconds, 3600);
}

#[test]
fn software_window_and_focus_range_sum_per_identity() {
    let (_file, store) = migrated_store();
    let key = identity_for(&store, "chatgpt.exe");
    let at = utc(2026, 11, 2, 9);
    store
        .increment_daily_software_runtime_usage(date(2026, 11, 2), &key, 3600, 900, at)
        .unwrap();
    store
        .increment_daily_software_runtime_usage(date(2026, 11, 3), &key, 1800, 0, at)
        .unwrap();
    store
        .increment_daily_software_focus_usage(date(2026, 11, 3), &key, 300)
        .unwrap();

    let window = store
        .software_window_seconds_range(date(2026, 11, 1), date(2026, 11, 3))
        .unwrap();
    let focus = store
        .software_focus_seconds_range(date(2026, 11, 1), date(2026, 11, 3))
        .unwrap();

    assert_eq!(window.get(&key), Some(&5400)); // 只算 foreground_seconds
    assert_eq!(focus.get(&key), Some(&300));
}

#[test]
fn software_window_and_focus_range_exclude_days_outside_the_range() {
    let (_file, store) = migrated_store();
    let key = identity_for(&store, "chatgpt.exe");
    let at = utc(2026, 11, 1, 9);
    for day in [1, 2, 3] {
        store
            .increment_daily_software_runtime_usage(date(2026, 11, day), &key, 100, 0, at)
            .unwrap();
        store
            .increment_daily_software_focus_usage(date(2026, 11, day), &key, 10)
            .unwrap();
    }

    let window = store
        .software_window_seconds_range(date(2026, 11, 2), date(2026, 11, 2))
        .unwrap();
    let focus = store
        .software_focus_seconds_range(date(2026, 11, 2), date(2026, 11, 2))
        .unwrap();

    assert_eq!(window, HashMap::from([(key.clone(), 100)]));
    assert_eq!(focus, HashMap::from([(key, 10)]));
}

#[test]
fn daily_recorded_bounds_range_only_counts_identities_with_window_time() {
    let (_file, store) = migrated_store();
    let windowed = identity_for(&store, "code.exe");
    let tray_only = identity_for(&store, "tray.exe");
    let day = date(2026, 11, 2);
    store
        .increment_daily_software_runtime_usage(day, &windowed, 60, 0, utc(2026, 11, 2, 9))
        .unwrap();
    store
        .increment_daily_software_runtime_usage(day, &windowed, 60, 0, utc(2026, 11, 2, 18))
        .unwrap();
    store
        .increment_daily_software_runtime_usage(day, &tray_only, 0, 60, utc(2026, 11, 2, 6))
        .unwrap();
    store
        .increment_daily_software_runtime_usage(day, &tray_only, 0, 60, utc(2026, 11, 2, 23))
        .unwrap();
    // 只有后台时间的一天不出现。
    store
        .increment_daily_software_runtime_usage(
            date(2026, 11, 3),
            &tray_only,
            0,
            60,
            utc(2026, 11, 3, 9),
        )
        .unwrap();
    // 区间外的日子不出现。
    store
        .increment_daily_software_runtime_usage(
            date(2026, 11, 5),
            &windowed,
            60,
            0,
            utc(2026, 11, 5, 9),
        )
        .unwrap();

    let bounds = store
        .daily_recorded_bounds_range(date(2026, 11, 1), date(2026, 11, 4))
        .unwrap();

    assert_eq!(
        bounds,
        vec![(day, utc(2026, 11, 2, 9), utc(2026, 11, 2, 18))]
    );
}

#[test]
fn sessions_started_between_uses_exact_utc_bounds_with_fractional_seconds() {
    let (_file, store) = migrated_store();
    let app_id = app_id_for(&store, "code.exe");
    let key = identity_for(&store, "code.exe");
    let start = utc(2026, 11, 1, 16);
    let end = utc(2026, 11, 2, 16);
    let cases = [
        (start - Duration::milliseconds(100), 1), // 起点前 0.1 秒，排除
        (start, 2),                               // 恰好在起点，包含
        (start + Duration::nanoseconds(212_314_600), 3), // 起点后小数秒，包含
        (end - Duration::nanoseconds(787_685_400), 4), // 终点前小数秒，包含
        (end, 5),                                 // 恰好在终点，排除
        (end + Duration::nanoseconds(1), 6),      // 终点后 1 纳秒，排除
    ];
    for (started_at, minutes) in cases {
        let session_id = store.start_session(app_id, started_at).unwrap();
        store
            .close_session(
                session_id,
                started_at + Duration::minutes(minutes),
                "test",
                false,
            )
            .unwrap();
    }

    let mut sessions = store.sessions_started_between(start, end).unwrap();
    sessions.sort();

    assert_eq!(
        sessions,
        vec![(key.clone(), 120), (key.clone(), 180), (key, 240)]
    );
}

#[test]
fn sessions_started_between_merges_apps_into_one_identity_and_times_open_sessions_by_heartbeat() {
    let (_file, store) = migrated_store();
    let wps = store
        .upsert_app("wps.exe", r"C:\Kingsoft\WPS Office\office6\wps.exe", "wps")
        .unwrap();
    let sheet = store
        .upsert_app("et.exe", r"C:\Kingsoft\WPS Office\office6\et.exe", "et")
        .unwrap();
    let wps_key = store
        .upsert_software_identity_for_app(wps.id)
        .unwrap()
        .identity_key;
    assert_eq!(
        store
            .upsert_software_identity_for_app(sheet.id)
            .unwrap()
            .identity_key,
        wps_key
    );

    let closed_at = utc(2026, 11, 2, 9);
    let closed = store.start_session(wps.id, closed_at).unwrap();
    store
        .close_session(closed, closed_at + Duration::seconds(600), "test", false)
        .unwrap();
    let open_at = utc(2026, 11, 2, 10);
    let open = store.start_session(sheet.id, open_at).unwrap();
    store
        .heartbeat_session(open, open_at + Duration::seconds(90))
        .unwrap();

    let mut sessions = store
        .sessions_started_between(utc(2026, 11, 2, 0), utc(2026, 11, 3, 0))
        .unwrap();
    sessions.sort();

    assert_eq!(sessions, vec![(wps_key.clone(), 90), (wps_key, 600)]);
}

#[test]
fn software_focus_daily_lists_positive_days_in_date_order() {
    let (_file, store) = migrated_store();
    let code = identity_for(&store, "code.exe");
    let edge = identity_for(&store, "msedge.exe");
    store
        .increment_daily_software_focus_usage(date(2026, 11, 3), &code, 300)
        .unwrap();
    store
        .increment_daily_software_focus_usage(date(2026, 7, 1), &edge, 200)
        .unwrap();
    store
        .increment_daily_software_focus_usage(date(2026, 9, 9), &code, 100)
        .unwrap();
    store
        .increment_daily_software_focus_usage(date(2026, 8, 1), &edge, 0)
        .unwrap();

    assert_eq!(
        store.software_focus_daily().unwrap(),
        vec![
            (edge, date(2026, 7, 1), 200),
            (code.clone(), date(2026, 9, 9), 100),
            (code, date(2026, 11, 3), 300),
        ]
    );
}

#[test]
fn software_window_date_bounds_only_count_days_with_window_time_and_sum_it() {
    let (_file, store) = migrated_store();
    let code = identity_for(&store, "code.exe");
    let tray_only = identity_for(&store, "tray.exe");
    let at = utc(2026, 11, 1, 9);
    for (day, foreground, background) in [(1, 0, 100), (2, 10, 0), (5, 20, 0), (6, 0, 5)] {
        store
            .increment_daily_software_runtime_usage(
                date(2026, 11, day),
                &code,
                foreground,
                background,
                at,
            )
            .unwrap();
    }
    store
        .increment_daily_software_runtime_usage(date(2026, 11, 3), &tray_only, 0, 100, at)
        .unwrap();

    assert_eq!(
        store.software_window_date_bounds().unwrap(),
        // 累计窗口秒数只加 foreground_seconds：10 + 20
        HashMap::from([(code, (date(2026, 11, 2), date(2026, 11, 5), 30))])
    );
}

#[test]
fn software_identity_labels_return_display_name_and_representative_path() {
    let (_file, store) = migrated_store();
    let wps = store
        .upsert_app("wps.exe", r"C:\Kingsoft\WPS Office\office6\wps.exe", "wps")
        .unwrap();
    let identity = store.upsert_software_identity_for_app(wps.id).unwrap();

    let labels = store.software_identity_labels().unwrap();

    assert_eq!(
        labels.get(&identity.identity_key),
        Some(&(
            identity.display_name.clone(),
            identity.representative_executable_path.clone()
        ))
    );
}
