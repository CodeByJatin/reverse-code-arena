from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

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


@app.get("/api/challenge", response_model=PublicChallenge)
def get_challenge(difficulty: str = Query("easy")):
    """
    Returns a challenge for the student.
    CRITICAL: Strips buggy_line_number, flawed_assumption, correct_line, edge_case_test.
    """
    return STUB_CHALLENGE.to_public()


@app.post("/api/submit", response_model=Result)
def submit_attempt(attempt: Attempt):
    """
    Stub submit endpoint returning a mock Result.
    Will be replaced by engine/grade.py in Phase C.
    """
    # Simple check for stub demo
    is_correct = (attempt.selected_line == STUB_CHALLENGE.buggy_line_number)
    return Result(
        detection=DetectionResult(
            line_correct=is_correct,
            near_miss=(abs(attempt.selected_line - STUB_CHALLENGE.buggy_line_number) == 1),
            fix_passes=is_correct,
        ),
        comprehension=ComprehensionResult(
            score=2 if is_correct else 0,
            feedback="Stub response: Explanation received and graded.",
        ),
        verdict="found_and_understood" if is_correct else "neither",
    )


@app.get("/api/stats")
def get_stats():
    """
    Returns platform statistics: generation verification rate and attempt counts.
    """
    return {
        "verification_pass_rate": 0.0,
        "attempts_summary": {
            "total": 0,
            "found_and_understood": 0,
            "found_not_understood": 0,
            "not_found_but_understood": 0,
            "neither": 0,
        },
    }


# Mount static web directory if it exists
if os.path.exists("web"):
    app.mount("/", StaticFiles(directory="web", html=True), name="web")
