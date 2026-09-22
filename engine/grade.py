"""
Grading Engine for Reverse Code Arena.
Grounded in:
- Section 4 of reverse-code-arena-spec.md (Dual-Axis Scoring)
- Zhang (WSU, 2026) Ch. 3 (Hypothesis evaluation)
- Zhao et al. (EPFL/UTokyo, 2026) (Pedagogical CoT & Zero-Leakage Defense)
"""

import os
import sys
import json
import re
import subprocess
from typing import Dict, Any, Tuple
from dotenv import load_dotenv
from google import genai
from google.genai import types

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from schemas import Challenge, Attempt, Result, DetectionResult, ComprehensionResult
from engine.stress_test import check_answer_leakage

load_dotenv()

FALLBACK_MODELS = [
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3.5-flash",
]

GRADING_PROMPT_TEMPLATE = """You are an expert pedagogical programming evaluator for an educational debugging arena.
A student was reviewing Python code containing a subtle "{bug_type}" bug.

Task Contract: {task_description}
Function Name: {function_name}

Ground Truth Reference:
- Buggy Line Number: {buggy_line_number}
- Actual Flawed Mental Model: "{flawed_assumption}"
- Correct Line: "{correct_line}"

Student Submission:
- Selected Line: {selected_line}
- Student Expected Behavior: "{expected_behavior}"
- Student Observed Flaw: "{observed_flaw}"
- Student Explanation: "{explanation}"
- Student Proposed Fix: "{fixed_code_snippet}"

Evaluation Rubric (Score 0 to 3):
- 3: Deep Understanding. The student accurately articulates the flawed mental assumption (why the author wrote it this way), not just the symptom.
- 2: Mechanism/Symptom Understood. The student correctly explains what went wrong in execution, but doesn't articulate the underlying false assumption.
- 1: Surface or Vague. Vaguely in the right area, or selected the right line for a flawed/coincidental reason.
- 0: Wrong or Empty. Missed the bug entirely, incorrect explanation, or unrelated reasoning.

CRITICAL PEDAGOGICAL & ACTIONABILITY INSTRUCTION (Zhao et al., 2026; Zhang, 2026):
- NEVER give vague generic platitudes (e.g. "Review your code", "Try again", "Keep reading").
- Provide sharp, concrete socratic diagnostic guidance: point out the specific conceptual angle or suggest a concrete input to trace (e.g. "Trace the function with a single-element list or inspect whether the loop reaches the final index"), while strictly keeping the exact correct line of code and the exact buggy line number concealed.
- First produce a hidden 'reason' field planning your pedagogical evaluation.
- Then produce a 'leak_check' confirming no answer disclosure.
- Finally produce 'feedback' for the student: 2-3 sentences of sharp, insightful diagnostic guidance that directs their focus to the exact boundary or false mental rule they missed.

Return ONLY a strict JSON object with this schema:
{{
  "reason": "Internal pedagogical evaluation analysis",
  "leak_check": "Confirmed no correct line or line number disclosed",
  "score": 2,
  "feedback": "Sharp, insightful diagnostic guidance for the student"
}}
"""


def _get_genai_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not set.")
    return genai.Client(api_key=api_key)


def _clean_json(text: str) -> str:
    t = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", t)
    if match:
        return match.group(1).strip()
    return t


def evaluate_student_fix(fixed_code: str, function_name: str, edge_test: Dict[str, Any], timeout_seconds: int = 4) -> bool:
    """
    Subprocess test: checks if student's fixed code actually runs and passes the edge case.
    """
    worker = f"""
import sys, json
try:
    ns = {{}}
    exec('''{fixed_code}''', ns)
    fn = ns.get('{function_name}')
    if not fn or not callable(fn):
        sys.exit(1)
    inp = {json.dumps(edge_test.get('input', []))}
    expected = {json.dumps(edge_test.get('expected'))}
    actual = fn(*inp) if isinstance(inp, list) else fn(inp)
    if actual == expected:
        sys.exit(0)
    else:
        sys.exit(2)
except Exception:
    sys.exit(3)
"""
    try:
        proc = subprocess.run([sys.executable, "-c", worker], capture_output=True, timeout=timeout_seconds)
        return proc.returncode == 0
    except Exception:
        return False


