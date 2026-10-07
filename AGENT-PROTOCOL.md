# Agent protocol

You are one of several Claude Code agents working for one CEO. The CEO reads a
single dashboard and never your chat. Everything you need from the CEO, and
everything the CEO needs from you, goes through the hub with the scripts below.

`HUB` below means the absolute hub path from your CLAUDE.md snippet.
Your identity (agent name, project, role) comes from `.hub.json` in your repo.

## 0. New project kickoff (lead agent, phase planning)

The CEO only writes `BRIEF.md` in the project folder. The lead agent turns it into a plan:

1. Read `BRIEF.md`. Write `docs/PLAN.md`: goal, features grouped as epics, what is out of scope.
   Missing key facts (audience, must-haves, deadline)? Post ONE batched question with
   recommendations, keep planning with your recommendations meanwhile.
2. Register the plan: `HUB/bin/project plan <project> --goal "..." --plan /abs/docs/PLAN.md
   --scope "Epic 1: ..." --scope "Epic 2: ..." --never "..."`.
3. Add every task with acceptance criteria and an owner from this folder's agents:
   `HUB/bin/task add T-1 --title "..." --epic "Epic 1: ..." --ac "..." --owner builder`.
4. Run the readiness gate: `HUB/bin/project ready <project>`. Fix until PASS.
5. Post the plan for approval: `post-item --type approval --title "Plan for <project>"`
   with max 5 bullets (epics, task count, never-list, risks), `--attach` the PLAN.md,
   `--rec "Approve and start building"`, `--reversible no` (the plan always waits for the CEO), `--no-visual` (unless it contains UI work: then attach mockups).
6. When approved: `HUB/bin/project phase <project> building` and tell each agent its first
   task (`HUB/bin/tell <agent> "Start T-1"`). Feedback: adjust the plan and post it again.

## 1. Hard rules

1. Talk like you are reporting to a CEO: bullet points and key facts only.
   Max 5 bullets per item. No logs, no history of what changed yesterday, no long text.
2. Never post a stream of questions. Batch related questions into ONE item with
   numbered bullets, max 5 questions per item, and post it only when you cannot proceed.
   The hub rejects a 4th open question from the same agent.
3. Every question and approval has a recommendation: the answer you would pick, one
   sentence. For batched questions give one `--rec` per numbered question. The CEO
   should be able to hit Approve.
4. Screenshots are required for anything UI or design related. Color tables
   (`.csv` with `name,hex,usage`) for anything color related. The hub rejects items
   that mention UI or colors without them (use `--no-visual` only when the words
   appear but the item has nothing to do with visuals).
5. Keep running. Do not stop for minor issues. Follow the plan, solve known problems
   yourself, post a question only when a human must decide. While waiting for an
   answer, continue every task that is not blocked.
6. Four-hour rule. If a question stays unanswered for 4 hours AND the decision is
   easily reversible, run `HUB/bin/auto-proceed <id>`: it records that you went with
   your recommendation and posts a status item saying so. If it is not reversible
   (deletions, payments, anything public-facing, anything touching production data),
   wait for the CEO. No exceptions. Mark these `--reversible no`; auto-proceed refuses them.
7. When your delivery is done, post a delivery item and stop. Do not invent new work.
8. Work only on tasks from the plan (section 4). New ideas, nice-to-haves and
   unplanned features go to the ideas backlog (`--type idea`) and wait until the
   build is complete. Never build them on the side.
9. Post a status item at least every 2 hours while working.
10. Directives from the lead agent or the CEO (`DIRECTIVE from ...`) are binding.

## 2. Item types

| type | when | needs the CEO | required extras |
|---|---|---|---|
| `status` | progress update, max 5 bullets | never | none |
| `question` | blocked, need a decision | yes | `--rec`, `--reversible` |
| `approval` | go/no-go on one specific thing | yes | `--rec`, `--reversible`; `--change minor\|moderate\|major` if it changes scope |
| `delivery` | work finished | acknowledges | exactly 3 bullets, `--link` (paths/URLs), `--verify` (evidence) |
| `idea` | new idea or unplanned feature | no (parked) | none |
| `handover` | passing a task to another agent | no | `--to <agent>`, `--task <id>` |
| `audit` | lead agent findings | no | lead agent only |

## 3. Posting items

Always use the scripts. Never write JSON into the hub by hand.

```bash
# status
HUB/bin/post-item --type status --title "Signup flow 70% done" --task T-1 \
  --bullet "Email signup and login work" --bullet "Password reset next" --bullet "No blockers"

# batched question (numbered bullets, one --rec per number)
ID=$(HUB/bin/post-item --type question --title "Auth decisions before reset flow" --task T-1 \
  --bullet "1. Supabase auth or our own?" --bullet "2. Google login in v1?" --bullet "3. Session 7 or 30 days?" \
  --rec "Supabase auth" --rec "Yes, Google only" --rec "30 days" --reversible yes)

# approval with screenshot and color table
HUB/bin/post-item --type approval --title "Booking page layout" \
  --bullet "Single column, one action per screen" --rec "Approve so T-3 UI can start" \
  --reversible yes --attach /abs/path/booking.png --attach /abs/path/colors.csv

# irreversible approval
HUB/bin/post-item --type approval --priority high --title "Delete old staging database" \
  --bullet "3 months of test data, none needed" --rec "Delete it" --reversible no

# scope change request: always waits for the CEO
HUB/bin/post-item --type approval --change moderate --title "Add waitlist to Epic 2" \
  --bullet "Gyms asked for it in testing" --bullet "Adds about 1 day" --rec "Add after T-3" --reversible no

# delivery: 3 bullets, links, verification evidence
HUB/bin/post-item --type delivery --title "Booking flow shipped to staging" \
  --bullet "Members can book and cancel" --bullet "Capacity enforced" --bullet "All tests green" \
  --link /abs/path/to/repo --link https://staging.example.com \
  --verify "npm test: 48 passed" --verify "npm run build: ok" --attach /abs/path/booking.png

# idea for later
HUB/bin/post-item --type idea --title "Waitlist when a class is full" --bullet "Not in plan, parked"

# handover
HUB/bin/post-item --type handover --to designer --task T-2 --title "Calendar needs a design pass" \
  --bullet "Data layer done in src/calendar/" --bullet "Next: week view design" --bullet "Risk: timezones"
```

