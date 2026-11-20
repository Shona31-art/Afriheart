// Draws the alphabet date ideas album on the phone: each page as a canvas,
// then a PDF of them. Photos and stories are decrypted here and never leave
// the phone unencrypted. Browser only.

import type { AlbumLook } from "./alphabet-ideas";

export interface Theme {
  paper: string; ink: string; soft: string; accent: string; rose: string; rose2: string;
  rule: string; blank: string; dash: string; tape: string; empty: string;
  deco: "sprig" | "flowers" | "stars" | "confetti";
}

/** The album looks. The screen uses the same colours (globals.css, .album[data-look]). */
export const THEMES: Record<AlbumLook, Theme> = {
  cream: { paper: "#fbf6ec", ink: "#2b2520", soft: "#6f6457", accent: "#0e5a52", rose: "#b5485d", rose2: "#d98a9a", rule: "#e6dccb", blank: "#f1ebdf", dash: "#cbbfa9", tape: "rgba(181,72,93,0.28)", empty: "#b9ad9a", deco: "sprig" },
  floral: { paper: "#fdf1f1", ink: "#3a2a2e", soft: "#7a5a62", accent: "#a23b5a", rose: "#c2536f", rose2: "#e79aab", rule: "#efd3d6", blank: "#f8e4e6", dash: "#e0b4bb", tape: "rgba(140,170,140,0.35)", empty: "#c9a3ab", deco: "flowers" },
  midnight: { paper: "#1c2333", ink: "#f4ead7", soft: "#c9bda6", accent: "#e2b65c", rose: "#f08da0", rose2: "#e2b65c", rule: "#3a4560", blank: "#2a3347", dash: "#56627e", tape: "rgba(226,182,92,0.45)", empty: "#6d7894", deco: "stars" },
  sunny: { paper: "#fff8e1", ink: "#2a2a2a", soft: "#6b5d3f", accent: "#c2410c", rose: "#d6336c", rose2: "#0f9d8a", rule: "#f1dca0", blank: "#fdeec0", dash: "#e5c66f", tape: "rgba(15,157,138,0.35)", empty: "#c9ad62", deco: "confetti" },
};

export interface AlbumPage {
  letter: string;
  activity: string;
  done: boolean;
  photo: string | null; // local blob URL, already decrypted
  story: string;
  rating: number; // 0-5
  when: string; // yyyy-mm-dd or ""
}

export interface AlbumCover { names: string; done: number; pages: AlbumPage[]; style?: string }

const W = 1240; // A4 at 150 dpi
const H = 1754;
const SCRIPT = '"Dancing Script", cursive';
const HAND = "Caveat, cursive";
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

