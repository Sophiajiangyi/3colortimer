// settings.js — 设置项持久化（localStorage）。目前仅 dayStartHour。
import { DEFAULT_SETTINGS } from './config.js';

const KEY = 'settings';

export function getSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function setSettings(patch) {
  const current = getSettings();
  const next = { ...current, ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function getDayStartHour() {
  return getSettings().dayStartHour;
}
