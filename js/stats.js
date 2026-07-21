// stats.js — 按分类聚合统计。durationMinutes 不落库，全部由 endTime - startTime 现算。
import { CATEGORIES } from './config.js';

export function durationMs(record) {
  return Math.max(0, record.endTime - record.startTime);
}

// 汇总一组记录，按分类分组统计：总时长(ms)、次数、平均单次时长(ms)、占比(0-1)。
export function aggregateByCategory(records) {
  const byCategory = {};
  for (const cat of CATEGORIES) {
    byCategory[cat.key] = { key: cat.key, label: cat.label, color: cat.color, totalMs: 0, count: 0 };
  }
  let totalMs = 0;
  for (const r of records) {
    const ms = durationMs(r);
    totalMs += ms;
    if (!byCategory[r.category]) {
      byCategory[r.category] = { key: r.category, label: r.category, color: '#666', totalMs: 0, count: 0 };
    }
    byCategory[r.category].totalMs += ms;
    byCategory[r.category].count += 1;
  }
  const result = Object.values(byCategory).map((entry) => ({
    ...entry,
    avgMs: entry.count > 0 ? entry.totalMs / entry.count : 0,
    ratio: totalMs > 0 ? entry.totalMs / totalMs : 0,
  }));
  return { totalMs, byCategory: result };
}

// 按 dayKey 分组，再对每组做分类聚合。用于近 7 天堆叠柱状图。
export function groupByDay(records, dayKeyOf) {
  const map = new Map();
  for (const r of records) {
    const key = dayKeyOf(r.startTime);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return map;
}
