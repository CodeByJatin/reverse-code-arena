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

// ==========================================================================
// Toast Notification System (replaces all alert() calls)
// ==========================================================================
function showToast(message, type = 'info', durationMs = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };
  const toast = document.createElement('div');
  toast.className = `toast-notification toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span class="toast-body">${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 280);
  }, durationMs);
}

// ==========================================================================
// Confirmation Dialog (replaces confirm() for End Exercise)
// ==========================================================================
function showConfirm(title, message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-card">
      <h3>${title}</h3>
      <p>${message}</p>
      <div class="confirm-actions">
        <button class="btn btn-secondary" id="confirm-cancel">Keep Going</button>
        <button class="btn btn-primary" id="confirm-yes">End Exercise</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#confirm-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#confirm-yes').addEventListener('click', () => {
    overlay.remove();
    onConfirm();
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// ==========================================================================
// Celebration Confetti (on found_and_understood verdict)
// ==========================================================================
function playCelebration() {
  // Emoji burst
  const badge = document.createElement('div');
  badge.className = 'celebration-badge';
  badge.textContent = '🎉';
  document.body.appendChild(badge);
  setTimeout(() => badge.remove(), 1300);

  // Canvas confetti
  const canvas = document.getElementById('celebration-canvas');
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const particles = [];
  const colors = ['#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#3b82f6', '#ffffff', '#fbbf24'];

  for (let i = 0; i < 80; i++) {
    particles.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 200,
      y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 16,
      vy: Math.random() * -14 - 4,
      size: Math.random() * 6 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 12,
      life: 1,
    });
  }

  let frame = 0;
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    for (const p of particles) {
      if (p.life <= 0) continue;
      alive = true;
      p.x += p.vx;
      p.vy += 0.35;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;
      p.life -= 0.012;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    frame++;
    if (alive && frame < 120) requestAnimationFrame(animate);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(animate);
}

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

  // 5.1. Category Selector Dropdown
  const catSelect = document.getElementById('select-category');
  if (catSelect) {
    catSelect.addEventListener('change', () => {
      const modeName = catSelect.options[catSelect.selectedIndex].text;
      showToast(`Practice mode switched: ${modeName}`, 'info', 2500);
      fetchChallenge(true);
    });
  }

  // 5.2. Session Memory Modal Controls
  const memoryBtn = document.getElementById('btn-memory');
  if (memoryBtn) {
    memoryBtn.addEventListener('click', openMemoryModal);
  }
  const closeMemoryBtn = document.getElementById('btn-close-memory');
  if (closeMemoryBtn) {
    closeMemoryBtn.addEventListener('click', closeMemoryModal);
  }
  const downloadMemBtn = document.getElementById('btn-download-memory');
  if (downloadMemBtn) {
    downloadMemBtn.addEventListener('click', downloadMemoryFile);
  }

  // Initial fetch of session memory stats
  refreshMemoryState();

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
  const fixInputEl = document.getElementById('input-fix');
  if (fixInputEl) {
    fixInputEl.addEventListener('input', () => {
      fixInputEl.dataset.autoPrefilled = 'false';
    });
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
      showConfirm(
        'End Exercise & Reveal Solution?',
        'Ending the exercise will unlock the author\'s flawed assumption, edge case test, and verified 1-line surgical fix.',
        () => endExerciseSession()
      );
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
      closeMemoryModal();
    }
  });

  // Auto-skip briefing on repeat visits
  if (localStorage.getItem('rca_briefing_seen') === 'true') {
    const briefingModal = document.getElementById('briefing-modal');
    if (briefingModal) briefingModal.style.display = 'none';
    isSessionActive = true;
    challengeStartTime = Date.now();
    if (stagnationTimer) clearInterval(stagnationTimer);
    stagnationTimer = setInterval(checkStagnation, 5000);
  }

  // Preload initial challenge data in background
  fetchChallenge(false);
}

let isThemeTransitioning = false;

/**
 * Initialize Light / Dark Mode Toggle with persistence & circular ripple transition
 */
function initTheme() {
  const savedTheme = localStorage.getItem('rca_theme') || 'dark';
  applyTheme(savedTheme);

  const toggleBtn = document.getElementById('btn-theme-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      if (isThemeTransitioning) return;
      const isCurrentlyLight = document.body.classList.contains('theme-light');
      const targetTheme = isCurrentlyLight ? 'dark' : 'light';
      toggleThemeWithCircularTransition(targetTheme, e);
    });
  }
}

/**
 * Perform circular expanding (dark -> light) and collapsing (light -> dark) view transition
 */
function toggleThemeWithCircularTransition(targetTheme, event) {
  // If View Transitions API is not supported or user prefers reduced motion
  if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    applyTheme(targetTheme);
    localStorage.setItem('rca_theme', targetTheme);
    return;
  }

  isThemeTransitioning = true;
  const toggleBtn = document.getElementById('btn-theme-toggle');
  let x = window.innerWidth - 80;
  let y = 27;

  if (toggleBtn) {
    const rect = toggleBtn.getBoundingClientRect();
    x = rect.left + rect.width / 2;
    y = rect.top + rect.height / 2;
  }

  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );

  const transitionClass = targetTheme === 'light' ? 'theme-transition-to-light' : 'theme-transition-to-dark';
  document.documentElement.classList.add(transitionClass);

  const transition = document.startViewTransition(() => {
    applyTheme(targetTheme);
    localStorage.setItem('rca_theme', targetTheme);
  });

  transition.ready.then(() => {
    if (targetTheme === 'light') {
      // Dark to Light: Light starts from the button and expands outward in a circle to full screen
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`
          ]
        },
        {
          duration: 650,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          pseudoElement: '::view-transition-new(root)'
        }
      );
    } else {
      // Light to Dark: Light collapses from the outer edges of the screen inward into the button
      document.documentElement.animate(
        {
          clipPath: [
            `circle(${endRadius}px at ${x}px ${y}px)`,
            `circle(0px at ${x}px ${y}px)`
          ]
        },
        {
          duration: 650,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          pseudoElement: '::view-transition-old(root)'
        }
      );
    }
  }).catch((err) => {
    console.warn('View transition animation warning:', err);
  });

  transition.finished.finally(() => {
    document.documentElement.classList.remove(transitionClass);
    isThemeTransitioning = false;
  });
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

  localStorage.setItem('rca_briefing_seen', 'true');

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
  hintStage = 0;  // Issue 8: reset escalating hint stage for new challenge
  updateSelectedLineUI(null);
  resetForm();
  hideStagnationNudge();
  closeResultModal();

  if (startTimer) {
    isSessionActive = true;
    isPaused = false;
    challengeStartTime = Date.now();
    totalPausedDuration = 0;
    if (stagnationTimer) clearInterval(stagnationTimer);
    stagnationTimer = setInterval(checkStagnation, 5000);
  }

  const refreshBtn = document.getElementById('btn-refresh');
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.style.opacity = '0.6';
  }

  // Show loading state in editor
  codeContainer.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <span>Loading challenge specification and verified source...</span>
    </div>
  `;

  try {
    const categorySelect = document.getElementById('select-category');
    const selectedCat = categorySelect ? categorySelect.value : 'adaptive';
    let challengeUrl = `${API_BASE}/api/challenge`;
    if (selectedCat && selectedCat !== 'adaptive') {
      challengeUrl += `?category=${encodeURIComponent(selectedCat)}`;
    } else {
      challengeUrl += `?adaptive=true`;
    }

    const response = await fetch(challengeUrl);
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
  } finally {
    const refreshBtn = document.getElementById('btn-refresh');
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.style.opacity = '1';
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
    fixInput.value = lineText.trim();
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
    if (indicator) {
      indicator.textContent = `Selected: Line ${lineNum}`;
      indicator.classList.add('active-selected');
      indicator.style.color = '';
      indicator.style.borderColor = '';
    }

    if (formSelectedLine) {
      formSelectedLine.textContent = `Line ${lineNum}`;
      formSelectedLine.classList.add('active-selected');
      formSelectedLine.style.color = '';
    }

    if (emptyState) emptyState.style.display = 'none';
    if (activeForm) activeForm.style.display = 'flex';
  } else {
    if (indicator) {
      indicator.textContent = 'Click a line to locate fault';
      indicator.classList.remove('active-selected');
      indicator.style.color = '';
      indicator.style.borderColor = '';
    }

    if (formSelectedLine) {
      formSelectedLine.textContent = 'No line selected';
      formSelectedLine.classList.remove('active-selected');
      formSelectedLine.style.color = '';
    }

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

/* ==========================================================================
   Issue 8 — 3-Stage Escalating Hints per Bug Type
   ========================================================================== */
const HINT_STAGES = {
  off_by_one: [
    null, // Stage 1 uses the generic tracing nudge
    "Focus on the loop's stop condition. Does your <code>range()</code> reach the last element? Try tracing with the smallest possible input — a single-item list.",
    "The bug is on a single line controlling how many iterations run. Compare your loop boundary against the edge-case input: the iteration stops one step too early."
  ],
  int_division: [
    null,
    "Check whether you're using <code>/</code> (float) or <code>//</code> (integer floor). Trace the function with a value that does not divide evenly — what does each operator return?",
    "The bug is a division operator choice. Verify which rounding behaviour the contract requires when the inputs don't divide cleanly."
  ],
  boundary_inclusive: [
    null,
    "Is the comparison <code>&lt;</code> or <code>&lt;=</code>? Trace the function with the value exactly at the threshold — does the condition include or exclude it?",
    "The bug is a single comparison character. Check whether the spec says 'strictly greater than' or 'at least equal to' the boundary value."
  ],
  mutable_default: [
    null,
    "Call the function twice with the same arguments in your head. Does the second call start with a fresh accumulator, or does it remember the first call's data?",
    "Default argument objects in Python are created once at function definition, not on every call. The bug is that the mutable default is shared across all calls."
  ],
  shallow_copy: [
    null,
    "Mutate a nested element after calling the function. Does the original structure change? Python's <code>list(x)</code> only copies the outer list's references.",
    "The bug is that the copy only clones the outer container. Inner objects are still shared references — modifying them affects both copies."
  ]
};

let hintStage = 0;

function showStagnationNudge() {
  const toast = document.getElementById('stagnation-toast');
  const msg = document.getElementById('stagnation-msg');
  if (!toast || !msg || !currentChallenge) return;

  const firstTest = currentChallenge.passing_tests && currentChallenge.passing_tests[0]
    ? JSON.stringify(currentChallenge.passing_tests[0].input)
    : 'sample input';

  const bugType = currentChallenge.bug_type || 'off_by_one';
  const stages = HINT_STAGES[bugType] || HINT_STAGES['off_by_one'];

  if (hintStage === 0 || !stages[hintStage]) {
    // Stage 1: Generic G4 tracing nudge (Zhang, 2026)
    msg.innerHTML = `
      <strong>Systematic Tracing Protocol (Zhang, 2026):</strong> Rather than repeatedly scanning the entire file,
      anchor at the function entry point using input <code>${escapeHtml(firstTest)}</code>. Trace variable states line-by-line to verify your hypothesis.
    `;
  } else {
    // Stage 2/3: Bug-type specific escalating hint
    msg.innerHTML = `<strong>Targeted Hint (Stage ${hintStage + 1}):</strong> ${stages[hintStage]}`;
  }

  hintStage = Math.min(hintStage + 1, stages.length - 1);

  // Remove any leftover closing animation before showing
  toast.classList.remove('closing');
  toast.style.display = 'block';
}

function hideStagnationNudge() {
  const toast = document.getElementById('stagnation-toast');
  if (!toast || toast.style.display === 'none') return;
  // Issue 3: Slide-down animation before hiding
  toast.classList.add('closing');
  setTimeout(() => {
    toast.style.display = 'none';
    toast.classList.remove('closing');
  }, 310);
}

/**
 * Handle student attempt submission
 * Issue 9: inline field validation with shake
 * Issue 10: optimistic UI — instant feedback while LLM grades
 */
async function handleAttemptSubmit() {
  if (!selected_line) {
    showToast('Please click on a code line in the inspector to select the fault location.', 'warning');
    return;
  }

  const expInput   = document.getElementById('input-expected').value.trim();
  const obsInput   = document.getElementById('input-observed').value.trim();
  const explInput  = document.getElementById('input-explanation').value.trim();
  const fixInput   = document.getElementById('input-fix').value.trim();
  const submitBtn  = document.getElementById('btn-submit');

  // Issue 9 — Inline field-level validation instead of ugly toast
  const anyHypothesis = expInput || obsInput || explInput;
  if (!anyHypothesis) {
    // Shake and highlight every hypothesis field
    const fields = [
      { groupId: 'input-expected',     parentSelector: '#input-expected' },
      { groupId: 'input-observed',     parentSelector: '#input-observed' },
      { groupId: 'input-explanation',  parentSelector: '#input-explanation' },
    ];
    fields.forEach(({ parentSelector }) => {
      const input = document.querySelector(parentSelector);
      if (!input) return;
      const group = input.closest('.field-group');
      if (!group) return;
      group.classList.add('field-error');
      // Add error message if not already present
      if (!group.querySelector('.field-error-msg')) {
        const errMsg = document.createElement('span');
        errMsg.className = 'field-error-msg';
        errMsg.textContent = '⚠ Describe what you think went wrong before submitting.';
        group.appendChild(errMsg);
      }
      // Remove after 3s so user can try again cleanly
      setTimeout(() => {
        group.classList.remove('field-error');
        const msg = group.querySelector('.field-error-msg');
        if (msg) msg.remove();
      }, 3000);
    });
    // Scroll first empty field into view
    const firstInput = document.querySelector('#input-expected');
    if (firstInput) firstInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  // Clear any lingering validation errors
  document.querySelectorAll('.field-error').forEach(g => {
    g.classList.remove('field-error');
    const msg = g.querySelector('.field-error-msg');
    if (msg) msg.remove();
  });

  // Construct full fixed code by replacing the selected line
  let fullFixedCode = '';
  if (selected_line >= 1 && fixInput) {
    const lines = (currentChallenge.code || '').split('\n');
    if (selected_line <= lines.length) {
      const leadingWhitespace = (lines[selected_line - 1].match(/^\s*/) || [''])[0];
      lines[selected_line - 1] = leadingWhitespace + fixInput;
      fullFixedCode = lines.join('\n');
    }
  }

  const payload = {
    challenge_id:      currentChallenge.id,
    selected_line:     selected_line,
    expected_behavior: expInput,
    observed_flaw:     obsInput,
    explanation:       explInput || `${expInput}. ${obsInput}`,
    fixed_code:        fullFixedCode,
  };

  // Issue 10 — Optimistic UI: instant state + staged messages
  submitBtn.disabled = true;
  submitBtn.textContent = 'Checking your fix...';
  const slowTimer = setTimeout(() => {
    if (submitBtn.disabled) submitBtn.textContent = 'Asking tutor...';
  }, 2000);

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
    refreshMemoryState();
  } catch (err) {
    console.error('Submission failed:', err);
    showToast(`Submission error: ${err.message}`, 'error');
  } finally {
    clearTimeout(slowTimer);
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

  // Verdict Banner & Celebration
  if (result.verdict === 'found_and_understood') {
    verdictTitle.textContent = 'Exemplary Comprehension';
    verdictTag.textContent = 'FOUND & UNDERSTOOD';
    verdictTag.className = 'verdict-status-label status-success';
    verdictDesc.textContent = 'You identified the exact defect location and accurately articulated the underlying flawed mental model.';
    playCelebration();
    showToast('🎉 Exemplary Comprehension! Defect identified and verified.', 'success', 4000);
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

  if (det.fix_passes) {
    showToast('✅ Fix Verified! Your code passed the edge-case sandbox test.', 'success', 3500);
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

  // Restore sections that endExerciseSession may have hidden
  const verdictBadgesRow = document.querySelector('.verdict-badges-row');
  const verdictBanner = document.getElementById('verdict-banner');
  const feedbackCard = document.querySelector('.feedback-card');
  const decisionGrid = document.querySelector('.decision-grid');
  if (verdictBadgesRow) verdictBadgesRow.style.display = '';
  if (verdictBanner) verdictBanner.style.display = '';
  if (feedbackCard) feedbackCard.style.display = '';
  if (decisionGrid) decisionGrid.style.display = '';

  // Remove revealed-bug highlights from code editor
  const codeContainer = document.getElementById('code-container');
  if (codeContainer) {
    codeContainer.querySelectorAll('.code-row.revealed-bug').forEach(r => r.classList.remove('revealed-bug'));
  }
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

  isSessionActive = true;
  isPaused = false;

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
    showToast('Could not retrieve solution breakdown from the server.', 'error');
    if (revealBtn) {
      revealBtn.disabled = false;
      revealBtn.textContent = 'Reveal Verified Solution';
    }
  }
}

/**
 * Fully end the current exercise session:
 * 1. Stop session timers and set session inactive
 * 2. Fetch and display the verified solution breakdown
 * 3. Highlight the buggy line in the code editor
 * 4. Present the result modal in "Exercise Concluded" mode
 */
async function endExerciseSession() {
  if (!currentChallenge) return;

  // 1. Stop session
  isSessionActive = false;
  isPaused = false;
  if (stagnationTimer) {
    clearInterval(stagnationTimer);
    stagnationTimer = null;
  }

  // Hide stagnation toast if showing
  const toast = document.getElementById('stagnation-toast');
  if (toast) toast.style.display = 'none';

  // 2. Fetch the verified solution from the backend
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

    // 3. Highlight buggy line in code editor
    const buggyLineNum = data.buggy_line_number;
    if (buggyLineNum) {
      const codeContainer = document.getElementById('code-container');
      if (codeContainer) {
        // Remove any existing selections
        codeContainer.querySelectorAll('.code-row.selected').forEach(r => r.classList.remove('selected'));
        // Add revealed-bug highlight
        const bugRow = codeContainer.querySelector(`.code-row[data-line="${buggyLineNum}"]`);
        if (bugRow) {
          bugRow.classList.add('revealed-bug');
          bugRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }

    // 4. Populate the result modal in "Exercise Concluded" mode
    const modal = document.getElementById('result-modal');
    const verdictTitle = document.getElementById('verdict-title');
    const evalTag = document.getElementById('modal-eval-tag');
    const verdictBadgesRow = document.querySelector('.verdict-badges-row');
    const verdictBanner = document.getElementById('verdict-banner');
    const feedbackCard = document.querySelector('.feedback-card');
    const decisionGrid = document.querySelector('.decision-grid');
    const breakdownBox = document.getElementById('solution-breakdown-box');

    // Update header to "Exercise Concluded"
    if (evalTag) evalTag.textContent = 'Exercise Concluded';
    if (verdictTitle) verdictTitle.textContent = 'Solution & Reference Breakdown';

    // Hide evaluation-specific sections (verdict badges, banner, feedback, grind/surrender cards)
    if (verdictBadgesRow) verdictBadgesRow.style.display = 'none';
    if (verdictBanner) verdictBanner.style.display = 'none';
    if (feedbackCard) feedbackCard.style.display = 'none';
    if (decisionGrid) decisionGrid.style.display = 'none';

    // Populate and show solution breakdown directly
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
    }

    // Update streak badge from response
    if (data.current_streak !== undefined) {
      const streakBadge = document.getElementById('topbar-streak-badge');
      if (streakBadge) streakBadge.textContent = `🔥 Streak: ${data.current_streak}`;
    }

    // Show modal
    if (modal) modal.style.display = 'flex';

  } catch (err) {
    console.error('Failed to end exercise:', err);
    showToast('Could not retrieve solution breakdown from the server.', 'error');
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

/* ==========================================================================
   Dynamic Session Memory (memory.md) Handlers
   ========================================================================== */

let latestMemoryData = null;

/**
 * Fetch and update live session memory & streak indicators
 */
async function refreshMemoryState() {
  try {
    const res = await fetch(`${API_BASE}/api/memory`);
    if (!res.ok) return;

    const data = await res.json();
    latestMemoryData = data;
    const stats = data.stats || {};
    const streak = stats.current_streak || 0;
    const solved = stats.total_solved || 0;
    const total = stats.total_attempts || 0;
    const acc = stats.overall_accuracy || 0;
    const weakest = data.weakest_category || 'boundary_inclusive';

    // 1. Update topbar streak badge
    const topbarStreak = document.getElementById('topbar-streak-badge');
    if (topbarStreak) {
      topbarStreak.textContent = `🔥 Streak: ${streak}`;
      topbarStreak.classList.add('streak-updated');
      setTimeout(() => topbarStreak.classList.remove('streak-updated'), 500);
    }

    // 2. Update modal stats
    const modalStreak = document.getElementById('modal-memory-streak');
    if (modalStreak) modalStreak.textContent = `🔥 Streak: ${streak}`;

    const statSolved = document.getElementById('mem-stat-solved');
    if (statSolved) statSolved.textContent = `${solved}/${total} (${acc}%)`;

    const statStreak = document.getElementById('mem-stat-streak');
    if (statStreak) statStreak.textContent = streak;

    const statTarget = document.getElementById('mem-stat-target');
    if (statTarget) statTarget.textContent = weakest;

    const markdownViewer = document.getElementById('memory-markdown-text');
    if (markdownViewer && data.markdown) {
      markdownViewer.textContent = data.markdown;
    }
  } catch (err) {
    console.error('Failed to refresh memory state:', err);
  }
}

/**
 * Open the Session Memory (memory.md) Modal
 */
function openMemoryModal() {
  const modal = document.getElementById('memory-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  refreshMemoryState();
}

/**
 * Close Session Memory Modal
 */
function closeMemoryModal() {
  const modal = document.getElementById('memory-modal');
  if (modal) modal.style.display = 'none';
}

/**
 * Download memory.md file as local export
 */
function downloadMemoryFile() {
  const mdText = (latestMemoryData && latestMemoryData.markdown)
    ? latestMemoryData.markdown
    : '# Reverse Code Arena — Student Session Memory\nLoading...';

  const blob = new Blob([mdText], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `session_memory_${new Date().toISOString().slice(0, 10)}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

