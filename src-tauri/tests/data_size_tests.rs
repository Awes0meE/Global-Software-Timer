use global_software_timer_lib::restore::data_size_bytes;

#[test]
fn counts_the_database_and_its_write_ahead_log() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("global-software-timer.sqlite3");
    std::fs::write(&db, vec![0u8; 3000]).unwrap();
    assert_eq!(data_size_bytes(&db), 3000);

    std::fs::write(dir.path().join("global-software-timer.sqlite3-wal"), vec![0u8; 500]).unwrap();
    // The shared-memory index is not data and is left out.
    std::fs::write(dir.path().join("global-software-timer.sqlite3-shm"), vec![0u8; 32768]).unwrap();
    assert_eq!(data_size_bytes(&db), 3500);
}

#[test]
fn reads_a_missing_database_as_empty() {
    let dir = tempfile::tempdir().unwrap();
    assert_eq!(data_size_bytes(&dir.path().join("missing.sqlite3")), 0);
}
