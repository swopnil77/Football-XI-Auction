import 'dotenv/config';
import http from 'http';
import { tick } from './engine';

const TICK_MS = 500; // how often to check for expired rounds — tune freely
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

let lastTickAt = new Date().toISOString();
let tickCount = 0;
let lastError: string | null = null;

// Most hosts (Render, Railway, Fly) expect something listening on $PORT even for a
// background worker — this also doubles as a handy status page.
http
  .createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', lastTickAt, tickCount, lastError }));
  })
  .listen(port, () => {
    console.log(`[engine] health check listening on :${port}`);
  });

async function loop() {
  try {
    await tick();
    lastError = null;
  } catch (err: any) {
    lastError = err?.message ?? String(err);
    console.error('[engine] tick error:', err);
  }
  lastTickAt = new Date().toISOString();
  tickCount++;
  setTimeout(loop, TICK_MS);
}

console.log('[engine] Iconic XI auction engine starting…');
loop();
