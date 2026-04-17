/**
 * ConstructionScene — Flat Design Construction Site
 * Canvas 2D puro — sin dependencias.
 */

interface SceneOpts {
  canvas: HTMLCanvasElement;
  speed?: number;
}

interface Ptc {
  x: number; y: number;
  vx: number; vy: number;
  s: number; a: number;
  life: number; maxLife: number;
}

const C = {
  bg: '#F0F2F8',
  lavender: '#D8DFF0',
  lavenderLight: '#E8ECF5',
  silhouette: '#B0BDD8',
  silhouetteLight: '#C8D2E8',
  yellow: '#F5B731',
  yellowLight: '#F8CC66',
  yellowDark: '#D49A1A',
  constructionBlue: '#5A6FA0',
  blueGrayMed: '#6B7FA3',
  facadeDark: '#3D4F7C',
  facadeLight: '#4A5E8E',
  ochre: '#D4A843',
  ochreDark: '#A07830',
  ochreLight: '#E0C070',
  cabinOrange: '#E8A020',
  panel: '#A0A8B0',
  panelLight: '#C0C8D0',
  counterweight: '#8090A0',
  wheel: '#2A2A2A',
  wheelHub: '#606060',
  white: '#FFFFFF',
  column: '#ECEEF2',       // blanco hueso per spec
  columnSecondary: '#D0D4DC',  // gris beige for secondary building
  slabGray: '#DDE0E8',
  groundLine: '#5A6FA0',
};

export default class ConstructionScene {
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sp: number;
  private pt: Ptc[] = [];
  private af = 0;
  private mx = -9999;
  private my = -9999;
  private t = 0;
  private dead = false;
  // Pre-computed rebar heights (stable per session, no flicker)
  private rebarHeights: number[] = [];
  private rr: () => void;
  private rm: (e: MouseEvent) => void;
  private rl: () => void;

  constructor(o: SceneOpts) {
    this.cv = o.canvas;
    this.ctx = this.cv.getContext('2d')!;
    this.sp = o.speed ?? 1;
    // Generate stable rebar heights
    for (let i = 0; i < 6; i++) {
      this.rebarHeights.push(0.4 + Math.random() * 0.6);
    }
    this.rr = () => this.resize();
    this.rm = (e: MouseEvent) => {
      const r = this.cv.getBoundingClientRect();
      this.mx = e.clientX - r.left;
      this.my = e.clientY - r.top;
    };
    this.rl = () => { this.mx = -9999; this.my = -9999; };
    this.init();
  }

  private init() {
    this.resize();
    this.genParticles();
    window.addEventListener('resize', this.rr);
    this.cv.addEventListener('mousemove', this.rm);
    this.cv.addEventListener('mouseleave', this.rl);
    this.loop();
  }

  private resize() {
    const d = window.devicePixelRatio || 1;
    const r = this.cv.getBoundingClientRect();
    this.cv.width = r.width * d;
    this.cv.height = r.height * d;
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
  }

  private genParticles() {
    this.pt = [];
    for (let i = 0; i < 15; i++) {
      this.pt.push(this.makeParticle());
    }
  }

  private makeParticle(): Ptc {
    const maxLife = 3000 + Math.random() * 5000;
    return {
      x: 0.15 + Math.random() * 0.55,
      y: 0.5 + Math.random() * 0.25,
      vx: (Math.random() - 0.5) * 0.00006,
      vy: -0.00004 - Math.random() * 0.00008,
      s: 1.2 + Math.random() * 2.5,
      a: 0.08 + Math.random() * 0.18,
      life: Math.random() * maxLife,
      maxLife,
    };
  }

  private loop() {
    if (this.dead) return;
    this.t += 16 * this.sp;
    this.draw();
    this.af = requestAnimationFrame(() => this.loop());
  }

