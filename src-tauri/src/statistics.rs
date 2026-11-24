//! Pure calculations behind the statistics and achievements pages.
//!
//! Everything here works on plain collections read by `storage.rs`, so the
//! boundaries can be tested without a database.

use chrono::{Duration, NaiveDate};
use std::collections::{BTreeSet, HashMap};
use thiserror::Error;

pub const MAX_RANGE_DAYS: i64 = 366;
pub const IDLE_OPEN_MIN_WINDOW_SECONDS: i64 = 5 * 3600;
pub const IDLE_OPEN_MAX_FOCUS_PERMILLE: i64 = 50; // 5%
pub const MILESTONE_HOURS: [i64; 6] = [10, 50, 100, 500, 1000, 6666];
pub const STREAK_MIN_ACTIVE_SECONDS: i64 = 5 * 60; // 当天活跃满 5 分钟算用过，2026-11-21 确认
pub const COMINGS_GOINGS_DAYS: i64 = 30;
pub const COMINGS_GOINGS_MIN_WINDOW_SECONDS: i64 = 60; // 累计窗口不满 1 分钟不计入软件来去，2026-11-21 确认
pub const HEATMAP_DAY_OPTIONS: [u32; 3] = [90, 180, 365];
pub const RANKING_LIMIT: usize = 20;
pub const MILESTONE_LIMIT: usize = 30;

const SECONDS_PER_HOUR: i64 = 3600;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum RangeError {
    #[error("range end {end} is before start {start}")]
    Reversed { start: NaiveDate, end: NaiveDate },
    #[error("range covers {days} days, more than {MAX_RANGE_DAYS}")]
    TooLong { days: i64 },
}

/// A range of local dates that includes both ends.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DateRange {
    pub start: NaiveDate,
    pub end: NaiveDate,
}

impl DateRange {
    pub fn new(start: NaiveDate, end: NaiveDate) -> Result<Self, RangeError> {
        if end < start {
            return Err(RangeError::Reversed { start, end });
        }
        let range = Self { start, end };
        let days = range.days();
        if days > MAX_RANGE_DAYS {
            return Err(RangeError::TooLong { days });
        }
        Ok(range)
    }

    pub fn days(&self) -> i64 {
        (self.end - self.start).num_days() + 1
    }

    /// The range of the same length that ends the day before this one starts.
    pub fn previous(&self) -> DateRange {
        let end = self.start - Duration::days(1);
        DateRange {
            start: end - Duration::days(self.days() - 1),
            end,
        }
    }

