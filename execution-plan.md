# Reverse Code Arena — 50/50 Balanced Execution Plan (Research-Grounded)
**Shivank + Jatin · Mon 21 Sept → Thu 24 Sept (Submit), Fri 25 Sept (Deadline)**  
**Research Backing**: Ziyi Zhang (WSU, 2026) + Zhao et al. (EPFL/UTokyo, 2026 - arXiv:2604.18660v1)

---

## 0. Current State & Decision Log

| Item | Status |
|---|---|
| Project Conception & Research Grounding | ✅ Done (Zhang 2026 + Zhao 2026) |
| Architecture & Stack Locked | ✅ Done (FastAPI + vanilla HTML/CSS/JS + JSON storage) |
| Git Config & Identities | ✅ Configured for `ShivankVerma48` (`shivankverma571@gmail.com`) |
| API Key & Gemini Test | ✅ Verified live (`gemini-3.6-flash`) |
| Schemas & Stub Endpoints | ✅ Done (`schemas.py`, `api/main.py`) |
| Bug Catalogue | ⏳ Designed, pending code |
| Verification Harness (`engine/verify.py`) | ⏳ Critical Path — Top Priority |
| Grading Engine (`engine/grade.py`) | ⏳ Designed with Pedagogical CoT |
| Adversarial Benchmark (`engine/stress_test.py`) | ⏳ Designed with 6 attack vectors |
| Web UI (`web/`) | ⏳ Pending Jatin Turn |
| Seeded Challenges (`data/seeded.json`) | ⏳ Pending Seeding Script |

---

## 1. 50/50 Workload Balance & Clean Ownership

To prevent bottlenecks and avoid merge conflicts, responsibilities are split **50/50** with zero overlapping files:

```
                          [ schemas.py ] (Shared Contract)
                                 │
         ┌───────────────────────┴────────────────────────┐
         ▼                                                ▼
  SHIVANK (50% Backend Engine)                   JATIN (50% Interaction & Eval)
  - api/main.py (FastAPI Routes & Guards)        - data/tasks.json (20 Tasks)
  - engine/catalogue.py (5 Bug Types)            - engine/grade.py (Axis 1 + Axis 2)
  - engine/verify.py (Harness - Bottleneck)      - web/index.html, style.css, app.js
  - engine/generate.py (LLM Gen + Retry)           * Code Viewer & Clickable Lines
  - engine/seed.py (8 Verified Challenges)         * Feature 1: Hypothesis-First UI
  - engine/stress_test.py (Feature 4 Benchmark)    * Feature 2: Anti-Stagnation Nudge
                                                   * Dual-Axis Results Dashboard
                                                 - README.md (Academic Narrative)
```

| Area | Owner | Share | DoD |
|---|---|:---:|---|
| **API & Safeguards** (`api/main.py`) | Shivank | 10% | 3 REST endpoints, zero answer leakage to browser. |
| **Generation & Verification** (`engine/catalogue.py`, `verify.py`, `generate.py`) | Shivank | 25% | Generates valid Python code, enforces 4-stage test harness. |
| **Seeding & Robustness Benchmark** (`engine/seed.py`, `stress_test.py`) | Shivank | 15% | 8 pre-seeded challenges, 6-vector adversarial attack audit. |
| **Task Corpus** (`data/tasks.json`) | Jatin | 5% | 20 varied programming task descriptions. |
| **Grading & Anti-Leakage CoT** (`engine/grade.py`) | Jatin | 15% | Axis 1 detection logic + Axis 2 CoT comprehension evaluation. |
| **Interactive UI & Scaffolding** (`web/`) | Jatin | 25% | Clickable code lines, Hypothesis-First inputs, 90s stagnation alert, 4-badge verdict UI. |
| **Presentation & Documentation** (`README.md`, Demo Video) | Jatin | 10% | Complete README with research citations; drives demo video. |

---

## 2. The 4 Research-Backed Features

### Feature 1: Hypothesis-First Form (Zhang Ch. 3)
* **Goal**: Break the "Hypothesis Bottleneck" where 42.1% of novices never form a testable hypothesis.
* **Owner**: Jatin (UI form) + Shivank (`schemas.py` Attempt model).
* **Spec**: User enters `expected_behavior` and `observed_flaw` upon selecting a line.

### Feature 2: Anti-Stagnation Scaffold (Zhang Ch. 3 & 4)
* **Goal**: Prevent novices from looping endlessly in unproductive broad reading (>90s).
* **Owner**: Jatin (JS timer & modal) using Shivank's G4 hint contract.
* **Spec**: Inactivity/broad browsing for >90s triggers a concrete tracing hint anchored to the entry point and passing test inputs.

