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

// Interactive CodeMirror & Pyodide Runner State
let codeEditor = null;
let selectedLines = new Set();
let originalChallengeCode = '';
let pyodideInstance = null;
let isPyodideLoading = false;
let pyodideStdout = [];

// Progressive Hints & Scoring State
let currentChallengeHints = [];
let currentUnlockedHintsCount = 0;
let currentChallengePotentialPoints = 30;
let currentChallengeBasePoints = 30;

// Authentication & Session State
let currentUser = localStorage.getItem('rca_auth_user') || null;
let currentAuthToken = localStorage.getItem('rca_auth_token') || null;
let currentAuthMode = 'login'; // 'login' | 'signup'

function getAuthHeaders(extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (currentUser) {
    headers['x-user-id'] = currentUser;
  }
  if (currentAuthToken) {
    headers['Authorization'] = `Bearer ${currentAuthToken}`;
  }
  return headers;
}

// Determine API Base URL
const API_BASE = window.location.origin.includes('localhost:8000') || window.location.origin.includes('127.0.0.1:8000')
  ? ''
  : 'http://localhost:8000';

// ==========================================================================
// Authentication UI Management (Login & Sign Up)
// ==========================================================================
function initAuth() {
  const tabLogin = document.getElementById('tab-auth-login');
  const tabSignup = document.getElementById('tab-auth-signup');
  const authForm = document.getElementById('auth-form');
  const userAuthBtn = document.getElementById('btn-user-auth');
  const logoutBtn = document.getElementById('btn-logout');

  if (tabLogin) {
    tabLogin.addEventListener('click', () => setAuthMode('login'));
  }
  if (tabSignup) {
    tabSignup.addEventListener('click', () => setAuthMode('signup'));
  }
  if (userAuthBtn) {
    userAuthBtn.addEventListener('click', () => {
      if (!currentUser) openAuthModal('login');
    });
  }
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  const catalogAuthBtn = document.getElementById('btn-catalog-auth');
  const catalogLogoutBtn = document.getElementById('btn-catalog-logout');
  if (catalogAuthBtn) {
    catalogAuthBtn.addEventListener('click', () => openAuthModal('login'));
  }
  if (catalogLogoutBtn) {
    catalogLogoutBtn.addEventListener('click', handleLogout);
  }
  if (authForm) {
    authForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleAuthSubmit();
    });
  }

  // Check initial login state
  if (currentUser && currentAuthToken) {
    updateAuthUI(currentUser);
    const hash = window.location.hash;
    if (hash && hash.startsWith('#problem/')) {
      const pId = hash.replace('#problem/', '').trim();
      selectProblem(pId);
      loadCatalog(false);
    } else {
      loadCatalog(true);
    }
  } else {
    updateAuthUI(null);
    openAuthModal('login');
  }
}

function setAuthMode(mode) {
  currentAuthMode = mode;
  const tabLogin = document.getElementById('tab-auth-login');
  const tabSignup = document.getElementById('tab-auth-signup');
  const confirmGroup = document.getElementById('auth-group-confirm');
  const submitBtn = document.getElementById('btn-auth-submit');
  const title = document.getElementById('auth-title');
  const subtitle = document.getElementById('auth-subtitle');
  const errorBanner = document.getElementById('auth-error-banner');

  if (errorBanner) errorBanner.style.display = 'none';

  if (mode === 'signup') {
    if (tabLogin) tabLogin.classList.remove('active');
    if (tabSignup) tabSignup.classList.add('active');
    if (confirmGroup) confirmGroup.style.display = 'block';
    if (submitBtn) submitBtn.textContent = 'Create Account & Enter';
    if (title) title.textContent = 'Create Engineer Account';
    if (subtitle) subtitle.textContent = 'Register a unique username to start your personal training record.';
  } else {
    if (tabSignup) tabSignup.classList.remove('active');
    if (tabLogin) tabLogin.classList.add('active');
    if (confirmGroup) confirmGroup.style.display = 'none';
    if (submitBtn) submitBtn.textContent = 'Log In to Workbench';
    if (title) title.textContent = 'Engineer Authentication';
    if (subtitle) subtitle.textContent = 'Log in to record your cognitive fault-localization streaks and dynamic memory profile.';
  }
}

function openAuthModal(defaultMode = 'login') {
  const modal = document.getElementById('auth-modal');
  if (modal) {
    modal.style.display = 'flex';
    setAuthMode(defaultMode);
    const userInput = document.getElementById('auth-input-username');
    if (userInput) userInput.focus();
  }
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal && currentUser) {
    modal.style.display = 'none';
  }
}

function updateAuthUI(username) {
  const topbarUsername = document.getElementById('topbar-username');
  const logoutBtn = document.getElementById('btn-logout');
  const catalogUsername = document.getElementById('catalog-username-val');
  const catalogLogoutBtn = document.getElementById('btn-catalog-logout');

  if (username) {
    if (topbarUsername) topbarUsername.textContent = username;
    if (logoutBtn) logoutBtn.style.display = 'inline-flex';
    if (catalogUsername) catalogUsername.textContent = username;
    if (catalogLogoutBtn) catalogLogoutBtn.style.display = 'inline-flex';
  } else {
    if (topbarUsername) topbarUsername.textContent = 'Log In';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (catalogUsername) catalogUsername.textContent = 'Guest';
    if (catalogLogoutBtn) catalogLogoutBtn.style.display = 'none';
  }
}

async function handleAuthSubmit() {
  const userInput = document.getElementById('auth-input-username');
  const pwdInput = document.getElementById('auth-input-password');
  const confirmInput = document.getElementById('auth-input-confirm');
  const errorBanner = document.getElementById('auth-error-banner');
  const submitBtn = document.getElementById('btn-auth-submit');

  const username = userInput ? userInput.value.trim() : '';
  const password = pwdInput ? pwdInput.value : '';
  const confirmPassword = confirmInput ? confirmInput.value : '';

  function showError(msg) {
    if (errorBanner) {
      errorBanner.textContent = msg;
      errorBanner.style.display = 'block';
    }
  }

  if (errorBanner) errorBanner.style.display = 'none';

  if (!username) {
    showError('Username cannot be empty.');
    if (userInput) userInput.focus();
    return;
  }
  if (username.length < 3) {
    showError('Username must be at least 3 characters.');
    if (userInput) userInput.focus();
    return;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    showError('Username can only contain letters, numbers, and underscores.');
    if (userInput) userInput.focus();
    return;
  }
  if (!password) {
    showError('Password cannot be empty.');
    if (pwdInput) pwdInput.focus();
    return;
  }
  if (password.length < 4) {
    showError('Password must be at least 4 characters.');
    if (pwdInput) pwdInput.focus();
    return;
  }

  if (currentAuthMode === 'signup') {
    if (password !== confirmPassword) {
      showError('Passwords do not match.');
      if (confirmInput) confirmInput.focus();
      return;
    }
  }

  const endpoint = currentAuthMode === 'signup' ? `${API_BASE}/api/auth/signup` : `${API_BASE}/api/auth/login`;
  const payload = {
    username: username,
    password: password,
    confirm_password: confirmPassword,
  };

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying credentials...';
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      showError(data.detail || data.message || 'Authentication failed.');
      return;
    }

    // Success!
    currentUser = data.username;
    currentAuthToken = data.token;
    localStorage.setItem('rca_auth_user', currentUser);
    localStorage.setItem('rca_auth_token', currentAuthToken);

    updateAuthUI(currentUser);
    closeAuthModal();

    showToast(currentAuthMode === 'signup' ? `Welcome to the Arena, ${currentUser}!` : `Welcome back, ${currentUser}!`, 'success', 3500);

    // Open Problems Catalog immediately on login
    loadCatalog(true);
    refreshMemoryState();
  } catch (err) {
    console.error('Auth error:', err);
    showError(`Server error: ${err.message}`);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = currentAuthMode === 'signup' ? 'Create Account & Enter' : 'Log In to Workbench';
    }
  }
}

