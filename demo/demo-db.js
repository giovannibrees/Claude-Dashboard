// In-memory stand-in for the hub's database and Claude Code connector, used only by the demo
// page. Same calls the hub page makes (doc, collection, where, orderBy, limit, get, set, update,
// delete, add, onSnapshot); nothing leaves the browser and a reload starts fresh.
(function () {
  const store = {}; // collection path -> Map(id -> data)
  const listeners = [];
  const col = (path) => (store[path] = store[path] || new Map());
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const snapDoc = (id, data) => ({ id, exists: data !== undefined, data: () => (data === undefined ? undefined : clone(data)), metadata: { fromCache: false, hasPendingWrites: false } });
  const err = (code, message) => Object.assign(new Error(message), { code });

  function split(path) {
    const parts = path.split('/');
    return { col: parts.slice(0, -1).join('/'), id: parts[parts.length - 1] };
  }

  function notify() { listeners.forEach((l) => setTimeout(() => l.fire(), 0)); }

  function query(path, filters, order, max) {
    const q = {
      where: (f, op, v) => query(path, filters.concat([[f, op, v]]), order, max),
      orderBy: (f, dir) => query(path, filters, [f, dir || 'asc'], max),
      limit: (n) => query(path, filters, order, n),
      run() {
        let rows = [...col(path).entries()].filter(([, d]) => filters.every(([f, op, v]) => {
          const x = d[f];
          if (op === '==') return x === v;
          if (op === '!=') return x !== v;
          if (op === 'in') return Array.isArray(v) && v.includes(x);
          if (op === 'not-in') return Array.isArray(v) && !v.includes(x);
          if (op === 'array-contains') return Array.isArray(x) && x.includes(v);
          if (op === '<') return x < v; if (op === '<=') return x <= v;
          if (op === '>') return x > v; if (op === '>=') return x >= v;
          return false;
        }));
        if (order) {
          const [f, dir] = order;
          rows.sort((a, b) => (a[1][f] === undefined) - (b[1][f] === undefined) || (a[1][f] < b[1][f] ? -1 : a[1][f] > b[1][f] ? 1 : 0) * (dir === 'desc' ? -1 : 1));
        } else rows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
        if (max) rows = rows.slice(0, max);
        const docs = rows.map(([id, d]) => snapDoc(id, d));
        return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
      },
      get: async () => q.run(),
      onSnapshot(next) {
        const l = { fire: () => next(q.run()) };
        listeners.push(l); setTimeout(l.fire, 0);
        return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
      },
    };
    return q;
  }

  function docRef(path) {
    const { col: c, id } = split(path);
    return {
      id, path,
      get: async () => snapDoc(id, col(c).get(id)),
      set: async (data) => { col(c).set(id, clone(data)); notify(); },
      update: async (data) => {
        const cur = col(c).get(id);
        if (!cur) throw err('invalid_argument', 'document does not exist');
        col(c).set(id, Object.assign(cur, clone(data))); notify();
      },
      delete: async () => { col(c).delete(id); notify(); },
      onSnapshot(next) {
        const l = { fire: () => next(snapDoc(id, col(c).get(id))) };
        listeners.push(l); setTimeout(l.fire, 0);
        return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
      },
      collection: (sub) => collectionRef(`${path}/${sub}`),
    };
  }

  function collectionRef(path) {
    const q = query(path, [], null, 0);
    return Object.assign(q, {
      path,
      doc: (id) => docRef(`${path}/${id || Math.random().toString(36).slice(2, 12)}`),
      add: async (data) => { const r = docRef(`${path}/${Math.random().toString(36).slice(2, 12)}`); await r.set(data); return r; },
    });
  }

  const db = { doc: docRef, collection: collectionRef };

  // A pretend Claude Code connector, so "Start in the cloud" and costs can be tried in the demo.
  let n = 0;
  const mcp = {
    listTools: async () => ({ servers: [{ server: 'Claude Code Remote', tools: [{ name: 'list_environments' }, { name: 'create_session' }, { name: 'get_session' }] }] }),
    callTool: async (server, tool, input) => {
      await new Promise((r) => setTimeout(r, 500));
      if (tool === 'list_environments') return { payload: { environments: [{ environment_id: 'env_demo', name: 'Default', state: 'active' }] } };
      if (tool === 'create_session') return { payload: { ccr: { id: `session_demo${++n}` } } };
      if (tool === 'get_session') {
        const costs = { session_demo_lead: 18.4, session_demo_b1: 22.75, session_demo_b2: 9.1, session_demo_rev: 4.2 };
        return { payload: { ccr: { id: input.session_id, external_metadata: { usage: { cost_usd: costs[input.session_id] || 0.4 } } } } };
      }
      throw err('tool_error', 'not available in the demo');
    },
  };
  const permissions = { state: async () => 'granted', request: async () => ({}), manage: async () => {} };

  window.HUB_DEMO = {
    use: async (name) => (name === 'db' ? db : name === 'mcp' ? mcp : name === 'permissions' ? permissions : null),
    load(data) {
      for (const [c, rows] of Object.entries(data)) for (const r of rows) col(c).set(r.id, clone(r));
    },
  };
})();
