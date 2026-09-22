// ==========================================================================
// Reverse Code Arena — Frontend Controller (Vanilla JS)
// Grounded in Zhang (WSU, 2026) and Zhao et al. (EPFL/UTokyo, 2026)
// ==========================================================================

let currentChallenge = null;
let selected_line = null;
let lineClickCount = 0;
let stagnationTimer = null;
let challengeStartTime = null;

// Determine API Base URL (works both when served via FastAPI and file://)
const API_BASE = window.location.origin.includes('localhost:8000') || window.location.origin.includes('127.0.0.1:8000')
  ? ''
  : 'http://localhost:8000';

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  const refreshBtn = document.getElementById('btn-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      fetchChallenge();
    });
  }

  // Submit button
  const submitBtn = document.getElementById('btn-submit');
  if (submitBtn) {
    submitBtn.addEventListener('click', handleAttemptSubmit);
  }

  // Modal actions
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

  // Toast close
  const toastClose = document.getElementById('toast-close');
  if (toastClose) {
    toastClose.addEventListener('click', () => {
      document.getElementById('stagnation-toast').style.display = 'none';
    });
  }

  fetchChallenge();
}

/**
 * Fetch challenge from GET /api/challenge
 */
async function fetchChallenge() {
  const codeContainer = document.getElementById('code-container');
  const taskDescEl = document.getElementById('task-desc');
  const testPillsList = document.getElementById('test-pills-list');
  const funcNameEl = document.getElementById('function-name');
  const bugBadgeEl = document.getElementById('bug-type-badge');
  const serverStatus = document.getElementById('server-status');

  // Reset state
  selected_line = null;
  lineClickCount = 0;
  challengeStartTime = Date.now();
  updateSelectedLineUI(null);
  clearFormInputs();
  hideStagnationNudge();
  closeResultModal();

  // Reset stagnation timer (90 seconds - Zhang Ch. 3 & 4)
  if (stagnationTimer) clearInterval(stagnationTimer);
  stagnationTimer = setInterval(checkStagnation, 5000);

  // Show loading indicator
  codeContainer.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <span>Fetching challenge from API...</span>
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
    bugBadgeEl.textContent = `bug: ${challenge.bug_type}`;
    taskDescEl.textContent = challenge.task_description;

    // Render passing tests
    renderPassingTests(challenge.passing_tests);

    // Render code with clickable line numbers
    renderCode(challenge.code);

    if (serverStatus) {
      serverStatus.textContent = 'API: Connected (http://localhost:8000)';
      serverStatus.style.color = 'var(--accent-emerald)';
    }
  } catch (error) {
    console.error('Error fetching challenge:', error);
    codeContainer.innerHTML = `
      <div class="loading-state">
        <span style="color: var(--accent-rose); font-weight: 600;">Failed to load challenge</span>
        <span style="font-size: 0.8rem; color: var(--text-muted);">${error.message}</span>
        <button class="btn btn-secondary" onclick="fetchChallenge()" style="margin-top: 0.5rem;">
          Try Again
        </button>
      </div>
    `;

    if (serverStatus) {
      serverStatus.textContent = 'API: Disconnected / Error';
      serverStatus.style.color = 'var(--accent-rose)';
    }
  }
}

/**
 * Render passing test cases as pills
 */
function renderPassingTests(passingTests) {
  const testPillsList = document.getElementById('test-pills-list');
  if (!passingTests || passingTests.length === 0) {
    testPillsList.innerHTML = `<span class="test-pill">No test cases available</span>`;
    return;
  }

  testPillsList.innerHTML = passingTests.map((t, idx) => {
    const inputFormatted = Array.isArray(t.input) && t.input.length === 1
      ? JSON.stringify(t.input[0])
      : JSON.stringify(t.input);
    const expectedFormatted = JSON.stringify(t.expected);
    return `<span class="test-pill">Test ${idx + 1}: input=${inputFormatted} ➔ ${expectedFormatted}</span>`;
  }).join('');
}

/**
 * Render code lines in an interactive table
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

    // Line number column (gutter)
    const lineNumCell = document.createElement('td');
    lineNumCell.className = 'code-line-num';
    lineNumCell.textContent = lineNum;

    // Code content column
    const codeContentCell = document.createElement('td');
    codeContentCell.className = 'code-line-content';
    codeContentCell.textContent = lineText;

    row.appendChild(lineNumCell);
    row.appendChild(codeContentCell);

    // Click handler to select line
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
  // Clear previous selection
  document.querySelectorAll('.code-row.selected').forEach(el => {
    el.classList.remove('selected');
  });

  // Highlight newly selected line
  rowElement.classList.add('selected');
  selected_line = lineNum;
  lineClickCount++;

  // Auto-prefill replacement line with the selected code
  const fixInput = document.getElementById('input-fix');
  if (fixInput && (!fixInput.value || fixInput.dataset.autoPrefilled === 'true')) {
    fixInput.value = lineText;
    fixInput.dataset.autoPrefilled = 'true';
  }

  // Update UI indicators
  updateSelectedLineUI(lineNum);

  // Check if multiple erratic clicks suggest struggle
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

  if (lineNum !== null && lineNum !== undefined) {
    indicator.textContent = `Selected: Line ${lineNum}`;
    indicator.style.color = 'var(--accent-cyan)';
    indicator.style.borderColor = 'var(--accent-cyan)';
    formSelectedLine.textContent = `Line ${lineNum}`;
    formSelectedLine.style.color = 'var(--accent-cyan)';
  } else {
    indicator.textContent = 'No line selected';
    indicator.style.color = 'var(--text-dim)';
    indicator.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    formSelectedLine.textContent = 'None selected (click a line in code)';
    formSelectedLine.style.color = 'var(--text-dim)';
  }
}

function clearFormInputs() {
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
  if (!challengeStartTime || !currentChallenge) return;
  const elapsedSeconds = (Date.now() - challengeStartTime) / 1000;
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
    start at the function entry point with input <code>${firstTest}</code>. Trace intermediate variable states line-by-line to form a concrete hypothesis!
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
    alert('Please provide your explanation or expected/observed behavior.');
    return;
  }

  // Construct full fixed code by substituting the single line
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
    submitBtn.textContent = 'Submit & Grade Attempt';
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

  // Verdict Banner (Separating fixing from understanding!)
  if (result.verdict === 'found_and_understood') {
    verdictTitle.textContent = 'Outstanding Comprehension!';
    verdictTag.textContent = 'FOUND & UNDERSTOOD ✓';
    verdictTag.className = 'verdict-status-label status-success';
    verdictDesc.textContent = 'You identified the exact fault and correctly articulated the underlying flawed mental model.';
  } else if (result.verdict === 'found_not_understood') {
    verdictTitle.textContent = 'The "Copilot Shortcut" Trap!';
    verdictTag.textContent = 'FOUND BUT NOT UNDERSTOOD ⚠️';
    verdictTag.className = 'verdict-status-label status-warning';
    verdictDesc.textContent = 'You fixed the line or test, but your explanation missed the flawed assumption. You patched without true understanding!';
  } else if (result.verdict === 'not_found_but_understood') {
    verdictTitle.textContent = 'Good Concept, Wrong Line';
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
