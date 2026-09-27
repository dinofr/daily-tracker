# Rutinitas Harian — panduan untuk Claude

Pelacak rutinitas harian untuk satu pengguna (pemilik repo). PWA statis: HTML/JS/CSS biasa,
tanpa server, tanpa login, tanpa build step, tanpa dependency.

- Live: https://dinofr.github.io/daily-tracker/
- Repo: https://github.com/dinofr/daily-tracker (GitHub Pages dari branch `main`, folder root; update ±1 menit setelah push)
- Uji lokal: `python -m http.server 5317` lalu buka http://localhost:5317 dengan viewport HP (375×812)

## Prinsip

- Utamakan kesederhanaan. Jangan menambah fitur di luar yang diminta tanpa bertanya dulu.
- Mobile-first: target sentuh ≥ 44px, font input 16px (cegah zoom iOS), harus nyaman di layar 375px.
- Jangan menambah framework, bundler, atau library.
- Jelaskan rencana perubahan besar (terutama perubahan model data) sebelum menulis kode.

## Struktur

| File | Isi |
| --- | --- |
| `index.html` | Kerangka halaman, tab bar |
| `app.js` | Konstanta & jadwal default (paling atas), penyimpanan, aturan streak/peringatan, tiga tampilan: Hari Ini, Jadwal, Ringkasan |
| `style.css` | Tema washi/sumi, terang/gelap via `prefers-color-scheme`, variabel warna di `:root` |
| `sw.js` | Service worker network-first; daftar `ASSETS` dan versi `CACHE` |
| `manifest.webmanifest`, `icon*.svg/png`, `apple-touch-icon.png` | Ikon & metadata PWA |
| `tools/data.mjs` | Alat Claude untuk pull/push `data.json` di repo data privat |

## Aturan wajib saat mengubah kode

1. **Salinan kerja data ada di `localStorage` HP (key `daily-tracker-v1`). Salinan bersamanya ada di repo privat
   `dinofr/daily-tracker-data`, file `data.json`** (lihat "Data pengguna lewat chat").
   Jangan ganti `STORAGE_KEY`. Kalau bentuk data berubah, `load()` dan `mergeData()` harus tetap bisa menangani data lama.
   **Data pribadi tidak boleh masuk repo publik ini.**
2. **Setiap perubahan file yang di-cache, naikkan `CACHE` di `sw.js`** (`daily-v3` → `daily-v4`, dst.).
3. File statis baru harus dimasukkan ke `ASSETS` di `sw.js`.
4. Angka aturan (maks. game ML, jam 22.00, batas 30 menit Anki, target hari kacau) diubah lewat konstanta di atas `app.js`, bukan di-hardcode di tempat lain.
5. Uji di browser lokal dengan viewport HP sebelum commit.

## Model data

```js
{
  template: [{ id, start: 'HH:MM', end: 'HH:MM' | '', title, kind: 'biasa'|'anki'|'ml'|'tidur', habit: 'jepang'|'olahraga'|'tidur'|null }],
  templateAt,                       // ms epoch, terakhir jadwal disimpan
  days: {
    'YYYY-MM-DD': {
      chaos: boolean, chaosAt,      // ms epoch, terakhir mode kacau diubah
      structureAt,                  // ms epoch, saat susunan blok hari itu dibuat/disinkron dengan template
      entries: [{ blockId, start, end, title, kind, habit, done, updatedAt,   // updatedAt: ms epoch
                  anki?: { reviews, newCards, minutes }, ml?: { games, finishedAt } }]
    }
  }
}
```

Setiap hari menyimpan salinan (snapshot) template saat pertama dibuka. Menyimpan jadwal baru ikut mengubah hari ini
(status yang sudah diisi tetap ada), tapi hari-hari sebelumnya tidak berubah.
Data lama tanpa timestamp dianggap bertimestamp 0.

## Sinkronisasi (app.js, bagian "Sinkronisasi")

- Aplikasi memakai GitHub Contents API dengan fine-grained token yang dimasukkan pemilik di tab Jadwal
  (disimpan di localStorage key `daily-tracker-sync`, tidak pernah masuk repo).
- Kapan sinkron: saat aplikasi dibuka atau kembali ke layar, 3 detik setelah perubahan terakhir, saat online kembali,
  dan saat aplikasi ditutup kalau masih ada perubahan yang menunggu.
