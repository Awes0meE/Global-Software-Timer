export type DurationFormat = "decimal_hours" | "hours_minutes";

export interface DurationPart {
  value: string;
  unit: "小时" | "分钟";
}

/** Duration split into number/unit pairs so displays can size digits and units separately. */
export function formatDurationPartsZh(
  totalSeconds: number,
  durationFormat: DurationFormat = "decimal_hours",
): DurationPart[] {
  const normalizedSeconds = Number.isFinite(totalSeconds)
    ? Math.max(0, Math.floor(totalSeconds))
    : 0;

  if (durationFormat === "hours_minutes") {
    const totalMinutes = Math.floor(normalizedSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours <= 0) {
      return [{ value: String(minutes), unit: "分钟" }];
    }

    if (minutes <= 0) {
      return [{ value: String(hours), unit: "小时" }];
    }

    return [
      { value: String(hours), unit: "小时" },
      { value: String(minutes), unit: "分钟" },
    ];
  }

  return [{ value: (normalizedSeconds / 3600).toFixed(1), unit: "小时" }];
}

export function formatDurationZh(
  totalSeconds: number,
  durationFormat: DurationFormat = "decimal_hours",
): string {
  return formatDurationPartsZh(totalSeconds, durationFormat)
    .map((part) => `${part.value}${part.unit}`)
    .join("");
}
