from typing import Any, List, Optional
from pydantic import BaseModel, Field


class TestCase(BaseModel):
    input: List[Any]
    expected: Any


class Challenge(BaseModel):
    id: str
    task_description: str  # what the fn is supposed to do (shown to student)
    function_name: str
    code: str  # full runnable python
    num_lines: int
    bug_type: str  # from catalogue
    buggy_line_number: int  # 1-indexed
    flawed_assumption: str  # ground truth for grading
    passing_tests: List[TestCase]
    edge_case_test: TestCase
    correct_line: str

    def to_public(self) -> "PublicChallenge":
        """Strips answers so student cannot inspect payload."""
        return PublicChallenge(
            id=self.id,
            task_description=self.task_description,
            function_name=self.function_name,
            code=self.code,
            num_lines=self.num_lines,
            bug_type=self.bug_type,
            passing_tests=self.passing_tests,
        )


class PublicChallenge(BaseModel):
    id: str
    task_description: str
    function_name: str
    code: str
    num_lines: int
    bug_type: str
    passing_tests: List[TestCase]


class Attempt(BaseModel):
    challenge_id: str
    selected_line: int
    explanation: str
    fixed_code: str


class DetectionResult(BaseModel):
    line_correct: bool
    near_miss: bool
    fix_passes: bool


class ComprehensionResult(BaseModel):
    score: int  # 0 to 3
    feedback: str


class Result(BaseModel):
    detection: DetectionResult
    comprehension: ComprehensionResult
    verdict: str  # "found_and_understood" | "found_not_understood" |
                  # "not_found_but_understood" | "neither"
