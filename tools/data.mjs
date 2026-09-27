// Baca/tulis data.json di repo privat dinofr/daily-tracker-data (dipakai Claude dari chat).
//
//   node tools/data.mjs pull <file>            simpan data ke <file> (+ <file>.sha)
//   node tools/data.mjs push <file> [pesan]    kirim <file>; gagal (exit 2) jika repo berubah sejak pull
//
// Token: $GH_TOKEN, atau diambil dari `gh auth token`.
// Simpan <file> di luar repo ini (repo ini publik) — misalnya di folder sementara.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const REPO = 'dinofr/daily-tracker-data';
const PATH = process.env.DATA_PATH || 'data.json';
const [cmd, file, message] = process.argv.slice(2);

if (!['pull', 'push'].includes(cmd) || !file) {
  console.error('Pakai: node tools/data.mjs pull|push <file> [pesan]');
  process.exit(1);
}

const token = process.env.GH_TOKEN || execSync('gh auth token').toString().trim();
const url = `https://api.github.com/repos/${REPO}/contents/${PATH}`;
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

// Pakai exitCode, bukan process.exit(): exit paksa setelah fetch membuat Node crash di Windows.
process.exitCode = cmd === 'pull' ? await pull() : await push();

async function pull() {
  const res = await fetch(url, { headers });
  if (res.status === 404) {
    console.error(`${PATH} belum ada di repo (aplikasi belum pernah sinkron).`);
    return 3;
  }
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const content = JSON.parse(Buffer.from(json.content, 'base64').toString('utf8'));
  writeFileSync(file, JSON.stringify(content, null, 2));
  writeFileSync(`${file}.sha`, json.sha);
  console.log(`OK: ${file} (sha ${json.sha.slice(0, 7)})`);
  return 0;
}

async function push() {
  const content = JSON.stringify(JSON.parse(readFileSync(file, 'utf8'))); // ringkas, sama seperti aplikasi
  const sha = existsSync(`${file}.sha`) ? readFileSync(`${file}.sha`, 'utf8').trim() : undefined;
  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: message || 'update via chat',
      content: Buffer.from(content).toString('base64'),
      ...(sha && { sha }),
    }),
  });
  if (res.status === 409 || res.status === 422) {
    console.error('Konflik: data di repo berubah sejak pull. Pull ulang, terapkan ulang perubahan, lalu push.');
    return 2;
  }
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  const json = await res.json();
  writeFileSync(`${file}.sha`, json.content.sha);
  console.log(`OK: terkirim (sha ${json.content.sha.slice(0, 7)})`);
  return 0;
}
