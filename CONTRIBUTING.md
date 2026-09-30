# Contributing to IDSMS-CIS

Team Beacon capstone (IT 321). This doc covers how to get set up and how we work — not the product spec, which lives in [`PRD.md`](./PRD.md).

## Getting added

Ask a Department Coordinator-role teammate (or whoever holds org admin) to add you to the `team-beacon-slu` GitHub organization and the `idsms-cis` repo. You'll need a GitHub account.

## Fastest path: GitHub Codespaces

No local Node/npm setup needed.

1. On the repo page, click **Code → Codespaces → Create codespace on develop**.
2. Wait for the container to build — it runs `npm install` (and `prisma generate` once `DATABASE_URL` exists) automatically.
3. Run `npm run dev` in the Codespace terminal, then use the forwarded port-3000 preview.

## Local dev fallback

If you'd rather work locally:

```bash
git clone https://github.com/team-beacon-slu/idsms-cis.git
cd idsms-cis
npm install
cp .env.example .env.local   # fill in real values once we have Supabase/Gemini/Resend keys
npm run dev
```

Requires Node 24+ (the devcontainer, CI, and `package.json#engines` all pin this — `@sparticuz/chromium` and `lint-staged` require it).

## Git Workflow — Step by Step

This section assumes little to no prior Git/GitHub experience. Read it once, fully,
before you pick up your first issue — it will save you (and whoever reviews your PR)
a lot of confusion later. If you already know Git well, the quick reference table at
the very bottom is all you need.

### The one rule that matters most

> **One GitHub issue = one branch, from the moment you start until it's merged.**

Do **not** create a new branch every time you sit down to work, every time you fix a
review comment, or every time you commit something. A single issue might take you
three separate work sessions and five commits — all of that happens on the **same**
branch. Creating a fresh branch each time is the single most common mistake that
causes confusion on this team: half-finished branches pile up, nobody remembers which
one has the latest work, and PRs get opened against the wrong thing.

The only time you create a **new** branch is when you start work on a **different**
issue.

### One-time setup (do this once, not per issue)

1. Make sure Git knows who you are (use the same name/email as your GitHub account):
   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "your-github-email@example.com"
   ```
2. Clone the repo once (see "Local dev fallback" above if you haven't already):
   ```bash
   git clone https://github.com/team-beacon-slu/idsms-cis.git
   cd idsms-cis
   ```
   If you're using GitHub Codespaces, this step is done for you automatically.

You do **not** re-clone the repo for every issue. You already have it — you just make
new branches inside the one clone you have.

### Step 1 — Before you start any issue: sync `develop`

Every single time you're about to start a new issue, first make sure your local
`develop` matches what's actually on GitHub. Skipping this is how people end up
branching off week-old code and creating painful merge conflicts later.

```bash
git checkout develop
git pull origin develop
```

- `git checkout develop` switches you onto the `develop` branch.
- `git pull origin develop` downloads the latest commits from GitHub and merges them
  into your local `develop`. Think of it as "refresh."

If Git says `Already up to date.`, that's fine — it just means nothing new happened
since last time.

### Step 2 — Create your branch (once per issue)

Pick the GitHub issue you're working on (e.g. issue #12, "wire up holidays route").
Create **one** branch for it, named with the issue number so everyone can tell at a
glance which issue it belongs to:

```bash
git checkout -b feature/12-holidays-route
```

- Use `feature/<issue-number>-<short-description>` for new functionality.
- Use `fix/<issue-number>-<short-description>` for bug fixes.
- `git checkout -b <name>` creates the branch **and** switches you onto it in one
  step — you don't need a separate "create" command.

From this point on, **every commit you make for this issue goes on this branch**,
until the issue is done and merged. Closing your laptop, coming back tomorrow,
getting review feedback, fixing a typo you noticed — none of that is a reason to make
a new branch. You just keep committing to `feature/12-holidays-route`.

To come back to unfinished work later (e.g. tomorrow), you don't create it again —
you switch back to it:

```bash
git checkout feature/12-holidays-route
```

Run `git branch` any time to see every branch you currently have locally, with a `*`
marking the one you're on.

### Step 3 — Do your work, then commit

Make your code changes as normal. When you've got a meaningful chunk of work done
(not necessarily the whole issue — small, focused commits are easier to review than
one giant commit):

```bash
git status
```

This shows you which files changed. Read it before staging anything — it prevents
accidentally committing files you didn't mean to (like `.env` or stray debug files).

```bash
git add src/lib/services/calendarService.ts
git commit -m "Implement holidays route handler"
```

- `git add <path>` stages a specific file. You can also do `git add .` to stage
  everything `git status` listed as changed — use this once you've checked the status
  output and trust that everything shown really should be committed.
- `git commit -m "..."` saves a snapshot with a short message describing what changed
  and why, not just what file you touched. Good: `"Add holidays route with role
