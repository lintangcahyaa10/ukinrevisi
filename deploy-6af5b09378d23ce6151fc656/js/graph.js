// Mesin grafik Kartesius interaktif berbasis canvas.
// Semua refleksi dihitung sebagai transformasi isometri titik-demi-titik,
// sehingga bayangan grafik terhadap y = x / y = −x tampil sebagai relasi (kurva) yang benar,
// bukan dipaksa menjadi fungsi y = g(x).

export const COLORS = {
  original: "#2563eb",
  originalCurve: "#3b82f6",
  mirror: ["#f59e0b", "#8b5cf6"],
  imagePoint: ["#dc2626", "#059669"],
  imageCurve: ["#fb7185", "#34d399"],
  center: "#0f172a",
};

export const REFLECT = {
  "x-axis": () => (x, y) => [x, -y],
  "y-axis": () => (x, y) => [-x, y],
  "x=h": ({ h }) => (x, y) => [2 * h - x, y],
  "y=k": ({ k }) => (x, y) => [x, 2 * k - y],
  "y=x": () => (x, y) => [y, x],
  "y=-x": () => (x, y) => [-y, -x],
  O: () => (x, y) => [-x, -y],
  P: ({ a, b }) => (x, y) => [2 * a - x, 2 * b - y],
};

export const fmt = (v) => {
  if (!Number.isFinite(v)) return "—";
  const r = Math.round(v * 100) / 100;
  const s = (Object.is(r, -0) ? 0 : r).toString().replace(".", ",");
  return s.replace(/^-/, "−");
};