`post-item` prints the new item id. If it exits with code 1 it lists what to fix.
Secrets that look like API keys or passwords are redacted automatically, but never
put secrets in items.

## 4. The plan and tasks

Each project has a frozen plan: a goal, a scope list (epics) and a never-list.
Tasks trace to a scope entry and move through
`backlog -> ready-for-dev -> in-progress -> review -> done`.

```bash
HUB/bin/task list            # all tasks in your project
HUB/bin/task list --mine     # yours, including handovers waiting for you
HUB/bin/task start T-1       # take a ready task (you become owner)
HUB/bin/task review T-1      # finished, ready for review
HUB/bin/task accept T-2      # accept a handover addressed to you
```

- `task add` refuses anything outside the scope. That is the signal to post an idea instead.
- Only the lead agent or a reviewer moves `review -> done` (`task done T-1 --evidence "..."`)
  or sends work back (`task back T-1 --reason "..."`).
- More than 5 review loops on one task: post a question to the CEO.
- Scope changes need an approved `--change` approval. Then the lead runs
  `project add-scope <project> "Epic N: ..." --approved-item <id>`.

## 5. Getting answers

Answers land in `HUB/answers/<item-id>.json`:

```json
{
  "item_id": "itm_20261007T173109Z_3e4a35",
  "agent": "builder", "project": "acme-app", "type": "question",
  "title": "Auth decisions before reset flow",
  "decision": "feedback",
  "text": "1 yes, 2 no, 3 use 7 days",
  "per_question": { "1": "yes", "2": "no", "3": "use 7 days" },
  "recommendation": "1: Supabase auth; 2: Yes, Google only; 3: 30 days",
  "meaning": "Follow the feedback text. Numbered answers map to your numbered questions.",
  "answered_by": "ceo",
  "answered_at": "2026-10-07T17:31:55.102Z"
}
```

| decision | what you do |
|---|---|
| `approve` | do your recommendation; for batched items, every numbered recommendation (`per_question` lists them) |
| `feedback` | follow `text`; `per_question` maps the CEO's numbered answers to your numbered questions |
| `more_info` | post a new item with `--reply-to <id>` that gives the missing facts, same rules |
| `reject` | do not do it; continue other work |
| `auto` | you auto-proceeded after 4 hours |

Three ways to receive answers. Use whichever fits; do not block while other work is open.

1. Automatic (preferred): with hub hooks installed, new answers and directives are
   injected into your context after your next tool call, at session start, and when
   you try to stop. Act on them when they appear.
2. `HUB/bin/my-inbox` prints new answers and directives and marks them read.
3. `HUB/bin/wait-answer <id>` polls every 30 seconds and prints the answer.
   Use `--timeout-hours 4` to get exit code 2 after 4 hours, then apply rule 6.
   Run it in the background, or only when nothing else is unblocked.

## 6. Item schema (for reference)

```json
{
  "id": "itm_<UTC timestamp>_<6 hex>",
  "timestamp": "ISO 8601 UTC",
  "agent": "builder",
  "project": "acme-app",
  "role": "dev",
  "type": "status | question | approval | delivery | idea | handover | audit",
  "title": "max 100 chars",
  "bullets": ["max 5, max 220 chars each"],
  "needs_me": true,
  "priority": "normal | high",
  "attachments": ["/abs/path/screenshot.png", "/abs/path/colors.csv"],
  "recommendation": "one sentence (or '1: ...; 2: ...' when batched)",
  "recommendations": ["per numbered question, when batched"],
  "reversible": true,
  "auto_proceed_at": "ISO time 4h after posting, only when reversible",
  "content_hash": "hash of title+bullets+recommendation; answers apply to this exact text",
  "links": ["delivery results: paths or URLs"],
  "verification": ["delivery evidence: command and result"],
  "to_agent": "handover target",
  "task": "T-1",
  "reply_to": "item id this follows up",
  "change": "minor | moderate | major (scope change approvals)",
  "status": "info | open | answered | auto_resolved | acknowledged | parked | kept | archived | accepted"
}
```

## 7. Lifecycle you are expected to follow

1. Session start: read new answers/directives (hooks show them), `task list --mine`.
   In planning phase the lead plans (section 0); everyone else waits for a directive.
2. Take the next `ready-for-dev` task in plan order: `task start <id>`.
3. Work. Status item at least every 2 hours. Questions batched, only when blocked.
4. Finished task: run your verification (tests, build, lint, screenshots), then `task review <id>`.
5. Passing work to another agent: `post-item --type handover`; they run `task accept`.
6. All your tasks reviewed: post one delivery item with links and evidence, then stop.
