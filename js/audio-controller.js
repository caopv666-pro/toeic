// ==========================================================================
// TOEIC MASTER — audio-controller.js
// Single-Active Audio Manager, Custom Play/Pause, Progress Bar
// ==========================================================================

const AudioController = {
  activeAudio: null,
  activePlayerId: null,

  init() {
    // Stop all audio on page unload
    window.addEventListener('beforeunload', () => {
      this.stopCurrent();
    });
  },

  formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  },

  stopCurrent() {
    if (this.activeAudio) {
      this.activeAudio.pause();
      this.activeAudio.currentTime = 0;
      this.updatePlayBtnUI(this.activePlayerId, false);
      this.activeAudio = null;
      this.activePlayerId = null;
    }
  },

  togglePlay(playerId, audioUrl) {
    const playerWrap = document.getElementById(playerId);
    if (!playerWrap) return;

    const audioEl = playerWrap.querySelector('audio');
    const playBtn = playerWrap.querySelector('.audio-play-btn');
    const fillBar = playerWrap.querySelector('.audio-fill-bar');
    const timeDisplay = playerWrap.querySelector('.audio-current-time');
    const totalDisplay = playerWrap.querySelector('.audio-total-time');

    // If clicking on current playing audio -> toggle pause
    if (this.activePlayerId === playerId && this.activeAudio) {
      if (this.activeAudio.paused) {
        this.activeAudio.play();
        this.updatePlayBtnUI(playerId, true);
      } else {
        this.activeAudio.pause();
        this.updatePlayBtnUI(playerId, false);
      }
      return;
    }

    // New audio clicked -> Stop any currently playing audio
    this.stopCurrent();

    // Set new active audio
    this.activeAudio = audioEl;
    this.activePlayerId = playerId;

    if (!audioEl.src || audioEl.src === window.location.href) {
      audioEl.src = AppConfig.resolveAssetUrl(audioUrl);
    }

    audioEl.play().then(() => {
      this.updatePlayBtnUI(playerId, true);
    }).catch(err => {
      console.warn('Playback blocked or failed:', err);
      this.updatePlayBtnUI(playerId, false);
    });

    // Time update listener
    audioEl.ontimeupdate = () => {
      if (!audioEl.duration) return;
      const progress = (audioEl.currentTime / audioEl.duration) * 100;
      if (fillBar) fillBar.style.width = `${progress}%`;
      if (timeDisplay) timeDisplay.textContent = this.formatTime(audioEl.currentTime);
      if (totalDisplay && !totalDisplay.textContent) {
        totalDisplay.textContent = this.formatTime(audioEl.duration);
      }
    };

    audioEl.onloadedmetadata = () => {
      if (totalDisplay) totalDisplay.textContent = this.formatTime(audioEl.duration);
    };

    audioEl.onended = () => {
      this.updatePlayBtnUI(playerId, false);
      if (fillBar) fillBar.style.width = '0%';
      if (timeDisplay) timeDisplay.textContent = '00:00';
      this.activeAudio = null;
      this.activePlayerId = null;
    };
  },

  seekAudio(playerId, event) {
    const playerWrap = document.getElementById(playerId);
    if (!playerWrap) return;
    const audioEl = playerWrap.querySelector('audio');
    const trackBar = playerWrap.querySelector('.audio-track-bar');
    if (!audioEl || !trackBar || !audioEl.duration) return;

    const rect = trackBar.getBoundingClientRect();
    const pos = (event.clientX - rect.left) / rect.width;
    audioEl.currentTime = Math.max(0, Math.min(audioEl.duration, pos * audioEl.duration));
  },

  updatePlayBtnUI(playerId, isPlaying) {
    if (!playerId) return;
    const playerWrap = document.getElementById(playerId);
    if (!playerWrap) return;
    const btn = playerWrap.querySelector('.audio-play-btn');
    if (btn) {
      btn.innerHTML = isPlaying ? '⏸️' : '▶️';
      btn.title = isPlaying ? 'Tạm dừng' : 'Phát âm thanh';
    }
  }
};
