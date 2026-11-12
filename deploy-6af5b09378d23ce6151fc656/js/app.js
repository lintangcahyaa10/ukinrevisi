import { ACTIVITIES, FUNCTION_PRESETS, answerKey, TOTAL_QUESTIONS } from "./content.js";
import { Graph, COLORS, REFLECT, fmt } from "./graph.js";
import { compile, pretty } from "./expr.js";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LS_TOKEN = "lkm-refleksi.token";
const LS_BACKUP = "lkm-refleksi.backup";
const LS_LAB = "lkm-refleksi.lab";

const state = {
  token: localStorage.getItem(LS_TOKEN) || "",
  sub: null,          // data murid dari server
  answers: {},        // semua jawaban (lokal terkini)
  pending: new Set(), // kunci yang belum tersimpan di server
  current: 1,
  lastSaved: null,
};

/* ------------------------------------------------------------------ API */
async function api(path, { method = "GET", body, keepalive } = {}) {
  const res = await fetch(path, {
    method,
    keepalive,
    headers: { "content-type": "application/json", ...(state.token ? { "x-student-token": state.token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `Gagal (${res.status})`); e.status = res.status; throw e; }
  return data;
}

/* ------------------------------------------------------------ AUTOSAVE */
const statusEl = () => $("#save-status");
function setStatus(kind, text) {
  const el = statusEl(); if (!el) return;
  el.dataset.state = kind;
  $(".text", el).textContent = text;
}
const timeStr = (d) => new Date(d).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function writeBackup() {
  if (!state.token) return;
  localStorage.setItem(LS_BACKUP, JSON.stringify({
    token: state.token,
    pending: Object.fromEntries([...state.pending].map((k) => [k, state.answers[k] ?? ""])),
    current: state.current,
  }));
}

let saveTimer = 0, saving = false, again = false, retryDelay = 3000;
function scheduleSave(delay = 900) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, delay);
}

async function saveNow({ finish = false } = {}) {
  clearTimeout(saveTimer);
  if (!state.token) return;
  if (saving) { again = true; if (!finish) return; await waitIdle(); }
  saving = true;
  const keys = [...state.pending];
  const payload = Object.fromEntries(keys.map((k) => [k, state.answers[k] ?? ""]));
  setStatus("saving", "Menyimpan…");
  try {
    const res = await api("/api/student/save", { method: "POST", body: { answers: payload, currentActivity: state.current, finish } });
    for (const k of keys) if (state.answers[k] === payload[k]) state.pending.delete(k);
    state.lastSaved = res.savedAt;
    if (state.sub) { state.sub.status = res.status; state.sub.updatedAt = res.savedAt; }
    writeBackup();
    retryDelay = 3000;
    setStatus("saved", `Tersimpan otomatis · ${timeStr(res.savedAt)}`);
    return res;
  } catch (err) {
    writeBackup();
    setStatus("error", navigator.onLine ? "Gagal menyimpan, mencoba lagi…" : "Offline – jawaban disimpan sementara");
    if (err.status === 404 || err.status === 401) { handleLostSession(); throw err; }
    if (!finish) { setTimeout(() => saveNow(), retryDelay); retryDelay = Math.min(retryDelay * 2, 30000); }
    throw err;
  } finally {
    saving = false;
    if (again) { again = false; scheduleSave(200); }
  }
}
function waitIdle() { return new Promise((r) => { const t = setInterval(() => { if (!saving) { clearInterval(t); r(); } }, 60); }); }

function flushOnExit() {
  if (!state.token || !state.pending.size) return;
  writeBackup();
  const payload = Object.fromEntries([...state.pending].map((k) => [k, state.answers[k] ?? ""]));
  try {
    fetch("/api/student/save", {
      method: "POST", keepalive: true,
      headers: { "content-type": "application/json", "x-student-token": state.token },
      body: JSON.stringify({ answers: payload, currentActivity: state.current }),
    });
  } catch {}
}
addEventListener("pagehide", flushOnExit);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushOnExit(); });
addEventListener("online", () => { if (state.pending.size) saveNow().catch(() => {}); });

