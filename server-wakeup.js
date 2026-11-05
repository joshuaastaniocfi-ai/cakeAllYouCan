/**
 * Goldilocks Cake All You Can - Server Wakeup Manager
 * Detects Render Free Tier cold-start spin-down, shows an engaging animated cake,
 * tracks elapsed waking time, and keeps the server warm via background pings.
 */
(function () {
  'use strict';

  let overlayEl = null;
  let timerInterval = null;
  let elapsedSeconds = 0;
  let activeRequestsCount = 0;
  let isWakeupVisible = false;

  const CAKE_SVG = `
    <svg class="sw-cake-svg" viewBox="0 0 160 150" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Cake Pedestal / Plate -->
      <ellipse cx="80" cy="142" rx="68" ry="7" fill="#e6a800" opacity="0.3"/>
      <ellipse cx="80" cy="138" rx="64" ry="6" fill="#fff" stroke="#f0c242" stroke-width="2"/>
      <ellipse cx="80" cy="137" rx="58" ry="4" fill="#fff9e6"/>

      <!-- Bottom Tier: Signature Chocolate Velvet -->
      <path d="M26 102 C26 96 34 94 80 94 C126 94 134 96 134 102 L134 126 C134 134 120 137 80 137 C40 137 26 134 26 126 Z" fill="#522b07"/>
      <!-- Chocolate Frosting Drips -->
      <path d="M26 104 C32 108 38 102 44 106 C50 110 56 104 62 107 C68 111 74 103 80 106 C86 110 92 104 98 107 C104 111 110 103 116 106 C122 110 128 104 134 104 L134 101 C126 96 116 94 80 94 C44 94 34 96 26 101 Z" fill="#ffc200"/>
      <!-- Golden Rosettes -->
      <circle cx="40" cy="120" r="3" fill="#ffda66"/>
      <circle cx="65" cy="122" r="3" fill="#ffda66"/>
      <circle cx="95" cy="122" r="3" fill="#ffda66"/>
      <circle cx="120" cy="120" r="3" fill="#ffda66"/>

      <!-- Middle Tier: Signature Matcha Layer -->
      <path d="M38 68 C38 63 46 61 80 61 C114 61 122 63 122 68 L122 93 C122 99 110 102 80 102 C50 102 38 99 38 93 Z" fill="#6d8a40"/>
      <!-- Scalloped Cream Piping -->
      <path d="M38 71 C44 74 50 69 56 72 C62 75 68 70 74 73 C80 75 86 70 92 73 C98 75 104 70 110 73 C116 75 122 71 122 71 L122 68 C116 64 108 61 80 61 C52 61 44 64 38 68 Z" fill="#ffffff"/>
      <!-- Matcha Powder Dust Texture -->
      <circle cx="55" cy="82" r="2.5" fill="#88ab54"/>
      <circle cx="80" cy="84" r="2.5" fill="#88ab54"/>
      <circle cx="105" cy="82" r="2.5" fill="#88ab54"/>

      <!-- Top Tier: Signature Strawberry Blossom -->
      <path d="M50 36 C50 32 58 30 80 30 C102 30 110 32 110 36 L110 60 C110 65 100 68 80 68 C60 68 50 65 50 60 Z" fill="#ff8da1"/>
      <ellipse cx="80" cy="35" rx="30" ry="6" fill="#ffaec0"/>
      <!-- Strawberries on Top -->
      <path d="M64 32 C62 26 68 24 70 29 Z" fill="#d91e36"/>
      <path d="M96 32 C98 26 92 24 90 29 Z" fill="#d91e36"/>

      <!-- Birthday Candle & Gold Stripes -->
      <rect x="77" y="14" width="6" height="20" rx="3" fill="#fffaeb" stroke="#ffc200" stroke-width="1"/>
      <path d="M78 19 L82 17 M78 25 L82 23 M78 31 L82 29" stroke="#ff9500" stroke-width="1.2" stroke-linecap="round"/>
      <line x1="80" y1="14" x2="80" y2="10" stroke="#3b1f00" stroke-width="1.2"/>

      <!-- Glowing Candle Flame -->
      <path class="sw-flame" d="M80 0 C76 5 75 9 80 11 C85 9 84 5 80 0 Z" fill="#ff7800"/>
      <circle cx="80" cy="7" r="1.8" fill="#fff7d6"/>
    </svg>
  `;

  function createOverlayMarkup() {
    const div = document.createElement('div');
    div.id = 'serverWakeupOverlay';
    div.innerHTML = `
      <div class="sw-card" role="dialog" aria-modal="true" aria-labelledby="swModalTitle">
        <!-- Brand Header -->
        <div class="sw-brand-row">
          <img src="Assets/goldilocks-logo.png" onerror="this.src='Assets/goldilocks logo.png';" alt="Goldilocks" class="sw-brand-logo">
          <div class="sw-badge-freetier">
            <span class="sw-pulse-dot" id="swPulseDot"></span>
            <span id="swBadgeText">Free-Tier Cloud Instance</span>
          </div>
        </div>

        <!-- Animated Cake Stage -->
        <div class="sw-cake-stage">
          <div class="sw-oven-glow"></div>
          <div class="sw-sparkles-wrap">
            <span class="sw-sparkle">✨</span>
            <span class="sw-sparkle">⭐</span>
            <span class="sw-sparkle">✨</span>
            <span class="sw-sparkle">💛</span>
            <span class="sw-sparkle">✨</span>
          </div>
          ${CAKE_SVG}
        </div>

        <!-- Title & Subtitle -->
        <h2 class="sw-title" id="swModalTitle">Baking Your Session... <span>🎂</span></h2>
        <p class="sw-subtitle" id="swSubtitle">
          Waking up our secure cloud server from its rest. Your passes and verification requests are safely queued!
        </p>

        <!-- Live Elapsed Timer Pill -->
        <div class="sw-timer-pill">
          <span>⏱️ Elapsed:</span>
          <span class="sw-timer-counter" id="swElapsed">0s</span>
          <span style="opacity:0.6;font-size:11px;">(Avg. cold start: 30–50s)</span>
        </div>

        <!-- Progress Shimmer Bar -->
        <div class="sw-progress-track">
          <div class="sw-progress-fill" id="swProgressFill"></div>
        </div>

        <!-- Stepped Timeline -->
        <div class="sw-steps">
          <div class="sw-step-item active" id="swStep1">
            <span class="sw-step-icon">📡</span>
            <span>Connecting</span>
          </div>
          <div class="sw-step-item" id="swStep2">
            <span class="sw-step-icon">🍃</span>
            <span>Waking DB</span>
          </div>
          <div class="sw-step-item" id="swStep3">
            <span class="sw-step-icon">🎂</span>
            <span>Processing</span>
          </div>
        </div>

        <!-- Friendly Reassuring Note -->
        <div class="sw-hint-box">
          <strong>💤 Why is there a brief delay?</strong>
          Render free tier automatically sleeps after 15 mins of inactivity to save energy. Once awake, all features and downloads run at maximum speed!
        </div>

        <!-- Ready Badge Toast -->
        <div class="sw-ready-banner" id="swReadyBanner">
          <span>✨</span>
          <span>Server is awake! Completing request...</span>
        </div>
      </div>
    `;
    document.body.appendChild(div);
    return div;
  }

  function getOverlay() {
    if (!overlayEl) {
      overlayEl = document.getElementById('serverWakeupOverlay') || createOverlayMarkup();
    }
    return overlayEl;
  }

  function updateSteps(sec) {
    const s1 = document.getElementById('swStep1');
    const s2 = document.getElementById('swStep2');
    const s3 = document.getElementById('swStep3');
    const subtitle = document.getElementById('swSubtitle');

    if (sec < 9) {
      if (s1) { s1.className = 'sw-step-item active'; }
      if (s2) { s2.className = 'sw-step-item'; }
      if (s3) { s3.className = 'sw-step-item'; }
      if (subtitle) subtitle.textContent = 'Connecting to secure cloud instance...';
    } else if (sec < 26) {
      if (s1) { s1.className = 'sw-step-item completed'; }
      if (s2) { s2.className = 'sw-step-item active'; }
      if (s3) { s3.className = 'sw-step-item'; }
      if (subtitle) subtitle.textContent = 'Waking MongoDB Atlas & verifying authorization codes...';
    } else {
      if (s1) { s1.className = 'sw-step-item completed'; }
      if (s2) { s2.className = 'sw-step-item completed'; }
      if (s3) { s3.className = 'sw-step-item active'; }
      if (subtitle) subtitle.textContent = 'Almost ready! Finalizing high-speed pass issuance...';
    }
  }

  function showWakeup(contextText) {
    if (isWakeupVisible) return;
    isWakeupVisible = true;
    const overlay = getOverlay();

    elapsedSeconds = 0;
    const elCounter = document.getElementById('swElapsed');
    const readyBanner = document.getElementById('swReadyBanner');
    const pulseDot = document.getElementById('swPulseDot');
    const badgeText = document.getElementById('swBadgeText');

    if (elCounter) elCounter.textContent = '0s';
    if (readyBanner) readyBanner.style.display = 'none';
    if (pulseDot) pulseDot.className = 'sw-pulse-dot';
    if (badgeText) badgeText.textContent = 'Free-Tier Cloud Instance';

    if (contextText) {
      const sub = document.getElementById('swSubtitle');
      if (sub) sub.textContent = contextText;
    }

    updateSteps(0);
    overlay.classList.add('active');

    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      elapsedSeconds += 1;
      if (elCounter) elCounter.textContent = elapsedSeconds + 's';
      updateSteps(elapsedSeconds);
    }, 1000);
  }

  function hideWakeup(isSuccess) {
    if (!isWakeupVisible) return;
    clearInterval(timerInterval);

    const overlay = getOverlay();
    const readyBanner = document.getElementById('swReadyBanner');
    const pulseDot = document.getElementById('swPulseDot');
    const badgeText = document.getElementById('swBadgeText');

    if (isSuccess && elapsedSeconds >= 2) {
      // Brief triumphant ready state
      if (readyBanner) readyBanner.style.display = 'inline-flex';
      if (pulseDot) pulseDot.className = 'sw-pulse-dot ready';
      if (badgeText) badgeText.textContent = 'Server Connected!';

      setTimeout(() => {
        overlay.classList.remove('active');
        isWakeupVisible = false;
        if (readyBanner) readyBanner.style.display = 'none';
      }, 450);
    } else {
      overlay.classList.remove('active');
      isWakeupVisible = false;
    }
  }

  /**
   * Global Smart Fetch Interceptor
   * Only triggers the wakeup screen if an API request takes longer than 1200ms
   * (meaning the server was sleeping / cold-starting on Render). Fast requests pass silently!
   */
  const originalFetch = window.fetch;
  window.fetch = function (resource, options) {
    const url = typeof resource === 'string' ? resource : (resource && resource.url ? resource.url : '');
    const isApi = url.includes('/api/') || url.endsWith('/verify-payment') || url.endsWith('/submit-qr-payment');

    // Skip ping / keepalive from triggering the visual overlay
    if (!isApi || url.includes('/api/ping')) {
      return originalFetch.apply(this, arguments);
    }

    activeRequestsCount += 1;
    let didTriggerWakeup = false;

    // If server takes longer than 1.2s to respond, show the warm-up animation
    const wakeupTimer = setTimeout(() => {
      if (activeRequestsCount > 0) {
        didTriggerWakeup = true;
        showWakeup('Waking up server from free-tier sleep... Your request is queued and will complete automatically.');
      }
    }, 1200);

    return originalFetch.apply(this, arguments)
      .then(res => {
        clearTimeout(wakeupTimer);
        activeRequestsCount = Math.max(0, activeRequestsCount - 1);
        if (activeRequestsCount === 0 && didTriggerWakeup) {
          hideWakeup(true);
        }
        return res;
      })
      .catch(err => {
        clearTimeout(wakeupTimer);
        activeRequestsCount = Math.max(0, activeRequestsCount - 1);
        if (activeRequestsCount === 0 && didTriggerWakeup) {
          hideWakeup(false);
        }
        throw err;
      });
  };

  /**
   * Heartbeat Ping: Keep server warm while user is actively browsing
   * Pings every 9 minutes (540,000ms), safely before Render's 15-minute sleep threshold.
   */
  function setupKeepAliveHeartbeat() {
    setInterval(() => {
      originalFetch('/api/ping', { cache: 'no-store' })
        .then(r => r.json())
        .then(d => console.log('🍃 Keep-alive heartbeat OK:', d.timestamp))
        .catch(() => {});
    }, 9 * 60 * 1000);
  }

  /**
   * Register Service Worker if supported
   */
  function registerServiceWorker() {
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => {
          console.warn('SW registration skipped:', err);
        });
      });
    }
  }

  // Public API
  window.ServerWakeup = {
    show: showWakeup,
    hide: hideWakeup,
    ping: () => originalFetch('/api/ping', { cache: 'no-store' })
  };

  // Initialize once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupKeepAliveHeartbeat();
      registerServiceWorker();
    });
  } else {
    setupKeepAliveHeartbeat();
    registerServiceWorker();
  }
})();

