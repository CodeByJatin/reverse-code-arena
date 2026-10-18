"""
Deterministic Sandbox Grading Engine for Reverse Code Arena.
Evaluates student code fixes directly in a secure Python subprocess sandbox.
No LLM dependencies, zero latency (< 30ms), 100% deterministic test suite execution.
"""

import os
import sys
import json
import subprocess
from typing import Dict, Any, List, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from schemas import Challenge, Attempt, Result, DetectionResult, ComprehensionResult, TestDetail

EVAL_WORKER = """
import sys, json

try:
    payload = json.loads(sys.stdin.read())
    code = payload["code"]
    fn_name = payload["function_name"]
    tests = payload.get("tests", [])

    ns = {}
    try:
        exec(code, ns)
    except Exception as exec_err:
        res = {
            "all_passed": False,
            "error": f"Compilation/Syntax Error: {type(exec_err).__name__}: {str(exec_err)}",
            "details": []
        }
        sys.stdout.write(json.dumps(res))
        sys.exit(0)

    fn = ns.get(fn_name)
    if not fn or not callable(fn):
        res = {
            "all_passed": False,
            "error": f"Function '{fn_name}' was not defined or is not callable in submitted code.",
            "details": []
        }
        sys.stdout.write(json.dumps(res))
        sys.exit(0)

    details = []
    all_passed = True
    for t in tests:
        name = t.get("name", "Test")
        inp = t.get("input", [])
        expected = t.get("expected")
        try:
            actual = fn(*inp) if isinstance(inp, list) else fn(inp)
            passed = (actual == expected)
            if not passed:
                all_passed = False
            details.append({
                "name": name,
                "input": inp,
                "expected": expected,
                "actual": actual,
                "passed": passed,
                "error": None
            })
        except Exception as call_err:
            all_passed = False
            details.append({
                "name": name,
                "input": inp,
                "expected": expected,
                "actual": None,
                "passed": False,
                "error": f"{type(call_err).__name__}: {str(call_err)}"
            })

    res = {
        "all_passed": all_passed,
        "error": None,
        "details": details
    }
    sys.stdout.write(json.dumps(res))
except Exception as outer_err:
    res = {
        "all_passed": False,
        "error": f"Worker Exception: {type(outer_err).__name__}: {str(outer_err)}",
        "details": []
    }
    sys.stdout.write(json.dumps(res))
"""


def prepare_runnable_code(fixed_code: Optional[str], challenge: Challenge, target_line: Optional[int] = None) -> str:
    """
    If fixed_code is full Python code defining the function, returns it directly.
    If it is a 1-line replacement snippet, substitutes it into challenge.code at the target line.
    If empty, returns the original buggy challenge.code.
    """
    if not fixed_code or not fixed_code.strip():
        return challenge.code
    
    clean = fixed_code.strip()
    # If the user submitted a full function definition or multi-line block with def
    if f"def {challenge.function_name}" in clean:
        return fixed_code
    
    # 1-line substitution into original code
    lines = challenge.code.splitlines()
    line_idx = (target_line - 1) if (target_line and 1 <= target_line <= len(lines)) else (challenge.buggy_line_number - 1)
    if 0 <= line_idx < len(lines):
        orig_indent = len(lines[line_idx]) - len(lines[line_idx].lstrip())
        sub_line = (" " * orig_indent) + clean
        lines[line_idx] = sub_line
        return "\n".join(lines)
    
    return challenge.code


def evaluate_student_tests(code: str, function_name: str, tests: List[Dict[str, Any]], timeout_seconds: int = 4) -> Dict[str, Any]:
    """Runs student code against all test cases in an isolated subprocess."""
    try:
        payload = json.dumps({
            "code": code,
            "function_name": function_name,
            "tests": tests,
        })
        proc = subprocess.run(
            [sys.executable, "-c", EVAL_WORKER],
            input=payload,
            text=True,
            capture_output=True,
            timeout=timeout_seconds,
        )
        if proc.stdout.strip():
            return json.loads(proc.stdout.strip())
        return {
            "all_passed": False,
            "error": proc.stderr.strip() or "Process exited without output.",
            "details": []
        }
    except subprocess.TimeoutExpired:
        return {
            "all_passed": False,
            "error": f"Execution timed out (> {timeout_seconds}s). Check for infinite loops or heavy recursion.",
            "details": []
        }
    except Exception as e:
        return {
            "all_passed": False,
            "error": f"Sandbox execution failure: {str(e)}",
            "details": []
        }


