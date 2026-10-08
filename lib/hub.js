// Shared helpers for the agent hub: paths, atomic file IO, item validation,
// the daily log, agent identity and project/task storage. No dependencies.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HUB = process.env.HUB_DIR ? path.resolve(process.env.HUB_DIR) : path.resolve(__dirname, '..');
const DIRS = {
  inbox: path.join(HUB, 'inbox'),
  answers: path.join(HUB, 'answers'),
  archive: path.join(HUB, 'archive'),
  log: path.join(HUB, 'log'),
  agents: path.join(HUB, 'agents'),
  projects: path.join(HUB, 'projects'),
  directives: path.join(HUB, 'directives'),
};

const TYPES = ['status', 'question', 'approval', 'delivery', 'idea', 'handover', 'audit'];
const NEEDS_ME_TYPES = ['question', 'approval'];
const TASK_STATUSES = ['backlog', 'ready-for-dev', 'in-progress', 'review', 'done'];
const PHASES = ['planning', 'building', 'review', 'complete'];
const DECISIONS = ['approve', 'feedback', 'more_info', 'reject', 'auto'];
const MAX_BULLETS = 5;
const STALE_MINUTES = 30;
const AUTO_PROCEED_HOURS = 4;
const STATUS_EVERY_HOURS = 2;

function ensureDirs() {
  for (const d of Object.values(DIRS)) fs.mkdirSync(d, { recursive: true });
}

function nowIso() { return new Date().toISOString(); }

function newId(prefix) {
  const t = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return `${prefix}_${t}_${crypto.randomBytes(3).toString('hex')}`;
}

// Write to a dot-prefixed temp file, then rename, so readers never see half a file.
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function listJson(dir) {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('.'));
  } catch { return []; }
}

function log(event, data = {}) {
  ensureDirs();
  const day = nowIso().slice(0, 10);
  const line = JSON.stringify({ ts: nowIso(), event, ...data }) + '\n';
  fs.appendFileSync(path.join(DIRS.log, `${day}.jsonl`), line);
}

function slug(s) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

// ---------- items ----------