branching"`. Not useful: `"update"` or `"fix stuff"`.

You can (and should) commit multiple times as you make progress on the same issue —
each commit stays on the same branch you created in Step 2.

### Step 4 — Push your branch to GitHub

Your commits so far only exist on your machine. Push them so they're backed up and
visible to the team:

```bash
git push origin feature/12-holidays-route
```

The **first** time you push a new branch, Git may ask you to add `-u`:

```bash
git push -u origin feature/12-holidays-route
```

The `-u` (`--set-upstream`) links your local branch to the matching branch on
GitHub, so every push/pull after that can just be `git push` / `git pull` with no
extra arguments while you're on that branch.

Push again any time you make new commits — you do not need to open a new PR or
branch to add more work, just `git push` again.

### Step 5 — Open a Pull Request (PR)

1. Go to the repo on GitHub. You'll usually see a yellow banner offering to open a PR
   for the branch you just pushed — click **Compare & pull request**. If not, go to
   the **Pull requests** tab → **New pull request** → set base: `develop`, compare:
   your branch.
2. Give it a clear title (referencing the issue helps, e.g. `Closes #12: holidays
route`). Writing `Closes #12` in the PR description automatically closes that
   issue when the PR merges.
3. Submit the PR. This does **not** merge anything yet — it just opens it for review.
4. Wait for CI to run (lint, typecheck, `prisma validate`, build) and for a teammate
   to review it. Both must pass before it can merge — branch protection enforces
   this on `develop` and `main`.

### Step 6 — Responding to review feedback

If a reviewer asks for changes, **do not create a new branch or new PR.** Go back to
your existing branch, make the changes, commit, and push again:

```bash
git checkout feature/12-holidays-route
# make the requested changes
git add .
git commit -m "Address review feedback: validate date range"
git push
```

The same PR updates automatically with your new commits — the reviewer sees the
diff and can re-approve. This is the entire reason "one branch per issue" matters:
if you'd made a new branch, GitHub would have no idea it's related to the same PR.

### Step 7 — After your PR is merged: clean up

Once a maintainer merges your PR on GitHub, your branch has done its job. Clean up
so old branches don't pile up and confuse people:

```bash
git checkout develop
git pull origin develop
git branch -d feature/12-holidays-route
```

- `git branch -d <name>` deletes the branch **locally**. Git will refuse if it thinks
  the branch has unmerged work, which is a useful safety check.
