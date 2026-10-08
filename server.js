#!/usr/bin/env node
// Agent hub dashboard server. Plain Node, no dependencies.
// Start: npm start (or node server.js --open)  ->  http://localhost:4747
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const hub = require('./lib/hub');

const PORT = Number(process.env.HUB_PORT || 4747);
const HOST = process.env.HUB_HOST || '127.0.0.1';
const PUBLIC = path.join(__dirname, 'public');
const FEED_DAYS = 7;
const FEED_MAX = 300;
const STATUS_ARCHIVE_HOURS = 48;

hub.ensureDirs();

// ---------- reading state (cached by file mtime) ----------

const cache = new Map(); // path -> {mtimeMs, data}
function cachedJson(file) {
  let st;
  try { st = fs.statSync(file); } catch { cache.delete(file); return null; }
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === st.mtimeMs) return hit.data;
  const data = hub.readJson(file);
  if (data) cache.set(file, { mtimeMs: st.mtimeMs, data });
  return data;
}

function readDir(dir, maxAgeDays) {
  const out = [];
  for (const f of hub.listJson(dir)) {
    const p = path.join(dir, f);
    if (maxAgeDays) {
      try { if (Date.now() - fs.statSync(p).mtimeMs > maxAgeDays * 864e5) continue; } catch { continue; }
    }
    const d = cachedJson(p);
    if (d) out.push(d);
  }
  return out;
}

function agentState(a, items, tasks) {
  const lastStatus = a.last_status_at || null;
  const lastActivity = [a.last_activity_at, a.last_status_at, a.last_item_at].filter(Boolean).sort().pop() || null;
  const fresh = hub.ageMinutes(lastActivity) <= hub.STALE_MINUTES;
  const waiting = items.some((i) => i.agent === a.agent && i.needs_me && i.status === 'open');
  const owns = tasks.filter((t) => t.owner === a.agent && t.status === 'in-progress').map((t) => t.id);
  let state = fresh ? 'running' : 'idle';
  if (a.state === 'offline' && !fresh) state = 'offline';
  if (a.delivered_at && !owns.length && hub.ageMinutes(a.delivered_at) < hub.ageMinutes(lastActivity) + 1) state = fresh ? 'running' : 'done';
  return {
    agent: a.agent, project: a.project || '', role: a.role || '', state, waiting_on_you: waiting,
    last_activity_at: lastActivity, last_status_at: lastStatus, last_status_title: a.last_status_title || '',
    current_task: a.current_task || (owns[0] || null), tokens: a.tokens || null,
    loop: a.loop && a.loop.count >= 5 ? a.loop : null, errors: a.errors || 0,
  };
}

function buildState() {
  const inbox = readDir(hub.DIRS.inbox);
  const archive = readDir(hub.DIRS.archive, FEED_DAYS);
  const items = [...inbox, ...archive].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))).slice(0, FEED_MAX);
  const projects = hub.listProjects().map((p) => {
    const tasks = hub.listTasks(p.name);
    const counts = Object.fromEntries(hub.TASK_STATUSES.map((s) => [s, tasks.filter((t) => t.status === s).length]));
    return { name: p.name, goal: p.goal, phase: p.phase, priority: p.priority || 'P2', scope: p.scope, never: p.never || [], lead: p.lead || '', counts, total: tasks.length,
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, owner: t.owner || '', pending_owner: t.pending_owner || '', epic: t.epic })) };
  });
  const allTasks = projects.flatMap((p) => p.tasks);
  const agents = readDir(hub.DIRS.agents).filter((a) => a.agent).map((a) => agentState(a, inbox, allTasks))
    .sort((a, b) => a.agent.localeCompare(b.agent));
  // Agents that only ever posted items (no hook, no registration) still show up.
  for (const it of items) {
    if (!agents.find((a) => a.agent === it.agent)) agents.push(agentState({ agent: it.agent, project: it.project, last_item_at: it.timestamp }, inbox, allTasks));
  }
  return { now: hub.nowIso(), stale_minutes: hub.STALE_MINUTES, items, agents, projects };
}

