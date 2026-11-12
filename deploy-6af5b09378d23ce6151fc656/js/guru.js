import { ACTIVITIES, answerKey, TOTAL_QUESTIONS } from "./content.js";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ACT_COLORS = ["#0f766e", "#c2410c", "#6d28d9", "#be123c"];
const SS_TOKEN = "lkm-refleksi.guru";

let token = sessionStorage.getItem(SS_TOKEN) || "";
let all = [];
let current = null;

const fmtDate = (d) => d ? new Date(d).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const isDone = (s) => s.status === "selesai";
const answered = (s, act) => ACTIVITIES[act - 1].questions.filter((_, i) => (s.answers?.[answerKey(act, i + 1)] || "").trim()).length;
const answeredAll = (s) => ACTIVITIES.reduce((n, a) => n + answered(s, a.id), 0);
const naturalCmp = (a, b) => String(a).localeCompare(String(b), "id", { numeric: true, sensitivity: "base" });

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/api/teacher/login") { logout(); throw new Error("Sesi guru berakhir, silakan masuk lagi."); }
  if (!res.ok) throw new Error(data.error || `Gagal (${res.status})`);
  return data;
}

/* ------------------------------------------------------------ LOGIN */
function showLogin() { $("#login-view").hidden = false; $("#dash-view").hidden = true; $("#login-form input").focus(); }
function logout() {
  token = ""; sessionStorage.removeItem(SS_TOKEN);
  clearInterval(pollT);
  $("#drawer").hidden = true;
  showLogin();
}
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const pw = form.password.value;
  const btn = $("#btn-login");
  btn.disabled = true; btn.classList.add("loading");
  $("#login-error").textContent = "";
  try {
    const r = await api("/api/teacher/login", { method: "POST", body: JSON.stringify({ password: pw }) });
    token = r.token; sessionStorage.setItem(SS_TOKEN, token);
    form.reset();
    showDash();
  } catch (err) {
    $("#login-error").textContent = err.message;
  } finally { btn.disabled = false; btn.classList.remove("loading"); }
});
$("#btn-logout").addEventListener("click", logout);

/* -------------------------------------------------------- DASHBOARD */
let pollT = 0;
function showDash() {
  $("#login-view").hidden = true; $("#dash-view").hidden = false;
  load();
  clearInterval(pollT);
  pollT = setInterval(() => { if (document.visibilityState === "visible") load(true); }, 30000);
}

async function load(quiet = false) {
  const st = $("#sync-status");
  if (!quiet) { st.dataset.state = "saving"; $(".text", st).textContent = "Memuat…"; }
  try {
    const r = await api("/api/teacher/data/submissions");
    all = r.submissions;
    fillFilters();
    render();
    if (current) { const s = all.find((x) => x.id === current.id); if (s) { current = s; renderDetail(); } }
    st.dataset.state = "saved";
    $(".text", st).textContent = `Diperbarui ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`;
  } catch (e) {
    st.dataset.state = "error"; $(".text", st).textContent = "Gagal memuat";
    if (!quiet) toast(e.message);
  }
}
$("#btn-refresh").addEventListener("click", () => load());

function fillFilters() {
  const fill = (sel, values, label) => {
    const v = sel.value;
    sel.innerHTML = `<option value="">${label}</option>` + values.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("");
    if (values.includes(v)) sel.value = v;
  };
  fill($("#f-class"), [...new Set(all.map((s) => s.className))].sort(naturalCmp), "Semua kelas");
  const cls = $("#f-class").value;
  fill($("#f-group"), [...new Set(all.filter((s) => !cls || s.className === cls).map((s) => s.groupNumber))].sort(naturalCmp), "Semua kelompok");
}

function filtered() {
  const q = $("#f-search").value.trim().toLowerCase();
  const c = $("#f-class").value, g = $("#f-group").value, st = $("#f-status").value;
  return all
    .filter((s) => (!q || s.name.toLowerCase().includes(q)) && (!c || s.className === c) && (!g || s.groupNumber === g) && (!st || s.status === st))
    .sort((a, b) => naturalCmp(a.className, b.className) || naturalCmp(a.groupNumber, b.groupNumber) || naturalCmp(a.name, b.name));
}
["#f-search", "#f-status", "#f-group"].forEach((id) => $(id).addEventListener("input", render));
$("#f-class").addEventListener("input", () => { fillFilters(); render(); });

