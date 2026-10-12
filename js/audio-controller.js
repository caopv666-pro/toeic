// ==========================================================================
// TOEIC MASTER — audio-controller.js
// Single-Active Audio Manager, Custom Play/Pause, Progress Bar
// ==========================================================================

const AudioController = {
  activeAudio: null,
  activePlayerId: null,
  _initialized: false,

  init() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return false;
    }

    if (this._initialized) {
      return true;
    }

    const handleUnload = () => {
      this.stopCurrent();
    };

    // Standard desktop unload
    window.addEventListener('beforeunload', handleUnload);

    // Modern mobile & WebKit Page Lifecycle API (iOS Safari, iPadOS, Android)
    window.addEventListener('pagehide', handleUnload);

    this._initialized = true;
    return true;
  },

  formatTime(seconds) {
    const sec = Number(seconds);
    if (isNaN(sec) || sec < 0 || !isFinite(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  },

  resetPlayerUI(playerId) {
    if (!playerId || typeof document === 'undefined') return;
    try {
      const playerWrap = document.getElementById(playerId);
      if (!playerWrap) return;
      const fillBar = playerWrap.querySelector('.audio-fill-bar');
      const timeDisplay = playerWrap.querySelector('.audio-current-time');
      if (fillBar) fillBar.style.width = '0%';
      if (timeDisplay) timeDisplay.textContent = '00:00';
    } catch (_) {}
  },

  stopCurrent() {
    let stoppedAny = false;

    // 1. Pause master audio if playing (Dual Audio Conflict prevention)
    if (typeof document !== 'undefined') {
      try {
        const masterAudio = document.getElementById('master-audio-element');
        if (masterAudio && !masterAudio.paused) {
          masterAudio.pause();
          stoppedAny = true;
        }
      } catch (err) {
        console.warn('Failed to pause master audio:', err);
      }
    }

    // 2. Stop active question audio
    if (this.activeAudio) {
      const prevPlayerId = this.activePlayerId;
      try {
        this.activeAudio.pause();
        this.activeAudio.currentTime = 0;
      } catch (err) {
        console.warn('Error pausing active audio:', err);
      }

      if (prevPlayerId) {
        this.updatePlayBtnUI(prevPlayerId, false);
        this.resetPlayerUI(prevPlayerId);
      }

      this.activeAudio = null;
      this.activePlayerId = null;
      stoppedAny = true;
    }

    return stoppedAny;
  },

  togglePlay(playerId, audioUrl) {
    if (typeof document === 'undefined') return false;
    if (!playerId || typeof playerId !== 'string') return false;
    if (!audioUrl || typeof audioUrl !== 'string') {
      console.warn('Invalid audioUrl provided to togglePlay:', audioUrl);
      return false;
    }

    const playerWrap = document.getElementById(playerId);
    if (!playerWrap) return false;

    const audioEl = playerWrap.querySelector('audio');
    if (!audioEl) return false;

    const fillBar = playerWrap.querySelector('.audio-fill-bar');
    const timeDisplay = playerWrap.querySelector('.audio-current-time');
    const totalDisplay = playerWrap.querySelector('.audio-total-time');

    // If clicking on current playing audio -> toggle pause
    if (this.activePlayerId === playerId && this.activeAudio) {
      if (this.activeAudio.paused) {
        // Pause master audio if it was started while this question was paused
        if (typeof document !== 'undefined') {
          try {
            const masterAudio = document.getElementById('master-audio-element');
            if (masterAudio && !masterAudio.paused) {
              masterAudio.pause();
            }
          } catch (_) {}
        }

        this.updatePlayBtnUI(playerId, true);
        const playPromise = this.activeAudio.play();
        if (playPromise !== undefined && typeof playPromise.then === 'function') {
          playPromise.catch(err => {
            console.warn('Resume play interrupted or blocked:', err);
            this.updatePlayBtnUI(playerId, false);
          });
        }
      } else {
        try {
          this.activeAudio.pause();
        } catch (err) {
          console.warn('Error pausing audio:', err);
        }
        this.updatePlayBtnUI(playerId, false);
      }
      return true;
    }

    // New audio clicked -> Stop any currently playing audio (including master audio)
    this.stopCurrent();

    // Set new active audio
    this.activeAudio = audioEl;
    this.activePlayerId = playerId;

    if (!audioEl.src || (typeof window !== 'undefined' && audioEl.src === window.location.href)) {
      const resolved = (typeof AppConfig !== 'undefined' && typeof AppConfig.resolveAssetUrl === 'function')
        ? AppConfig.resolveAssetUrl(audioUrl)
        : audioUrl;
      audioEl.src = resolved;
    }

    if (totalDisplay && audioEl.duration && (!totalDisplay.textContent || totalDisplay.textContent === '--:--')) {
      totalDisplay.textContent = this.formatTime(audioEl.duration);
    }

    this.updatePlayBtnUI(playerId, true);
    const playPromise = audioEl.play();
    if (playPromise !== undefined && typeof playPromise.then === 'function') {
      playPromise.catch(err => {
        console.warn('Playback blocked or failed:', err);
        this.updatePlayBtnUI(playerId, false);
      });
    }

    // Time update listener
    audioEl.ontimeupdate = () => {
      if (!audioEl.duration) return;
      const progress = (audioEl.currentTime / audioEl.duration) * 100;
      if (fillBar) fillBar.style.width = `${progress}%`;
      if (timeDisplay) timeDisplay.textContent = this.formatTime(audioEl.currentTime);
      if (totalDisplay && (!totalDisplay.textContent || totalDisplay.textContent === '--:--')) {
        totalDisplay.textContent = this.formatTime(audioEl.duration);
      }
    };

    audioEl.onloadedmetadata = () => {
      if (totalDisplay && audioEl.duration) {
        totalDisplay.textContent = this.formatTime(audioEl.duration);
      }
    };

    audioEl.onerror = (e) => {
      console.warn('Audio element error during playback or loading:', e, audioEl.error);
      this.updatePlayBtnUI(playerId, false);
      this.resetPlayerUI(playerId);
      if (this.activeAudio === audioEl) {
        this.activeAudio = null;
        this.activePlayerId = null;
      }
    };

    audioEl.onended = () => {
      this.updatePlayBtnUI(playerId, false);
      this.resetPlayerUI(playerId);
      this.activeAudio = null;
      this.activePlayerId = null;
    };

    return true;
  },

  seekAudio(playerId, event) {
    if (typeof document === 'undefined') return false;
    if (!playerId || typeof playerId !== 'string') return false;
    if (!event || typeof event !== 'object') return false;

    const playerWrap = document.getElementById(playerId);
    if (!playerWrap) return false;

    const audioEl = playerWrap.querySelector('audio');
    const trackBar = playerWrap.querySelector('.audio-track-bar');
    if (!audioEl || !trackBar) return false;

    if (!Number.isFinite(audioEl.duration) || audioEl.duration <= 0) {
      return false;
    }

    try {
      const rect = trackBar.getBoundingClientRect();
      if (!rect || !Number.isFinite(rect.width) || rect.width <= 0) return false;

      // Safe extraction of clientX from MouseEvent or TouchEvent (touches / changedTouches)
      let clientX = event.clientX;
      if (typeof clientX !== 'number' || !Number.isFinite(clientX)) {
        if (event.touches && event.touches[0] && typeof event.touches[0].clientX === 'number') {
          clientX = event.touches[0].clientX;
        } else if (event.changedTouches && event.changedTouches[0] && typeof event.changedTouches[0].clientX === 'number') {
          clientX = event.changedTouches[0].clientX;
        }
      }

      if (typeof clientX !== 'number' || !Number.isFinite(clientX)) {
        return false;
      }

      const rectLeft = Number.isFinite(rect.left) ? rect.left : 0;
      const rawPos = (clientX - rectLeft) / rect.width;
      if (!Number.isFinite(rawPos)) return false;

      const clampedPos = Math.max(0, Math.min(1, rawPos));
      const newTime = clampedPos * audioEl.duration;

      audioEl.currentTime = newTime;

      // Immediate UI update for instant feedback (especially when paused)
      const fillBar = playerWrap.querySelector('.audio-fill-bar');
      const timeDisplay = playerWrap.querySelector('.audio-current-time');
      const totalDisplay = playerWrap.querySelector('.audio-total-time');

      if (fillBar) fillBar.style.width = `${clampedPos * 100}%`;
      if (timeDisplay) timeDisplay.textContent = this.formatTime(newTime);
      if (totalDisplay && (!totalDisplay.textContent || totalDisplay.textContent === '--:--' || totalDisplay.textContent === '00:00')) {
        totalDisplay.textContent = this.formatTime(audioEl.duration);
      }

      return true;
    } catch (err) {
      console.warn('Failed to seek audio:', err);
      return false;
    }
  },

  updatePlayBtnUI(playerId, isPlaying) {
    if (typeof document === 'undefined') return false;
    if (!playerId || typeof playerId !== 'string') return false;

    try {
      const playerWrap = document.getElementById(playerId);
      if (!playerWrap) return false;

      const btn = playerWrap.querySelector('.audio-play-btn');
      if (!btn) return false;

      const playing = Boolean(isPlaying);

      // Icon & Tooltip
      btn.innerHTML = playing ? '⏸️' : '▶️';
      btn.title = playing ? 'Tạm dừng' : 'Phát âm thanh';

      // Accessibility / ARIA Support (WCAG 2.1 AA)
      btn.setAttribute('aria-pressed', playing ? 'true' : 'false');
      btn.setAttribute('aria-label', playing ? 'Tạm dừng' : 'Phát âm thanh');

      // State Hook CSS classes on button & container
      btn.classList.toggle('playing', playing);
      playerWrap.classList.toggle('playing', playing);

      // Optical centering: Play icon needs 2px padding-left, Pause icon needs 0px
      btn.style.paddingLeft = playing ? '0px' : '2px';

      return true;
    } catch (err) {
      console.warn('Failed to update play button UI:', err);
      return false;
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioController;
}