// ---------- inbox watcher: log new items, archive old status items ----------

const seen = new Set(hub.listJson(hub.DIRS.inbox));
function scanInbox() {
  for (const f of hub.listJson(hub.DIRS.inbox)) {
    if (seen.has(f)) continue;
    seen.add(f);
    const it = cachedJson(path.join(hub.DIRS.inbox, f));
    if (it) hub.log('item_seen', { item_id: it.id, agent: it.agent, project: it.project, type: it.type });
  }
}
function archiveOldStatus() {
  for (const f of hub.listJson(hub.DIRS.inbox)) {
    const it = cachedJson(path.join(hub.DIRS.inbox, f));
    if (it && ['status', 'audit'].includes(it.type) && it.priority !== 'high' && hub.ageMinutes(it.timestamp) > STATUS_ARCHIVE_HOURS * 60) {
      hub.moveToArchive(it.id);
    }
  }
}
setInterval(scanInbox, 3000);
setInterval(archiveOldStatus, 3600e3);
archiveOldStatus();

// ---------- actions ----------

function act(body) {
  const item = hub.readItem(body.item_id);
  if (!item) return [404, { error: 'item not found' }];
  const action = body.action;
  if (['approve', 'feedback', 'more_info', 'reject'].includes(action)) {
    if (!item.needs_me || item.status !== 'open') return [409, { error: `item is ${item.status}` }];
    const text = String(body.text || '').trim().slice(0, 1000);
    if (action === 'feedback' && !text) return [400, { error: 'feedback needs text' }];
    const ans = hub.writeAnswer(item, action, text, 'ceo');
    return [200, { ok: true, answer: ans }];
  }
  if (action === 'acknowledge') {
    if (item.needs_me && item.status === 'open') return [409, { error: 'answer this item instead' }];
    hub.updateItem(item.id, { status: item.type === 'idea' ? 'archived' : 'acknowledged', acknowledged_at: hub.nowIso() });
    hub.moveToArchive(item.id);
    hub.log('acknowledged', { item_id: item.id, agent: item.agent, project: item.project, type: item.type });
    return [200, { ok: true }];
  }
  if (action === 'keep_idea') {
    if (item.type !== 'idea') return [400, { error: 'not an idea' }];
    hub.updateItem(item.id, { status: 'kept', kept_at: hub.nowIso() });
    hub.log('idea_kept', { item_id: item.id, agent: item.agent, project: item.project });
    return [200, { ok: true }];
  }
  return [400, { error: 'unknown action' }];
}

function connectProject(body) {
  const folder = String(body.folder || '').trim().replace(/^~(?=\/|$)/, require('os').homedir());
  const project = hub.slug(body.project || path.basename(folder));
  const agents = String(body.agents || 'lead,builder').split(',').map((s) => s.trim()).filter(Boolean)
    .map((name) => ({ name, role: name.startsWith('lead') ? 'lead' : (name.startsWith('design') ? 'designer' : 'dev') }));
  try {
    const r = require('./lib/connect').connect({ folder, project, agents, brief: String(body.brief || ''), createFolder: true });
    return [200, { ok: true, ...r }];
  } catch (e) { return [400, { error: e.message }]; }
}

function broadcast(body) {
  const text = String(body.text || '').trim().slice(0, 800);
  if (!text) return [400, { error: 'text required' }];
  const leads = readDir(hub.DIRS.agents).filter((a) => a.agent && a.role === 'lead').map((a) => a.agent);
  if (!leads.length) return [400, { error: 'There are no lead agents yet. Add a project with a lead first.' }];
  const bid = hub.newId('bc');
  for (const to of leads) {
    const d = { id: hub.newId('dir'), timestamp: hub.nowIso(), from: 'ceo', to, text, broadcast: bid };
    hub.writeJson(path.join(hub.DIRS.directives, hub.slug(to), `${d.id}.json`), d);
  }
  hub.log('broadcast', { id: bid, to: leads, text });
  return [200, { ok: true, leads }];
}