function render() {
  const list = filtered();
  const scope = list;
  const done = scope.filter(isDone).length;
  const filteredNote = list.length !== all.length ? "sesuai filter" : "seluruh data";
  $("#stats").innerHTML = `
    <div class="card stat"><p>Total murid</p><b>${scope.length}</b><small>${filteredNote}</small></div>
    <div class="card stat ok"><p>Sudah selesai</p><b>${done}</b><small>menekan “Simpan dan Selesaikan”</small></div>
    <div class="card stat wait"><p>Belum selesai</p><b>${scope.length - done}</b><small>masih mengerjakan</small></div>
    <div class="card stat"><p>Persentase selesai</p><b>${scope.length ? Math.round((done / scope.length) * 100) : 0}%</b><div class="meter"><i style="width:${scope.length ? (done / scope.length) * 100 : 0}%"></i></div></div>`;
  $("#rows").innerHTML = list.map((s, i) => `
    <tr data-id="${s.id}" tabindex="0">
      <td>${i + 1}</td>
      <td class="name">${esc(s.name)}</td>
      <td>${esc(s.className)}</td>
      <td>${esc(s.groupNumber)}</td>
      <td><div class="mini">${ACTIVITIES.map((a, k) => `<i title="Aktivitas ${a.id}: ${answered(s, a.id)}/5" style="--c:${ACT_COLORS[k]};--p:${(answered(s, a.id) / a.questions.length) * 100}%"></i>`).join("")}<span>${answeredAll(s)}/${TOTAL_QUESTIONS}</span></div></td>
      <td>${isDone(s) ? `<span class="badge ok">● Selesai</span>` : `<span class="badge wait">● Belum selesai</span>`}</td>
      <td class="when">${fmtDate(s.updatedAt)}</td>
      <td class="open">Lihat →</td>
    </tr>`).join("");
  $("#empty").hidden = list.length > 0;
  $("#empty").textContent = all.length ? "Tidak ada murid yang cocok dengan pencarian/filter." : "Belum ada murid yang mengisi LKM.";
  $("#tbl-foot").textContent = list.length ? `Menampilkan ${list.length} dari ${all.length} murid. Data diperbarui otomatis setiap 30 detik.` : "";
}
$("#rows").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-id]"); if (tr) openDetail(tr.dataset.id); });
$("#rows").addEventListener("keydown", (e) => { if (e.key === "Enter") { const tr = e.target.closest("tr[data-id]"); if (tr) openDetail(tr.dataset.id); } });

/* ----------------------------------------------------------- DETAIL */
function openDetail(id) {
  current = all.find((s) => s.id === id);
  if (!current) return;
  renderDetail();
  $("#drawer").hidden = false;
  $(".drawer-body").scrollTop = 0;
}
function renderDetail() {
  const s = current;
  $("#d-status").innerHTML = isDone(s) ? `<span class="badge ok">● Selesai</span>` : `<span class="badge wait">● Belum selesai · sedang di Aktivitas ${s.currentActivity}</span>`;
  $("#d-name").textContent = s.name;
  $("#d-meta").innerHTML = `Kelas <b>${esc(s.className)}</b> · Kelompok <b>${esc(s.groupNumber)}</b> · ${answeredAll(s)}/${TOTAL_QUESTIONS} terjawab<br/>Mulai ${fmtDate(s.createdAt)} · Terakhir disimpan ${fmtDate(s.updatedAt)}${s.completedAt ? ` · Diselesaikan ${fmtDate(s.completedAt)}` : ""}`;
  $("#d-body").innerHTML = ACTIVITIES.map((a, k) => `
    <section class="card d-act" style="--c:${ACT_COLORS[k]}">
      <h3>Aktivitas ${a.id} – ${esc(a.title)} <small>${answered(s, a.id)}/5 terjawab</small></h3>
      ${a.questions.map((q, i) => {
        const ans = (s.answers?.[answerKey(a.id, i + 1)] || "").trim();
        return `<div class="d-q"><p><b>${i + 1}.</b>${esc(q)}</p><div class="d-a ${ans ? "" : "none"}">${ans ? esc(ans) : "(belum dijawab)"}</div></div>`;
      }).join("")}
    </section>`).join("");
}
$("#drawer").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) { $("#drawer").hidden = true; current = null; } });
addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#drawer").hidden) { $("#drawer").hidden = true; current = null; } });

$("#d-print").addEventListener("click", () => {
  document.body.classList.add("printing");
  const t = document.title;
  document.title = `LKM Refleksi - ${current.name} - ${current.className}`;
  window.print();
  document.title = t;
  document.body.classList.remove("printing");
});
$("#d-csv").addEventListener("click", () => downloadCSV([current], `LKM-Refleksi_${slug(current.name)}_${slug(current.className)}.csv`));
$("#d-doc").addEventListener("click", () => downloadDoc(current));
$("#d-delete").addEventListener("click", async () => {
  if (!confirm(`Hapus seluruh data pekerjaan "${current.name}"? Tindakan ini tidak dapat dibatalkan.`)) return;
  try {
    await api(`/api/teacher/data/submissions/${current.id}`, { method: "DELETE" });
    toast("Data murid dihapus.");
    $("#drawer").hidden = true; current = null;
    load(true);
  } catch (e) { toast(e.message); }
});

/* ----------------------------------------------------------- EXPORT */
const slug = (s) => String(s).normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "data";
const stamp = () => new Date().toISOString().slice(0, 10);
const STATUS_LABEL = (s) => (isDone(s) ? "Selesai" : "Belum selesai");

