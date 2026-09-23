/**
 * 漫画本地测试页（Phase 2B）。
 *
 * 全部为自制灰阶分镜 placeholder（内联 SVG → data: URL），
 * 不抓取、不下载任何真实/版权漫画图片，仅用于验证滚动 / 页码 / 进度 / 恢复。
 */
import type { MangaPage } from "./bookstore-data";

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** 网点（screentone）纹理，模拟漫画纸面 */
function screentone(id: string, gap = 6, r = 0.8): string {
  return `
    <pattern id="${id}" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse">
      <circle cx="${r}" cy="${r}" r="${r}" fill="rgba(0,0,0,0.18)"/>
    </pattern>`;
}

type Panel = { x: number; y: number; w: number; h: number; tone?: string };

/** 单页分镜：4~5 种布局变体，灰阶线稿风 */
function buildMangaSvg(opts: {
  pageNum: number;
  total: number;
  label: string;
  variant: number;
}): string {
  const { pageNum, total, label, variant } = opts;
  const W = 800;
  const H = 1140;
  const margin = 30;
  const innerW = W - margin * 2;
  const innerH = H - margin * 2;

  const panels: Panel[] = [];
  const v = variant % 5;

  if (v === 0) {
    // 上 1 大 + 下 2 小
    panels.push({ x: 0, y: 0, w: innerW, h: innerH * 0.52 });
    panels.push({ x: 0, y: innerH * 0.52 + 12, w: innerW * 0.48, h: innerH * 0.48 - 12 });
    panels.push({ x: innerW * 0.52, y: innerH * 0.52 + 12, w: innerW * 0.48, h: innerH * 0.48 - 12 });
  } else if (v === 1) {
    // 左 1 高 + 右 2 叠
    panels.push({ x: 0, y: 0, w: innerW * 0.46, h: innerH });
    panels.push({ x: innerW * 0.46 + 12, y: 0, w: innerW * 0.54 - 12, h: innerH * 0.5 - 6 });
    panels.push({ x: innerW * 0.46 + 12, y: innerH * 0.5 + 6, w: innerW * 0.54 - 12, h: innerH * 0.5 - 6 });
  } else if (v === 2) {
    // 3 等分横排
    const gap = 12;
    const ph = (innerH - gap * 2) / 3;
    panels.push({ x: 0, y: 0, w: innerW, h: ph });
    panels.push({ x: 0, y: ph + gap, w: innerW, h: ph });
    panels.push({ x: 0, y: (ph + gap) * 2, w: innerW, h: ph });
  } else if (v === 3) {
    // 田字 + 底部长条
    const gap = 12;
    const halfW = (innerW - gap) / 2;
    const topH = innerH * 0.56;
    panels.push({ x: 0, y: 0, w: halfW, h: topH });
    panels.push({ x: halfW + gap, y: 0, w: halfW, h: topH });
    panels.push({ x: 0, y: topH + gap, w: innerW, h: innerH - topH - gap });
  } else {
    // 2 大叠
    const gap = 12;
    const ph = (innerH - gap) / 2;
    panels.push({ x: 0, y: 0, w: innerW, h: ph });
    panels.push({ x: 0, y: ph + gap, w: innerW, h: ph });
  }

  // 为部分面板加网点
  panels.forEach((panel, idx) => {
    if (idx % 2 === 1) panel.tone = `tone-${idx}`;
  });

  const defs = panels
    .map(panel => (panel.tone ? screentone(panel.tone) : ""))
    .join("");

  const panelEls = panels
    .map((panel, idx) => {
      const fill = panel.tone ? `url(#${panel.tone})` : "#ffffff";
      return `
        <rect x="${panel.x}" y="${panel.y}" width="${panel.w}" height="${panel.h}"
              rx="4" ry="4" fill="${fill}" stroke="#151515" stroke-width="3"/>
        ${idx % 3 === 0
          ? `<ellipse cx="${panel.x + panel.w * 0.62}" cy="${panel.y + panel.h * 0.32}"
                     rx="${Math.min(panel.w, panel.h) * 0.16}" ry="${Math.min(panel.w, panel.h) * 0.1}"
                     fill="#ffffff" stroke="#151515" stroke-width="2"/>`
          : ""}
        ${idx % 2 === 0
          ? `<path d="M ${panel.x + panel.w * 0.18} ${panel.y + panel.h * 0.7}
                     q ${panel.w * 0.08} -${panel.h * 0.18} ${panel.w * 0.2} -${panel.h * 0.02}
                     q ${panel.w * 0.1} ${panel.h * 0.12} ${panel.w * 0.22} -${panel.h * 0.04}"
                     fill="none" stroke="#151515" stroke-width="2.5" stroke-linecap="round"/>`
          : ""}
      `;
    })
    .join("");

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>${defs}</defs>
  <rect x="0" y="0" width="${W}" height="${H}" fill="#f7f6f3"/>
  <g transform="translate(${margin}, ${margin})">
    ${panelEls}
  </g>
  <text x="${W / 2}" y="${H - 14}" text-anchor="middle"
        font-family="serif" font-size="22" fill="#6e6e73" letter-spacing="4">
    ${label} · ${pageNum} / ${total}
  </text>
</svg>`.trim();

  return svgDataUrl(svg);
}

/** 为一本漫画生成 N 页自制分镜 */
export function buildMangaPages(bookId: string, title: string, count = 10): MangaPage[] {
  const pages: MangaPage[] = [];
  for (let i = 0; i < count; i += 1) {
    pages.push({
      id: `${bookId}-p-${i + 1}`,
      src: buildMangaSvg({
        pageNum: i + 1,
        total: count,
        label: title,
        variant: i,
      }),
      caption: `${title} 第 ${i + 1} 页`,
    });
  }
  return pages;
}
