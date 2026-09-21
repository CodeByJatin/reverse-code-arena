# Reverse Code Arena — Build Spec

Deadline: Sept 25. Build order in this file matches risk order — do Section 3 (verification harness) first, because if it doesn't work, nothing else matters.

---

## 1. Bug Catalogue

Ten bug types. Each is chosen because it (a) survives a naive test, (b) fails a specific edge case, (c) maps to a nameable *flawed assumption* you can grade an explanation against.

| id | Bug type | Flawed assumption being tested | Edge case that exposes it |
|---|---|---|---|
| `off_by_one` | Loop bound off by one | "range covers the last element" | Last element / single-element input |
| `mutable_default` | Mutable default argument (`def f(x, acc=[])`) | "Default args are re-created each call" | Calling the function twice |
| `shallow_copy` | `list(x)` / `x[:]` on nested structure | "Copying the outer list copies inner ones" | Mutating a nested element |
| `int_division` | `/` vs `//`, or truncation before rounding | "Division returns what I expect" | Values that don't divide evenly |
| `empty_input` | No guard for empty collection | "Input always has ≥1 element" | `[]`, `""`, `{}` |
| `float_equality` | `==` on floats, or accumulating float error | "Float arithmetic is exact" | `0.1 + 0.2`, long summations |
| `mutation_during_iteration` | Removing from a list while looping over it | "The iterator is stable" | Two adjacent removable items |
| `early_return` | `return` inside loop that should be after | "First match is the only match" | Multiple matches |
| `boundary_inclusive` | `<` vs `<=` in a range/threshold check | "Boundary belongs on the other side" | Value exactly at boundary |
| `sort_stability` | Assumes sort is by the key you think | "Sorting tuples sorts by field I care about" | Ties on the first field |

Start with 5 for the MVP (`off_by_one`, `mutable_default`, `empty_input`, `int_division`, `boundary_inclusive`) — they're the easiest to verify programmatically. Add the rest if time allows.

---

## 2. Generation: prompt + JSON schema

Never let the model freely "add a bug." Always specify the type. Request structured output.

### Schema the model must return

```json
{
  "function_name": "string",
  "code": "string  // full runnable Python, 15-30 lines, no imports beyond stdlib",
  "docstring_spec": "string  // plain-English contract the function is SUPPOSED to satisfy",
  "buggy_line_number": 0,
  "bug_type": "off_by_one",
  "flawed_assumption": "string  // one sentence, the mental error the author made",
  "passing_tests": [
    {"input": "…", "expected": "…"}
  ],
  "edge_case_test": {"input": "…", "expected": "…"},
  "correct_line": "string  // the single line that replaces the buggy one"
}
```

### Generation prompt

```
You are generating a code-review exercise for a programming student.

Write a single Python function that implements this task: {TASK}

Requirements:
- 15-30 lines, standard library only, no classes.
- The code must be syntactically valid and RUN without errors.
- Introduce exactly ONE bug of type: {BUG_TYPE} — {BUG_TYPE_DESCRIPTION}
- The bug must be SUBTLE: the code should read as plausible, competent work.
  Do not add comments hinting at the bug. Do not name variables suggestively.
- The function MUST return correct output for the `passing_tests` you provide
  (at least 3 of them, covering typical inputs).
- The function MUST return incorrect output for `edge_case_test`.
- The fix must be a change to exactly ONE line.

Return ONLY valid JSON matching this schema, no markdown fences:
{SCHEMA}
```

Keep a list of ~20 `TASK` strings (e.g. "find the median of a list", "merge two sorted lists", "count word frequencies", "compute a running average", "validate a date range"). Pair them randomly with bug types at generation time — that's your content engine.

---

## 3. Verification Harness — BUILD THIS FIRST

The LLM will frequently produce code where the bug doesn't actually trigger, or where it breaks the passing tests too. You must verify before showing anything to a student. This is the component that makes your project a system rather than a wrapper.

