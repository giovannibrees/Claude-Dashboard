// Connect a project folder to the hub: identity file, hooks, permissions, CLAUDE.md snippet.
// Used by `hub connect` and the dashboard's "Add project" form.
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const hub = require('./hub');

const HOOK_EVENTS = {
  SessionStart: { timeout: 10 }, PostToolUse: { matcher: '*', timeout: 10 }, PostToolUseFailure: { matcher: '*', timeout: 10 },
  Stop: { timeout: 15 }, PreCompact: { timeout: 10 }, SessionEnd: { timeout: 5 },
};
const SCRIPTS = ['post-item', 'wait-answer', 'my-inbox', 'task', 'auto-proceed', 'tell', 'audit', 'project', 'hub'];

function snippet(agents, project) {
  const tpl = fs.readFileSync(path.join(hub.HUB, 'templates', 'agent-snippet.md'), 'utf8');
  const list = agents.map((a) => `\`${a.name}\` (${a.role})`).join(', ');
  return tpl.replace(/{{PROJECT}}/g, project).replace(/{{AGENTS}}/g, list)
    .replace(/{{DEFAULT_AGENT}}/g, agents[0].name).replace(/{{HUB}}/g, hub.HUB);
}

function installHooks(folder) {
  const sp = path.join(folder, '.claude', 'settings.json');
  const settings = hub.readJson(sp, {});
  settings.hooks = settings.hooks || {};
  const hookPath = path.join(hub.HUB, 'bin', 'hook');
  const cmd = `node "${hookPath}"`;
  for (const [ev, opt] of Object.entries(HOOK_EVENTS)) {
    const list = (settings.hooks[ev] || []).filter((g) => !(g.hooks || []).some((h) => String(h.command).includes(hookPath)));
    const group = { hooks: [{ type: 'command', command: cmd, timeout: opt.timeout }] };
    if (opt.matcher) group.matcher = opt.matcher;
    list.push(group);
    settings.hooks[ev] = list;
  }
  settings.permissions = settings.permissions || {};
  const allow = new Set(settings.permissions.allow || []);
  for (const s of SCRIPTS) allow.add(`Bash(${path.join(hub.HUB, 'bin', s)}:*)`);
  allow.add(`Read(${hub.HUB}/**)`);
  settings.permissions.allow = [...allow];
  // Lets agents read the protocol and attachments in the hub folder without prompts.
  const dirs = new Set(settings.permissions.additionalDirectories || []);
  dirs.add(hub.HUB);
  settings.permissions.additionalDirectories = [...dirs];
  hub.writeJson(sp, settings);
  return sp;
}

// agents: [{name, role}] ; the first one is the folder's default identity.
// Additional agents in the same folder start with: HUB_AGENT=<name> claude
function connect({ folder, project, agents, brief, keepAlive = true, hooks = true, claudeMd = true, createFolder = false }) {
  if (!folder || !path.isAbsolute(folder)) throw new Error('folder must be an absolute path');
  if (!project) throw new Error('project name is required');
  if (!agents || !agents.length) throw new Error('at least one agent is required');
  for (const a of agents) {
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/i.test(a.name)) throw new Error(`agent name "${a.name}": use letters, digits and dashes`);
    a.role = a.role || hub.roleOf(a.name);
  }
  if (!fs.existsSync(folder)) {
    if (!createFolder) throw new Error(`folder not found: ${folder}`);
    fs.mkdirSync(folder, { recursive: true });
  }
  if (!fs.existsSync(path.join(folder, '.git'))) spawnSync('git', ['init', '-q'], { cwd: folder });
  hub.ensureDirs();
  const done = [];

  hub.writeJson(path.join(folder, '.hub.json'), {
    agent: agents[0].name, project, role: agents[0].role, hub: hub.HUB, keep_alive: keepAlive,
    agents: Object.fromEntries(agents.map((a) => [a.name, a.role])),
  });
  done.push(`wrote ${path.join(folder, '.hub.json')}`);

  if (brief && brief.trim()) {
    const bp = path.join(folder, 'BRIEF.md');
    fs.writeFileSync(bp, brief.trim() + '\n');
    done.push(`wrote ${bp}`);
  }

  // Project shell in planning phase; the lead agent fills in plan, scope and tasks.
  if (!hub.readProject(project)) {
    const firstLine = (brief || '').trim().split('\n')[0].replace(/^#+\s*/, '').slice(0, 140);
    hub.writeJson(path.join(hub.projectDir(project), 'project.json'), {
      name: project, goal: firstLine, plan: '', repo: folder, scope: [], never: [],
      lead: (agents.find((a) => a.role === 'lead') || {}).name || '', phase: 'planning', created_at: hub.nowIso(),
    });
    fs.mkdirSync(path.join(hub.projectDir(project), 'tasks'), { recursive: true });
    hub.log('project_created', { project });
    done.push(`registered project ${project} (planning)`);
  }

  for (const a of agents) {
    hub.touchAgent(a.name, { project, role: a.role, repo: folder, state: 'registered' });
    hub.log('agent_registered', { agent: a.name, project, role: a.role, repo: folder });
  }

  if (hooks) done.push(`hooks installed in ${installHooks(folder)}`);

  const text = snippet(agents, project);
  if (claudeMd) {
    const cm = path.join(folder, 'CLAUDE.md');
    let cur = fs.existsSync(cm) ? fs.readFileSync(cm, 'utf8') : '';
    // Replace an earlier hub section instead of appending a second one.
    cur = cur.replace(/\n*## Agent hub[\s\S]*?(?=\n## (?!Agent hub)|$)/, '');
    fs.writeFileSync(cm, `${cur.trimEnd()}${cur.trim() ? '\n\n' : ''}${text}`);
    done.push(`updated ${cm}`);
  }

  const startCommands = agents.map((a, i) => ({
    agent: a.name, role: a.role,
    terminal: i === 0 ? `cd "${folder}" && claude` : `cd "${folder}" && HUB_AGENT=${a.name} claude`,
  }));
  return { folder, project, done, snippet: text, startCommands, firstPrompt: START_PROMPT };
}

const START_PROMPT = '/loop Follow the Agent hub section in CLAUDE.md';

module.exports = { connect, installHooks, snippet, START_PROMPT };
