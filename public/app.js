// Agent Hub dashboard. Plain browser JS, no build step.
'use strict';

const REFRESH_MS = 10000;
const TYPE_LABEL = { status: 'Status', question: 'Question', approval: 'Approval', delivery: 'Delivery', idea: 'Idea', handover: 'Handover', audit: 'Audit' };
const DECISION_LABEL = { approve: 'Approved', feedback: 'Feedback', more_info: 'Asked for more info', reject: 'Not approved', auto: 'Auto-proceeded (no answer in 4h)' };

let state = null;
const drafts = {};      // item id -> feedback text being typed (survives refresh)
const msgDrafts = {};   // agent -> message text
const colorCache = {};  // attachment path -> parsed color rows or 'none'
const filters = loadFilters();

// ---------- helpers ----------

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function ago(iso) {
  if (!iso) return 'never';
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function until(iso) {
  const s = (Date.parse(iso) - Date.now()) / 1000;
  if (s <= 0) return null;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
function fileUrl(p) { return `/file?path=${encodeURIComponent(p)}`; }
function isImage(p) { return /\.(png|jpe?g|gif|webp|svg)$/i.test(p); }
function isTable(p) { return /\.(csv|json)$/i.test(p); }
function base(p) { return String(p).split('/').pop(); }
function fmtTokens(t) {
  if (!t) return '';
  const n = t.input + t.output + t.cache_write;
  return n > 1e6 ? `${(n / 1e6).toFixed(1)}M tokens` : `${Math.round(n / 1e3)}k tokens`;
}
function loadFilters() {
  try { return JSON.parse(localStorage.getItem('hub-filters')) || { agent: '', project: '', type: '' }; }
  catch { return { agent: '', project: '', type: '' }; }
}
function saveFilters() { try { localStorage.setItem('hub-filters', JSON.stringify(filters)); } catch { /* private mode */ } }
function passes(it) {
  return (!filters.agent || it.agent === filters.agent || it.to_agent === filters.agent)
    && (!filters.project || it.project === filters.project)
    && (!filters.type || it.type === filters.type);
}

// ---------- data ----------

async function load() {
  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    state = await r.json();
    render();
    document.getElementById('refreshed').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  } catch {
    document.getElementById('refreshed').textContent = 'Server unreachable, retrying';
  }
}

async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out.error || `HTTP ${r.status}`);
  return out;
}

async function act(id, action, text) {
  const card = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (card) card.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try {
    await post('/api/action', { item_id: id, action, text });
    delete drafts[id];
  } catch (e) {
    if (card) {
      card.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      let err = card.querySelector('.error');
      if (!err) { err = document.createElement('p'); err.className = 'error'; card.appendChild(err); }
      err.textContent = `Could not save: ${e.message}`;
      return;
    }
  }
  load();
}

// ---------- rendering ----------

function renderAgents() {
  const el = document.getElementById('agents');
  if (!state.agents.length) {
    el.innerHTML = '<p class="empty">No agents yet. Use Add project above to connect your first project.</p>';
    const d = document.getElementById('add-details');
    if (!d.dataset.auto) { d.open = true; d.dataset.auto = '1'; }
    return;
  }
  el.innerHTML = state.agents.map((a) => {
    const stateText = { running: 'Running', idle: 'Idle', offline: 'Offline', done: 'Delivered' }[a.state] || a.state;
    const lines = [];
    lines.push(`${esc(a.project)}${a.role ? ` · ${esc(a.role)}` : ''}${a.current_task ? ` · task ${esc(a.current_task)}` : ''}`);
    if (a.waiting_on_you) lines.push('<span class="waiting">Waiting on you</span>');
    if (a.loop) lines.push(`<span class="warn">Looping on ${esc(a.loop.tool)} (${a.loop.count}x)</span>`);
    if (a.last_status_title) lines.push(`Last status: ${esc(a.last_status_title)}`);
    lines.push(a.last_activity_at ? `Active ${ago(a.last_activity_at)}${a.tokens ? ` · ${fmtTokens(a.tokens)}` : ''}` : 'Not started yet');
    const open = Object.prototype.hasOwnProperty.call(msgDrafts, a.agent);
    return `<div class="agent" data-agent="${esc(a.agent)}">
      <div class="agent-top"><span class="dot ${esc(a.state)}"></span>
        <button class="agent-name" data-filter-agent="${esc(a.agent)}" title="Show only this agent">${esc(a.agent)}</button>
        <span class="agent-state ${esc(a.state)}">${esc(stateText)}</span></div>
      ${lines.map((l) => `<p>${l}</p>`).join('')}
      <div class="agent-actions">${open
        ? `<div class="msg-row"><input type="text" data-msg-input="${esc(a.agent)}" value="${esc(msgDrafts[a.agent])}" placeholder="Message to ${esc(a.agent)}" maxlength="500"><button class="btn primary" data-msg-send="${esc(a.agent)}">Send</button></div>`
        : `<button class="link" data-msg-open="${esc(a.agent)}">Message</button>`}</div>
    </div>`;
  }).join('');
}

