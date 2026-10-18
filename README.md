# Reverse Code Arena

> **Real-World Code Auditing and AI Technical Interview Platform.**
> Shifting developer assessment from writing boilerplate code to evaluating, auditing, and verifying AI-generated logic for production reliability.

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![WebAssembly](https://img.shields.io/badge/Runtime-Pyodide_WASM-654FF0?style=flat&logo=webassembly&logoColor=white)](https://pyodide.org)
[![TinyFish](https://img.shields.io/badge/Ingestion-TinyFish_API-0284c7?style=flat)](https://tinyfish.ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 1. Overview & Core Philosophy

In the modern software engineering landscape, **AI models (Copilot, ChatGPT, Claude) can generate syntax and boilerplate in seconds**. Writing code from scratch is no longer the primary bottleneck in engineering.

Instead, the real-world responsibility of a software engineer has shifted:
- **Can the engineer audit AI-generated code?**
- **Is the AI's logic sound, or does it conceal catastrophic edge-case failures?**
- **Will this code break downstream production services under real traffic?**

Traditional competitive programming and DSA platforms (such as LeetCode and HackerRank) only test whether a candidate can write algorithms from scratch. They **never evaluate whether an engineer can inspect existing complex code, trace multi-file dependencies, audit flawed assumptions, or defend their engineering reasoning**.

**Reverse Code Arena** flips the paradigm: developers step into the role of **Code Auditors and System Debuggers**.

---

## 2. Key Platform Capabilities

### 2.1. Problems Catalog with Multi-Select Filtering
- **Live Performance Summary**: Real-time tracking of Total Solved, Total Score, and percentage progress bars.
- **Multi-Select Filter Matrix**:
  - **Difficulty**: Easy (30 pts), Medium (50 pts), Hard (80 pts)
  - **Language**: Python, C++, Java, TypeScript, Go
  - **Dynamic Topics**: Filter across enterprise services (e.g., `APIMiddleware`, `PricingEngine`, `TokenBucketRateLimiter`, `DatabaseCursorPagination`).
- **Real-Time Search**: Instant filtering across problem titles, modules, and keywords.
- **Status Filter**: Toggle between `All`, `Unsolved`, and `Solved`.

### 2.2. Tiered Challenge Spectrum
1. **Easy Tier**: 1–2 line surgical fixes isolating flawed assumptions in critical functions (e.g., off-by-one errors, boundary condition oversights, integer division truncations).
2. **Medium Tier**: Multi-file state and logic debugging, tracing defective variables and interactions across 2–3 connected modules.
3. **Hard Tier**: Full platform-level debugging simulating complex multi-service architectures, where auxiliary services or web applications run in isolated tabs.

### 2.3. In-Browser Pyodide WebAssembly Sandbox
- **Instant Execution**: Code runs directly in the client's browser via **Pyodide WebAssembly**.
- **Zero Latency, Zero Server Cost**: Eliminates heavy Docker container sandboxes for core test suites, enabling sub-millisecond execution.
- **Action Toolbar**: Dedicated controls for `Run` (custom parameter inputs), `Test` (suite verification), `Reset` (restore snippet), and `Submit Fix`.

### 2.4. Socratic Hint Ladder
- **Friction-Preserving Clues**: Multi-level progressive hints provide diagnostic guiding questions without revealing the answer, ensuring engineers experience authentic problem-solving friction.
- **Dynamic Penalty Scoring**: Unlocking hints deducts points from the challenge's potential reward, incentivizing independent hypothesis testing.

### 2.5. Post-Submission AI Technical Interview Mode
- Once automated tests pass, the platform initiates an **AI Technical Interview**:
  - Probes *why* the original code failed in production.
  - Asks the engineer to evaluate potential side effects and computational trade-offs.
  - Verifies authentic comprehension, preventing rote guesses or blind AI copy-pasting.

### 2.6. TinyFish URL-to-Challenge Ingestion Utility
- **1-Click Web Bug Importer**: Powered by **TinyFish Fetch API**.
- When an instructor or interviewer wants to import a real-world bug from an engineering post-mortem, GitHub issue, or technical article:
  - TinyFish renders the dynamic page via cloud Chromium and extracts clean, token-efficient Markdown without HTML or script bloat.
  - The backend pipeline converts the incident report directly into a playable challenge with automated test suites.

### 2.7. Professional Glassmorphism UI (100% Emoji-Free)
- Built with a modern, distraction-free aesthetic using SVG vector iconography.
- Full support for **Dark Mode** and **Light Mode** themes.

---

## 3. Architecture

```
reverse-code-arena/
|
├── api/
|   └── main.py              # FastAPI backend: /api/challenge, /api/catalog, /api/submit, /api/reveal, /api/stats
|
├── engine/
|   ├── auth.py              # Token authentication & secure session management
|   ├── catalogue.py         # Bug categorization & flawed assumption templates
|   ├── generate.py          # Structured challenge synthesis
|   ├── grade.py             # Dual-axis evaluation & test verification
|   ├── memory.py            # Engineer session telemetry & dynamic profiles
|   ├── seed.py              # Challenge pre-generation harness
|   └── stress_test.py       # Adversarial robustness testing
|
├── web/
|   ├── index.html           # Single-page application: Catalog view, IDE workbench, modals
|   ├── style.css            # Glassmorphism design system (Dark & Light themes)
|   └── app.js               # Client controller: Pyodide WASM runner, filter engine, telemetry
|
├── data/
|   ├── seeded.json          # Verified production challenges
|   └── tasks.json           # Curated challenge domain specifications
|
├── schemas.py               # Pydantic contracts & schemas
└── requirements.txt         # Project dependencies
```

---

## 4. API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/catalog` | Returns all available challenges, user solved statuses, total score, and active topics. |
| `GET` | `/api/challenge?id={id}` | Returns public challenge specification, examples, and starter code (hidden answers stripped). |
| `POST` | `/api/submit` | Evaluates a code fix against unit tests and logs telemetry. |
| `POST` | `/api/reveal` | Unlocks author's flawed assumption, edge-case test input, and surgical fix. |
| `GET` | `/api/stats` | Platform performance telemetry, pass rates, and user scores. |
| `POST` | `/api/auth/login` | Authenticates engineer credentials and returns session token. |
| `POST` | `/api/auth/signup` | Creates a new engineer account with telemetry profile. |
| `POST` | `/api/auth/logout` | Terminates active session. |

---

## 5. Getting Started

### Prerequisites
- Python 3.10+
- Modern Web Browser (Chrome, Firefox, Edge, Safari)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/CodeByJatin/reverse-code-arena.git
   cd reverse-code-arena
   ```

2. **Create and activate a virtual environment**:
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Start the application**:
   ```bash
   python -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --reload
   ```

5. **Open the Arena**:
   Navigate to `http://127.0.0.1:8000` in your web browser.

---

## 6. Target Audience & Impact

- **Software Engineers**: Transition from passive prompt copy-pasters to high-leverage code reviewers who can confidently audit AI-written pull requests.
- **Hiring Managers & Technical Recruiters**: Conduct uncheatable, realistic technical interviews that reflect modern software engineering work.
- **Computer Science Educators**: Provide lab environments where students learn by debugging authentic failure modes in production systems.

---

## 7. License

MIT License. See [LICENSE](LICENSE) for full details.