- Caranya: tarik dari repo → gabung (`mergeData`) → kirim kalau hasilnya berbeda. Kalau sha basi (409/422), ulangi, maksimal 3 kali.
- Aturan gabung:
  - `template`: yang `templateAt`-nya lebih baru.
  - Per hari: susunan blok ikut `structureAt` yang lebih baru; nilai tiap blok (`done`, `anki`, `ml`) ikut `updatedAt` yang lebih baru; `chaos` ikut `chaosAt`.
- Impor JSON menimpa isi repo (`syncNow({ force: true })`).
- `sw.js` tidak meng-cache `api.github.com`.
- Batas yang diketahui: Contents API hanya mengembalikan isi file ≤ 1 MB. `data.json` bertambah ±1,5 KB/hari,
  jadi kira-kira 2 tahun lagi perlu dipecah per tahun. Sebelum itu, cek ukurannya kalau pemilik melaporkan sinkron gagal.

## Data pengguna lewat chat

Pemilik bisa melaporkan kejadian ("tadi Anki 150 review 25 menit", "hari ini hari kacau") atau bertanya
("minggu ini olahraga berapa kali?"). Caranya:

1. `node tools/data.mjs pull <scratchpad>/data.json`. Simpan di folder sementara, jangan di repo ini.
   Token diambil dari `$GH_TOKEN` atau `gh auth token`.
   Exit 3 berarti `data.json` belum ada, artinya aplikasi belum pernah sinkron: minta pemilik menghubungkan sinkronisasi dulu.
2. Ubah file itu dengan skrip Node kecil, dengan aturan berikut:
   - **Setiap blok yang diubah wajib diberi `updatedAt = Date.now()`**, dan `chaosAt` kalau mengubah `chaos`. Tanpa itu, perubahan kalah saat digabung dengan data di HP.
   - Kalau hari itu belum ada di `days`: buat dari `template` dengan bentuk yang sama seperti `entryFromBlock()` di app.js, dan isi `structureAt = Date.now()`.
   - Jangan mengubah `structureAt` hari yang sudah ada, kecuali memang sengaja mengubah susunan blok.
   - Tanggal pakai zona waktu pemilik (WIB, UTC+7), format `YYYY-MM-DD`.
3. `node tools/data.mjs push <file> "pesan"`. Exit 2 berarti data berubah sejak pull: pull ulang, terapkan ulang perubahan, lalu push lagi.
4. Laporkan ke pemilik apa yang diubah. Perubahan muncul di HP saat aplikasi dibuka berikutnya.

Untuk pertanyaan, cukup pull lalu hitung dengan aturan yang sama seperti di app.js (streak, ringkasan mingguan).
Sesi cloud juga butuh akses GitHub ke repo `daily-tracker-data`.

## Aturan logika yang sudah disepakati

- **Hari kacau**: target hanya blok `anki` + `tidur`. Kalau keduanya selesai, ketiga streak bertambah 1, termasuk olahraga.
- **Streak hari normal**: kebiasaan tercapai kalau semua blok dengan habit itu dicentang (Bahasa Jepang = sesi 1 dan sesi 2).
  Hari tanpa data memutus streak. Hari ini yang belum selesai tidak memutus streak. Kebiasaan tanpa blok di hari itu dianggap netral.
- **Peringatan Anki**: rata-rata menit 7 hari terakhir (hanya hari yang terisi) > 30. Sarannya: kartu baru dikurangi setengah.
- **Mobile Legends merah**: game > 3, atau selesai lewat 22:00 (jam < 05:00 dianggap lewat tengah malam). Jam selesai terisi otomatis saat blok dicentang.
- **Ringkasan**: minggu berjalan, Senin sampai Minggu.
- **Tombol "‹ Kemarin"**: hanya untuk mengoreksi hari sebelumnya, bukan untuk navigasi bebas.

## Alur kerja

1. Pemilik menyampaikan penyesuaian → Claude menjelaskan singkat apa yang akan diubah → mengerjakan → uji lokal.
2. Commit: Conventional Commits, bahasa Inggris, **tanpa atribusi AI** (tanpa `Co-Authored-By`, tanpa "Generated with").
3. Push ke `main` hanya kalau pemilik meminta. Setelah push, cek bahwa situs live sudah ter-update.
4. Untuk men-debug data (misalnya "kenapa streak saya reset?"): kalau sudah tersinkron, pull `data.json`.
   Kalau belum, minta pemilik mengirim file hasil **Ekspor JSON** dari tab Jadwal.

GitHub CLI di PC pemilik: `C:\Program Files\GitHub CLI\gh.exe` (mungkin belum ada di PATH pada terminal lama).
