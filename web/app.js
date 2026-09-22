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
let gritRetriesCount = parseInt(localStorage.getItem('rca_grit_retries') || '0', 10);

// Determine API Base URL
const API_BASE = window.location.origin.includes('localhost:8000') || window.location.origin.includes('127.0.0.1:8000')
  ? ''
  : 'http://localhost:8000';

document.addEventListener('DOMContentLoaded', () => {
  initWorkbench();
});

function updateGritUI() {
  const topbarGrit = document.getElementById('topbar-grit-badge');
  const modalGrit = document.getElementById('modal-grit-count');
  const label = `Grit: ${gritRetriesCount} ${gritRetriesCount === 1 ? 'Retry' : 'Retries'}`;
  if (topbarGrit) topbarGrit.textContent = label;
  if (modalGrit) modalGrit.textContent = label;
}

function initWorkbench() {
  // Update Grit UI from memory
  updateGritUI();

  // 1. Theme Mode Management (Light / Dark with localStorage persistence)
  initTheme();

  // 2. Tab Navigation System
  initTabs();

  // 3. Context Briefing Start Button
  const startBtn = document.getElementById('btn-start-review');
  if (startBtn) {
    startBtn.addEventListener('click', startReviewSession);
  }

  // 4. Pause / Resume Controls
  const pauseBtn = document.getElementById('btn-pause');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', togglePauseSession);
  }
  const resumeBtn = document.getElementById('btn-resume-review');
  if (resumeBtn) {
    resumeBtn.addEventListener('click', resumeSession);
  }

  // 5. New Task Reload Button
  const refreshBtn = document.getElementById('btn-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      fetchChallenge();
    });
  }

  // 6. Platform Stats Modal
  const statsBtn = document.getElementById('btn-stats');
  if (statsBtn) {
    statsBtn.addEventListener('click', openStatsModal);
  }
  const closeStatsBtn = document.getElementById('btn-close-stats');
  if (closeStatsBtn) {
    closeStatsBtn.addEventListener('click', closeStatsModal);
  }

  // 7. Submit & Reset Actions
  const submitBtn = document.getElementById('btn-submit');
  if (submitBtn) {
    submitBtn.addEventListener('click', handleAttemptSubmit);
  }
  const resetBtn = document.getElementById('btn-reset-form');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetForm);
  }

  // 8. Result Modal Actions
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

  // 9. Grind Mode & Reveal Solution Actions
  const retryGrindBtn = document.getElementById('btn-retry-grind');
  if (retryGrindBtn) {
    retryGrindBtn.addEventListener('click', handleRetryGrind);
  }
  const revealBtn = document.getElementById('btn-reveal-solution');
  if (revealBtn) {
    revealBtn.addEventListener('click', handleRevealSolution);
  }
  const topbarRevealBtn = document.getElementById('btn-topbar-reveal');
  if (topbarRevealBtn) {
    topbarRevealBtn.addEventListener('click', () => {
      if (!currentChallenge) return;
      const modal = document.getElementById('result-modal');
      if (modal) modal.style.display = 'flex';
      handleRevealSolution();
    });
  }

  // 10. Stagnation Toast Close
  const toastClose = document.getElementById('toast-close');
  if (toastClose) {
    toastClose.addEventListener('click', () => {
      document.getElementById('stagnation-toast').style.display = 'none';
    });
  }

  // 11. Keyboard Shortcuts (Ctrl+Enter / Cmd+Enter to submit, Esc to close modals)
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
 * Initialize Light / Dark Mode Toggle with persistence
 */
function initTheme() {
  const savedTheme = localStorage.getItem('rca_theme') || 'dark';
  applyTheme(savedTheme);

  const toggleBtn = document.getElementById('btn-theme-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const isCurrentlyLight = document.body.classList.contains('theme-light');
      const targetTheme = isCurrentlyLight ? 'dark' : 'light';
      applyTheme(targetTheme);
      localStorage.setItem('rca_theme', targetTheme);
    });
  }
}

