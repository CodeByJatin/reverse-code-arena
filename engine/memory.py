"""
Dynamic Session Memory Engine for Reverse Code Arena.
Tracks user mastery, streaks, category accuracy, and mental model blind spots,
persisting the state into memory.md in the project root.
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

# Qualitative pedagogical tips mapped to bug categories (Zhang 2026 / Zhao 2026)
BLIND_SPOT_TIPS = {
    "boundary_inclusive": "Boundary conditions: Verify whether the contract specifies strictly greater than (>) or requires exact boundary threshold inclusion (>=).",
    "off_by_one": "Loop bounds: Watch for range(len(arr) - 1) which terminates one iteration too early, omitting the final element.",
    "int_division": "Division precision: Verify integer floor division (//) vs true float division (/), particularly in percentages and ratios.",
    "mutable_default": "Mutable arguments: Avoid default accumulator lists (acc=[]) in function signatures; they accumulate state across invocations.",
    "shallow_copy": "Container depth: Remember that list(x) or x[:] only creates a 1-level shallow copy, leaving inner structures mutable.",
}


def _load_attempts() -> List[Dict[str, Any]]:
    if os.path.exists(ATTEMPTS_FILE_PATH) and os.path.getsize(ATTEMPTS_FILE_PATH) > 0:
        try:
            with open(ATTEMPTS_FILE_PATH, "r", encoding="utf-8") as f:
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


def compute_memory_stats(attempts: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """
    Computes comprehensive session memory statistics from attempts log.
    """
    if attempts is None:
        attempts = _load_attempts()

    seeded_lookup = _load_seeded_lookup()
    total_attempts = len(attempts)

    # 1. Compute current streak (consecutive found_and_understood from the end)
    current_streak = 0
    for a in reversed(attempts):
        verdict = a.get("result", {}).get("verdict", "")
        if verdict == "found_and_understood":
            current_streak += 1
        else:
            break

    # 2. Count total solved & verdict breakdown
    total_solved = 0
    verdict_counts = {
        "found_and_understood": 0,
        "found_not_understood": 0,
        "not_found_but_understood": 0,
        "neither": 0,
    }

    # 3. Category mastery tracking
    all_categories = list_bug_types()
    category_metrics = {
        cat: {"attempts": 0, "solved": 0, "accuracy": 0.0, "status": "Untested"}
        for cat in all_categories
    }

    blind_spots = set()

    for a in attempts:
        ch_id = a.get("challenge_id", "")
        ch_data = seeded_lookup.get(ch_id, {})
        bug_type = ch_data.get("bug_type")

        # Fallback heuristic if not in seeded lookup
        if not bug_type:
            for cat in all_categories:
                if cat in ch_id:
                    bug_type = cat
                    break
        if not bug_type:
            bug_type = "boundary_inclusive"

        res = a.get("result", {})
        verdict = res.get("verdict", "neither")
        verdict_counts[verdict] = verdict_counts.get(verdict, 0) + 1

        is_solved = (verdict == "found_and_understood")
        if is_solved:
            total_solved += 1

        if bug_type in category_metrics:
            category_metrics[bug_type]["attempts"] += 1
            if is_solved:
                category_metrics[bug_type]["solved"] += 1
            else:
                # Add specific blind spot observation
                if bug_type in BLIND_SPOT_TIPS:
                    blind_spots.add(BLIND_SPOT_TIPS[bug_type])
                if verdict == "found_not_understood":
                    blind_spots.add("Copilot Shortcut Trap: Correct line selected, but conceptual explanation lacked depth. Focus on explaining 'Why' before guessing the fix.")

    # Calculate percentages and status
    for cat, data in category_metrics.items():
        if data["attempts"] > 0:
            rate = (data["solved"] / data["attempts"]) * 100
            data["accuracy"] = round(rate, 1)
            if rate >= 80.0 and data["attempts"] >= 2:
                data["status"] = "Mastered"
            elif rate >= 50.0:
                data["status"] = "Proficient"
            else:
                data["status"] = "Needs Practice"
        else:
            data["accuracy"] = 0.0
            data["status"] = "Untested"

    overall_accuracy = round((total_solved / total_attempts * 100), 1) if total_attempts > 0 else 0.0

    return {
        "total_attempts": total_attempts,
        "total_solved": total_solved,
        "overall_accuracy": overall_accuracy,
        "current_streak": current_streak,
        "verdict_counts": verdict_counts,
        "category_metrics": category_metrics,
        "blind_spots": list(blind_spots),
        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def generate_memory_markdown(stats: Dict[str, Any]) -> str:
    """Formats stats dictionary into human and agent-readable markdown."""
    lines = [
        "# Reverse Code Arena — Student Session Memory",
        f"> Last Updated: `{stats['last_updated']}` | Session Tracking Engine Active",
        "",
        "## 1. Live Session Snapshot",
        f"- **Current Streak**: 🔥 **{stats['current_streak']}** consecutive verified challenges",
        f"- **Total Solved**: **{stats['total_solved']} / {stats['total_attempts']}** ({stats['overall_accuracy']}% overall accuracy)",
        f"- **Diagnosis Breakdown**:",
        f"  - `found_and_understood` (Full Mastery): {stats['verdict_counts'].get('found_and_understood', 0)}",
        f"  - `found_not_understood` (Copilot Guess): {stats['verdict_counts'].get('found_not_understood', 0)}",
        f"  - `not_found_but_understood` (Theory Only): {stats['verdict_counts'].get('not_found_but_understood', 0)}",
        f"  - `neither` (Unidentified): {stats['verdict_counts'].get('neither', 0)}",
        "",
        "## 2. Bug Category Mastery Matrix",
        "| Bug Category | Attempts | Solved | Accuracy | Proficiency Status |",
        "|---|:---:|:---:|:---:|:---:|",
    ]

    for cat, data in stats["category_metrics"].items():
        status_icon = "✅" if data["status"] == "Mastered" else ("⚡" if data["status"] == "Proficient" else ("⚠️" if data["status"] == "Needs Practice" else "⚪"))
        lines.append(f"| `{cat}` | {data['attempts']} | {data['solved']} | {data['accuracy']}% | {status_icon} {data['status']} |")

    lines.extend([
        "",
        "## 3. Active Pedagogical Blind Spots (Areas to Watch)",
    ])

    if stats["blind_spots"]:
        for tip in stats["blind_spots"]:
            lines.append(f"- 🔍 **{tip}**")
    else:
        lines.append("- ✨ *No active blind spots detected yet. Complete challenges to map your cognitive debugging profile.*")

    lines.extend([
        "",
        "## 4. Next Recommended Focus (Adaptive Direction)",
    ])

    weakest = get_weakest_category(stats)
    weak_data = stats["category_metrics"].get(weakest, {})
    lines.append(f"- **Primary Practice Target**: `{weakest}` (Status: {weak_data.get('status', 'Untested')}, Accuracy: {weak_data.get('accuracy', 0)}%)")
    lines.append(f"- *The adaptive engine automatically prioritizes this category when generating or selecting your next challenge.*")
    lines.append("")

    return "\n".join(lines)


def get_weakest_category(stats: Optional[Dict[str, Any]] = None) -> str:
    """Identifies the category with lowest accuracy or lowest attempts to adaptively target."""
    if stats is None:
        stats = compute_memory_stats()

    cat_metrics = stats.get("category_metrics", {})
    if not cat_metrics:
        return "boundary_inclusive"

    # Prioritize: 1. Needs Practice (lowest accuracy), 2. Untested (0 attempts), 3. Proficient
    scored = []
    for cat, data in cat_metrics.items():
        attempts = data["attempts"]
        accuracy = data["accuracy"]
        # Scoring: lower score = higher priority to practice
        if attempts == 0:
            priority = 10  # Untested gets high priority
        else:
            priority = accuracy  # Lower accuracy gets higher priority
        scored.append((priority, cat))

    scored.sort(key=lambda x: x[0])
    return scored[0][1]


def init_memory_file() -> str:
    """Initializes or refreshes memory.md file on disk."""
    stats = compute_memory_stats()
    md_content = generate_memory_markdown(stats)
    with open(MEMORY_FILE_PATH, "w", encoding="utf-8") as f:
        f.write(md_content)
    return md_content


def update_memory_on_attempt(attempt_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Called after an attempt is logged to data/attempts.json.
    Re-computes stats and rewrites memory.md.
    """
    stats = compute_memory_stats()
    md_content = generate_memory_markdown(stats)
    with open(MEMORY_FILE_PATH, "w", encoding="utf-8") as f:
        f.write(md_content)

    weakest = get_weakest_category(stats)
    return {
        "current_streak": stats["current_streak"],
        "total_solved": stats["total_solved"],
        "total_attempts": stats["total_attempts"],
        "overall_accuracy": stats["overall_accuracy"],
        "weakest_category": weakest,
        "markdown": md_content,
    }


def get_memory_state() -> Dict[str, Any]:
    """Returns current memory state and markdown."""
    stats = compute_memory_stats()
    md_content = generate_memory_markdown(stats)
    return {
        "stats": stats,
        "weakest_category": get_weakest_category(stats),
        "markdown": md_content,
    }
