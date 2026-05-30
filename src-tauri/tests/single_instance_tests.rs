use global_software_timer_lib::single_instance::{try_acquire_single_instance, SingleInstance};
use std::time::{SystemTime, UNIX_EPOCH};

#[test]
fn second_attempt_for_same_lock_reports_already_running() {
    let unique_name = format!(
        "Local\\GlobalSoftwareTimerTest-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos()
    );

    let first = try_acquire_single_instance(&unique_name).expect("first lock");
    assert!(matches!(first, SingleInstance::Acquired(_)));

    let second = try_acquire_single_instance(&unique_name).expect("second lock");
    assert!(matches!(second, SingleInstance::AlreadyRunning));

    drop(first);

    let third = try_acquire_single_instance(&unique_name).expect("third lock");
    assert!(matches!(third, SingleInstance::Acquired(_)));
}