def grade_attempt(attempt: Attempt, challenge: Challenge) -> Result:
    """
    Evaluates student submission purely by sandbox test execution.
    - Full marks (passed = True, score = 100) if code compiles and all unit & edge tests pass.
    - Zero marks (passed = False, score = 0) if any test fails or error occurs.
    """
    # 1. Prepare runnable code
    code = prepare_runnable_code(attempt.fixed_code, challenge, attempt.selected_line)

    # 2. Assemble test suite: baseline passing tests + edge case test
    all_tests = []
    if hasattr(challenge, "passing_tests") and challenge.passing_tests:
        for idx, pt in enumerate(challenge.passing_tests):
            pt_data = pt.model_dump() if hasattr(pt, "model_dump") else pt
            all_tests.append({
                "name": f"Baseline Test {idx + 1}",
                "input": pt_data.get("input", []),
                "expected": pt_data.get("expected"),
            })
    
    edge_data = challenge.edge_case_test.model_dump() if hasattr(challenge.edge_case_test, "model_dump") else challenge.edge_case_test
    all_tests.append({
        "name": "Edge-Case Test (Bug Trigger)",
        "input": edge_data.get("input", []),
        "expected": edge_data.get("expected"),
    })

    # 3. Execute in subprocess sandbox
    eval_res = evaluate_student_tests(code, challenge.function_name, all_tests)
    all_passed = bool(eval_res.get("all_passed", False))
    raw_details = eval_res.get("details", [])
    error_msg = eval_res.get("error")

    # Format structured test details
    formatted_details: List[TestDetail] = []
    tests_passed = 0
    first_failure = None

    for d in raw_details:
        td = TestDetail(
            name=d.get("name", "Test"),
            input=d.get("input"),
            expected=d.get("expected"),
            actual=d.get("actual"),
            passed=bool(d.get("passed", False)),
            error=d.get("error"),
        )
        if td.passed:
            tests_passed += 1
        elif not first_failure:
            first_failure = td
        formatted_details.append(td)

    total_tests = len(all_tests)

    # 4. Points calculation based on difficulty and hint penalties
    difficulty = getattr(challenge, "difficulty", "easy").lower()
    if difficulty == "hard":
        base_points = getattr(challenge, "base_points", 80) or 80
        default_penalties = [12, 25, 25]
        min_points = 18
    elif difficulty in ("medium", "med"):
        base_points = getattr(challenge, "base_points", 50) or 50
        default_penalties = [8, 15, 15]
        min_points = 12
    else:
        base_points = getattr(challenge, "base_points", 30) or 30
        default_penalties = [5, 10, 10]
        min_points = 5

    hints_unlocked = getattr(attempt, "hints_unlocked", 0) or 0
    hints_list = getattr(challenge, "hints", []) or []

    total_penalty = 0
    for i in range(min(hints_unlocked, 3)):
        if i < len(hints_list) and hasattr(hints_list[i], "penalty") and hints_list[i].penalty:
            total_penalty += hints_list[i].penalty
        elif i < len(default_penalties):
            total_penalty += default_penalties[i]

    if all_passed:
        points_earned = max(min_points, base_points - total_penalty)
        score = 100
        verdict = "found_and_understood"
        feedback = f"All {total_tests} test cases passed! +{points_earned} points earned."
    else:
        points_earned = 0
        score = 0
        verdict = "neither"
        if error_msg:
            feedback = error_msg
        elif first_failure:
            if first_failure.error:
                feedback = f"Error on {first_failure.name}: {first_failure.error}"
            else:
                feedback = (
                    f"Failed on {first_failure.name} with input {first_failure.input}. "
                    f"Expected: {first_failure.expected}, Got: {first_failure.actual}."
                )
        else:
            feedback = "Code failed to pass the required test suite."

    return Result(
        passed=all_passed,
        score=score,
        points_earned=points_earned,
        base_points=base_points,
        tests_passed=tests_passed,
        total_tests=total_tests,
        feedback=feedback,
        error_message=error_msg,
        test_details=formatted_details,
        verdict=verdict,
        detection=DetectionResult(
            line_correct=all_passed,
            near_miss=False,
            fix_passes=all_passed,
        ),
        comprehension=ComprehensionResult(
            score=3 if all_passed else 0,
            feedback=feedback,
            reason="Sandbox unit test execution.",
            leak_check="Deterministic code test.",
        ),
    )
