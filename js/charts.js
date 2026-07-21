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

// 堆叠柱状图，用于近7天/本月/本季度/本年趋势。
// bucketKeys: 桶 key 列表（旧到新）；totalsByBucket: Map(bucketKey -> {byCategory:[{key,totalMs,color},...]})
// labelFn: 把 bucketKey 转成 x 轴短标签的函数，默认沿用 formatDayKeyShort（近7天场景不受影响）。
// 桶数较多时（>12，如本月~30根、本季度~13根）按每桶最小像素宽度撑开实际 SVG 宽度，交给外层容器横向滚动；
// 桶数不多时（近7天、本年 ≤12 根）仍然 width:100% 撑满容器、不滚动。
export function renderStackedBarChart(bucketKeys, totalsByBucket, { height = 180, labelFn = formatDayKeyShort, minBarWidth = 22, barGap = 8 } = {}) {
  const padLeft = 30;
  const padBottom = 20;
  const padTop = 10;
  const padRight = 8;

  const n = bucketKeys.length;
  const scrollable = n > 12;
  const width = scrollable ? padLeft + padRight + n * minBarWidth + (n - 1) * barGap : 320;
  const chartW = width - padLeft - padRight;
  const chartH = height - padBottom - padTop;

  const bucketTotals = bucketKeys.map((k) => {
    const entry = totalsByBucket.get(k);
    if (!entry) return 0;
    return entry.byCategory.reduce((sum, c) => sum + c.totalMs, 0);
  });
  let maxMs = Math.max(...bucketTotals, 0);
  if (maxMs <= 0) maxMs = 3600000; // 无数据时给个默认 1 小时刻度

  // 取整到最近的整小时，留出顶部余量
  const maxHours = Math.ceil(maxMs / 3600000);
  const scaleMaxMs = Math.max(maxHours, 1) * 3600000;

  const barWidth = scrollable ? minBarWidth : (chartW - barGap * (n - 1)) / n;

  const gridLines = [];
  const gridCount = Math.min(maxHours, 6) || 1;
  const step = maxHours / gridCount;
  for (let i = 0; i <= gridCount; i++) {
    const hourVal = step * i;
    const y = padTop + chartH - (hourVal * 3600000 / scaleMaxMs) * chartH;
    gridLines.push(`<line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - 4}" y2="${y.toFixed(1)}" stroke="var(--chart-grid, #33363d)" stroke-width="1"></line>`);
    gridLines.push(`<text x="${padLeft - 6}" y="${(y + 3).toFixed(1)}" font-size="9" fill="var(--chart-text, #9aa0a8)" text-anchor="end">${hourVal.toFixed(0)}h</text>`);
  }

  const bars = bucketKeys.map((key, i) => {
    const entry = totalsByBucket.get(key);
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
    const label = labelFn(key);
    const labelY = height - 4;
    return `${segs}<text x="${(x + barWidth / 2).toFixed(2)}" y="${labelY}" font-size="9" fill="var(--chart-text, #9aa0a8)" text-anchor="middle">${escapeXml(label)}</text>`;
  }).join('');

  const widthAttr = scrollable ? `width="${width}"` : 'width="100%"';
  return `<svg viewBox="0 0 ${width} ${height}" ${widthAttr} height="${height}" class="stackedbar" role="img" aria-label="周期分类时长">
    ${gridLines.join('')}
    ${bars}
  </svg>`;
}

export function renderLegend(byCategory) {
  return byCategory.map((c) => `<span class="legend-item"><span class="legend-dot" style="background:${c.color}"></span>${escapeXml(c.label)}</span>`).join('');
}