function columns() {
  const qcols = [];
  ACTIVITIES.forEach((a) => a.questions.forEach((q, i) => qcols.push({ key: answerKey(a.id, i + 1), head: `Aktivitas ${a.id} - No. ${i + 1}`, q })));
  return qcols;
}
function rowsOf(list) {
  const qcols = columns();
  const head = ["No", "Nama", "Kelas", "Kelompok", "Status", "Aktivitas terakhir", "Jumlah terjawab", "Mulai", "Terakhir disimpan", "Diselesaikan", ...qcols.map((c) => c.head)];
  const body = list.map((s, i) => [
    i + 1, s.name, s.className, s.groupNumber, STATUS_LABEL(s), s.currentActivity, `${answeredAll(s)}/${TOTAL_QUESTIONS}`,
    fmtDate(s.createdAt), fmtDate(s.updatedAt), s.completedAt ? fmtDate(s.completedAt) : "",
    ...qcols.map((c) => s.answers?.[c.key] || ""),
  ]);
  return { head, body, qcols };
}

function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function downloadCSV(list, name) {
  if (!list.length) return toast("Tidak ada data untuk diunduh.");
  const { head, body } = rowsOf(list);
  const cell = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = "'" + s; // cegah formula injection
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = [head, ...body].map((r) => r.map(cell).join(",")).join("\r\n");
  download(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), name);
  toast("File CSV berhasil diunduh.");
}

function downloadXLS(list) {
  if (!list.length) return toast("Tidak ada data untuk diunduh.");
  const { head, body, qcols } = rowsOf(list);
  const x = (v) => esc(String(v ?? "")).replace(/\r?\n/g, "&#10;");
  const cell = (v, style = "wrap") => typeof v === "number"
    ? `<Cell ss:StyleID="${style}"><Data ss:Type="Number">${v}</Data></Cell>`
    : `<Cell ss:StyleID="${style}"><Data ss:Type="String">${x(v)}</Data></Cell>`;
  const widths = [30, 160, 80, 65, 85, 75, 75, 120, 120, 120, ...qcols.map(() => 240)];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="head"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0F766E" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style>
  <Style ss:ID="wrap"><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style>
 </Styles>
 <Worksheet ss:Name="Jawaban Murid">
  <Table>
   ${widths.map((w) => `<Column ss:Width="${w}"/>`).join("")}
   <Row>${head.map((h) => cell(h, "head")).join("")}</Row>
   ${body.map((r) => `<Row>${r.map((v) => cell(v)).join("")}</Row>`).join("\n   ")}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><SplitVertical>2</SplitVertical><LeftColumnRightPane>2</LeftColumnRightPane></WorksheetOptions>
 </Worksheet>
 <Worksheet ss:Name="Daftar Pertanyaan">
  <Table>
   <Column ss:Width="140"/><Column ss:Width="520"/>
   <Row>${cell("Kolom", "head")}${cell("Pertanyaan", "head")}</Row>
   ${qcols.map((c) => `<Row>${cell(c.head)}${cell(c.q)}</Row>`).join("\n   ")}
  </Table>
 </Worksheet>
</Workbook>`;
  download(new Blob([xml], { type: "application/vnd.ms-excel" }), `LKM-Refleksi_${stamp()}.xls`);
  toast("File Excel berhasil diunduh.");
}

function downloadDoc(s) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>LKM Refleksi</title>
  <style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt} h1{font-size:16pt;margin:0} h2{font-size:13pt;margin:18pt 0 6pt;color:#0f766e} .q{font-weight:bold;margin:8pt 0 2pt} .a{border-left:3pt solid #94a3b8;padding:4pt 8pt;background:#f1f5f9;white-space:pre-wrap} td{padding:2pt 8pt 2pt 0}</style></head><body>
  <h1>LKM Digital – Eksplorasi Refleksi</h1><p>Transformasi Geometri Matematika SMA</p>
  <table><tr><td>Nama</td><td>: <b>${esc(s.name)}</b></td></tr><tr><td>Kelas</td><td>: ${esc(s.className)}</td></tr><tr><td>Kelompok</td><td>: ${esc(s.groupNumber)}</td></tr><tr><td>Status</td><td>: ${STATUS_LABEL(s)}</td></tr><tr><td>Terakhir disimpan</td><td>: ${fmtDate(s.updatedAt)}</td></tr></table>
  ${ACTIVITIES.map((a) => `<h2>Aktivitas ${a.id} – ${esc(a.title)}</h2>${a.questions.map((q, i) => {
    const ans = (s.answers?.[answerKey(a.id, i + 1)] || "").trim();
    return `<p class="q">${i + 1}. ${esc(q)}</p><p class="a">${ans ? esc(ans).replace(/\n/g, "<br>") : "<i>(belum dijawab)</i>"}</p>`;
  }).join("")}`).join("")}
  </body></html>`;
  download(new Blob(["﻿" + html], { type: "application/msword" }), `LKM-Refleksi_${slug(s.name)}_${slug(s.className)}.doc`);
  toast("Dokumen berhasil diunduh.");
}

$("#btn-csv").addEventListener("click", () => downloadCSV(filtered(), `LKM-Refleksi_${stamp()}.csv`));
$("#btn-xls").addEventListener("click", () => downloadXLS(filtered()));

/* ------------------------------------------------------------- UTILS */
let toastT = 0;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3500);
}

token ? showDash() : showLogin();