export function niceDate(when: string): string {
  if (!when) return "";
  const d = new Date(`${when}T12:00:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
}

export const clampRating = (n: unknown) => Math.max(0, Math.min(5, Math.round(Number(n) || 0)));

async function fontsReady() {
  try {
    await Promise.all([document.fonts.load(`600 80px ${SCRIPT}`), document.fonts.load(`500 40px ${HAND}`)]);
  } catch { /* falls back to system fonts */ }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, filled: boolean, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 24, s / 24);
  ctx.beginPath();
  ctx.moveTo(12, 21);
  ctx.bezierCurveTo(12, 21, 3, 15.5, 3, 9.5);
  ctx.bezierCurveTo(3, 6.5, 5.5, 4, 8.3, 4);
  ctx.bezierCurveTo(10, 4, 11.3, 5, 12, 6.3);
  ctx.bezierCurveTo(12.7, 5, 14, 4, 15.7, 4);
  ctx.bezierCurveTo(18.5, 4, 21, 6.5, 21, 9.5);
  ctx.bezierCurveTo(21, 15.5, 12, 21, 12, 21);
  ctx.closePath();
  if (filled) { ctx.fillStyle = color; ctx.fill(); }
  else { ctx.lineWidth = 1.8; ctx.strokeStyle = color; ctx.stroke(); }
  ctx.restore();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n+/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > max && line) { out.push(line); line = word; } else line = next;
    }
    if (line) out.push(line);
  }
  return out;
}

/** Fits a script title on at most two lines by shrinking it. */
function title(ctx: CanvasRenderingContext2D, t: Theme, text: string, cx: number, y: number, max: number) {
  let size = 120;
  let lines: string[] = [];
  while (size > 60) {
    ctx.font = `600 ${size}px ${SCRIPT}`;
    lines = wrap(ctx, text, max);
    if (lines.length <= 2) break;
    size -= 8;
  }
  ctx.fillStyle = t.ink;
  ctx.textAlign = "center";
  lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, cx, y + i * size * 1.05));
  ctx.textAlign = "left";
  return y + (Math.min(lines.length, 2) - 1) * size * 1.05;
}

function paper(ctx: CanvasRenderingContext2D, t: Theme) {
  ctx.fillStyle = t.paper;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = t.rule;
  ctx.lineWidth = 3;
  ctx.strokeRect(50, 50, W - 100, H - 100);
}

function sprig(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "#9fb3a5";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(40, -90, 20, -200);
  ctx.stroke();
  ctx.fillStyle = "#c9d6cc";
  for (let i = 0; i < 6; i++) {
    const k = i / 6;
    const px = 40 * k * (1 - k) * 2 + 20 * k * k;
    const py = -200 * k;
    ctx.beginPath();
    ctx.ellipse(px + (i % 2 ? 22 : -22), py - 10, 20, 9, (i % 2 ? -0.6 : 0.6), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function flower(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, petal: string, middle: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = petal;
  for (let i = 0; i < 5; i++) {
    ctx.rotate((Math.PI * 2) / 5);
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.9, r * 0.55, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = middle;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rad = i % 2 ? r * 0.38 : r;
    const a = (Math.PI / 4) * i - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** The look's decoration in the page corners. */
function decorate(ctx: CanvasRenderingContext2D, t: Theme, bottomY: number) {
  if (t.deco === "sprig") sprig(ctx, 110, bottomY);
  if (t.deco === "flowers") {
    flower(ctx, W - 150, 230, 34, t.rose2, "#f6d58e");
    flower(ctx, W - 210, 300, 22, t.rose, "#f6d58e");
    flower(ctx, 120, bottomY - 30, 30, t.rose2, "#f6d58e");
    flower(ctx, 170, bottomY + 20, 18, t.rose, "#f6d58e");
  }
  if (t.deco === "stars") {
    [[W - 160, 220, 22], [W - 230, 300, 12], [W - 120, 330, 9], [140, bottomY - 40, 18], [200, bottomY + 10, 10], [W - 170, bottomY + 20, 14]]
      .forEach(([x, y, r]) => star(ctx, x, y, r, t.accent));
  }
  if (t.deco === "confetti") {
    const colours = [t.rose, t.rose2, t.accent, "#f2b705"];
    [[W - 170, 220], [W - 230, 280], [W - 140, 320], [W - 260, 210], [130, bottomY - 40], [190, bottomY], [150, bottomY + 40], [W - 160, bottomY + 10]]
      .forEach(([x, y], i) => { ctx.fillStyle = colours[i % colours.length]; ctx.beginPath(); ctx.arc(x, y, 10 + (i % 3) * 4, 0, Math.PI * 2); ctx.fill(); });
  }
}

function polaroid(ctx: CanvasRenderingContext2D, t: Theme, img: HTMLImageElement | null, cx: number, top: number, size: number, tilt: number, empty: string) {
  const pad = 34;
  const w = size + pad * 2;
  const h = size + pad + 120;
  ctx.save();
  ctx.translate(cx, top + h / 2);
  ctx.rotate(tilt);
  ctx.shadowColor = "rgba(60,40,20,0.22)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.shadowColor = "transparent";
  const x = -w / 2 + pad;
  const y = -h / 2 + pad;
  if (img) {
    const scale = Math.max(size / img.width, size / img.height);
    const sw = size / scale;
    const sh = size / scale;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, size, size);
  } else {
    ctx.fillStyle = t.blank;
    ctx.fillRect(x, y, size, size);
    ctx.setLineDash([14, 12]);
    ctx.strokeStyle = t.dash;
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 20, y + 20, size - 40, size - 40);
    ctx.setLineDash([]);
    ctx.fillStyle = t.soft;
    ctx.font = `500 46px ${HAND}`;
    ctx.textAlign = "center";
    ctx.fillText(empty, 0, y + size / 2 + 14);
    ctx.textAlign = "left";
  }
  // washi tape
  ctx.fillStyle = t.tape;
  ctx.rotate(-0.08);
  ctx.fillRect(-90, -h / 2 - 26, 180, 52);
  ctx.restore();
  return top + h;
}

export async function drawPage(p: AlbumPage, i: number, t: Theme = THEMES.cream): Promise<HTMLCanvasElement> {
  await fontsReady();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  paper(ctx, t);

  ctx.fillStyle = t.accent;
  ctx.font = `700 210px ${SERIF}`;
  ctx.fillText(p.letter, 110, 300);
  ctx.fillStyle = t.soft;
  ctx.font = `600 26px ${SANS}`;
  ctx.textAlign = "right";
  ctx.fillText(`ALPHABET DATE IDEAS  ·  ${i + 1} / 26`, W - 110, 140);
  ctx.textAlign = "left";

  const end = title(ctx, t, p.activity, W / 2 + 60, 300, 820);
  const img = p.photo ? await loadImage(p.photo) : null;
  const bottom = polaroid(ctx, t, img, W / 2, end + 90, 640, i % 2 ? 0.035 : -0.035, p.done ? "Add your photo" : "Your photo goes here");

  // little hearts under the photo
  heart(ctx, W / 2 - 40, bottom + 28, 34, true, t.rose);
  heart(ctx, W / 2 + 6, bottom + 14, 26, false, t.rose);
  heart(ctx, W / 2 + 30, bottom + 44, 22, true, t.rose2);

  // our story box
  const boxTop = bottom + 110;
  const boxBottom = H - 210;
  ctx.strokeStyle = t.rule;
  ctx.lineWidth = 3;
  ctx.strokeRect(130, boxTop, W - 260, boxBottom - boxTop);
  ctx.fillStyle = t.paper;
  ctx.fillRect(160, boxTop - 30, 230, 60);
  ctx.fillStyle = t.accent;
  ctx.font = `600 54px ${SCRIPT}`;
  ctx.fillText("Our story", 170, boxTop + 16);
  const lineGap = 66;
  for (let y = boxTop + 100; y < boxBottom - 20; y += lineGap) {
    ctx.strokeStyle = t.rule;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(170, y);
    ctx.lineTo(W - 170, y);
    ctx.stroke();
  }
  ctx.fillStyle = t.ink;
  ctx.font = `500 52px ${HAND}`;
  const lines = wrap(ctx, p.story, W - 360);
  const fit = Math.floor((boxBottom - boxTop - 100) / lineGap) + 1;
  lines.slice(0, fit).forEach((l, n) => ctx.fillText(n === fit - 1 && lines.length > fit ? `${l}…` : l, 180, boxTop + 92 + n * lineGap));
  decorate(ctx, t, boxBottom + 10);

  // date and rating
  ctx.fillStyle = t.soft;
  ctx.font = `600 30px ${SANS}`;
  ctx.fillText("DATE", 130, H - 120);
  ctx.fillStyle = t.ink;
  ctx.font = `500 50px ${HAND}`;
  ctx.fillText(niceDate(p.when) || "____________", 230, H - 118);
  for (let n = 0; n < 5; n++) heart(ctx, W - 130 - (5 - n) * 56, H - 160, 48, n < p.rating, t.rose);
  return canvas;
}

export async function drawCover(c: AlbumCover, t: Theme = THEMES.cream): Promise<HTMLCanvasElement> {
  await fontsReady();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  paper(ctx, t);
  ctx.textAlign = "center";
  ctx.fillStyle = t.ink;
  ctx.font = `600 170px ${SCRIPT}`;
  ctx.fillText("Alphabet", W / 2, 330);
  ctx.fillText("date ideas", W / 2, 500);
  ctx.fillStyle = t.soft;
  ctx.font = `600 30px ${SANS}`;
  ctx.fillText("DATES FROM A TO Z", W / 2, 580);
  ctx.fillStyle = t.accent;
  ctx.font = `500 72px ${HAND}`;
  ctx.fillText(c.names, W / 2, 700);
  ctx.fillStyle = t.soft;
  ctx.font = `500 44px ${HAND}`;
  ctx.fillText(`${c.done} of 26 dates so far`, W / 2, 770);
  ctx.textAlign = "left";
  heart(ctx, W / 2 - 24, 800, 48, true, t.rose);
  ctx.fillStyle = t.soft;
  ctx.font = `600 26px ${SANS}`;
  ctx.textAlign = "center";
  if (c.style) ctx.fillText(c.style.toUpperCase(), W / 2, 880);
  ctx.textAlign = "left";

  // contents: 26 little squares, photos where you have them
  const cols = 6;
  const cell = 150;
  const gap = 22;
  const gridW = cols * cell + (cols - 1) * gap;
  const x0 = (W - gridW) / 2;
  const y0 = 930;
  for (let i = 0; i < 26; i++) {
    const p = c.pages[i];
    const lastRow = Math.floor(i / cols) === Math.floor(25 / cols);
    const shift = lastRow ? ((cols - (26 % cols || cols)) * (cell + gap)) / 2 : 0;
    const x = x0 + shift + (i % cols) * (cell + gap);
    const y = y0 + Math.floor(i / cols) * (cell + gap);
    const img = p.photo ? await loadImage(p.photo) : null;
    ctx.fillStyle = img ? "#ffffff" : t.blank;
    ctx.fillRect(x, y, cell, cell);
    if (img) {
      const s = Math.max((cell - 16) / img.width, (cell - 16) / img.height);
      const sw = (cell - 16) / s;
      ctx.drawImage(img, (img.width - sw) / 2, (img.height - sw) / 2, sw, sw, x + 8, y + 8, cell - 16, cell - 16);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(x + 8, y + cell - 60, cell - 16, 52);
      ctx.fillStyle = "#ffffff";
    } else {
      ctx.strokeStyle = t.rule;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 8, y + 8, cell - 16, cell - 16);
      ctx.fillStyle = p.done ? t.accent : t.empty;
    }
    ctx.font = `700 ${img ? 40 : 64}px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.fillText(p.letter, x + cell / 2, img ? y + cell - 20 : y + cell / 2 + 22);
    ctx.textAlign = "left";
  }
  return canvas;
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Saves a file the phone made: through the Android app if there, otherwise a normal download. */
export async function saveFile(blob: Blob, name: string) {
  const bridge = (window as unknown as { CommonAndroid?: { saveFile?: (n: string, m: string, b: string) => boolean } }).CommonAndroid;
  if (bridge?.saveFile) {
    if (bridge.saveFile(name, blob.type, await toBase64(blob))) return;
    throw new Error("Couldn't save the file on this phone.");
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't draw the page."))), "image/jpeg", 0.9));
}

/** The whole album as an A4 PDF: a cover, then one page per letter. */
export async function albumPdf(cover: AlbumCover, pages: AlbumPage[], t: Theme, onProgress?: (n: number, of: number) => void): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  const total = pages.length + 1;
  const add = (canvas: HTMLCanvasElement, first: boolean) => {
    if (!first) doc.addPage();
    doc.addImage(canvas.toDataURL("image/jpeg", 0.88), "JPEG", 0, 0, 210, 297, undefined, "FAST");
  };
  add(await drawCover(cover, t), true);
  onProgress?.(1, total);
  for (const [n, p] of pages.entries()) {
    add(await drawPage(p, cover.pages.indexOf(p), t), false);
    onProgress?.(n + 2, total);
  }
  doc.setProperties({ title: `Alphabet date ideas: ${cover.names}` });
  return doc.output("blob");
}

// ── Story-sized images for sharing (1080 × 1920) ─────────────────────────────

const SW = 1080;
const SH = 1920;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** "Made on Afriheart" with where to go, at the bottom of a shared image. */
function mark(ctx: CanvasRenderingContext2D, line: string) {
  // The pill fits the link line, shrinking the text for long addresses.
  let size = 30;
  ctx.font = `500 ${size}px ${SANS}`;
  while (ctx.measureText(line).width > SW - 200 && size > 20) { size -= 2; ctx.font = `500 ${size}px ${SANS}`; }
  const w = Math.min(SW - 80, Math.max(560, ctx.measureText(line).width + 100));
  const x = (SW - w) / 2;
  const y = SH - 220;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = 24;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, x, y, w, 132, 66);
  ctx.fill();
  ctx.restore();
  ctx.textAlign = "center";
  ctx.fillStyle = "#0e5a52";
  ctx.font = `700 40px ${SANS}`;
  ctx.fillText("Made on Afriheart", SW / 2, y + 56);
  ctx.fillStyle = "#2b2520";
  ctx.font = `500 ${size}px ${SANS}`;
  ctx.fillText(line, SW / 2, y + 102);
  ctx.textAlign = "left";
}

