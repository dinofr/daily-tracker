'use strict';

// ---------------------------------------------------------------------------
// Konstanta & jadwal default
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'daily-tracker-v1';
const ML_MAX_GAMES = 3;
const ML_DEADLINE = '22:00';
const AFTER_MIDNIGHT = '05:00'; // jam selesai ML sebelum ini dianggap lewat tengah malam
const ANKI_MAX_AVG_MINUTES = 30;
const CHAOS_KINDS = ['anki', 'tidur']; // target minimum di hari kacau

const HABITS = { jepang: 'Bahasa Jepang', olahraga: 'Olahraga', tidur: 'Tidur tepat waktu' };
const KINDS = { biasa: 'Biasa', anki: 'Anki', ml: 'Mobile Legends', tidur: 'Tidur' };
const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

const DEFAULT_TEMPLATE = [
  { id: 'b1', start: '05:00', end: '05:30', title: 'Bahasa Jepang sesi 1: review Anki', kind: 'anki', habit: 'jepang' },
  { id: 'b2', start: '05:30', end: '06:00', title: 'Olahraga', kind: 'biasa', habit: 'olahraga' },
  { id: 'b3', start: '06:00', end: '08:00', title: 'Waktu keluarga', kind: 'biasa', habit: null },
  { id: 'b4', start: '08:00', end: '12:00', title: 'Kerja fokus', kind: 'biasa', habit: null },
  { id: 'b5', start: '12:00', end: '13:00', title: 'Makan siang', kind: 'biasa', habit: null },
  { id: 'b6', start: '13:00', end: '17:00', title: 'Kerja ringan + standby', kind: 'biasa', habit: null },
  { id: 'b7', start: '17:00', end: '20:00', title: 'Waktu keluarga', kind: 'biasa', habit: null },
  { id: 'b8', start: '20:30', end: '21:00', title: 'Bahasa Jepang sesi 2: tata bahasa / listening / reading', kind: 'biasa', habit: 'jepang' },
  { id: 'b9', start: '21:00', end: '21:45', title: 'Mobile Legends (maks. 3 game)', kind: 'ml', habit: null },
  { id: 'b10', start: '22:00', end: '', title: 'Tidur', kind: 'tidur', habit: 'tidur' },
];

// ---------------------------------------------------------------------------
// Penyimpanan (localStorage)
// ---------------------------------------------------------------------------

const isValidData = d => d && Array.isArray(d.template) && d.days && typeof d.days === 'object';

function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidData(parsed)) return parsed;
    }
  } catch (err) {
    console.error('Gagal membaca data', err);
  }
  // Data rusak jangan sampai tertimpa diam-diam: simpan salinannya dulu.
  if (raw) {
    try { localStorage.setItem(`${STORAGE_KEY}-rusak-${Date.now()}`, raw); } catch { /* abaikan */ }
  }
  return { template: structuredClone(DEFAULT_TEMPLATE), days: {} };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    alert(`Gagal menyimpan data: ${err.message}`);
  }
}

let data = load();

// ---------------------------------------------------------------------------
// Utilitas tanggal & teks
// ---------------------------------------------------------------------------

const pad = n => String(n).padStart(2, '0');
const toKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); };
const todayKey = () => toKey(new Date());
const nowHHMM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const weekStart = k => { const d = fromKey(k); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return toKey(d); };
const formatLong = k => fromKey(k).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
const formatShort = k => fromKey(k).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
const fmtNum = n => Math.round(n).toLocaleString('id-ID');
const sum = arr => arr.reduce((a, b) => a + (b || 0), 0);
const newId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------------------
// Data per hari
// ---------------------------------------------------------------------------

function entryFromBlock(b) {
  const e = { blockId: b.id, start: b.start, end: b.end, title: b.title, kind: b.kind, habit: b.habit, done: false };
  if (b.kind === 'anki') e.anki = { reviews: null, newCards: null, minutes: null };
  if (b.kind === 'ml') e.ml = { games: null, finishedAt: '' };
  return e;
}

function ensureDay(key) {
  if (!data.days[key]) {
    data.days[key] = { chaos: false, entries: data.template.map(entryFromBlock) };
    save();
  }
  return data.days[key];
}

