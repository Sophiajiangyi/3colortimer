// app.js — 视图渲染与事件绑定。应用入口。
import { CATEGORIES, categoryLabel, categoryColor } from './config.js';
import * as db from './db.js';
import { getSettings, setSettings } from './settings.js';
import {
  todayRange, last7DayKeys, last7DaysRange, dayKeyOf, formatDayKeyShort,
  monthKeyOf, monthRange, shiftMonthKey, daysInMonth, formatMonthKeyLong, formatMonthKeyShort,
  quarterKeyOf, quarterRange, shiftQuarterKey, weeksInQuarter, formatQuarterKeyLong,
  yearKeyOf, yearRange, shiftYearKey, monthsInYear, formatYearKeyLong,
} from './day.js';
import {
  getActiveTimer, startTimer, clearActiveTimer, endActiveTimer,
  elapsedMs, isForgotten, formatElapsed, formatDurationMinutes,
} from './timer.js';
import { durationMs, aggregateByCategory, groupByDay } from './stats.js';
import { renderSegmentedBar, renderStackedBarChart, renderLegend } from './charts.js';
import { exportCsv, exportJson, planJsonImport, applyJsonImport } from './backup.js';

// ---------- 小工具 ----------
function pad2(n) { return String(n).padStart(2, '0'); }

function toDatetimeLocalValue(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fromDatetimeLocalValue(str) {
  return new Date(str).getTime();
}

function formatTimeRange(startMs, endMs) {
  const s = new Date(startMs);
  const e = new Date(endMs);
  return `${pad2(s.getHours())}:${pad2(s.getMinutes())}–${pad2(e.getHours())}:${pad2(e.getMinutes())}`;
}

// ---------- Toast ----------
const toastContainer = document.getElementById('toast-container');

function showToast(message, { actionLabel, onAction, duration = 4000 } = {}) {
  const el = document.createElement('div');
  el.className = 'toast';
  const span = document.createElement('span');
  span.textContent = message;
  el.appendChild(span);
  let timer;
  if (actionLabel && onAction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = actionLabel;
    btn.addEventListener('click', () => {
      clearTimeout(timer);
      el.remove();
      onAction();
    });
    el.appendChild(btn);
  }
  toastContainer.appendChild(el);
  timer = setTimeout(() => el.remove(), duration);
}

// ---------- 视图切换 ----------
const views = { record: document.getElementById('view-record'), stats: document.getElementById('view-stats'), data: document.getElementById('view-data') };
let currentView = 'record';

function switchView(view) {
  currentView = view;
  for (const key of Object.keys(views)) {
    views[key].classList.toggle('hidden', key !== view);
  }
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  renderView(view);
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

async function renderView(view) {
  if (view === 'record') {
    updateTimerGrid();
    await renderTodayList();
  } else if (view === 'stats') {
    await renderStatsToday();
    await renderStatsTrend();
  } else if (view === 'data') {
    await renderDataView();
  }
}

async function refreshAll() {
  await renderView(currentView);
}

// ---------- 计时按钮 ----------
const timerGrid = document.getElementById('timer-grid');

function buildTimerGrid() {
  timerGrid.innerHTML = CATEGORIES.map((c) => `
    <button type="button" class="timer-btn" data-category="${c.key}" style="--cat-color:${c.color}">
      <span class="timer-dot"></span>
      <span class="timer-label">${c.label}</span>
      <span class="timer-elapsed" data-elapsed></span>
    </button>
  `).join('');
  timerGrid.querySelectorAll('.timer-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleTimerClick(btn.dataset.category));
  });
}

function updateTimerGrid(activeOverride) {
  const active = activeOverride !== undefined ? activeOverride : getActiveTimer();
  timerGrid.querySelectorAll('.timer-btn').forEach((btn) => {
    const cat = btn.dataset.category;
    const isActive = active && active.category === cat;
    btn.classList.toggle('active', !!isActive);
    const elapsedEl = btn.querySelector('[data-elapsed]');
    if (isActive) {
      elapsedEl.textContent = formatElapsed(elapsedMs(active));
    } else {
      elapsedEl.textContent = '';
    }
  });
}

async function handleTimerClick(category) {
  const active = getActiveTimer();
  const now = Date.now();
  if (!active) {
    startTimer(category, now);
    updateTimerGrid();
    return;
  }
  const ended = endActiveTimer(now);
  ended.id = crypto.randomUUID();
  await db.addRecord(ended);
  const label = categoryLabel(ended.category);
  const durText = formatDurationMinutes(ended.endTime - ended.startTime);
  if (active.category !== category) {
    startTimer(category, now);
  }
  showToast(`已结束 ${label} ${durText}`);
  updateTimerGrid();
  await refreshAll();
}

// ---------- 走秒 ----------
function tick() {
  const active = getActiveTimer();
  if (active) updateTimerGrid(active);
}
setInterval(tick, 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') tick();
});

