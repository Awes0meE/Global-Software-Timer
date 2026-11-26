import { createContext, useContext } from "react";
import type { WeekStartSetting } from "./api";

/** The first day of the week as a `getDay()` index: Sunday 0, Monday 1. */
export type WeekStart = 0 | 1;

/** Provided once from `App`; Monday until the settings load, and in tests without a provider. */
export const WeekStartContext = createContext<WeekStart>(1);

export function useWeekStart(): WeekStart {
  return useContext(WeekStartContext);
}

export function weekStartFromSetting(setting: WeekStartSetting): WeekStart {
  return setting === "sunday" ? 0 : 1;
}

/** How many days `dayIndex` (a `getDay()` index) sits after the first day of the week. */
export function weekOffset(dayIndex: number, weekStart: WeekStart): number {
  return (dayIndex - weekStart + 7) % 7;
}
