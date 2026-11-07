import express from 'express';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.CLAUDE_MODEL || '';
const BRIDGE_URL = (process.env.CLAUDE_BRIDGE_URL || '').replace(/\/$/, '');
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || '';
const WORKDIR = process.env.CLAUDE_WORKDIR || path.join(__dirname, 'workspace');
const TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS || 120_000);

const SYSTEM_PROMPTS = {
  vi: `Bạn là trợ lý giọng nói. Mọi câu trả lời sẽ được đọc to bằng giọng máy tiếng Việt.
- Luôn trả lời bằng tiếng Việt.
- Trả lời ngắn gọn, tự nhiên như đang nói chuyện, thường 1–4 câu trừ khi được yêu cầu chi tiết.
- Tuyệt đối không dùng markdown, gạch đầu dòng, bảng, emoji hay khối code.
- Viết số, đơn vị, ký hiệu theo cách dễ đọc thành lời.`,
  en: `You are a voice assistant. Every reply is read aloud by an English text-to-speech voice.
- Always reply in English.
- Keep it short and conversational, usually 1–4 sentences unless asked for detail.
- Never use markdown, bullet points, tables, emoji or code blocks.
- Write numbers, units and symbols the way they should be spoken.`,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const busySessions = new Set();

// ---------- Hai cách chạy Claude: qua bridge trên máy Mac, hoặc CLI trong container ----------
// Cả hai phát ra: 'line' (một dòng stream-json), 'exit' (code, stderr). Có .kill().

function runViaBridge({ text, sessionId, systemPrompt }) {
  const em = new EventEmitter();
  const ac = new AbortController();
  em.kill = () => ac.abort();
  (async () => {
    let res;
    try {
      res = await fetch(`${BRIDGE_URL}/ask`, {
        method: 'POST',
        signal: ac.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${BRIDGE_TOKEN}` },
        body: JSON.stringify({ text, sessionId, model: MODEL || undefined, systemPrompt }),
      });
    } catch (err) {
      return em.emit('exit', -1, `Không kết nối được bridge trên máy (${BRIDGE_URL}). Hãy chạy ./start.sh. ${err.cause?.code || err.message}`);
    }
    if (!res.ok) {
      const msg = res.status === 401 ? 'Bridge từ chối: BRIDGE_TOKEN không khớp.' : `Bridge trả lỗi ${res.status}: ${await res.text()}`;
      return em.emit('exit', -1, msg);
    }
    const dec = new TextDecoder();
    let buf = '';
    let exited = false;
    try {
      for await (const chunk of res.body) {
        buf += dec.decode(chunk, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          if (line.includes('"bridge_exit"')) {
            try {
              const m = JSON.parse(line);
              if (m.type === 'bridge_exit') { exited = true; em.emit('exit', m.code, m.stderr || ''); continue; }
            } catch { /* không phải dòng exit */ }
          }
          em.emit('line', line);
        }
      }
    } catch (err) {
      if (!exited) em.emit('exit', -1, `Mất kết nối bridge: ${err.message}`);
      return;
    }
    if (!exited) em.emit('exit', -1, 'Bridge đóng kết nối giữa chừng.');
  })();
  return em;
}

const localKnownSessions = new Set();
function runLocal({ text, sessionId, systemPrompt }) {
  mkdirSync(WORKDIR, { recursive: true });
  const args = [
    '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--system-prompt', systemPrompt, '--tools', '',
  ];
  if (MODEL) args.push('--model', MODEL);
  args.push(localKnownSessions.has(sessionId) ? '--resume' : '--session-id', sessionId);

  const em = new EventEmitter();
  const child = spawn('claude', args, { cwd: WORKDIR, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
  em.kill = () => child.kill('SIGTERM');
  child.stdin.end(text);
  let buf = '';
  let stderr = '';
  child.stdout.on('data', (c) => {
    buf += c.toString('utf8');
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) em.emit('line', line);
    }
  });
  child.stderr.on('data', (c) => { stderr += c.toString('utf8'); });
  child.on('error', (err) => { stderr += `Không chạy được Claude CLI: ${err.message}`; });
  child.on('close', (code) => {
    if (code === 0) localKnownSessions.add(sessionId);
    em.emit('exit', code, stderr);
  });
  return em;
}

const runClaude = BRIDGE_URL ? runViaBridge : runLocal;

// ---------- Web ----------
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json({ limit: '64kb' }));
app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

app.get('/', (_req, res) => {
  res.render('index', {
    model: MODEL || 'mặc định',
    mode: BRIDGE_URL ? 'mac' : 'container',
    authOk: Boolean(BRIDGE_URL || process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY),
  });
});

app.get('/healthz', (_req, res) => res.json({ ok: true }));

// Stream NDJSON về trình duyệt:
//   {"type":"delta","text":"..."}  {"type":"done","text":"..."}  {"type":"error","message":"..."}
app.post('/api/ask', (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const sessionId = req.body?.sessionId;
  if (!text) return res.status(400).json({ error: 'Thiếu nội dung câu hỏi.' });
  if (text.length > 8000) return res.status(400).json({ error: 'Câu hỏi quá dài.' });
  if (!UUID_RE.test(sessionId || '')) return res.status(400).json({ error: 'sessionId không hợp lệ.' });
  if (busySessions.has(sessionId)) return res.status(409).json({ error: 'Đang xử lý câu trước, đợi chút nhé.' });

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const send = (obj) => { if (!res.writableEnded) res.write(JSON.stringify(obj) + '\n'); };

  busySessions.add(sessionId);
  const lang = req.body?.lang === 'en' ? 'en' : 'vi';
  const proc = runClaude({ text, sessionId, systemPrompt: SYSTEM_PROMPTS[lang] });
  let full = '';
  let resultText = '';
  let finished = false;
  let errorSent = false;

  const timer = setTimeout(() => {
    errorSent = true;
    send({ type: 'error', message: 'Claude phản hồi quá lâu, đã dừng.' });
    proc.kill();
  }, TIMEOUT_MS);

  proc.on('line', (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.type === 'stream_event') {
      const ev = msg.event;
      if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
        full += ev.delta.text;
        send({ type: 'delta', text: ev.delta.text });
      }
    } else if (msg.type === 'result') {
      if (msg.is_error) {
        errorSent = true;
        const m = msg.result || 'Claude báo lỗi.';
        const hint = /not logged in|login/i.test(m)
          ? (BRIDGE_URL ? ' → Claude CLI trên máy chưa đăng nhập, chạy `claude` rồi /login.' : ' → Thiếu CLAUDE_CODE_OAUTH_TOKEN trong file .env.')
          : '';
        send({ type: 'error', message: m + hint });
      } else {
        resultText = msg.result || '';
      }
    }
  });

  proc.on('exit', (code, stderr) => {
    finished = true;
    clearTimeout(timer);
    busySessions.delete(sessionId);
    if (code === 0) {
      if (!full && resultText) send({ type: 'delta', text: resultText });
      send({ type: 'done', text: full || resultText });
    } else if (!errorSent) {
      console.error(`[claude exit ${code}]`, String(stderr).slice(-2000));
      send({ type: 'error', message: code === -1 ? String(stderr) : `Claude thoát với mã ${code}. ${String(stderr).trim().slice(-300)}`.trim() });
    }
    res.end();
  });

  res.on('close', () => { if (!finished) proc.kill(); });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Trợ lý giọng nói đang chạy ở cổng ${PORT} · Claude: ${BRIDGE_URL ? `bridge ${BRIDGE_URL}` : 'CLI trong container'}`);
});