function handleLostSession() {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_BACKUP);
  state.token = ""; state.sub = null;
  toast("Sesi tidak ditemukan. Silakan isi identitas kembali.");
  location.hash = "";
  route();
}

/* ------------------------------------------------------------- SESSION */
function applySubmission(sub, token) {
  state.token = token || state.token;
  state.sub = sub;
  localStorage.setItem(LS_TOKEN, state.token);
  state.answers = { ...(sub.answers || {}) };
  state.pending = new Set();
  // gabungkan cadangan lokal yang belum sempat terkirim
  try {
    const b = JSON.parse(localStorage.getItem(LS_BACKUP) || "null");
    if (b && b.token === state.token && b.pending) {
      for (const [k, v] of Object.entries(b.pending)) { state.answers[k] = v; state.pending.add(k); }
    }
  } catch {}
  state.current = Math.min(4, Math.max(1, sub.currentActivity || 1));
  state.lastSaved = sub.updatedAt;
  if (state.pending.size) saveNow().catch(() => {});
}

async function loadSession() {
  if (!state.token) return null;
  try {
    const { submission } = await api("/api/student/me");
    return submission;
  } catch (e) {
    if (e.status === 404 || e.status === 401) { localStorage.removeItem(LS_TOKEN); state.token = ""; }
    return null;
  }
}

/* -------------------------------------------------------------- ROUTER */
function route() {
  const m = location.hash.match(/^#\/aktivitas\/([1-4])$/);
  if (m && state.sub) {
    $("#view-identity").hidden = true;
    $("#view-activity").hidden = false;
    const n = Number(m[1]);
    if (n !== state.current || !$("#activity-root").dataset.rendered || Number($("#activity-root").dataset.rendered) !== n) {
      state.current = n;
      renderActivity(n);
      if (state.token) { state.pending.size ? saveNow().catch(() => {}) : api("/api/student/save", { method: "POST", body: { answers: {}, currentActivity: n } }).then((r) => setStatus("saved", `Tersimpan otomatis · ${timeStr(r.savedAt)}`)).catch(() => {}); }
    }
    renderStepper();
    return;
  }
  if (m && !state.sub) { location.hash = ""; }
  showIdentity();
}
addEventListener("hashchange", route);

/* ------------------------------------------------------- IDENTITY PAGE */
function showIdentity() {
  $("#view-activity").hidden = true;
  $("#view-identity").hidden = false;
  const box = $("#resume-box");
  if (state.sub) {
    box.hidden = false;
    $("#resume-name").textContent = `${state.sub.name} · ${state.sub.className} · Kelompok ${state.sub.groupNumber}`;
  } else box.hidden = true;
}

$("#btn-resume").addEventListener("click", () => { location.hash = `#/aktivitas/${state.current}`; });

$("#identity-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const body = Object.fromEntries([...fd].map(([k, v]) => [k, String(v).trim()]));
  const err = $("#identity-error");
  const form = e.currentTarget;
  form.querySelectorAll("input").forEach((i) => i.classList.toggle("invalid", !i.value.trim()));
  if (!body.name || !body.className || !body.groupNumber) {
    err.textContent = "Lengkapi nama, kelas, dan nomor kelompok terlebih dahulu.";
    return;
  }
  err.textContent = "";
  const btn = $("#btn-start");
  btn.disabled = true; btn.classList.add("loading");
  try {
    const res = await api("/api/student/start", { method: "POST", body: { ...body, token: state.token } });
    if (state.sub && state.sub.id !== res.submission.id) localStorage.removeItem(LS_BACKUP);
    applySubmission(res.submission, res.token);
    $("#activity-root").dataset.rendered = "";
    toast(res.resumed ? `Selamat datang kembali, ${res.submission.name}! Jawaban terakhirmu sudah dimuat.` : `Halo, ${res.submission.name}! Selamat bereksplorasi.`);
    location.hash = `#/aktivitas/${state.current}`;
  } catch (ex) {
    err.textContent = ex.message || "Tidak dapat terhubung ke server. Coba lagi.";
  } finally {
    btn.disabled = false; btn.classList.remove("loading");
  }
});

