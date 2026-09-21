"""
Bug Catalogue for Reverse Code Arena.
5 MVP bug types grounded in empirical research on common flawed assumptions.
"""

from typing import Dict, Any

BUG_CATALOGUE: Dict[str, Dict[str, Any]] = {
    "off_by_one": {
        "name": "Loop bound off by one",
        "flawed_assumption": "range() covers the last element or boundary element",
        "description": "Loop boundary excludes the last element or iterates one time too many/few (e.g. range(len(arr) - 1) instead of range(len(arr))).",
        "edge_case_trigger": "Single element input, or target element placed at the very last index.",
    },
    "mutable_default": {
        "name": "Mutable default argument",
        "flawed_assumption": "Default arguments in function signatures are re-instantiated on each function call",
        "description": "Using a mutable default value (like def f(item, acc=[])) causes state accumulation across multiple invocations.",
        "edge_case_trigger": "Calling the function twice sequentially without providing the optional default argument.",
    },
    "shallow_copy": {
        "name": "Shallow copy of nested structure",
        "flawed_assumption": "Creating a shallow copy (list(x) or x[:]) duplicates inner nested containers",
        "description": "Mutating a sub-element inside a shallow-copied list or dictionary unexpectedly alters the original structure.",
        "edge_case_trigger": "Modifying a nested element and expecting original outer container to remain unchanged.",
    },
    "int_division": {
        "name": "Integer division / premature truncation",
        "flawed_assumption": "Integer division (//) preserves precision or truncation before rounding yields expected results",
        "description": "Dividing integers with / vs // or doing intermediate floor division before completing arithmetic operations.",
        "edge_case_trigger": "Values that do not divide evenly (e.g. 5 / 2 vs 5 // 2).",
    },
    "boundary_inclusive": {
        "name": "Boundary condition inclusive vs exclusive",
        "flawed_assumption": "A boundary threshold is strictly greater/less when it should include the boundary value (or vice versa)",
        "description": "Using > instead of >= (or < instead of <=) in threshold evaluation or filter boundaries.",
        "edge_case_trigger": "A test value exactly equal to the boundary threshold.",
    },
}


def get_bug_type(bug_id: str) -> Dict[str, Any]:
    """Retrieve bug specification by id."""
    if bug_id not in BUG_CATALOGUE:
        raise ValueError(f"Unknown bug_type: {bug_id}. Available: {list(BUG_CATALOGUE.keys())}")
    return BUG_CATALOGUE[bug_id]


def list_bug_types() -> list[str]:
    """List all available bug type IDs."""
    return list(BUG_CATALOGUE.keys())
