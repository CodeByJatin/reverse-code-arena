# Reverse Code Arena — Two-Person Execution Plan
**Shivank + Jatin · Mon 21 Sept → Thu 24 Sept (submit), Fri 25 Sept deadline**

---

## 0. Current State Audit — be honest

| Item | Status |
|---|---|
| Problem chosen, research-backed | ✅ Done (Gap 11, Phase 1 research) |
| Mechanism designed (catalogue → constrained injection → verification → dual-axis scoring) | ✅ Done (build spec) |
| Bug catalogue (10 types, 5 for MVP) | ✅ Designed, not coded |
| Generation prompt + JSON schema | ✅ Designed, not coded |
| Verification harness | ✅ Pseudocode only — **not written** |
| Comprehension grading rubric | ✅ Designed, not coded |
| Any actual code | ❌ **Zero lines exist** |
| Repo, deployment, env setup | ❌ Nothing |
| Task list (~20 task strings) | ❌ Not written |
| Seeded challenges | ❌ None |
| Test-user data | ❌ None |
| Demo video, README | ❌ None |

**UNKNOWN (decide in the first 15 minutes, don't research):**
- Which LLM API key you actually have working (Gemini free tier is the likely answer — it's free and you both have Gemini Pro access). Decide and move on.
- Whether you have a deploy target. Default: **Render free tier** or **Railway**. If neither works by Wed, demo locally from Shivank's laptop — that is acceptable, do not burn hours on it.

**Architecture decision I'm making for you (challenge to earlier assumptions):**
Do **not** build a React SPA. Do **not** use Monaco editor. A single FastAPI app serving one static HTML page with vanilla JS, rendering code as a `<pre>` with clickable numbered lines, is ~90% of the demo value at ~25% of the cost. Monaco alone could eat Jatin's entire Tuesday. Rejected.

**Stack (locked, no debate):**
```
Python 3.11 · FastAPI · Uvicorn · google-generativeai (or openai) · 
vanilla HTML/CSS/JS · JSON files for storage (NO database)
```
No database. Challenges and attempts go in `data/*.json`. A DB adds setup, migration, and deploy complexity for zero demo value at this scale.

---

## 1. The Contract — agree on this before writing any code

Both of you code against this and nothing else. 15-minute call, then split.

```python
# schemas.py — Shivank writes this file FIRST, commits it, tells Jatin.
# Nobody else edits it without a message in chat.

Challenge = {
  "id": str,
  "task_description": str,      # what the fn is supposed to do (shown to student)
  "function_name": str,
  "code": str,                  # full runnable python
  "num_lines": int,
  "bug_type": str,              # from catalogue
  "buggy_line_number": int,     # 1-indexed
  "flawed_assumption": str,     # ground truth for grading
  "passing_tests": [{"input": list, "expected": any}],
  "edge_case_test": {"input": list, "expected": any},
  "correct_line": str
}

Attempt = {
  "challenge_id": str,
  "selected_line": int,
  "explanation": str,
  "fixed_code": str
}

Result = {
  "detection": {"line_correct": bool, "near_miss": bool, "fix_passes": bool},
  "comprehension": {"score": int, "feedback": str},   # score 0-3
  "verdict": str   # "found_and_understood" | "found_not_understood" |
                   # "not_found_but_understood" | "neither"
}
```

### API contract (3 endpoints, that's all)
```
GET  /api/challenge?difficulty=easy   -> Challenge  (minus answer fields)
POST /api/submit  body: Attempt       -> Result
GET  /api/stats                       -> {verification_pass_rate, attempts_summary}
```
`GET /api/challenge` **must strip** `buggy_line_number`, `flawed_assumption`, `correct_line`, and `edge_case_test` before returning. Jatin: if you see those in the browser payload, tell Shivank immediately — it's a demo-killing leak.

---

## 2. Ownership — no shared files

| Directory | Owner | Other person touches it? |
|---|---|---|
| `engine/` (generation, verification, grading) | **Shivank** | Never |
| `web/` (static HTML/CSS/JS) | **Jatin** | Never |
| `api/main.py` (FastAPI routes) | **Shivank** writes stubs Mon AM, then Jatin may edit only route response shaping | Coordinate in chat |
| `schemas.py` | Shivank | Read-only for Jatin |
| `data/` (tasks list, seeded challenges) | Shared, append-only | Both, but different files |
| `README.md` | Jatin | — |

This split means **zero merge conflicts by construction**. That's the whole point.

---

## 3. Phased Plan

### Phase A — Foundations (Mon, 2h) 🔴
**Objective:** Repo exists, contract locked, both can run the app locally.

| Task | Owner | Parallel? | DoD |
|---|---|---|---|
| Create repo, `.gitignore`, `requirements.txt`, folder skeleton | Shivank | — | Jatin can clone and `uvicorn api.main:app --reload` shows "hello" |
| Write `schemas.py` + 3 stub endpoints returning hardcoded fake Challenge | Shivank | — | `GET /api/challenge` returns valid JSON in browser |
| Get LLM API key working, `.env` + `.env.example` | Shivank | — | One successful API call printed to console |
| Write 20 task strings → `data/tasks.json` | Jatin | ✅ yes | 20 one-line task descriptions committed |
| Static page skeleton: header, code panel, sidebar | Jatin | ✅ yes | Page loads, renders the stub challenge's code |

**Dependency:** Jatin's frontend needs only the stub endpoint — which exists within the first 30 min. After that, both work fully in parallel all day.

---

### Phase B — The Engine (Mon PM → Tue, 5h) 🔴 CRITICAL PATH
**Objective:** Reliable generation of verified challenges. **This is the whole project.**

| Task | Owner | DoD |
|---|---|---|
| `engine/catalogue.py` — 5 bug types with descriptions | Shivank | Dict of 5 entries |
| `engine/generate.py` — prompt assembly + JSON parse + retry | Shivank | Returns a Challenge dict from a (task, bug_type) pair |
| `engine/verify.py` — the 4-condition harness, subprocess + 5s timeout | Shivank | Rejects a deliberately-broken challenge; accepts a known-good one |
| Generate-verify loop with max 3 retries + pass-rate logging | Shivank | Prints `"attempt 1: reject (bug didn't trigger)"` etc. |
| Seed 8 verified challenges → `data/seeded.json` | Shivank | 8 challenges, all pass `verify()` |

**Definition of Done for Phase B:** running `python -m engine.seed` produces 8 verified challenges and prints a verification pass-rate number. **If this isn't done by Tuesday night, cut scope elsewhere — never here.**

---

### Phase C — Interaction (Tue → Wed, 4h) 🔴
**Objective:** Student can read code, click a line, explain, fix, submit.

| Task | Owner | Parallel? | DoD |
|---|---|---|---|
| Numbered code renderer, click-to-select line (highlight) | Jatin | ✅ | Clicking line 7 highlights it, JS holds `selected_line=7` |
| Explanation textarea + fix editor (editable `<textarea>` prefilled with code) | Jatin | ✅ | Both values captured on submit |
| `POST /api/submit` wiring + loading state + error handling | Jatin | ✅ | Submits, shows spinner, renders whatever comes back |
| `engine/grade.py` — detection check (line match + re-run edge test on fixed code) | Shivank | ✅ | Returns correct booleans on 3 hand-made attempts |
| LLM comprehension grader (0–3 + feedback) | Shivank | ✅ | Scores a good and a bad explanation differently |

**Integration point:** Wed midday. Shivank returns real `Result`, Jatin renders it. Owner of integration: **Shivank** (he owns the API boundary).

---

### Phase D — The Money Shot (Wed, 2h) 🔴
**Objective:** The dual-axis result screen that makes judges understand in 5 seconds.

| Task | Owner | DoD |
|---|---|---|
| Result screen: two big badges — **Found it ✓/✗** and **Understood it ✓/✗** | Jatin | Four verdict states render distinctly |
| The "found but didn't understand" state visually flagged as the interesting case | Jatin | Distinct color/callout, not just text |
| `/api/stats` returning verification pass rate + attempt breakdown | Shivank | Returns real numbers from logs |
| Collect n≈10 attempts from friends/hostel | **Both** | 10 rows in `data/attempts.json` |

---

### Phase E — Ship (Thu, 3h) 🔴
| Task | Owner | DoD |
|---|---|---|
| README: problem, mechanism, measurable claim, limitations, setup | Jatin | Someone else can run it from README alone |
| Deploy to Render/Railway (timebox: 90 min, then abandon) | Shivank | Public URL loads, or documented local-run fallback |
| Record 2–3 min demo video | **Both** — Jatin drives, Shivank narrates | Uploaded, unlisted link works |
| Final repo tidy, `.env.example`, license, submit | Jatin | Submission form completed |

---

## 4. Critical Path

```
Contract (schemas.py)
   ↓
Stub endpoints ──────────────────┐
   ↓                             ↓
generate.py                  frontend skeleton
   ↓                             ↓
verify.py  ◄── THE BOTTLENECK    code renderer + line select
   ↓                             ↓
seeded challenges                submit flow
   ↓                             ↓
grade.py ────────────────────────┘
           ↓
   dual-axis result screen
           ↓
      user data (n≈10)
           ↓
   README + deploy + video
```

**The single bottleneck is `verify.py`.** Everything downstream — grading, seeding, the stats claim, the demo — depends on it. If generation quality is bad, you still ship: hand-write 8 challenges yourself and keep the harness as the thing that *validated* them. The mechanism story survives either way.

**Removable from MVP if time runs out (in this order):** deploy (demo locally) → `/api/stats` page (put the number in the README instead) → bug types 6–10 → difficulty selection → any styling beyond legible.

---

## 5. Git Workflow (deliberately minimal)

```
main  ← always runnable, both merge into it directly
```

Two people, four days, non-overlapping directories: **branches are overhead, not safety.** Use `main` directly.

**Rules:**
1. Pull before you start a session: `git pull --rebase`
2. Commit small and often: `git commit -m "engine: add off-by-one verifier"`
3. Push at least every 90 min. Never sit on 4 hours of uncommitted work.
4. Prefix commits with your directory: `engine:`, `web:`, `api:`, `docs:`
5. **Never edit a file you don't own.** If you need a change in the other's file, message them. This one rule replaces the entire PR process.
6. If `main` breaks, whoever broke it fixes it immediately — before starting anything new.
7. `.env` in `.gitignore` from commit #1. Commit `.env.example` with dummy values.

If you somehow do hit a conflict: `git checkout --ours` / `--theirs` on the file whose owner you are, then message the other person. Don't hand-merge someone else's module.

---

## 6. AI Tool Allocation

| Task | Tool | Why |
|---|---|---|
| `verify.py` — exact, edge-case-heavy logic | **Claude** (Shivank) | Highest-stakes correctness code; strongest at precise logic and catching its own edge cases |
| Generation prompt tuning / JSON adherence | **Gemini Pro** (Shivank) | You're calling Gemini at runtime — tune the prompt in the same model family it will run on |
| Frontend HTML/CSS/JS scaffold | **Antigravity or ChatGPT Go** (Jatin) | Fast boilerplate generation; low correctness risk, high volume |
| Debugging a specific stack trace | **Whichever is open** | Paste the trace + the one file; don't overthink tool choice |
| README / writeup / video script | **Claude** (Jatin) | Strongest at concise technical prose and honest limitations framing |
| Reviewing the other's module before final integration | **Cross-review**: Shivank's code reviewed by Jatin's AI, and vice versa | Different model = different assumptions = catches what the author's AI rationalized |

**Preventing AI-induced chaos — non-negotiable rules:**
1. **Always paste `schemas.py` into every coding prompt.** This single habit prevents 90% of divergent-assumption bugs.
2. End every prompt with: *"Only output the file `<path>`. Do not modify or suggest changes to other files. If something is ambiguous, ask instead of guessing."*
3. Never let an AI generate across the ownership boundary. If Jatin's AI offers to "also fix your backend," discard it.
4. Hallucinated APIs: if an AI uses a library you didn't install, don't install it — ask for a stdlib version. Every new dependency is deploy risk.
5. Naming: lock the field names in `schemas.py`. If AI renames `flawed_assumption` → `assumption`, revert it.

---

## 7. Copy-Paste Prompts

### Shivank — verification harness (the critical one)
```
I'm building a Python FastAPI project called Reverse Code Arena. Students
review AI-generated buggy code and find the bug.

Here is our data contract — do not change these field names:
[PASTE schemas.py]

Write ONE file: engine/verify.py

It exposes: verify_challenge(challenge: dict) -> tuple[bool, str]
returning (is_valid, rejection_reason).

A challenge is valid only if ALL FOUR hold:
1. challenge["code"] executes without error
2. every passing_tests entry returns expected (bug is hidden)
3. edge_case_test does NOT return expected, or raises (bug is real)
4. replacing line buggy_line_number with correct_line makes edge_case_test pass

Requirements:
- Execute untrusted code in a subprocess with a 5 second timeout.
  A timeout = invalid, reason "timeout".
- Never let a bad challenge crash the caller — catch everything.
- Return a specific rejection_reason string for each failure mode so I can
  log which failure is most common.
- Standard library only.

Only output engine/verify.py. Do not modify other files. If anything is
ambiguous, ask me instead of guessing.
```

### Shivank — generation
```
[PASTE schemas.py]

Write engine/generate.py with:
  generate_challenge(task: str, bug_type: str, client) -> dict

It must:
- Build a prompt instructing the model to write a 15-30 line Python function
  implementing `task`, containing exactly one bug of type `bug_type`, that
  passes 3 normal tests and fails one edge case, fixable in one line.
- Request strict JSON matching the Challenge schema, no markdown fences.
- Parse defensively: strip ``` fences if present, json.loads, validate all
  required keys exist and types match.
- Raise GenerationError with a clear message on malformed output.

Also write generate_verified(task, bug_type, client, max_retries=3) that
loops generate -> verify (import from engine.verify) and returns the first
valid challenge, logging each rejection reason.

Only output engine/generate.py. Ask if ambiguous.
```

### Jatin — frontend
```
I'm building a single-page frontend for a code-review learning tool.
No frameworks, no build step — plain HTML + CSS + vanilla JS in web/.

The API gives me:
GET /api/challenge -> {id, task_description, function_name, code, num_lines}
POST /api/submit {challenge_id, selected_line, explanation, fixed_code}
  -> {detection:{line_correct,near_miss,fix_passes},
      comprehension:{score,feedback}, verdict}

Build web/index.html, web/style.css, web/app.js:
- Show task_description at top.
- Render `code` as numbered lines; clicking a line selects/highlights it.
- A textarea for the student's explanation of the flawed assumption.
- An editable code area prefilled with `code` for their fix.
- Submit button -> POST -> render results.
- Result screen: TWO prominent badges, "Found it" and "Understood it",
  each ✓ or ✗. The state (found ✓ / understood ✗) must be visually
  flagged as the notable case.
- Handle loading and error states.

Dark, clean, high-contrast. Monospace for code. No external CDN libraries —
everything self-contained.

Only output those three files. Do not write any Python.
```

### Either — pre-submission review
```
Review this repo for a hackathon submission due in 24 hours.

[PASTE repo tree + key files]

Report ONLY things that would break a live demo or embarrass us in judging:
1. Does GET /api/challenge leak answer fields to the browser?
2. Any crash path with no error handling?
3. Any secret committed to git?
4. Does it run from a fresh clone following the README?
Do not suggest refactors, tests, or architecture improvements. We ship
tomorrow. Prioritize by severity.
```

---

## 8. Day-by-Day

### Monday (today) — target 3h each
| | Shivank | Jatin |
|---|---|---|
| **Tasks** | Repo + skeleton + `schemas.py` + stub endpoints + API key working; then start `generate.py` | 20 task strings → `data/tasks.json`; static page skeleton rendering the stub challenge |
| **Output** | `uvicorn` serves a fake Challenge; one real LLM call succeeds | Page renders numbered code from the stub |
| **Sync** | 15 min at start: agree on `schemas.py`, confirm endpoints. 10 min at end. | |
| **Checkpoint** | Jatin's page displays Shivank's stub data end-to-end. | |

### Tuesday — target 4h each 🔴 hardest day
| | Shivank | Jatin |
|---|---|---|
| **Tasks** | `catalogue.py`, `verify.py`, generate→verify loop, seed 8 challenges | Line-click selection, explanation box, fix editor, submit wiring |
| **Output** | `data/seeded.json` with 8 verified challenges + pass-rate number | Full input flow captured, POSTs to stub endpoint |
| **Sync** | Midday: Shivank confirms real Challenge shape matches the stub exactly | |
| **Checkpoint** | **Verified challenges exist.** If not, Wednesday morning is hand-writing 8 challenges — accept it and move on. | |

### Wednesday — target 4h each
| | Shivank | Jatin |
|---|---|---|
| **Tasks** | `grade.py` detection + comprehension grader; real `/api/submit`; `/api/stats` | Dual-axis result screen; polish; start README |
| **Output** | Real `Result` objects | Four verdict states render |
| **Sync** | Midday integration — swap stub for real endpoint. Then **both** recruit ~10 friends to try it. | |
| **Checkpoint** | Full loop works end-to-end on a real challenge. n≈10 attempts logged. | |

### Thursday — target 3h each, ship day
| | Shivank | Jatin |
|---|---|---|
| **Tasks** | Deploy (90 min timebox); cross-review Jatin's code | Finish README; cross-review Shivank's code; record video |
| **Sync** | Record video together — Jatin screen-shares, Shivank narrates the mechanism | |
| **Checkpoint** | **Submitted.** Friday is buffer only — build nothing new. | |

---

## 9. Milestones

| ID | Milestone | Done means |
|---|---|---|
| M0 | Contract locked | `schemas.py` committed, both agree, stub endpoint live |
| M1 | Parallel dev unblocked | Jatin renders Shivank's stub in browser |
| M2 | **Engine works** | 8 verified challenges in `data/seeded.json` + pass-rate logged |
| M3 | Input captured | Line select + explanation + fix all POST correctly |
| M4 | End-to-end | Real challenge → real grading → real result screen |
| M5 | Evidence | n≈10 real attempts, detection-vs-comprehension gap visible |
| M6 | Shippable | README reproducible from fresh clone; no leaked answers; no committed secrets |
| M7 | Submitted | Repo public, video uploaded, form submitted |

---

## 10. Risk Register

| Risk | Prob | Impact | Prevention | Backup |
|---|---|---|---|---|
| LLM generates unverifiable bugs (bug doesn't trigger) | **High** | High | Generate-verify loop with retries; expect a low first-pass rate | Hand-write 8 challenges Wed AM; harness still validates them — story intact |
| Rate limits / API quota mid-demo | Medium | **Critical** | Seeded challenges committed to repo | Demo runs entirely off `seeded.json`; never demo live generation |
| Deploy eats a whole day | Medium | Medium | Hard 90-min timebox Thursday | Demo locally; README documents local run. Judges accept this |
| Answer fields leak to frontend | Medium | **Critical** | Strip in the route, not the frontend; Jatin checks Network tab Wed | — |
| Untrusted code hangs the server | Medium | High | Subprocess + 5s timeout from day one | — |
| Scope creep (difficulty tiers, leaderboards, auth) | **High** | High | Section 11 is binding; nothing new after Wednesday | — |
| One person falls behind | Medium | High | Non-overlapping dirs mean the other keeps moving | Shivank's engine is the priority; Jatin's UI can degrade to ugly-but-working |
| Video recorded last-minute and bad | Medium | High | Write the 60-word script Wednesday, not Thursday | Two takes minimum |

---

## 11. Scope — binding

**MUST HAVE (🔴)**
Bug catalogue (5 types) · generation with constrained injection · verification harness · 8 seeded challenges · code viewer with line selection · explanation input · fix submission · detection scoring · comprehension scoring · dual-axis result screen · README · demo video

**SHOULD HAVE (🟡)** — only if M4 done by Wednesday night
Verification pass-rate stat surfaced in UI · n≈10 user data · public deployment · bug types 6–10

**NICE TO HAVE (🟢)** — almost certainly do not build
Difficulty tiers · leaderboard · user accounts · multiple languages · history/progress tracking · hint system · timer · animations · VS Code extension

**Explicitly rejected:** Monaco editor, React, any database, authentication, Docker. Each costs hours and adds zero judging value in a 2–3 minute demo.

---

## Shivank — First 10 Actions
1. Create the GitHub repo `reverse-code-arena`, public, Python `.gitignore`.
2. Folder skeleton: `engine/ api/ web/ data/` + empty `__init__.py` files.
3. `requirements.txt`: `fastapi uvicorn python-dotenv google-generativeai`
4. Write `schemas.py` from the contract above. Commit. Message Jatin: "contract locked."
5. `api/main.py`: 3 stub endpoints, `/api/challenge` returning one hardcoded Challenge; mount `web/` as static.
6. Confirm `uvicorn api.main:app --reload` serves it; push.
7. Get the Gemini API key into `.env`; commit `.env.example`; make one successful API call.
8. Write `engine/catalogue.py` — 5 bug types with one-line descriptions.
9. Paste the verify.py prompt into Claude; build `engine/verify.py`.
10. Test `verify.py` against one deliberately-good and one deliberately-broken challenge you write by hand.

## Jatin — First 10 Actions
1. Wait for Shivank's "contract locked" message (should be <45 min). Meanwhile do steps 2–3.
2. Write 20 task strings into `data/tasks.json` — simple functions: median, merge sorted lists, word frequency, running average, date-range validation, binary search, flatten nested list, etc.
3. Sketch the result screen on paper — where the two badges sit. 10 minutes, no tooling.
4. Clone the repo, `pip install -r requirements.txt`, confirm the server runs.
5. Open `/api/challenge` in the browser; copy the JSON — this is your fixture.
6. Build `web/index.html` skeleton: task description, code panel, sidebar.
7. `web/app.js`: fetch the challenge, render code as numbered lines.
8. Implement click-to-select-line with visible highlight.
9. Add explanation textarea + editable fix area.
10. Wire submit → POST to `/api/submit`, log whatever comes back.

## First Synchronization Point
**Now — 15 minutes, before either writes code.** Agree on: the exact field names in `schemas.py`, that there is no database, that the frontend is vanilla JS, and the directory ownership split. Then don't sync again until end of Monday.

## Critical Path
`schemas.py` → stub endpoint → `generate.py` → **`verify.py`** → seeded challenges → `grade.py` → result screen → video → submit.
Minimum realistic time: ~14 hours of Shivank's work. That's your floor.

## Fastest MVP Route
Stub endpoint (Mon AM) → frontend built against the stub all Monday/Tuesday while Shivank builds the engine → swap stub for real endpoint Wednesday midday → grade + result screen Wednesday PM → ship Thursday. The stub is what lets both of you run at full speed from hour one.

## Final Integration Checklist
- [ ] Fresh clone + README steps → app runs
- [ ] `/api/challenge` response contains **no** `buggy_line_number`, `flawed_assumption`, `correct_line`, or `edge_case_test`
- [ ] All 8 seeded challenges load and grade without error
- [ ] Submitting an empty explanation doesn't crash
- [ ] Submitting unchanged code doesn't crash
- [ ] No `.env` or API key in git history
- [ ] Verification pass-rate number is recorded somewhere quotable
- [ ] Both of you can run it on your own machine

## Demo/Submission Checklist
- [ ] 2–3 min video: problem (20s) → live solve showing "found but didn't understand" (70s) → mechanism diagram: catalogue → injection → verification → dual-axis (50s) → the pass-rate stat + limitations (20s)
- [ ] Video runs off seeded challenges, not live generation
- [ ] README: problem, mechanism, the measurable claim, honest limitations, setup steps
- [ ] Repo public, no secrets, license file
- [ ] Live URL works in an incognito window — or README clearly states local-run
- [ ] Submission form completed **Thursday**, not Friday