  private draw() {
    const r = this.cv.getBoundingClientRect();
    const W = r.width;
    const H = r.height;
    const c = this.ctx;
    const groundY = H * 0.82;

    c.clearRect(0, 0, W, H);

    this.drawBackground(c, W, H);
    this.drawCitySilhouettes(c, W, H, groundY);
    this.drawSecondaryBuilding(c, W, H, groundY);
    this.drawMainBuilding(c, W, H, groundY);
    this.drawTowerCrane(c, W, H, groundY);
    this.drawMobileCrane(c, W, H, groundY);
    this.drawGround(c, W, H, groundY);
    this.drawParticles(c, W, H);
  }

  // ── 1. Background ──────────────────────────────────────────────
  private drawBackground(c: CanvasRenderingContext2D, W: number, H: number) {
    c.fillStyle = C.bg;
    c.fillRect(0, 0, W, H);

    // Lavender circle — large, centered behind the scene
    const cx = W * 0.42;
    const cy = H * 0.40;
    const rad = Math.min(W, H) * 0.40 + 2 * Math.sin(this.t * 0.0002);
    c.beginPath();
    c.arc(cx, cy, rad, 0, Math.PI * 2);
    c.fillStyle = C.lavender;
    c.fill();

    // Second softer circle for depth
    c.beginPath();
    c.arc(cx - W * 0.03, cy + H * 0.02, rad * 0.85, 0, Math.PI * 2);
    c.fillStyle = C.lavenderLight;
    c.globalAlpha = 0.35;
    c.fill();
    c.globalAlpha = 1;
  }

  // ── 2. City Silhouettes ────────────────────────────────────────
  private drawCitySilhouettes(c: CanvasRenderingContext2D, W: number, H: number, groundY: number) {
    const px = this.mx > 0 ? (this.mx / W - 0.5) * W * 0.004 : 0;

    // Background city buildings — simple flat rectangles
    const bldgs: [number, number, number, string][] = [
      [0.03, 0.045, 0.20, C.silhouetteLight],
      [0.08, 0.035, 0.28, C.silhouette],
      [0.12, 0.055, 0.16, C.silhouetteLight],
      [0.18, 0.04,  0.30, C.silhouette],
      [0.24, 0.035, 0.18, C.silhouetteLight],
      [0.56, 0.04,  0.22, C.silhouetteLight],
      [0.61, 0.05,  0.30, C.silhouette],
      [0.67, 0.035, 0.17, C.silhouetteLight],
      [0.72, 0.055, 0.26, C.silhouette],
      [0.78, 0.04,  0.20, C.silhouetteLight],
      [0.83, 0.05,  0.28, C.silhouette],
      [0.89, 0.04,  0.15, C.silhouetteLight],
      [0.93, 0.045, 0.22, C.silhouette],
    ];

    for (const [xf, wf, hf, color] of bldgs) {
      const bx = xf * W + px;
      const bw = wf * W;
      const bh = hf * H;
      c.fillStyle = color;
      c.fillRect(bx, groundY - bh, bw, bh);

      // Some buildings have simple window-like marks
      if (bh > H * 0.2) {
        c.fillStyle = color === C.silhouette ? C.silhouetteLight : C.silhouette;
        c.globalAlpha = 0.3;
        const winRows = Math.floor(bh / (H * 0.04));
        const winCols = Math.floor(bw / (W * 0.012));
        const ww = bw * 0.15;
        const wh = H * 0.012;
        for (let r = 1; r < winRows; r++) {
          for (let ci = 0; ci < winCols; ci++) {
            const wx = bx + bw * 0.15 + ci * (bw * 0.7 / Math.max(winCols - 1, 1));
            const wy = groundY - bh + r * (bh / winRows) + H * 0.005;
            c.fillRect(wx, wy, ww, wh);
          }
        }
        c.globalAlpha = 1;
      }
    }
  }

