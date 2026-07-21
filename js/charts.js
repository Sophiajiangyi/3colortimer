// charts.js — 手写 SVG 图表，零依赖。返回 SVG 字符串，由调用方 innerHTML 注入。
import { CATEGORIES } from './config.js';
import { formatDayKeyShort } from './day.js';

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  }[c]));
}

// 水平分段占比条。byCategory: [{key,label,color,totalMs,ratio}, ...]
export function renderSegmentedBar(byCategory, { width = 320, height = 28 } = {}) {
  const nonZero = byCategory.filter((c) => c.totalMs > 0);
  if (nonZero.length === 0) {
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" class="segbar" role="img" aria-label="暂无数据">
      <rect x="0" y="0" width="${width}" height="${height}" rx="6" fill="var(--seg-empty, #2a2d33)"></rect>
    </svg>`;
  }
  let x = 0;
  const rects = nonZero.map((c) => {
    const w = c.ratio * width;
    const rect = `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}" fill="${c.color}"><title>${escapeXml(c.label)} ${(c.ratio * 100).toFixed(1)}%</title></rect>`;
    x += w;
    return rect;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" class="segbar" role="img" aria-label="分类占比">
    <defs><clipPath id="segclip"><rect x="0" y="0" width="${width}" height="${height}" rx="6"></rect></clipPath></defs>
    <g clip-path="url(#segclip)">${rects}</g>
  </svg>`;
}

// 近 7 天堆叠柱状图。
// dayKeys: 7 个 dayKey（旧到新）；totalsByDay: Map(dayKey -> {byCategory:[{key,totalMs,color},...]})
export function renderStackedBarChart(dayKeys, totalsByDay, { width = 320, height = 180 } = {}) {
  const padLeft = 30;
  const padBottom = 20;
  const padTop = 10;
  const chartW = width - padLeft - 8;
  const chartH = height - padBottom - padTop;

  const dayTotals = dayKeys.map((k) => {
    const entry = totalsByDay.get(k);
    if (!entry) return 0;
    return entry.byCategory.reduce((sum, c) => sum + c.totalMs, 0);
  });
  let maxMs = Math.max(...dayTotals, 0);
  if (maxMs <= 0) maxMs = 3600000; // 无数据时给个默认 1 小时刻度

  // 取整到最近的整小时，留出顶部余量
  const maxHours = Math.ceil(maxMs / 3600000);
  const scaleMaxMs = Math.max(maxHours, 1) * 3600000;

  const barGap = 8;
  const barWidth = (chartW - barGap * (dayKeys.length - 1)) / dayKeys.length;

  const gridLines = [];
  const gridCount = Math.min(maxHours, 6) || 1;
  const step = maxHours / gridCount;
  for (let i = 0; i <= gridCount; i++) {
    const hourVal = step * i;
    const y = padTop + chartH - (hourVal * 3600000 / scaleMaxMs) * chartH;
    gridLines.push(`<line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - 4}" y2="${y.toFixed(1)}" stroke="var(--chart-grid, #33363d)" stroke-width="1"></line>`);
    gridLines.push(`<text x="${padLeft - 6}" y="${(y + 3).toFixed(1)}" font-size="9" fill="var(--chart-text, #9aa0a8)" text-anchor="end">${hourVal.toFixed(0)}h</text>`);
  }

  const bars = dayKeys.map((key, i) => {
    const entry = totalsByDay.get(key);
    const x = padLeft + i * (barWidth + barGap);
    let yCursor = padTop + chartH;
    let segs = '';
    if (entry) {
      for (const cat of CATEGORIES) {
        const catEntry = entry.byCategory.find((c) => c.key === cat.key);
        const ms = catEntry ? catEntry.totalMs : 0;
        if (ms <= 0) continue;
        const segH = (ms / scaleMaxMs) * chartH;
        yCursor -= segH;
        segs += `<rect x="${x.toFixed(2)}" y="${yCursor.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${segH.toFixed(2)}" fill="${cat.color}"><title>${escapeXml(cat.label)} ${(ms / 60000).toFixed(0)} 分钟</title></rect>`;
      }
    }
    const label = formatDayKeyShort(key);
    const labelY = height - 4;
    return `${segs}<text x="${(x + barWidth / 2).toFixed(2)}" y="${labelY}" font-size="9" fill="var(--chart-text, #9aa0a8)" text-anchor="middle">${label}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" class="stackedbar" role="img" aria-label="近7天分类时长">
    ${gridLines.join('')}
    ${bars}
  </svg>`;
}

export function renderLegend(byCategory) {
  return byCategory.map((c) => `<span class="legend-item"><span class="legend-dot" style="background:${c.color}"></span>${escapeXml(c.label)}</span>`).join('');
}
