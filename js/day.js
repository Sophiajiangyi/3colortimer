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

// ---------- 月 ----------

// 给定时间戳，返回它归属的月 key（YYYY-MM）。跟 dayKeyOf 一样先按 dayStartHour 偏移，
// 保证月份边界落在「当月第一天 dayStartHour:00」而不是自然日历 00:00。
export function monthKeyOf(ts, dayStartHour = getDayStartHour()) {
  const shifted = new Date(ts - dayStartHour * 3600000);
  return `${shifted.getFullYear()}-${pad2(shifted.getMonth() + 1)}`;
}

// 给定 monthKey，返回该月的 [start, end) 毫秒时间戳范围：当月 1 日 dayStartHour:00 到下月 1 日 dayStartHour:00。
export function monthRange(monthKey, dayStartHour = getDayStartHour()) {
  const [y, m] = monthKey.split('-').map(Number);
  const start = new Date(y, m - 1, 1, dayStartHour, 0, 0, 0).getTime();
  const end = new Date(y, m, 1, dayStartHour, 0, 0, 0).getTime();
  return { start, end };
}

// 把 monthKey 加/减 n 个月。
export function shiftMonthKey(monthKey, n) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1, 12, 0, 0, 0); // 用中午避免 DST 边界问题
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

// 该月每一天的 dayKey 列表（用于月视图柱状图分桶）。
export function daysInMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const count = new Date(y, m, 0).getDate(); // 当月天数
  return Array.from({ length: count }, (_, i) => `${y}-${pad2(m)}-${pad2(i + 1)}`);
}

export function formatMonthKeyLong(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return `${y}年${m}月`;
}

export function formatMonthKeyShort(monthKey) {
  const [, m] = monthKey.split('-');
  return `${Number(m)}月`;
}

// ---------- 季度 ----------

export function quarterKeyOf(ts, dayStartHour = getDayStartHour()) {
  const shifted = new Date(ts - dayStartHour * 3600000);
  const q = Math.floor(shifted.getMonth() / 3) + 1;
  return `${shifted.getFullYear()}-Q${q}`;
}

// 给定 quarterKey，返回该季度的 [start, end) 毫秒时间戳范围。
export function quarterRange(quarterKey, dayStartHour = getDayStartHour()) {
  const [yStr, qStr] = quarterKey.split('-Q');
  const y = Number(yStr);
  const q = Number(qStr);
  const startMonth = (q - 1) * 3;
  const start = new Date(y, startMonth, 1, dayStartHour, 0, 0, 0).getTime();
  const end = new Date(y, startMonth + 3, 1, dayStartHour, 0, 0, 0).getTime();
  return { start, end };
}

// 把 quarterKey 加/减 n 个季度。
export function shiftQuarterKey(quarterKey, n) {
  const [yStr, qStr] = quarterKey.split('-Q');
  const y = Number(yStr);
  const q = Number(qStr);
  const totalQ = y * 4 + (q - 1) + n;
  const y2 = Math.floor(totalQ / 4);
  const q2 = (totalQ % 4) + 1;
  return `${y2}-Q${q2}`;
}

// 从季度起点开始按 7 天一段切分（不追究 ISO 周定义，最后一段可能不足 7 天）。
// 返回 [{key, start, end}, ...]，key 用桶起始日的 dayKey（也可直接喂给 formatDayKeyShort 做 x 轴标签）。
export function weeksInQuarter(quarterKey, dayStartHour = getDayStartHour()) {
  const { start, end } = quarterRange(quarterKey, dayStartHour);
  const buckets = [];
  let cursorKey = dayKeyOf(start, dayStartHour);
  let cursorStart = start;
  while (cursorStart < end) {
    const nextKey = shiftDayKey(cursorKey, 7);
    const nextStart = dayRange(nextKey, dayStartHour).start;
    const bucketEnd = Math.min(nextStart, end);
    buckets.push({ key: cursorKey, start: cursorStart, end: bucketEnd });
    cursorKey = nextKey;
    cursorStart = nextStart;
  }
  return buckets;
}

export function formatQuarterKeyLong(quarterKey) {
  const [yStr, qStr] = quarterKey.split('-Q');
  return `${yStr}年第${qStr}季度`;
}

// ---------- 年 ----------

export function yearKeyOf(ts, dayStartHour = getDayStartHour()) {
  const shifted = new Date(ts - dayStartHour * 3600000);
  return `${shifted.getFullYear()}`;
}

// 给定 yearKey，返回该年的 [start, end) 毫秒时间戳范围。
export function yearRange(yearKey, dayStartHour = getDayStartHour()) {
  const y = Number(yearKey);
  const start = new Date(y, 0, 1, dayStartHour, 0, 0, 0).getTime();
  const end = new Date(y + 1, 0, 1, dayStartHour, 0, 0, 0).getTime();
  return { start, end };
}

// 把 yearKey 加/减 n 年。
export function shiftYearKey(yearKey, n) {
  return String(Number(yearKey) + n);
}

// 该年 12 个 monthKey（用于年视图柱状图分桶）。
export function monthsInYear(yearKey) {
  const y = Number(yearKey);
  return Array.from({ length: 12 }, (_, i) => `${y}-${pad2(i + 1)}`);
}

export function formatYearKeyLong(yearKey) {
  return `${yearKey}年`;
}
