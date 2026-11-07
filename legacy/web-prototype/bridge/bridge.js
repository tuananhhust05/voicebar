#!/usr/bin/env node
// Bridge chạy TRÊN MÁY MAC: nhận yêu cầu từ container, gọi `claude` CLI đã đăng nhập sẵn của máy.
// Chỉ nghe ở 127.0.0.1, bắt buộc token, và tự cố định tham số CLI (không tool, không MCP).
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Đọc .env của dự án (không cần thư viện dotenv)
try {
  for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* không có .env */ }

const PORT = Number(process.env.BRIDGE_PORT || 4871);
const TOKEN = process.env.BRIDGE_TOKEN || '';
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const WORKDIR = path.join(ROOT, 'bridge-workspace');
const TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS || 120_000);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODEL_RE = /^[a-z0-9.\-\[\]]{1,64}$/i;

if (TOKEN.length < 16) {
  console.error('Thiếu BRIDGE_TOKEN (>=16 ký tự) trong .env');
  process.exit(1);
}
mkdirSync(WORKDIR, { recursive: true });

const knownSessions = new Set();
const busy = new Set();

function readBody(req, limit = 128 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end('{"ok":true}');
  }
  if (req.method !== 'POST' || req.url !== '/ask') { res.writeHead(404); return res.end(); }
  if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(401); return res.end('unauthorized'); }

  let body;
  try { body = JSON.parse(await readBody(req)); } catch { res.writeHead(400); return res.end('bad json'); }
  const { text, sessionId, model, systemPrompt } = body || {};
  if (typeof text !== 'string' || !text.trim() || text.length > 8000) { res.writeHead(400); return res.end('bad text'); }
  if (!UUID_RE.test(sessionId || '')) { res.writeHead(400); return res.end('bad sessionId'); }
  if (model && !MODEL_RE.test(model)) { res.writeHead(400); return res.end('bad model'); }
  if (systemPrompt != null && (typeof systemPrompt !== 'string' || systemPrompt.length > 4000)) { res.writeHead(400); return res.end('bad systemPrompt'); }
  if (busy.has(sessionId)) { res.writeHead(409); return res.end('busy'); }

  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--tools', '',
    '--strict-mcp-config',
    '--setting-sources', 'project',
  ];
  if (systemPrompt) args.push('--system-prompt', systemPrompt);
  if (model) args.push('--model', model);
  args.push(knownSessions.has(sessionId) ? '--resume' : '--session-id', sessionId);

  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' });
  busy.add(sessionId);
  const started = Date.now();
  const child = spawn(CLAUDE_BIN, args, { cwd: WORKDIR, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.end(text);

  let stderr = '';
  let done = false;
  const timer = setTimeout(() => child.kill('SIGTERM'), TIMEOUT_MS);
  child.stdout.on('data', (c) => res.write(c));
  child.stderr.on('data', (c) => { stderr += c.toString('utf8'); });
  child.on('error', (err) => { stderr += `spawn error: ${err.message}`; });
  child.on('close', (code) => {
    done = true;
    clearTimeout(timer);
    busy.delete(sessionId);
    if (code === 0) knownSessions.add(sessionId);
    console.log(`[${new Date().toISOString()}] ${sessionId.slice(0, 8)} exit=${code} ${Date.now() - started}ms`);
    res.end('\n' + JSON.stringify({ type: 'bridge_exit', code, stderr: stderr.slice(-2000) }) + '\n');
  });
  res.on('close', () => { if (!done) child.kill('SIGTERM'); });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Claude bridge đang nghe ở http://127.0.0.1:${PORT} (dùng ${CLAUDE_BIN} của máy)`);
});
