export function formatDurationZh(totalSeconds: number): string {
  const normalizedSeconds = Math.max(0, Math.floor(totalSeconds));

  if (normalizedSeconds > 0 && normalizedSeconds < 60) {
    return "<1分钟";
  }

  const totalMinutes = Math.floor(normalizedSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes}分钟`;
  }

  return `${hours}小时${minutes}分钟`;
}
