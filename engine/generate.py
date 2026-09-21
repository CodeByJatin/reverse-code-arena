"""
Challenge Generator for Reverse Code Arena.
Grounded in Section 2 & 3 of reverse-code-arena-spec.md.

Prompts Gemini with structured JSON schema, then validates via engine/verify.py.
Retries up to max_retries if verification fails.
"""

import os
import json
import uuid
import re
from typing import Optional, Dict, Any, Tuple, List
from dotenv import load_dotenv
from google import genai
from google.genai import types

from schemas import Challenge, TestCase
from engine.catalogue import get_bug_type
from engine.verify import verify_challenge, VerificationResult

load_dotenv()

# Global generation log for audit stats
GENERATION_LOGS = {
    "total_attempts": 0,
    "successful_challenges": 0,
    "gate_failures": {},
}

# Candidate models in order of preference
FALLBACK_MODELS = [
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
]


def _get_genai_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not set in environment or .env file.")
    return genai.Client(api_key=api_key)


SYSTEM_PROMPT_TEMPLATE = """You are generating an educational code-review exercise for a programming student.
Write a single Python function that implements this task: {task}

Requirements:
- 15 to 30 lines of code, Python 3 standard library only, NO external imports, NO classes.
- The code must be syntactically valid and RUN without syntax errors.
- Introduce exactly ONE bug of type: "{bug_type}"
  Bug description: {bug_description}
  Flawed mental assumption: {flawed_assumption}
  Edge case trigger: {edge_case_trigger}
- The bug must be SUBTLE: the code should look plausible and competent.
  Do NOT add comments hinting at the bug.
  Do NOT name variables suggestively (like 'buggy_index').
- The function MUST return correct output for passing_tests (provide at least 3 varied typical test cases).
- The function MUST return INCORRECT output or crash for edge_case_test (the bug MUST trigger on this test).
- The fix MUST be a change to exactly ONE line.
- Provide correct_line which is the single exact line of code that replaces buggy_line_number so that BOTH edge_case_test AND all passing_tests PASS.

You must respond with ONLY a valid JSON object matching this schema:
{{
  "function_name": "name_of_function",
  "code": "def name_of_function(...):\\n    ...",
  "docstring_spec": "Brief plain-English contract the function is supposed to satisfy",
  "buggy_line_number": 5,
  "bug_type": "{bug_type}",
  "flawed_assumption": "{flawed_assumption}",
  "passing_tests": [
    {{"input": [arg1, arg2], "expected": result1}},
    {{"input": [arg3, arg4], "expected": result2}},
    {{"input": [arg5, arg6], "expected": result3}}
  ],
  "edge_case_test": {{"input": [edge_arg1], "expected": expected_edge_result}},
  "correct_line": "    replacement line of code"
}}
"""


def _clean_json_response(raw_text: str) -> str:
    """Strip markdown code fences if present."""
    text = raw_text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        return match.group(1).strip()
    return text


def generate_challenge(
    task: str,
    bug_type: str,
    preferred_model: str = "gemini-3.5-flash",
    max_retries: int = 3,
) -> Tuple[Optional[Challenge], Dict[str, Any]]:
    """
    Generates a verified Challenge using Gemini and the verification harness.
    Retries up to max_retries if verification fails.
    """
    client = _get_genai_client()
    bug_info = get_bug_type(bug_type)

    base_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        task=task,
        bug_type=bug_type,
        bug_description=bug_info["description"],
        flawed_assumption=bug_info["flawed_assumption"],
        edge_case_trigger=bug_info["edge_case_trigger"],
    )

    current_prompt = base_prompt
    attempts_history = []

    models_to_try = [preferred_model] + [m for m in FALLBACK_MODELS if m != preferred_model]

    for attempt_idx in range(1, max_retries + 1):
        GENERATION_LOGS["total_attempts"] += 1
        print(f"[engine.generate] Attempt {attempt_idx}/{max_retries} for task='{task}' bug='{bug_type}'...")

        raw_content = ""
        model_used = ""
        for candidate_model in models_to_try:
            try:
                response = client.models.generate_content(
                    model=candidate_model,
                    contents=current_prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.3,
                    ),
                )
                raw_content = response.text or ""
                model_used = candidate_model
                break
            except Exception as api_err:
                print(f"[engine.generate] Model {candidate_model} unavailable ({type(api_err).__name__}). Trying fallback...")

        if not raw_content:
            print(f"[engine.generate] All models failed on attempt {attempt_idx}.")
            attempts_history.append({"attempt": attempt_idx, "error": "All models unavailable"})
            continue

        try:
            cleaned_json = _clean_json_response(raw_content)
            data = json.loads(cleaned_json)

            code = data.get("code", "")
            lines = code.splitlines()
            data["num_lines"] = len(lines)
            data["id"] = f"ch_{bug_type}_{uuid.uuid4().hex[:6]}"
            if "task_description" not in data:
                data["task_description"] = data.get("docstring_spec") or task

            # Run programmatic verification harness
            v_res = verify_challenge(data)

            if v_res.verified:
                print(f"[engine.generate] [PASS] Verified on attempt {attempt_idx} (model: {model_used})!")
                GENERATION_LOGS["successful_challenges"] += 1
                challenge_obj = Challenge(**data)
                return challenge_obj, {
                    "attempts": attempt_idx,
                    "verified": True,
                    "model_used": model_used,
                    "history": attempts_history,
                }
            else:
                fail_msg = f"{v_res.gate_failed}: {v_res.error_detail}"
                print(f"[engine.generate] [REJECT] Attempt {attempt_idx}: {fail_msg}")
                attempts_history.append({"attempt": attempt_idx, "error": fail_msg})
                GENERATION_LOGS["gate_failures"][v_res.gate_failed] = (
                    GENERATION_LOGS["gate_failures"].get(v_res.gate_failed, 0) + 1
                )

                # Feed verification error back to Gemini for the next attempt
                current_prompt = (
                    base_prompt
                    + f"\n\nPREVIOUS ATTEMPT FAILED VERIFICATION:\n{fail_msg}\n"
                    + "Please fix this discrepancy in your new generation so all 4 verification gates pass."
                )

        except Exception as e:
            err_msg = f"Generation/Parse error: {str(e)}"
            print(f"[engine.generate] [ERROR] Attempt {attempt_idx}: {err_msg}")
            attempts_history.append({"attempt": attempt_idx, "error": err_msg})

    print(f"[engine.generate] Exceeded {max_retries} retries for task='{task}'.")
    return None, {
        "attempts": max_retries,
        "verified": False,
        "history": attempts_history,
    }