// Setelah jadwal diedit: hari ini ikut template baru, status yang sudah diisi dipertahankan.
function syncDayWithTemplate(key) {
  const day = data.days[key];
  if (!day) return;
  day.entries = data.template.map(b => {
    const fresh = entryFromBlock(b);
    const old = day.entries.find(e => e.blockId === b.id);
    if (!old) return fresh;
    return {
      ...fresh,
      done: old.done,
      anki: fresh.anki && (old.anki || fresh.anki),
      ml: fresh.ml && (old.ml || fresh.ml),
    };
  });
}

// ---------------------------------------------------------------------------
// Aturan: target, streak, peringatan
// ---------------------------------------------------------------------------

const isTarget = (day, e) => !day.chaos || CHAOS_KINDS.includes(e.kind);
const minimumMet = day => day.entries.filter(e => isTarget(day, e)).every(e => e.done);

// true = tercapai, false = gagal, null = tidak ada blok untuk kebiasaan ini (netral).
// Hari kacau: semua kebiasaan dihitung tercapai bila target minimum selesai.
function habitMet(day, habit) {
  if (day.chaos) return minimumMet(day);
  const blocks = day.entries.filter(e => e.habit === habit);
  return blocks.length ? blocks.every(e => e.done) : null;
}

function streak(habit) {
  const keys = Object.keys(data.days).sort();
  if (!keys.length) return 0;
  const today = todayKey();
  let count = 0;
  for (let key = today; key >= keys[0]; key = addDays(key, -1)) {
    const day = data.days[key];
    const met = day ? habitMet(day, habit) : false;
    if (met === true) count++;
    else if (met === false && key !== today) break; // hari ini yang belum selesai tidak memutus streak
  }
  return count;
}

// Total Anki per hari (hanya hari yang kolom menitnya terisi).
function ankiDay(day) {
  const entries = day?.entries.filter(e => e.anki && e.anki.minutes != null) ?? [];
  if (!entries.length) return null;
  return {
    minutes: sum(entries.map(e => e.anki.minutes)),
    reviews: sum(entries.map(e => e.anki.reviews)),
    newCards: sum(entries.map(e => e.anki.newCards)),
  };
}

function ankiWarningHtml() {
  const today = todayKey();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const a = ankiDay(data.days[addDays(today, -i)]);
    if (a) days.push(a);
  }
  if (!days.length) return '';
  const avgMin = sum(days.map(d => d.minutes)) / days.length;
  if (avgMin <= ANKI_MAX_AVG_MINUTES) return '';
  const avgNew = sum(days.map(d => d.newCards)) / days.length;
  const advice = avgNew >= 1
    ? `Kurangi kartu baru dari ±${fmtNum(avgNew)} menjadi ±${fmtNum(Math.floor(avgNew / 2))} per hari sampai rata-rata turun.`
    : 'Tahan kartu baru di 0 dulu sampai beban review turun.';
  return `<div class="alert">
    <strong>Review Anki rata-rata ${fmtNum(avgMin)} menit/hari</strong>
    <span>Selama ${days.length} hari terakhir, batasnya ${ANKI_MAX_AVG_MINUTES} menit. ${advice}</span>
  </div>`;
}

function mlIssues(e) {
  if (!e.ml) return [];
  const issues = [];
  if (e.ml.games > ML_MAX_GAMES) issues.push(`${e.ml.games} game, maks. ${ML_MAX_GAMES}`);
  const t = e.ml.finishedAt;
  if (t && (t > ML_DEADLINE || t < AFTER_MIDNIGHT)) issues.push(`selesai ${t}, lewat ${ML_DEADLINE}`);
  return issues;
}

// ---------------------------------------------------------------------------
// Tampilan: Hari Ini
// ---------------------------------------------------------------------------

const el = {
  today: document.getElementById('view-today'),
  schedule: document.getElementById('view-schedule'),
  summary: document.getElementById('view-summary'),
  toast: document.getElementById('toast'),
};

let activeTab = 'today';
let viewOffset = 0; // 0 = hari ini, -1 = kemarin

const currentDay = () => ensureDay(addDays(todayKey(), viewOffset));

const numField = (field, label, value) => `
  <label class="field"><span>${label}</span>
    <input type="number" inputmode="numeric" min="0" data-field="${field}" value="${value ?? ''}">
  </label>`;