function setPriority(body) {
  const pr = hub.readProject(String(body.project || ''));
  if (!pr) return [404, { error: 'project not found' }];
  if (!['P1', 'P2', 'P3'].includes(body.priority)) return [400, { error: 'priority must be P1, P2 or P3' }];
  hub.writeJson(path.join(hub.projectDir(pr.name), 'project.json'), { ...pr, priority: body.priority, updated_at: hub.nowIso() });
  hub.log('project_priority', { project: pr.name, priority: body.priority });
  return [200, { ok: true }];
}

function message(body) {
  const to = String(body.agent || '').trim();
  const text = String(body.text || '').trim().slice(0, 500);
  if (!to || !text) return [400, { error: 'agent and text required' }];
  const d = { id: hub.newId('dir'), timestamp: hub.nowIso(), from: 'ceo', to, text };
  hub.writeJson(path.join(hub.DIRS.directives, hub.slug(to), `${d.id}.json`), d);
  hub.log('directive', { from: 'ceo', to, text, id: d.id });
  return [200, { ok: true, id: d.id }];
}

// ---------- attachments: only files referenced by an item ----------

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.csv': 'text/plain; charset=utf-8', '.json': 'application/json', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.pdf': 'application/pdf' };

function allowedFile(p) {
  const all = [...readDir(hub.DIRS.inbox), ...readDir(hub.DIRS.archive)];
  return all.some((it) => (it.attachments || []).includes(p) || (it.links || []).includes(p));
}

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e5) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/api/state') return send(res, 200, buildState());
    if (req.method === 'POST' && ['/api/action', '/api/message', '/api/connect', '/api/broadcast', '/api/priority'].includes(url.pathname)) {
      // Same-origin only: browsers send Origin on POST; reject other sites posting to localhost.
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'cross-origin' });
      const body = await readBody(req);
      const handler = { '/api/action': act, '/api/message': message, '/api/connect': connectProject, '/api/broadcast': broadcast, '/api/priority': setPriority }[url.pathname];
      const [code, out] = handler(body);
      return send(res, code, out);
    }
    if (req.method === 'GET' && url.pathname === '/file') {
      const p = url.searchParams.get('path') || '';
      if (!path.isAbsolute(p) || !allowedFile(p) || !fs.existsSync(p)) return send(res, 404, { error: 'not found' });
      return send(res, 200, fs.readFileSync(p), MIME[path.extname(p).toLowerCase()] || 'application/octet-stream');
    }
    if (req.method === 'GET') {
      const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const p = path.join(PUBLIC, path.normalize(rel));
      if (!p.startsWith(PUBLIC) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return send(res, 404, 'not found', 'text/plain');
      return send(res, 200, fs.readFileSync(p), MIME[path.extname(p)] || 'application/octet-stream');
    }
    send(res, 405, { error: 'method not allowed' });
  } catch (e) {
    send(res, 500, { error: String(e.message || e) });
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    process.stdout.write(`The dashboard is already running at http://localhost:${PORT}\n`);
    if (process.argv.includes('--open')) openBrowser(`http://localhost:${PORT}`);
    process.exit(0);
  }
  throw e;
});

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try { require('child_process').spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref(); } catch { /* no browser */ }
}

server.listen(PORT, HOST, () => {
  const url = `http://${HOST === '127.0.0.1' ? 'localhost' : HOST}:${PORT}`;
  process.stdout.write(`Agent hub running at ${url}  (hub: ${hub.HUB})\nLeave this window open. Press Ctrl+C to stop.\n`);
  if (process.argv.includes('--open')) openBrowser(url);
});