function itemPath(id) {
  for (const dir of [DIRS.inbox, DIRS.archive]) {
    const p = path.join(dir, `${id}.json`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function readItem(id) {
  const p = itemPath(id);
  return p ? readJson(p) : null;
}

const UI_WORDS = /\b(ui|ux|design|layout|screen|page|button|css|style|styling|mockup|component|landing|visual|logo|icon|font|typography)\b/i;
const COLOR_WORDS = /\b(colou?rs?|palette|hex|brand colou?rs?|theme)\b/i;

// Returns a list of problems. Empty list means the item follows the protocol.
function validateItem(item) {
  const errs = [];
  if (!TYPES.includes(item.type)) errs.push(`type must be one of ${TYPES.join(', ')}`);
  if (!item.agent) errs.push('agent is required');
  if (!item.project) errs.push('project is required');
  if (!item.title || !String(item.title).trim()) errs.push('title is required');
  if (item.title && String(item.title).length > 100) errs.push('title must be 100 characters or fewer');
  if (!Array.isArray(item.bullets)) errs.push('bullets must be a list');
  else {
    if (item.bullets.length > MAX_BULLETS) errs.push(`max ${MAX_BULLETS} bullets (got ${item.bullets.length})`);
    if (item.bullets.some((b) => String(b).length > 220)) errs.push('each bullet must be 220 characters or fewer');
  }
  if (!['normal', 'high'].includes(item.priority)) errs.push('priority must be normal or high');
  if (NEEDS_ME_TYPES.includes(item.type)) {
    if (!item.recommendation || !String(item.recommendation).trim()) {
      errs.push('question and approval items require a recommendation (one sentence)');
    }
    if (typeof item.reversible !== 'boolean') errs.push('question and approval items require reversible: true or false');
    if (!item.bullets || item.bullets.length === 0) errs.push('question and approval items need at least one bullet');
  }
  if (item.type === 'delivery') {
    if (!item.links || item.links.length === 0) errs.push('delivery items need at least one link or path to the result');
    if (!item.bullets || item.bullets.length !== 3) errs.push('delivery items need exactly 3 summary bullets');
    if (!item.verification || item.verification.length === 0) {
      errs.push('delivery items need verification evidence (commands run and their result)');
    }
  }
  if (item.type === 'handover' && !item.to_agent) errs.push('handover items need to_agent');
  if ((item.type === 'status' || item.type === 'delivery') && /\?/.test(`${item.title} ${(item.bullets || []).join(' ')}`)) {
    errs.push('questions go in their own question item (--type question), never inside a status or delivery');
  }
  const text = `${item.title} ${(item.bullets || []).join(' ')}`;
  const atts = item.attachments || [];
  const hasImage = atts.some((a) => /\.(png|jpe?g|gif|webp|svg)$/i.test(a));
  const hasColors = [...atts, ...(item.links || [])].some((a) => /\.(csv|json)$/i.test(a)) || (item.colors && item.colors.length);
  if (['question', 'approval', 'delivery'].includes(item.type)) {
    if (UI_WORDS.test(text) && !hasImage && !item.no_visual) {
      errs.push('UI or design related: attach a screenshot (or pass --no-visual if it is not about visuals)');
    }
    if (COLOR_WORDS.test(text) && !hasColors && !item.no_visual) {
      errs.push('color related: attach a color table (.csv or .json with name,hex,usage)');
    }
  }
  for (const a of atts) {
    if (!path.isAbsolute(a)) errs.push(`attachment must be an absolute path: ${a}`);
    else if (!/^https?:/.test(a) && !fs.existsSync(a)) errs.push(`attachment not found: ${a}`);
  }
  return errs;
}

function initialStatus(type) {
  return { status: 'info', question: 'open', approval: 'open', delivery: 'open', idea: 'parked', handover: 'open', audit: 'info' }[type];
}

function moveToArchive(id) {
  const src = path.join(DIRS.inbox, `${id}.json`);
  if (fs.existsSync(src)) fs.renameSync(src, path.join(DIRS.archive, `${id}.json`));
}

function updateItem(id, patch) {
  const p = itemPath(id);
  if (!p) return null;
  const item = { ...readJson(p), ...patch };
  writeJson(p, item);
  return item;
}

// ---------- answers ----------

// Parse "1 yes, 2 no, 3 use option B" into {"1":"yes","2":"no","3":"use option B"}.
function parsePerNumber(text) {
  const out = {};
  const re = /(?:^|[,;\n]\s*)(\d{1,2})\s*[.:)\-=]?\s+/g;
  const marks = [];
  let m;
  while ((m = re.exec(text))) marks.push({ n: m[1], start: m.index, after: re.lastIndex });
  if (marks.length === 0) return null;
  marks.forEach((mk, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].start : text.length;
    out[mk.n] = text.slice(mk.after, end).replace(/[,;\s]+$/, '').trim();
  });
  return out;
}

function recommendationsFor(item) {
  if (Array.isArray(item.recommendations) && item.recommendations.length) {
    const map = {};
    item.recommendations.forEach((r, i) => { map[String(i + 1)] = r; });
    return map;
  }
  return null;
}

function writeAnswer(item, decision, text, by = 'ceo') {
  if (!DECISIONS.includes(decision)) throw new Error(`decision must be one of ${DECISIONS.join(', ')}`);
  let perQuestion = null;
  if (decision === 'approve' || decision === 'auto') perQuestion = recommendationsFor(item);
  if (decision === 'feedback' && text) perQuestion = parsePerNumber(text);
  const answer = {
    item_id: item.id,
    agent: item.agent,
    project: item.project,
    type: item.type,
    title: item.title,
    decision,
    text: text || '',
    per_question: perQuestion,
    recommendation: item.recommendation || null,
    content_hash: item.content_hash || null,
    meaning: {
      approve: 'Approved. Proceed with your recommendation (all numbered recommendations if batched).',
      feedback: 'Follow the feedback text. Numbered answers map to your numbered questions.',
      more_info: 'Not decided yet. Post a new item with --reply-to this id that gives the missing information.',
      reject: 'Not approved. Do not do this. Continue other work; post a new question only if you are blocked.',
      auto: 'No answer within 4 hours on a reversible decision. You proceeded with your recommendation.',
    }[decision],
    answered_by: by,
    answered_at: nowIso(),
  };
  writeJson(path.join(DIRS.answers, `${item.id}.json`), answer);
  updateItem(item.id, { status: decision === 'auto' ? 'auto_resolved' : 'answered', needs_me: false, answer: { decision, text: text || '', at: answer.answered_at } });
  moveToArchive(item.id);
  log('answered', { item_id: item.id, agent: item.agent, project: item.project, decision, text: text || '', by });
  return answer;
}

// ---------- agent identity ----------

// Agents find their name/project from .hub.json in their repo (searched upward from cwd),
// or from HUB_AGENT / HUB_PROJECT env vars, or from --agent / --project flags.
function findIdentity(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  for (;;) {
    const f = path.join(dir, '.hub.json');
    if (fs.existsSync(f)) return { ...readJson(f, {}), file: f };
    const up = path.dirname(dir);
    if (up === dir) return {};
    dir = up;
  }
}

function identity(flags = {}, cwd) {
  const found = findIdentity(cwd);
  const agent = flags.agent || process.env.HUB_AGENT || found.agent;
  const project = flags.project || process.env.HUB_PROJECT || found.project;
  const role = (found.agents && agent && found.agents[agent]) || (agent === found.agent ? found.role : '') || '';
  return { agent, project, role, repo: found.repo || (found.file ? path.dirname(found.file) : '') };
}

function agentFile(agent) { return path.join(DIRS.agents, `${slug(agent)}.json`); }

function touchAgent(agent, patch = {}) {
  if (!agent) return null;
  const f = agentFile(agent);
  const cur = readJson(f, { agent, first_seen: nowIso() });
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== ''));
  const next = { ...cur, ...clean, agent, last_seen: nowIso() };
  writeJson(f, next);
  return next;
}

