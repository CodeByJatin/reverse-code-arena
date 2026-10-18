"""
Dynamic Session Memory Engine for Reverse Code Arena.
Tracks code-fix mastery, streaks, and category proficiency,
persisting the state into per-user directories and memory.md.
"""

import os
import json
from datetime import datetime
from typing import Dict, Any, List, Optional
from engine.catalogue import BUG_CATALOGUE, list_bug_types

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MEMORY_FILE_PATH = os.path.join(ROOT_DIR, "memory.md")
ATTEMPTS_FILE_PATH = os.path.join(ROOT_DIR, "data", "attempts.json")
SEEDED_FILE_PATH = os.path.join(ROOT_DIR, "data", "seeded.json")
USERS_DIR = os.path.join(ROOT_DIR, "data", "users")

# Concrete engineering advice mapped to bug categories
CATEGORY_TIPS = {
    "boundary_inclusive": "Boundary conditions: Verify whether the contract specifies strictly greater than (>) or requires exact boundary threshold inclusion (>=).",
    "off_by_one": "Loop bounds: Watch for range(len(arr) - 1) which terminates one iteration too early, omitting the final element.",
    "int_division": "Division precision: Verify integer floor division (//) vs true float division (/), particularly in percentages and ratios.",
    "mutable_default": "Mutable arguments: Avoid default accumulator lists (acc=[]) in function signatures; they accumulate state across invocations.",
    "shallow_copy": "Container depth: Remember that list(x) or x[:] only creates a 1-level shallow copy, leaving inner structures mutable.",
}


def get_user_attempts_path(username: Optional[str] = None) -> str:
    """Returns absolute path to attempts.json for the specified user or global fallback."""
    if username and username.strip():
        user_slug = username.strip().lower()
        user_dir = os.path.join(USERS_DIR, user_slug)
        os.makedirs(user_dir, exist_ok=True)
        return os.path.join(user_dir, "attempts.json")
    return ATTEMPTS_FILE_PATH


def get_user_memory_path(username: Optional[str] = None) -> str:
    """Returns absolute path to memory.md for the specified user or global fallback."""
    if username and username.strip():
        user_slug = username.strip().lower()
        user_dir = os.path.join(USERS_DIR, user_slug)
        os.makedirs(user_dir, exist_ok=True)
        return os.path.join(user_dir, "memory.md")
    return MEMORY_FILE_PATH


def _load_attempts(username: Optional[str] = None) -> List[Dict[str, Any]]:
    path = get_user_attempts_path(username)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []


def _load_seeded_lookup() -> Dict[str, Dict[str, Any]]:
    """Maps challenge_id -> challenge dict."""
    if os.path.exists(SEEDED_FILE_PATH):
        try:
            with open(SEEDED_FILE_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                return {item["id"]: item for item in data}
        except Exception:
            return {}
    return {}


def _is_attempt_solved(attempt: Dict[str, Any]) -> bool:
    """Returns True if attempt represents a passing code fix."""
    if attempt.get("passed") is True:
        return True
    res = attempt.get("result", {})
    if res.get("passed") is True:
        return True
    verdict = res.get("verdict", "")
    if verdict in ("found_and_understood", "passed"):
        return True
    # If fix_passes is True
    if res.get("detection", {}).get("fix_passes") is True:
        return True
    return False


def compute_memory_stats(attempts: Optional[List[Dict[str, Any]]] = None, username: Optional[str] = None) -> Dict[str, Any]:
    """
    Computes code-first session memory statistics from attempts log for a user.
    """
    if attempts is None:
        attempts = _load_attempts(username)

    seeded_lookup = _load_seeded_lookup()
    total_attempts = len(attempts)

    # 1. Compute current streak (consecutive passing attempts from end)
    current_streak = 0
    for a in reversed(attempts):
        if _is_attempt_solved(a):
            current_streak += 1
        else:
            break

    # 1.1 Compute best all-time streak
    best_streak = 0
    temp_streak = 0
    for a in attempts:
        if _is_attempt_solved(a):
            temp_streak += 1
            if temp_streak > best_streak:
                best_streak = temp_streak
        else:
            temp_streak = 0

    # 2. Category metrics & total counts
    total_solved = 0
    category_stats: Dict[str, Dict[str, Any]] = {
        cat: {"attempts": 0, "solved": 0} for cat in list_bug_types()
    }
    blind_spots = set()

    for attempt in attempts:
        ch_id = attempt.get("challenge_id")
        ch_info = seeded_lookup.get(ch_id, {})
        bug_type = ch_info.get("bug_type")

        # Fallback to challenge_id string inspection if not in seeded lookup
        if not bug_type and ch_id:
            for cat in list_bug_types():
                if cat in ch_id:
                    bug_type = cat
                    break
        if not bug_type:
            bug_type = "boundary_inclusive"

        solved = _is_attempt_solved(attempt)

        if bug_type not in category_stats:
            category_stats[bug_type] = {"attempts": 0, "solved": 0}

        category_stats[bug_type]["attempts"] += 1

        if solved:
            total_solved += 1
            category_stats[bug_type]["solved"] += 1
        else:
            if bug_type in CATEGORY_TIPS:
                blind_spots.add(CATEGORY_TIPS[bug_type])

    # Compute percentage accuracies and proficiency status
    category_metrics = {}
    for cat, data in category_stats.items():
        att = data["attempts"]
        sol = data["solved"]
        acc = round((sol / att * 100), 1) if att > 0 else 0.0
        status = "Untested"
        if att > 0:
            if acc >= 80.0:
                status = "Mastered"
            elif acc >= 50.0:
                status = "Proficient"
            else:
                status = "Needs Practice"
        category_metrics[cat] = {
            "attempts": att,
            "solved": sol,
            "accuracy": acc,
            "status": status,
        }

    total_failed = total_attempts - total_solved
    overall_accuracy = round((total_solved / total_attempts * 100), 1) if total_attempts > 0 else 0.0

    return {
        "username": username or "Guest",
        "total_attempts": total_attempts,
        "total_solved": total_solved,
        "total_failed": total_failed,
        "overall_accuracy": overall_accuracy,
        "current_streak": current_streak,
        "best_streak": best_streak,
        # Backward compatibility aliases
        "direct_fixes_total": total_attempts,
        "direct_fixes_passed": total_solved,
        "direct_fix_accuracy": overall_accuracy,
        "multi_line_attempts": 0,
        "verdict_counts": {
            "found_and_understood": total_solved,
            "found_not_understood": 0,
            "not_found_but_understood": 0,
            "neither": total_failed,
        },
        "category_metrics": category_metrics,
        "blind_spots": list(blind_spots),
        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def generate_memory_markdown(stats: Dict[str, Any], username: Optional[str] = None) -> str:
    """Formats stats dictionary into human and agent-readable markdown."""
    user_label = f" ({username})" if username else ""
    lines = [
        f"# Reverse Code Arena — Student Session Memory{user_label}",
        f"> Last Updated: `{stats['last_updated']}` | Deterministic Code-First Engine Active",
        "",
        "## 1. Live Session Snapshot",
        f"- **Current Streak**: **{stats['current_streak']}** consecutive verified challenges",
        f"- **All-Time Longest Streak**: **{stats.get('best_streak', stats['current_streak'])}** consecutive challenges",
        f"- **Total Challenges Solved**: **{stats['total_solved']} / {stats['total_attempts']}** ({stats['overall_accuracy']}% overall pass rate)",
        f"- **Execution Breakdown**:",
        f"  - **Passed (100% Tests)**: {stats['total_solved']}",
        f"  - **Failed Tests / Syntax Errors**: {stats['total_failed']}",
        "",
        "## 2. Bug Category Mastery Matrix",
        "| Bug Category | Attempts | Solved | Accuracy | Proficiency Status |",
        "|---|:---:|:---:|:---:|:---:|",
    ]

    for cat, data in stats["category_metrics"].items():
        lines.append(f"| `{cat}` | {data['attempts']} | {data['solved']} | {data['accuracy']}% | {data['status']} |")

    lines.extend([
        "",
        "## 3. Engineering Guidance & Common Boundary Traps",
    ])

    if stats["blind_spots"]:
        for tip in stats["blind_spots"]:
            lines.append(f"- **{tip}**")
    else:
        lines.append("- *No recent failures. Keep up the clean code streak!*")

    lines.extend([
        "",
        "## 4. Next Recommended Focus (Adaptive Direction)",
    ])

    weakest = get_weakest_category(stats)
    weak_data = stats["category_metrics"].get(weakest, {})
    lines.append(f"- **Primary Practice Target**: `{weakest}` (Status: {weak_data.get('status', 'Untested')}, Accuracy: {weak_data.get('accuracy', 0)}%)")
    lines.append(f"- *The platform will automatically serve challenges from this category for targeted skill reinforcement.*")
    lines.append("")

    return "\n".join(lines)


def get_weakest_category(stats: Optional[Dict[str, Any]] = None, username: Optional[str] = None) -> str:
    """Identifies the category with lowest accuracy or lowest attempts to adaptively target."""
    if stats is None:
        stats = compute_memory_stats(username=username)

    cat_metrics = stats.get("category_metrics", {})
    if not cat_metrics:
        return "boundary_inclusive"

    # Prioritize: 1. Needs Practice (lowest accuracy), 2. Untested (0 attempts), 3. Proficient
    scored = []
    for cat, data in cat_metrics.items():
        attempts = data["attempts"]
        accuracy = data["accuracy"]
        if attempts == 0:
            priority = 10  # Untested gets high priority
        else:
            priority = accuracy  # Lower accuracy gets higher priority
        scored.append((priority, cat))

    scored.sort(key=lambda x: x[0])
    return scored[0][1]


def init_memory_file(username: Optional[str] = None) -> str:
    """Initializes or refreshes memory.md file on disk."""
    stats = compute_memory_stats(username=username)
    md_content = generate_memory_markdown(stats, username=username)
    mem_path = get_user_memory_path(username)
    with open(mem_path, "w", encoding="utf-8") as f:
        f.write(md_content)
    try:
        with open(MEMORY_FILE_PATH, "w", encoding="utf-8") as f:
            f.write(md_content)
    except Exception:
        pass
    return md_content


def update_memory_on_attempt(attempt_data: Dict[str, Any], username: Optional[str] = None) -> Dict[str, Any]:
    """
    Called after an attempt is logged to user's attempts.json.
    Re-computes stats and rewrites user's memory.md and root memory.md.
    """
    stats = compute_memory_stats(username=username)
    md_content = generate_memory_markdown(stats, username=username)
    mem_path = get_user_memory_path(username)
    with open(mem_path, "w", encoding="utf-8") as f:
        f.write(md_content)

    # Mirror to root memory.md
    try:
        with open(MEMORY_FILE_PATH, "w", encoding="utf-8") as f:
            f.write(md_content)
    except Exception:
        pass

    weakest = get_weakest_category(stats, username=username)
    return {
        "current_streak": stats["current_streak"],
        "best_streak": stats["best_streak"],
        "total_solved": stats["total_solved"],
        "total_attempts": stats["total_attempts"],
        "overall_accuracy": stats["overall_accuracy"],
        "weakest_category": weakest,
        "markdown": md_content,
    }


def get_memory_state(username: Optional[str] = None) -> Dict[str, Any]:
    """Returns current memory state and markdown for the user."""
    stats = compute_memory_stats(username=username)
    md_content = generate_memory_markdown(stats, username=username)
    return {
        "stats": stats,
        "weakest_category": get_weakest_category(stats, username=username),
        "markdown": md_content,
    }