function renderProjects() {
  const el = document.getElementById('projects');
  document.getElementById('projects-block').hidden = !state.projects.length;
  const rank = { P1: 0, P2: 1, P3: 2 };
  el.innerHTML = state.projects.slice().sort((a, b) => rank[a.priority] - rank[b.priority] || a.name.localeCompare(b.name)).map((p) => {
    const pct = p.total ? Math.round((p.counts.done / p.total) * 100) : 0;
    const ideas = state.items.filter((i) => i.type === 'idea' && i.project === p.name && ['parked', 'kept'].includes(i.status)).length;
    const summary = ['in-progress', 'review', 'ready-for-dev', 'backlog'].filter((s) => p.counts[s]).map((s) => `${p.counts[s]} ${s}`).join(' · ');
    return `<div class="project">
      <div class="project-top"><h3>${esc(p.name)}</h3><span class="count">${esc(p.phase)} · ${p.counts.done}/${p.total} tasks done</span></div>
      <p><label>Priority <select data-prio="${esc(p.name)}">${['P1', 'P2', 'P3'].map((v) => `<option${p.priority === v ? ' selected' : ''}>${v}</option>`).join('')}</select></label></p>
      <p>${esc(p.goal || '')}</p>
      <div class="bar" role="img" aria-label="${pct}% done"><span style="width:${pct}%"></span></div>
      <p>${summary || 'No open tasks'}${ideas ? ` · ${ideas} idea${ideas === 1 ? '' : 's'} parked` : ''}${p.lead ? ` · lead: ${esc(p.lead)}` : ''}</p>
      <details><summary>Plan scope and tasks</summary>
        <p><strong>In scope:</strong> ${p.scope.map(esc).join('; ')}</p>
        ${p.never.length ? `<p><strong>Never:</strong> ${p.never.map(esc).join('; ')}</p>` : ''}
        <ul class="tasks">${p.tasks.map((t) => `<li><span class="tid">${esc(t.id)}</span><span>${esc(t.title)}</span><span class="tstatus ${esc(t.status)}">${esc(t.status)}${t.owner ? ` · ${esc(t.owner)}` : ''}${t.pending_owner ? ` → ${esc(t.pending_owner)}` : ''}</span></li>`).join('')}</ul>
      </details>
    </div>`;
  }).join('');
}