    pub fn dates(&self) -> impl Iterator<Item = NaiveDate> {
        self.start.iter_days().take(self.days() as usize)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RankEntry {
    pub identity_key: String,
    pub focused_seconds: i64,
    pub window_seconds: i64,
    pub previous_focused_seconds: i64,
    pub rank: u32,
    pub previous_rank: Option<u32>,
    pub is_new: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IdleOpenEntry {
    pub identity_key: String,
    pub window_seconds: i64,
    pub focused_seconds: i64,
    pub idle_seconds: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionStatEntry {
    pub identity_key: String,
    pub launch_count: u32,
    pub average_seconds: i64,
    pub longest_seconds: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Streaks {
    pub current_days: u32,
    pub current_start: Option<NaiveDate>,
    pub longest_days: u32,
    pub longest_start: Option<NaiveDate>,
    pub longest_end: Option<NaiveDate>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MilestoneEntry {
    pub identity_key: String,
    pub focused_seconds: i64,
    pub reached_hours: Option<i64>,
    pub reached_on: Option<NaiveDate>,
    pub next_hours: Option<i64>,
}

/// A software identity with the day it first or last had a window.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SoftwareDate {
    pub identity_key: String,
    pub date: NaiveDate,
}

fn seconds(map: &HashMap<String, i64>, key: &str) -> i64 {
    map.get(key).copied().unwrap_or(0)
}

/// Orders keys by focus (highest first), then display name, then identity key.
/// Identities without a label use their identity key as the name.
fn ordered_by_focus<'a>(
    keys: impl IntoIterator<Item = &'a String>,
    focus: &HashMap<String, i64>,
    display_names: &HashMap<String, String>,
) -> Vec<&'a String> {
    let mut keys: Vec<&String> = keys.into_iter().collect();
    keys.sort_by(|a, b| {
        let name_a = display_names.get(*a).unwrap_or(a);
        let name_b = display_names.get(*b).unwrap_or(b);
        seconds(focus, b)
            .cmp(&seconds(focus, a))
            .then_with(|| name_a.cmp(name_b))
            .then_with(|| a.cmp(b))
    });
    keys
}

/// Ranks software by focused time in the range.
///
/// Identities with focus or window time above zero are kept, up to
/// `RANKING_LIMIT`. Ties sort by display name, then identity key; an identity
/// without a display name uses its identity key. The previous rank comes from
/// ranking every identity with previous focus above zero the same way. When
/// the previous range is not comparable, no previous rank or "new" flag is set.
pub fn rank_software(
    current_focus: &HashMap<String, i64>,
    previous_focus: &HashMap<String, i64>,
    window: &HashMap<String, i64>,
    display_names: &HashMap<String, String>,
    comparable: bool,
) -> Vec<RankEntry> {
    let previous_ranks: HashMap<&String, u32> = if comparable {
        let ranked = previous_focus
            .iter()
            .filter(|(_, seconds)| **seconds > 0)
            .map(|(key, _)| key);
        ordered_by_focus(ranked, previous_focus, display_names)
            .into_iter()
            .zip(1..)
            .collect()
    } else {
        HashMap::new()
    };

    let candidates: BTreeSet<&String> = current_focus
        .iter()
        .chain(window.iter())
        .filter(|(_, seconds)| **seconds > 0)
        .map(|(key, _)| key)
        .collect();

    ordered_by_focus(candidates, current_focus, display_names)
        .into_iter()
        .take(RANKING_LIMIT)
        .zip(1..)
        .map(|(key, rank)| {
            let previous_rank = previous_ranks.get(key).copied();
            RankEntry {
                identity_key: key.clone(),
                focused_seconds: seconds(current_focus, key),
                window_seconds: seconds(window, key),
                previous_focused_seconds: seconds(previous_focus, key),
                rank,
                previous_rank,
                is_new: comparable && previous_rank.is_none(),
            }
        })
        .collect()
}

/// Software that had a window for at least five hours but was focused for
/// under 5% of it, sorted by the open-but-unused time.
pub fn idle_open(
    window: &HashMap<String, i64>,
    focus: &HashMap<String, i64>,
) -> Vec<IdleOpenEntry> {
    let mut rows: Vec<IdleOpenEntry> = window
        .iter()
        .filter_map(|(key, &window_seconds)| {
            let focused_seconds = seconds(focus, key);
            let qualifies = window_seconds >= IDLE_OPEN_MIN_WINDOW_SECONDS
                && focused_seconds * 1000 < window_seconds * IDLE_OPEN_MAX_FOCUS_PERMILLE;
            qualifies.then(|| IdleOpenEntry {
                identity_key: key.clone(),
                window_seconds,
                focused_seconds,
                idle_seconds: window_seconds - focused_seconds,
            })
        })
        .collect();
    rows.sort_by(|a, b| {
        b.idle_seconds
            .cmp(&a.idle_seconds)
            .then_with(|| a.identity_key.cmp(&b.identity_key))
    });
    rows
}

/// Per-identity launch count, average (rounded half up) and longest session,
/// sorted by launch count, then longest session, then identity key.
pub fn session_stats(sessions: &[(String, i64)]) -> Vec<SessionStatEntry> {
    let mut totals: HashMap<&String, (u32, i64, i64)> = HashMap::new();
    for (key, seconds) in sessions {
        let seconds = (*seconds).max(0);
        let (count, total, longest) = totals.entry(key).or_default();
        *count += 1;
        *total += seconds;
        *longest = (*longest).max(seconds);
    }

    let mut rows: Vec<SessionStatEntry> = totals
        .into_iter()
        .map(|(key, (count, total, longest))| {
            let divisor = i64::from(count);
            SessionStatEntry {
                identity_key: key.clone(),
                launch_count: count,
                average_seconds: (total + divisor / 2) / divisor,
                longest_seconds: longest,
            }
        })
        .collect();
    rows.sort_by(|a, b| {
        b.launch_count
            .cmp(&a.launch_count)
            .then_with(|| b.longest_seconds.cmp(&a.longest_seconds))
            .then_with(|| a.identity_key.cmp(&b.identity_key))
    });
    rows
}

/// Consecutive days with at least `STREAK_MIN_ACTIVE_SECONDS` of active time.
///
/// The current streak counts back from today; while today has not reached the
/// threshold yet it counts back from yesterday. Missing days break a streak.
/// When two streaks are equally long, the earlier one stays the record.
pub fn streaks(days: &[(NaiveDate, i64)], today: NaiveDate) -> Streaks {
    let qualifying: BTreeSet<NaiveDate> = days
        .iter()
        .filter(|(_, active)| *active >= STREAK_MIN_ACTIVE_SECONDS)
        .map(|(date, _)| *date)
        .collect();

    // (length, first day, last day)
    let mut longest: Option<(u32, NaiveDate, NaiveDate)> = None;
    let mut run: Option<(u32, NaiveDate, NaiveDate)> = None;
    for &date in &qualifying {
        let next = match run {
            Some((count, start, end)) if end + Duration::days(1) == date => {
                (count + 1, start, date)
            }
            _ => (1, date, date),
        };
        if longest.is_none_or(|(best, _, _)| next.0 > best) {
            longest = Some(next);
        }
        run = Some(next);
    }

    let mut cursor = if qualifying.contains(&today) {
        today
    } else {
        today - Duration::days(1)
    };
    let mut current_days = 0;
    let mut current_start = None;
    while qualifying.contains(&cursor) {
        current_days += 1;
        current_start = Some(cursor);
        cursor -= Duration::days(1);
    }

    Streaks {
        current_days,
        current_start,
        longest_days: longest.map_or(0, |(count, _, _)| count),
        longest_start: longest.map(|(_, start, _)| start),
        longest_end: longest.map(|(_, _, end)| end),
    }
}

/// Days per identity with at least `STREAK_MIN_ACTIVE_SECONDS` of focus.
///
/// Each item is one identity's focus on one day. Identities without such a
/// day are absent.
pub fn used_days<'a>(
    daily_focus: impl IntoIterator<Item = (&'a str, i64)>,
) -> HashMap<String, u32> {
    let mut days: HashMap<String, u32> = HashMap::new();
    for (key, focused_seconds) in daily_focus {
        if focused_seconds >= STREAK_MIN_ACTIVE_SECONDS {
            *days.entry(key.to_string()).or_default() += 1;
        }
    }
    days
}

/// Focus-time milestones per identity from daily focus rows.
///
/// Records the highest tier reached and the day the running total first
/// crossed it. Only identities with at least one hour of focus are returned,
/// sorted by focus (highest first), then identity key, and limited to
/// `MILESTONE_LIMIT`.
pub fn milestones(daily: &[(String, NaiveDate, i64)]) -> Vec<MilestoneEntry> {
    let mut rows: Vec<MilestoneEntry> = milestone_entries(daily)
        .into_iter()
        .filter(|entry| entry.focused_seconds >= SECONDS_PER_HOUR)
        .collect();
    rows.sort_by(|a, b| {
        b.focused_seconds
            .cmp(&a.focused_seconds)
            .then_with(|| a.identity_key.cmp(&b.identity_key))
    });
    rows.truncate(MILESTONE_LIMIT);
    rows
}

/// Every identity that reached at least one milestone tier, with the same
/// tier and reached day as `milestones`, but not limited. Sorted by tier
/// (highest first), then focus (highest first), then identity key.
pub fn reached_milestones(daily: &[(String, NaiveDate, i64)]) -> Vec<MilestoneEntry> {
    let mut rows: Vec<MilestoneEntry> = milestone_entries(daily)
        .into_iter()
        .filter(|entry| entry.reached_hours.is_some())
        .collect();
    rows.sort_by(|a, b| {
        b.reached_hours
            .cmp(&a.reached_hours)
            .then_with(|| b.focused_seconds.cmp(&a.focused_seconds))
            .then_with(|| a.identity_key.cmp(&b.identity_key))
    });
    rows
}

/// Running focus totals per identity, in no particular order.
fn milestone_entries(daily: &[(String, NaiveDate, i64)]) -> Vec<MilestoneEntry> {
    let mut sorted: Vec<&(String, NaiveDate, i64)> = daily.iter().collect();
    sorted.sort_by_key(|(_, date, _)| *date);

    let mut by_identity: HashMap<&String, MilestoneEntry> = HashMap::new();
    for (key, date, seconds) in sorted {
        let entry = by_identity.entry(key).or_insert_with(|| MilestoneEntry {
            identity_key: key.clone(),
            focused_seconds: 0,
            reached_hours: None,
            reached_on: None,
            next_hours: None,
        });
        entry.focused_seconds += seconds;
        let reached = MILESTONE_HOURS
            .into_iter()
            .rfind(|hours| entry.focused_seconds >= hours * SECONDS_PER_HOUR);
        if reached > entry.reached_hours {
            entry.reached_hours = reached;
            entry.reached_on = Some(*date);
        }
    }

    by_identity
        .into_values()
        .map(|mut entry| {
            entry.next_hours = MILESTONE_HOURS
                .into_iter()
                .find(|hours| Some(*hours) > entry.reached_hours);
            entry
        })
        .collect()
}

/// New and dormant software from each identity's first and last window day.
///
/// "Recent" means the last `COMINGS_GOINGS_DAYS` days including today. New
/// software first had a window in that period and after the software-detail
/// start day (anything seen on that day was already installed). Dormant
/// software last had a window before that period. Identities with under
/// `COMINGS_GOINGS_MIN_WINDOW_SECONDS` of all-time window time, such as
/// installers, are left out of both. Both lists put the most recent date
/// first, then sort by identity key.
pub fn comings_and_goings(
    window_bounds: &HashMap<String, (NaiveDate, NaiveDate, i64)>,
    today: NaiveDate,
    software_detail_start: NaiveDate,
) -> (Vec<SoftwareDate>, Vec<SoftwareDate>) {
    let recent_start = today - Duration::days(COMINGS_GOINGS_DAYS - 1);
    let mut new = Vec::new();
    let mut dormant = Vec::new();
    for (key, &(first, last, window_seconds)) in window_bounds {
        if window_seconds < COMINGS_GOINGS_MIN_WINDOW_SECONDS {
            continue;
        }
        if first >= recent_start && first > software_detail_start {
            new.push(SoftwareDate {
                identity_key: key.clone(),
                date: first,
            });
        }
        if last < recent_start {
            dormant.push(SoftwareDate {
                identity_key: key.clone(),
                date: last,
            });
        }
    }
    for rows in [&mut new, &mut dormant] {
        rows.sort_by(|a, b| {
            b.date
                .cmp(&a.date)
                .then_with(|| a.identity_key.cmp(&b.identity_key))
        });
    }
    (new, dormant)
}

#[cfg(test)]
mod tests {
    use super::*;

    const H: i64 = 3600;

    fn d(year: i32, month: u32, day: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(year, month, day).unwrap()
    }

    fn map(entries: &[(&str, i64)]) -> HashMap<String, i64> {
        entries
            .iter()
            .map(|(key, seconds)| (key.to_string(), *seconds))
            .collect()
    }

    fn names(entries: &[(&str, &str)]) -> HashMap<String, String> {
        entries
            .iter()
            .map(|(key, name)| (key.to_string(), name.to_string()))
            .collect()
    }

    fn active_days(entries: &[(u32, i64)]) -> Vec<(NaiveDate, i64)> {
        entries
            .iter()
            .map(|(day, seconds)| (d(2026, 11, *day), *seconds))
            .collect()
    }

    trait Keyed {
        fn key(&self) -> &str;
    }

    impl Keyed for RankEntry {
        fn key(&self) -> &str {
            &self.identity_key
        }
    }

    impl Keyed for IdleOpenEntry {
        fn key(&self) -> &str {
            &self.identity_key
        }
    }

    impl Keyed for SessionStatEntry {
        fn key(&self) -> &str {
            &self.identity_key
        }
    }

    impl Keyed for MilestoneEntry {
        fn key(&self) -> &str {
            &self.identity_key
        }
    }

    impl Keyed for SoftwareDate {
        fn key(&self) -> &str {
            &self.identity_key
        }
    }

    fn keys<T: Keyed>(rows: &[T]) -> Vec<&str> {
        rows.iter().map(Keyed::key).collect()
    }

    #[test]
    fn constants_match_the_confirmed_definitions() {
        assert_eq!(MAX_RANGE_DAYS, 366);
        assert_eq!(IDLE_OPEN_MIN_WINDOW_SECONDS, 5 * H);
        assert_eq!(IDLE_OPEN_MAX_FOCUS_PERMILLE, 50);
        assert_eq!(MILESTONE_HOURS, [10, 50, 100, 500, 1000, 6666]);
        assert_eq!(STREAK_MIN_ACTIVE_SECONDS, 300);
        assert_eq!(COMINGS_GOINGS_DAYS, 30);
        assert_eq!(COMINGS_GOINGS_MIN_WINDOW_SECONDS, 60);
        assert_eq!(HEATMAP_DAY_OPTIONS, [90, 180, 365]);
        assert_eq!(RANKING_LIMIT, 20);
        assert_eq!(MILESTONE_LIMIT, 30);
    }

    #[test]
    fn previous_range_has_the_same_length_and_ends_the_day_before() {
        let range = DateRange::new(d(2026, 11, 15), d(2026, 11, 21)).unwrap();
        assert_eq!(range.days(), 7);
        let previous = range.previous();
        assert_eq!(
            (previous.start, previous.end),
            (d(2026, 11, 8), d(2026, 11, 14))
        );
    }

    #[test]
    fn range_rejects_reversed_and_too_long_ranges() {
        assert!(DateRange::new(d(2026, 11, 21), d(2026, 11, 20)).is_err());
        assert!(DateRange::new(d(2025, 1, 1), d(2026, 11, 21)).is_err()); // > 366 天
    }

    #[test]
    fn range_accepts_a_single_day_and_exactly_366_days() {
        let single = DateRange::new(d(2026, 11, 21), d(2026, 11, 21)).unwrap();
        assert_eq!(single.days(), 1);
        assert_eq!(
            (single.previous().start, single.previous().end),
            (d(2026, 11, 20), d(2026, 11, 20))
        );

        let longest = DateRange::new(d(2025, 11, 21), d(2026, 11, 21)).unwrap();
        assert_eq!(longest.days(), 366);
        assert_eq!(
            DateRange::new(d(2025, 11, 20), d(2026, 11, 21)),
            Err(RangeError::TooLong { days: 367 })
        );
    }

    #[test]
    fn range_dates_cover_both_ends_in_order() {
        let range = DateRange::new(d(2026, 10, 30), d(2026, 11, 2)).unwrap();
        assert_eq!(
            range.dates().collect::<Vec<_>>(),
            vec![
                d(2026, 10, 30),
                d(2026, 10, 31),
                d(2026, 11, 1),
                d(2026, 11, 2)
            ]
        );
    }

    #[test]
    fn idle_open_needs_five_window_hours_and_under_five_percent_focus() {
        let window = map(&[("browser", 400 * H), ("chat", 400 * H), ("short", 4 * H)]);
        let focus = map(&[("browser", 15 * H), ("chat", 26 * H), ("short", 0)]);
        let rows = idle_open(&window, &focus);
        // browser 3.75% 上榜；chat 6.5% 不上榜；窗口不足 5 小时不上榜
        assert_eq!(keys(&rows), vec!["browser"]);
        assert_eq!(rows[0].idle_seconds, 385 * H);
    }

    #[test]
    fn idle_open_boundary_is_strictly_below_five_percent() {
        let window = map(&[("a", 100 * H), ("b", 100 * H)]);
        let focus = map(&[("a", 5 * H), ("b", 5 * H - 1)]);
        assert_eq!(keys(&idle_open(&window, &focus)), vec!["b"]);
    }

    #[test]
    fn idle_open_window_boundary_is_inclusive_and_rows_sort_by_idle_time() {
        // 恰好 5 小时窗口、没有焦点记录也上榜；按闲置时长降序
        let window = map(&[("exact", 5 * H), ("short", 5 * H - 1), ("big", 50 * H)]);
        let focus = map(&[("big", H)]);
        let rows = idle_open(&window, &focus);
        assert_eq!(keys(&rows), vec!["big", "exact"]);
        assert_eq!(
            (
                rows[0].window_seconds,
                rows[0].focused_seconds,
                rows[0].idle_seconds
            ),
            (50 * H, H, 49 * H)
        );
        assert_eq!((rows[1].focused_seconds, rows[1].idle_seconds), (0, 5 * H));
    }

    #[test]
    fn ranking_marks_new_entries_and_previous_rank() {
        let current = map(&[("a", 300), ("b", 200), ("c", 100)]);
        let previous = map(&[("b", 500), ("a", 100)]);
        let rows = rank_software(&current, &previous, &HashMap::new(), &HashMap::new(), true);
        assert_eq!(rows[0].previous_rank, Some(2)); // a：上一区间第 2，现在第 1
        assert_eq!(rows[1].previous_rank, Some(1)); // b
        assert_eq!(rows[2].previous_rank, None); // c：新上榜
        assert_eq!(
            rows.iter()
                .map(|row| (row.rank, row.is_new, row.previous_focused_seconds))
                .collect::<Vec<_>>(),
            vec![(1, false, 100), (2, false, 500), (3, true, 0)]
        );
    }

    #[test]
    fn ranking_without_comparable_previous_range_has_no_previous_ranks() {
        let rows = rank_software(
            &map(&[("a", 1)]),
            &map(&[("a", 9)]),
            &HashMap::new(),
            &HashMap::new(),
            false,
        );
        assert_eq!(rows[0].previous_rank, None);
        assert!(!rows[0].is_new); // 不可比时不标「新上榜」
    }

    #[test]
    fn ranking_keeps_identities_with_focus_or_window_and_carries_window_seconds() {
        let focus = map(&[("focused", 600), ("zero", 0)]);
        let window = map(&[("focused", 900), ("window_only", 3600), ("zero", 0)]);
        let rows = rank_software(&focus, &HashMap::new(), &window, &HashMap::new(), true);
        assert_eq!(keys(&rows), vec!["focused", "window_only"]);
        assert_eq!(
            rows.iter()
                .map(|row| (row.focused_seconds, row.window_seconds))
                .collect::<Vec<_>>(),
            vec![(600, 900), (0, 3600)]
        );
    }

    #[test]
    fn ranking_is_truncated_to_the_limit() {
        let focus: HashMap<String, i64> =
            (1..=25).map(|n| (format!("app{n:02}"), n * 60)).collect();
        let rows = rank_software(
            &focus,
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            true,
        );
        assert_eq!(rows.len(), RANKING_LIMIT);
        assert_eq!(rows[0].identity_key, "app25");
        assert_eq!(rows[RANKING_LIMIT - 1].rank, RANKING_LIMIT as u32);
        assert_eq!(rows[RANKING_LIMIT - 1].identity_key, "app06");
    }

    #[test]
    fn ranking_ties_sort_by_display_name_then_identity_key() {
        let focus = map(&[("k1", 100), ("k2", 100), ("k3", 100), ("k4", 100)]);
        // k4 没有标签时用身份键当名字；k1 与 k3 同名再按身份键
        let labels = names(&[("k1", "Zed"), ("k2", "Alpha"), ("k3", "Zed")]);
        let previous = map(&[("k1", 50), ("k2", 50), ("k3", 50), ("k4", 50)]);
        let rows = rank_software(&focus, &previous, &HashMap::new(), &labels, true);
        assert_eq!(keys(&rows), vec!["k2", "k1", "k3", "k4"]);
        // 上一区间同分时用同样的规则排名
        assert_eq!(
            rows.iter().map(|row| row.previous_rank).collect::<Vec<_>>(),
            vec![Some(1), Some(2), Some(3), Some(4)]
        );
    }

    #[test]
    fn session_stats_count_launches_round_the_average_and_keep_the_longest() {
        let sessions = vec![
            ("code".to_string(), 100),
            ("edge".to_string(), 3600),
            ("code".to_string(), 101),
            ("code".to_string(), 0),
            ("edge".to_string(), 60),
        ];
        let rows = session_stats(&sessions);
        assert_eq!(keys(&rows), vec!["code", "edge"]);
        // code：201 / 3 = 67；edge：3660 / 2 = 1830
        assert_eq!(
            rows.iter()
                .map(|row| (row.launch_count, row.average_seconds, row.longest_seconds))
                .collect::<Vec<_>>(),
            vec![(3, 67, 101), (2, 1830, 3600)]
        );
    }

    #[test]
    fn session_average_rounds_half_up() {
        let rows = session_stats(&[("a".to_string(), 1), ("a".to_string(), 2)]);
        assert_eq!(rows[0].average_seconds, 2); // 1.5 → 2
        let rows = session_stats(&[
            ("b".to_string(), 1),
            ("b".to_string(), 1),
            ("b".to_string(), 2),
        ]);
        assert_eq!(rows[0].average_seconds, 1); // 1.33 → 1
    }

    #[test]
    fn current_streak_does_not_break_while_today_is_still_running() {
        let days = active_days(&[(17, 900), (18, 900), (19, 900), (20, 900), (21, 0)]);
        let streaks = streaks(&days, d(2026, 11, 21));
        assert_eq!(streaks.current_days, 4); // 今天还没达标，从昨天往回数
        assert_eq!(streaks.current_start, Some(d(2026, 11, 17)));
    }

    #[test]
    fn days_below_threshold_break_the_streak() {
        // 299 秒差一秒不达标，300 秒恰好达标
        let days = active_days(&[(18, 900), (19, 299), (20, 300), (21, 900)]);
        let streaks = streaks(&days, d(2026, 11, 21));
        assert_eq!((streaks.current_days, streaks.longest_days), (2, 2));
    }

    #[test]
    fn missing_days_break_the_streak_and_longest_keeps_the_first_record() {
        // 1～3 日、5～7 日各连续 3 天；4 日没有数据；19 日以后断开
        let days = active_days(&[
            (1, 900),
            (2, 900),
            (3, 900),
            (5, 900),
            (6, 900),
            (7, 900),
            (18, 900),
        ]);
        let streaks = streaks(&days, d(2026, 11, 21));
        assert_eq!((streaks.current_days, streaks.current_start), (0, None));
        assert_eq!(
            (
                streaks.longest_days,
                streaks.longest_start,
                streaks.longest_end
            ),
            (3, Some(d(2026, 11, 1)), Some(d(2026, 11, 3)))
        );
    }

    #[test]
    fn streaks_on_empty_history_are_zero() {
        assert_eq!(
            streaks(&[], d(2026, 11, 21)),
            Streaks {
                current_days: 0,
                current_start: None,
                longest_days: 0,
                longest_start: None,
                longest_end: None,
            }
        );
    }

    #[test]
    fn current_streak_counts_today_once_it_qualifies() {
        let days = active_days(&[(20, 900), (21, 300)]);
        let streaks = streaks(&days, d(2026, 11, 21));
        assert_eq!(
            (streaks.current_days, streaks.current_start),
            (2, Some(d(2026, 11, 20)))
        );
        assert_eq!(streaks.longest_end, Some(d(2026, 11, 21)));
    }

    #[test]
    fn milestone_records_the_highest_tier_and_the_day_it_was_reached() {
        let daily = vec![
            ("code".into(), d(2026, 7, 1), 6 * H),
            ("code".into(), d(2026, 7, 2), 5 * H), // 累计 11 小时，跨过 10
            ("code".into(), d(2026, 7, 9), 40 * H), // 累计 51 小时，跨过 50
        ];
        let rows = milestones(&daily);
        assert_eq!(rows[0].reached_hours, Some(50));
        assert_eq!(rows[0].reached_on, Some(d(2026, 7, 9)));
        assert_eq!(rows[0].next_hours, Some(100));
        assert_eq!(rows[0].focused_seconds, 51 * H);
    }

    #[test]
    fn ultimate_milestone_has_no_next_tier() {
        let rows = milestones(&[("x".into(), d(2026, 7, 1), 6666 * H)]);
        assert_eq!(
            (rows[0].reached_hours, rows[0].next_hours),
            (Some(6666), None)
        );
    }

    #[test]
    fn milestones_keep_identities_with_at_least_one_hour_sorted_by_focus() {
        let daily = vec![
            ("tiny".into(), d(2026, 7, 1), H - 1),
            ("one".into(), d(2026, 7, 1), H),
            ("ten".into(), d(2026, 7, 1), 4 * H),
            ("ten".into(), d(2026, 7, 3), 6 * H),
        ];
        let rows = milestones(&daily);
        assert_eq!(keys(&rows), vec!["ten", "one"]);
        assert_eq!(
            (
                rows[0].reached_hours,
                rows[0].reached_on,
                rows[0].next_hours
            ),
            (Some(10), Some(d(2026, 7, 3)), Some(50))
        );
        // 不满 10 小时：未达成任何档，下一档是 10
        assert_eq!(
            (
                rows[1].reached_hours,
                rows[1].reached_on,
                rows[1].next_hours
            ),
            (None, None, Some(10))
        );
    }

    #[test]
    fn milestones_accumulate_in_date_order_even_when_input_is_unsorted() {
        let daily = vec![
            ("code".into(), d(2026, 7, 9), 5 * H),
            ("code".into(), d(2026, 7, 1), 6 * H),
        ];
        let rows = milestones(&daily);
        assert_eq!(rows[0].reached_on, Some(d(2026, 7, 9)));
    }

    #[test]
    fn milestones_are_limited() {
        let daily: Vec<(String, NaiveDate, i64)> = (1..=35)
            .map(|n| (format!("app{n:02}"), d(2026, 7, 1), n * H))
            .collect();
        let rows = milestones(&daily);
        assert_eq!(rows.len(), MILESTONE_LIMIT);
        assert_eq!(rows[0].identity_key, "app35");
    }

    #[test]
    fn used_days_count_days_with_at_least_five_minutes_of_focus() {
        // 299 秒差一秒不算，300 秒恰好算；0 秒的行（只有窗口或后台）不算
        let days = used_days([
            ("a", 299),
            ("a", 300),
            ("a", 3600),
            ("b", 0),
            ("b", 299),
            ("c", 300),
        ]);
        assert_eq!(days, HashMap::from([("a".into(), 2), ("c".into(), 1)]));
    }

    #[test]
    fn reached_milestones_keep_only_reached_tiers_without_a_limit() {
        let mut daily: Vec<(String, NaiveDate, i64)> = (1..=35)
            .map(|n| (format!("app{n:02}"), d(2026, 7, 1), 10 * H + n))
            .collect();
        daily.push(("below".into(), d(2026, 7, 1), 10 * H - 1));
        let rows = reached_milestones(&daily);
        assert_eq!(rows.len(), 35); // 不截到 MILESTONE_LIMIT；不满 10 小时的不列
        assert!(rows.iter().all(|row| row.reached_hours == Some(10)));
        assert_eq!(rows[0].identity_key, "app35"); // 同档按累计焦点降序
    }

    #[test]
    fn reached_milestones_sort_by_tier_then_focus_and_match_milestones() {
        let daily = vec![
            ("big_focus_low_tier".into(), d(2026, 7, 1), 99 * H),
            ("hundred".into(), d(2026, 7, 1), 60 * H),
            ("hundred".into(), d(2026, 7, 5), 40 * H), // 累计 100，7-5 跨过 100
            ("ten_a".into(), d(2026, 7, 2), 20 * H),
            ("ten_b".into(), d(2026, 7, 2), 20 * H),
        ];
        let rows = reached_milestones(&daily);
        assert_eq!(
            keys(&rows),
            vec!["hundred", "big_focus_low_tier", "ten_a", "ten_b"]
        );
        // 档位和达成日与成就页的 milestones 一致
        let shelf = milestones(&daily);
        for row in &rows {
            let same = shelf
                .iter()
                .find(|entry| entry.identity_key == row.identity_key)
                .unwrap();
            assert_eq!(row, same);
        }
        assert_eq!(
            (rows[0].reached_hours, rows[0].reached_on),
            (Some(100), Some(d(2026, 7, 5)))
        );
    }

    #[test]
    fn comings_and_goings_use_window_days_and_ignore_the_detail_start_day() {
        let bounds = HashMap::from([
            ("new".into(), (d(2026, 11, 10), d(2026, 11, 20), H)),
            ("old".into(), (d(2026, 6, 18), d(2026, 9, 1), H)), // 30 天以上没开窗口
            ("base".into(), (d(2026, 6, 18), d(2026, 11, 21), H)), // 明细起点那天就有，不算新
        ]);
        let (new, dormant) = comings_and_goings(&bounds, d(2026, 11, 21), d(2026, 6, 18));
        assert_eq!((keys(&new), keys(&dormant)), (vec!["new"], vec!["old"]));
        assert_eq!(new[0].date, d(2026, 11, 10)); // 新面孔带首次出现日
        assert_eq!(dormant[0].date, d(2026, 9, 1)); // 沉寂软件带最后出现日
    }

    #[test]
    fn comings_and_goings_window_is_the_last_thirty_days_including_today() {
        // 近 30 天 = 10-23 ～ 11-21
        let bounds = HashMap::from([
            ("first_inside".into(), (d(2026, 10, 23), d(2026, 11, 1), H)),
            ("first_outside".into(), (d(2026, 10, 22), d(2026, 11, 1), H)),
            ("last_inside".into(), (d(2026, 7, 1), d(2026, 10, 23), H)),
            ("last_outside".into(), (d(2026, 7, 1), d(2026, 10, 22), H)),
        ]);
        let (new, dormant) = comings_and_goings(&bounds, d(2026, 11, 21), d(2026, 6, 18));
        assert_eq!(
            (keys(&new), keys(&dormant)),
            (vec!["first_inside"], vec!["last_outside"])
        );
    }

    #[test]
    fn comings_and_goings_sort_by_most_recent_date_first() {
        let bounds = HashMap::from([
            ("n1".into(), (d(2026, 11, 1), d(2026, 11, 21), H)),
            ("n2".into(), (d(2026, 11, 15), d(2026, 11, 21), H)),
            ("d1".into(), (d(2026, 7, 1), d(2026, 8, 1), H)),
            ("d2".into(), (d(2026, 7, 1), d(2026, 9, 1), H)),
        ]);
        let (new, dormant) = comings_and_goings(&bounds, d(2026, 11, 21), d(2026, 6, 18));
        assert_eq!(
            (keys(&new), keys(&dormant)),
            (vec!["n2", "n1"], vec!["d2", "d1"])
        );
    }

    #[test]
    fn comings_and_goings_skip_software_with_under_a_minute_of_window_time() {
        // 累计窗口 59 秒不计入，60 秒恰好计入；新面孔和沉寂两边都看
        let bounds = HashMap::from([
            ("new_59".into(), (d(2026, 11, 10), d(2026, 11, 10), 59)),
            ("new_60".into(), (d(2026, 11, 10), d(2026, 11, 10), 60)),
            ("old_59".into(), (d(2026, 7, 1), d(2026, 7, 1), 59)),
            ("old_60".into(), (d(2026, 7, 1), d(2026, 7, 1), 60)),
        ]);
        let (new, dormant) = comings_and_goings(&bounds, d(2026, 11, 21), d(2026, 6, 18));
        assert_eq!(
            (keys(&new), keys(&dormant)),
            (vec!["new_60"], vec!["old_60"])
        );
    }
}