// ---------- 今日列表 ----------
const recordListEl = document.getElementById('record-list');
const recordListEmptyEl = document.getElementById('record-list-empty');

async function renderTodayList() {
  const { start, end } = todayRange();
  const records = await db.rangeQuery(start, end);
  records.sort((a, b) => b.startTime - a.startTime);
  recordListEmptyEl.classList.toggle('hidden', records.length > 0);
  recordListEl.innerHTML = records.map((r) => `
    <li class="record-item" data-id="${r.id}">
      <span class="cat-dot" style="background:${categoryColor(r.category)}"></span>
      <span class="record-main">
        <div class="record-cat">${categoryLabel(r.category)}${r.source === 'manual' ? '<span class="record-source-tag">补录</span>' : ''}</div>
        <div class="record-time">${formatTimeRange(r.startTime, r.endTime)}</div>
      </span>
      <span class="record-duration">${formatDurationMinutes(durationMs(r))}</span>
    </li>
  `).join('');
  recordListEl.querySelectorAll('.record-item').forEach((li) => {
    li.addEventListener('click', () => {
      const rec = records.find((r) => r.id === li.dataset.id);
      if (rec) openEditModal(rec);
    });
  });
}

// ---------- 统计：今日 ----------
async function renderStatsToday() {
  const { start, end } = todayRange();
  const records = await db.rangeQuery(start, end);
  const { byCategory } = aggregateByCategory(records);
  document.getElementById('today-segbar').innerHTML = renderSegmentedBar(byCategory);
  document.getElementById('today-legend').innerHTML = renderLegend(byCategory);
  const tbody = document.querySelector('#today-stats-table tbody');
  tbody.innerHTML = byCategory.map((c) => `
    <tr>
      <td><span class="legend-dot" style="background:${c.color}"></span> ${c.label}</td>
      <td>${formatDurationMinutes(c.totalMs)}</td>
      <td>${c.count}</td>
      <td>${c.count > 0 ? formatDurationMinutes(c.avgMs) : '—'}</td>
    </tr>
  `).join('');
}

// ---------- 统计：趋势（近7天 / 本月 / 本季度 / 本年） ----------
let statsPeriodType = 'week7'; // 'week7' | 'month' | 'quarter' | 'year'
let statsPeriodKey = null; // 仅 month/quarter/year 有意义；null 表示尚未定，渲染时取「当前」周期

function shiftStatsPeriodKey(n) {
  if (statsPeriodType === 'month') return shiftMonthKey(statsPeriodKey, n);
  if (statsPeriodType === 'quarter') return shiftQuarterKey(statsPeriodKey, n);
  if (statsPeriodType === 'year') return shiftYearKey(statsPeriodKey, n);
  return statsPeriodKey;
}

