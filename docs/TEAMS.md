# Agent teams

How to pick the agents for a project, how the lead splits the work between them, and how every
task gets checked before it counts as done. The role cards the agents follow are in
[ROLES.md](../ROLES.md).

## Pick a team

| Team | Agents | Use it for |
|---|---|---|
| Solo | lead, builder | Small fixes, landing pages, internal scripts. The lead reviews. |
| Standard | lead, builder, reviewer, security | Most apps. |
| Product | lead, designer, builder, builder-2, reviewer, qa | Apps with many screens. |
| Secure | lead, architect, builder, builder-2, reviewer, security, qa | Payments, personal data, anything going to real users or production. |

The **Add project** form has these presets. You can also type your own list; the agent name sets
the role: names starting with `lead`, `architect`, `design`, `review`, `security`, `qa` or `docs`
get that role, everything else is a builder (`builder`, `builder-2`, `api`, `frontend`).

Rules of thumb:
- Start small. Add a role when its absence shows: bugs slipping through (add reviewer),
  anything with logins or money (add security), many screens (add designer and qa).
- Seven agents per project at most. More agents means more coordination and more cost,
  not more speed.
- Two builders pay off only when the work splits into areas that do not touch the same files,
  for example backend and frontend.

## How the lead splits the work

1. **One task, one goal.** A task delivers one thing a user can see or use, end to end
   (database, API and screen together). Never split by layer ("all database work", "all API work").
2. **Small enough for one session.** A task fits in one agent's working session: roughly half
   a day of work, a handful of files. Bigger: split it into goals that each work on their own.
3. **Written so nobody has to guess.** Every task has acceptance criteria written as
   "Given ... when ... then ...", including the error cases, the files or areas it may touch,
   what it depends on, and which checks it needs.
4. **No overlapping files in parallel.** Two tasks that touch the same files run one after the
   other. Tasks in different areas can run at the same time, each builder on its own branch.
5. **Only backward dependencies.** A task may depend on earlier tasks, never on later ones.
6. **Design before build.** Screens are designed and approved before their build task starts.
   Architecture decisions are written before the first builder starts.

## Checks before a task is done

The lead sets the checks each task needs when planning:

| Check | Who | Required when |
|---|---|---|
| code | reviewer (or the lead in a Solo team) | always |
| security | security | login, accounts, permissions, user input, uploads, payments, personal data, secrets, database queries, external APIs, new dependencies |
| qa | qa (or the designer for pure visual work) | anything a user sees or clicks |

The order is fixed:

1. **Builder** runs tests, build and lint, records the results, and moves the task to review.
2. **Reviewer and security** check the real code at the same time. Both are read-only.
3. **QA** tests it from the user's side once the code checks pass.
4. **Lead** marks it done only when every required check passed.

A failed check sends the task back to the same builder with the findings. After 5 rounds on one
task, the lead asks you what to do. Before the project is delivered, security does one sweep over
the whole codebase.

## Keeping cost down

- **Model per role.** Lead and architect on the strongest model; builders, reviewer, security
  and qa on a mid-tier model; docs on the cheapest. In Claude Code, pick the model when you start
  the session (`/model`).
- **Reviewers wake up only when there is something to review.** With nothing in review they check
  about once an hour, and they stop when the project is delivered.
- **Fresh sessions per role.** Each agent keeps its own short context instead of one agent
  carrying everything.
- **Checks only where they matter.** Security runs on the tasks that need it plus one final
  sweep, not on every change.