def _heuristic_comprehension_score(attempt: Attempt, challenge: Challenge, line_correct: bool, fix_passes: bool) -> Tuple[int, str]:
    """
    Intelligent heuristic fallback when LLM quota is temporarily paused.
    Analyzes conceptual overlap between student explanation and ground truth assumption,
    and returns a concrete, non-vague diagnostic hint.
    """
    text = f"{attempt.expected_behavior or ''} {attempt.observed_flaw or ''} {attempt.explanation}".lower()
    assumption_words = set(re.findall(r"\b\w{4,}\b", challenge.flawed_assumption.lower()))

    # Check for domain keywords based on bug type
    keywords_by_type = {
        "off_by_one": ["range", "bound", "limit", "last", "minus", "plus", "index", "off by one", "omit", "exclude"],
        "mutable_default": ["mutable", "default", "call", "persist", "accumulate", "shared", "twice", "state"],
        "shallow_copy": ["shallow", "copy", "nested", "inner", "reference", "mutate", "duplicate"],
        "int_division": ["division", "float", "truncate", "floor", "rounding", "precision", "slash"],
        "boundary_inclusive": ["greater", "equal", "strictly", "inclusive", "threshold", "cutoff", "boundary"],
    }

    diagnostic_clues = {
        "off_by_one": "Inspect the loop boundary logic. In Python, range(n) stops at n-1. When an author writes range(len - 1), trace what index is reached on the final iteration.",
        "mutable_default": "Look at the function signature parameters. Default argument objects are created once at definition time, not on each call.",
        "shallow_copy": "Trace how mutations to nested elements affect both copies. Slicing or shallow-copying only duplicates the outer container.",
        "int_division": "Examine the division operator. Integer division truncates down, discarding fractional portions.",
        "boundary_inclusive": "Analyze the comparison operator at the boundary condition. Does the contract specify strictly greater than, or should exact boundary matches be retained?",
    }
    clue = diagnostic_clues.get(challenge.bug_type, "Trace intermediate variable states with a boundary case like an empty or edge-value input.")

    type_kw = keywords_by_type.get(challenge.bug_type, ["loop", "condition", "return"])
    matched_type_kw = [kw for kw in type_kw if kw in text]
    matched_assumption_words = [w for w in assumption_words if w in text]

    if line_correct or fix_passes:
        if len(matched_assumption_words) >= 2 or len(matched_type_kw) >= 2:
            return 3, f"Accurate Diagnosis! You identified the exact fault and articulated the author's false assumption. {clue}"
        elif len(matched_type_kw) >= 1 or len(matched_assumption_words) >= 1:
            return 2, f"Mechanism Understood: You caught the defect symptom, but haven't fully articulated the author's underlying misconception. {clue}"
        else:
            return 1, f"Copilot-Style Patch: You located the line or fix, but missed the underlying mental model. {clue}"
    else:
        if len(matched_type_kw) >= 2:
            return 1, f"Conceptual Catch, Misplaced Line: You recognized the bug category, but pinpointed the wrong code statement. {clue}"
        return 0, f"Unidentified Defect: Neither the line nor the explanation captured the bug. {clue}"


def grade_attempt(attempt: Attempt, challenge: Challenge) -> Result:
    """
    Dual-Axis evaluation:
    - Axis 1: Deterministic detection (line number comparison + fix testing)
    - Axis 2: Pedagogical LLM comprehension grading with anti-leakage CoT
    """
    # 1. Axis 1: Detection
    line_correct = (attempt.selected_line == challenge.buggy_line_number)
    near_miss = (abs(attempt.selected_line - challenge.buggy_line_number) == 1)

    # Re-run edge test on student's proposed code
    fix_passes = False
    if attempt.fixed_code and len(attempt.fixed_code.strip()) > 10:
        edge_data = challenge.edge_case_test.model_dump() if hasattr(challenge.edge_case_test, "model_dump") else challenge.edge_case_test
        fix_passes = evaluate_student_fix(
            fixed_code=attempt.fixed_code,
            function_name=challenge.function_name,
            edge_test=edge_data,
        )

    # 2. Axis 2: Comprehension via Gemini (with heuristic fallback)
    score = None
    feedback = ""
    reason = "Pedagogical evaluation."
    leak_check = "Verified."

    try:
        client = _get_genai_client()
        prompt = GRADING_PROMPT_TEMPLATE.format(
            bug_type=challenge.bug_type,
            task_description=challenge.task_description,
            function_name=challenge.function_name,
            buggy_line_number=challenge.buggy_line_number,
            flawed_assumption=challenge.flawed_assumption,
            correct_line=challenge.correct_line,
            selected_line=attempt.selected_line,
            expected_behavior=attempt.expected_behavior or "Not specified",
            observed_flaw=attempt.observed_flaw or "Not specified",
            explanation=attempt.explanation,
            fixed_code_snippet=attempt.fixed_code[:300] if attempt.fixed_code else "None",
        )

        for model_name in FALLBACK_MODELS:
            try:
                resp = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.2,
                    ),
                )
                if resp.text:
                    parsed = json.loads(_clean_json(resp.text))
                    score = int(parsed.get("score", 0))
                    feedback = parsed.get("feedback", "")
                    reason = parsed.get("reason", "")
                    leak_check = parsed.get("leak_check", "")
                    break
            except Exception:
                continue

    except Exception as e:
        print(f"[engine.grade] API error: {e}")

    # If LLM didn't return (e.g. rate limit), apply intelligent semantic heuristic
    if score is None:
        score, feedback = _heuristic_comprehension_score(attempt, challenge, line_correct, fix_passes)
        reason = "Heuristic semantic model applied due to rate-limit fallback."

    # 3. Security Guard: Check for accidental leakage in feedback
    leak_res = check_answer_leakage(feedback, challenge)
    if leak_res["is_leaked"]:
        print("[engine.grade] WARNING: Leakage detected in generated feedback! Intercepting...")
        feedback = "Your submission has been evaluated. Review how the function handles edge boundary values."

    # 4. Compute Verdict
    found = line_correct or fix_passes
    understood = (score >= 2)

    if found and understood:
        verdict = "found_and_understood"
    elif found and not understood:
        verdict = "found_not_understood"  # The Copilot trap
    elif not found and understood:
        verdict = "not_found_but_understood"
    else:
        verdict = "neither"

    return Result(
        detection=DetectionResult(
            line_correct=line_correct,
            near_miss=near_miss,
            fix_passes=fix_passes,
        ),
        comprehension=ComprehensionResult(
            score=score,
            feedback=feedback,
            reason=reason,
            leak_check=leak_check,
        ),
        verdict=verdict,
    )
