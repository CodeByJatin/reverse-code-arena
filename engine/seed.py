"""
Seed script to pre-generate and verify challenges into data/seeded.json.
Ensures the live demo has instant, guaranteed-working challenges.
"""

import os
import sys
import json

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from engine.generate import generate_challenge, GENERATION_LOGS
from engine.catalogue import list_bug_types

SEED_TASKS = [
    ("find the maximum element in a list of numbers", "off_by_one"),
    ("filter numbers greater than a threshold", "boundary_inclusive"),
    ("append item to list with default accumulator", "mutable_default"),
    ("calculate percentage of passed items", "int_division"),
    ("copy a 2D matrix and zero out a cell", "shallow_copy"),
    ("find the first element that satisfies a condition", "off_by_one"),
    ("check if user age meets admission cutoff", "boundary_inclusive"),
    ("calculate average rating from a list of scores", "int_division"),
]


def seed_challenges(output_path: str = "data/seeded.json", target_count: int = 8):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    seeded = []

    # If file already exists, load existing
    if os.path.exists(output_path):
        try:
            with open(output_path, "r", encoding="utf-8") as f:
                seeded = json.load(f)
                print(f"[engine.seed] Found {len(seeded)} existing seeded challenges.")
        except Exception:
            seeded = []

    needed = target_count - len(seeded)
    if needed <= 0:
        print(f"[engine.seed] Target of {target_count} already reached!")
        return seeded

    print(f"[engine.seed] Need to generate {needed} more verified challenges...")
    task_idx = len(seeded) % len(SEED_TASKS)

    while len(seeded) < target_count:
        task, bug_type = SEED_TASKS[task_idx % len(SEED_TASKS)]
        task_idx += 1

        print(f"\n[engine.seed] [{len(seeded)+1}/{target_count}] Generating '{task}' with '{bug_type}'...")
        ch, meta = generate_challenge(task=task, bug_type=bug_type)

        if ch and meta.get("verified"):
            ch_dict = ch.model_dump()
            seeded.append(ch_dict)
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(seeded, f, indent=2)
            print(f"[engine.seed] Saved challenge {ch.id} (total: {len(seeded)}/{target_count})")
        else:
            print(f"[engine.seed] Skipped failed challenge, moving to next candidate.")

    total_attempts = GENERATION_LOGS["total_attempts"]
    successful = GENERATION_LOGS["successful_challenges"]
    pass_rate = (successful / total_attempts * 100) if total_attempts else 0
    print(f"\n==========================================")
    print(f"SEEDING COMPLETE! Total verified: {len(seeded)}")
    print(f"Harness Stats: {successful}/{total_attempts} attempts passed ({pass_rate:.1f}%)")
    print(f"Saved to: {output_path}")
    print(f"==========================================")
    return seeded


if __name__ == "__main__":
    seed_challenges()
