#!/usr/bin/env node
// MC Message Relay - receives messages from Mission Control and writes to a file
// that gets picked up by an OpenClaw cron for Telegram delivery
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8099;
const MSG_FILE = path.join(__dirname, 'data', 'agent-messages.json');

function readMessages() {
  try { return JSON.parse(fs.readFileSync(MSG_FILE, 'utf8')); } catch(e) { return []; }
}

function writeMessages(msgs) {
  fs.writeFileSync(MSG_FILE, JSON.stringify(msgs, null, 2));
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'POST' && req.url === '/message') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const msg = JSON.parse(body);
        const msgs = readMessages();
        msgs.push({ ...msg, relayed: false, timestamp: new Date().toISOString() });
        writeMessages(msgs);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/pending') {
    const msgs = readMessages().filter(m => !m.relayed);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(msgs));
    return;
  }

  if (req.method === 'POST' && req.url === '/mark-relayed') {
    const msgs = readMessages().map(m => ({ ...m, relayed: true }));
    writeMessages(msgs);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, count: msgs.length }));
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[MC Relay] listening on http://127.0.0.1:${PORT}`);
});