/* ------------------------------------------------------------- STEPPER */
const answeredCount = (act) => ACTIVITIES[act - 1].questions.filter((_, i) => (state.answers[answerKey(act, i + 1)] || "").trim()).length;

function renderStepper() {
  const nav = $("#stepper");
  const total = ACTIVITIES.reduce((n, a) => n + answeredCount(a.id), 0);
  nav.innerHTML = `
    <div class="stepper-inner">
      ${ACTIVITIES.map((a) => {
        const c = answeredCount(a.id), done = c === a.questions.length;
        return `<a href="#/aktivitas/${a.id}" class="step ${a.id === state.current ? "current" : ""} ${done ? "done" : ""}" data-act="${a.id}" ${a.id === state.current ? 'aria-current="step"' : ""}>
          <span class="step-num">${done ? "✓" : a.id}</span>
          <span class="step-text"><b>Aktivitas ${a.id}</b><small>${esc(a.short)} · ${c}/${a.questions.length}</small></span>
        </a>`;
      }).join("")}
    </div>
    <div class="progress"><div class="progress-bar" style="width:${(total / TOTAL_QUESTIONS) * 100}%"></div></div>`;
  $("#student-chip").textContent = state.sub ? `${state.sub.name} · ${state.sub.className} · Kel. ${state.sub.groupNumber}` : "";
}

/* ------------------------------------------------------------ ACTIVITY */
function loadLab(act) {
  try { return JSON.parse(localStorage.getItem(LS_LAB) || "{}")[act]; } catch { return null; }
}
function saveLab(act, lab) {
  let all = {};
  try { all = JSON.parse(localStorage.getItem(LS_LAB) || "{}"); } catch {}
  all[act] = lab;
  localStorage.setItem(LS_LAB, JSON.stringify(all));
}

let graph = null;