// ---------- projects and tasks ----------

function projectDir(project) { return path.join(DIRS.projects, slug(project)); }
function readProject(project) { return readJson(path.join(projectDir(project), 'project.json')); }
function listProjects() {
  try {
    return fs.readdirSync(DIRS.projects).map((d) => readJson(path.join(DIRS.projects, d, 'project.json'))).filter(Boolean);
  } catch { return []; }
}
function listTasks(project) {
  const dir = path.join(projectDir(project), 'tasks');
  return listJson(dir).map((f) => readJson(path.join(dir, f))).filter(Boolean)
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
}
function taskPath(project, id) { return path.join(projectDir(project), 'tasks', `${slug(id)}.json`); }

// ---------- directives (lead agent or CEO -> agent) ----------

function listDirectives(agent) {
  const dir = path.join(DIRS.directives, slug(agent));
  return listJson(dir).map((f) => readJson(path.join(dir, f))).filter(Boolean)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

// New answers and directives for an agent, as readable lines. mark=true records them as read.
function pendingFor(agent, mark) {
  const st = readJson(agentFile(agent), {});
  const seenA = new Set(st.seen_answers || []);
  const seenD = new Set(st.seen_directives || []);
  const out = [];
  for (const f of listJson(DIRS.answers)) {
    const a = readJson(path.join(DIRS.answers, f));
    if (!a || a.agent !== agent || seenA.has(a.item_id)) continue;
    let s = `ANSWER to "${a.title}" (${a.item_id}): ${a.decision}${a.text ? ` - ${a.text}` : ''}`;
    if (a.per_question) s += ' | ' + Object.entries(a.per_question).map(([n, v]) => `${n}: ${v}`).join('; ');
    out.push(`${s} [${a.meaning}]`);
    seenA.add(a.item_id);
  }
  for (const d of listDirectives(agent)) {
    if (seenD.has(d.id)) continue;
    out.push(`${d.broadcast ? 'BROADCAST to all leads' : 'DIRECTIVE'} from ${d.from} (${d.id}): ${d.text}`);
    seenD.add(d.id);
  }
  if (mark && out.length) touchAgent(agent, { seen_answers: [...seenA].slice(-500), seen_directives: [...seenD].slice(-500) });
  return out;
}

// ---------- CLI arg parsing ----------

// --key value, --flag, repeated keys become arrays when listed in `multi`.
function parseArgs(argv, multi = []) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    let key = a.slice(2);
    let val;
    if (key.includes('=')) { [key, val] = [key.slice(0, key.indexOf('=')), key.slice(key.indexOf('=') + 1)]; }
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) val = argv[++i];
    else val = true;
    key = key.replace(/-/g, '_');
    if (multi.includes(key)) (out[key] = out[key] || []).push(val);
    else out[key] = val;
  }
  return out;
}

function die(msg, code = 1) {
  process.stderr.write(`hub: ${msg}\n`);
  process.exit(code);
}

function ageMinutes(iso) { return iso ? (Date.now() - Date.parse(iso)) / 60000 : Infinity; }

module.exports = {
  HUB, DIRS, TYPES, NEEDS_ME_TYPES, TASK_STATUSES, PHASES, DECISIONS, MAX_BULLETS,
  STALE_MINUTES, AUTO_PROCEED_HOURS, STATUS_EVERY_HOURS,
  ensureDirs, nowIso, newId, writeJson, readJson, listJson, log, slug,
  itemPath, readItem, validateItem, initialStatus, moveToArchive, updateItem,
  parsePerNumber, recommendationsFor, writeAnswer,
  findIdentity, identity, agentFile, touchAgent,
  projectDir, readProject, listProjects, listTasks, taskPath, listDirectives, pendingFor,
  parseArgs, die, ageMinutes,
};
