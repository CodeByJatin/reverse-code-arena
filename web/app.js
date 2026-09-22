// ==========================================================================
// Reverse Code Arena — Professional Workbench Controller (Vanilla JS)
// Grounded in Zhang (WSU, 2026) and Zhao et al. (EPFL/UTokyo, 2026)
// ==========================================================================

let currentChallenge = null;
let selected_line = null;
let lineClickCount = 0;
let stagnationTimer = null;
let challengeStartTime = null;
let totalPausedDuration = 0;
let pauseStartTime = null;
let isSessionActive = false;
let isPaused = false;

// Determine API Base URL
const API_BASE = window.location.origin.includes('localhost:8000') || window.location.origin.includes('127.0.0.1:8000')
  ? ''
  : 'http://localhost:8000';

document.addEventListener('DOMContentLoaded', () => {
  initWorkbench();
});

function initWorkbench() {
  // 1. Context Briefing Start Button
  const startBtn = document.getElementById('btn-start-review');
  if (startBtn) {
    startBtn.addEventListener('click', startReviewSession);
  }

  // 2. Pause / Resume Controls
  const pauseBtn = document.getElementById('btn-pause');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', togglePauseSession);
  }
  const resumeBtn = document.getElementById('btn-resume-review');
  if (resumeBtn) {
    resumeBtn.addEventListener('click', resumeSession);
  }

  // 3. New Task Reload Button
  const refreshBtn = document.getElementById('btn-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      fetchChallenge();
    });
  }

  // 4. Platform Stats Modal
  const statsBtn = document.getElementById('btn-stats');
  if (statsBtn) {
    statsBtn.addEventListener('click', openStatsModal);
  }
  const closeStatsBtn = document.getElementById('btn-close-stats');
  if (closeStatsBtn) {
    closeStatsBtn.addEventListener('click', closeStatsModal);
  }

  // 5. Submit & Reset Actions
  const submitBtn = document.getElementById('btn-submit');
  if (submitBtn) {
    submitBtn.addEventListener('click', handleAttemptSubmit);
  }
  const resetBtn = document.getElementById('btn-reset-form');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetForm);
  }

  // 6. Result Modal Actions
  const nextBtn = document.getElementById('btn-next-challenge');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      closeResultModal();
      fetchChallenge();
    });
  }
  const closeModalBtn = document.getElementById('btn-close-modal');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeResultModal);
  }

  // 7. Scaffolding Drawer Accordion Toggle
  const drawerToggle = document.getElementById('drawer-toggle');
  if (drawerToggle) {
    drawerToggle.addEventListener('click', () => {
      const body = document.getElementById('drawer-body');
      const chevron = drawerToggle.querySelector('.drawer-chevron');
      if (body.style.display === 'none') {
        body.style.display = 'block';
        chevron.textContent = '▾';
      } else {
        body.style.display = 'none';
        chevron.textContent = '▸';
      }
    });
  }

  // 8. Stagnation Toast Close
  const toastClose = document.getElementById('toast-close');
  if (toastClose) {
    toastClose.addEventListener('click', () => {
      document.getElementById('stagnation-toast').style.display = 'none';
    });
  }

  // 9. Keyboard Shortcuts (Ctrl+Enter / Cmd+Enter to submit, Esc to close modals)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (isSessionActive && !isPaused && selected_line) {
        e.preventDefault();
        handleAttemptSubmit();
      }
    } else if (e.key === 'Escape') {
      closeResultModal();
      closeStatsModal();
    }
  });

  // Preload initial challenge data in background
  fetchChallenge(false);
}

/**
 * Start session upon user click on the Welcome Briefing modal
 */
function startReviewSession() {
  const briefingModal = document.getElementById('briefing-modal');
  if (briefingModal) briefingModal.style.display = 'none';

  isSessionActive = true;
  isPaused = false;
  challengeStartTime = Date.now();
  totalPausedDuration = 0;

  // Start the 90s stagnation check timer (Zhang Ch. 3 & 4)
  if (stagnationTimer) clearInterval(stagnationTimer);
  stagnationTimer = setInterval(checkStagnation, 5000);
}

/**
 * Toggle session pause
 */
function togglePauseSession() {
  if (!isSessionActive) return;
  if (!isPaused) {
    isPaused = true;
    pauseStartTime = Date.now();
    document.getElementById('pause-overlay').style.display = 'flex';
  }
}

function resumeSession() {
  if (isPaused) {
    isPaused = false;
    if (pauseStartTime) {
      totalPausedDuration += (Date.now() - pauseStartTime);
      pauseStartTime = null;
    }
    document.getElementById('pause-overlay').style.display = 'none';
  }
}

