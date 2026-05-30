export function formatDurationZh(totalSeconds: number): string {
  const normalizedSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = normalizedSeconds / 3600;

  return `${hours.toFixed(1)}小时`;
}