async function renderStatsTrend() {
  const now = Date.now();
  let bucketKeys, start, end, bucketKeyFn, labelFn, titleText, showNav, canGoNext;

  if (statsPeriodType === 'month') {
    if (!statsPeriodKey) statsPeriodKey = monthKeyOf(now);
    bucketKeys = daysInMonth(statsPeriodKey);
    ({ start, end } = monthRange(statsPeriodKey));
    bucketKeyFn = dayKeyOf;
    labelFn = formatDayKeyShort;
    titleText = formatMonthKeyLong(statsPeriodKey);
    showNav = true;
    canGoNext = statsPeriodKey !== monthKeyOf(now);
  } else if (statsPeriodType === 'quarter') {
    if (!statsPeriodKey) statsPeriodKey = quarterKeyOf(now);
    const buckets = weeksInQuarter(statsPeriodKey);
    bucketKeys = buckets.map((b) => b.key);
    ({ start, end } = quarterRange(statsPeriodKey));
    bucketKeyFn = (ts) => {
      const b = buckets.find((bk) => ts >= bk.start && ts < bk.end);
      return b ? b.key : buckets[buckets.length - 1].key;
    };
    labelFn = formatDayKeyShort;
    titleText = formatQuarterKeyLong(statsPeriodKey);
    showNav = true;
    canGoNext = statsPeriodKey !== quarterKeyOf(now);
  } else if (statsPeriodType === 'year') {
    if (!statsPeriodKey) statsPeriodKey = yearKeyOf(now);
    bucketKeys = monthsInYear(statsPeriodKey);
    ({ start, end } = yearRange(statsPeriodKey));
    bucketKeyFn = monthKeyOf;
    labelFn = formatMonthKeyShort;
    titleText = formatYearKeyLong(statsPeriodKey);
    showNav = true;
    canGoNext = statsPeriodKey !== yearKeyOf(now);
  } else {
    // week7
    bucketKeys = last7DayKeys(now);
    ({ start, end } = last7DaysRange(now));
    bucketKeyFn = dayKeyOf;
    labelFn = formatDayKeyShort;
    titleText = '近7天';
    showNav = false;
    canGoNext = false;
  }

  const records = await db.rangeQuery(start, end);
  const grouped = groupByDay(records, bucketKeyFn);
  const totalsByBucket = new Map();
  for (const key of bucketKeys) {
    const bucketRecords = grouped.get(key) || [];
    const { byCategory } = aggregateByCategory(bucketRecords);
    totalsByBucket.set(key, { byCategory });
  }

  const chartEl = document.getElementById('week-chart');
  chartEl.innerHTML = renderStackedBarChart(bucketKeys, totalsByBucket, { labelFn });
  chartEl.classList.toggle('chart-wrap--scroll', bucketKeys.length > 12);
  document.getElementById('week-legend').innerHTML = renderLegend(
    CATEGORIES.map((c) => ({ ...c, totalMs: 1 }))
  );

  document.getElementById('period-title').textContent = titleText;
  const prevBtn = document.getElementById('period-prev');
  const nextBtn = document.getElementById('period-next');
  prevBtn.classList.toggle('hidden', !showNav);
  nextBtn.classList.toggle('hidden', !showNav);
  nextBtn.disabled = !canGoNext;

  document.querySelectorAll('#period-chips .chip').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.period === statsPeriodType);
  });
}

document.querySelectorAll('#period-chips .chip').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const period = btn.dataset.period;
    if (period === statsPeriodType) return;
    statsPeriodType = period;
    statsPeriodKey = null;
    await renderStatsTrend();
  });
});

document.getElementById('period-prev').addEventListener('click', async () => {
  if (statsPeriodType === 'week7') return;
  statsPeriodKey = shiftStatsPeriodKey(-1);
  await renderStatsTrend();
});

document.getElementById('period-next').addEventListener('click', async () => {
  const nextBtn = document.getElementById('period-next');
  if (statsPeriodType === 'week7' || nextBtn.disabled) return;
  statsPeriodKey = shiftStatsPeriodKey(1);
  await renderStatsTrend();
});

// ---------- 数据视图 ----------
async function renderDataView() {
  const all = await db.getAllRecords();
  document.getElementById('total-record-count').textContent = `共 ${all.length} 条记录`;
}

document.getElementById('btn-export-csv').addEventListener('click', async () => {
  await exportCsv();
  showToast('CSV 已导出');
});

document.getElementById('btn-export-json').addEventListener('click', async () => {
  await exportJson();
  showToast('JSON 已导出');
});

const importInput = document.getElementById('input-import-json');
let pendingImportRecords = null;
importInput.addEventListener('change', async () => {
  const file = importInput.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const { records, summary } = await planJsonImport(text);
    pendingImportRecords = records;
    document.getElementById('import-summary').textContent =
      `将新增 ${summary.toAdd} 条，覆盖 ${summary.toOverwrite} 条（共 ${summary.total} 条）。`;
    openModal('modal-import');
  } catch (err) {
    showToast(`导入失败：${err.message}`);
  } finally {
    importInput.value = '';
  }
});