/** An album page on a Story-sized background, ready for TikTok or Instagram. */
export async function drawPageStory(p: AlbumPage, i: number, t: Theme, host: string): Promise<HTMLCanvasElement> {
  const page = await drawPage(p, i, t);
  const canvas = document.createElement("canvas");
  canvas.width = SW;
  canvas.height = SH;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, SH);
  g.addColorStop(0, t.rose2);
  g.addColorStop(1, t.accent);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SW, SH);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 84px ${SCRIPT}`;
  ctx.fillText("Our alphabet dates", SW / 2, 150);
  ctx.textAlign = "left";
  const w = 900;
  const h = (w * page.height) / page.width;
  ctx.save();
  ctx.translate(SW / 2, 210 + h / 2);
  ctx.rotate(i % 2 ? 0.02 : -0.02);
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  ctx.drawImage(page, -w / 2, -h / 2, w, h);
  ctx.restore();
  mark(ctx, `Plan your own A to Z dates · ${host}/alphabet-dates`);
  return canvas;
}

export interface QuizShare { names: [string, string]; score: number; shared: string[] }

/** A quiz result on a Story-sized card. Only the score and what they share, never anyone's other answers. */
export async function drawQuizStory(r: QuizShare, host: string, t: Theme = THEMES.cream): Promise<HTMLCanvasElement> {
  await fontsReady();
  const canvas = document.createElement("canvas");
  canvas.width = SW;
  canvas.height = SH;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, SW, SH);
  g.addColorStop(0, t.rose2);
  g.addColorStop(1, t.rose);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SW, SH);
  ctx.fillStyle = t.paper;
  roundRect(ctx, 80, 200, SW - 160, 1360, 48);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.fillStyle = t.soft;
  ctx.font = `600 30px ${SANS}`;
  ctx.fillText("COMPATIBILITY QUIZ", SW / 2, 310);
  ctx.fillStyle = t.ink;
  ctx.font = `600 84px ${SCRIPT}`;
  const names = `${r.names[0]} & ${r.names[1]}`;
  let size = 84;
  while (ctx.measureText(names).width > SW - 260 && size > 48) { size -= 6; ctx.font = `600 ${size}px ${SCRIPT}`; }
  ctx.fillText(names, SW / 2, 430);
  ctx.fillStyle = t.rose;
  ctx.font = `700 260px ${SERIF}`;
  ctx.fillText(`${r.score}%`, SW / 2, 720);
  ctx.fillStyle = t.ink;
  ctx.font = `600 46px ${SANS}`;
  ctx.fillText(r.score >= 80 ? "A strong match" : r.score >= 60 ? "Plenty in common" : r.score >= 40 ? "Worth a conversation" : "Opposites attract?", SW / 2, 810);
  heart(ctx, SW / 2 - 30, 850, 60, true, t.rose);
  if (r.shared.length) {
    ctx.fillStyle = t.accent;
    ctx.font = `600 54px ${SCRIPT}`;
    ctx.fillText("You both…", SW / 2, 1010);
    ctx.fillStyle = t.ink;
    ctx.font = `500 50px ${HAND}`;
    r.shared.slice(0, 4).forEach((line, n) => {
      const text = line.length > 42 ? `${line.slice(0, 41)}…` : line;
      ctx.fillText(text, SW / 2, 1090 + n * 80);
    });
  }
  ctx.textAlign = "left";
  mark(ctx, `Take the quiz together · ${host}/quiz`);
  return canvas;
}
