use global_software_timer_lib::storage::Store;

#[test]
fn package_label_and_icon_stay_with_one_member_across_scans_and_versions() {
    let dir = tempfile::tempdir().unwrap();
    for (i, order) in [[0usize, 1, 2], [2, 1, 0]].iter().enumerate() {
        let db = dir.path().join(format!("{i}.db"));
        let store = Store::open(&db).unwrap();
        store.migrate().unwrap();
        let members = [
            (
                "Studio.exe",
                r"X:\Fixtures\WindowsApps\Suite_2.0.0.0_x64__pub\app\Studio.exe",
                "Studio",
            ),
            (
                "Agent.exe",
                r"X:\Fixtures\WindowsApps\Suite_10.0.0.0_x64__pub\app\resources\Agent.exe",
                "Agent",
            ),
            (
                "Studio.exe",
                r"X:\Fixtures\WindowsApps\Suite_10.0.0.0_x64__pub\app\Studio.exe",
                "Studio",
            ),
        ];
        let mut ids = [0; 3];
        for &n in order {
            let (process, path, name) = members[n];
            ids[n] = store.upsert_app(process, path, name).unwrap().id;
        }
        drop(store);
        let store = Store::open(&db).unwrap();
        store.migrate().unwrap();
        for n in [1, 0, 2, 1] {
            let row = store.upsert_software_identity_for_app(ids[n]).unwrap();
            assert_eq!(row.display_name, "Studio");
            assert_eq!(row.process_name, "studio.exe");
            assert_eq!(row.representative_executable_path, members[2].1);
        }
    }
}