  // ── 3. Main Building (center-left, ~10 floors, grid cage) ─────
  private drawMainBuilding(c: CanvasRenderingContext2D, W: number, H: number, groundY: number) {
    // Proportions: 1 wide x 3 tall as per spec
    const bw = W * 0.18;
    const bh = bw * 3;
    // Clamp height to not exceed available space
    const maxH = H * 0.62;
    const finalH = Math.min(bh, maxH);
    const finalW = bw;
    const bx = W * 0.25;
    const by = groundY - finalH;

    const cols = 3;   // 3 columns of voids
    const rows = 10;  // 10 slab levels
    const colStructW = 4;  // column thickness
    const slabH = 3;       // slab thickness

    // Usable interior dimensions
    const innerW = finalW - (cols + 1) * colStructW;
    const innerH = finalH - (rows + 1) * slabH;
    const voidW = innerW / cols;
    const voidH = innerH / rows;

    // ── Draw column/slab grid structure ──
    c.fillStyle = C.column;

    // Vertical columns (4 columns for 3 voids)
    for (let i = 0; i <= cols; i++) {
      const cx = bx + i * (voidW + colStructW);
      c.fillRect(cx, by, colStructW, finalH);
    }

    // Horizontal slabs (11 slabs for 10 rows)
    for (let i = 0; i <= rows; i++) {
      const sy = by + i * (voidH + slabH);
      c.fillRect(bx, sy, finalW, slabH);
    }

    // ── Fill voids: right half with blue panels, left half open ──
    // Diagonal transition: row determines cutoff column
    for (let row = 0; row < rows; row++) {
      // How many columns from right are filled
      // Bottom rows: all 3 filled. Top rows: fewer filled.
      // Transition: rows 0-3 (top) = 0-1 filled, rows 4-6 = 1-2, rows 7-9 = 2-3
      const rowFromBottom = rows - 1 - row;
      let filledFromRight: number;
      if (rowFromBottom >= 7) filledFromRight = 3;
      else if (rowFromBottom >= 4) filledFromRight = 2;
      else if (rowFromBottom >= 2) filledFromRight = 1;
      else filledFromRight = 0;

      for (let col = 0; col < cols; col++) {
        const vx = bx + col * (voidW + colStructW) + colStructW;
        const vy = by + row * (voidH + slabH) + slabH;

        const colFromRight = cols - 1 - col;

        if (colFromRight < filledFromRight) {
          // Filled with dark blue glass panel
          c.fillStyle = C.facadeDark;
          c.fillRect(vx, vy, voidW, voidH);

          // Subtle window division lines
          c.strokeStyle = C.facadeLight;
          c.lineWidth = 0.5;
          const midX = vx + voidW / 2;
          c.beginPath();
          c.moveTo(midX, vy);
          c.lineTo(midX, vy + voidH);
          c.stroke();
        }
        // Left voids remain empty (show background)
      }
    }

    // ── Yellow rebar protruding from top ──
    const rebarCount = 6;
    for (let i = 0; i < rebarCount; i++) {
      const rx = bx + colStructW + i * (finalW - colStructW * 2) / (rebarCount - 1);
      const rh = this.rebarHeights[i] * voidH * 0.8;
      c.fillStyle = C.yellow;
      c.fillRect(rx - 1.5, by - rh, 3, rh);
    }
  }

