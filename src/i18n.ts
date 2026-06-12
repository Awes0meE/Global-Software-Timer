export type DurationFormat = "decimal_hours" | "hours_minutes";

export function formatDurationZh(
  totalSeconds: number,
  durationFormat: DurationFormat = "decimal_hours",
): string {
  const normalizedSeconds = Number.isFinite(totalSeconds)
    ? Math.max(0, Math.floor(totalSeconds))
    : 0;

  if (durationFormat === "hours_minutes") {
    const totalMinutes = Math.floor(normalizedSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours <= 0) {
      return `${minutes}分钟`;
    }

    if (minutes <= 0) {
      return `${hours}小时`;
    }

    return `${hours}小时${minutes}分钟`;
  }

  const hours = normalizedSeconds / 3600;

  return `${hours.toFixed(1)}小时`;
}