function applyTheme(theme) {
  const themeText = document.getElementById('theme-text');
  const toggleBtn = document.getElementById('btn-theme-toggle');

  if (theme === 'light') {
    document.body.classList.add('theme-light');
    if (themeText) themeText.textContent = 'Dark Mode';
    if (toggleBtn) {
      toggleBtn.title = 'Switch to Dark Mode (Solid Black)';
      toggleBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
        <span id="theme-text">Dark Mode</span>
      `;
    }
  } else {
    document.body.classList.remove('theme-light');
    if (themeText) themeText.textContent = 'Light Mode';
    if (toggleBtn) {
      toggleBtn.title = 'Switch to Light Mode (Warm Beige)';
      toggleBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
        <span id="theme-text">Light Mode</span>
      `;
    }
  }
}

/**
 * Initialize Tabbed Interface in the Left Pane
 */
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTabId = btn.getAttribute('data-tab');
      if (!targetTabId) return;

      tabButtons.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const targetPane = document.getElementById(targetTabId);
      if (targetPane) targetPane.classList.add('active');
    });
  });
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
  const specBugBadge = document.getElementById('spec-bug-badge');
  const testTableBody = document.getElementById('test-table-body');
  const testCountBadge = document.getElementById('test-count-badge');
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
      <span>Loading challenge specification and verified source...</span>
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
    if (specBugBadge) {
      specBugBadge.textContent = challenge.bug_type;
    }
    taskDescEl.textContent = challenge.task_description;

    // Render unit test table & update badge count
    renderUnitTestTable(challenge.passing_tests, testTableBody);
    if (testCountBadge && challenge.passing_tests) {
      testCountBadge.textContent = challenge.passing_tests.length;
    }

    // Render code in inspector
    renderCode(challenge.code);

    if (serverStatus) {
      serverStatus.querySelector('.status-dot').style.backgroundColor = 'var(--accent-emerald)';
      serverStatus.querySelector('.status-text').textContent = 'Connected';
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
      serverStatus.querySelector('.status-text').textContent = 'Disconnected';
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
        <td><span class="test-pass-tag">PASS</span></td>
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
    indicator.style.color = '#ffffff';
    indicator.style.borderColor = 'rgba(255, 255, 255, 0.4)';

    formSelectedLine.textContent = `Line ${lineNum}`;
    formSelectedLine.style.color = '#ffffff';

    if (emptyState) emptyState.style.display = 'none';
    if (activeForm) activeForm.style.display = 'flex';
  } else {
    indicator.textContent = 'Click a line to locate fault';
    indicator.style.color = '#ffffff';
    indicator.style.borderColor = 'rgba(255, 255, 255, 0.18)';

    formSelectedLine.textContent = 'No line selected';
    formSelectedLine.style.color = 'var(--text-muted)';

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
    <strong>Systematic Tracing Protocol (Zhang, 2026):</strong> Rather than repeatedly scanning the entire file, 
    anchor at the function entry point using input <code>${escapeHtml(firstTest)}</code>. Trace variable states line-by-line to verify your hypothesis.
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
    alert('Please click on a code line in the inspector to select the fault location.');
    return;
  }

  const expInput = document.getElementById('input-expected').value.trim();
  const obsInput = document.getElementById('input-observed').value.trim();
  const explInput = document.getElementById('input-explanation').value.trim();
  const fixInput = document.getElementById('input-fix').value.trim();
  const submitBtn = document.getElementById('btn-submit');

  if (!explInput && !expInput && !obsInput) {
    alert('Please enter your analysis or hypothesis before submitting.');
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
    submitBtn.textContent = 'Submit Analysis & Verify Fix';
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
    detectionText.textContent = 'Fault Located';
    badgeDetection.className = 'verdict-badge badge-success';
  } else if (det.near_miss) {
    detectionText.textContent = 'Near Miss (±1 Line)';
    badgeDetection.className = 'verdict-badge badge-warning';
  } else {
    detectionText.textContent = 'Incorrect Line';
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
    verdictTitle.textContent = 'Exemplary Comprehension';
    verdictTag.textContent = 'FOUND & UNDERSTOOD';
    verdictTag.className = 'verdict-status-label status-success';
    verdictDesc.textContent = 'You identified the exact defect location and accurately articulated the underlying flawed mental model.';
  } else if (result.verdict === 'found_not_understood') {
    verdictTitle.textContent = 'Superficial Patch Identified';
    verdictTag.textContent = 'FOUND BUT NOT UNDERSTOOD';
    verdictTag.className = 'verdict-status-label status-warning';
    verdictDesc.textContent = 'You selected the faulty line without articulating the author\'s underlying misconception. This is the common "patch without understanding" pattern.';
  } else if (result.verdict === 'not_found_but_understood') {
    verdictTitle.textContent = 'Conceptual Grasp, Mislocated Line';
    verdictTag.textContent = 'UNDERSTOOD BUT NOT LOCATED';
    verdictTag.className = 'verdict-status-label status-info';
    verdictDesc.textContent = 'Your mental model accurately diagnosed the failure mode, but pinpointed the wrong code statement.';
  } else {
    verdictTitle.textContent = 'Defect Missed';
    verdictTag.textContent = 'NOT FOUND OR UNDERSTOOD';
    verdictTag.className = 'verdict-status-label status-danger';
    verdictDesc.textContent = 'Neither the line selection nor the conceptual rationale identified the defect.';
  }

  feedbackEl.textContent = comp.feedback || 'Evaluation completed.';

  // Reset Solution Breakdown Box state
  const breakdownBox = document.getElementById('solution-breakdown-box');
  if (breakdownBox) breakdownBox.style.display = 'none';

  const revealBtn = document.getElementById('btn-reveal-solution');
  if (revealBtn) {
    revealBtn.disabled = false;
    revealBtn.textContent = 'Reveal Verified Solution';
  }

  // Update Grit counts in UI
  updateGritUI();

  modal.style.display = 'flex';
}