function extraFields(e, issues) {
  if (e.kind === 'anki') {
    return `<div class="fields three">
      ${numField('anki.reviews', 'Review', e.anki.reviews)}
      ${numField('anki.newCards', 'Kartu baru', e.anki.newCards)}
      ${numField('anki.minutes', 'Menit', e.anki.minutes)}
    </div>`;
  }
  if (e.kind === 'ml') {
    return `<div class="fields">
      ${numField('ml.games', 'Jumlah game', e.ml.games)}
      <label class="field"><span>Selesai jam</span>
        <input type="time" data-field="ml.finishedAt" value="${esc(e.ml.finishedAt)}">
      </label>
    </div>
    <p class="flag-text">${issues.join(' · ')}</p>`;
  }
  if (e.kind === 'tidur') return '<p class="hint">Centang jika tidur tepat waktu.</p>';
  return '';
}

function blockHtml(day, e, i, isToday, now) {
  const target = isTarget(day, e);
  const current = isToday && e.end && e.start <= now && now < e.end;
  const issues = mlIssues(e);
  const cls = ['block', e.done && 'done', !target && 'optional', current && 'current', issues.length && 'flag']
    .filter(Boolean).join(' ');
  return `<li class="${cls}" data-i="${i}">
    <label class="check">
      <input type="checkbox" data-act="done" ${e.done ? 'checked' : ''}>
      <span class="box" aria-hidden="true"></span>
      <span class="text">
        <span class="time">${e.start}${e.end ? `–${e.end}` : ''}
          ${current ? '<em class="tag now">sekarang</em>' : ''}
          ${!target ? '<em class="tag">opsional</em>' : ''}
        </span>
        <span class="title">${esc(e.title)}</span>
      </span>
    </label>
    ${extraFields(e, issues)}
  </li>`;
}

function renderToday() {
  const key = addDays(todayKey(), viewOffset);
  const day = ensureDay(key);
  const isToday = viewOffset === 0;
  const targets = day.entries.filter(e => isTarget(day, e));
  const doneCount = targets.filter(e => e.done).length;
  const pct = targets.length ? Math.round(doneCount / targets.length * 100) : 0;

  el.today.innerHTML = `
    <header class="head">
      <div>
        <p class="eyebrow">${isToday ? 'Hari ini' : 'Kemarin'}</p>
        <h1>${formatLong(key)}</h1>
      </div>
      <button type="button" class="ghost small" data-act="switch-day">${isToday ? '‹ Kemarin' : 'Hari ini ›'}</button>
    </header>

    <div class="streaks">
      ${Object.entries(HABITS).map(([h, label]) => `
        <div class="streak"><span class="num">${streak(h)}</span><span class="lbl">${label}</span></div>`).join('')}
    </div>

    <div id="anki-warning">${ankiWarningHtml()}</div>

    <button type="button" class="chaos ${day.chaos ? 'on' : ''}" data-act="chaos" aria-pressed="${day.chaos}">
      ${day.chaos
        ? '<strong>Mode hari kacau aktif</strong><span>Target: review Anki + tidur tepat waktu. Ketuk untuk kembali normal.</span>'
        : '<strong>Hari kacau?</strong><span>Ubah target jadi minimum: review Anki + tidur tepat waktu.</span>'}
    </button>

    <div class="progress">
      <span>${doneCount} / ${targets.length} target selesai</span>
      <div class="bar"><i style="width:${pct}%"></i></div>
    </div>

    <ol class="blocks">${day.entries.map((e, i) => blockHtml(day, e, i, isToday, nowHHMM())).join('')}</ol>`;
}

el.today.addEventListener('click', ev => {
  const act = ev.target.closest('[data-act]')?.dataset.act;
  if (act === 'switch-day') {
    viewOffset = viewOffset === 0 ? -1 : 0;
    renderToday();
  } else if (act === 'chaos') {
    const day = currentDay();
    day.chaos = !day.chaos;
    save();
    renderToday();
  }
});

el.today.addEventListener('change', ev => {
  if (ev.target.dataset.act !== 'done') return;
  const e = currentDay().entries[ev.target.closest('li').dataset.i];
  e.done = ev.target.checked;
  if (e.done && e.ml && !e.ml.finishedAt && viewOffset === 0) e.ml.finishedAt = nowHHMM();
  save();
  renderToday();
});

// Input angka/jam disimpan langsung tanpa render ulang, supaya keyboard HP tidak tertutup.
el.today.addEventListener('input', ev => {
  const field = ev.target.dataset.field;
  if (!field) return;
  const li = ev.target.closest('li');
  const e = currentDay().entries[li.dataset.i];
  const [group, prop] = field.split('.');
  const raw = ev.target.value;
  e[group][prop] = ev.target.type === 'number' ? (raw === '' ? null : Math.max(0, Number(raw))) : raw;
  save();

  if (group === 'ml') {
    const issues = mlIssues(e);
    li.classList.toggle('flag', issues.length > 0);
    li.querySelector('.flag-text').textContent = issues.join(' · ');
  } else if (group === 'anki') {
    document.getElementById('anki-warning').innerHTML = ankiWarningHtml();
  }
});

