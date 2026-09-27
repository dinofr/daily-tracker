# Rutinitas Harian

Aplikasi web statis (HTML/JS/CSS) untuk melacak rutinitas harian. Tanpa server dan tanpa login.
Data tersimpan di `localStorage` browser, dan bisa diekspor/impor sebagai JSON dari tab **Jadwal**.

## Menjalankan secara lokal

```bash
python -m http.server 5317
```

Buka http://localhost:5317.

## Memakai di HP

Hosting folder ini di layanan file statis mana pun yang memakai HTTPS (GitHub Pages, Netlify, Cloudflare Pages).
Buka dari browser HP, lalu pilih **Tambahkan ke layar utama**. Setelah itu aplikasi tetap jalan saat offline.

Data hanya ada di browser tempat aplikasi dibuka, jadi ekspor JSON secara rutin sebagai cadangan.

## Struktur

| File | Isi |
| --- | --- |
| `index.html` | Kerangka halaman dan tab bar |
| `app.js` | Jadwal default, penyimpanan, aturan streak/peringatan, tiga tampilan |
| `style.css` | Tampilan mobile-first, terang/gelap mengikuti sistem |
| `sw.js`, `manifest.webmanifest`, `icon.svg`, `icon-*.png` | PWA (bisa dipasang dan dipakai offline) |

Batas-batas (maks. game ML, jam 22.00, 30 menit Anki, target hari kacau) ada sebagai konstanta di bagian atas `app.js`.
