// day.js — 全应用唯一的时间归属来源。任何「今天/哪一天/近7天」的判断都必须走这里，
// 不要在 stats/charts/app 里另算。
import { getDayStartHour } from './settings.js';

function pad2(n) {
  return String(n).padStart(2, '0');
}

// 给定时间戳，返回它归属的「日界线日期」key（YYYY-MM-DD）。
// 一天从当地 dayStartHour:00 开始，到次日 dayStartHour:00 结束。
export function dayKeyOf(ts, dayStartHour = getDayStartHour()) {
  const shifted = new Date(ts - dayStartHour * 3600000);
  return `${shifted.getFullYear()}-${pad2(shifted.getMonth() + 1)}-${pad2(shifted.getDate())}`;
}

// 给定 dayKey，返回该「一天」对应的 [start, end) 毫秒时间戳范围。
export function dayRange(dayKey, dayStartHour = getDayStartHour()) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const start = new Date(y, m - 1, d, dayStartHour, 0, 0, 0).getTime();
  const end = start + 24 * 3600000;
  return { start, end };
}

export function todayKey(now = Date.now()) {
  return dayKeyOf(now);
}

export function todayRange(now = Date.now()) {
  return dayRange(todayKey(now));
}

// 把 dayKey 加/减 n 天，返回新的 dayKey（用其 range.start 加减 n*24h 再取 dayKeyOf 保证正确）。
export function shiftDayKey(dayKey, n) {
  const { start } = dayRange(dayKey);
  return dayKeyOf(start + n * 24 * 3600000 + 3600000); // 加 1h 余量避免边界浮点问题
}

// 近 7 天滚动（含今天）：返回 7 个 dayKey，旧到新排列。
export function last7DayKeys(now = Date.now()) {
  const today = todayKey(now);
  const keys = [];
  for (let i = 6; i >= 0; i--) {
    keys.push(shiftDayKey(today, -i));
  }
  return keys;
}

// 近 7 天滚动的整体时间范围 [start, end)。
export function last7DaysRange(now = Date.now()) {
  const keys = last7DayKeys(now);
  const first = dayRange(keys[0]);
  const last = dayRange(keys[keys.length - 1]);
  return { start: first.start, end: last.end };
}

// 格式化一个 dayKey 为人类可读的短日期（M/D）
export function formatDayKeyShort(dayKey) {
  const [, m, d] = dayKey.split('-');
  return `${Number(m)}/${Number(d)}`;
}