export class Graph {
  constructor(canvas, { onDrag } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onDrag = onDrag;
    this.scene = null;
    this.cx = 0; this.cy = 0; this.unit = 32; // px per satuan
    this.baseSpan = 18; // rentang satuan pada sisi terpendek
    this.zoom = 1;
    this.drag = null;
    this._raf = 0;

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    canvas.addEventListener("pointerdown", (e) => this._down(e));
    canvas.addEventListener("pointermove", (e) => this._move(e));
    canvas.addEventListener("pointerup", (e) => this._up(e));
    canvas.addEventListener("pointercancel", (e) => this._up(e));
    canvas.addEventListener("wheel", (e) => {
      if (!e.ctrlKey && !e.metaKey) return; // jangan ganggu scroll halaman
      e.preventDefault();
      this.zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    this.w = r.width; this.h = r.height;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._updateUnit();
    this.draw();
  }
  _updateUnit() { this.unit = (Math.min(this.w, this.h) / this.baseSpan) * this.zoom; }
  zoomBy(f) { this.zoom = Math.min(6, Math.max(0.3, this.zoom * f)); this._updateUnit(); this.request(); }
  resetView() { this.zoom = 1; this.cx = 0; this.cy = 0; this._updateUnit(); this.request(); }

  setScene(scene) { this.scene = scene; this.request(); }
  request() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this.draw(); });
  }

  // koordinat
  sx(x) { return this.w / 2 + (x - this.cx) * this.unit; }
  sy(y) { return this.h / 2 - (y - this.cy) * this.unit; }
  wx(px) { return this.cx + (px - this.w / 2) / this.unit; }
  wy(py) { return this.cy - (py - this.h / 2) / this.unit; }
  view() {
    return { x0: this.wx(0), x1: this.wx(this.w), y0: this.wy(this.h), y1: this.wy(0) };
  }

  // ---------- interaksi ----------
  _pos(e) { const r = this.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  _hit(px, py) {
    const hs = this.scene?.handles || [];
    let best = null, bd = 22;
    for (const h of hs) {
      const d = Math.hypot(this.sx(h.x) - px, this.sy(h.y) - py);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }
  _down(e) {
    const [px, py] = this._pos(e);
    const h = this._hit(px, py);
    this.canvas.setPointerCapture(e.pointerId);
    this.drag = h ? { kind: "handle", id: h.id } : { kind: "pan", px, py, cx: this.cx, cy: this.cy };
    this.canvas.classList.add(h ? "dragging" : "panning");
  }
  _move(e) {
    const [px, py] = this._pos(e);
    if (!this.drag) {
      this.canvas.style.cursor = this._hit(px, py) ? "grab" : "default";
      return;
    }
    if (this.drag.kind === "pan") {
      this.cx = this.drag.cx - (px - this.drag.px) / this.unit;
      this.cy = this.drag.cy + (py - this.drag.py) / this.unit;
      this.request();
    } else {
      const snap = (v) => Math.round(v * 2) / 2;
      this.onDrag?.(this.drag.id, snap(this.wx(px)), snap(this.wy(py)));
    }
  }
  _up(e) {
    this.drag = null;
    this.canvas.classList.remove("dragging", "panning");
    try { this.canvas.releasePointerCapture(e.pointerId); } catch {}
  }

  // ---------- sampling kurva ----------
  // Mengambil sampel adaptif dari grafik y = f(x) pada kotak B (gabungan pandangan & praimage-nya).
  sampleCurve(fn, B) {
    const segs = [];
    let cur = [];
    const f = (x) => { const y = fn(x); return Number.isFinite(y) ? y : NaN; };
    const tol = 2.5 / this.unit;            // ketelitian ~2,5 px
    const breakJump = (B.y1 - B.y0) * 0.5;  // loncatan besar di akhir subdivisi = asimtot
    const MAX = 16;
    const side = (y) => (y > B.y1 ? 1 : y < B.y0 ? -1 : 0);
    const flush = () => { if (cur.length > 1) segs.push(cur); cur = []; };
    const restart = (x, y) => { flush(); cur = [[x, y]]; };
    const boundary = (xin, xout) => { // xin terdefinisi, xout tidak -> cari batas domain
      for (let i = 0; i < 40; i++) { const m = (xin + xout) / 2; if (Number.isFinite(f(m))) xin = m; else xout = m; }
      return xin;
    };
    const refine = (x0, y0, x1, y1, depth) => {
      const s0 = side(y0);
      if (s0 !== 0 && s0 === side(y1)) { restart(x1, y1); return; }
      const d = Math.hypot(x1 - x0, y1 - y0);
      if (d < tol * 3) { cur.push([x1, y1]); return; }
      if (depth >= MAX) {
        if (Math.abs(y1 - y0) > breakJump) restart(x1, y1); else cur.push([x1, y1]);
        return;
      }
      const xm = (x0 + x1) / 2, ym = f(xm);
      if (!Number.isFinite(ym)) { restart(x1, y1); return; }
      if (depth >= 1 && Math.abs(ym - (y0 + y1) / 2) < tol * 0.5 && x1 - x0 < (B.x1 - B.x0) / 200) {
        cur.push([x1, y1]); return;
      }
      refine(x0, y0, xm, ym, depth + 1);
      refine(xm, ym, x1, y1, depth + 1);
    };

    const N = 400;
    let px = B.x0, py = f(px);
    if (Number.isFinite(py)) cur = [[px, py]];
    for (let i = 1; i <= N; i++) {
      const x = B.x0 + ((B.x1 - B.x0) * i) / N;
      const y = f(x);
      const fp = Number.isFinite(py), fc = Number.isFinite(y);
      if (fp && fc) refine(px, py, x, y, 0);
      else if (fp && !fc) { const bx = boundary(px, x); refine(px, py, bx, f(bx), 0); flush(); }
      else if (!fp && fc) { const bx = boundary(x, px); cur = [[bx, f(bx)]]; refine(bx, f(bx), x, y, 0); }
      px = x; py = y;
    }
    flush();
    return segs;
  }

  // ---------- menggambar ----------
  draw() {
    const { ctx, w, h } = this;
    if (!w) return;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    this._grid();
    const sc = this.scene;
    if (!sc) return;

    const V = this.view();
    const active = sc.mirrors.filter((m) => m.enabled);

    // Kotak sampel = gabungan pandangan dan bayangan pandangan oleh tiap cermin aktif (refleksi = involusi)
    const B = { ...V };
    for (const m of active) {
      const corners = [[V.x0, V.y0], [V.x0, V.y1], [V.x1, V.y0], [V.x1, V.y1]].map(([x, y]) => m.map(x, y));
      for (const [x, y] of corners) {
        B.x0 = Math.min(B.x0, x); B.x1 = Math.max(B.x1, x);
        B.y0 = Math.min(B.y0, y); B.y1 = Math.max(B.y1, y);
      }
    }
    const segs = sc.fn ? this.sampleCurve(sc.fn, B) : [];

    // garis cermin
    for (const m of active) this._mirror(m);

    // kurva bayangan
    if (sc.showCurve) {
      active.forEach((m) => {
        this._polyline(segs.map((s) => s.map(([x, y]) => m.map(x, y))), m.curveColor, 3);
      });
      this._polyline(segs, COLORS.originalCurve, 3.2);
    }

    // garis bantu A -> A'
    const A = sc.A;
    if (sc.showHelpers) {
      for (const m of active) {
        const [x, y] = m.map(A[0], A[1]);
        ctx.save();
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = m.pointColor;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(this.sx(A[0]), this.sy(A[1])); ctx.lineTo(this.sx(x), this.sy(y)); ctx.stroke();
        ctx.restore();
      }
    }

    // titik pusat (aktivitas 4)
    const labels = [];
    const centers = [];
    for (const m of active) if (m.center) { this._center(m.center, m.mirrorColor); centers.push({ x: m.center[0], y: m.center[1], text: m.centerLabel, color: m.mirrorColor }); }

    // titik bayangan
    active.forEach((m) => {
      const [x, y] = m.map(A[0], A[1]);
      this._dot(x, y, m.pointColor);
      labels.push({ x, y, text: `${m.pointName}(${fmt(x)}, ${fmt(y)})`, color: m.pointColor });
    });
    this._dot(A[0], A[1], COLORS.original, 7.5);
    labels.unshift({ x: A[0], y: A[1], text: `A(${fmt(A[0])}, ${fmt(A[1])})`, color: COLORS.original });
    this._labels([...labels, ...centers]);
  }

  _grid() {
    const { ctx, w, h } = this;
    const V = this.view();
    const u = this.unit;
    let step = 1;
    if (u < 14) step = 2;
    if (u < 7) step = 5;
    if (u > 70) step = 0.5;
    ctx.save();
    ctx.lineWidth = 1;
    // grid halus
    for (let x = Math.ceil(V.x0 / step) * step; x <= V.x1; x += step) {
      const p = Math.round(this.sx(x)) + 0.5;
      ctx.strokeStyle = Math.abs(x % (step * 5)) < 1e-9 ? "#dbe3ef" : "#eef2f8";
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, h); ctx.stroke();
    }
    for (let y = Math.ceil(V.y0 / step) * step; y <= V.y1; y += step) {
      const p = Math.round(this.sy(y)) + 0.5;
      ctx.strokeStyle = Math.abs(y % (step * 5)) < 1e-9 ? "#dbe3ef" : "#eef2f8";
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(w, p); ctx.stroke();
    }
    // sumbu
    const ox = this.sx(0), oy = this.sy(0);
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(w, oy); ctx.moveTo(ox, 0); ctx.lineTo(ox, h); ctx.stroke();
    // panah
    ctx.fillStyle = "#334155";
    ctx.beginPath(); ctx.moveTo(w, oy); ctx.lineTo(w - 9, oy - 4.5); ctx.lineTo(w - 9, oy + 4.5); ctx.fill();
    ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox - 4.5, 9); ctx.lineTo(ox + 4.5, 9); ctx.fill();
    // label angka
    ctx.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
    ctx.fillStyle = "#64748b";
    const ly = Math.min(h - 6, Math.max(14, oy + 15));
    const lstep = [1, 2, 5, 10, 20].find((st) => st * u >= 30) || 20;
    ctx.textAlign = "center";
    for (let x = Math.ceil(V.x0 / lstep) * lstep; x <= V.x1; x += lstep) {
      if (Math.abs(x) < 1e-9) continue;
      ctx.fillText(fmt(x), this.sx(x), ly);
    }
    ctx.textAlign = "right";
    const lx = Math.min(w - 4, Math.max(26, ox - 6));
    for (let y = Math.ceil(V.y0 / lstep) * lstep; y <= V.y1; y += lstep) {
      if (Math.abs(y) < 1e-9) continue;
      ctx.fillText(fmt(y), lx, this.sy(y) + 4);
    }
    ctx.fillText("0", ox - 5, oy + 15);
    ctx.font = "italic 600 14px 'Plus Jakarta Sans', sans-serif";
    ctx.fillStyle = "#334155";
    ctx.textAlign = "right";
    ctx.fillText("x", w - 6, oy - 10);
    ctx.textAlign = "left";
    ctx.fillText("y", ox + 10, 16);
    ctx.restore();
  }

  _mirror(m) {
    const { ctx } = this;
    const V = this.view();
    ctx.save();
    ctx.strokeStyle = m.mirrorColor;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    let lbl = null;
    switch (m.type) {
      case "x-axis": ctx.moveTo(0, this.sy(0)); ctx.lineTo(this.w, this.sy(0)); lbl = [this.w - 70, this.sy(0) - 10, "sumbu X"]; break;
      case "y-axis": ctx.moveTo(this.sx(0), 0); ctx.lineTo(this.sx(0), this.h); lbl = [this.sx(0) + 8, 36, "sumbu Y"]; break;
      case "x=h": ctx.moveTo(this.sx(m.params.h), 0); ctx.lineTo(this.sx(m.params.h), this.h); lbl = [this.sx(m.params.h) + 8, 36, `x = ${fmt(m.params.h)}`]; break;
      case "y=k": ctx.moveTo(0, this.sy(m.params.k)); ctx.lineTo(this.w, this.sy(m.params.k)); lbl = [12, this.sy(m.params.k) - 10, `y = ${fmt(m.params.k)}`]; break;
      case "y=x": {
        const a = Math.min(V.x0, V.y0) - 1, b = Math.max(V.x1, V.y1) + 1;
        ctx.moveTo(this.sx(a), this.sy(a)); ctx.lineTo(this.sx(b), this.sy(b));
        const t = Math.min(V.x1, V.y1) - 1.2; lbl = [this.sx(t) - 56, this.sy(t) + 2, "y = x"]; break;
      }
      case "y=-x": {
        const a = Math.min(V.x0, -V.y1) - 1, b = Math.max(V.x1, -V.y0) + 1;
        ctx.moveTo(this.sx(a), this.sy(-a)); ctx.lineTo(this.sx(b), this.sy(-b));
        const t = Math.max(V.x0, -V.y1) + 1.2; lbl = [this.sx(t) + 12, this.sy(-t) + 4, "y = −x"]; break;
      }
      default: break;
    }
    ctx.stroke();
    ctx.restore();
    if (lbl) this._tag(lbl[0], lbl[1], lbl[2], m.mirrorColor);
  }

  _tag(x, y, text, color) {
    const { ctx } = this;
    ctx.save();
    ctx.font = "600 12px 'JetBrains Mono', monospace";
    const tw = ctx.measureText(text).width;
    x = Math.max(4, Math.min(this.w - tw - 14, x));
    y = Math.max(16, Math.min(this.h - 6, y));
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    roundRect(ctx, x - 5, y - 13, tw + 10, 19, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(text, x, y + 1);
    ctx.restore();
  }

  _polyline(segs, color, width) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    const L = 1e5;
    for (const s of segs) {
      ctx.beginPath();
      s.forEach(([x, y], i) => {
        const X = Math.max(-L, Math.min(L, this.sx(x))), Y = Math.max(-L, Math.min(L, this.sy(y)));
        i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      });
      ctx.stroke();
    }
    ctx.restore();
  }

  _dot(x, y, color, r = 6.5) {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "rgba(15,23,42,.25)"; ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.arc(this.sx(x), this.sy(y), r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.stroke();
    ctx.restore();
  }

  _center([x, y], color) {
    const { ctx } = this;
    const X = this.sx(x), Y = this.sy(y), r = 8;
    ctx.save();
    ctx.fillStyle = "#fff"; ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(X, Y - r); ctx.lineTo(X + r, Y); ctx.lineTo(X, Y + r); ctx.lineTo(X - r, Y); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(X, Y, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  _labels(items) {
    const { ctx } = this;
    ctx.save();
    ctx.font = "600 12.5px 'JetBrains Mono', monospace";
    const placed = items.map((it) => ({ x: this.sx(it.x) - 9, y: this.sy(it.y) - 9, w: 18, h: 18 }));
    for (const it of items) {
      const tw = ctx.measureText(it.text).width + 12, th = 21;
      const X = this.sx(it.x), Y = this.sy(it.y);
      const cands = [[10, -30], [10, 10], [-tw - 10, -30], [-tw - 10, 10], [-tw / 2, -36], [-tw / 2, 14], [14, -8], [-tw - 14, -8], [10, -54], [-tw - 10, 34], [10, 34], [-tw - 10, -54]];
      let pos = null;
      for (const [dx, dy] of cands) {
        const r = { x: X + dx, y: Y + dy, w: tw, h: th };
        if (r.x < 2 || r.y < 2 || r.x + r.w > this.w - 2 || r.y + r.h > this.h - 2) continue;
        if (placed.some((p) => !(r.x > p.x + p.w || r.x + r.w < p.x || r.y > p.y + p.h || r.y + r.h < p.y))) continue;
        pos = r; break;
      }
      if (!pos) pos = { x: Math.max(2, Math.min(this.w - tw - 2, X + 10)), y: Math.max(2, Math.min(this.h - th - 2, Y - 30)), w: tw, h: th };
      placed.push(pos);
      ctx.fillStyle = "rgba(255,255,255,.94)";
      ctx.strokeStyle = it.color; ctx.lineWidth = 1.5;
      roundRect(ctx, pos.x, pos.y, pos.w, pos.h, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = it.color;
      ctx.fillText(it.text, pos.x + 6, pos.y + 15);
    }
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