  // ── 4. Secondary Building (behind main, right side, 4 floors) ─
  private drawSecondaryBuilding(c: CanvasRenderingContext2D, W: number, H: number, groundY: number) {
    const bw = W * 0.13;
    const floors = 5;
    const bh = bw * 1.5;
    const maxH = H * 0.32;
    const finalH = Math.min(bh, maxH);
    const finalW = bw;
    const bx = W * 0.38;
    const by = groundY - finalH;

    const cols = 3;
    const rows = floors;
    const colStructW = 3.5;
    const slabH = 3;

    const innerW = finalW - (cols + 1) * colStructW;
    const innerH = finalH - (rows + 1) * slabH;
    const voidW = innerW / cols;
    const voidH = innerH / rows;

    // ── Grid structure (gray-beige) ──
    c.fillStyle = C.columnSecondary;

    // Vertical columns
    for (let i = 0; i <= cols; i++) {
      const cx = bx + i * (voidW + colStructW);
      c.fillRect(cx, by, colStructW, finalH);
    }

    // Horizontal slabs
    for (let i = 0; i <= rows; i++) {
      const sy = by + i * (voidH + slabH);
      c.fillRect(bx, sy, finalW, slabH);
    }

    // ── Voids: alternating open and blue-gray filled ──
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const vx = bx + col * (voidW + colStructW) + colStructW;
        const vy = by + row * (voidH + slabH) + slabH;

        // Alternating pattern - checkerboard
        if ((row + col) % 2 === 0) {
          c.fillStyle = C.blueGrayMed;
          c.fillRect(vx, vy, voidW, voidH);
        }
      }
    }

    // ── Scaffolding on right side ──
    const scaffX = bx + finalW + 2;
    const scaffW = 10;
    c.strokeStyle = C.yellow;
    c.lineWidth = 2;

    // Vertical pipes
    c.beginPath();
    c.moveTo(scaffX, groundY);
    c.lineTo(scaffX, by - 3);
    c.moveTo(scaffX + scaffW, groundY);
    c.lineTo(scaffX + scaffW, by - 3);
    c.stroke();

    // Horizontal rails at each floor
    for (let i = 0; i <= rows; i++) {
      const fy = by + i * (voidH + slabH);
      c.beginPath();
      c.moveTo(scaffX, fy);
      c.lineTo(scaffX + scaffW, fy);
      c.stroke();
    }

    // Diagonal bracing
    c.lineWidth = 1.2;
    for (let i = 0; i < rows; i++) {
      const fy1 = by + i * (voidH + slabH);
      const fy2 = by + (i + 1) * (voidH + slabH);
      c.beginPath();
      if (i % 2 === 0) {
        c.moveTo(scaffX, fy1);
        c.lineTo(scaffX + scaffW, fy2);
      } else {
        c.moveTo(scaffX + scaffW, fy1);
        c.lineTo(scaffX, fy2);
      }
      c.stroke();
    }

    // ── Small scaffolding on left side too ──
    const scaffLX = bx - scaffW - 2;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(scaffLX, groundY);
    c.lineTo(scaffLX, by - 3);
    c.moveTo(scaffLX + scaffW, groundY);
    c.lineTo(scaffLX + scaffW, by - 3);
    c.stroke();

    for (let i = 0; i <= rows; i++) {
      const fy = by + i * (voidH + slabH);
      c.beginPath();
      c.moveTo(scaffLX, fy);
      c.lineTo(scaffLX + scaffW, fy);
      c.stroke();
    }

    c.lineWidth = 1.2;
    for (let i = 0; i < rows; i++) {
      const fy1 = by + i * (voidH + slabH);
      const fy2 = by + (i + 1) * (voidH + slabH);
      c.beginPath();
      if (i % 2 === 1) {
        c.moveTo(scaffLX, fy1);
        c.lineTo(scaffLX + scaffW, fy2);
      } else {
        c.moveTo(scaffLX + scaffW, fy1);
        c.lineTo(scaffLX, fy2);
      }
      c.stroke();
    }

    // Ladder on right scaffold
    c.lineWidth = 1.5;
    const ladderX = scaffX + scaffW + 2;
    c.beginPath();
    c.moveTo(ladderX, groundY);
    c.lineTo(ladderX - 3, by + finalH * 0.3);
    c.moveTo(ladderX + 5, groundY);
    c.lineTo(ladderX + 2, by + finalH * 0.3);
    c.stroke();
    // Rungs
    const ladderTop = by + finalH * 0.3;
    const ladderLen = groundY - ladderTop;
    c.lineWidth = 1;
    for (let i = 1; i <= 8; i++) {
      const t = i / 9;
      const ry = groundY - ladderLen * t;
      const offset = -3 * t;
      c.beginPath();
      c.moveTo(ladderX + offset, ry);
      c.lineTo(ladderX + 5 + offset * 0.6, ry);
      c.stroke();
    }
  }

  // ── 5. Tower Crane ────────────────────────────────────────────
  private drawTowerCrane(c: CanvasRenderingContext2D, W: number, H: number, groundY: number) {
    const baseX = W * 0.55;
    const baseW = 12;
    const towerTop = H * 0.05;
    const towerH = groundY - towerTop;

    // ── Mast (lattice tower) ──
    c.strokeStyle = C.yellow;
    c.lineWidth = 2.5;

    c.beginPath();
    c.moveTo(baseX - baseW / 2, groundY);
    c.lineTo(baseX - baseW / 2, towerTop);
    c.moveTo(baseX + baseW / 2, groundY);
    c.lineTo(baseX + baseW / 2, towerTop);
    c.stroke();

    // Lattice cross-bracing
    c.lineWidth = 1;
    const segCount = Math.floor(towerH / 18);
    const segH = towerH / segCount;
    for (let i = 0; i < segCount; i++) {
      const y1 = groundY - i * segH;
      const y2 = groundY - (i + 1) * segH;
      c.beginPath();
      if (i % 2 === 0) {
        c.moveTo(baseX - baseW / 2, y1);
        c.lineTo(baseX + baseW / 2, y2);
      } else {
        c.moveTo(baseX + baseW / 2, y1);
        c.lineTo(baseX - baseW / 2, y2);
      }
      c.stroke();
    }

    // ── Operator cabin ──
    const cabinW = 14;
    const cabinH = 10;
    const cabinX = baseX - cabinW / 2;
    const cabinY = towerTop;

    c.fillStyle = C.cabinOrange;
    c.fillRect(cabinX, cabinY, cabinW, cabinH);
    c.fillStyle = C.yellowLight;
    c.fillRect(cabinX + 2, cabinY + 2, cabinW - 4, cabinH - 4);

    // ── A-frame / cat head ──
    const catTopY = towerTop - 16;
    c.strokeStyle = C.yellow;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(baseX - baseW / 2 - 2, towerTop);
    c.lineTo(baseX, catTopY);
    c.lineTo(baseX + baseW / 2 + 2, towerTop);
    c.stroke();

    // ── Jib (main boom) extending LEFT ──
    const jibLen = W * 0.30;
    const jibY = towerTop - 3;
    const jibEndX = baseX - jibLen;
    const jibH = 5;

    c.strokeStyle = C.yellow;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(baseX, jibY);
    c.lineTo(jibEndX, jibY);
    c.moveTo(baseX, jibY + jibH);
    c.lineTo(jibEndX, jibY + jibH);
    c.stroke();

    // Jib lattice
    c.lineWidth = 0.7;
    const jibSegs = Math.floor(jibLen / 12);
    const jibSegW = jibLen / jibSegs;
    for (let i = 0; i < jibSegs; i++) {
      const x1 = baseX - i * jibSegW;
      const x2 = baseX - (i + 1) * jibSegW;
      c.beginPath();
      if (i % 2 === 0) {
        c.moveTo(x1, jibY);
        c.lineTo(x2, jibY + jibH);
      } else {
        c.moveTo(x1, jibY + jibH);
        c.lineTo(x2, jibY);
      }
      c.stroke();
    }

    // ── Counter-jib (right side, shorter) ──
    const cjLen = W * 0.09;
    const cjEndX = baseX + cjLen;

    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(baseX, jibY);
    c.lineTo(cjEndX, jibY);
    c.moveTo(baseX, jibY + jibH);
    c.lineTo(cjEndX, jibY + jibH);
    c.stroke();

    // Counter-jib lattice
    c.lineWidth = 0.7;
    const cjSegs = Math.max(Math.floor(cjLen / 12), 1);
    const cjSegW = cjLen / cjSegs;
    for (let i = 0; i < cjSegs; i++) {
      const x1 = baseX + i * cjSegW;
      const x2 = baseX + (i + 1) * cjSegW;
      c.beginPath();
      if (i % 2 === 0) {
        c.moveTo(x1, jibY);
        c.lineTo(x2, jibY + jibH);
      } else {
        c.moveTo(x1, jibY + jibH);
        c.lineTo(x2, jibY);
      }
      c.stroke();
    }

    // Counterweight blocks
    c.fillStyle = C.counterweight;
    c.fillRect(cjEndX - 16, jibY + jibH + 1, 16, 8);
    c.fillStyle = C.panel;
    c.fillRect(cjEndX - 12, jibY + jibH + 2, 8, 6);

    // ── Pendant lines ──
    c.strokeStyle = C.yellow;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(baseX, catTopY);
    c.lineTo(jibEndX + 8, jibY);
    c.moveTo(baseX, catTopY);
    c.lineTo(cjEndX - 4, jibY);
    c.stroke();

    // ── Trolley (animated) ──
    const trolleyT = 0.30 + 0.20 * Math.sin(this.t * 0.0003);
    const trolleyX = baseX - jibLen * trolleyT;

    c.fillStyle = C.yellow;
    c.fillRect(trolleyX - 4, jibY + jibH, 8, 4);

    // ── Hook cable + panel ──
    const hookSwayX = Math.sin(this.t * 0.0008) * 2.5;
    const cableLen = 35 + 6 * Math.sin(this.t * 0.0005);
    const hookX = trolleyX + hookSwayX;
    const hookY = jibY + jibH + 4 + cableLen;

    c.strokeStyle = C.counterweight;
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(trolleyX, jibY + jibH + 4);
    c.lineTo(hookX, hookY);
    c.stroke();

    // Hanging panel
    c.fillStyle = C.panelLight;
    c.fillRect(hookX - 12, hookY, 24, 7);
    c.strokeStyle = C.counterweight;
    c.lineWidth = 0.8;
    c.strokeRect(hookX - 12, hookY, 24, 7);

    // Hook
    c.strokeStyle = C.wheel;
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(hookX, hookY + 1, 2.5, 0, Math.PI);
    c.stroke();
  }

  // ── 6. Mobile Crane (left side) ──────────────────────────────
  private drawMobileCrane(c: CanvasRenderingContext2D, W: number, H: number, groundY: number) {
    const truckW = W * 0.08;
    const truckH = H * 0.035;
    const truckX = W * 0.06;
    const truckY = groundY - truckH;

    // Truck body
    c.fillStyle = C.yellow;
    this.roundRect(c, truckX, truckY, truckW, truckH, 3);
    c.fill();

    // Darker stripe on truck
    c.fillStyle = C.yellowDark;
    c.fillRect(truckX + truckW * 0.35, truckY + 2, truckW * 0.6, truckH - 4);

    // Cabin
    const cabW = truckW * 0.32;
    const cabH = truckH * 1.4;
    c.fillStyle = C.cabinOrange;
    this.roundRect(c, truckX, truckY - cabH + truckH, cabW, cabH, 2);
    c.fill();

    // Cabin window
    c.fillStyle = C.yellowLight;
    c.fillRect(truckX + 2, truckY - cabH + truckH + 2, cabW - 4, cabH * 0.4);

    // Wheels
    const wheelR = H * 0.013;
    const wheels = [truckX + truckW * 0.2, truckX + truckW * 0.5, truckX + truckW * 0.8];
    for (const wx of wheels) {
      c.fillStyle = C.wheel;
      c.beginPath();
      c.arc(wx, groundY, wheelR, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = C.wheelHub;
      c.beginPath();
      c.arc(wx, groundY, wheelR * 0.35, 0, Math.PI * 2);
      c.fill();
    }

    // ── Telescopic boom ──
    const boomBaseX = truckX + cabW * 0.5;
    const boomBaseY = truckY - cabH + truckH + 3;
    const boomAngle = -Math.PI * 0.35;
    const boomLen = H * 0.32;
    const boomEndX = boomBaseX + Math.cos(boomAngle) * boomLen;
    const boomEndY = boomBaseY + Math.sin(boomAngle) * boomLen;

    // Outer boom
    c.strokeStyle = C.yellow;
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(boomBaseX, boomBaseY);
    c.lineTo(boomEndX, boomEndY);
    c.stroke();

    // Inner telescopic section
    c.strokeStyle = C.yellowLight;
    c.lineWidth = 2.5;
    const innerStart = 0.25;
    c.beginPath();
    c.moveTo(
      boomBaseX + Math.cos(boomAngle) * boomLen * innerStart,
      boomBaseY + Math.sin(boomAngle) * boomLen * innerStart,
    );
    c.lineTo(boomEndX, boomEndY);
    c.stroke();

    // Boom tip
    c.fillStyle = C.yellow;
    c.beginPath();
    c.arc(boomEndX, boomEndY, 2.5, 0, Math.PI * 2);
    c.fill();

    // Short cable
    c.strokeStyle = C.counterweight;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(boomEndX, boomEndY);
    c.lineTo(boomEndX + 1, boomEndY + 15);
    c.stroke();

    // Hook
    c.strokeStyle = C.wheel;
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(boomEndX + 1, boomEndY + 17, 2, 0, Math.PI);
    c.stroke();
  }

  // ── 7. Ground ─────────────────────────────────────────────────
  private drawGround(c: CanvasRenderingContext2D, W: number, H: number, groundY: number) {
    // Just a thin ground line — no fill below (white background continues)
    c.strokeStyle = C.groundLine;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, groundY);
    c.lineTo(W, groundY);
    c.stroke();

    // Dirt mound 1 (right side)
    c.fillStyle = C.ochre;
    c.beginPath();
    c.moveTo(W * 0.70, groundY);
    c.bezierCurveTo(W * 0.72, groundY - H * 0.035, W * 0.77, groundY - H * 0.05, W * 0.80, groundY);
    c.fill();

    // Dirt mound 2
    c.fillStyle = C.ochreDark;
    c.beginPath();
    c.moveTo(W * 0.77, groundY);
    c.bezierCurveTo(W * 0.78, groundY - H * 0.025, W * 0.82, groundY - H * 0.038, W * 0.85, groundY);
    c.fill();

    // Small sand pile
    c.fillStyle = C.ochreLight;
    c.beginPath();
    c.moveTo(W * 0.65, groundY);
    c.bezierCurveTo(W * 0.66, groundY - H * 0.012, W * 0.68, groundY - H * 0.02, W * 0.70, groundY);
    c.fill();
  }

  // ── 8. Particles (dust) ───────────────────────────────────────
  private drawParticles(c: CanvasRenderingContext2D, W: number, H: number) {
    for (const p of this.pt) {
      p.life += 16 * this.sp;
      if (p.life > p.maxLife) {
        Object.assign(p, this.makeParticle());
        p.life = 0;
      }

      p.x += p.vx;
      p.y += p.vy;

      const lifeRatio = p.life / p.maxLife;
      let alpha = p.a;
      if (lifeRatio < 0.1) alpha *= lifeRatio / 0.1;
      else if (lifeRatio > 0.8) alpha *= (1 - lifeRatio) / 0.2;

      c.fillStyle = `rgba(180, 160, 130, ${alpha})`;
      c.beginPath();
      c.arc(p.x * W, p.y * H, p.s, 0, Math.PI * 2);
      c.fill();
    }
  }

  // ── Helpers ───────────────────────────────────────────────────
  private roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.arcTo(x + w, y, x + w, y + r, r);
    c.lineTo(x + w, y + h - r);
    c.arcTo(x + w, y + h, x + w - r, y + h, r);
    c.lineTo(x + r, y + h);
    c.arcTo(x, y + h, x, y + h - r, r);
    c.lineTo(x, y + r);
    c.arcTo(x, y, x + r, y, r);
    c.closePath();
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.af);
    window.removeEventListener('resize', this.rr);
    this.cv.removeEventListener('mousemove', this.rm);
    this.cv.removeEventListener('mouseleave', this.rl);
  }
}
