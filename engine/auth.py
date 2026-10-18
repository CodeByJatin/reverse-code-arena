"""
Authentication and User Management Module for Reverse Code Arena.
Handles user registration, password hashing (SHA-256 + salt),
token-based session verification, and per-user directory initialization.
"""

import os
import json
import re
import hashlib
import secrets
from datetime import datetime
from typing import Dict, Any, Optional, Tuple

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
USERS_REGISTRY_PATH = os.path.join(ROOT_DIR, "data", "users.json")
USERS_DIR = os.path.join(ROOT_DIR, "data", "users")

# In-memory active session tokens: token -> { "username": username, "created_at": iso_str }
ACTIVE_SESSIONS: Dict[str, Dict[str, Any]] = {}


def _ensure_storage_initialized():
    """Ensure data/ and data/users/ exist and data/users.json is present."""
    os.makedirs(USERS_DIR, exist_ok=True)
    if not os.path.exists(USERS_REGISTRY_PATH):
        with open(USERS_REGISTRY_PATH, "w", encoding="utf-8") as f:
            json.dump({}, f, indent=2)


def _load_users() -> Dict[str, Dict[str, Any]]:
    """Loads all users from data/users.json."""
    _ensure_storage_initialized()
    try:
        with open(USERS_REGISTRY_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_users(users: Dict[str, Dict[str, Any]]):
    """Saves users dictionary to data/users.json."""
    _ensure_storage_initialized()
    with open(USERS_REGISTRY_PATH, "w", encoding="utf-8") as f:
        json.dump(users, f, indent=2)


def hash_password(password: str, salt: Optional[str] = None) -> Tuple[str, str]:
    """Hashes password with SHA-256 and unique salt."""
    if not salt:
        salt = secrets.token_hex(16)
    hashed = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
    return hashed, salt


def validate_username(username: str) -> Tuple[bool, str]:
    """
    Validates username format and length:
    - 3 to 20 characters
    - Alphanumeric and underscores only
    """
    if not username or not username.strip():
        return False, "Username cannot be empty."
    
    clean = username.strip()
    if len(clean) < 3:
        return False, "Username must be at least 3 characters long."
    if len(clean) > 20:
        return False, "Username cannot exceed 20 characters."
    if not re.match(r"^[a-zA-Z0-9_]+$", clean):
        return False, "Username can only contain letters, numbers, and underscores."
    
    return True, ""


def validate_password(password: str) -> Tuple[bool, str]:
    """Validates password minimum length (>= 4 characters)."""
    if not password:
        return False, "Password cannot be empty."
    if len(password) < 4:
        return False, "Password must be at least 4 characters long."
    return True, ""


def get_user_dir(username: str) -> str:
    """Returns absolute path to user's personal data directory, creating it if needed."""
    user_slug = username.strip().lower()
    path = os.path.join(USERS_DIR, user_slug)
    os.makedirs(path, exist_ok=True)
    return path


def signup_user(username: str, password: str) -> Tuple[bool, str, Dict[str, Any]]:
    """
    Registers a new user:
    - Validates username and password
    - Enforces uniqueness (case-insensitive)
    - Initializes user's personal directory and attempts log
    - Returns (success, message, session_data)
    """
    valid_u, err_u = validate_username(username)
    if not valid_u:
        return False, err_u, {}

    valid_p, err_p = validate_password(password)
    if not valid_p:
        return False, err_p, {}

    clean_username = username.strip()
    user_key = clean_username.lower()

    users = _load_users()
    if user_key in users:
        return False, f"Username '{clean_username}' is already taken. Please choose another or log in.", {}

    pwd_hash, salt = hash_password(password)
    user_dir = get_user_dir(user_key)

    # Initialize empty attempts.json in user's directory
    user_attempts_path = os.path.join(user_dir, "attempts.json")
    if not os.path.exists(user_attempts_path):
        with open(user_attempts_path, "w", encoding="utf-8") as f:
            json.dump([], f, indent=2)

    # Register user record
    users[user_key] = {
        "username": clean_username,
        "password_hash": pwd_hash,
        "salt": salt,
        "created_at": datetime.now().isoformat(),
    }
    _save_users(users)

    # Create active session token
    token = secrets.token_hex(24)
    ACTIVE_SESSIONS[token] = {
        "username": clean_username,
        "user_key": user_key,
        "created_at": datetime.now().isoformat(),
    }

    return True, "Account created successfully.", {
        "username": clean_username,
        "token": token,
    }


def login_user(username: str, password: str) -> Tuple[bool, str, Dict[str, Any]]:
    """
    Authenticates an existing user:
    - Case-insensitive username lookup
    - Salted hash verification
    - Returns (success, message, session_data)
    """
    if not username or not username.strip():
        return False, "Please enter your username.", {}
    if not password:
        return False, "Please enter your password.", {}

    user_key = username.strip().lower()
    users = _load_users()

    if user_key not in users:
        return False, f"Username '{username.strip()}' does not exist. Please sign up first.", {}

    user_data = users[user_key]
    salt = user_data.get("salt", "")
    expected_hash = user_data.get("password_hash", "")

    test_hash, _ = hash_password(password, salt=salt)
    if test_hash != expected_hash:
        return False, "Incorrect password. Please try again.", {}

    # Ensure personal directory exists
    get_user_dir(user_key)

    # Issue session token
    token = secrets.token_hex(24)
    clean_username = user_data.get("username", username.strip())
    ACTIVE_SESSIONS[token] = {
        "username": clean_username,
        "user_key": user_key,
        "created_at": datetime.now().isoformat(),
    }

    return True, "Login successful.", {
        "username": clean_username,
        "token": token,
    }


def verify_session(token: Optional[str], username: Optional[str] = None) -> Optional[str]:
    """
    Verifies authentication token or fallback username.
    Returns normalized username (original casing) if valid, otherwise None.
    """
    if token and token in ACTIVE_SESSIONS:
        return ACTIVE_SESSIONS[token]["username"]

    # If valid username provided and exists in registry, permit verification
    if username:
        user_key = username.strip().lower()
        users = _load_users()
        if user_key in users:
            return users[user_key]["username"]

    return None


def invalidate_session(token: str):
    """Logs out by removing active session token."""
    if token in ACTIVE_SESSIONS:
        del ACTIVE_SESSIONS[token]