```python
def verify_challenge(ch) -> bool:
    ns = {}
    try:
        exec(ch["code"], ns)              # 1. it must run
    except Exception:
        return False
    fn = ns.get(ch["function_name"])
    if fn is None:
        return False

    # 2. all passing_tests must PASS (bug is hidden)
    for t in ch["passing_tests"]:
        try:
            if fn(*t["input"]) != t["expected"]:
                return False
        except Exception:
            return False

    # 3. edge_case_test must FAIL (bug is real)
    e = ch["edge_case_test"]
    try:
        if fn(*e["input"]) == e["expected"]:
            return False        # bug didn't trigger -> reject
    except Exception:
        pass                    # crashing on the edge case also counts as failing

    # 4. applying correct_line must make the edge case PASS
    fixed = ch["code"].splitlines()
    fixed[ch["buggy_line_number"] - 1] = ch["correct_line"]
    ns2 = {}
    try:
        exec("\n".join(fixed), ns2)
        if ns2[ch["function_name"]](*e["input"]) != e["expected"]:
            return False
    except Exception:
        return False

    return True
```

Loop: generate → verify → if `False`, regenerate (max 3 attempts, then fall back to a seeded challenge).

**Run all of this in a subprocess with a timeout** (`subprocess.run(..., timeout=5)`) so an accidental infinite loop can't hang your server. Full sandboxing is out of scope for a 4-day MVP — say so honestly in your README rather than pretending otherwise.

**Log your verification pass rate.** "Raw LLM generation produced a valid exercise 41% of the time; our verify-and-regenerate loop brings it to 100%" is a real, measurable number — that single stat is your strongest judging asset.

---

## 4. Scoring: two axes

This is your differentiation. Grade detection and comprehension separately.

**Axis 1 — Detection (deterministic, no LLM):**
- Correct line identified: exact line = full, ±1 line = partial
- Fix applied: re-run `edge_case_test` against the student's edited code. Pass/fail.

**Axis 2 — Comprehension (LLM-graded against known ground truth):**

You already have `flawed_assumption` from generation, so the grader isn't guessing — it's comparing against a known answer. That's what keeps it from being hand-wavy.

```
The student was reviewing code containing a {BUG_TYPE} bug.
The actual flawed assumption was: "{FLAWED_ASSUMPTION}"
The student wrote: "{STUDENT_EXPLANATION}"

Score 0-3:
3 = identifies the same underlying assumption, in their own words
2 = correct symptom, but describes what breaks rather than why
1 = vaguely in the right area, or correct line for the wrong reason
0 = wrong or empty

Return JSON: {"score": n, "one_line_feedback": "..."}
```

The interesting result — and the thing to show judges — is the **gap between the two axes**: students who fix the bug but score 0–1 on explanation. That's "passed the test without understanding," which is exactly the problem you claim to be attacking. Surface it explicitly in the UI as something like *Found it ✓ / Understood it ✗*.

---

## 5. Demo fallback

Pre-generate and verify 8 challenges, commit them as JSON, and have the app load those if the API errors. Record your video against the seeded set. Never demo live generation as the only path.

---

## 6. What to say in the README / writeup

- Problem: students trained to *write* code from blank editors, not *read* and audit it; Copilot-era codegen removes the generation step but not the need for comprehension.
- Mechanism (not a wrapper): constrained bug injection from a typed catalogue + programmatic verification that the bug is real and hidden + dual-axis scoring that separates fixing from understanding.
- Measurable claim: verification pass-rate before/after the harness; and detection-vs-comprehension gap across test users (even n=10 friends is real data — collect it Thursday).
- Honest limitations: Python-only, single-line fixes, no sandboxing, small bug catalogue, no longitudinal validation.

---

## 7. Four-day order

- **Mon (today):** bug catalogue → generation prompt → verification harness → seed 8 challenges. Nothing else.
- **Tue:** frontend: code viewer with line-click, explanation box, submit, results.
- **Wed:** comprehension grader, dual-axis results screen, collect n≈10 friend data points.
- **Thu:** README, deploy, record 2–3 min video, submit. No new features.