- If GitHub didn't already delete the branch on the server when the PR merged
  (there's usually an "Delete branch" button on the merged PR page — click it), you
  can also remove it from the remote yourself:
  ```bash
  git push origin --delete feature/12-holidays-route
  ```

You're now back on an up-to-date `develop`, ready to start the next issue at Step 1.

### Staying in sync while you work on a long-running issue

If your issue takes a few days and `develop` has moved on (other people's PRs
merged) while you're still working, pull those changes into your branch so you don't
fall too far behind and hit a huge conflict at the end:

```bash
git checkout develop
git pull origin develop
git checkout feature/12-holidays-route
git merge develop
```

That last command merges the latest `develop` into your branch. If it reports a
conflict, see the next section.

### If you hit a merge conflict

A conflict means Git found a change in your branch and a change in `develop` that
touch the exact same lines and it can't guess which one you want. This is normal, not
a disaster.

1. Run `git status` — it lists every file with a conflict.
2. Open each listed file. You'll see conflict markers like this:
   ```
   <<<<<<< HEAD
   your version of the code
   =======
   the develop version of the code
   >>>>>>> develop
   ```
3. Edit the file by hand to keep the correct combined result, then delete the
   `<<<<<<<`, `=======`, and `>>>>>>>` marker lines entirely.
4. Once every conflicted file is fixed:
   ```bash
   git add <the files you fixed>
   git commit
   ```
   (Git pre-fills a merge commit message for you — you can usually just save it.)
5. Push as normal: `git push`.

If you're not sure your resolution is correct, **stop and ask in the team channel**
before committing — a wrong resolution can silently delete someone else's work.

### Common mistakes to avoid

| Mistake                                                                 | Why it's a problem                                                                                                                                 | Do this instead                                                                                                                                                                        |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Creating a new branch every time you sit down to work on the same issue | You end up with `feature/12-a`, `feature/12-b`, `feature/12-final`, `feature/12-final-v2`... and nobody (including you) knows which one is current | `git checkout feature/12-holidays-route` to go back to the one branch for that issue                                                                                                   |
| Creating a new branch to "fix" a review comment                         | Splits one issue's history across two disconnected PRs                                                                                             | Commit and push more changes to the _same_ branch (Step 6)                                                                                                                             |
| Branching off another feature branch instead of `develop`               | Your PR ends up including someone else's unfinished, unreviewed work                                                                               | Always `git checkout develop && git pull` first (Step 1), then branch from there                                                                                                       |
| Committing directly to `develop` or `main`                              | Branch protection blocks this anyway — the push will be rejected                                                                                   | Always work on a `feature/...` or `fix/...` branch, open a PR                                                                                                                          |
| Never pushing until "everything is done"                                | If your laptop dies or you get stuck, all your work is gone; teammates also can't see progress                                                     | Push after every commit or two — it's cheap and just updates the same branch/PR                                                                                                        |
| Leaving merged branches around forever                                  | Clutters the branch list, makes it hard to tell what's active                                                                                      | Delete after merge (Step 7) — GitHub can do this for you with one click on the merged PR                                                                                               |
| Using `git push --force` because a push was rejected                    | This can overwrite and permanently delete a teammate's commits on that branch                                                                      | Ask in the team channel first; a rejected push almost always means someone else pushed to the same branch — `git pull` to bring those in, resolve conflicts if any, then push normally |

### Quick command reference

| I want to...                                                 | Command                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Get the latest `develop`                                     | `git checkout develop` then `git pull origin develop`                                      |
| Start work on a new issue                                    | `git checkout -b feature/<issue#>-<short-name>`                                            |
| See what changed                                             | `git status`                                                                               |
| See the actual line changes                                  | `git diff`                                                                                 |
| Stage a file                                                 | `git add <path>` (or `git add .` for everything shown by `git status`)                     |
| Save a snapshot                                              | `git commit -m "clear description of what changed"`                                        |
| Upload your commits                                          | `git push` (first time on a new branch: `git push -u origin <branch-name>`)                |
| Resume work on an issue you started earlier                  | `git checkout feature/<issue#>-<short-name>`                                               |
| See all your local branches                                  | `git branch`                                                                               |
| Pull in the latest `develop` while mid-issue                 | `git checkout develop && git pull`, then `git checkout <your-branch> && git merge develop` |
| Delete a branch after its PR is merged                       | `git branch -d <branch-name>`                                                              |
| Undo uncommitted changes to a file (careful — unrecoverable) | `git checkout -- <path>`                                                                   |

### PR & merge rules (unchanged, for reference)

- Feature branches off `develop`, named `feature/<issue#>-<short-description>` or
  `fix/<issue#>-<short-description>`.
- Open a PR into `develop`. `main` only receives merges from `develop` at milestone
  checkpoints.
- PR review is required before merge — branch protection enforces this on both
  `main` and `develop`.
- CI (lint, typecheck, `prisma validate`, build) must pass before merge.

## Code organization

All business logic lives in `/src/lib/services/` — never directly in page files or API route handlers (NFR-MNT-06). See the service stubs already in place; each one maps to a PRD module.

## Database changes

We're on Prisma with a Supabase Postgres backend. Edit `prisma/schema.prisma`, then run `npx prisma db push` — **not** `prisma migrate dev`. This project has no migration history (schema changes have always gone through `db push`), so `migrate dev` sees the entire existing schema as "drift" and wants to reset the database to establish a baseline, which would drop all data on our shared dev project. Confirmed this the hard way during Phase 1; stick with `db push`.

Anything Prisma can't express at all (a Postgres extension, an RLS policy, a Storage bucket) goes in a hand-written SQL file under `prisma/migrations_manual/`, run once by hand in the Supabase SQL editor **after** the `db push` that creates the tables it touches (numbered in the order they need to run — `001_...` before `002_...`, etc.). See `001_vector_extension_and_audit_rls.sql`, `002_default_deny_rls.sql`, and `003_storage_buckets.sql` for the pattern. Ordinary schema changes (new columns, new tables) don't need a file here — `db push` alone handles those.

## Phase 3 stub implementation convention

Phase 3 adds four new service files (`attendanceService.ts`, `weeklyReportService.ts`, `monthlyReportService.ts`, `calendarService.ts`) with exported functions marked as stubs. Each stub is tracked in `PHASE3_TASKS.md` and has a matching GitHub issue (issues #3–#45 in this repo).

When you pick up a GitHub issue to implement a stub function:

1. **Find the stub**: Look for a function with a comment like `// TODO(your-github-username): <contract>`. The contract describes the expected behavior in plain English (e.g., "must validate userId and return 401 if unauthorized").

2. **Keep the signature**: Replace only the function body — do not change the function name, parameters, return type, or JSDoc comments. Routes, other services, and tests all depend on the exact signature staying the same.

3. **Update the test**: In the matching `*.test.ts` file, find the smoke test for your function (it will have a placeholder assertion like `expect(true).toBe(true)`). Replace that placeholder with a real test for your implementation.

4. **Commit**: Once your logic is complete and tests pass, remove the `// TODO(...)` comment and commit.

All Phase 3 service files are covered by Jest — run `npx jest --coverage` locally to confirm your implementation meets the coverage threshold before opening a PR.

## Questions

Ping the team channel, or ask the Project Adviser (Ria Andrea N. Fernandez) at the next milestone checkpoint.