// ---------------------------------------------------------------------------
// Tampilan: Jadwal (edit template)
// ---------------------------------------------------------------------------

let draft = null; // salinan template yang sedang diedit; baru berlaku setelah "Simpan"

const isDirty = () => draft && JSON.stringify(draft) !== JSON.stringify(data.template);

const options = (map, selected, withNone) =>
  (withNone ? `<option value="">—</option>` : '') +
  Object.entries(map).map(([k, v]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${v}</option>`).join('');

function editorRow(b, i) {
  return `<li class="edit-row" data-i="${i}">
    <div class="edit-top">
      <input type="text" class="title-input" data-field="title" value="${esc(b.title)}" placeholder="Nama blok" aria-label="Nama blok">
      <button type="button" class="ghost small danger" data-act="remove" aria-label="Hapus blok">Hapus</button>
    </div>
    <div class="fields four">
      <label class="field"><span>Mulai</span><input type="time" data-field="start" value="${esc(b.start)}"></label>
      <label class="field"><span>Selesai</span><input type="time" data-field="end" value="${esc(b.end)}"></label>
      <label class="field"><span>Jenis</span><select data-field="kind">${options(KINDS, b.kind)}</select></label>
      <label class="field"><span>Kebiasaan</span><select data-field="habit">${options(HABITS, b.habit || '', true)}</select></label>
    </div>
  </li>`;
}

function renderSchedule() {
  if (!draft) draft = structuredClone(data.template);
  el.schedule.innerHTML = `
    <header class="head">
      <div>
        <p class="eyebrow">Jadwal default</p>
        <h1>Atur blok</h1>
      </div>
    </header>
    <p class="note">Perubahan berlaku untuk hari ini dan seterusnya. Catatan hari sebelumnya tidak berubah.</p>

    <ol class="editor">${draft.map(editorRow).join('')}</ol>
    <button type="button" class="ghost wide" data-act="add">+ Tambah blok</button>

    <div class="actions sticky">
      <button type="button" class="ghost" data-act="cancel">Batal</button>
      <button type="button" class="primary" data-act="save" ${isDirty() ? '' : 'disabled'}>Simpan jadwal</button>
    </div>

    <section class="data-box">
      <h2>Data</h2>
      <p class="note">Semua data tersimpan di browser perangkat ini saja. Ekspor secara rutin sebagai cadangan.</p>
      <div class="actions">
        <button type="button" class="ghost" data-act="export">Ekspor JSON</button>
        <label class="ghost button">Impor JSON<input type="file" accept=".json,application/json" data-act="import" hidden></label>
      </div>
    </section>`;
}

function saveSchedule() {
  for (const b of draft) b.title = b.title.trim();
  const invalid = draft.find(b => !b.title || !b.start || (b.end && b.end <= b.start));
  if (invalid) {
    alert('Setiap blok perlu nama dan jam mulai, dan jam selesai (jika diisi) harus setelah jam mulai.');
    return;
  }
  data.template = structuredClone(draft).sort((a, b) => a.start.localeCompare(b.start));
  syncDayWithTemplate(todayKey());
  save();
  draft = null;
  renderSchedule();
  toast('Jadwal disimpan');
}

el.schedule.addEventListener('click', ev => {
  const btn = ev.target.closest('[data-act]');
  const act = btn?.dataset.act;
  if (act === 'add') {
    draft.push({ id: newId(), start: '', end: '', title: '', kind: 'biasa', habit: null });
    renderSchedule();
    el.schedule.querySelector('.edit-row:last-child .title-input').focus();
  } else if (act === 'remove') {
    draft.splice(btn.closest('li').dataset.i, 1);
    renderSchedule();
  } else if (act === 'cancel') {
    draft = null;
    renderSchedule();
  } else if (act === 'save') {
    saveSchedule();
  } else if (act === 'export') {
    exportData();
  }
});

el.schedule.addEventListener('input', ev => {
  const field = ev.target.dataset.field;
  if (!field) return;
  const b = draft[ev.target.closest('li').dataset.i];
  b[field] = field === 'habit' ? (ev.target.value || null) : ev.target.value;
  el.schedule.querySelector('[data-act="save"]').disabled = !isDirty();
});

el.schedule.addEventListener('change', ev => {
  if (ev.target.dataset.act === 'import') importData(ev.target.files[0]);
});

function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rutinitas-${todayKey()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importData(file) {
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!isValidData(parsed)) throw new Error('Format file tidak dikenali.');
    if (!confirm('Timpa semua data di perangkat ini dengan isi file?')) return;
    data = parsed;
    save();
    draft = null;
    renderSchedule();
    toast('Data diimpor');
  } catch (err) {
    alert(`Gagal impor: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Tampilan: Ringkasan mingguan
// ---------------------------------------------------------------------------

function renderSummary() {
  const today = todayKey();
  const start = weekStart(today);
  const week = Array.from({ length: 7 }, (_, i) => {
    const key = addDays(start, i);
    return { key, day: data.days[key], future: key > today, isToday: key === today };
  });
  const recorded = week.filter(w => w.day && !w.future);

  const dotState = (w, habit) => {
    if (w.future) return 'future';
    const met = w.day ? habitMet(w.day, habit) : false;
    if (met === true) return 'hit';
    if (met === null) return 'neutral';
    return w.isToday ? 'pending' : 'miss';
  };

  const habitRows = Object.entries(HABITS).map(([h, label]) => {
    const states = week.map(w => dotState(w, h));
    const hits = states.filter(s => s === 'hit').length;
    const elapsed = week.filter(w => !w.future).length;
    return `<div class="habit-row">
      <div class="habit-head">
        <strong>${label}</strong>
        <span>${hits}/${elapsed} hari · streak ${streak(h)}</span>
      </div>
      <div class="dots">${states.map((s, i) => `<span class="dot ${s}" title="${WEEKDAYS[i]}">${WEEKDAYS[i]}</span>`).join('')}</div>
    </div>`;
  }).join('');

  const anki = recorded.map(w => ankiDay(w.day)).filter(Boolean);
  const mlEntries = recorded.flatMap(w => w.day.entries.filter(e => e.ml));
  const mlBadDays = recorded.filter(w => w.day.entries.some(e => mlIssues(e).length)).length;
  const chaosDays = recorded.filter(w => w.day.chaos).length;

  const tile = (label, value, bad) => `<div class="tile ${bad ? 'bad' : ''}"><span class="val">${value}</span><span class="lbl">${label}</span></div>`;

  el.summary.innerHTML = `
    <header class="head">
      <div>
        <p class="eyebrow">Ringkasan minggu ini</p>
        <h1>${formatShort(start)} – ${formatShort(addDays(start, 6))}</h1>
      </div>
    </header>

    <section class="card">${habitRows}</section>

    <div class="tiles">
      ${tile('Hari kacau', chaosDays)}
      ${tile('Review Anki', fmtNum(sum(anki.map(a => a.reviews))))}
      ${tile('Kartu baru', fmtNum(sum(anki.map(a => a.newCards))))}
      ${tile('Rata-rata Anki', anki.length ? `${fmtNum(sum(anki.map(a => a.minutes)) / anki.length)} mnt` : '–',
        anki.length && sum(anki.map(a => a.minutes)) / anki.length > ANKI_MAX_AVG_MINUTES)}
      ${tile('Game ML', fmtNum(sum(mlEntries.map(e => e.ml.games))))}
      ${tile('Hari ML lewat batas', mlBadDays, mlBadDays > 0)}
    </div>`;
}

// ---------------------------------------------------------------------------
// Navigasi, toast, inisialisasi
// ---------------------------------------------------------------------------

const renderers = { today: renderToday, schedule: renderSchedule, summary: renderSummary };

function showTab(tab) {
  activeTab = tab;
  for (const [name, section] of Object.entries(el)) {
    if (renderers[name]) section.hidden = name !== tab;
  }
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  renderers[tab]();
  window.scrollTo(0, 0);
}

document.querySelector('.tabbar').addEventListener('click', ev => {
  const tab = ev.target.closest('[data-tab]')?.dataset.tab;
  if (tab) showTab(tab);
});

// Aplikasi dibiarkan terbuka melewati tengah malam: render ulang saat kembali dibuka.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && activeTab !== 'schedule') renderers[activeTab]();
});

let toastTimer;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 1800);
}

navigator.storage?.persist?.(); // minta browser tidak menghapus data secara otomatis

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker gagal', err));
}

showTab('today');
