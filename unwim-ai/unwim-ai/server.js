// Unwim AI: server chat tanpa dependensi (Node.js >= 18).
// API key disimpan di server, tidak pernah dikirim ke browser.

const http = require('http');
const fs = require('fs');
const path = require('path');

// ---- Muat file .env (tanpa paket tambahan) ----
try {
  const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch {
  /* .env tidak wajib: di hosting, isi lewat environment variable */
}

// ---- Konfigurasi ----
// Semua provider di bawah memakai format "OpenAI-compatible".
// Nama model gratis bisa berubah sewaktu-waktu; ganti lewat MODEL di .env jika perlu.
const PRESETS = {
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-2.5-flash',
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
  },
};

const PROVIDER = (process.env.PROVIDER || 'gemini').toLowerCase();
const preset = PRESETS[PROVIDER] || PRESETS.gemini;
const API_KEY = process.env.API_KEY || '';
const API_URL = process.env.BASE_URL || preset.url;
const MODEL = process.env.MODEL || preset.model;
const PORT = Number(process.env.PORT) || 3000;
const RATE_LIMIT = Number(process.env.RATE_LIMIT) || 20; // pesan per menit per IP
const ACCESS_CODE = process.env.ACCESS_CODE || '';
const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  'Kamu adalah Unwim AI, asisten yang ramah, jujur, dan membantu. Jawab dalam bahasa yang dipakai pengguna, ringkas dan jelas. Jika tidak yakin, katakan terus terang.';

const MAX_BODY = 200 * 1024; // 200 KB
const MAX_MESSAGES = 20;
const MAX_CHARS = 8000;

// ---- Pembatas laju sederhana (in-memory) ----
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > RATE_LIMIT;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, arr] of hits) {
    if (!arr.some((t) => now - t < 60000)) hits.delete(ip);
  }
}, 60000).unref();

// ---- Util ----
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('Permintaan terlalu besar'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

// ---- Endpoint chat ----
async function handleChat(req, res) {
  if (!API_KEY) {
    return sendJson(res, 500, {
      error: 'API_KEY belum diisi di server. Lihat README, bagian "Dapatkan API key gratis".',
    });
  }
  if (ACCESS_CODE && req.headers['x-access-code'] !== ACCESS_CODE) {
    return sendJson(res, 401, { error: 'Kode akses salah atau belum diisi.' });
  }
  if (limited(clientIp(req))) {
    return sendJson(res, 429, { error: 'Terlalu banyak pesan. Tunggu sebentar lalu coba lagi.' });
  }

  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    return sendJson(res, 400, { error: e.message || 'Permintaan tidak valid' });
  }

  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }))
    .slice(-MAX_MESSAGES);

  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return sendJson(res, 400, { error: 'Pesan kosong.' });
  }

  const controller = new AbortController();
  res.on('close', () => controller.abort()); // hentikan permintaan jika pengguna menutup/menghentikan

  let upstream;
  try {
    upstream = await fetch(API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      }),
    });
  } catch (e) {
    if (controller.signal.aborted) return;
    return sendJson(res, 502, { error: 'Tidak bisa menghubungi penyedia AI: ' + e.message });
  }

  if (!upstream.ok) {
    let detail = '';
    try {
      detail = (await upstream.text()).slice(0, 300);
    } catch {}
    const hint =
      upstream.status === 429
        ? 'Kuota gratis sementara habis. Coba lagi nanti.'
        : upstream.status === 401 || upstream.status === 403
        ? 'API key ditolak. Periksa kembali API_KEY.'
        : upstream.status === 404
        ? 'Model tidak ditemukan. Ganti MODEL di .env.'
        : 'Penyedia AI menolak permintaan.';
    return sendJson(res, 502, { error: `${hint} (kode ${upstream.status})`, detail });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  try {
    for await (const chunk of upstream.body) res.write(chunk);
  } catch {
    /* terputus oleh klien */
  }
  res.end();
}

// ---- File statis ----
function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(__dirname, 'public', rel));
  if (!file.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Tidak ditemukan');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---- Server ----
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0];
  if (req.method === 'POST' && pathname === '/api/chat') return handleChat(req, res);
  if (req.method === 'GET' && pathname === '/api/info') {
    return sendJson(res, 200, { needsCode: Boolean(ACCESS_CODE), configured: Boolean(API_KEY), model: MODEL });
  }
  if (req.method === 'GET' && pathname === '/health') return sendJson(res, 200, { ok: true });
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405);
  res.end();
});

server.listen(PORT, () => {
  console.log(`Unwim AI berjalan di http://localhost:${PORT}`);
  console.log(`Provider: ${PROVIDER} | Model: ${MODEL}${API_KEY ? '' : ' | PERINGATAN: API_KEY belum diisi'}`);
});
