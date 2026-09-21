"""
Verification Harness for Reverse Code Arena.
Grounded in Section 3 of reverse-code-arena-spec.md.

Runs 4 programmatic gates in a subprocess with a 5-second timeout:
1. Gate 1: Code compiles and runs without syntax/runtime errors.
2. Gate 2: All passing_tests pass (bug is hidden on typical inputs).
3. Gate 3: edge_case_test fails or raises an exception (bug is real).
4. Gate 4: Applying correct_line at buggy_line_number makes edge_case_test (and passing_tests) PASS.
"""

import json
import subprocess
import sys
from typing import Dict, Any, Tuple
from pydantic import BaseModel


class VerificationResult(BaseModel):
    verified: bool
    gate_passed: int  # 0 to 4
    gate_failed: str = ""
    error_detail: str = ""


WORKER_SCRIPT = """
import sys
import json

def run_verification():
    try:
        data = json.loads(sys.stdin.read())
    except Exception as e:
        print(json.dumps({"verified": False, "gate_passed": 0, "gate_failed": "JSON parse error", "error_detail": str(e)}))
        return

    code = data.get("code", "")
    fn_name = data.get("function_name", "")
    passing_tests = data.get("passing_tests", [])
    edge_test = data.get("edge_case_test", {})
    buggy_line_number = data.get("buggy_line_number", 0)
    correct_line = data.get("correct_line", "")

    # Gate 1: Code runs and defines function
    ns = {}
    try:
        exec(code, ns)
    except Exception as e:
        print(json.dumps({"verified": False, "gate_passed": 0, "gate_failed": "Gate 1: Code execution failed", "error_detail": f"{type(e).__name__}: {str(e)}"}))
        return

    fn = ns.get(fn_name)
    if fn is None or not callable(fn):
        print(json.dumps({"verified": False, "gate_passed": 0, "gate_failed": "Gate 1: Function name not defined or not callable", "error_detail": f"'{fn_name}' not found"}))
        return

    # Gate 2: All passing_tests must PASS
    for idx, t in enumerate(passing_tests):
        inp = t.get("input", [])
        expected = t.get("expected")
        try:
            # Handle function arguments unpack
            actual = fn(*inp) if isinstance(inp, list) else fn(inp)
            if actual != expected:
                print(json.dumps({"verified": False, "gate_passed": 1, "gate_failed": f"Gate 2: Passing test {idx+1} failed", "error_detail": f"Input: {inp}, Expected: {expected}, Got: {actual}"}))
                return
        except Exception as e:
            print(json.dumps({"verified": False, "gate_passed": 1, "gate_failed": f"Gate 2: Passing test {idx+1} raised exception", "error_detail": f"{type(e).__name__}: {str(e)}"}))
            return

    # Gate 3: edge_case_test must FAIL (or crash)
    e_inp = edge_test.get("input", [])
    e_expected = edge_test.get("expected")
    edge_failed = False
    try:
        e_actual = fn(*e_inp) if isinstance(e_inp, list) else fn(e_inp)
        if e_actual != e_expected:
            edge_failed = True  # Output mismatch: bug triggered successfully!
    except Exception:
        edge_failed = True  # Exception on edge case also counts as bug triggering!

    if not edge_failed:
        print(json.dumps({"verified": False, "gate_passed": 2, "gate_failed": "Gate 3: Edge case passed on buggy code (bug did not trigger)", "error_detail": f"Expected failure on edge case {e_inp}"}))
        return

    # Gate 4: Applying correct_line must make the edge case PASS
    lines = code.splitlines()
    if buggy_line_number < 1 or buggy_line_number > len(lines):
        print(json.dumps({"verified": False, "gate_passed": 3, "gate_failed": "Gate 4: buggy_line_number out of range", "error_detail": f"Line {buggy_line_number} not in range 1..{len(lines)}"}))
        return

    lines[buggy_line_number - 1] = correct_line
    fixed_code = "\\n".join(lines)

    ns_fixed = {}
    try:
        exec(fixed_code, ns_fixed)
    except Exception as e:
        print(json.dumps({"verified": False, "gate_passed": 3, "gate_failed": "Gate 4: Fixed code execution failed", "error_detail": f"{type(e).__name__}: {str(e)}"}))
        return

    fn_fixed = ns_fixed.get(fn_name)
    if fn_fixed is None or not callable(fn_fixed):
        print(json.dumps({"verified": False, "gate_passed": 3, "gate_failed": "Gate 4: Fixed function not callable", "error_detail": f"'{fn_name}' missing in fixed code"}))
        return

    try:
        fixed_actual = fn_fixed(*e_inp) if isinstance(e_inp, list) else fn_fixed(e_inp)
        if fixed_actual != e_expected:
            print(json.dumps({"verified": False, "gate_passed": 3, "gate_failed": "Gate 4: Fixed code failed edge case", "error_detail": f"Expected {e_expected}, Got {fixed_actual}"}))
            return
    except Exception as e:
        print(json.dumps({"verified": False, "gate_passed": 3, "gate_failed": "Gate 4: Fixed code crashed on edge case", "error_detail": f"{type(e).__name__}: {str(e)}"}))
        return

    # Also verify that fixed code still passes all normal tests
    for idx, t in enumerate(passing_tests):
        inp = t.get("input", [])
        expected = t.get("expected")
        try:
            actual = fn_fixed(*inp) if isinstance(inp, list) else fn_fixed(inp)
            if actual != expected:
                print(json.dumps({"verified": False, "gate_passed": 3, "gate_failed": f"Gate 4: Fix broke passing test {idx+1}", "error_detail": f"Input: {inp}, Expected: {expected}, Got: {actual}"}))
                return
        except Exception as e:
            print(json.dumps({"verified": False, "gate_passed": 3, "gate_failed": f"Gate 4: Fix caused exception on passing test {idx+1}", "error_detail": f"{type(e).__name__}: {str(e)}"}))
            return

    # All 4 gates passed!
    print(json.dumps({"verified": True, "gate_passed": 4, "gate_failed": "", "error_detail": ""}))

if __name__ == "__main__":
    run_verification()
"""


def verify_challenge(challenge_dict: Dict[str, Any], timeout_seconds: int = 5) -> VerificationResult:
    """
    Verifies a challenge dictionary against the 4 gates using an isolated subprocess.
    """
    try:
        proc = subprocess.run(
            [sys.executable, "-c", WORKER_SCRIPT],
            input=json.dumps(challenge_dict),
            text=True,
            capture_output=True,
            timeout=timeout_seconds,
        )
        if proc.returncode != 0:
            return VerificationResult(
                verified=False,
                gate_passed=0,
                gate_failed="Subprocess execution error",
                error_detail=proc.stderr.strip()[:300],
            )
        stdout = proc.stdout.strip()
        result_data = json.loads(stdout)
        return VerificationResult(**result_data)
    except subprocess.TimeoutExpired:
        return VerificationResult(
            verified=False,
            gate_passed=0,
            gate_failed="Gate 1: Timeout (Code exceeded 5s limit)",
            error_detail="Execution timed out, potential infinite loop.",
        )
    except Exception as e:
        return VerificationResult(
            verified=False,
            gate_passed=0,
            gate_failed="Verification harness exception",
            error_detail=str(e),
        )