function renderActivity(n) {
  const a = ACTIVITIES[n - 1];
  const root = $("#activity-root");
  root.dataset.rendered = String(n);
  document.body.dataset.act = String(n);
  const saved = loadLab(n) || {};
  const lab = {
    A: saved.A || [...a.defaultA],
    expr: saved.expr || a.defaultFn,
    enabled: saved.enabled || [false, false],
    params: { ...Object.fromEntries(a.params.map((p) => [p.key, p.value])), ...(saved.params || {}) },
    helpers: saved.helpers ?? true,
    showCurve: saved.showCurve ?? true,
  };
  const names = ["A₁′", "A₂′"];
  const finished = state.sub?.status === "selesai";

  root.innerHTML = `
    <section class="act-hero">
      <div class="act-badge">Aktivitas ${n} <span>dari 4</span></div>
      <h2>${esc(a.title)}</h2>
      <p class="goal"><b>Tujuan:</b> ${esc(a.goal)}</p>
      ${finished ? `<p class="done-note">✓ Pekerjaanmu sudah diselesaikan. Kamu masih dapat memperbaiki jawaban—perubahan tetap tersimpan otomatis.</p>` : ""}
    </section>

    <div class="act-grid">
      <details class="card guide" open>
        <summary><span class="ic">🧭</span> Petunjuk Eksplorasi</summary>
        <ol>${a.steps.map((s) => `<li>${s}</li>`).join("")}</ol>
      </details>

      <section class="lab" aria-label="Grafik interaktif">
        <div class="card graph-card">
          <div class="graph-wrap">
            <canvas id="graph" aria-label="Bidang koordinat Kartesius. Geser titik A untuk mengubah koordinatnya."></canvas>
            <div class="zoom">
              <button type="button" data-zoom="in" aria-label="Perbesar">+</button>
              <button type="button" data-zoom="out" aria-label="Perkecil">−</button>
              <button type="button" data-zoom="reset" aria-label="Atur ulang tampilan" title="Atur ulang tampilan">⟲</button>
            </div>
            <p class="graph-tip">Geser titik A${n === 4 ? " atau P" : ""} · seret latar untuk menggeser bidang</p>
          </div>
          <div class="coords" id="coords"></div>
        </div>

        <div class="card controls">
          <div class="ctrl-group">
            <p class="ctrl-title">Pencerminan</p>
            ${a.mirrors.map((m, i) => `
              <label class="switch" style="--c:${COLORS.mirror[i]}">
                <input type="checkbox" data-mirror="${i}" ${lab.enabled[i] ? "checked" : ""} />
                <span class="track"><span class="thumb"></span></span>
                <span class="switch-label">${esc(m.label)}<small>bayangan: <b style="color:${COLORS.imagePoint[i]}">${names[i]}</b></small></span>
              </label>`).join("")}
          </div>

          ${a.params.length ? `
          <div class="ctrl-group">
            <p class="ctrl-title">Parameter cermin</p>
            ${a.params.map((p, i) => `
              <div class="slider" style="--c:${COLORS.mirror[n === 4 ? 1 : i]}">
                <label for="p-${p.key}"><span class="mono">${p.label} = <output id="o-${p.key}">${fmt(lab.params[p.key])}</output></span><small>${esc(p.hint)}</small></label>
                <div class="slider-row">
                  <input type="range" id="p-${p.key}" data-param="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${lab.params[p.key]}" />
                  <input type="number" class="num" data-param-num="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${lab.params[p.key]}" aria-label="nilai ${p.label}" />
                </div>
              </div>`).join("")}
          </div>` : ""}

          <div class="ctrl-group">
            <p class="ctrl-title">Titik A <span class="swatch" style="background:${COLORS.original}"></span></p>
            <div class="point-inputs">
              <label>x <input type="number" class="num" id="ax" step="0.5" min="-15" max="15" value="${lab.A[0]}" /></label>
              <label>y <input type="number" class="num" id="ay" step="0.5" min="-15" max="15" value="${lab.A[1]}" /></label>
            </div>
          </div>

          <div class="ctrl-group">
            <p class="ctrl-title">Grafik fungsi <span class="swatch line" style="background:${COLORS.originalCurve}"></span></p>
            <select id="fn-preset" aria-label="Pilih bentuk fungsi">
              ${FUNCTION_PRESETS.map((f) => `<option value="${esc(f.expr)}">${esc(f.label)}: y = ${esc(pretty(f.expr))}</option>`).join("")}
              <option value="__custom">Tulis fungsi sendiri…</option>
            </select>
            <div class="fn-input">
              <span class="mono">y =</span>
              <input id="fn" value="${esc(lab.expr)}" spellcheck="false" autocomplete="off" aria-label="Rumus fungsi f(x)" />
            </div>
            <p class="fn-help" id="fn-help">Contoh: <code>2x + 1</code>, <code>x^2 - 3</code>, <code>sqrt(x)</code>, <code>2^x</code>, <code>sin(x)</code></p>
          </div>

          <div class="ctrl-group toggles">
            <label class="check"><input type="checkbox" id="opt-curve" ${lab.showCurve ? "checked" : ""}/> Tampilkan grafik fungsi</label>
            <label class="check"><input type="checkbox" id="opt-help" ${lab.helpers ? "checked" : ""}/> Garis bantu A ke bayangan</label>
          </div>
        </div>
      </section>

      <section class="questions" aria-label="Pertanyaan eksplorasi">
        <div class="q-head">
          <h3>Pertanyaan Eksplorasi</h3>
          <p>Jawab berdasarkan hasil pengamatanmu pada grafik.</p>
        </div>
        ${a.questions.map((q, i) => {
          const key = answerKey(n, i + 1);
          return `<article class="card q-card" id="q-${key}">
            <div class="q-top"><span class="q-num">${i + 1}</span><p class="q-text">${esc(q)}</p></div>
            <textarea data-key="${key}" rows="4" placeholder="Tulis jawabanmu di sini…" aria-label="Jawaban pertanyaan ${i + 1}">${esc(state.answers[key] || "")}</textarea>
            <div class="q-foot"><span class="q-state" data-state-for="${key}">${(state.answers[key] || "").trim() ? "✓ Terjawab" : "Belum dijawab"}</span></div>
          </article>`;
        }).join("")}
      </section>
    </div>

    <nav class="act-nav" aria-label="Navigasi aktivitas">
      ${n > 1 ? `<a class="btn btn-ghost" href="#/aktivitas/${n - 1}">← Aktivitas ${n - 1}</a>` : `<a class="btn btn-ghost" href="#">← Identitas</a>`}
      ${n < 4 ? `<a class="btn btn-primary" href="#/aktivitas/${n + 1}">Aktivitas ${n + 1} →</a>`
              : `<button class="btn btn-finish" id="btn-finish" type="button">Simpan dan Selesaikan ✓</button>`}
    </nav>`;

  // ------- graf
  graph?.ro?.disconnect();
  const canvas = $("#graph");
  let fn = null;
  const presetSel = $("#fn-preset");
  const fnInput = $("#fn");
  const help = $("#fn-help");
  const syncPreset = () => {
    const found = FUNCTION_PRESETS.find((f) => f.expr === lab.expr.trim());
    presetSel.value = found ? found.expr : "__custom";
  };
  const parseFn = () => {
    try {
      fn = compile(lab.expr);
      fnInput.classList.remove("invalid");
      help.classList.remove("err");
      help.innerHTML = `f(x) = <b class="mono">${esc(pretty(lab.expr))}</b>`;
    } catch (e) {
      fnInput.classList.add("invalid");
      help.classList.add("err");
      help.textContent = `Rumus belum valid: ${e.message}. Gunakan x sebagai variabel, misalnya 2x^2 - 1.`;
    }
  };

  const mirrorObj = (i) => {
    const m = a.mirrors[i];
    const P = lab.params;
    return {
      type: m.type,
      enabled: lab.enabled[i],
      params: P,
      map: REFLECT[m.type](P),
      mirrorColor: COLORS.mirror[i],
      pointColor: COLORS.imagePoint[i],
      curveColor: COLORS.imageCurve[i],
      pointName: names[i],
      center: m.type === "O" ? [0, 0] : m.type === "P" ? [P.a, P.b] : null,
      centerLabel: m.type === "O" ? "O(0, 0)" : m.type === "P" ? `P(${fmt(P.a)}, ${fmt(P.b)})` : "",
    };
  };

  const coordsEl = $("#coords");
  const update = () => {
    const mirrors = a.mirrors.map((_, i) => mirrorObj(i));
    const handles = [{ id: "A", x: lab.A[0], y: lab.A[1] }];
    if (n === 4 && lab.enabled[1]) handles.push({ id: "P", x: lab.params.a, y: lab.params.b });
    graph.setScene({ fn, A: lab.A, mirrors, handles, showHelpers: lab.helpers, showCurve: lab.showCurve });
    coordsEl.innerHTML = `
      <div class="coord" style="--c:${COLORS.original}"><span class="pt"></span><span>Titik awal</span><b class="mono">A(${fmt(lab.A[0])}, ${fmt(lab.A[1])})</b></div>
      ${mirrors.map((m, i) => {
        const [x, y] = m.map(lab.A[0], lab.A[1]);
        return `<div class="coord ${m.enabled ? "" : "off"}" style="--c:${m.pointColor}"><span class="pt"></span><span>Bayangan (${esc(a.mirrors[i].tag)})</span><b class="mono">${m.enabled ? `${names[i]}(${fmt(x)}, ${fmt(y)})` : "nonaktif"}</b></div>`;
      }).join("")}
      <div class="legend">
        <span><i class="ln" style="background:${COLORS.originalCurve}"></i>grafik awal</span>
        ${a.mirrors.map((m, i) => `<span><i class="ln dash" style="--c:${COLORS.mirror[i]}"></i>cermin ${esc(m.tag)}</span><span><i class="ln" style="background:${COLORS.imageCurve[i]}"></i>bayangan grafik (${esc(m.tag)})</span>`).join("")}
      </div>`;
    saveLab(n, lab);
  };

  graph = new Graph(canvas, {
    onDrag: (id, x, y) => {
      const clamp = (v) => Math.max(-15, Math.min(15, v));
      if (id === "A") { lab.A = [clamp(x), clamp(y)]; $("#ax").value = lab.A[0]; $("#ay").value = lab.A[1]; }
      if (id === "P") {
        lab.params.a = Math.max(-6, Math.min(6, x)); lab.params.b = Math.max(-6, Math.min(6, y));
        for (const k of ["a", "b"]) { $(`#p-${k}`).value = lab.params[k]; $(`[data-param-num="${k}"]`).value = lab.params[k]; $(`#o-${k}`).textContent = fmt(lab.params[k]); }
      }
      update();
    },
  });
  root.querySelectorAll("[data-zoom]").forEach((b) => b.addEventListener("click", () => {
    const z = b.dataset.zoom;
    z === "in" ? graph.zoomBy(1.25) : z === "out" ? graph.zoomBy(0.8) : graph.resetView();
  }));

  syncPreset();
  parseFn();

  root.querySelectorAll("[data-mirror]").forEach((cb) => cb.addEventListener("change", () => {
    lab.enabled[Number(cb.dataset.mirror)] = cb.checked; update();
  }));
  const setParam = (k, v) => {
    const p = a.params.find((x) => x.key === k);
    v = Math.max(p.min, Math.min(p.max, Number(v)));
    if (!Number.isFinite(v)) return;
    lab.params[k] = v;
    $(`#p-${k}`).value = v; $(`#o-${k}`).textContent = fmt(v);
    update();
  };
  root.querySelectorAll("[data-param]").forEach((r) => r.addEventListener("input", () => {
    $(`[data-param-num="${r.dataset.param}"]`).value = r.value; setParam(r.dataset.param, r.value);
  }));
  root.querySelectorAll("[data-param-num]").forEach((r) => r.addEventListener("input", () => {
    if (r.value !== "" && Number.isFinite(Number(r.value))) setParam(r.dataset.paramNum, r.value);
  }));
  const onPoint = () => {
    const x = Number($("#ax").value), y = Number($("#ay").value);
    if ($("#ax").value === "" || $("#ay").value === "" || !Number.isFinite(x) || !Number.isFinite(y)) return;
    lab.A = [Math.max(-15, Math.min(15, x)), Math.max(-15, Math.min(15, y))]; update();
  };
  $("#ax").addEventListener("input", onPoint);
  $("#ay").addEventListener("input", onPoint);
  presetSel.addEventListener("change", () => {
    if (presetSel.value === "__custom") { fnInput.focus(); fnInput.select(); return; }
    lab.expr = presetSel.value; fnInput.value = lab.expr; parseFn(); update();
  });
  fnInput.addEventListener("input", () => { lab.expr = fnInput.value; syncPreset(); parseFn(); update(); });
  $("#opt-help").addEventListener("change", (e) => { lab.helpers = e.target.checked; update(); });
  $("#opt-curve").addEventListener("change", (e) => { lab.showCurve = e.target.checked; update(); });

  // ------- jawaban
  root.querySelectorAll("textarea[data-key]").forEach((ta) => {
    const grow = () => { ta.style.height = "auto"; ta.style.height = Math.max(110, ta.scrollHeight + 2) + "px"; };
    requestAnimationFrame(grow);
    ta.addEventListener("input", () => {
      const k = ta.dataset.key;
      state.answers[k] = ta.value;
      state.pending.add(k);
      writeBackup();
      grow();
      $(`[data-state-for="${k}"]`).textContent = ta.value.trim() ? "✓ Terjawab" : "Belum dijawab";
      setStatus("dirty", "Perubahan belum tersimpan…");
      scheduleSave();
      renderStepper();
    });
    ta.addEventListener("blur", () => { if (state.pending.size) saveNow().catch(() => {}); });
  });

  $("#btn-finish")?.addEventListener("click", onFinish);

  update();
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

/* -------------------------------------------------------------- FINISH */
function onFinish() {
  const missing = [];
  ACTIVITIES.forEach((a) => a.questions.forEach((_, i) => {
    if (!(state.answers[answerKey(a.id, i + 1)] || "").trim()) missing.push(`Aktivitas ${a.id} no. ${i + 1}`);
  }));
  if (missing.length) {
    openModal({
      icon: "!", tone: "warn",
      title: "Masih ada pertanyaan kosong",
      body: `<p>Kamu belum menjawab <b>${missing.length}</b> pertanyaan:</p><ul class="missing">${missing.map((m) => `<li>${m}</li>`).join("")}</ul><p>Apakah kamu tetap ingin menyelesaikan LKM?</p>`,
      actions: [
        { label: "Kembali mengerjakan", kind: "ghost" },
        { label: "Tetap selesaikan", kind: "primary", onClick: doFinish },
      ],
    });
  } else doFinish();
}

async function doFinish() {
  const btn = $("#btn-finish");
  if (btn) { btn.disabled = true; btn.textContent = "Menyimpan…"; }
  // pastikan semua kunci terkirim
  ACTIVITIES.forEach((a) => a.questions.forEach((_, i) => state.pending.add(answerKey(a.id, i + 1))));
  try {
    const res = await saveNow({ finish: true });
    const d = new Date(res.savedAt);
    openModal({
      icon: "✓", tone: "ok",
      title: "Pekerjaan berhasil disimpan!",
      body: `<p>Terima kasih, <b>${esc(state.sub.name)}</b>. Seluruh jawabanmu pada Aktivitas 1–4 telah tersimpan dan dapat dilihat oleh guru.</p>
             <p class="meta">${esc(state.sub.className)} · Kelompok ${esc(state.sub.groupNumber)}<br/>Disimpan ${d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}, pukul ${timeStr(d)}</p>`,
      actions: [
        { label: "Lihat kembali jawaban", kind: "ghost", onClick: () => renderActivity(state.current) },
        { label: "Keluar", kind: "primary", onClick: logout },
      ],
    });
  } catch (e) {
    openModal({
      icon: "×", tone: "err",
      title: "Belum berhasil menyimpan",
      body: `<p>${esc(e.message)}. Periksa koneksi internetmu, lalu coba lagi. Jawabanmu tetap aman di perangkat ini.</p>`,
      actions: [{ label: "Coba lagi", kind: "primary", onClick: doFinish }],
    });
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Simpan dan Selesaikan ✓"; }
  }
}

function logout() {
  flushOnExit();
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_BACKUP);
  localStorage.removeItem(LS_LAB);
  state.token = ""; state.sub = null; state.answers = {}; state.pending.clear();
  $("#identity-form").reset();
  $("#activity-root").dataset.rendered = "";
  location.hash = "";
  showIdentity();
}

