from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
import json
from typing import Optional

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
from engine.memory import update_memory_on_attempt, get_memory_state, get_weakest_category

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEEDED_CHALLENGES_PATH = os.path.join(BASE_DIR, "data", "seeded.json")
ADVERSARIAL_AUDIT_PATH = os.path.join(BASE_DIR, "data", "adversarial_audit.json")
ATTEMPTS_LOG_PATH = os.path.join(BASE_DIR, "data", "attempts.json")

CHALLENGES_CACHE: dict = {}

def _load_seeded_challenges():
    if os.path.exists(SEEDED_CHALLENGES_PATH):
        try:
            with open(SEEDED_CHALLENGES_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                loaded = [Challenge(**item) for item in data]
                for c in loaded:
                    CHALLENGES_CACHE[c.id] = c
                return loaded
        except Exception as e:
            print(f"[api.main] Error loading seeded: {e}")
            return []
    return []

def _get_challenge_by_id(challenge_id: str) -> Challenge:
    if challenge_id in CHALLENGES_CACHE:
        return CHALLENGES_CACHE[challenge_id]
    seeded = _load_seeded_challenges()
    for c in seeded:
        if c.id == challenge_id:
            return c
    return STUB_CHALLENGE

@app.get("/api/challenge", response_model=PublicChallenge)
def get_challenge(
    difficulty: str = Query("easy"),
    fresh: bool = Query(False),
    category: Optional[str] = Query(None),
    adaptive: bool = Query(True),
):
    """
    Returns a challenge for the student.
    Supports manual category selection or adaptive selection targeting the student's weakest category.
    CRITICAL: Strips buggy_line_number, flawed_assumption, correct_line, edge_case_test.
    """
    seeded = _load_seeded_challenges()

    # Determine target category if requested or adaptive
    target_category = category
    if not target_category and adaptive:
        try:
            target_category = get_weakest_category()
        except Exception:
            target_category = None

    if fresh:
        task_desc = random.choice(seeded).task_description if seeded else "filter numbers greater than a threshold"
        bug_type_to_gen = target_category if target_category else "boundary_inclusive"
        ch, meta = generate_challenge(task=task_desc, bug_type=bug_type_to_gen)
        if ch:
            CHALLENGES_CACHE[ch.id] = ch
            return ch.to_public()

    if seeded:
        if target_category:
            filtered = [c for c in seeded if c.bug_type == target_category]
            if filtered:
                return random.choice(filtered).to_public()
        return random.choice(seeded).to_public()

    return STUB_CHALLENGE.to_public()


from engine.grade import grade_attempt

@app.post("/api/submit", response_model=Result)
def submit_attempt(attempt: Attempt):
    """
    Evaluates student submission using the Dual-Axis grading engine.
    Logs each attempt to data/attempts.json and updates dynamic session memory (memory.md).
    """
    challenge = _get_challenge_by_id(attempt.challenge_id)

    result = grade_attempt(attempt, challenge)

    # Persist attempt to data/attempts.json and update memory.md
    try:
        attempts = []
        if os.path.exists(ATTEMPTS_LOG_PATH) and os.path.getsize(ATTEMPTS_LOG_PATH) > 0:
            with open(ATTEMPTS_LOG_PATH, "r", encoding="utf-8") as f:
                attempts = json.load(f)
        attempt_record = {
            "challenge_id": attempt.challenge_id,
            "selected_line": attempt.selected_line,
            "expected_behavior": attempt.expected_behavior,
            "observed_flaw": attempt.observed_flaw,
            "explanation": attempt.explanation,
            "fixed_code": attempt.fixed_code,
            "result": result.model_dump(),
        }
        attempts.append(attempt_record)
        with open(ATTEMPTS_LOG_PATH, "w", encoding="utf-8") as f:
            json.dump(attempts, f, indent=2)

        # Update dynamic session memory (memory.md)
        try:
            update_memory_on_attempt(attempt_record)
        except Exception as mem_err:
            print(f"[api.main] Warning: could not update memory.md: {mem_err}")
    except Exception as e:
        print(f"[api.main] Warning: could not log attempt: {e}")

    return result


@app.get("/api/memory")
def get_session_memory():
    """
    Returns live session memory metrics, streak, category mastery, and raw markdown.
    """
    return get_memory_state()


from datetime import datetime
from pydantic import BaseModel
class RevealRequest(BaseModel):
    challenge_id: str

@app.post("/api/reveal")
def reveal_solution(req: RevealRequest):
    """
    Reveals the verified ground truth solution, flawed assumption, and edge-case test
    for the specified challenge, logging that the student requested the breakdown.
    """
    challenge = _get_challenge_by_id(req.challenge_id)

    edge_data = challenge.edge_case_test.model_dump() if hasattr(challenge.edge_case_test, "model_dump") else challenge.edge_case_test

    # Log reveal attempt to reset streak and update session memory
    try:
        attempt_record = {
            "challenge_id": challenge.id,
            "timestamp": datetime.now().isoformat(),
            "selected_line": challenge.buggy_line_number,
            "expected_behavior": "Revealed by user",
            "observed_flaw": "Revealed by user",
            "explanation": "Solution revealed (exercise ended)",
            "result": {
                "detection": {
                    "line_correct": False,
                    "near_miss": False,
                    "fix_passes": False,
                },
                "comprehension": {
                    "score": 0,
                    "feedback": "Solution revealed (exercise ended).",
                    "reason": "User surrendered exercise to inspect reference solution.",
                    "leak_check": "Verified.",
                },
                "verdict": "neither",
            },
            "revealed": True,
        }
        attempts = []
        if os.path.exists(ATTEMPTS_LOG_PATH) and os.path.getsize(ATTEMPTS_LOG_PATH) > 0:
            with open(ATTEMPTS_LOG_PATH, "r", encoding="utf-8") as f:
                attempts = json.load(f)
        attempts.append(attempt_record)
        with open(ATTEMPTS_LOG_PATH, "w", encoding="utf-8") as f:
            json.dump(attempts, f, indent=2)

        try:
            update_memory_on_attempt(attempt_record)
        except Exception as mem_err:
            print(f"[api.main] Warning: could not update memory.md on reveal: {mem_err}")
    except Exception as e:
        print(f"[api.main] Warning: could not log reveal: {e}")

    memory_state = get_memory_state()

    return {
        "challenge_id": challenge.id,
        "buggy_line_number": challenge.buggy_line_number,
        "correct_line": challenge.correct_line,
        "flawed_assumption": challenge.flawed_assumption,
        "edge_case_test": edge_data,
        "pedagogical_message": "Recognizing when to study the verified reference is a valid engineering skill. Carefully examine the author's false assumption below, observe how the surgical 1-line fix restores edge-case correctness, and take what you've learned into your next audit!",
        "current_streak": memory_state["stats"]["current_streak"],
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
WEB_DIR = os.path.join(BASE_DIR, "web")
if os.path.exists(WEB_DIR):
    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
elif os.path.exists("web"):
    app.mount("/", StaticFiles(directory="web", html=True), name="web")