async function handleLogout() {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
  } catch (e) {
    // Ignore network error on logout
  }

  currentUser = null;
  currentAuthToken = null;
  localStorage.removeItem('rca_auth_user');
  localStorage.removeItem('rca_auth_token');

  // Reset UI and form state
  updateAuthUI(null);
  selected_line = null;
  clearLineSelection();
  resetForm();
  currentChallenge = null;

  // Reset streak badge
  const topbarStreak = document.getElementById('topbar-streak-badge');
  if (topbarStreak) topbarStreak.textContent = 'Streak: 0';

  showToast('Logged out. Please log in or sign up.', 'info', 3000);
  openAuthModal('login');
}

// ==========================================================================
// Toast Notification System (replaces all alert() calls)
// ==========================================================================
function showToast(message, type = 'info', durationMs = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = {
    info: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
    success: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    warning: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    error: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>'
  };
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
  // Canvas confetti only (no childish emoji bursts)
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

  // 5.1. Problems Catalog Controls & Navigation
  initCatalogControls();

  // 5.2. Progressive Hint System Controls
  const unlockHintBtn = document.getElementById('btn-unlock-hint');
  if (unlockHintBtn) {
    unlockHintBtn.addEventListener('click', handleUnlockNextHint);
  }

  // Initial fetch of user stats & points (if already authenticated)
  if (currentUser) {
    refreshUserStats();
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
      switchView('catalog');
      loadCatalog(false);
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

  // 10. Stagnation Toast Close (Fix 3: animated slide-down)
  const toastClose = document.getElementById('toast-close');
  if (toastClose) {
    toastClose.addEventListener('click', () => {
      hideStagnationNudge();
    });
  }

  // 11. Keyboard Shortcuts (Enter on briefing modal, Ctrl+Enter / Cmd+Enter to submit, Esc to close modals)
  document.addEventListener('keydown', (e) => {
    // Fix 11: Press Enter to start code review if briefing modal is displayed
    const briefingModal = document.getElementById('briefing-modal');
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      if (briefingModal && briefingModal.style.display !== 'none' && !briefingModal.classList.contains('hidden')) {
        e.preventDefault();
        startReviewSession();
        return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (isSessionActive && !isPaused) {
        e.preventDefault();
        handleDirectFixSubmit();
      }
    } else if (e.key === 'Escape') {
      closeResultModal();
      closeStatsModal();
      closeMemoryModal();
    }
  });

  // 12. Interactive CodeMirror & Pyodide Runner Controls
  const editorRunBtn = document.getElementById('btn-editor-run');
  if (editorRunBtn) editorRunBtn.addEventListener('click', runCustomInput);

  const editorTestBtn = document.getElementById('btn-editor-test');
  if (editorTestBtn) editorTestBtn.addEventListener('click', runChallengeTests);

  const editorResetBtn = document.getElementById('btn-editor-reset');
  if (editorResetBtn) editorResetBtn.addEventListener('click', resetEditorCode);

  const editorSubmitFixBtn = document.getElementById('btn-editor-submit-fix');
  if (editorSubmitFixBtn) editorSubmitFixBtn.addEventListener('click', handleDirectFixSubmit);

  const clearSelectionBtn = document.getElementById('btn-clear-selection');
  if (clearSelectionBtn) clearSelectionBtn.addEventListener('click', clearLineSelection);

  const runCustomBtn = document.getElementById('btn-run-custom');
  if (runCustomBtn) runCustomBtn.addEventListener('click', runCustomInput);

  const runAllTestsBtn = document.getElementById('btn-run-all-tests');
  if (runAllTestsBtn) runAllTestsBtn.addEventListener('click', runChallengeTests);

  const clearTermBtn = document.getElementById('btn-clear-terminal');
  if (clearTermBtn) clearTermBtn.addEventListener('click', clearTerminal);

  // Preload Pyodide WebAssembly runtime in the background
  initPyodideRuntime();

  // Clear any legacy auto-skip flag so briefing is always presented on entry
  localStorage.removeItem('rca_briefing_seen');

  // Initialize interactive 2-pane draggable resizer (Antigravity-style)
  initPaneResizer();

  // Initialize Authentication & User Session (gates challenge loading)
  initAuth();
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

  if (codeEditor) {
    codeEditor.setOption('theme', theme === 'light' ? 'default' : 'material-darker');
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

// ============================================================================
// LeetCode-Style Problems Catalog & Multi-Select Filter Engine
// ============================================================================

let catalogChallenges = [];
let catalogUserStats = null;
const activeCatalogFilters = {
  diffs: new Set(['easy', 'medium', 'hard']),
  langs: new Set(['python']),
  topics: new Set(),
  status: 'all', // 'all', 'unsolved', 'solved'
  search: '',
};
let currentAppView = 'catalog'; // 'catalog' | 'workspace'

function switchView(viewName) {
  currentAppView = viewName;
  const catalogViewEl = document.getElementById('catalog-view');
  const workspaceViewEl = document.getElementById('workspace-main');
  const challengePillsEl = document.getElementById('topbar-challenge-pills');
  const sessionControlsEl = document.getElementById('workspace-session-controls');
  const navCatalogBtn = document.getElementById('btn-nav-catalog');

  if (viewName === 'catalog') {
    if (catalogViewEl) catalogViewEl.style.display = 'block';
    if (workspaceViewEl) workspaceViewEl.style.display = 'none';
    if (challengePillsEl) challengePillsEl.style.display = 'none';
    if (sessionControlsEl) sessionControlsEl.style.display = 'none';
    if (navCatalogBtn) {
      navCatalogBtn.style.display = 'inline-flex';
      navCatalogBtn.classList.add('active');
    }
    if (window.location.hash !== '#problems') {
      history.replaceState(null, '', '#problems');
    }
  } else {
    if (catalogViewEl) catalogViewEl.style.display = 'none';
    if (workspaceViewEl) workspaceViewEl.style.display = 'flex';
    if (challengePillsEl) challengePillsEl.style.display = 'flex';
    if (sessionControlsEl) sessionControlsEl.style.display = 'flex';
    if (navCatalogBtn) {
      navCatalogBtn.style.display = 'none';
      navCatalogBtn.classList.remove('active');
    }
  }
}

async function loadCatalog(showAfterLoad = true) {
  if (!currentUser) return;
  try {
    const res = await fetch(`${API_BASE}/api/catalog`, { headers: getAuthHeaders() });
    if (res.status === 401) {
      openAuthModal('login');
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    catalogChallenges = data.challenges || [];
    catalogUserStats = data.user_stats || {};

    // 1. Update Hero Card
    const usernameEl = document.getElementById('catalog-username-val');
    if (usernameEl) usernameEl.textContent = currentUser;

    const solvedEl = document.getElementById('catalog-stat-solved');
    const totalEl = document.getElementById('catalog-stat-total');
    const progressFill = document.getElementById('catalog-progress-fill');
    const pointsEl = document.getElementById('catalog-stat-points');

    const totalSolved = catalogUserStats.total_solved || 0;
    const totalCount = catalogChallenges.length || 12;
    const totalPoints = catalogUserStats.total_points || 0;

    if (solvedEl) solvedEl.textContent = totalSolved;
    if (totalEl) totalEl.textContent = totalCount;
    if (pointsEl) pointsEl.textContent = totalPoints;
    if (progressFill) {
      const pct = Math.min(100, Math.round((totalSolved / totalCount) * 100));
      progressFill.style.width = `${pct}%`;
    }

    // Update topbar points
    const topbarPointsVal = document.getElementById('topbar-points-val');
    if (topbarPointsVal) topbarPointsVal.textContent = totalPoints;

    // 2. Populate Topic Chips
    populateTopicChips(data.available_topics || []);

    // 3. Render filtered list
    renderFilteredCatalog();

    if (showAfterLoad) {
      switchView('catalog');
    }
  } catch (err) {
    console.error('Error loading catalog:', err);
  }
}

function populateTopicChips(topics) {
  const container = document.getElementById('filter-topic-chips');
  if (!container) return;
  container.innerHTML = '';

  topics.forEach((topic) => {
    const chip = document.createElement('button');
    chip.className = `multi-chip ${activeCatalogFilters.topics.has(topic) ? 'active' : ''}`;
    chip.textContent = topic;
    chip.dataset.topic = topic;
    chip.addEventListener('click', () => {
      if (activeCatalogFilters.topics.has(topic)) {
        activeCatalogFilters.topics.delete(topic);
        chip.classList.remove('active');
      } else {
        activeCatalogFilters.topics.add(topic);
        chip.classList.add('active');
      }
      renderFilteredCatalog();
    });
    container.appendChild(chip);
  });
}

function renderFilteredCatalog() {
  const tbody = document.getElementById('catalog-table-body');
  const emptyState = document.getElementById('catalog-empty-state');
  const tableWrapper = document.querySelector('.catalog-table-responsive');
  const visibleCountEl = document.getElementById('catalog-visible-count');
  const totalCountEl = document.getElementById('catalog-total-count');

  if (!tbody) return;

  const filtered = catalogChallenges.filter((c) => {
    // 1. Difficulty filter
    const diff = (c.difficulty || 'easy').toLowerCase();
    if (activeCatalogFilters.diffs.size > 0 && !activeCatalogFilters.diffs.has(diff)) {
      return false;
    }

    // 2. Language filter
    const lang = (c.language || 'python').toLowerCase();
    if (activeCatalogFilters.langs.size > 0 && !activeCatalogFilters.langs.has(lang)) {
      return false;
    }

    // 3. Status filter
    if (activeCatalogFilters.status === 'solved' && !c.is_solved) return false;
    if (activeCatalogFilters.status === 'unsolved' && c.is_solved) return false;

    // 4. Topic filter
    if (activeCatalogFilters.topics.size > 0) {
      const matchTopic = Array.from(activeCatalogFilters.topics).some(t => 
        (c.module_tag || '').toLowerCase().includes(t.toLowerCase()) || 
        (c.bug_type || '').toLowerCase().includes(t.toLowerCase())
      );
      if (!matchTopic) return false;
    }

    // 5. Search query
    if (activeCatalogFilters.search) {
      const q = activeCatalogFilters.search.toLowerCase();
      const titleMatch = (c.title || '').toLowerCase().includes(q);
      const modMatch = (c.module_tag || '').toLowerCase().includes(q);
      const descMatch = (c.task_description || '').toLowerCase().includes(q);
      const bugMatch = (c.bug_type || '').toLowerCase().includes(q);
      if (!titleMatch && !modMatch && !descMatch && !bugMatch) {
        return false;
      }
    }

    return true;
  });

  if (visibleCountEl) visibleCountEl.textContent = filtered.length;
  if (totalCountEl) totalCountEl.textContent = catalogChallenges.length;

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    if (emptyState) emptyState.style.display = 'flex';
    if (tableWrapper) tableWrapper.style.display = 'none';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (tableWrapper) tableWrapper.style.display = 'block';

  tbody.innerHTML = filtered.map((c) => {
    const diff = (c.difficulty || 'easy').toLowerCase();
    const diffClass = diff === 'hard' ? 'badge-diff-hard' : (diff === 'medium' ? 'badge-diff-medium' : 'badge-diff-easy');
    const diffLabel = diff.charAt(0).toUpperCase() + diff.slice(1);
    const langLabel = (c.language || 'python').charAt(0).toUpperCase() + (c.language || 'python').slice(1);

    const statusBadge = c.is_solved
      ? `<span class="catalog-status-badge solved">Solved (+${c.points_earned || c.base_points} pts)</span>`
      : `<span class="catalog-status-badge unsolved">Unsolved</span>`;

    const actionBtn = c.is_solved
      ? `<button class="btn-catalog-action review-btn" onclick="event.stopPropagation(); selectProblem('${c.id}')">Review Fix</button>`
      : `<button class="btn-catalog-action" onclick="event.stopPropagation(); selectProblem('${c.id}')">Solve</button>`;

    return `
      <tr class="catalog-table-row" onclick="selectProblem('${c.id}')">
        <td>${statusBadge}</td>
        <td>
          <div class="catalog-title-cell">
            <span class="catalog-problem-title">${escapeHtml(c.title)}</span>
            <span class="catalog-problem-module">${escapeHtml(c.module_tag || 'Module: CoreService')}</span>
          </div>
        </td>
        <td><span class="badge badge-difficulty ${diffClass}">${diffLabel}</span></td>
        <td><strong style="color: #f59e0b; font-family: var(--font-mono);">${c.base_points} pts</strong></td>
        <td><span class="badge" style="font-family: var(--font-mono); font-size: 0.72rem;">${langLabel}</span></td>
        <td style="text-align: right;">${actionBtn}</td>
      </tr>
    `;
  }).join('');
}

function selectProblem(challengeId) {
  switchView('workspace');
  if (window.location.hash !== `#problem/${challengeId}`) {
    history.pushState(null, '', `#problem/${challengeId}`);
  }
  fetchChallenge(false, challengeId);
}

function initCatalogControls() {
  // 1. Search Box
  const searchInput = document.getElementById('catalog-search-input');
  const clearSearchBtn = document.getElementById('btn-catalog-clear-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      activeCatalogFilters.search = searchInput.value.trim();
      if (clearSearchBtn) {
        clearSearchBtn.style.display = searchInput.value ? 'block' : 'none';
      }
      renderFilteredCatalog();
    });
  }
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      activeCatalogFilters.search = '';
      clearSearchBtn.style.display = 'none';
      renderFilteredCatalog();
    });
  }

  // 2. Status Chips
  const statusChips = document.querySelectorAll('.catalog-status-filter .status-chip');
  statusChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      statusChips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      activeCatalogFilters.status = chip.dataset.status || 'all';
      renderFilteredCatalog();
    });
  });

  // 3. Multi-Select Difficulty Chips
  const diffChips = document.querySelectorAll('#filter-difficulty-chips .multi-chip');
  diffChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const diff = chip.dataset.diff;
      if (activeCatalogFilters.diffs.has(diff)) {
        activeCatalogFilters.diffs.delete(diff);
        chip.classList.remove('active');
      } else {
        activeCatalogFilters.diffs.add(diff);
        chip.classList.add('active');
      }
      renderFilteredCatalog();
    });
  });

  // 4. Multi-Select Language Chips
  const langChips = document.querySelectorAll('#filter-language-chips .multi-chip');
  langChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const lang = chip.dataset.lang;
      if (activeCatalogFilters.langs.has(lang)) {
        activeCatalogFilters.langs.delete(lang);
        chip.classList.remove('active');
      } else {
        activeCatalogFilters.langs.add(lang);
        chip.classList.add('active');
      }
      renderFilteredCatalog();
    });
  });

  // 5. Reset Filters
  function resetAllFilters() {
    activeCatalogFilters.diffs = new Set(['easy', 'medium', 'hard']);
    activeCatalogFilters.langs = new Set(['python']);
    activeCatalogFilters.topics.clear();
    activeCatalogFilters.status = 'all';
    activeCatalogFilters.search = '';

    if (searchInput) searchInput.value = '';
    if (clearSearchBtn) clearSearchBtn.style.display = 'none';

    diffChips.forEach((c) => c.classList.add('active'));
    langChips.forEach((c) => {
      if (c.dataset.lang === 'python') c.classList.add('active');
      else c.classList.remove('active');
    });
    statusChips.forEach((c) => {
      if (c.dataset.status === 'all') c.classList.add('active');
      else c.classList.remove('active');
    });

    const topicChips = document.querySelectorAll('#filter-topic-chips .multi-chip');
    topicChips.forEach((c) => c.classList.remove('active'));

    renderFilteredCatalog();
  }

  const resetBtn = document.getElementById('btn-catalog-reset-filters');
  if (resetBtn) resetBtn.addEventListener('click', resetAllFilters);

  const emptyResetBtn = document.getElementById('btn-empty-reset-filters');
  if (emptyResetBtn) emptyResetBtn.addEventListener('click', resetAllFilters);

  // 6. Navigation Buttons: Back to Catalog & Topbar Tab
  const backBtn = document.getElementById('btn-back-to-catalog');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      switchView('catalog');
      loadCatalog(false);
    });
  }

  const navCatalogBtn = document.getElementById('btn-nav-catalog');
  if (navCatalogBtn) {
    navCatalogBtn.addEventListener('click', () => {
      switchView('catalog');
      loadCatalog(false);
    });
  }

  // 7. Hashchange listener for browser back/forward buttons and direct bookmarking
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash;
    if (hash.startsWith('#problem/')) {
      const pId = hash.replace('#problem/', '').trim();
      if (pId && (!currentChallenge || currentChallenge.id !== pId)) {
        selectProblem(pId);
      }
    } else {
      switchView('catalog');
      loadCatalog(false);
    }
  });
}