document.getElementById('btn-import-cancel').addEventListener('click', () => {
  pendingImportRecords = null;
  closeModal('modal-import');
});

document.getElementById('btn-import-confirm').addEventListener('click', async () => {
  if (!pendingImportRecords) return;
  const count = await applyJsonImport(pendingImportRecords);
  pendingImportRecords = null;
  closeModal('modal-import');
  showToast(`已导入 ${count} 条记录`);
  await refreshAll();
});

// ---------- 设置：日界线 ----------
const dayStartSelect = document.getElementById('select-day-start-hour');
function buildDayStartOptions() {
  const current = getSettings().dayStartHour;
  dayStartSelect.innerHTML = Array.from({ length: 24 }, (_, h) =>
    `<option value="${h}" ${h === current ? 'selected' : ''}>${pad2(h)}:00</option>`
  ).join('');
}
dayStartSelect.addEventListener('change', async () => {
  setSettings({ dayStartHour: Number(dayStartSelect.value) });
  showToast('已更新一天的起始时间');
  await refreshAll();
});

document.getElementById('btn-settings').addEventListener('click', () => switchView('data'));

// ---------- 手动补录 / 编辑弹层 ----------
const modalRecord = document.getElementById('modal-record');
const formRecord = document.getElementById('form-record');
const fieldCategory = document.getElementById('field-category');
const fieldStart = document.getElementById('field-start');
const fieldEnd = document.getElementById('field-end');
const fieldDurationPreview = document.getElementById('field-duration-preview');
const fieldOverlapWarning = document.getElementById('field-overlap-warning');
const btnRecordDelete = document.getElementById('btn-record-delete');
const modalRecordTitle = document.getElementById('modal-record-title');

let recordModalMode = 'create'; // 'create' | 'edit' | 'end-active'
let editingRecord = null;

function populateCategorySelect() {
  fieldCategory.innerHTML = CATEGORIES.map((c) => `<option value="${c.key}">${c.label}</option>`).join('');
}
populateCategorySelect();

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

async function checkOverlapAndPreview() {
  const startMs = fromDatetimeLocalValue(fieldStart.value);
  const endMs = fromDatetimeLocalValue(fieldEnd.value);
  if (!startMs || !endMs || isNaN(startMs) || isNaN(endMs)) {
    fieldDurationPreview.textContent = '';
    fieldOverlapWarning.classList.add('hidden');
    return;
  }
  if (endMs <= startMs) {
    fieldDurationPreview.textContent = '结束时间需要晚于开始时间';
    fieldOverlapWarning.classList.add('hidden');
    return;
  }
  fieldDurationPreview.textContent = `时长：${formatDurationMinutes(endMs - startMs)}`;
  const all = await db.getAllRecords();
  const excludeId = editingRecord ? editingRecord.id : null;
  const overlap = all.some((r) => r.id !== excludeId && startMs < r.endTime && endMs > r.startTime);
  fieldOverlapWarning.classList.toggle('hidden', !overlap);
}
fieldStart.addEventListener('change', checkOverlapAndPreview);
fieldEnd.addEventListener('change', checkOverlapAndPreview);

function openCreateModal() {
  recordModalMode = 'create';
  editingRecord = null;
  modalRecordTitle.textContent = '手动补录';
  btnRecordDelete.classList.add('hidden');
  const now = Date.now();
  fieldCategory.value = CATEGORIES[0].key;
  fieldStart.value = toDatetimeLocalValue(now - 30 * 60000);
  fieldEnd.value = toDatetimeLocalValue(now);
  fieldOverlapWarning.classList.add('hidden');
  checkOverlapAndPreview();
  openModal('modal-record');
}

function openEditModal(record) {
  recordModalMode = 'edit';
  editingRecord = record;
  modalRecordTitle.textContent = '编辑记录';
  btnRecordDelete.classList.remove('hidden');
  fieldCategory.value = record.category;
  fieldStart.value = toDatetimeLocalValue(record.startTime);
  fieldEnd.value = toDatetimeLocalValue(record.endTime);
  fieldOverlapWarning.classList.add('hidden');
  checkOverlapAndPreview();
  openModal('modal-record');
}