function renderFilters() {
  const agents = [...new Set(state.items.map((i) => i.agent).concat(state.agents.map((a) => a.agent)))].sort();
  const projects = [...new Set(state.items.map((i) => i.project).concat(state.projects.map((p) => p.name)))].sort();
  const opt = (sel, values, label, cur) => {
    const el = document.getElementById(sel);
    el.innerHTML = `<option value="">All ${label}</option>` + values.map((v) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(TYPE_LABEL[v] || v)}</option>`).join('');
  };
  opt('f-agent', agents, 'agents', filters.agent);
  opt('f-project', projects, 'projects', filters.project);
  opt('f-type', Object.keys(TYPE_LABEL), 'types', filters.type);
}

function bulletsHtml(it) {
  const b = it.bullets || [];
  if (!b.length) return '';
  if (Array.isArray(it.recommendations) && it.recommendations.length === b.length) {
    return `<ol>${b.map((x, i) => `<li>${esc(String(x).replace(/^\s*\d+[.)]\s*/, ''))}<span class="rec-n">Recommended: ${esc(it.recommendations[i])}</span></li>`).join('')}</ol>`;
  }
  const numbered = b.every((x) => /^\s*\d+[.)]\s/.test(x));
  return numbered ? `<ol>${b.map((x) => `<li>${esc(String(x).replace(/^\s*\d+[.)]\s*/, ''))}</li>`).join('')}</ol>`
    : `<ul>${b.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
}

function attachmentsHtml(it) {
  const out = [];
  for (const a of it.attachments || []) {
    if (isImage(a)) out.push(`<a class="shot" href="${fileUrl(a)}" target="_blank" rel="noopener"><img src="${fileUrl(a)}" alt="${esc(base(a))}" loading="lazy"></a>`);
    else if (isTable(a)) out.push(`<div class="color-table" data-colors="${esc(a)}">${colorTableHtml(a)}</div>`);
    else out.push(`<p class="links"><a href="${fileUrl(a)}" target="_blank" rel="noopener">${esc(base(a))}</a></p>`);
  }
  if (Array.isArray(it.colors) && it.colors.length) out.push(colorRows(it.colors));
  return out.join('');
}

function parseColors(text, p) {
  try {
    let rows;
    if (/\.json$/i.test(p)) {
      const j = JSON.parse(text);
      rows = Array.isArray(j) ? j : (j.colors || []);
    } else {
      const lines = text.trim().split(/\r?\n/);
      const head = lines[0].split(',').map((h) => h.trim().toLowerCase());
      rows = lines.slice(1).map((l) => {
        const cells = l.split(',').map((c) => c.trim());
        return Object.fromEntries(head.map((h, i) => [h, cells[i] || '']));
      });
    }
    rows = rows.filter((r) => r && /^#?[0-9a-f]{3,8}$/i.test(String(r.hex || '')));
    return rows.length ? rows : 'none';
  } catch { return 'none'; }
}

function colorRows(rows) {
  return `<table class="colors"><thead><tr><th></th><th>Name</th><th>Hex</th><th>Use</th></tr></thead><tbody>${rows.map((r) => {
    const hex = String(r.hex).startsWith('#') ? r.hex : `#${r.hex}`;
    return `<tr><td><span class="swatch" style="background:${esc(hex)}"></span></td><td>${esc(r.name || '')}</td><td class="hex">${esc(hex)}</td><td>${esc(r.usage || r.use || '')}</td></tr>`;
  }).join('')}</tbody></table>`;
}

function colorTableHtml(p) {
  const c = colorCache[p];
  if (c === undefined) {
    colorCache[p] = 'loading';
    fetch(fileUrl(p)).then((r) => r.text()).then((t) => { colorCache[p] = parseColors(t, p); render(); }).catch(() => { colorCache[p] = 'none'; });
    return '';
  }
  if (c === 'loading') return '';
  if (c === 'none') return `<p class="links"><a href="${fileUrl(p)}" target="_blank" rel="noopener">${esc(base(p))}</a></p>`;
  return colorRows(c);
}

function cardHtml(it, opts = {}) {
  const meta = [TYPE_LABEL[it.type] || it.type, it.agent, it.project, ago(it.timestamp)];
  if (it.task) meta.push(`task ${it.task}`);
  if (it.reply_to) meta.push('follow-up');
  if (it.type === 'handover' && it.to_agent) meta.splice(2, 0, `to ${it.to_agent}`);
  const parts = [`<h3>${esc(it.title)}</h3>`,
    `<p class="meta">${it.priority === 'high' ? '<span class="prio">High priority</span> · ' : ''}${meta.map(esc).join(' · ')}${it.change ? ` · scope change: ${esc(it.change)}` : ''}</p>`,
    bulletsHtml(it)];
  if (it.links && it.links.length) {
    parts.push(`<ul class="links">${it.links.map((l) => `<li><a href="${/^https?:/.test(l) ? esc(l) : fileUrl(l)}" target="_blank" rel="noopener">${esc(/^https?:/.test(l) ? l : base(l))}</a></li>`).join('')}</ul>`);
  }
  if (it.verification && it.verification.length) parts.push(`<ul class="evidence">${it.verification.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>`);
  parts.push(attachmentsHtml(it));
  if (it.recommendation && !(it.recommendations && it.recommendations.length > 1 && it.status === 'open')) {
    parts.push(`<div class="rec"><strong>Recommendation:</strong> ${esc(it.recommendation)}</div>`);
  }
  if (it.recommendations && it.recommendations.length > 1 && it.status === 'open') {
    parts.push('<div class="rec"><strong>Approve</strong> accepts every numbered recommendation above.</div>');
  }
  const open = it.needs_me && it.status === 'open';
  if (open) {
    const left = it.reversible && it.auto_proceed_at && !it.change ? until(it.auto_proceed_at) : null;
    if (it.reversible && !it.change) parts.push(`<p class="timer">${left ? `Agent proceeds with its recommendation in ${left} if you do not answer.` : 'Past 4 hours: the agent may proceed with its recommendation.'}</p>`);
    else parts.push('<p class="timer">Not reversible: the agent waits for you.</p>');
    const hasDraft = Object.prototype.hasOwnProperty.call(drafts, it.id);
    parts.push(`<div class="actions">
      <button class="btn primary" data-act="approve" data-id="${esc(it.id)}">Approve</button>
      <button class="btn" data-fb-open="${esc(it.id)}">Feedback</button>
      <button class="btn" data-act="more_info" data-id="${esc(it.id)}">More info</button>
      <button class="btn" data-act="reject" data-id="${esc(it.id)}">Not approved</button></div>`);
    if (hasDraft) {
      parts.push(`<div class="fb-row"><input type="text" data-fb-input="${esc(it.id)}" value="${esc(drafts[it.id])}" placeholder="${(it.bullets || []).length > 1 ? '1 yes, 2 no, 3 use option B' : 'Your answer'}" maxlength="1000"><button class="btn primary" data-fb-send="${esc(it.id)}">Send</button></div>
        ${(it.bullets || []).length > 1 ? '<p class="hint">Answer per number, for example: 1 yes, 2 no, 3 use option B</p>' : ''}`);
    }
  } else if (it.answer) {
    parts.push(`<p class="answer"><strong>${esc(DECISION_LABEL[it.answer.decision] || it.answer.decision)}</strong> ${ago(it.answer.at)}${it.answer.text ? `: ${esc(it.answer.text)}` : ''}</p>`);
  }
  if (opts.ack) parts.push(`<div class="actions"><button class="btn primary" data-act="acknowledge" data-id="${esc(it.id)}">${esc(opts.ack)}</button></div>`);
  if (opts.idea) {
    parts.push(`<div class="actions">${it.status === 'kept' ? '<span class="count">Kept for after the build</span>' : `<button class="btn" data-act="keep_idea" data-id="${esc(it.id)}">Keep for later</button>`}
      <button class="btn" data-act="acknowledge" data-id="${esc(it.id)}">Drop</button></div>`);
  }
  const closed = !open && !opts.ack && !opts.idea && it.status !== 'info';
  return `<article class="card${it.priority === 'high' ? ' high' : ''}${closed ? ' closed' : ''}" data-id="${esc(it.id)}">${parts.join('')}</article>`;
}

function section(id, items, emptyText, opts) {
  const el = document.getElementById(id);
  el.innerHTML = items.length ? items.map((i) => cardHtml(i, opts)).join('') : `<p class="empty">${emptyText}</p>`;
}

function render() {
  if (!state) return;
  // Do not re-render under the user's cursor while typing.
  const active = document.activeElement;
  const typing = active && active.matches && active.matches('input[type=text]');
  const focusKey = typing ? (active.dataset.fbInput ? `fb:${active.dataset.fbInput}` : `msg:${active.dataset.msgInput}`) : null;
  const caret = typing ? active.selectionStart : null;

  renderFilters();
  renderAgents();
  renderProjects();

  const items = state.items.filter(passes);
  const rank = { P1: 0, P2: 1, P3: 2 };
  const prio = (name) => ((state.projects.find((p) => p.name === name) || {}).priority || 'P2');
  const needs = items.filter((i) => i.needs_me && i.status === 'open')
    .sort((a, b) => (rank[prio(a.project)] - rank[prio(b.project)])
      || ((a.priority === 'high' ? 0 : 1) - (b.priority === 'high' ? 0 : 1))
      || a.timestamp.localeCompare(b.timestamp));
  const deliveries = items.filter((i) => i.type === 'delivery' && i.status === 'open');
  const flags = items.filter((i) => i.type === 'audit' && i.priority === 'high' && i.status === 'info');
  const ideas = items.filter((i) => i.type === 'idea' && ['parked', 'kept'].includes(i.status));
  const used = new Set([...needs, ...deliveries, ...flags, ...ideas].map((i) => i.id));
  const feed = items.filter((i) => !used.has(i.id) && i.type !== 'idea');

  const allNeeds = state.items.filter((i) => i.needs_me && i.status === 'open').length;
  const badge = document.getElementById('needs-count');
  badge.textContent = needs.length;
  badge.classList.toggle('zero', needs.length === 0);
  document.getElementById('needs-summary').innerHTML = allNeeds ? `<strong>${allNeeds} need${allNeeds === 1 ? 's' : ''} you</strong>` : 'Nothing needs you';
  document.title = allNeeds ? `(${allNeeds}) Agent Hub` : 'Agent Hub';

  section('needs', needs, 'Nothing needs you right now.');
  document.getElementById('deliveries-count').textContent = deliveries.length ? `${deliveries.length} to review` : '';
  document.getElementById('deliveries-block').hidden = !deliveries.length;
  section('deliveries', deliveries, '', { ack: 'Acknowledge' });
  document.getElementById('flags-count').textContent = flags.length ? String(flags.length) : '';
  document.getElementById('flags-block').hidden = !flags.length;
  section('flags', flags, '', { ack: 'Acknowledge' });
  section('feed', feed, 'No items match these filters.');
  document.getElementById('ideas-count').textContent = ideas.length ? String(ideas.length) : '0';
  const building = state.projects.filter((p) => p.phase !== 'complete').map((p) => p.name);
  document.getElementById('ideas-note').textContent = building.length
    ? `New ideas and unplanned features are parked here until the build is complete (${building.join(', ')} still building). Nothing here gets built without you.`
    : 'Builds are complete. Review these ideas and turn the ones you want into a new plan.';
  section('ideas', ideas, 'No parked ideas.', { idea: true });

  if (focusKey) {
    const [kind, key] = [focusKey.slice(0, focusKey.indexOf(':')), focusKey.slice(focusKey.indexOf(':') + 1)];
    const el = document.querySelector(kind === 'fb' ? `[data-fb-input="${CSS.escape(key)}"]` : `[data-msg-input="${CSS.escape(key)}"]`);
    if (el) { el.focus(); if (caret != null) el.setSelectionRange(caret, caret); }
  }
}

// ---------- events ----------

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.act) { act(t.dataset.id, t.dataset.act); return; }
  if (t.dataset.fbOpen) {
    const id = t.dataset.fbOpen;
    if (Object.prototype.hasOwnProperty.call(drafts, id)) delete drafts[id]; else drafts[id] = '';
    render();
    const input = document.querySelector(`[data-fb-input="${CSS.escape(id)}"]`);
    if (input) input.focus();
    return;
  }
  if (t.dataset.fbSend) {
    const id = t.dataset.fbSend;
    const text = (drafts[id] || '').trim();
    if (!text) { const i = document.querySelector(`[data-fb-input="${CSS.escape(id)}"]`); if (i) i.focus(); return; }
    act(id, 'feedback', text);
    return;
  }
  if (t.dataset.filterAgent) {
    filters.agent = filters.agent === t.dataset.filterAgent ? '' : t.dataset.filterAgent;
    saveFilters(); render(); return;
  }
  if (t.dataset.msgOpen) {
    msgDrafts[t.dataset.msgOpen] = '';
    render();
    const i = document.querySelector(`[data-msg-input="${CSS.escape(t.dataset.msgOpen)}"]`);
    if (i) i.focus();
    return;
  }
  if (t.dataset.msgSend) {
    const agent = t.dataset.msgSend;
    const text = (msgDrafts[agent] || '').trim();
    if (!text) return;
    t.disabled = true;
    try { await post('/api/message', { agent, text }); delete msgDrafts[agent]; }
    catch (err) { alert(`Could not send: ${err.message}`); }
    load();
    return;
  }
  if (t.id === 'f-clear') { filters.agent = filters.project = filters.type = ''; saveFilters(); render(); }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.fbInput) drafts[t.dataset.fbInput] = t.value;
  if (t.dataset.msgInput) msgDrafts[t.dataset.msgInput] = t.value;
});

document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (e.key === 'Escape' && t.dataset.fbInput) { delete drafts[t.dataset.fbInput]; t.blur(); render(); return; }
  if (e.key === 'Escape' && t.dataset.msgInput) { delete msgDrafts[t.dataset.msgInput]; t.blur(); render(); return; }
  if (e.key !== 'Enter') return;
  if (t.dataset.fbInput) { e.preventDefault(); document.querySelector(`[data-fb-send="${CSS.escape(t.dataset.fbInput)}"]`).click(); }
  if (t.dataset.msgInput) { e.preventDefault(); document.querySelector(`[data-msg-send="${CSS.escape(t.dataset.msgInput)}"]`).click(); }
});

document.getElementById('bc-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const st = document.getElementById('bc-status');
  const text = document.getElementById('bc-text').value.trim();
  if (!text) return;
  st.hidden = false;
  try {
    const r = await post('/api/broadcast', { text });
    st.textContent = `Sent to ${r.leads.length} lead${r.leads.length === 1 ? '' : 's'}: ${r.leads.join(', ')}.`;
    document.getElementById('bc-text').value = '';
  } catch (x) { st.textContent = x.message; }
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (!t.dataset || !t.dataset.prio) return;
  try { await post('/api/priority', { project: t.dataset.prio, priority: t.value }); load(); } catch (x) { alert(`Could not save: ${x.message}`); }
});

document.getElementById('filters').addEventListener('change', (e) => {
  const key = { 'f-agent': 'agent', 'f-project': 'project', 'f-type': 'type' }[e.target.id];
  if (key) { filters[key] = e.target.value; saveFilters(); render(); }
});

// ---------- add project ----------

document.getElementById('add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const err = document.getElementById('add-error');
  err.hidden = true;
  const btn = f.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    const r = await post('/api/connect', { folder: f.folder.value.trim(), project: f.project.value.trim(), agents: f.agents.value, brief: f.brief.value });
    const out = document.getElementById('add-result');
    const copy = (text) => `<div class="cmd"><code>${esc(text)}</code><button type="button" class="btn" data-copy="${esc(text)}">Copy</button></div>`;
    out.innerHTML = `<h3>${esc(r.project)} is connected</h3>
      <p class="note">Start each agent in its own Terminal window, then paste the start line into it. The agents report here; you do not need their windows again.</p>
      <ol class="steps">${r.startCommands.map((c) => `<li>${esc(c.agent)} (${esc(c.role)}): open a Terminal window and run${copy(c.terminal)}then type${copy(r.firstPrompt)}</li>`).join('')}</ol>
      <p class="note">${f.brief.value.trim() ? 'The lead reads BRIEF.md, writes the plan and posts it here for your approval.' : 'Add a BRIEF.md to the folder; the lead plans from it.'}</p>`;
    out.hidden = false;
    f.hidden = true;
    load();
  } catch (x) {
    err.textContent = x.message;
    err.hidden = false;
  }
  btn.disabled = false;
});

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; }
  catch { b.previousElementSibling && window.getSelection().selectAllChildren(b.previousElementSibling); b.textContent = 'Select and copy'; }
  setTimeout(() => { b.textContent = 'Copy'; }, 1500);
});

load();
setInterval(load, REFRESH_MS);