### Feature 3: Anti-Leakage Pedagogical CoT Engine (Zhao et al. 2026)
* **Goal**: Eliminate the 88% answer leakage rate of standard LLM tutors.
* **Owner**: Jatin (`engine/grade.py` prompt) + Shivank (`api/main.py` response filter).
* **Spec**: The LLM outputs a hidden `"reason"` planning how to guide without giving away code, followed by `"leak_check"`. Server asserts that `correct_line` never leaks.

### Feature 4: 6-Vector Adversarial Robustness Benchmark (Zhao et al. 2026)
* **Goal**: Demonstrate proof of zero answer disclosure under adversarial attacks.
* **Owner**: Shivank (`engine/stress_test.py`).
* **Spec**: Automates 6 attack types (Direct, Emotional, Wrong Answer, Contextual, Interpersonal, Request Shaping) against `/api/submit` and logs 0% leakage for the judges.

---

## 3. Turn-by-Turn Execution Schedule ("The Baton Pass")

```
   TURN 1: SHIVANK (Done) ────► Base skeleton, schemas.py, stub API, Gemini verified
         │
   TURN 2: JATIN        ────► 20 Tasks in data/tasks.json, basic Web UI displaying stub
         │
   TURN 3: SHIVANK      ────► engine/catalogue.py, engine/verify.py, engine/generate.py
         │
   TURN 4: JATIN        ────► engine/grade.py (with CoT), Hypothesis-First UI, 90s nudge
         │
   TURN 5: SHIVANK      ────► engine/seed.py (8 challenges) & engine/stress_test.py
         │
   TURN 6: BOTH         ────► End-to-end integration, gather 10 user attempts, README, Video
```

### Detailed Breakdown of Each Turn:

#### 🏁 Turn 1 (Shivank) — Foundations [COMPLETE]
- Configure Git identity (`ShivankVerma48`).
- Set up `.env` with Gemini API key; write `.gitignore` and `requirements.txt`.
- Author [schemas.py](file:///c:/Users/Shivank%20Verma/OneDrive/Desktop/Folder/Shivank%20files/Research%20for%20Horizon/schemas.py) and [api/main.py](file:///c:/Users/Shivank%20Verma/OneDrive/Desktop/Folder/Shivank%20files/Research%20for%20Horizon/api/main.py) with stub endpoints.
- **Handoff to Jatin**: Run `uvicorn api.main:app --reload` and send Jatin the local URL.

#### 🏁 Turn 2 (Jatin) — Task Corpus & Web UI Shell
- Write 20 varied problem strings in `data/tasks.json`.
- Build `web/index.html`, `web/style.css`, `web/app.js`.
- Connect to `GET /api/challenge`: fetch and render the stub challenge code with numbered lines.
- **Handoff to Shivank**: Jatin confirms the frontend is rendering challenges and ready for interactive inputs.

#### 🏁 Turn 3 (Shivank) — The Generation & Verification Engine
- Build `engine/catalogue.py`: 5 bug types.
- Build `engine/verify.py`: Subprocess test harness (timeout=5s) validating the 4 conditions.
- Build `engine/generate.py`: Structured Gemini prompt + generate-verify retry loop.
- Wire real challenge generator into `GET /api/challenge`.
- **Handoff to Jatin**: Jatin can now request real AI-generated challenges.

#### 🏁 Turn 4 (Jatin) — Grading Engine & Hypothesis-First UI
- Build `engine/grade.py`:
  - Axis 1 detection logic (line number comparison + fixed code re-run).
  - Axis 2 comprehension grading with **Feature 3 Pedagogical CoT** (`reason` + `leak_check`).
- Upgrade `web/`:
  - **Feature 1**: Add Hypothesis-First inputs (`expected_behavior` and `observed_flaw`).
  - **Feature 2**: Add 90s stagnation detector showing G4 concrete tracing tip.
  - Wire submission to `POST /api/submit` and render the 4-badge verdict.
- **Handoff to Shivank**: Full interaction loop ready for load testing and metrics.

#### 🏁 Turn 5 (Shivank) — Seeding & Adversarial Benchmark
- Build `engine/seed.py`: Generate and verify 8 robust challenges into `data/seeded.json`.
- Build `engine/stress_test.py`: Run Zhao et al.'s 6 adversarial attack vectors against the API to prove **Zero Answer Leakage**.
- Update `/api/stats` to report live verification pass rate and 0% adversarial leakage.
- **Handoff to Jatin**: All backend capabilities complete.

#### 🏁 Turn 6 (Both) — Ship & Pitch (Wednesday PM → Thursday)
- **Both**: Have 10 peers/friends complete 1 challenge each to populate `data/attempts.json`.
- **Jatin**: Complete `README.md` highlighting Zhang (2026) and Zhao et al. (2026) citations and metrics.
- **Both**: Record 2–3 minute demo video (Jatin clicks through UI; Shivank narrates the verification harness and zero-leakage defense).
- Submit before Thursday deadline!