function closeResultModal() {
  const modal = document.getElementById('result-modal');
  if (modal) modal.style.display = 'none';
}

/**
 * Handle user choosing the 'Grind Mode: Try Again' option
 * Increments persistence metric, logs to memory, and re-focuses form with scaffolding
 */
function handleRetryGrind() {
  gritRetriesCount++;
  localStorage.setItem('rca_grit_retries', gritRetriesCount);
  updateGritUI();
  closeResultModal();

  // Highlight and focus the expected behavior input
  const expInput = document.getElementById('input-expected');
  if (expInput) {
    expInput.focus();
    expInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Trigger anti-stagnation nudge with concrete tracing hint
  showStagnationNudge();
}

/**
 * Handle user choosing 'End Exercise & Reveal Solution'
 * Fetches verified solution, 1-line fix, and author's flawed assumption from backend
 */
async function handleRevealSolution() {
  if (!currentChallenge) return;

  const revealBtn = document.getElementById('btn-reveal-solution');
  if (revealBtn) {
    revealBtn.disabled = true;
    revealBtn.textContent = 'Retrieving Verified Solution...';
  }

  try {
    const resp = await fetch(`${API_BASE}/api/reveal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge_id: currentChallenge.id }),
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }

    const data = await resp.json();

    const breakdownBox = document.getElementById('solution-breakdown-box');
    const msgEl = document.getElementById('breakdown-pedagogical-msg');
    const buggyLineEl = document.getElementById('breakdown-buggy-line');
    const correctLineEl = document.getElementById('breakdown-correct-line');
    const assumptionEl = document.getElementById('breakdown-assumption');
    const edgeTestEl = document.getElementById('breakdown-edge-test');

    if (msgEl) msgEl.textContent = data.pedagogical_message;
    if (buggyLineEl) buggyLineEl.textContent = `Line ${data.buggy_line_number}`;
    if (correctLineEl) correctLineEl.textContent = data.correct_line;
    if (assumptionEl) assumptionEl.textContent = data.flawed_assumption;
    if (edgeTestEl) {
      const inp = data.edge_case_test && data.edge_case_test.input ? JSON.stringify(data.edge_case_test.input) : 'N/A';
      const exp = data.edge_case_test && data.edge_case_test.expected !== undefined ? JSON.stringify(data.edge_case_test.expected) : 'N/A';
      edgeTestEl.textContent = `Input: ${inp} => Expected: ${exp}`;
    }

    if (breakdownBox) {
      breakdownBox.style.display = 'flex';
      breakdownBox.scrollIntoView({ behavior: 'smooth' });
    }

    if (revealBtn) {
      revealBtn.textContent = 'Solution Unlocked';
      revealBtn.disabled = true;
    }
  } catch (err) {
    console.error('Failed to reveal solution:', err);
    alert('Could not retrieve solution breakdown from the server.');
    if (revealBtn) {
      revealBtn.disabled = false;
      revealBtn.textContent = 'Reveal Verified Solution';
    }
  }
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