/**
 * Fetch challenge from GET /api/challenge
 */
async function fetchChallenge(startTimer = true) {
  const codeContainer = document.getElementById('code-container');
  const taskDescEl = document.getElementById('task-desc');
  const funcNameEl = document.getElementById('function-name');
  const bugBadgeEl = document.getElementById('bug-type-badge');
  const testTableBody = document.getElementById('test-table-body');
  const serverStatus = document.getElementById('server-status');

  // Reset state
  selected_line = null;
  lineClickCount = 0;
  updateSelectedLineUI(null);
  resetForm();
  hideStagnationNudge();
  closeResultModal();

  if (startTimer && isSessionActive) {
    challengeStartTime = Date.now();
    totalPausedDuration = 0;
  }

  // Show loading state in editor
  codeContainer.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <span>Loading challenge specification and code...</span>
    </div>
  `;

  try {
    const response = await fetch(`${API_BASE}/api/challenge`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const challenge = await response.json();
    currentChallenge = challenge;

    // Render metadata
    funcNameEl.textContent = `${challenge.function_name}(...)`;
    bugBadgeEl.textContent = `Bug: ${challenge.bug_type}`;
    taskDescEl.textContent = challenge.task_description;

    // Render unit test table
    renderUnitTestTable(challenge.passing_tests, testTableBody);

    // Render code in inspector
    renderCode(challenge.code);

    if (serverStatus) {
      serverStatus.querySelector('.status-dot').style.backgroundColor = 'var(--accent-emerald)';
      serverStatus.querySelector('.status-text').textContent = 'API: Connected';
    }
  } catch (error) {
    console.error('Error fetching challenge:', error);
    codeContainer.innerHTML = `
      <div class="loading-state">
        <span style="color: var(--accent-rose); font-weight: 600;">Failed to load challenge</span>
        <span style="font-size: 0.8rem; color: var(--text-muted);">${error.message}</span>
        <button class="btn btn-secondary" onclick="fetchChallenge(true)" style="margin-top: 0.5rem;">
          Try Again
        </button>
      </div>
    `;

    if (serverStatus) {
      serverStatus.querySelector('.status-dot').style.backgroundColor = 'var(--accent-rose)';
      serverStatus.querySelector('.status-text').textContent = 'API: Disconnected';
    }
  }
}

/**
 * Render passing unit tests into clean table
 */
function renderUnitTestTable(passingTests, tbody) {
  if (!passingTests || passingTests.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No test cases available</td></tr>`;
    return;
  }

  tbody.innerHTML = passingTests.map((t, idx) => {
    const inputFormatted = Array.isArray(t.input) && t.input.length === 1
      ? JSON.stringify(t.input[0])
      : JSON.stringify(t.input);
    const expectedFormatted = JSON.stringify(t.expected);
    return `
      <tr>
        <td style="color: var(--text-dim);">${idx + 1}</td>
        <td><code>${escapeHtml(inputFormatted)}</code></td>
        <td><code>${escapeHtml(expectedFormatted)}</code></td>
        <td><span class="test-pass-tag">PASS &#10003;</span></td>
      </tr>
    `;
  }).join('');
}

/**
 * Render code lines into inspector table with clickable gutters
 */
