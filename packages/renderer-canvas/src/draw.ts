// 단일 페인터 — SceneState를 Canvas 2D로 그린다. 웹 미리보기·Remotion(mp4)·앱(P5)이 공유.
// 연출 로직(easing·완급·값 계산)은 templates에 있다. 여기에 새로 넣지 말 것 (계약 ③).
import type { SceneState } from "@hindsight/templates";

export const CANVAS_W = 1080;
export const CANVAS_H = 1920;

const CHART = { left: 108, top: 422, width: 918, height: 691 };
const FONT =
  "-apple-system, 'Apple SD Gothic Neo', 'AppleGothic', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const FG = "#E8ECF4";
const MUTED = "#8A93A6";
const GRID = "#2A3346";
const PANEL = "#141B2E";

const fb = (frac: number) => (1 - frac) * CANVAS_H;

type Ctx = CanvasRenderingContext2D;

function setFont(ctx: Ctx, size: number, weight = 400) {
  ctx.font = `${weight} ${size}px ${FONT}`;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawScene(ctx: Ctx, st: SceneState): void {
  ctx.save();
  ctx.fillStyle = st.background;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.textBaseline = "top";

  if (st.phase === "hook" && st.hook) {
    const lineH = 81 * 1.6;
    const n = st.hook.titleLines.length;
    ctx.fillStyle = FG;
    setFont(ctx, 81, 700);
    ctx.textAlign = "center";
    st.hook.titleLines.forEach((l, i) => {
      ctx.fillText(l, CANVAS_W / 2, fb(0.56) + (i - (n - 1) / 2) * lineH - 46);
    });
    ctx.fillStyle = MUTED;
    setFont(ctx, 36);
    ctx.fillText(st.hook.subtitle, CANVAS_W / 2, fb(0.4));
  }

  if (st.header && st.chart) {
    const px = (x: number) => CHART.left + x * CHART.width;
    const py = (y: number) => CHART.top + (1 - y) * CHART.height;

    // 헤더
    ctx.textAlign = "center";
    ctx.fillStyle = FG;
    setFont(ctx, 47, 700);
    ctx.fillText(st.header.title, CANVAS_W / 2, 144);
    ctx.fillStyle = MUTED;
    setFont(ctx, 22);
    ctx.fillText(st.header.subtitle, CANVAS_W / 2, 198);
    setFont(ctx, 31);
    ctx.fillText(st.header.dateLabel, CANVAS_W / 2, 273);

    // 그리드 + 축
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1.1;
    ctx.globalAlpha = 0.5;
    for (const t of st.chart.yTicks) {
      ctx.beginPath();
      ctx.moveTo(px(0), py(t.y));
      ctx.lineTo(px(1), py(t.y));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(px(0), CHART.top);
    ctx.lineTo(px(0), CHART.top + CHART.height);
    ctx.lineTo(px(1), CHART.top + CHART.height);
    ctx.stroke();

    // 시리즈 라인 + 헤드
    for (const s of st.chart.series) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 4.4;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      s.points.forEach((p, i) => (i === 0 ? ctx.moveTo(px(p.x), py(p.y)) : ctx.lineTo(px(p.x), py(p.y))));
      ctx.stroke();
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(px(s.head.x), py(s.head.y), 7.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 눈금 라벨
    ctx.fillStyle = MUTED;
    setFont(ctx, 18);
    ctx.textAlign = "right";
    for (const t of st.chart.yTicks) ctx.fillText(t.label, CHART.left - 14, py(t.y) - 9);
    ctx.textAlign = "center";
    for (const t of st.chart.xTicks) ctx.fillText(t.label, px(t.x), CHART.top + CHART.height + 12);

    // 라인 헤드 배지
    for (const s of st.chart.series) {
      setFont(ctx, 18, 700);
      const tw = ctx.measureText(s.badge.text).width;
      const bh = 32;
      const bx = px(s.head.x) + 17;
      const by = py(s.head.y) + (s.badge.dir === 1 ? -44 : 14);
      ctx.fillStyle = s.color;
      roundRect(ctx, bx, by, tw + 24, bh, 10);
      ctx.fill();
      ctx.fillStyle = st.background;
      ctx.textAlign = "left";
      ctx.fillText(s.badge.text, bx + 12, by + 7);
    }

    // 카운터
    if (st.counters) {
      const n = st.counters.length;
      const colX = (i: number) => (n === 1 ? 0.5 : 0.28 + (0.44 * i) / (n - 1)) * CANVAS_W;
      ctx.textAlign = "center";
      st.counters.forEach((c, i) => {
        ctx.fillStyle = c.color;
        setFont(ctx, 24, 700);
        ctx.fillText(c.name, colX(i), fb(0.335));
        if (c.amount) {
          ctx.fillStyle = FG;
          setFont(ctx, 38, 700);
          ctx.fillText(c.amount, colX(i), fb(0.292));
        }
        ctx.fillStyle = c.color;
        setFont(ctx, 25);
        ctx.fillText(c.pct, colX(i), fb(0.262));
      });
    }
    if (st.gapLabel) {
      ctx.fillStyle = FG;
      setFont(ctx, 29);
      ctx.textAlign = "center";
      ctx.fillText(st.gapLabel, CANVAS_W / 2, fb(0.196));
    }
  }

  // 엔딩 요약 패널
  if (st.ending) {
    const titleSize = 26;
    const lineSize = 35;
    const lineH = lineSize * 2;
    setFont(ctx, lineSize, 700);
    let contentW = Math.max(...st.ending.lines.map((l) => ctx.measureText(l).width));
    if (st.ending.gapLine) contentW = Math.max(contentW, ctx.measureText(st.ending.gapLine).width);
    setFont(ctx, titleSize);
    contentW = Math.max(contentW, ctx.measureText(st.ending.title).width);

    const padX = 64;
    const padY = 56;
    const titleBlock = titleSize * 1.5 + 16;
    const rows = st.ending.lines.length + (st.ending.gapLine ? 1 : 0);
    const boxW = contentW + padX * 2;
    const boxH = padY * 2 + titleBlock + rows * lineH;
    const cx = CANVAS_W / 2;
    const cy = fb(0.575);

    ctx.globalAlpha = 0.97;
    ctx.fillStyle = PANEL;
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 2;
    roundRect(ctx, cx - boxW / 2, cy - boxH / 2, boxW, boxH, 24);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.textAlign = "center";
    let y = cy - boxH / 2 + padY;
    ctx.fillStyle = MUTED;
    setFont(ctx, titleSize);
    ctx.fillText(st.ending.title, cx, y);
    y += titleBlock;
    ctx.fillStyle = FG;
    setFont(ctx, lineSize, 700);
    for (const l of st.ending.lines) {
      ctx.fillText(l, cx, y + (lineH - lineSize) / 2);
      y += lineH;
    }
    if (st.ending.gapLine) ctx.fillText(st.ending.gapLine, cx, y + (lineH - lineSize) / 2);
  }

  // 푸터
  ctx.fillStyle = MUTED;
  ctx.globalAlpha = 0.8;
  setFont(ctx, 15);
  ctx.textAlign = "center";
  ctx.fillText(st.footnote, CANVAS_W / 2, fb(0.035));
  ctx.restore();
}
