// config.js — 分类定义与默认设置。全应用唯一的分类元数据来源。

export const CATEGORIES = [
  { key: 'study', label: '学习', color: '#4f9dff' },
  { key: 'work', label: '工作', color: '#ffb454' },
  { key: 'idle', label: '摆烂', color: '#8a8f98' },
];

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

export function categoryLabel(key) {
  return CATEGORY_MAP[key] ? CATEGORY_MAP[key].label : key;
}

export function categoryColor(key) {
  return CATEGORY_MAP[key] ? CATEGORY_MAP[key].color : '#666666';
}

export const DEFAULT_SETTINGS = {
  dayStartHour: 4, // 一天的边界：凌晨 4 点
};

export const DB_NAME = 'time-control';
export const DB_VERSION = 1;
export const STORE_NAME = 'records';

export const FORGOTTEN_TIMER_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 小时兜底

export const JSON_SCHEMA_VERSION = 1;
