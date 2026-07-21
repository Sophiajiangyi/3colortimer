// backup.js — CSV 导出（给人看）+ JSON 全量导入导出（可恢复）。
import { JSON_SCHEMA_VERSION } from './config.js';
import { categoryLabel } from './config.js';
import { durationMs } from './stats.js';
import { getAllRecords, bulkPut } from './db.js';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDateTime(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function csvEscape(field) {
  const s = String(field);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function buildCsv() {
  const records = await getAllRecords();
  records.sort((a, b) => a.startTime - b.startTime);
  const header = ['分类', '开始时间', '结束时间', '时长(分钟)', '来源'];
  const lines = [header.join(',')];
  for (const r of records) {
    const minutes = Math.round(durationMs(r) / 60000);
    const source = r.source === 'manual' ? '手动补录' : '计时';
    lines.push([
      csvEscape(categoryLabel(r.category)),
      csvEscape(formatDateTime(r.startTime)),
      csvEscape(formatDateTime(r.endTime)),
      csvEscape(minutes),
      csvEscape(source),
    ].join(','));
  }
  // Excel 打开中文不乱码需要 UTF-8 BOM
  return '﻿' + lines.join('\r\n');
}

export function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function exportCsv() {
  const csv = await buildCsv();
  const stamp = formatDateTime(Date.now()).replace(/[: ]/g, '-');
  downloadFile(`time-control-${stamp}.csv`, csv, 'text/csv;charset=utf-8');
}

export async function buildJson() {
  const records = await getAllRecords();
  return JSON.stringify({
    schemaVersion: JSON_SCHEMA_VERSION,
    exportedAt: Date.now(),
    records,
  }, null, 2);
}

export async function exportJson() {
  const json = await buildJson();
  const stamp = formatDateTime(Date.now()).replace(/[: ]/g, '-');
  downloadFile(`time-control-backup-${stamp}.json`, json, 'application/json;charset=utf-8');
}

// 解析 JSON 文件文本，返回 {records, summary:{toAdd, toOverwrite}} 供确认，不直接写库。
export async function planJsonImport(text) {
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.records)) {
    throw new Error('文件格式不正确：缺少 records 数组');
  }
  const existing = await getAllRecords();
  const existingIds = new Set(existing.map((r) => r.id));
  let toAdd = 0;
  let toOverwrite = 0;
  for (const r of parsed.records) {
    if (!r.id || !r.category || typeof r.startTime !== 'number' || typeof r.endTime !== 'number') {
      continue;
    }
    if (existingIds.has(r.id)) toOverwrite += 1;
    else toAdd += 1;
  }
  return { records: parsed.records, summary: { toAdd, toOverwrite, total: parsed.records.length } };
}

// 实际执行导入：按 id 去重合并（put 即新增或覆盖）。
export async function applyJsonImport(records) {
  const valid = records.filter(
    (r) => r.id && r.category && typeof r.startTime === 'number' && typeof r.endTime === 'number'
  ).map((r) => ({
    id: r.id,
    category: r.category,
    startTime: r.startTime,
    endTime: r.endTime,
    source: r.source === 'manual' ? 'manual' : 'timer',
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : Date.now(),
  }));
  await bulkPut(valid);
  return valid.length;
}
