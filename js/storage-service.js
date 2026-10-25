/* Protected by TOEIC Master DataShield v2 */
function getSafeLocalStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
    return null;
  } catch (e) {
    return null;
  }
}
function getSafeSessionStorage() {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage;
    }
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage;
    }
    return null;
  } catch (e) {
    return null;
  }
}
const StorageService = {
  ACTIVE_SESSION_KEY: 'toeic_active_exam_session',
  EXAM_HISTORY_KEY: 'toeic_exam_history',
  LATEST_RESULT_KEY: 'toeic_latest_result',
  THEME_KEY: 'toeic_theme_preference',
  DEFAULT_THEME: 'dark',
  ZOOM_KEY: 'toeic_page_zoom_preference',
  DEFAULT_ZOOM: 100,
  ZOOM_LEVELS: [80, 90, 100, 110, 120, 130, 140],
  STUDY_PROGRESS_KEY: 'toeic_study_progress_v1',
  ROADMAP_STATE_KEY: 'toeic_roadmap_v1',
  _getStorage() {
    return getSafeLocalStorage();
  },
  _getSessionStorage() {
    return getSafeSessionStorage();
  },
  saveActiveSession(sessionData) {
    if (!sessionData || typeof sessionData !== 'object' || Array.isArray(sessionData)) {
      return false;
    }
    const storage = this._getStorage();
    if (!storage) {
      return false;
    }
    const payload = JSON.stringify({
      ...sessionData,
      lastUpdated: Date.now()
    });
    try {
      storage.setItem(this.ACTIVE_SESSION_KEY, payload);
      return true;
    } catch (e) {
      const isQuotaError = e && (
        e.name === 'QuotaExceededError' ||
        e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        e.code === 22 ||
        e.code === 1014 ||
        e.number === -2147024882
      );
      if (isQuotaError) {
        console.warn('Storage quota exceeded when saving active session. Pruning exam history to 5 records and retrying...');
        try {
          const history = this.getExamHistory();
          if (Array.isArray(history)) {
            storage.setItem(this.EXAM_HISTORY_KEY, JSON.stringify(history.slice(0, 5)));
          }
          storage.setItem(this.ACTIVE_SESSION_KEY, payload);
          return true;
        } catch (retryErr) {
          try {
            const history = this.getExamHistory();
            const stripped = history.slice(0, 5).map(rec => ({ ...rec, detailedQuestions: [] }));
            storage.setItem(this.EXAM_HISTORY_KEY, JSON.stringify(stripped));
            storage.setItem(this.ACTIVE_SESSION_KEY, payload);
            return true;
          } catch (secErr) {
            console.error('Critical storage quota exceeded, retry failed:', retryErr);
            return false;
          }
        }
      } else {
        console.warn('LocalStorage save failed:', e);
        return false;
      }
    }
  },
  getActiveSession() {
    try {
      const storage = this._getStorage();
      if (!storage) return null;
      const data = storage.getItem(this.ACTIVE_SESSION_KEY);
      if (!data) return null;
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch (parseErr) {
        this.clearActiveSession();
        return null;
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        this.clearActiveSession();
        return null;
      }
      const TTL_24H = 24 * 60 * 60 * 1000;
      if (parsed.lastUpdated && (Date.now() - Number(parsed.lastUpdated)) > TTL_24H) {
        this.clearActiveSession();
        return null;
      }
      if (typeof parsed.timeRemaining === 'number' && parsed.timeRemaining <= 0) {
        this.clearActiveSession();
        return null;
      }
      return parsed;
    } catch (e) {
      try {
        this.clearActiveSession();
      } catch (_) {}
      return null;
    }
  },
  clearActiveSession() {
    try {
      const storage = this._getStorage();
      if (storage) {
        storage.removeItem(this.ACTIVE_SESSION_KEY);
        return true;
      }
      return false;
    } catch (e) {
      console.warn('Failed to clear active session:', e);
      return false;
    }
  },
  saveExamResult(resultRecord) {
    if (!resultRecord || typeof resultRecord !== 'object' || Array.isArray(resultRecord)) {
      return null;
    }
    const storage = this._getStorage();
    if (!storage) {
      return null;
    }
    try {
      const history = this.getExamHistory();
      const rawDetailed = Array.isArray(resultRecord.detailedQuestions)
        ? resultRecord.detailedQuestions.filter(q => q && typeof q === 'object')
        : [];
      const slimDetailed = rawDetailed.map(q => ({
        questionNumber: q.questionNumber,
        part: q.part,
        groupId: q.groupId,
        userChoice: q.userChoice,
        correctChoice: q.correctChoice,
        isCorrect: q.isCorrect
      }));
      const newRecordId = (resultRecord.id && typeof resultRecord.id === 'string' && resultRecord.id.trim())
        ? resultRecord.id.trim()
        : ('result_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
      const newRecordDate = (resultRecord.date && typeof resultRecord.date === 'string' && resultRecord.date.trim())
        ? resultRecord.date.trim()
        : new Date().toISOString();
      const newRecord = {
        ...resultRecord,
        id: newRecordId,
        date: newRecordDate,
        detailedQuestions: slimDetailed
      };
      const updatedHistory = [newRecord, ...history].slice(0, 30);
      try {
        storage.setItem(this.EXAM_HISTORY_KEY, JSON.stringify(updatedHistory));
        return newRecord.id;
      } catch (e) {
        console.warn('Failed to save exam history, trimming old records:', e);
        try {
          const trimmedHistory = [newRecord, ...history.slice(0, 4)];
          storage.setItem(this.EXAM_HISTORY_KEY, JSON.stringify(trimmedHistory));
          return newRecord.id;
        } catch (tier1Err) {
          console.warn('Tier 1 recovery failed, attempting Tier 2 (stripping detailedQuestions from older records)...', tier1Err);
          try {
            const strippedHistory = [
              newRecord,
              ...history.slice(0, 4).map(rec => ({ ...rec, detailedQuestions: [] }))
            ];
            storage.setItem(this.EXAM_HISTORY_KEY, JSON.stringify(strippedHistory));
            return newRecord.id;
          } catch (tier2Err) {
            console.warn('Tier 2 recovery failed, attempting Tier 3 (saving only new record without details)...', tier2Err);
            try {
              const minimalRecord = { ...newRecord, detailedQuestions: [] };
              storage.setItem(this.EXAM_HISTORY_KEY, JSON.stringify([minimalRecord]));
              return newRecord.id;
            } catch (criticalErr) {
              console.error('Critical quota exceeded, all saveExamResult attempts failed:', criticalErr);
              return null;
            }
          }
        }
      }
    } catch (unexpectedErr) {
      console.warn('Unexpected error in saveExamResult:', unexpectedErr);
      return null;
    }
  },
  getExamHistory() {
    try {
      const storage = this._getStorage();
      if (!storage) return [];
      const data = storage.getItem(this.EXAM_HISTORY_KEY);
      if (!data) return [];
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch (parseErr) {
        try { storage.removeItem(this.EXAM_HISTORY_KEY); } catch (_) {}
        return [];
      }
      if (!Array.isArray(parsed)) {
        try { storage.removeItem(this.EXAM_HISTORY_KEY); } catch (_) {}
        return [];
      }
      return parsed.filter(item => item && typeof item === 'object' && !Array.isArray(item));
    } catch (e) {
      try {
        const storage = this._getStorage();
        if (storage) storage.removeItem(this.EXAM_HISTORY_KEY);
      } catch (_) {}
      return [];
    }
  },
  deleteExamRecord(target) {
    try {
      if (target === null || target === undefined || typeof target === 'boolean') {
        return false;
      }
      const storage = this._getStorage();
      if (!storage) return false;
      const history = this.getExamHistory();
      if (!Array.isArray(history) || history.length === 0) return false;
      let targetIndex = -1;
      if (typeof target === 'number') {
        if (Number.isInteger(target) && target >= 0 && target < history.length) {
          targetIndex = target;
        }
      } else if (typeof target === 'string') {
        const trimmed = target.trim();
        if (trimmed) {
          const foundById = history.findIndex(rec => rec && rec.id === trimmed);
          if (foundById !== -1) {
            targetIndex = foundById;
          } else if (/^\d+$/.test(trimmed)) {
            const parsedIdx = parseInt(trimmed, 10);
            if (parsedIdx >= 0 && parsedIdx < history.length) {
              targetIndex = parsedIdx;
            }
          }
        }
      }
      if (targetIndex < 0 || targetIndex >= history.length) {
        return false;
      }
      const deletedRecord = history[targetIndex];
      history.splice(targetIndex, 1);
      storage.setItem(this.EXAM_HISTORY_KEY, JSON.stringify(history));
      const latestKey = this.LATEST_RESULT_KEY || 'toeic_latest_result';
      const sessStorage = this._getSessionStorage();
      const shouldClearLatest = () => {
        if (history.length === 0) return true;
        if (targetIndex === 0) return true;
        if (!deletedRecord) return false;
        const rawLatest = (sessStorage ? sessStorage.getItem(latestKey) : null) ||
                          (storage ? storage.getItem(latestKey) : null);
        if (!rawLatest) return false;
        try {
          const parsedLatest = JSON.parse(rawLatest);
          if (!parsedLatest || typeof parsedLatest !== 'object') return true;
          if (deletedRecord.id && parsedLatest.id && parsedLatest.id === deletedRecord.id) return true;
          if (deletedRecord.date && parsedLatest.date && parsedLatest.date === deletedRecord.date) return true;
          if (deletedRecord.testId === parsedLatest.testId &&
              deletedRecord.totalScore === parsedLatest.totalScore &&
              deletedRecord.timeSpentSeconds === parsedLatest.timeSpentSeconds) {
            return true;
          }
          return false;
        } catch (_) {
          return true; // remove corrupt latest result as well
        }
      };
      if (shouldClearLatest()) {
        try { storage.removeItem(latestKey); } catch (_) {}
        if (sessStorage) {
          try { sessStorage.removeItem(latestKey); } catch (_) {}
        }
        if (history.length > 0) {
          try {
            if (sessStorage) {
              sessStorage.setItem(latestKey, JSON.stringify(history[0]));
            }
          } catch (_) {}
        }
      }
      return true;
    } catch (e) {
      console.warn('Failed to delete exam record:', e);
      return false;
    }
  },
  clearAllHistory() {
    try {
      const storage = this._getStorage();
      const sessStorage = this._getSessionStorage();
      if (!storage && !sessStorage) {
        console.warn('No storage access available to clear history.');
        return false;
      }
      let hasErrors = false;
      if (storage) {
        try {
          storage.removeItem(this.EXAM_HISTORY_KEY);
        } catch (e) {
          hasErrors = true;
          console.warn('Failed to remove EXAM_HISTORY_KEY from storage:', e);
        }
        try {
          storage.removeItem(this.LATEST_RESULT_KEY || 'toeic_latest_result');
        } catch (e) {
          hasErrors = true;
          console.warn('Failed to remove latest result from storage:', e);
        }
      }
      if (sessStorage) {
        try {
          sessStorage.removeItem(this.LATEST_RESULT_KEY || 'toeic_latest_result');
        } catch (e) {
          hasErrors = true;
          console.warn('Failed to remove latest result from sessionStorage:', e);
        }
      }
      try {
        const activeCleared = this.clearActiveSession();
        if (!activeCleared && storage) {
          hasErrors = true;
        }
      } catch (e) {
        hasErrors = true;
        console.warn('Failed to clear active session in clearAllHistory:', e);
      }
      return !hasErrors;
    } catch (e) {
      console.warn('Failed to clear all history:', e);
      return false;
    }
  },
  setCurrentResult(result) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      return false;
    }
    const sessStorage = this._getSessionStorage();
    const storage = this._getStorage();
    if (!sessStorage && !storage) {
      console.warn('No storage access available to set current result.');
      return false;
    }
    let serialized;
    try {
      const rawDetailed = Array.isArray(result.detailedQuestions)
        ? result.detailedQuestions.filter(q => q && typeof q === 'object')
        : [];
      const slimDetailed = rawDetailed.map(q => ({
        questionNumber: q.questionNumber,
        part: q.part,
        groupId: q.groupId,
        userChoice: q.userChoice,
        correctChoice: q.correctChoice,
        isCorrect: q.isCorrect
      }));
      serialized = JSON.stringify({
        ...result,
        detailedQuestions: slimDetailed
      });
    } catch (err) {
      console.warn('Failed to serialize result object in setCurrentResult:', err);
      return false;
    }
    const key = this.LATEST_RESULT_KEY || 'toeic_latest_result';
    let saved = false;
    if (sessStorage) {
      try {
        try { sessStorage.removeItem(key); } catch (_) {}
        sessStorage.setItem(key, serialized);
        saved = true;
      } catch (e) {
        console.warn('sessionStorage failed in setCurrentResult:', e);
      }
    }
    if (storage) {
      try {
        try { storage.removeItem(key); } catch (_) {}
        storage.setItem(key, serialized);
        saved = true;
      } catch (err) {
        if (!saved) {
          console.error('All storage attempts failed in setCurrentResult:', err);
        }
      }
    }
    return saved;
  },
  getCurrentResult() {
    const key = this.LATEST_RESULT_KEY || 'toeic_latest_result';
    const sessStorage = this._getSessionStorage();
    const storage = this._getStorage();
    try {
      if (sessStorage) {
        try {
          const sessData = sessStorage.getItem(key);
          if (sessData) {
            let parsed = null;
            let isValid = false;
            try {
              parsed = JSON.parse(sessData);
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                isValid = true;
              }
            } catch (_) {}
            if (isValid) {
              return parsed;
            } else {
              try { sessStorage.removeItem(key); } catch (_) {}
            }
          }
        } catch (_) {}
      }
      if (storage) {
        try {
          const localData = storage.getItem(key);
          if (localData) {
            let parsed = null;
            let isValid = false;
            try {
              parsed = JSON.parse(localData);
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                isValid = true;
              }
            } catch (_) {}
            if (isValid) {
              return parsed;
            } else {
              try { storage.removeItem(key); } catch (_) {}
            }
          }
        } catch (_) {}
      }
      const history = this.getExamHistory();
      if (Array.isArray(history) && history.length > 0) {
        const latestHistory = history[0];
        if (latestHistory && typeof latestHistory === 'object' && !Array.isArray(latestHistory)) {
          return latestHistory;
        }
      }
      return null;
    } catch (e) {
      console.warn('Unexpected error in getCurrentResult:', e);
      try {
        const history = this.getExamHistory();
        return (Array.isArray(history) && history.length > 0 && history[0] && typeof history[0] === 'object' && !Array.isArray(history[0])) ? history[0] : null;
      } catch (_) {
        return null;
      }
    }
  },
  getTheme() {
    try {
      const storage = this._getStorage();
      if (!storage) {
        return this.DEFAULT_THEME || 'dark';
      }
      const raw = storage.getItem(this.THEME_KEY);
      if (!raw) {
        return this.DEFAULT_THEME || 'dark';
      }
      const theme = String(raw).trim().toLowerCase();
      if (theme === 'light' || theme === 'dark') {
        return theme;
      }
      try {
        storage.removeItem(this.THEME_KEY);
      } catch (_) {}
      return this.DEFAULT_THEME || 'dark';
    } catch (e) {
      console.warn('Failed to get theme preference from storage:', e);
      return this.DEFAULT_THEME || 'dark';
    }
  },
  setTheme(theme) {
    let targetTheme = (typeof theme === 'string') ? theme.trim().toLowerCase() : '';
    if (targetTheme !== 'light' && targetTheme !== 'dark') {
      targetTheme = this.DEFAULT_THEME || 'dark';
    }
    try {
      const storage = this._getStorage();
      if (storage) {
        storage.setItem(this.THEME_KEY, targetTheme);
      }
    } catch (e) {
      console.warn('Failed to save theme to storage:', e);
    }
    try {
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.setAttribute('data-theme', targetTheme);
      }
    } catch (e) {
      console.warn('Failed to apply data-theme attribute to DOM:', e);
    }
    try {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        let event;
        if (typeof CustomEvent === 'function') {
          event = new CustomEvent('toeic-theme-change', { detail: { theme: targetTheme } });
        } else if (typeof document !== 'undefined' && typeof document.createEvent === 'function') {
          event = document.createEvent('CustomEvent');
          event.initCustomEvent('toeic-theme-change', false, false, { theme: targetTheme });
        }
        if (event) {
          window.dispatchEvent(event);
        }
      }
    } catch (e) {
      console.warn('Failed to dispatch toeic-theme-change event:', e);
    }
    return targetTheme;
  },
  initTheme() {
    try { this.initPageZoom(); } catch (_) {}
    try { this.bindHeaderPopoversClose(); } catch (_) {}
    try { this.bindFullscreenListeners(); } catch (_) {}
    const saved = this.getTheme();
    return this.setTheme(saved);
  },
  toggleTheme() {
    const current = this.getTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    return this.setTheme(next);
  },
  _currentZoom: 100,
  getPageZoom() {
    try {
      const storage = this._getStorage();
      if (!storage) return this._currentZoom || this.DEFAULT_ZOOM || 100;
      const raw = storage.getItem(this.ZOOM_KEY);
      if (!raw) return this._currentZoom || this.DEFAULT_ZOOM || 100;
      const num = parseInt(String(raw).trim(), 10);
      if (!isNaN(num) && num >= 70 && num <= 160) {
        this._currentZoom = num;
        return num;
      }
      try { storage.removeItem(this.ZOOM_KEY); } catch (_) {}
      return this.DEFAULT_ZOOM || 100;
    } catch (e) {
      return this._currentZoom || this.DEFAULT_ZOOM || 100;
    }
  },
  setPageZoom(zoomPct) {
    let parsed = parseInt(zoomPct, 10);
    if (isNaN(parsed)) parsed = this.DEFAULT_ZOOM || 100;
    const targetZoom = Math.min(160, Math.max(70, Math.round(parsed / 5) * 5));
    this._currentZoom = targetZoom;
    try {
      const storage = this._getStorage();
      if (storage) {
        storage.setItem(this.ZOOM_KEY, String(targetZoom));
      }
    } catch (_) {}
    try {
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.setAttribute('data-zoom', String(targetZoom));
        if (document.documentElement.style) {
          document.documentElement.style.zoom = targetZoom === 100 ? '' : `${targetZoom}%`;
          if (typeof document.documentElement.style.setProperty === 'function') {
            document.documentElement.style.setProperty('--app-zoom', String(targetZoom / 100));
          }
        }
      }
      if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
        const lbl = document.getElementById('zoom-level-label');
        if (lbl) lbl.textContent = `${targetZoom}%`;
        const popVal = document.getElementById('zoom-popover-val');
        if (popVal) popVal.textContent = `${targetZoom}%`;
      }
      if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
        document.querySelectorAll('.zoom-preset-btn').forEach(btn => {
          const z = parseInt(btn.getAttribute('data-zoom'), 10);
          if (btn.classList) btn.classList.toggle('active', z === targetZoom);
          if (typeof btn.setAttribute === 'function') {
            btn.setAttribute('aria-pressed', z === targetZoom ? 'true' : 'false');
          }
        });
      }
    } catch (_) {}
    return targetZoom;
  },
  stepPageZoom(delta = 10) {
    const current = this.getPageZoom();
    return this.setPageZoom(current + (Number(delta) || 0));
  },
  initPageZoom() {
    const saved = this.getPageZoom();
    return this.setPageZoom(saved);
  },
  toggleHeaderPopover(menuId, event) {
    if (event && typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }
    if (typeof document === 'undefined' || !menuId) return false;
    const menu = document.getElementById(menuId);
    if (!menu) return false;
    const isOpen = menu.style && menu.style.display === 'block';
    this.closeHeaderPopovers();
    if (!isOpen && menu.style) {
      menu.style.display = 'block';
      this.bindHeaderPopoversClose();
      return true;
    }
    return false;
  },
  closeHeaderPopovers() {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
    try {
      document.querySelectorAll('.header-ctrl-popover').forEach(p => {
        if (p && p.style) p.style.display = 'none';
      });
    } catch (_) {}
  },
  bindHeaderPopoversClose() {
    if (this._headerPopoverBound || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    this._headerPopoverBound = true;
    document.addEventListener('click', (e) => {
      const target = e && e.target;
      if (target && typeof target.closest === 'function' && target.closest('.header-ctrl-dropdown')) {
        return;
      }
      this.closeHeaderPopovers();
    });
  },
  isFullscreen() {
    if (typeof document === 'undefined') return false;
    return Boolean(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
  },
  syncFullscreenUI() {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
    const active = this.isFullscreen();
    try {
      if (document.documentElement && document.documentElement.classList) {
        document.documentElement.classList.toggle('is-fullscreen', active);
      }
      document.querySelectorAll('.fullscreen-toggle-btn').forEach(btn => {
        if (btn.classList && typeof btn.classList.toggle === 'function') {
          btn.classList.toggle('active', active);
        }
        if (typeof btn.setAttribute === 'function') {
          btn.setAttribute('aria-pressed', active ? 'true' : 'false');
          const label = active ? 'Thoát chế độ toàn màn hình' : 'Bật chế độ toàn màn hình';
          btn.setAttribute('title', label);
          btn.setAttribute('aria-label', label);
        }
        if (typeof btn.querySelector === 'function') {
          const enterIcon = btn.querySelector('.fs-icon-enter');
          const exitIcon = btn.querySelector('.fs-icon-exit');
          if (enterIcon && enterIcon.style) enterIcon.style.display = active ? 'none' : 'block';
          if (exitIcon && exitIcon.style) exitIcon.style.display = active ? 'block' : 'none';
        }
      });
      if (typeof UIRenderer !== 'undefined' && UIRenderer && typeof UIRenderer.syncReadingStageHeights === 'function') {
        setTimeout(() => UIRenderer.syncReadingStageHeights(), 80);
      }
    } catch (_) {}
  },
  bindFullscreenListeners() {
    if (this._fullscreenBound || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    this._fullscreenBound = true;
    const onFsChange = () => this.syncFullscreenUI();
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('mozfullscreenchange', onFsChange);
    document.addEventListener('MSFullscreenChange', onFsChange);
    this.syncFullscreenUI();
  },
  async toggleFullscreen() {
    if (typeof document === 'undefined') return false;
    try {
      if (this.isFullscreen()) {
        if (typeof document.exitFullscreen === 'function') {
          await document.exitFullscreen();
        } else if (typeof document.webkitExitFullscreen === 'function') {
          document.webkitExitFullscreen();
        } else if (typeof document.mozCancelFullScreen === 'function') {
          document.mozCancelFullScreen();
        } else if (typeof document.msExitFullscreen === 'function') {
          document.msExitFullscreen();
        }
        this.syncFullscreenUI();
        return false;
      } else {
        const docEl = document.documentElement;
        if (!docEl) return false;
        if (typeof docEl.requestFullscreen === 'function') {
          try {
            await docEl.requestFullscreen({ navigationUI: 'hide' });
          } catch (_) {
            await docEl.requestFullscreen();
          }
        } else if (typeof docEl.webkitRequestFullscreen === 'function') {
          docEl.webkitRequestFullscreen();
        } else if (typeof docEl.mozRequestFullScreen === 'function') {
          docEl.mozRequestFullScreen();
        } else if (typeof docEl.msRequestFullscreen === 'function') {
          docEl.msRequestFullscreen();
        } else {
          this.showFullscreenFallbackNotice();
          return false;
        }
        this.syncFullscreenUI();
        return true;
      }
    } catch (err) {
      this.showFullscreenFallbackNotice();
      return false;
    }
  },
  showFullscreenFallbackNotice() {
    if (typeof document === 'undefined' || !document.body) return;
    const existing = document.getElementById('fs-fallback-toast');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    const toast = document.createElement('div');
    toast.id = 'fs-fallback-toast';
    toast.setAttribute('role', 'status');
    toast.style.cssText = 'position:fixed;bottom:76px;left:50%;transform:translateX(-50%);z-index:9999;max-width:92vw;width:360px;padding:10px 14px;border-radius:12px;background:rgba(15,23,42,0.95);color:#f8fafc;border:1px solid rgba(99,102,241,0.45);box-shadow:0 8px 24px rgba(0,0,0,0.4);font-size:0.8rem;line-height:1.45;text-align:center;';
    toast.textContent = '💡 Trình duyệt này không hỗ trợ ẩn thanh địa chỉ trực tiếp. Trên iPhone (Safari), nhấn nút Chia sẻ ➔ "Thêm vào MH chính" để mở toàn màn hình.';
    document.body.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4200);
  },
  _getDefaultStudyProgress() {
    return {
      version: '1.0.0',
      lastBand: '450',
      vocabStatus: {},       // { [wordId]: 'mastered' | 'learning' }
      vocabStarred: {},      // { [wordId]: true }
      vocabQuizBest: {},     // { [topicId]: { correct, total, updatedAt } }
      grammarCompleted: {},  // { [topicId]: true }
      grammarQuizBest: {},   // { [topicId]: { correct, total, answers, updatedAt } }
      updatedAt: new Date().toISOString()
    };
  },
  _sanitizePlainObject(obj) {
    const clean = {};
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return clean;
    for (const k of Object.keys(obj)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      clean[k] = obj[k];
    }
    return clean;
  },
  getStudyProgress() {
    const def = this._getDefaultStudyProgress();
    try {
      const storage = this._getStorage();
      if (!storage) return def;
      const raw = storage.getItem(this.STUDY_PROGRESS_KEY);
      if (!raw) return def;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return def;
      const validBands = ['450', '550', '650', '750', '850'];
      const bandStr = String(parsed.lastBand || '450').replace('+', '').trim();
      return {
        version: '1.0.0',
        lastBand: validBands.includes(bandStr) ? bandStr : '450',
        vocabStatus: this._sanitizePlainObject(parsed.vocabStatus),
        vocabStarred: this._sanitizePlainObject(parsed.vocabStarred),
        vocabQuizBest: this._sanitizePlainObject(parsed.vocabQuizBest),
        grammarCompleted: this._sanitizePlainObject(parsed.grammarCompleted),
        grammarQuizBest: this._sanitizePlainObject(parsed.grammarQuizBest),
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : def.updatedAt
      };
    } catch (_) {
      return def;
    }
  },
  saveStudyProgress(progressObj) {
    if (!progressObj || typeof progressObj !== 'object' || Array.isArray(progressObj)) return false;
    try {
      const storage = this._getStorage();
      if (!storage) return false;
      const current = this.getStudyProgress();
      const validBands = ['450', '550', '650', '750', '850'];
      const rawBand = String(progressObj.lastBand || current.lastBand || '450').replace('+', '').trim();
      const merged = {
        version: '1.0.0',
        lastBand: validBands.includes(rawBand) ? rawBand : current.lastBand,
        vocabStatus: this._sanitizePlainObject(progressObj.vocabStatus || current.vocabStatus),
        vocabStarred: this._sanitizePlainObject(progressObj.vocabStarred || current.vocabStarred),
        vocabQuizBest: this._sanitizePlainObject(progressObj.vocabQuizBest || current.vocabQuizBest),
        grammarCompleted: this._sanitizePlainObject(progressObj.grammarCompleted || current.grammarCompleted),
        grammarQuizBest: this._sanitizePlainObject(progressObj.grammarQuizBest || current.grammarQuizBest),
        updatedAt: new Date().toISOString()
      };
      storage.setItem(this.STUDY_PROGRESS_KEY, JSON.stringify(merged));
      return true;
    } catch (_) {
      return false;
    }
  },
  setStudyBand(bandId) {
    const validBands = ['450', '550', '650', '750', '850'];
    const clean = String(bandId || '450').replace('+', '').trim();
    const safeBand = validBands.includes(clean) ? clean : '450';
    const prog = this.getStudyProgress();
    prog.lastBand = safeBand;
    this.saveStudyProgress(prog);
    return safeBand;
  },
  setVocabWordStatus(wordId, status) {
    if (!wordId || typeof wordId !== 'string') return null;
    const key = wordId.trim();
    if (!key || key === '__proto__' || key === 'constructor' || key === 'prototype') return null;
    const prog = this.getStudyProgress();
    if (status === 'mastered' || status === 'learning') {
      prog.vocabStatus[key] = status;
    } else {
      delete prog.vocabStatus[key];
    }
    this.saveStudyProgress(prog);
    return prog.vocabStatus[key] || 'unseen';
  },
  toggleVocabStar(wordId) {
    if (!wordId || typeof wordId !== 'string') return false;
    const key = wordId.trim();
    if (!key || key === '__proto__' || key === 'constructor' || key === 'prototype') return false;
    const prog = this.getStudyProgress();
    if (prog.vocabStarred[key]) {
      delete prog.vocabStarred[key];
    } else {
      prog.vocabStarred[key] = true;
    }
    this.saveStudyProgress(prog);
    return Boolean(prog.vocabStarred[key]);
  },
  saveVocabQuizScore(topicId, correct, total) {
    if (!topicId || typeof topicId !== 'string') return null;
    const key = topicId.trim();
    if (!key || key === '__proto__' || key === 'constructor' || key === 'prototype') return null;
    const c = Math.max(0, parseInt(correct, 10) || 0);
    const t = Math.max(1, parseInt(total, 10) || 1);
    const prog = this.getStudyProgress();
    const prev = prog.vocabQuizBest[key];
    const bestCorrect = (prev && typeof prev.correct === 'number') ? Math.max(prev.correct, c) : c;
    prog.vocabQuizBest[key] = {
      correct: bestCorrect,
      lastCorrect: c,
      total: t,
      updatedAt: new Date().toISOString()
    };
    this.saveStudyProgress(prog);
    return prog.vocabQuizBest[key];
  },
  toggleGrammarTopicCompleted(topicId, forceState) {
    if (!topicId || typeof topicId !== 'string') return false;
    const key = topicId.trim();
    if (!key || key === '__proto__' || key === 'constructor' || key === 'prototype') return false;
    const prog = this.getStudyProgress();
    const nextState = typeof forceState === 'boolean' ? forceState : !prog.grammarCompleted[key];
    if (nextState) {
      prog.grammarCompleted[key] = true;
    } else {
      delete prog.grammarCompleted[key];
    }
    this.saveStudyProgress(prog);
    return Boolean(prog.grammarCompleted[key]);
  },
  saveGrammarPracticeScore(topicId, correct, total, userAnswers = {}) {
    if (!topicId || typeof topicId !== 'string') return null;
    const key = topicId.trim();
    if (!key || key === '__proto__' || key === 'constructor' || key === 'prototype') return null;
    const c = Math.max(0, parseInt(correct, 10) || 0);
    const t = Math.max(1, parseInt(total, 10) || 1);
    const prog = this.getStudyProgress();
    const prev = prog.grammarQuizBest[key];
    const bestCorrect = (prev && typeof prev.correct === 'number') ? Math.max(prev.correct, c) : c;
    prog.grammarQuizBest[key] = {
      correct: bestCorrect,
      lastCorrect: c,
      total: t,
      answers: this._sanitizePlainObject(userAnswers),
      updatedAt: new Date().toISOString()
    };
    if (c >= Math.ceil(t * 0.6)) {
      prog.grammarCompleted[key] = true;
    }
    this.saveStudyProgress(prog);
    return prog.grammarQuizBest[key];
  },
  _getDefaultRoadmapState() {
    return {
      version: '1.0.0',
      initialized: false,
      placementDone: false,
      placementResult: null,
      profile: null,
      zones: [],
      nodeProgress: {},
      reviewQueue: {},
      streak: {
        count: 0,
        best: 0,
        lastActiveDate: null,
        activeDates: []
      },
      updatedAt: new Date().toISOString()
    };
  },
  getRoadmapState() {
    const def = this._getDefaultRoadmapState();
    try {
      const storage = this._getStorage();
      if (!storage) return def;
      const raw = storage.getItem(this.ROADMAP_STATE_KEY);
      if (!raw) return def;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return def;
      const rawStreak = (parsed.streak && typeof parsed.streak === 'object' && !Array.isArray(parsed.streak))
        ? parsed.streak
        : {};
      return {
        version: '1.0.0',
        initialized: Boolean(parsed.initialized),
        placementDone: Boolean(parsed.placementDone),
        placementResult: (parsed.placementResult && typeof parsed.placementResult === 'object' && !Array.isArray(parsed.placementResult))
          ? this._sanitizePlainObject(parsed.placementResult)
          : null,
        profile: (parsed.profile && typeof parsed.profile === 'object' && !Array.isArray(parsed.profile))
          ? this._sanitizePlainObject(parsed.profile)
          : null,
        zones: Array.isArray(parsed.zones) ? parsed.zones : [],
        nodeProgress: this._sanitizePlainObject(parsed.nodeProgress),
        reviewQueue: this._sanitizePlainObject(parsed.reviewQueue),
        streak: {
          count: Math.max(0, parseInt(rawStreak.count, 10) || 0),
          best: Math.max(0, parseInt(rawStreak.best, 10) || 0),
          lastActiveDate: typeof rawStreak.lastActiveDate === 'string' ? rawStreak.lastActiveDate : null,
          activeDates: Array.isArray(rawStreak.activeDates) ? rawStreak.activeDates.slice(-60) : []
        },
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : def.updatedAt
      };
    } catch (_) {
      return def;
    }
  },
  saveRoadmapState(stateObj) {
    if (!stateObj || typeof stateObj !== 'object' || Array.isArray(stateObj)) return false;
    try {
      const storage = this._getStorage();
      if (!storage) return false;
      const current = this.getRoadmapState();
      const nextStreak = (stateObj.streak && typeof stateObj.streak === 'object' && !Array.isArray(stateObj.streak))
        ? stateObj.streak
        : current.streak;
      const merged = {
        version: '1.0.0',
        initialized: typeof stateObj.initialized === 'boolean' ? stateObj.initialized : current.initialized,
        placementDone: typeof stateObj.placementDone === 'boolean' ? stateObj.placementDone : current.placementDone,
        placementResult: stateObj.placementResult !== undefined
          ? (stateObj.placementResult ? this._sanitizePlainObject(stateObj.placementResult) : null)
          : current.placementResult,
        profile: stateObj.profile !== undefined
          ? (stateObj.profile ? this._sanitizePlainObject(stateObj.profile) : null)
          : current.profile,
        zones: Array.isArray(stateObj.zones) ? stateObj.zones : current.zones,
        nodeProgress: stateObj.nodeProgress !== undefined
          ? this._sanitizePlainObject(stateObj.nodeProgress)
          : current.nodeProgress,
        reviewQueue: stateObj.reviewQueue !== undefined
          ? this._sanitizePlainObject(stateObj.reviewQueue)
          : current.reviewQueue,
        streak: {
          count: Math.max(0, parseInt(nextStreak.count, 10) || 0),
          best: Math.max(0, parseInt(nextStreak.best, 10) || 0),
          lastActiveDate: typeof nextStreak.lastActiveDate === 'string' ? nextStreak.lastActiveDate : null,
          activeDates: Array.isArray(nextStreak.activeDates) ? nextStreak.activeDates.slice(-60) : []
        },
        updatedAt: new Date().toISOString()
      };
      storage.setItem(this.ROADMAP_STATE_KEY, JSON.stringify(merged));
      return true;
    } catch (_) {
      return false;
    }
  },
  resetRoadmapState() {
    try {
      const storage = this._getStorage();
      if (!storage) return false;
      storage.removeItem(this.ROADMAP_STATE_KEY);
      return true;
    } catch (_) {
      return false;
    }
  },
  exportStudyProgressJSON() {
    const progress = this.getStudyProgress();
    const roadmapState = this.getRoadmapState();
    const payload = {
      app: 'TOEIC Master Study Backup',
      backupVersion: '1.1.0',
      exportedAt: new Date().toISOString(),
      studyProgress: progress,
      roadmapState
    };
    return JSON.stringify(payload, null, 2);
  },
  importStudyProgressJSON(rawInput) {
    try {
      const parsed = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, error: 'Dữ liệu JSON không hợp lệ.' };
      }
      const source = (parsed.studyProgress && typeof parsed.studyProgress === 'object')
        ? parsed.studyProgress
        : parsed;
      const incomingRoadmap = (parsed.roadmapState && typeof parsed.roadmapState === 'object' && !Array.isArray(parsed.roadmapState))
        ? parsed.roadmapState
        : null;
      const hasStudyFields = Boolean(
        source.vocabStatus ||
        source.vocabStarred ||
        source.vocabQuizBest ||
        source.grammarCompleted ||
        source.grammarQuizBest
      );
      if (!hasStudyFields && !incomingRoadmap) {
        return { ok: false, error: 'File backup không chứa dữ liệu tiến độ Từ vựng / Ngữ pháp / Lộ trình.' };
      }
      let saved = true;
      if (hasStudyFields) {
        const current = this.getStudyProgress();
        const merged = {
          version: '1.0.0',
          lastBand: source.lastBand || current.lastBand || '450',
          vocabStatus: { ...current.vocabStatus, ...this._sanitizePlainObject(source.vocabStatus) },
          vocabStarred: { ...current.vocabStarred, ...this._sanitizePlainObject(source.vocabStarred) },
          vocabQuizBest: { ...current.vocabQuizBest, ...this._sanitizePlainObject(source.vocabQuizBest) },
          grammarCompleted: { ...current.grammarCompleted, ...this._sanitizePlainObject(source.grammarCompleted) },
          grammarQuizBest: { ...current.grammarQuizBest, ...this._sanitizePlainObject(source.grammarQuizBest) },
          updatedAt: new Date().toISOString()
        };
        saved = this.saveStudyProgress(merged);
      }
      if (incomingRoadmap) {
        this.saveRoadmapState(incomingRoadmap);
      }
      return { ok: saved, progress: this.getStudyProgress(), roadmapState: this.getRoadmapState() };
    } catch (err) {
      return { ok: false, error: 'Không thể đọc file JSON: ' + (err && err.message ? err.message : 'Lỗi cú pháp') };
    }
  }
};
if (typeof window !== 'undefined') {
  window.StorageService = StorageService;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StorageService;
}