/* ------------------------------------------------------------ UI UTILS */
function openModal({ icon, tone, title, body, actions }) {
  const m = $("#modal");
  $("#modal-icon").textContent = icon;
  $("#modal-icon").dataset.tone = tone;
  $("#modal-title").textContent = title;
  $("#modal-body").innerHTML = body;
  const act = $("#modal-actions");
  act.innerHTML = "";
  actions.forEach((a) => {
    const b = document.createElement("button");
    b.className = `btn btn-${a.kind}`;
    b.textContent = a.label;
    b.addEventListener("click", () => { m.hidden = true; a.onClick?.(); });
    act.appendChild(b);
  });
  m.hidden = false;
  act.lastChild?.focus();
}
let toastT = 0;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.hidden = true), 3800);
}

$("#btn-logout").addEventListener("click", () => {
  openModal({
    icon: "↩", tone: "warn", title: "Keluar dari LKM?",
    body: "<p>Jawabanmu tetap tersimpan di server. Untuk melanjutkan nanti, isi kembali nama, kelas, dan nomor kelompok yang sama.</p>",
    actions: [{ label: "Batal", kind: "ghost" }, { label: "Keluar", kind: "primary", onClick: async () => { if (state.pending.size) await saveNow().catch(() => {}); logout(); } }],
  });
});

/* ---------------------------------------------------------------- INIT */
(async function init() {
  const sub = await loadSession();
  if (sub) applySubmission(sub);
  route();
})();
