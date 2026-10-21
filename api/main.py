import sys
import os
from pathlib import Path

# Ensure root directory is in sys.path when executed directly
_ROOT_DIR = str(Path(__file__).resolve().parent.parent)
if _ROOT_DIR not in sys.path:
    sys.path.insert(0, _ROOT_DIR)

from fastapi import FastAPI, Query, Request, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
import json
import random
from typing import Optional, Dict, Any, Tuple
from datetime import datetime
from pydantic import BaseModel, Field

from schemas import (
    Challenge,
    PublicChallenge,
    Attempt,
    Result,
    DetectionResult,
    ComprehensionResult,
    TestCase,
    CatalogChallengeItem,
    CatalogResponse,
)
from engine.generate import generate_challenge, GENERATION_LOGS
from engine.stress_test import check_answer_leakage
from engine.grade import grade_attempt
from engine.auth import signup_user, login_user, verify_session, invalidate_session, get_user_dir
from engine.memory import (
    update_memory_on_attempt,
    get_memory_state,
    get_weakest_category,
    get_user_attempts_path,
    get_user_memory_path,
)

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

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEEDED_CHALLENGES_PATH = os.path.join(BASE_DIR, "data", "seeded.json")
ADVERSARIAL_AUDIT_PATH = os.path.join(BASE_DIR, "data", "adversarial_audit.json")
GLOBAL_ATTEMPTS_LOG_PATH = os.path.join(BASE_DIR, "data", "attempts.json")

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


def get_user_stats_path(username: Optional[str] = None) -> str:
    """Returns path to user's stats.json record."""
    if username and username.strip():
        u_dir = get_user_dir(username.strip().lower())
        return os.path.join(u_dir, "stats.json")
    return os.path.join(BASE_DIR, "data", "stats.json")


def load_user_stats(username: Optional[str] = None) -> Dict[str, Any]:
    """Loads user's solved problem records and total points."""
    path = get_user_stats_path(username)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    # Fallback to computing from existing attempts.json
    u_attempts_path = get_user_attempts_path(username)
    solved_ids = []
    solved_points = {}
    total_points = 0
    if os.path.exists(u_attempts_path) and os.path.getsize(u_attempts_path) > 0:
        try:
            with open(u_attempts_path, "r", encoding="utf-8") as f:
                records = json.load(f)
                for r in records:
                    if r.get("passed") and r.get("challenge_id"):
                        cid = r["challenge_id"]
                        pts = r.get("result", {}).get("points_earned", 30) or 30
                        if cid not in solved_ids:
                            solved_ids.append(cid)
                            total_points += pts
                        solved_points[cid] = pts
        except Exception:
            pass

    initial_stats = {
        "total_solved": len(solved_ids),
        "total_points": total_points,
        "solved_challenge_ids": solved_ids,
        "solved_points": solved_points,
    }
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(initial_stats, f, indent=2)
    except Exception:
        pass
    return initial_stats


def record_user_solve(username: str, challenge_id: str, points_earned: int) -> Tuple[int, int, bool]:
    """
    Records a solved challenge.
    Returns (total_solved, total_points, is_new_solve).
    Prevents duplicate points on re-solves.
    """
    stats = load_user_stats(username)
    solved_ids = stats.get("solved_challenge_ids", [])
    solved_points = stats.get("solved_points", {})
    is_new = challenge_id not in solved_ids

    if is_new:
        solved_ids.append(challenge_id)
        stats["solved_challenge_ids"] = solved_ids
        stats["total_solved"] = len(solved_ids)
        stats["total_points"] = stats.get("total_points", 0) + max(0, points_earned)
        solved_points[challenge_id] = max(0, points_earned)
        stats["solved_points"] = solved_points
        path = get_user_stats_path(username)
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(stats, f, indent=2)
        except Exception as e:
            print(f"[api.main] Error saving user stats: {e}")

    return stats["total_solved"], stats["total_points"], is_new


def _extract_user(request: Request, required: bool = True) -> Optional[str]:
    """
    Extracts and verifies user identity from Authorization header or x-user-id header.
    If required and no user is authenticated, raises HTTP 401.
    """
    auth_header = request.headers.get("Authorization", "")
    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1].strip()

    username_header = request.headers.get("x-user-id")
    verified_user = verify_session(token, username_header)

    if required and not verified_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in or sign up to access the arena.",
        )
    return verified_user


# -----------------------------------------------------------------------------
# Authentication Endpoints
# -----------------------------------------------------------------------------

class SignupRequest(BaseModel):
    username: str
    password: str
    confirm_password: Optional[str] = None


class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/api/auth/signup")
def handle_signup(req: SignupRequest):
    """Registers a new user and returns an active session token."""
    if req.confirm_password is not None and req.password != req.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match.")

    success, msg, data = signup_user(req.username, req.password)
    if not success:
        raise HTTPException(status_code=400, detail=msg)

    return {
        "status": "success",
        "message": msg,
        "username": data["username"],
        "token": data["token"],
    }