function openEndActiveModal(active) {
  recordModalMode = 'end-active';
  editingRecord = null;
  modalRecordTitle.textContent = '填写结束时间';
  btnRecordDelete.classList.add('hidden');
  fieldCategory.value = active.category;
  fieldStart.value = toDatetimeLocalValue(active.startTime);
  fieldEnd.value = toDatetimeLocalValue(Date.now());
  fieldOverlapWarning.classList.add('hidden');
  checkOverlapAndPreview();
  openModal('modal-record');
}

document.getElementById('btn-add-manual').addEventListener('click', openCreateModal);
document.getElementById('btn-record-cancel').addEventListener('click', () => closeModal('modal-record'));

formRecord.addEventListener('submit', async (e) => {
  e.preventDefault();
  const category = fieldCategory.value;
  const startMs = fromDatetimeLocalValue(fieldStart.value);
  const endMs = fromDatetimeLocalValue(fieldEnd.value);
  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) {
    showToast('结束时间需要晚于开始时间');
    return;
  }
  if (recordModalMode === 'create') {
    await db.addRecord({
      id: crypto.randomUUID(), category, startTime: startMs, endTime: endMs,
      source: 'manual', updatedAt: Date.now(),
    });
    showToast('已保存');
  } else if (recordModalMode === 'edit') {
    await db.updateRecord({
      ...editingRecord, category, startTime: startMs, endTime: endMs, updatedAt: Date.now(),
    });
    showToast('已保存');
  } else if (recordModalMode === 'end-active') {
    clearActiveTimer();
    await db.addRecord({
      id: crypto.randomUUID(), category, startTime: startMs, endTime: endMs,
      source: 'timer', updatedAt: Date.now(),
    });
    showToast('已保存');
    updateTimerGrid();
  }
  closeModal('modal-record');
  await refreshAll();
});

btnRecordDelete.addEventListener('click', async () => {
  if (!editingRecord) return;
  const rec = editingRecord;
  await db.removeRecord(rec.id);
  closeModal('modal-record');
  showToast('已删除', {
    actionLabel: '撤销',
    onAction: async () => {
      await db.addRecord(rec);
      await refreshAll();
    },
  });
  await refreshAll();
});

// ---------- 忘记结束计时 兜底 ----------
function checkForgottenTimer() {
  const active = getActiveTimer();
  if (!active) return;
  if (!isForgotten(active)) return;
  document.getElementById('forgotten-desc').textContent =
    `「${categoryLabel(active.category)}」已经计时 ${formatDurationMinutes(elapsedMs(active))}，是否忘记结束？`;
  openModal('modal-forgotten');
}

document.getElementById('btn-forgotten-now').addEventListener('click', async () => {
  const rec = endActiveTimer(Date.now());
  if (rec) {
    rec.id = crypto.randomUUID();
    await db.addRecord(rec);
    showToast(`已结束 ${categoryLabel(rec.category)} ${formatDurationMinutes(rec.endTime - rec.startTime)}`);
  }
  closeModal('modal-forgotten');
  updateTimerGrid();
  await refreshAll();
});

document.getElementById('btn-forgotten-manual').addEventListener('click', () => {
  const active = getActiveTimer();
  closeModal('modal-forgotten');
  if (active) openEndActiveModal(active);
});

document.getElementById('btn-forgotten-discard').addEventListener('click', async () => {
  clearActiveTimer();
  closeModal('modal-forgotten');
  showToast('已丢弃这次计时');
  updateTimerGrid();
  await refreshAll();
});

// ---------- Service Worker ----------
function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner(reg);
        }
      });
    });
  }).catch(() => {});
  // 只有用户点了更新横幅的「刷新」按钮才自动重载；首次安装/自然激活触发的
  // controllerchange 不重载，避免打开 App 时被意外强制刷新一次。
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing || !userRequestedSwReload) return;
    refreshing = true;
    window.location.reload();
  });
}

let userRequestedSwReload = false;

function showUpdateBanner(reg) {
  const banner = document.getElementById('update-banner');
  banner.classList.remove('hidden');
  document.getElementById('update-banner-btn').addEventListener('click', () => {
    if (reg.waiting) {
      userRequestedSwReload = true;
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }, { once: true });
}

// ---------- 初始化 ----------
async function init() {
  buildTimerGrid();
  buildDayStartOptions();
  updateTimerGrid();
  await renderView('record');
  checkForgottenTimer();
  initServiceWorker();
}

init();
