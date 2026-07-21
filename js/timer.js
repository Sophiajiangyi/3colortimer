// timer.js — 进行中的计时状态。存 localStorage（同步读取，冷启动第一帧就能恢复），
// 不用 IndexedDB。key: 'activeTimer'，value: {category, startTime}
import { FORGOTTEN_TIMER_THRESHOLD_MS } from './config.js';

const KEY = 'activeTimer';

export function getActiveTimer() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.startTime !== 'number' || !parsed.category) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function startTimer(category, startTime = Date.now()) {
  const active = { category, startTime };
  localStorage.setItem(KEY, JSON.stringify(active));
  return active;
}

export function clearActiveTimer() {
  localStorage.removeItem(KEY);
}

// 结束当前计时，返回可写入 IndexedDB 的记录草稿（不含 id），并清空 activeTimer。
// 若当前没有计时中的任务，返回 null。
export function endActiveTimer(endTime = Date.now()) {
  const active = getActiveTimer();
  if (!active) return null;
  clearActiveTimer();
  return {
    category: active.category,
    startTime: active.startTime,
    endTime,
    source: 'timer',
    updatedAt: Date.now(),
  };
}

// 走秒显示必须用 Date.now() - startTime 现算，绝不能用累加计数器。
export function elapsedMs(active, now = Date.now()) {
  if (!active) return 0;
  return Math.max(0, now - active.startTime);
}

export function isForgotten(active, now = Date.now()) {
  if (!active) return false;
  return elapsedMs(active, now) > FORGOTTEN_TIMER_THRESHOLD_MS;
}

export function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export function formatDurationMinutes(ms) {
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes} 分钟`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
}
