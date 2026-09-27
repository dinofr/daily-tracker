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

## Aturan wajib saat mengubah kode

1. **Data pengguna ada di `localStorage` HP pemilik (key `daily-tracker-v1`), bukan di repo.** Claude tidak bisa melihatnya.
   Jangan ganti `STORAGE_KEY`. Kalau bentuk data berubah, `load()` harus tetap bisa membaca data lama (tambahkan migrasi di sana).
2. **Setiap perubahan file yang di-cache, naikkan `CACHE` di `sw.js`** (`daily-v3` → `daily-v4`, dst.).
3. File statis baru harus dimasukkan ke `ASSETS` di `sw.js`.
4. Angka aturan (maks. game ML, jam 22.00, batas 30 menit Anki, target hari kacau) diubah lewat konstanta di atas `app.js`, bukan di-hardcode di tempat lain.
5. Uji di browser lokal dengan viewport HP sebelum commit.

## Model data

```js
{
  template: [{ id, start: 'HH:MM', end: 'HH:MM' | '', title, kind: 'biasa'|'anki'|'ml'|'tidur', habit: 'jepang'|'olahraga'|'tidur'|null }],
  days: {
    'YYYY-MM-DD': {
      chaos: boolean,
      entries: [{ blockId, start, end, title, kind, habit, done,
                  anki?: { reviews, newCards, minutes }, ml?: { games, finishedAt } }]
    }
  }
}
```

Setiap hari menyimpan salinan (snapshot) template saat pertama dibuka. Menyimpan jadwal baru ikut mengubah hari ini
(status yang sudah diisi tetap ada), tapi hari-hari sebelumnya tidak berubah.

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
4. Untuk men-debug data (misalnya "kenapa streak saya reset?"), minta pemilik mengirim file hasil **Ekspor JSON** dari tab Jadwal.

GitHub CLI di PC pemilik: `C:\Program Files\GitHub CLI\gh.exe` (mungkin belum ada di PATH pada terminal lama).
