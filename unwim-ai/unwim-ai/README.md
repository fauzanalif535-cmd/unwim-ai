# Unwim AI

Aplikasi chat AI siap pakai. Tanpa `npm install`, hanya butuh **Node.js 18+** dan satu API key gratis.

Fitur: jawaban mengalir (streaming), tombol berhenti, riwayat tersimpan di browser, tampilan terang/gelap otomatis, pembatas laju, dan kode akses opsional. API key tersimpan di server dan tidak pernah sampai ke browser.

## 1. Dapatkan API key gratis

Pilih salah satu penyedia (semuanya punya paket gratis dengan batas pemakaian):

| Provider | Nilai `PROVIDER` | Tempat membuat key |
|---|---|---|
| Google Gemini | `gemini` | https://aistudio.google.com/apikey |
| Groq | `groq` | https://console.groq.com/keys |
| OpenRouter | `openrouter` | https://openrouter.ai/keys |

Catatan: kuota, batas, dan nama model gratis bisa berubah. Jika muncul error "Model tidak ditemukan", ganti `MODEL` di `.env` dengan model gratis yang tersedia di dashboard penyedia. Pada paket gratis, sebagian penyedia dapat memakai data percakapan untuk peningkatan layanan, jadi jangan kirim data rahasia.

## 2. Jalankan di komputer

```bash
cp .env.example .env      # Windows: copy .env.example .env
# buka .env, isi PROVIDER dan API_KEY
node server.js
```

Buka http://localhost:3000

## 3. Online gratis (Render)

1. Unggah folder ini ke repositori GitHub (pastikan `.env` tidak ikut, lihat `.gitignore`).
2. Di https://render.com buat **New > Web Service**, hubungkan repositori.
3. Runtime: Node. Build command: kosong. Start command: `node server.js`. Pilih paket **Free**.
4. Di **Environment**, tambahkan `PROVIDER`, `API_KEY`, dan (disarankan) `ACCESS_CODE`.
5. Deploy. Pada paket gratis, server tidur saat sepi dan butuh sekitar satu menit untuk bangun.

Penting: jika alamat web dibagikan ke publik, isi `ACCESS_CODE` agar kuota gratis kamu tidak dihabiskan orang lain.

## Menyesuaikan

- **Kepribadian/tugas AI**: ubah `SYSTEM_PROMPT` di `.env`. Contoh: `Kamu adalah asisten untuk mahasiswa perencanaan wilayah dan kota...`
- **Tampilan**: edit `public/index.html` (CSS di bagian atas).
- **Logo**: timpa `public/logo.png` (untuk mode terang), `public/logo-dark.png` (huruf abu-abu dibuat terang untuk mode gelap), dan `public/favicon.png` (ikon tab, persegi). Gunakan PNG berlatar transparan.
- **Batas pesan**: ubah `RATE_LIMIT` (pesan per menit per pengguna).
- **Provider lain**: isi `BASE_URL` dan `MODEL` dengan layanan apa pun yang kompatibel dengan format OpenAI.

## Struktur

```
server.js          server + proxy ke API AI
public/index.html  antarmuka chat
.env.example       contoh konfigurasi
```

## Ide pengembangan berikutnya

- Baca PDF/dokumen (kirim teks ke model sebagai konteks).
- Pencarian web atau basis pengetahuan sendiri (RAG).
- Login pengguna dan penyimpanan riwayat di database.