@app.post("/api/auth/login")
def handle_login(req: LoginRequest):
    """Authenticates an existing user and returns an active session token."""
    success, msg, data = login_user(req.username, req.password)
    if not success:
        raise HTTPException(status_code=401, detail=msg)

    return {
        "status": "success",
        "message": msg,
        "username": data["username"],
        "token": data["token"],
    }


@app.get("/api/auth/me")
def handle_get_me(request: Request):
    """Returns profile for currently active session."""
    user = _extract_user(request, required=False)
    if not user:
        return {"authenticated": False, "username": None}
    return {"authenticated": True, "username": user}


@app.post("/api/auth/logout")
def handle_logout(request: Request):
    """Terminates session."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        invalidate_session(token)
    return {"status": "success", "message": "Logged out successfully."}


# -----------------------------------------------------------------------------
# Core Arena Endpoints (Per-User Partitioned)
# -----------------------------------------------------------------------------

@app.get("/api/catalog", response_model=CatalogResponse)
def get_challenges_catalog(request: Request):
    """
    Returns full problem catalog with metadata (difficulty, language, module tags)
    and attaches the authenticated user's solve status and points earned.
    """
    user = _extract_user(request, required=True)
    stats = load_user_stats(user)
    solved_ids = set(stats.get("solved_challenge_ids", []))
    solved_points_map = stats.get("solved_points", {})

    mem_state = get_memory_state(username=user)
    mem_stats = mem_state.get("stats", {})
    current_streak = mem_stats.get("current_streak", 0)
    audit_accuracy = mem_stats.get("overall_accuracy", 0.0)

    seeded = _load_seeded_challenges()
    catalog_items = []
    topics_set = set()

    for c in seeded:
        func_words = (c.function_name or "debug_task").split("_")
        clean_title = c.title or " ".join(w.capitalize() for w in func_words)
        clean_module = c.module_tag or f"Module: {func_words[0].capitalize() if func_words else 'Core'}Service"

        is_solved = c.id in solved_ids
        pts_earned = solved_points_map.get(c.id, c.base_points if is_solved else 0)

        mod_name = clean_module.replace("Module: ", "").strip()
        topics_set.add(mod_name)

        catalog_items.append(
            CatalogChallengeItem(
                id=c.id,
                title=clean_title,
                module_tag=clean_module,
                difficulty=c.difficulty or "easy",
                base_points=c.base_points or 30,
                bug_type=c.bug_type or "general",
                language="python",
                task_description=c.task_description,
                is_solved=is_solved,
                points_earned=pts_earned,
            )
        )

    available_topics = sorted(list(topics_set))

    return CatalogResponse(
        user_stats={
            "username": user,
            "total_solved": stats.get("total_solved", 0),
            "total_points": stats.get("total_points", 0),
            "streak": current_streak,
            "accuracy": audit_accuracy,
        },
        available_languages=["python", "c++", "java", "javascript", "go"],
        available_topics=available_topics,
        available_difficulties=["easy", "medium", "hard"],
        challenges=catalog_items,
    )


@app.get("/api/challenge", response_model=PublicChallenge)
def get_challenge(
    request: Request,
    id: Optional[str] = Query(None),
    difficulty: Optional[str] = Query(None),
    fresh: bool = Query(False),
    category: Optional[str] = Query(None),
    adaptive: bool = Query(False),
):
    """
    Returns a challenge for the authenticated student.
    Supports fetching by ID, filtering by difficulty/category, or adaptive selection.
    CRITICAL: Strips buggy_line_number, flawed_assumption, correct_line, edge_case_test.
    """
    user = _extract_user(request, required=True)
    seeded = _load_seeded_challenges()

    # If specific ID requested, return it directly
    if id:
        for c in seeded:
            if c.id == id:
                return c.to_public()
        if id in CHALLENGES_CACHE:
            return CHALLENGES_CACHE[id].to_public()

    # Determine target category if requested or adaptive for this specific user
    target_category = category
    if not target_category and adaptive:
        try:
            target_category = get_weakest_category(username=user)
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
        pool = seeded
        if difficulty:
            diff_pool = [c for c in seeded if getattr(c, "difficulty", "easy").lower() == difficulty.lower()]
            if diff_pool:
                pool = diff_pool
        if target_category:
            cat_filtered = [c for c in pool if c.bug_type == target_category]
            if cat_filtered:
                return random.choice(cat_filtered).to_public()
        return random.choice(pool).to_public()

    return STUB_CHALLENGE.to_public()


@app.post("/api/submit", response_model=Result)
def submit_attempt(attempt: Attempt, request: Request):
    """
    Evaluates student code fix using the deterministic sandbox test runner.
    Logs attempt to user's personal attempts.json and updates user's personal memory.md.
    """
    user = _extract_user(request, required=True)
    challenge = _get_challenge_by_id(attempt.challenge_id)

    result = grade_attempt(attempt, challenge)

    # Record solve and update user points (preventing duplicate points on re-solves)
    if result.passed:
        total_solved, total_points, is_new = record_user_solve(user, challenge.id, result.points_earned)
        if not is_new:
            result.feedback = f"All {result.total_tests} test cases passed! (Challenge previously solved; total points: {total_points})"

    # Persist attempt to user's personal directory
    user_attempts_path = get_user_attempts_path(user)
    try:
        attempts = []
        if os.path.exists(user_attempts_path) and os.path.getsize(user_attempts_path) > 0:
            with open(user_attempts_path, "r", encoding="utf-8") as f:
                attempts = json.load(f)

        attempt_record = {
            "challenge_id": attempt.challenge_id,
            "username": user,
            "timestamp": datetime.now().isoformat(),
            "fixed_code": attempt.fixed_code,
            "hints_unlocked": attempt.hints_unlocked,
            "passed": result.passed,
            "score": result.score,
            "points_earned": result.points_earned,
            "base_points": result.base_points,
            "tests_passed": result.tests_passed,
            "total_tests": result.total_tests,
            "feedback": result.feedback,
            "result": result.model_dump(),
        }
        attempts.append(attempt_record)
        with open(user_attempts_path, "w", encoding="utf-8") as f:
            json.dump(attempts, f, indent=2)

        # Update dynamic session memory (for streak maintenance)
        try:
            update_memory_on_attempt(attempt_record, username=user)
        except Exception:
            pass
    except Exception as e:
        print(f"[api.main] Warning: could not log attempt: {e}")

    return result


@app.get("/api/memory")
def get_session_memory(request: Request):
    """
    Returns live session memory metrics, streak, category mastery, and raw markdown
    specifically for the authenticated user.
    """
    user = _extract_user(request, required=True)
    return get_memory_state(username=user)


class RevealRequest(BaseModel):
    challenge_id: str


@app.post("/api/reveal")
def reveal_solution(req: RevealRequest, request: Request):
    """
    Reveals the verified ground truth solution, flawed assumption, and edge-case test
    for the specified challenge, logging that the student surrendered the exercise.
    Resets the user's personal streak.
    """
    user = _extract_user(request, required=True)
    challenge = _get_challenge_by_id(req.challenge_id)

    edge_data = challenge.edge_case_test.model_dump() if hasattr(challenge.edge_case_test, "model_dump") else challenge.edge_case_test

    user_attempts_path = get_user_attempts_path(user)
    try:
        attempt_record = {
            "challenge_id": challenge.id,
            "username": user,
            "timestamp": datetime.now().isoformat(),
            "fixed_code": "",
            "passed": False,
            "score": 0,
            "revealed": True,
            "feedback": "Solution revealed by user.",
            "result": {
                "passed": False,
                "score": 0,
                "tests_passed": 0,
                "total_tests": (len(challenge.passing_tests) + 1) if hasattr(challenge, "passing_tests") else 2,
                "verdict": "neither",
                "feedback": "Solution revealed by user.",
            },
        }
        attempts = []
        if os.path.exists(user_attempts_path) and os.path.getsize(user_attempts_path) > 0:
            with open(user_attempts_path, "r", encoding="utf-8") as f:
                attempts = json.load(f)
        attempts.append(attempt_record)
        with open(user_attempts_path, "w", encoding="utf-8") as f:
            json.dump(attempts, f, indent=2)

        try:
            update_memory_on_attempt(attempt_record, username=user)
        except Exception as mem_err:
            print(f"[api.main] Warning: could not update memory.md on reveal: {mem_err}")
    except Exception as e:
        print(f"[api.main] Warning: could not log reveal: {e}")

    memory_state = get_memory_state(username=user)

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
def get_stats(request: Request):
    """
    Returns platform statistics: strictly total_solved and total_points for current user.
    """
    user = _extract_user(request, required=False)
    stats = load_user_stats(user)
    total_solved = stats.get("total_solved", 0)
    total_points = stats.get("total_points", 0)

    return {
        "total_solved": total_solved,
        "total_points": total_points,
        "user_profile": {
            "total_solved": total_solved,
            "total_points": total_points,
        },
    }


# Mount static web directory if it exists
WEB_DIR = os.path.join(BASE_DIR, "web")
if os.path.exists(WEB_DIR):
    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
elif os.path.exists("web"):
    app.mount("/", StaticFiles(directory="web", html=True), name="web")


if __name__ == '__main__':
    import uvicorn
    print('Starting Reverse Code Arena server on http://127.0.0.1:8000 ...')
    uvicorn.run('api.main:app', host='127.0.0.1', port=8000, reload=True)
