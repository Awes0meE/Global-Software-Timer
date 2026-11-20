use chrono::{TimeZone, Utc};
use global_software_timer_lib::activity::ActivitySource;
use global_software_timer_lib::process_source::{ProcessSnapshot, ProcessSource};
use global_software_timer_lib::storage::Store;
use global_software_timer_lib::tracker::{run_tracker_tick, Tracker};
use std::time::Duration;
use tempfile::NamedTempFile;

struct SampleProcess;
impl ProcessSource for SampleProcess {
    fn snapshot(&mut self) -> Vec<ProcessSnapshot> {
        vec![ProcessSnapshot {
            pid: 42,
            process_name: "Studio.exe".into(),
            executable_path: r"X:\Fixtures\Studio.exe".into(),
            has_visible_window: true,
            ..Default::default()
        }]
    }
}

impl ActivitySource for SampleProcess {
    fn idle_duration(&self) -> Duration {
        Duration::ZERO
    }
}

#[test]
fn automatic_scan_rolls_back_after_panic_and_records_the_next_tick_once() {
    struct BrokenActivity;
    impl ActivitySource for BrokenActivity {
        fn idle_duration(&self) -> Duration {
            panic!("simulated activity source failure");
        }
    }
    let db = NamedTempFile::new().unwrap();
    let store = Store::open(db.path()).unwrap();
    store.migrate().unwrap();
    let source = SampleProcess;
    let mut tracker = Tracker::new(store, source);
    let now = Utc.with_ymd_and_hms(2026, 5, 29, 9, 0, 0).unwrap();
    let interval = Duration::from_secs(5);
    let threshold = Duration::from_secs(300);
    assert_eq!(tracker.last_scan_succeeded(), None);
    tracker.run_automatic_scan(|t| run_tracker_tick(t, &BrokenActivity, now, interval, threshold));
    assert_eq!(tracker.last_scan_succeeded(), Some(false));
    assert!(tracker
        .store()
        .daily_system_usage(now.date_naive())
        .unwrap()
        .is_none());
    let activity = SampleProcess;
    tracker.run_automatic_scan(|t| {
        run_tracker_tick(t, &activity, now + interval, interval, threshold)
    });
    assert_eq!(tracker.last_scan_succeeded(), Some(true));
    assert_eq!(
        tracker
            .store()
            .daily_system_usage(now.date_naive())
            .unwrap()
            .unwrap()
            .recorded_seconds,
        5
    );
}