/**
 * Fetch challenge from GET /api/challenge
 */
async function fetchChallenge(startTimer = true, targetId = null) {
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
  currentChallengeHintLevel = 1;
  clearLineSelection();
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

  // Show loading state in editor without destroying DOM mount
  const mountEl = document.getElementById('code-editor-mount');
  const loadingEl = document.getElementById('editor-loading');
  if (mountEl) mountEl.style.display = 'none';
  if (loadingEl) {
    loadingEl.style.display = 'flex';
    loadingEl.innerHTML = `
      <div class="spinner"></div>
      <span>Loading challenge specification and verified source...</span>
    `;
  }

  try {
    let challengeUrl = `${API_BASE}/api/challenge`;
    if (targetId) {
      challengeUrl += `?id=${encodeURIComponent(targetId)}`;
    }

    const response = await fetch(challengeUrl, { headers: getAuthHeaders() });
    if (response.status === 401) {
      openAuthModal('login');
      return;
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const challenge = await response.json();
    currentChallenge = challenge;

    // Switch view to workspace
    switchView('workspace');

    // Render LeetCode-style specification layout
    renderChallengeSpecification(challenge);

    // Initialize hints ladder for this challenge
    initChallengeHints(challenge);

    // Render code in inspector
    renderCode(challenge.code);

    if (serverStatus) {
      serverStatus.querySelector('.status-dot').style.backgroundColor = 'var(--accent-emerald)';
      serverStatus.querySelector('.status-text').textContent = 'Connected';
    }
  } catch (error) {
    console.error('Error fetching challenge:', error);
    const mountEl = document.getElementById('code-editor-mount');
    const loadingEl = document.getElementById('editor-loading');
    if (mountEl) mountEl.style.display = 'none';
    if (loadingEl) {
      loadingEl.style.display = 'flex';
      loadingEl.innerHTML = `
        <span style="color: var(--accent-rose); font-weight: 600;">Failed to load challenge</span>
        <span style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(error.message)}</span>
        <button class="btn btn-secondary" onclick="fetchChallenge(true)" style="margin-top: 0.5rem;">
          Try Again
        </button>
      `;
    }

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
 * Render LeetCode-style specification layout (Module, Title, Diff badge, Description, Examples, Constraints)
 */
function renderChallengeSpecification(challenge) {
  const funcNameEl = document.getElementById('function-name');
  const moduleTagEl = document.getElementById('spec-module-tag');
  const titleEl = document.getElementById('spec-challenge-title');
  const diffBadgeEl = document.getElementById('spec-difficulty-badge');
  const taskDescEl = document.getElementById('task-desc');
  const examplesContainer = document.getElementById('spec-examples-container');
  const constraintsContainer = document.getElementById('spec-constraints-container');

  if (funcNameEl) funcNameEl.textContent = `${challenge.function_name}(...)`;
  
  // Clean module & title formatting
  const funcWords = (challenge.function_name || 'debug_task').split('_');
  const formattedTitle = challenge.title || funcWords.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  if (titleEl) titleEl.textContent = formattedTitle;
  if (moduleTagEl) moduleTagEl.textContent = challenge.module_tag || `Module: ${funcWords[0] ? funcWords[0].charAt(0).toUpperCase() + funcWords[0].slice(1) : 'Core'}Service`;

  // Difficulty badge & points
  const diff = (challenge.difficulty || 'easy').toLowerCase();
  const topbarDiffEl = document.getElementById('badge-difficulty');
  if (topbarDiffEl) {
    topbarDiffEl.className = 'badge badge-difficulty';
    if (diff === 'hard') {
      topbarDiffEl.classList.add('badge-diff-hard');
      topbarDiffEl.textContent = 'Hard';
    } else if (diff === 'medium' || diff === 'med') {
      topbarDiffEl.classList.add('badge-diff-medium');
      topbarDiffEl.textContent = 'Medium';
    } else {
      topbarDiffEl.classList.add('badge-diff-easy');
      topbarDiffEl.textContent = 'Easy';
    }
  }

  if (diffBadgeEl) {
    diffBadgeEl.className = 'badge badge-difficulty';
    if (diff === 'hard') {
      diffBadgeEl.classList.add('badge-diff-hard');
      diffBadgeEl.textContent = 'Hard (80 pts)';
    } else if (diff === 'medium' || diff === 'med') {
      diffBadgeEl.classList.add('badge-diff-medium');
      diffBadgeEl.textContent = 'Medium (50 pts)';
    } else {
      diffBadgeEl.classList.add('badge-diff-easy');
      diffBadgeEl.textContent = 'Easy (30 pts)';
    }
  }

  // Description
  if (taskDescEl) {
    taskDescEl.innerHTML = `<p>${escapeHtml(challenge.task_description)}</p>`;
  }

  // Structured Examples
  if (examplesContainer) {
    if (challenge.examples && Array.isArray(challenge.examples) && challenge.examples.length > 0) {
      examplesContainer.innerHTML = challenge.examples.map((ex, idx) => `
        <div class="spec-example-card">
          <div class="spec-example-header">Example ${idx + 1}</div>
          <div class="example-row">
            <span class="example-label">Input:</span>
            <span class="example-val">${escapeHtml(typeof ex.input === 'string' ? ex.input : JSON.stringify(ex.input))}</span>
          </div>
          <div class="example-row">
            <span class="example-label">Expected:</span>
            <span class="example-val val-expected">${escapeHtml(typeof ex.expected === 'string' ? ex.expected : JSON.stringify(ex.expected))}</span>
          </div>
          ${ex.observed !== undefined ? `
            <div class="example-row">
              <span class="example-label">Current Bug:</span>
              <span class="example-val val-flaw">${escapeHtml(typeof ex.observed === 'string' ? ex.observed : JSON.stringify(ex.observed))}</span>
            </div>
          ` : ''}
          ${ex.explanation ? `
            <div class="example-explanation">
              <strong>Explanation:</strong> ${escapeHtml(ex.explanation)}
            </div>
          ` : ''}
        </div>
      `).join('');
    } else if (challenge.passing_tests && challenge.passing_tests.length > 0) {
      // Fallback: build structured example cards from passing tests
      examplesContainer.innerHTML = challenge.passing_tests.slice(0, 2).map((t, idx) => {
        const inp = Array.isArray(t.input) && t.input.length === 1 ? t.input[0] : t.input;
        return `
          <div class="spec-example-card">
            <div class="spec-example-header">Example ${idx + 1}</div>
            <div class="example-row">
              <span class="example-label">Input:</span>
              <span class="example-val">${escapeHtml(JSON.stringify(inp))}</span>
            </div>
            <div class="example-row">
              <span class="example-label">Expected:</span>
              <span class="example-val val-expected">${escapeHtml(JSON.stringify(t.expected))}</span>
            </div>
            <div class="example-explanation">
              Baseline contract requirement satisfied by verified correct logic.
            </div>
          </div>
        `;
      }).join('');
    } else {
      examplesContainer.innerHTML = `<div style="font-size: 0.8rem; color: var(--text-muted);">See function contract above.</div>`;
    }
  }

  // Constraints
  if (constraintsContainer) {
    const constraintsList = challenge.constraints && Array.isArray(challenge.constraints) && challenge.constraints.length > 0
      ? challenge.constraints
      : [
          'Python 3.12 standard library only (zero external packages)',
          'Strict deterministic output without global side-effects',
          'Maintain original function signature and parameter types'
        ];
    constraintsContainer.innerHTML = constraintsList.map(c => `
      <li class="constraint-item">
        <span class="constraint-bullet">◆</span>
        <span>${escapeHtml(c)}</span>
      </li>
    `).join('');
  }
}

/**
 * Initialize Hints Ladder for current challenge
 */
function initChallengeHints(challenge) {
  currentUnlockedHintsCount = 0;
  
  const diff = (challenge.difficulty || 'easy').toLowerCase();
  if (diff === 'hard') {
    currentChallengeBasePoints = 80;
    currentChallengePotentialPoints = 80;
  } else if (diff === 'medium' || diff === 'med') {
    currentChallengeBasePoints = 50;
    currentChallengePotentialPoints = 50;
  } else {
    currentChallengeBasePoints = 30;
    currentChallengePotentialPoints = 30;
  }

  // Penalties per tier based on difficulty
  const penaltyTier = currentChallengeBasePoints === 80
    ? [12, 25, 25]
    : currentChallengeBasePoints === 50
      ? [8, 15, 15]
      : [5, 10, 10];

  // Resolve 3 hints for this challenge
  if (challenge.hints && Array.isArray(challenge.hints) && challenge.hints.length === 3) {
    currentChallengeHints = challenge.hints.map((h, i) => ({
      level: i + 1,
      penalty: h.penalty || penaltyTier[i],
      title: h.title || (i === 0 ? 'Mental Tracing Nudge' : i === 1 ? 'Target Invariant' : 'Surgical Logic Clue'),
      text: typeof h === 'string' ? h : (h.text || h.description || '')
    }));
  } else {
    // Generate context-rich fallback hints based on defect class
    const bugType = challenge.bug_type || 'generic';
    const firstTest = challenge.passing_tests && challenge.passing_tests[0]
      ? JSON.stringify(challenge.passing_tests[0].input)
      : 'sample input';

    let h1 = `Start at the entry point of <code>${escapeHtml(challenge.function_name)}</code> with input <code>${escapeHtml(firstTest)}</code>. Trace your loop variables: what is the initial index, and what is the exact final index visited?`;
    let h2 = `Examine boundary evaluation or comparison operators carefully. Does the function satisfy the edge case when inputs are minimal or equal to thresholds?`;
    let h3 = `The bug is a defect in assumption. Check the line that calculates bounds or filters state. A surgical 1-line correction resolves it.`;

    if (typeof HINT_TIERS !== 'undefined' && HINT_TIERS[bugType]) {
      const list = HINT_TIERS[bugType];
      h1 = typeof list[0] === 'function' ? list[0](firstTest) : list[0];
      h2 = typeof list[1] === 'function' ? list[1](firstTest) : list[1];
      h3 = typeof list[2] === 'function' ? list[2](firstTest) : list[2];
    }

    currentChallengeHints = [
      { level: 1, penalty: penaltyTier[0], title: 'Mental Tracing Nudge', text: h1 },
      { level: 2, penalty: penaltyTier[1], title: 'Target Invariant', text: h2 },
      { level: 3, penalty: penaltyTier[2], title: 'Surgical Logic Clue', text: h3 }
    ];
  }

  renderHintsUI();
}

/**
 * Render the hints list & update unlock button
 */
function renderHintsUI() {
  const hintsContainer = document.getElementById('hints-list-container');
  const badgeEl = document.getElementById('hints-count-badge');
  const potentialValEl = document.getElementById('hints-potential-val');
  const unlockBtn = document.getElementById('btn-unlock-hint');
  const unlockBtnText = document.getElementById('btn-unlock-hint-text');

  if (badgeEl) {
    badgeEl.textContent = `${currentUnlockedHintsCount}/3`;
  }
  if (potentialValEl) {
    potentialValEl.textContent = `${currentChallengePotentialPoints} pts`;
  }

  if (hintsContainer) {
    hintsContainer.innerHTML = currentChallengeHints.map((hint, idx) => {
      const isUnlocked = idx < currentUnlockedHintsCount;
      return `
        <div class="hint-card ${isUnlocked ? 'unlocked' : 'locked'}" id="hint-card-${idx + 1}">
          <div class="hint-card-header">
            <span class="hint-tier-tag">
              Hint ${hint.level}: ${escapeHtml(hint.title)}
            </span>
            <span class="hint-penalty-badge">-${hint.penalty} pts</span>
          </div>
          <div class="hint-card-body">
            ${isUnlocked ? hint.text : 'Clue hidden. Click unlock button above to reveal this hint.'}
          </div>
        </div>
      `;
    }).join('');
  }

  if (unlockBtn && unlockBtnText) {
    if (currentUnlockedHintsCount >= 3) {
      unlockBtn.disabled = true;
      unlockBtn.style.opacity = '0.5';
      unlockBtnText.textContent = 'All Hints Unlocked';
    } else {
      unlockBtn.disabled = false;
      unlockBtn.style.opacity = '1';
      const nextHint = currentChallengeHints[currentUnlockedHintsCount];
      unlockBtnText.textContent = `Unlock Hint ${currentUnlockedHintsCount + 1} (-${nextHint.penalty} pts)`;
    }
  }
}

/**
 * Unlock next hint with confirmation modal
 */
function handleUnlockNextHint() {
  if (!currentChallenge || currentUnlockedHintsCount >= 3) return;

  const nextHint = currentChallengeHints[currentUnlockedHintsCount];
  const newPotential = Math.max(5, currentChallengePotentialPoints - nextHint.penalty);

  showConfirm(
    `Unlock Hint ${nextHint.level} (-${nextHint.penalty} pts)?`,
    `Revealing this clue will deduct ${nextHint.penalty} points from your reward on this challenge, reducing your potential reward from ${currentChallengePotentialPoints} pts to ${newPotential} pts.`,
    () => {
      currentUnlockedHintsCount++;
      currentChallengePotentialPoints = newPotential;
      renderHintsUI();
      showToast(`Hint ${nextHint.level} unlocked (-${nextHint.penalty} pts)`, 'info', 2500);
    }
  );
}

/**
 * Refresh user statistics & live topbar points pill
 */
async function refreshUserStats() {
  try {
    const res = await fetch(`${API_BASE}/api/stats`, { headers: getAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      const totalSolved = data.total_solved ?? (data.user_profile?.solved_count ?? 0);
      const totalPoints = data.total_points ?? (data.user_profile?.total_points ?? 0);

      const topbarPoints = document.getElementById('topbar-points-val');
      if (topbarPoints) topbarPoints.textContent = totalPoints;

      const statsSolved = document.getElementById('stats-total-solved');
      if (statsSolved) statsSolved.textContent = totalSolved;

      const statsPoints = document.getElementById('stats-total-points');
      if (statsPoints) statsPoints.textContent = totalPoints;
    }
  } catch (err) {
    console.warn('Failed to refresh user stats:', err);
  }
}

/**
 * Switch Left-Pane active tab programmatically
 */
function switchLeftTab(tabId) {
  const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  if (btn) btn.click();
}

/**
 * Initialize Pyodide WebAssembly runtime in browser
 */
async function initPyodideRuntime() {
  if (pyodideInstance) return pyodideInstance;
  if (isPyodideLoading) return null;
  isPyodideLoading = true;

  const statusPill = document.getElementById('pyodide-status-pill');
  if (statusPill) statusPill.textContent = 'Pyodide: Loading...';

  try {
    if (typeof loadPyodide === 'function') {
      pyodideInstance = await loadPyodide();
      if (statusPill) {
        statusPill.textContent = 'Pyodide: Ready';
        statusPill.style.color = '#10b981';
      }
    } else {
      throw new Error('loadPyodide is not defined');
    }
  } catch (err) {
    console.warn('Pyodide load warning:', err.message);
    if (statusPill) {
      statusPill.textContent = 'Pyodide: Offline';
      statusPill.style.color = '#ef4444';
    }
  } finally {
    isPyodideLoading = false;
  }
  return pyodideInstance;
}

/**
 * Clear Terminal Screen
 */
function clearTerminal() {
  const term = document.getElementById('terminal-stdout');
  if (term) term.textContent = 'Terminal cleared.';
  const results = document.getElementById('runner-test-results');
  if (results) results.style.display = 'none';
}

/**
 * Reset CodeMirror editor to original challenge snippet
 */
function resetEditorCode() {
  if (codeEditor) {
    codeEditor.setValue(originalChallengeCode || '');
    clearLineSelection();
    showToast('Code reset to original challenge state.', 'info', 2000);
  }
}

/**
 * Render code lines into interactive CodeMirror editor
 */
function renderCode(codeString) {
  originalChallengeCode = codeString || '';
  clearLineSelection();

  let mount = document.getElementById('code-editor-mount');
  const loading = document.getElementById('editor-loading');
  const codeContainer = document.getElementById('code-container');

  // Self-heal DOM if mount was somehow destroyed
  if (!mount && codeContainer) {
    codeContainer.innerHTML = `
      <div id="code-editor-mount" style="height: 100%; width: 100%;"></div>
      <div class="loading-state" id="editor-loading" style="display: none;"></div>
    `;
    mount = document.getElementById('code-editor-mount');
    codeEditor = null;
  }

  if (loading) loading.style.display = 'none';
  if (mount) mount.style.display = 'block';

  if (!codeEditor && mount && typeof CodeMirror !== 'undefined') {
    mount.innerHTML = '';
    const isLight = document.body.classList.contains('theme-light');
    codeEditor = CodeMirror(mount, {
      value: codeString || '',
      mode: 'python',
      theme: isLight ? 'default' : 'material-darker',
      lineNumbers: true,
      styleActiveLine: true,
      matchBrackets: true,
      indentUnit: 4,
      tabSize: 4,
      indentWithTabs: false,
      gutters: ['CodeMirror-linenumbers']
    });

    // Toggle multi-line selection on gutter click
    codeEditor.on('gutterClick', (cm, lineIndex) => {
      toggleLineSelection(lineIndex + 1);
    });
  } else if (codeEditor) {
    codeEditor.setValue(codeString || '');
    codeEditor.clearHistory();
    // Clear all line highlights
    for (let i = 0; i < codeEditor.lineCount(); i++) {
      codeEditor.removeLineClass(i, 'background', 'cm-line-selected');
      codeEditor.removeLineClass(i, 'background', 'revealed-bug-cm');
    }
  }

  setTimeout(() => {
    if (codeEditor) codeEditor.refresh();
  }, 60);
}

/**
 * Backward compatibility alias for single line selection reset
 */
function updateSelectedLineUI(lineNum) {
  if (lineNum === null || lineNum === undefined) {
    clearLineSelection();
  } else {
    toggleLineSelection(lineNum);
  }
}

/**
 * Multi-Line Selection Toggler
 */
function toggleLineSelection(lineNum) {
  lineClickCount++;

  if (selectedLines.has(lineNum)) {
    selectedLines.delete(lineNum);
    if (codeEditor) {
      codeEditor.removeLineClass(lineNum - 1, 'background', 'cm-line-selected');
    }
  } else {
    selectedLines.add(lineNum);
    if (codeEditor) {
      codeEditor.addLineClass(lineNum - 1, 'background', 'cm-line-selected');
    }
  }

  // Keep single selected_line synchronized for backward compatibility
  const linesArr = Array.from(selectedLines).sort((a, b) => a - b);
  selected_line = linesArr.length > 0 ? linesArr[0] : null;

  // Auto-prefill replacement line input with selected line code if single line
  const fixInput = document.getElementById('input-fix');
  if (codeEditor && linesArr.length === 1 && fixInput && (!fixInput.value || fixInput.dataset.autoPrefilled === 'true')) {
    const lineText = codeEditor.getLine(linesArr[0] - 1) || '';
    fixInput.value = lineText.trim();
    fixInput.dataset.autoPrefilled = 'true';
  }

  updateSelectedLinesUI();

  if (lineClickCount >= 4) {
    showStagnationNudge();
  }
}

/**
 * Clear All Selected Lines
 */
function clearLineSelection() {
  if (codeEditor) {
    selectedLines.forEach(lineNum => {
      codeEditor.removeLineClass(lineNum - 1, 'background', 'cm-line-selected');
    });
  }
  selectedLines.clear();
  selected_line = null;
  updateSelectedLinesUI();
}

/**
 * Update UI banners and indicators for multiple selected lines
 */
function updateSelectedLinesUI() {
  const indicator = document.getElementById('selected-indicator');
  const clearBtn = document.getElementById('btn-clear-selection');
  const formSelectedLine = document.getElementById('form-selected-line');
  const emptyState = document.getElementById('console-empty-state');
  const activeForm = document.getElementById('attempt-form');

  const linesArr = Array.from(selectedLines).sort((a, b) => a - b);

  if (linesArr.length > 0) {
    const label = linesArr.length === 1 ? `Line ${linesArr[0]}` : `Lines ${linesArr.join(', ')}`;
    if (indicator) {
      indicator.textContent = label;
      indicator.classList.add('active-selected');
    }
    if (clearBtn) clearBtn.style.display = 'inline-flex';
    if (formSelectedLine) {
      formSelectedLine.textContent = label;
      formSelectedLine.classList.add('active-selected');
    }
    if (emptyState) emptyState.style.display = 'none';
    if (activeForm) activeForm.style.display = 'flex';
  } else {
    if (indicator) {
      indicator.textContent = 'Lines: None';
      indicator.classList.remove('active-selected');
    }
    if (clearBtn) clearBtn.style.display = 'none';
    if (formSelectedLine) {
      formSelectedLine.textContent = 'No line selected';
      formSelectedLine.classList.remove('active-selected');
    }
    if (emptyState) emptyState.style.display = 'flex';
    if (activeForm) activeForm.style.display = 'none';
  }
}

/**
 * Execute Current Code with Custom Inputs in Pyodide
 */
async function runCustomInput() {
  if (!codeEditor || !currentChallenge) return;
  const userCode = codeEditor.getValue();
  const rawArgs = (document.getElementById('input-custom-args')?.value || '').trim();

  switchLeftTab('tab-console');

  const term = document.getElementById('terminal-stdout');
  if (term) term.textContent = 'Initializing execution in Pyodide WebAssembly...\n';

  const py = await initPyodideRuntime();
  if (!py) {
    if (term) term.textContent = 'Pyodide WebAssembly runtime is not ready yet. Please wait a moment and try again.';
    return;
  }

  pyodideStdout = [];
  py.setStdout({ batched: (str) => { pyodideStdout.push(str); } });
  py.setStderr({ batched: (str) => { pyodideStdout.push(str); } });

  const fnName = currentChallenge.function_name;
  const pyScript = `
import sys, json

${userCode}

_args = ${rawArgs || '[]'}
if isinstance(_args, tuple):
    _res = ${fnName}(*_args)
elif isinstance(_args, list):
    try:
        _res = ${fnName}(*_args)
    except TypeError:
        _res = ${fnName}(_args)
else:
    _res = ${fnName}(_args)

print("\\n[Execution Finished]")
print(f"Return Value: {repr(_res)}")
`;

  try {
    await py.runPythonAsync(pyScript);
    if (term) term.textContent = pyodideStdout.join('\n');
  } catch (err) {
    if (term) {
      term.textContent = (pyodideStdout.length ? pyodideStdout.join('\n') + '\n\n' : '') +
        `Traceback / Python Error:\n${err.message}`;
    }
  }
}

/**
 * Execute All Challenge Tests against CodeMirror Editor in Pyodide
 */
async function runChallengeTests() {
  if (!codeEditor || !currentChallenge) return;
  const userCode = codeEditor.getValue();

  switchLeftTab('tab-console');

  const term = document.getElementById('terminal-stdout');
  if (term) term.textContent = 'Executing challenge unit tests in Pyodide WebAssembly...\n';

  const py = await initPyodideRuntime();
  if (!py) {
    if (term) term.textContent = 'Pyodide WebAssembly runtime is not ready yet. Please wait a moment and try again.';
    return;
  }

  const tests = currentChallenge.passing_tests || [];
  const resultsContainer = document.getElementById('runner-test-results');
  const testList = document.getElementById('runner-test-list');
  const badge = document.getElementById('runner-tests-badge');

  if (resultsContainer) resultsContainer.style.display = 'block';
  if (testList) testList.innerHTML = '<div style="font-size:0.75rem;color:var(--text-muted);">Running test cases...</div>';

  let passCount = 0;
  const fnName = currentChallenge.function_name;
  let testHtml = '';

  pyodideStdout = [];
  py.setStdout({ batched: (str) => { pyodideStdout.push(str); } });
  py.setStderr({ batched: (str) => { pyodideStdout.push(str); } });

  for (let idx = 0; idx < tests.length; idx++) {
    const t = tests[idx];
    const inpJson = JSON.stringify(t.input);
    const expJson = JSON.stringify(t.expected);

    const testScript = `
import json
${userCode}

_inp = json.loads('''${inpJson}''')
_expected = json.loads('''${expJson}''')

if isinstance(_inp, list):
    try:
        _actual = ${fnName}(*_inp)
    except TypeError:
        _actual = ${fnName}(_inp)
else:
    _actual = ${fnName}(_inp)

json.dumps({"passed": _actual == _expected, "actual": repr(_actual), "expected": repr(_expected)})
`;

    try {
      const resJsonStr = await py.runPythonAsync(testScript);
      const resObj = JSON.parse(resJsonStr);
      if (resObj.passed) {
        passCount++;
        testHtml += `
          <div class="runner-test-item pass">
            <span>Test ${idx + 1}: <code>${escapeHtml(JSON.stringify(t.input))}</code> &rarr; <code>${escapeHtml(resObj.actual)}</code></span>
            <span class="test-status-badge">PASS</span>
          </div>
        `;
      } else {
        testHtml += `
          <div class="runner-test-item fail">
            <span>Test ${idx + 1}: expected <code>${escapeHtml(resObj.expected)}</code>, got <code>${escapeHtml(resObj.actual)}</code></span>
            <span class="test-status-badge">FAIL</span>
          </div>
        `;
      }
    } catch (err) {
      testHtml += `
        <div class="runner-test-item fail">
          <span>Test ${idx + 1}: <strong>Crash</strong> (${escapeHtml(err.message.split('\n').pop())})</span>
          <span class="test-status-badge">CRASH</span>
        </div>
      `;
    }
  }

  if (testList) testList.innerHTML = testHtml;
  if (badge) badge.textContent = `${passCount}/${tests.length} Passed`;
  if (term) {
    term.textContent = `Completed ${tests.length} unit tests.\nResult: ${passCount} Passed, ${tests.length - passCount} Failed.\n\n` +
      (pyodideStdout.length ? `Console Output:\n${pyodideStdout.join('\n')}` : '');
  }
}

/**
 * Handle Direct Code Fix Submission from CodeMirror Toolbar or Bottom Bar
 */
async function handleDirectFixSubmit() {
  if (!currentChallenge) {
    showToast('No active challenge loaded.', 'warning');
    return;
  }

  const fixedCode = codeEditor ? codeEditor.getValue() : '';
  if (!fixedCode || fixedCode.trim().length < 5) {
    showToast('Editor is empty. Please edit the code before submitting a fix.', 'warning');
    return;
  }

  const submitFixBtn = document.getElementById('btn-editor-submit-fix');
  const submitBottomBtn = document.getElementById('btn-submit');

  if (submitFixBtn) {
    submitFixBtn.disabled = true;
    submitFixBtn.textContent = 'Verifying...';
  }
  if (submitBottomBtn) {
    submitBottomBtn.disabled = true;
    submitBottomBtn.textContent = 'Running tests in sandbox...';
  }

  const payload = {
    challenge_id: currentChallenge.id,
    fixed_code: fixedCode,
    hints_unlocked: currentUnlockedHintsCount,
  };

  try {
    const response = await fetch(`${API_BASE}/api/submit`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      openAuthModal('login');
      return;
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    renderResultModal(result);
    refreshUserStats();
    if (result.passed) {
      loadCatalog(false);
    }
  } catch (err) {
    console.error('Submission failed:', err);
    showToast(`Submission error: ${err.message}`, 'error');
  } finally {
    if (submitFixBtn) {
      submitFixBtn.disabled = false;
      submitFixBtn.textContent = 'Submit Fix';
    }
    if (submitBottomBtn) {
      submitBottomBtn.disabled = false;
      submitBottomBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span>Submit Code Fix</span>
      `;
    }
  }
}

function resetForm() {
  if (codeEditor && currentChallenge) {
    codeEditor.setValue(currentChallenge.code);
    clearLineSelection();
    showToast('Code reset to original challenge snippet.', 'info', 2000);
  }
}

/**
 * Feature 2: Anti-Stagnation Scaffold with 3-Stage Escalating Hints (Zhang Ch. 3 & 4)
 */
let currentChallengeHintLevel = 1;

const HINT_TIERS = {
  off_by_one: [
    (input) => `<strong>Hint Level 1 (Mental Tracing):</strong> Start at the function entry point with input <code>${escapeHtml(input)}</code>. Trace your loop variables: what is the initial index, and what is the exact final index visited?`,
    () => `<strong>Hint Level 2 (Loop Bounds):</strong> Look closely at the loop definition. Does <code>range(len(items))</code> or <code>range(len(items) - 1)</code> terminate one iteration too early or too late?`,
    () => `<strong>Hint Level 3 (Pinpointed Clue):</strong> The bug is in the loop boundary. In Python, <code>range(n)</code> already stops at <code>n-1</code>. If you subtract 1 from length, the final element will never be processed!`
  ],
  boundary_inclusive: [
    (input) => `<strong>Hint Level 1 (Mental Tracing):</strong> Trace the conditional branch with threshold input <code>${escapeHtml(input)}</code>. What happens when the value is exactly equal to the boundary?`,
    () => `<strong>Hint Level 2 (Comparison Operators):</strong> Examine the comparison operators (<code>&gt;</code> vs <code>&gt;=</code> or <code>&lt;</code> vs <code>&lt;=</code>). Does the problem specification require including the boundary?`,
    () => `<strong>Hint Level 3 (Pinpointed Clue):</strong> Check the line with the condition. The specification requires including threshold values, but the operator is strictly exclusive (e.g. <code>&gt;</code> instead of <code>&gt;=</code>).`
  ],
  int_division: [
    (input) => `<strong>Hint Level 1 (Mental Tracing):</strong> Trace arithmetic with input <code>${escapeHtml(input)}</code>. Check whether division retains fractional digits or truncates them.`,
    () => `<strong>Hint Level 2 (Division Operator):</strong> Check whether integer floor division (<code>//</code>) is used where true floating-point division (<code>/</code>) is required, or vice versa.`,
    () => `<strong>Hint Level 3 (Pinpointed Clue):</strong> Python's <code>//</code> discards decimal remainder digits. Verify if this formula requires exact floating-point division <code>/</code>.`
  ],
  mutable_default: [
    (input) => `<strong>Hint Level 1 (Mental Tracing):</strong> Trace what happens across multiple calls with input <code>${escapeHtml(input)}</code>. Does state bleed across separate invocations?`,
    () => `<strong>Hint Level 2 (Function Signature):</strong> Look at the parameter list in <code>def ...</code>. Are any default arguments initialized to mutable structures like <code>[]</code> or <code>{}</code>?`,
    () => `<strong>Hint Level 3 (Pinpointed Clue):</strong> In Python, default arguments are evaluated once at function definition time. Replace the mutable default parameter with <code>None</code> and initialize inside the body.`
  ],
  shallow_copy: [
    (input) => `<strong>Hint Level 1 (Mental Tracing):</strong> Follow how nested data structures are duplicated or modified using input <code>${escapeHtml(input)}</code>.`,
    () => `<strong>Hint Level 2 (Copy Semantics):</strong> Modifying an inner list or dictionary after a shallow copy or slice <code>[:]</code> mutates both objects.`,
    () => `<strong>Hint Level 3 (Pinpointed Clue):</strong> Use <code>copy.deepcopy()</code> or recursive construction so mutations to nested lists or dictionaries don't mutate the original source.`
  ]
};

function getHintForCurrentChallenge() {
  if (!currentChallenge) return '';
  const bugType = currentChallenge.bug_type || 'generic';
  const firstTest = currentChallenge.passing_tests && currentChallenge.passing_tests[0]
    ? JSON.stringify(currentChallenge.passing_tests[0].input)
    : 'sample input';

  const tierList = HINT_TIERS[bugType];
  const levelIndex = Math.min(currentChallengeHintLevel, 3) - 1;

  if (tierList && tierList[levelIndex]) {
    return tierList[levelIndex](firstTest);
  }

  if (levelIndex === 0) {
    return `<strong>Hint Level 1 (Mental Tracing):</strong> Anchor at the function entry point using input <code>${escapeHtml(firstTest)}</code>. Trace variable states line-by-line to locate discrepancies.`;
  } else if (levelIndex === 1) {
    return `<strong>Hint Level 2 (Contract Audit):</strong> Compare the function's output with edge case requirements (empty inputs, negative numbers, boundary thresholds).`;
  } else {
    return `<strong>Hint Level 3 (Pinpointed Clue):</strong> Focus on the single line that controls loop boundaries or conditional branching. That is where the author made a false assumption.`;
  }
}

function checkStagnation() {
  // Disabled: Hint popup removed per user request
  return;
}

function showStagnationNudge() {
  // Disabled: Hint popup removed per user request
  return;
}

function hideStagnationNudge() {
  const toast = document.getElementById('stagnation-toast');
  if (toast) {
    toast.style.display = 'none';
  }
}

/**
 * Primary Submit Action Handler: Invokes sandbox test evaluation of editor code
 */
function handleAttemptSubmit() {
  handleDirectFixSubmit();
}

/**
 * Render Code-First Test Results Modal
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

  const passed = Boolean(result.passed || result.score === 100 || result.verdict === 'found_and_understood');
  const testsPassed = result.tests_passed !== undefined ? result.tests_passed : (passed ? (result.total_tests || 1) : 0);
  const totalTests = result.total_tests !== undefined ? result.total_tests : (passed ? testsPassed : 1);

  if (passed) {
    if (detectionText) detectionText.textContent = 'Fix Verified (100%)';
    if (badgeDetection) badgeDetection.className = 'verdict-badge badge-success';

    if (comprehensionText) comprehensionText.textContent = `${testsPassed} / ${totalTests} Passed`;
    if (badgeComprehension) badgeComprehension.className = 'verdict-badge badge-success';

    const pointsEarned = result.points_earned !== undefined ? result.points_earned : currentChallengePotentialPoints;
    if (verdictTitle) verdictTitle.textContent = `Challenge Solved! +${pointsEarned} Points Earned`;
    if (verdictTag) {
      verdictTag.textContent = `PASSED (+${pointsEarned} PTS)`;
      verdictTag.className = 'verdict-status-label status-success';
    }
    if (verdictDesc) {
      verdictDesc.textContent = `Your modified code passed all test cases! You earned ${pointsEarned} points.`;
    }

    playCelebration();
    showToast(`Challenge Solved! +${pointsEarned} Points Earned`, 'success', 4000);
  } else {
    if (detectionText) detectionText.textContent = 'Tests Failed (0%)';
    if (badgeDetection) badgeDetection.className = 'verdict-badge badge-danger';

    if (comprehensionText) comprehensionText.textContent = `${testsPassed} / ${totalTests} Passed`;
    if (badgeComprehension) badgeComprehension.className = 'verdict-badge badge-danger';

    if (verdictTitle) verdictTitle.textContent = 'Test Suite Failed';
    if (verdictTag) {
      verdictTag.textContent = 'FAILED (0%)';
      verdictTag.className = 'verdict-status-label status-danger';
    }
    if (verdictDesc) {
      verdictDesc.textContent = 'Your code fix did not pass all required test cases or raised an error during sandbox execution.';
    }

    showToast('Test suite failed. Check the sandbox test output below.', 'error', 3500);
  }

  if (feedbackEl) {
    feedbackEl.textContent = result.feedback || result.error_message || (passed ? 'All tests passed successfully.' : 'Code failed required unit tests.');
  }

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

  const nextBtn = document.getElementById('btn-next-challenge');
  if (nextBtn) {
    nextBtn.textContent = 'Return to Problems Menu';
  }

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
  if (codeEditor) {
    for (let i = 0; i < codeEditor.lineCount(); i++) {
      codeEditor.removeLineClass(i, 'background', 'revealed-bug-cm');
    }
  }
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
  if (codeEditor) {
    codeEditor.focus();
  }
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
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
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
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ challenge_id: currentChallenge.id }),
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }

    const data = await resp.json();

    // 3. Highlight buggy line in code editor
    const buggyLineNum = data.buggy_line_number;
    if (buggyLineNum) {
      if (codeEditor) {
        clearLineSelection();
        codeEditor.addLineClass(buggyLineNum - 1, 'background', 'revealed-bug-cm');
        codeEditor.scrollIntoView({ line: buggyLineNum - 1, ch: 0 }, 100);
      }
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
      if (streakBadge) streakBadge.textContent = `Streak: ${data.current_streak}`;
    }

    // Ensure modal action button says Return to Problems Menu
    const nextBtn = document.getElementById('btn-next-challenge');
    if (nextBtn) {
      nextBtn.textContent = 'Return to Problems Menu';
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
    const res = await fetch(`${API_BASE}/api/stats`, { headers: getAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      const totalSolved = data.total_solved ?? (data.user_profile?.solved_count ?? 0);
      const totalPoints = data.total_points ?? (data.user_profile?.total_points ?? 0);

      const elSolved = document.getElementById('stats-total-solved');
      if (elSolved) elSolved.textContent = totalSolved;

      const elPoints = document.getElementById('stats-total-points');
      if (elPoints) elPoints.textContent = totalPoints;

      const topbarPoints = document.getElementById('topbar-points-val');
      if (topbarPoints) topbarPoints.textContent = totalPoints;
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
    const res = await fetch(`${API_BASE}/api/memory`, { headers: getAuthHeaders() });
    if (res.status === 401) {
      openAuthModal('login');
      return;
    }
    if (!res.ok) return;

    const data = await res.json();
    latestMemoryData = data;
    const stats = data.stats || {};
    const streak = stats.current_streak || 0;
    const bestStreak = stats.best_streak ?? streak;
    const solved = stats.total_solved || 0;
    const total = stats.total_attempts || 0;
    const acc = stats.overall_accuracy || 0;
    const weakest = data.weakest_category || 'boundary_inclusive';
    const directFixesPassed = stats.direct_fixes_passed ?? 0;
    const directFixesTotal = stats.direct_fixes_total ?? 0;
    const directFixAcc = stats.direct_fix_accuracy ?? 0;

    // 1. Update topbar streak badge
    const topbarStreak = document.getElementById('topbar-streak-badge');
    if (topbarStreak) {
      topbarStreak.textContent = `Streak: ${streak}`;
      topbarStreak.classList.add('streak-updated');
      setTimeout(() => topbarStreak.classList.remove('streak-updated'), 500);
    }

    // 2. Update modal stats
    const modalStreak = document.getElementById('modal-memory-streak');
    if (modalStreak) modalStreak.textContent = `Streak: ${streak} (Best: ${bestStreak})`;

    const statSolved = document.getElementById('mem-stat-solved');
    if (statSolved) statSolved.textContent = `${solved}/${total} (${acc}%)`;

    const statStreak = document.getElementById('mem-stat-streak');
    if (statStreak) statStreak.textContent = streak;

    const statCodeFixes = document.getElementById('mem-stat-code-fixes');
    if (statCodeFixes) statCodeFixes.textContent = `${directFixesPassed}/${directFixesTotal} (${directFixAcc}%)`;

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

/**
 * Interactive 2-Pane Splitter Resizer (Antigravity-style draggable divider)
 */
function initPaneResizer() {
  const resizer = document.getElementById('pane-resizer');
  const leftPane = document.getElementById('pane-left');
  const workspace = document.getElementById('workspace-main');
  if (!resizer || !leftPane || !workspace) return;

  let isDragging = false;

  // Restore saved width from localStorage if available
  const savedWidth = localStorage.getItem('rca_left_pane_pct');
  if (savedWidth) {
    const val = parseFloat(savedWidth);
    if (!isNaN(val) && val >= 20 && val <= 70) {
      leftPane.style.width = `${val}%`;
    }
  }

  resizer.addEventListener('mousedown', (e) => {
    isDragging = true;
    resizer.classList.add('is-dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const rect = workspace.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const totalWidth = rect.width;
    let pct = (offsetX / totalWidth) * 100;

    // Minimum 260px for left pane, minimum 340px for right pane
    const minLeftPct = (260 / totalWidth) * 100;
    const maxLeftPct = ((totalWidth - 340) / totalWidth) * 100;

    pct = Math.max(minLeftPct, Math.min(maxLeftPct, pct));
    pct = Math.max(18, Math.min(72, pct));

    leftPane.style.width = `${pct}%`;
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      resizer.classList.remove('is-dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (leftPane.style.width) {
        localStorage.setItem('rca_left_pane_pct', leftPane.style.width.replace('%', ''));
      }
    }
  });
}