function renderCode(codeString) {
  const codeContainer = document.getElementById('code-container');
  if (!codeString) {
    codeContainer.innerHTML = `<div class="loading-state">No code provided.</div>`;
    return;
  }

  const lines = codeString.split('\n');
  const table = document.createElement('table');
  table.className = 'code-table';
  const tbody = document.createElement('tbody');

  lines.forEach((lineText, index) => {
    const lineNum = index + 1;
    const row = document.createElement('tr');
    row.className = 'code-row';
    row.dataset.line = lineNum;

    // Line number gutter
    const lineNumCell = document.createElement('td');
    lineNumCell.className = 'code-line-num';
    lineNumCell.textContent = lineNum;

    // Code text
    const codeContentCell = document.createElement('td');
    codeContentCell.className = 'code-line-content';
    codeContentCell.textContent = lineText;

    row.appendChild(lineNumCell);
    row.appendChild(codeContentCell);

    row.addEventListener('click', () => {
      selectLine(lineNum, lineText, row);
    });

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  codeContainer.innerHTML = '';
  codeContainer.appendChild(table);
}

/**
 * Handle line selection
 */
function selectLine(lineNum, lineText, rowElement) {
  document.querySelectorAll('.code-row.selected').forEach(el => {
    el.classList.remove('selected');
  });

  rowElement.classList.add('selected');
  selected_line = lineNum;
  lineClickCount++;

  // Auto-prefill replacement line input with selected code
  const fixInput = document.getElementById('input-fix');
  if (fixInput && (!fixInput.value || fixInput.dataset.autoPrefilled === 'true')) {
    fixInput.value = lineText;
    fixInput.dataset.autoPrefilled = 'true';
  }

  // Update UI indicators & switch console from empty state to active form
  updateSelectedLineUI(lineNum);

  // Focus the first hypothesis input
  const expInput = document.getElementById('input-expected');
  if (expInput) expInput.focus();

  // Trigger stagnation warning if user clicks >= 4 lines erratically
  if (lineClickCount >= 4) {
    showStagnationNudge();
  }
}

/**
 * Update UI banners and indicators for selected line
 */
function updateSelectedLineUI(lineNum) {
  const indicator = document.getElementById('selected-indicator');
  const formSelectedLine = document.getElementById('form-selected-line');
  const emptyState = document.getElementById('console-empty-state');
  const activeForm = document.getElementById('attempt-form');

  if (lineNum !== null && lineNum !== undefined) {
    indicator.textContent = `Selected: Line ${lineNum}`;
    indicator.style.color = 'var(--accent-cyan)';
    indicator.style.borderColor = 'var(--accent-cyan)';

    formSelectedLine.textContent = `Line ${lineNum}`;
    formSelectedLine.style.color = 'var(--accent-cyan)';

    if (emptyState) emptyState.style.display = 'none';
    if (activeForm) activeForm.style.display = 'flex';
  } else {
    indicator.textContent = 'Click a line to locate fault';
    indicator.style.color = 'var(--accent-cyan)';
    indicator.style.borderColor = 'rgba(56, 189, 248, 0.2)';

    formSelectedLine.textContent = 'No line selected';
    formSelectedLine.style.color = 'var(--text-dim)';

    if (emptyState) emptyState.style.display = 'flex';
    if (activeForm) activeForm.style.display = 'none';
  }
}

function resetForm() {
  const exp = document.getElementById('input-expected');
  const obs = document.getElementById('input-observed');
  const expl = document.getElementById('input-explanation');
  const fix = document.getElementById('input-fix');

  if (exp) exp.value = '';
  if (obs) obs.value = '';
  if (expl) expl.value = '';
  if (fix) {
    fix.value = '';
    fix.dataset.autoPrefilled = 'false';
  }
}

/**
 * Feature 2: Anti-Stagnation Scaffold (Zhang Ch. 3 & 4)
 */
function checkStagnation() {
  if (!isSessionActive || isPaused || !challengeStartTime || !currentChallenge) return;
  const elapsedSeconds = (Date.now() - challengeStartTime - totalPausedDuration) / 1000;
  if (elapsedSeconds >= 90) {
    showStagnationNudge();
  }
}

function showStagnationNudge() {
  const toast = document.getElementById('stagnation-toast');
  const msg = document.getElementById('stagnation-msg');
  if (!toast || !msg || !currentChallenge) return;

  const firstTest = currentChallenge.passing_tests && currentChallenge.passing_tests[0]
    ? JSON.stringify(currentChallenge.passing_tests[0].input)
    : 'sample input';

  msg.innerHTML = `
    <strong>Stuck in a reading loop? (Zhang, 2026):</strong> Rather than scanning the whole file repeatedly, 
    start at the function entry point with input <code>${escapeHtml(firstTest)}</code>. Trace intermediate variable states line-by-line to form a concrete hypothesis!
  `;
  toast.style.display = 'block';
}

function hideStagnationNudge() {
  const toast = document.getElementById('stagnation-toast');
  if (toast) toast.style.display = 'none';
}

/**
 * Handle student attempt submission
 */
async function handleAttemptSubmit() {
  if (!selected_line) {
    alert('Please click on a code line to select where the bug is located.');
    return;
  }

  const expInput = document.getElementById('input-expected').value.trim();
  const obsInput = document.getElementById('input-observed').value.trim();
  const explInput = document.getElementById('input-explanation').value.trim();
  const fixInput = document.getElementById('input-fix').value.trim();
  const submitBtn = document.getElementById('btn-submit');

  if (!explInput && !expInput && !obsInput) {
    alert('Please enter your hypothesis or explanation before submitting.');
    return;
  }

  // Construct full fixed code by replacing the selected line
  const lines = (currentChallenge.code || '').split('\n');
  if (selected_line >= 1 && selected_line <= lines.length && fixInput) {
    lines[selected_line - 1] = fixInput;
  }
  const fullFixedCode = lines.join('\n');

  const payload = {
    challenge_id: currentChallenge.id,
    selected_line: selected_line,
    expected_behavior: expInput,
    observed_flaw: obsInput,
    explanation: explInput || `${expInput}. ${obsInput}`,
    fixed_code: fullFixedCode,
  };

  submitBtn.disabled = true;
  submitBtn.textContent = 'Evaluating with Dual-Axis Engine...';

  try {
    const response = await fetch(`${API_BASE}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    renderResultModal(result);
  } catch (err) {
    console.error('Submission failed:', err);
    alert(`Submission error: ${err.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '⚡ Submit Analysis & Verify Fix';
  }
}

/**
 * Render Dual-Axis Results Modal
 */
function renderResultModal(result) {
  const modal = document.getElementById('result-modal');
  const verdictTitle = document.getElementById('verdict-title');
  const badgeDetection = document.getElementById('badge-detection');
  const badgeComprehension = document.getElementById('badge-comprehension');
  const detectionText = document.getElementById('detection-text');
  const comprehensionText = document.getElementById('comprehension-text');
  const verdictTag = document.getElementById('verdict-tag');
  const verdictDesc = document.getElementById('verdict-desc');
  const feedbackEl = document.getElementById('modal-feedback');

  const det = result.detection;
  const comp = result.comprehension;

  // Axis 1: Detection
  if (det.line_correct) {
    detectionText.textContent = 'Bug Located ✓';
    badgeDetection.className = 'verdict-badge badge-success';
  } else if (det.near_miss) {
    detectionText.textContent = 'Near Miss (±1 Line)';
    badgeDetection.className = 'verdict-badge badge-warning';
  } else {
    detectionText.textContent = 'Wrong Line ✗';
    badgeDetection.className = 'verdict-badge badge-danger';
  }

  // Axis 2: Comprehension
  comprehensionText.textContent = `Score: ${comp.score} / 3`;
  if (comp.score >= 2) {
    badgeComprehension.className = 'verdict-badge badge-success';
  } else if (comp.score === 1) {
    badgeComprehension.className = 'verdict-badge badge-warning';
  } else {
    badgeComprehension.className = 'verdict-badge badge-danger';
  }

  // Verdict Banner
  if (result.verdict === 'found_and_understood') {
    verdictTitle.textContent = 'Outstanding Comprehension!';
    verdictTag.textContent = 'FOUND & UNDERSTOOD ✓';
    verdictTag.className = 'verdict-status-label status-success';
    verdictDesc.textContent = 'You identified the exact fault and correctly articulated the underlying flawed mental model.';
  } else if (result.verdict === 'found_not_understood') {
    verdictTitle.textContent = 'The "Copilot Shortcut" Trap!';
    verdictTag.textContent = 'FOUND BUT NOT UNDERSTOOD ⚠️';
    verdictTag.className = 'verdict-status-label status-warning';
    verdictDesc.textContent = 'You patched the code/line without articulating the author\'s false assumption. You treated the symptom rather than understanding the cause!';
  } else if (result.verdict === 'not_found_but_understood') {
    verdictTitle.textContent = 'Conceptual Grasp, Mislocated Line';
    verdictTag.textContent = 'UNDERSTOOD BUT NOT LOCATED';
    verdictTag.className = 'verdict-status-label status-info';
    verdictDesc.textContent = 'You understood the conceptual issue, but pinpointed the wrong code statement.';
  } else {
    verdictTitle.textContent = 'Missed Bug & Flaw';
    verdictTag.textContent = 'NEITHER FOUND NOR UNDERSTOOD ✗';
    verdictTag.className = 'verdict-status-label status-danger';
    verdictDesc.textContent = 'Both the line selection and the conceptual explanation missed the defect.';
  }

  feedbackEl.textContent = comp.feedback || 'Evaluation completed.';
  modal.style.display = 'flex';
}

function closeResultModal() {
  const modal = document.getElementById('result-modal');
  if (modal) modal.style.display = 'none';
}

/**
 * Platform Stats Modal Handler
 */
async function openStatsModal() {
  const modal = document.getElementById('stats-modal');
  if (!modal) return;

  modal.style.display = 'flex';

  try {
    const res = await fetch(`${API_BASE}/api/stats`);
    if (res.ok) {
      const data = await res.json();
      const passRate = data.generation_verification?.verification_pass_rate || '100%';
      const leakRate = data.adversarial_robustness_benchmark?.arena_leakage_rate || '0.0%';
      const totalAttempts = data.attempts_summary?.total || 0;

      document.getElementById('stat-pass-rate').textContent = passRate;
      document.getElementById('stat-leak-rate').textContent = leakRate;
      document.getElementById('stat-total-attempts').textContent = totalAttempts;
    }
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

function closeStatsModal() {
  const modal = document.getElementById('stats-modal');
  if (modal) modal.style.display = 'none';
}

function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
