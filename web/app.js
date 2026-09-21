// ==========================================================================
// Reverse Code Arena — Frontend Controller (Vanilla JS)
// ==========================================================================

let currentChallenge = null;
let selected_line = null;

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
  updateSelectedLineUI(null);

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
      selectLine(lineNum, row);
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
function selectLine(lineNum, rowElement) {
  // Clear previous selection
  document.querySelectorAll('.code-row.selected').forEach(el => {
    el.classList.remove('selected');
  });

  // Highlight newly selected line
  rowElement.classList.add('selected');
  selected_line = lineNum;

  // Update UI indicators
  updateSelectedLineUI(lineNum);
  console.log(`[Reverse Code Arena] Selected line: ${selected_line}`);
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
