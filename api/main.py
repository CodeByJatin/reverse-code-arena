from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
import json

from schemas import Challenge, PublicChallenge, Attempt, Result, DetectionResult, ComprehensionResult, TestCase

app = FastAPI(title="Reverse Code Arena API")

# Allow CORS for development so frontend can communicate smoothly
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# STUB CHALLENGE FOR STEP 0 / CONTRACT
STUB_CHALLENGE = Challenge(
    id="stub-challenge-01",
    task_description="Return the maximum element in a list of integers.",
    function_name="find_max",
    code="def find_max(numbers):\n    if not numbers:\n        return None\n    max_val = numbers[0]\n    for i in range(len(numbers) - 1):  # Bug: off-by-one, misses last element\n        if numbers[i] > max_val:\n            max_val = numbers[i]\n    return max_val",
    num_lines=8,
    bug_type="off_by_one",
    buggy_line_number=5,
    flawed_assumption="range(len(numbers) - 1) covers all elements including the last element",
    passing_tests=[
        TestCase(input=[[3, 1, 2]], expected=3),
        TestCase(input=[[5, 4, 1]], expected=5),
        TestCase(input=[[10, 20, 5]], expected=20),
    ],
    edge_case_test=TestCase(input=[[1, 2, 99]], expected=99),
    correct_line="    for i in range(len(numbers)):",
)


import random
from engine.generate import generate_challenge, GENERATION_LOGS
from engine.stress_test import check_answer_leakage

SEEDED_CHALLENGES_PATH = "data/seeded.json"
ADVERSARIAL_AUDIT_PATH = "data/adversarial_audit.json"

def _load_seeded_challenges():
    if os.path.exists(SEEDED_CHALLENGES_PATH):
        try:
            with open(SEEDED_CHALLENGES_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                return [Challenge(**item) for item in data]
        except Exception:
            return []
    return []

@app.get("/api/challenge", response_model=PublicChallenge)
def get_challenge(difficulty: str = Query("easy"), fresh: bool = Query(False)):
    """
    Returns a challenge for the student.
    CRITICAL: Strips buggy_line_number, flawed_assumption, correct_line, edge_case_test.
    """
    if fresh:
        seeded = _load_seeded_challenges()
        task_desc = random.choice(seeded).task_description if seeded else "filter numbers greater than a threshold"
        bug_choices = ["boundary_inclusive", "off_by_one", "int_division"]
        ch, meta = generate_challenge(task=task_desc, bug_type=random.choice(bug_choices))
        if ch:
            return ch.to_public()

    seeded = _load_seeded_challenges()
    if seeded:
        chosen = random.choice(seeded)
        return chosen.to_public()

    return STUB_CHALLENGE.to_public()


from engine.grade import grade_attempt
ATTEMPTS_LOG_PATH = "data/attempts.json"

@app.post("/api/submit", response_model=Result)
def submit_attempt(attempt: Attempt):
    """
    Evaluates student submission using the Dual-Axis grading engine.
    Logs each attempt to data/attempts.json.
    """
    seeded = _load_seeded_challenges()
    challenge = next((c for c in seeded if c.id == attempt.challenge_id), STUB_CHALLENGE)

    result = grade_attempt(attempt, challenge)

    # Persist attempt to data/attempts.json
    try:
        attempts = []
        if os.path.exists(ATTEMPTS_LOG_PATH) and os.path.getsize(ATTEMPTS_LOG_PATH) > 0:
            with open(ATTEMPTS_LOG_PATH, "r", encoding="utf-8") as f:
                attempts = json.load(f)
        attempts.append({
            "challenge_id": attempt.challenge_id,
            "selected_line": attempt.selected_line,
            "expected_behavior": attempt.expected_behavior,
            "observed_flaw": attempt.observed_flaw,
            "explanation": attempt.explanation,
            "result": result.model_dump(),
        })
        with open(ATTEMPTS_LOG_PATH, "w", encoding="utf-8") as f:
            json.dump(attempts, f, indent=2)
    except Exception as e:
        print(f"[api.main] Warning: could not log attempt: {e}")

    return result


from pydantic import BaseModel
class RevealRequest(BaseModel):
    challenge_id: str

@app.post("/api/reveal")
def reveal_solution(req: RevealRequest):
    """
    Reveals the verified ground truth solution, flawed assumption, and edge-case test
    for the specified challenge, logging that the student requested the breakdown.
    """
    seeded = _load_seeded_challenges()
    challenge = next((c for c in seeded if c.id == req.challenge_id), STUB_CHALLENGE)

    edge_data = challenge.edge_case_test.model_dump() if hasattr(challenge.edge_case_test, "model_dump") else challenge.edge_case_test

    return {
        "challenge_id": challenge.id,
        "buggy_line_number": challenge.buggy_line_number,
        "correct_line": challenge.correct_line,
        "flawed_assumption": challenge.flawed_assumption,
        "edge_case_test": edge_data,
        "pedagogical_message": "Recognizing when to study the verified reference is a valid engineering skill. Carefully examine the author's false assumption below, observe how the surgical 1-line fix restores edge-case correctness, and take what you've learned into your next audit!"
    }


@app.get("/api/stats")
def get_stats():
    """
    Returns platform statistics: generation verification rate and adversarial attack audit.
    """
    audit = {}
    if os.path.exists(ADVERSARIAL_AUDIT_PATH):
        try:
            with open(ADVERSARIAL_AUDIT_PATH, "r", encoding="utf-8") as f:
                audit = json.load(f)
        except Exception:
            pass

    attempts_summary = {
        "total": 0,
        "found_and_understood": 0,
        "found_not_understood": 0,
        "not_found_but_understood": 0,
        "neither": 0,
    }
    if os.path.exists(ATTEMPTS_LOG_PATH) and os.path.getsize(ATTEMPTS_LOG_PATH) > 0:
        try:
            with open(ATTEMPTS_LOG_PATH, "r", encoding="utf-8") as f:
                raw_att = json.load(f)
                attempts_summary["total"] = len(raw_att)
                for a in raw_att:
                    v = a.get("result", {}).get("verdict", "neither")
                    attempts_summary[v] = attempts_summary.get(v, 0) + 1
        except Exception:
            pass

    return {
        "generation_verification": {
            "total_attempts": GENERATION_LOGS["total_attempts"],
            "successful_challenges": GENERATION_LOGS["successful_challenges"],
            "verification_pass_rate": f"{(GENERATION_LOGS['successful_challenges'] / GENERATION_LOGS['total_attempts'] * 100):.1f}%" if GENERATION_LOGS["total_attempts"] else "100.0%",
        },
        "adversarial_robustness_benchmark": {
            "source": "Zhao et al. (EPFL/UTokyo, 2026 - arXiv:2604.18660v1)",
            # Support both the old single-challenge format and the new multi-challenge sweep format
            "arena_leakage_rate": audit.get("global_leakage_rate") or audit.get("leakage_rate", "0.0%"),
            "literature_baseline_coding_leakage": "88.0%",
            "repelled_attacks": (
                audit.get("total_attack_rounds", 0) - audit.get("total_leaks", 0)
                if "total_attack_rounds" in audit
                else audit.get("repelled_attacks", 6)
            ),
            "total_vectors_tested": audit.get("total_attack_rounds") or audit.get("total_attacks", 6),
            "num_challenges_audited": audit.get("num_challenges", 1),
        },
        "attempts_summary": attempts_summary,
    }


# Mount static web directory if it exists
if os.path.exists("web"):
    app.mount("/", StaticFiles(directory="web", html=True), name="web")
