// Sample data for the demo hub: three projects, nine agents, cards that need you.
const now = Date.now(); const iso = (m) => new Date(now - m * 60000).toISOString();
const IMG = (f) => ({ url: (window.DEMO_IMG && window.DEMO_IMG[f]) || 'img/' + f, name: f, kind: 'image' });
const DATA = {
  projects: [
    { id: 'gym-app', name: 'gym-app', goal: 'Class booking app for small gyms', phase: 'building', priority: 'P1', auto_release: true, scope: ['Epic 1: Accounts', 'Epic 2: Booking', 'Epic 3: Payments'], never: ['No mobile app in v1'], lead: 'lead-gym-app' },
    { id: 'client-portal', name: 'client-portal', goal: 'Self-service portal for agency clients', phase: 'building', priority: 'P2', auto_release: false, scope: ['Epic 1: Dashboard', 'Epic 2: Invoices'], never: [], lead: 'lead-client-portal' },
    { id: 'landing-v2', name: 'landing-v2', goal: 'New landing page with pricing', phase: 'planning', priority: 'P3', scope: [], never: [], lead: 'lead-landing-v2' },
  ],
  tasks: [
    ['T-1', 'Signup and login', 'done', 'builder-gym-app', { code: 'pass', security: 'pass' }],
    ['T-2', 'Class calendar', 'done', 'builder-2-gym-app', { code: 'pass', qa: 'pass' }],
    ['T-3', 'Book a class', 'done', 'builder-gym-app', { code: 'pass', security: 'pass', qa: 'pass' }],
    ['T-4', 'Cancel a booking', 'review', 'builder-2-gym-app', { code: 'pass' }],
    ['T-5', 'Owner adds classes', 'in-progress', 'builder-gym-app', {}],
    ['T-6', 'Reminder emails', 'in-progress', 'builder-2-gym-app', {}],
    ['T-7', 'Checkout', 'ready-for-dev', 'builder-gym-app', {}],
    ['T-8', 'Membership plans', 'ready-for-dev', 'builder-gym-app', {}],
  ].map(([id, title, status, owner, c], i) => ({ id, project: 'gym-app', title, status, owner, epic: 'Epic 2: Booking', updated_at: iso(60 * (8 - i)),
      checks_required: ['code', 'security', 'qa'].filter((k) => k === 'code' || c[k] || status !== 'done'),
      checks: Object.fromEntries(Object.entries(c).map(([k, r]) => [k, { result: r }])) }))
    .concat([{ id: 'client-portal--T-1', project: 'client-portal', title: 'Dashboard layout', status: 'review', owner: 'designer-client-portal', checks_required: ['code'], checks: {} },
             { id: 'client-portal--T-2', project: 'client-portal', title: 'Invoice list', status: 'in-progress', owner: 'builder-client-portal', checks_required: ['code', 'security'], checks: {} }]),
  agents: [
    ['lead-gym-app', 'gym-app', 'lead', 4, 'Audit: all agents on plan'], ['builder-gym-app', 'gym-app', 'builder', 2, 'T-5 owner can add classes, tests green'],
    ['builder-2-gym-app', 'gym-app', 'builder', 140, 'T-6 reminder emails 60%'], ['reviewer-gym-app', 'gym-app', 'reviewer', 12, 'T-4 code check passed'],
    ['security-gym-app', 'gym-app', 'security', 9, 'T-3 security check passed'], ['usertest-gym-app', 'gym-app', 'usertest', 6, 'User test: Maria on booking'],
    ['lead-client-portal', 'client-portal', 'lead', 15, 'Plan approved, 2 tasks running'], ['designer-client-portal', 'client-portal', 'designer', 7, ''],
    ['builder-client-portal', 'client-portal', 'builder', 3, 'Invoice list API done'],
  ].map(([agent, project, role, m, st]) => ({ id: agent, agent, project, role, last_seen: iso(m), last_status_title: st, current_task: '' })),
  personas: [
    { id: 'gym-app--maria', project: 'gym-app', name: 'Maria', age: 68, it_skill: 'basic', device: 'phone', needs: 'poor eyesight' },
    { id: 'gym-app--tom', project: 'gym-app', name: 'Tom', age: 35, it_skill: 'expert', device: 'desktop', needs: 'impatient' },
    { id: 'gym-app--aisha', project: 'gym-app', name: 'Aisha', age: 24, it_skill: 'average', device: 'phone', needs: 'English is her second language' },
  ],
  answers: [],
  items: [
    { id: 'i1', timestamp: iso(22), agent: 'lead-gym-app', project: 'gym-app', type: 'question', title: 'Payments before we build checkout', priority: 'high', status: 'open', needs_me: true, reversible: false,
      bullets: ['1. Stripe or Mollie for card payments?', '2. Start with monthly plans only, or monthly and yearly?', '3. Free trial: 7 or 14 days?'],
      recommendation: '1: Stripe; 2: Monthly only; 3: 14 days', recommendations: ['Stripe: best docs, works in all your markets', 'Monthly only, add yearly after launch', '14 days: matches the gyms you interviewed'] },
    { id: 'i2', timestamp: iso(48), agent: 'designer-client-portal', project: 'client-portal', type: 'approval', title: 'Client dashboard layout and colors', priority: 'normal', status: 'open', needs_me: true, reversible: true,
      auto_proceed_at: new Date(now + 3.2 * 3600e3).toISOString(), bullets: ['Three counters on top: projects, invoices due, messages', 'Orange only for money actions (Pay invoice)', 'Left menu, five items, no submenus'],
      recommendation: 'Approve so the invoice list can be built on this layout', attachments: [IMG('portal-design.png')],
      colors: [{ name: 'Navy', hex: '#1f3a5f', usage: 'Menu, headings' }, { name: 'Signal', hex: '#e4572e', usage: 'Money actions only' }, { name: 'Mist', hex: '#f6f7fb', usage: 'Background' }] },
    { id: 'i3', timestamp: iso(35), agent: 'lead-gym-app', project: 'gym-app', type: 'approval', title: 'Code audit: 4 fixes', priority: 'high', status: 'open', needs_me: true, reversible: true,
      auto_proceed_at: new Date(now + 3.4 * 3600e3).toISOString(),
      bullets: ['Booking API checks the member owns the booking before cancelling (security, high)', 'Two duplicate date helpers merged, 140 lines removed (cleanup)', 'Calendar loads 14 days in one query instead of 14 (reviewer)', 'Unused chart library removed, page 180 KB lighter (cleanup)'],
      recommendation: 'Approve the 4 fixes; 9 smaller findings are parked as ideas' },
    { id: 'i4', timestamp: iso(70), agent: 'lead-gym-app', project: 'gym-app', type: 'delivery', title: 'Booking flow released to staging', priority: 'normal', status: 'open', needs_me: false,
      bullets: ['Members book and cancel classes', 'Class capacity enforced, no double bookings', 'Code, security and QA checks passed'],
      links: ['https://staging.gym-app.example'], verification: ['npm test: 84 passed', 'e2e: 12 journeys passed on phone and desktop', 'security sweep: 0 critical, 0 high'] },
    { id: 'i5', timestamp: iso(18), agent: 'usertest-gym-app', project: 'gym-app', type: 'status', title: 'User test: Maria (68, phone, 200% zoom) on booking a class', priority: 'normal', status: 'info', needs_me: false,
      bullets: ['Booked a class in 6 taps; found the Book button easily', 'Bug: time picker too small to tap at 200% zoom', 'Confusing: "Waitlist" shown although the class has spots', 'Fix task T-9 created by the lead'], attachments: [IMG('maria-booking-200.png')] },
    { id: 'i6', timestamp: iso(40), agent: 'lead-gym-app', project: 'gym-app', type: 'audit', title: 'builder-2 stalled on T-6 for 2 hours', priority: 'high', status: 'info', needs_me: false,
      bullets: ['Email provider API key missing in staging', 'Sent builder-2 to T-8 meanwhile', 'Needs: add the key, or approve switching provider'] },
    { id: 'i7', timestamp: iso(5), agent: 'builder-gym-app', project: 'gym-app', type: 'status', title: 'T-5 owner can add classes, tests green', priority: 'normal', status: 'info', needs_me: false, bullets: ['Form, validation and list done', '18 new tests, all green', 'Moved to review'] },
    { id: 'i8', timestamp: iso(14), agent: 'lead-client-portal', project: 'client-portal', type: 'status', title: 'Plan approved, 2 tasks running', priority: 'normal', status: 'info', needs_me: false, bullets: ['Designer on layout, builder on invoice API', 'Next: invoice list after layout approval'] },
    { id: 'i9', timestamp: iso(90), agent: 'builder-gym-app', project: 'gym-app', type: 'idea', title: 'Waitlist that fills free spots automatically', priority: 'normal', status: 'parked', needs_me: false, bullets: ['Members join a waitlist for full classes', 'Not in plan: parked until the build is done'] },
    { id: 'i10', timestamp: iso(120), agent: 'usertest-gym-app', project: 'gym-app', type: 'idea', title: 'Add to Apple and Google Wallet', priority: 'normal', status: 'parked', needs_me: false, bullets: ['Tom expected a wallet pass after booking'] },
  ],
};

// Sessions and a budget, so cost per project shows in the demo.
const SESS = { 'lead-gym-app': 'session_demo_lead', 'builder-gym-app': 'session_demo_b1', 'builder-2-gym-app': 'session_demo_b2', 'reviewer-gym-app': 'session_demo_rev' };
DATA.agents.forEach((a) => { if (SESS[a.agent]) { a.session_id = SESS[a.agent]; } });
DATA.projects.forEach((p) => { if (p.name === 'gym-app') p.budget_usd = 75; });
DATA.config = [{ id: 'alerts', level: 'important' }];
window.HUB_DEMO.load(DATA);
