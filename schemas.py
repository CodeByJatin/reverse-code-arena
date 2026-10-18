from typing import Any, List, Optional, Dict
from pydantic import BaseModel, Field


class TestCase(BaseModel):
    input: List[Any]
    expected: Any


class ProblemExample(BaseModel):
    input: Any
    expected: Any
    observed: Optional[Any] = None
    explanation: Optional[str] = None


class HintItem(BaseModel):
    level: int
    penalty: int
    title: Optional[str] = None
    text: str


class Challenge(BaseModel):
    id: str
    task_description: str  # What the function is supposed to do
    function_name: str
    code: str  # Full runnable Python
    num_lines: int
    bug_type: str  # From catalogue
    buggy_line_number: int  # 1-indexed
    flawed_assumption: str  # Ground truth for grading
    difficulty: str = "easy"  # "easy" (30 pts) | "medium" (50 pts) | "hard" (80 pts)
    base_points: int = 30
    module_tag: Optional[str] = None
    title: Optional[str] = None
    examples: List[ProblemExample] = Field(default_factory=list)
    constraints: List[str] = Field(default_factory=list)
    hints: List[HintItem] = Field(default_factory=list)
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
            difficulty=self.difficulty,
            base_points=self.base_points,
            module_tag=self.module_tag,
            title=self.title,
            examples=self.examples,
            constraints=self.constraints,
            hints=self.hints,
            passing_tests=self.passing_tests,
        )


class PublicChallenge(BaseModel):
    id: str
    task_description: str
    function_name: str
    code: str
    num_lines: int
    bug_type: str
    difficulty: str = "easy"
    base_points: int = 30
    module_tag: Optional[str] = None
    title: Optional[str] = None
    examples: List[ProblemExample] = Field(default_factory=list)
    constraints: List[str] = Field(default_factory=list)
    hints: List[HintItem] = Field(default_factory=list)
    passing_tests: List[TestCase]


class Attempt(BaseModel):
    challenge_id: str
    fixed_code: Optional[str] = Field("", description="Student edited code fix")
    hints_unlocked: int = Field(0, description="Number of hints unlocked (0 to 3)")
    selected_line: Optional[int] = None
    selected_lines: Optional[List[int]] = Field(default_factory=list, description="Optional selected lines")
    expected_behavior: Optional[str] = Field(None, description="Deprecated")
    observed_flaw: Optional[str] = Field(None, description="Deprecated")
    explanation: Optional[str] = Field("", description="Deprecated")


class DetectionResult(BaseModel):
    line_correct: bool = True
    near_miss: bool = False
    fix_passes: bool = False


class ComprehensionResult(BaseModel):
    score: int = 0
    feedback: str = ""
    reason: Optional[str] = None
    leak_check: Optional[str] = None


class TestDetail(BaseModel):
    name: str
    input: Any
    expected: Any
    actual: Any = None
    passed: bool = False
    error: Optional[str] = None


class Result(BaseModel):
    passed: bool = False
    score: int = 0  # 100 if passed, 0 if failed
    points_earned: int = 0  # e.g., 30 - 5 = 25 pts
    base_points: int = 30
    tests_passed: int = 0
    total_tests: int = 0
    feedback: str = ""
    error_message: Optional[str] = None
    test_details: List[TestDetail] = Field(default_factory=list)
    verdict: str = "neither"  # "found_and_understood" (passed) | "neither" (failed)
    detection: DetectionResult = Field(default_factory=DetectionResult)
    comprehension: ComprehensionResult = Field(default_factory=ComprehensionResult)


class CatalogChallengeItem(BaseModel):
    id: str
    title: str
    module_tag: str
    difficulty: str
    base_points: int
    bug_type: str
    language: str = "python"
    task_description: str
    is_solved: bool = False
    points_earned: int = 0


class CatalogResponse(BaseModel):
    user_stats: Dict[str, Any]
    available_languages: List[str]
    available_topics: List[str]
    available_difficulties: List[str]
    challenges: List[CatalogChallengeItem]

