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
  FIREBASE_CONFIG_STORAGE_KEY: 'toeic_firebase_config_v1',
  CLOUD_USER_CACHE_KEY: 'toeic_cloud_user_cache_v1',
  CLOUD_SYNC_META_KEY: 'toeic_cloud_sync_meta_v1',
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
      if (typeof this.scheduleCloudPush === 'function' && !this._isSyncingFromCloud) {
        this.scheduleCloudPush('activeSession');
      }
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
        if (typeof this.scheduleCloudPush === 'function' && !this._isSyncingFromCloud) {
          this.scheduleCloudPush('activeSession');
        }
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
        if (typeof this.scheduleCloudPush === 'function' && !this._isSyncingFromCloud) {
          this.scheduleCloudPush('examHistory');
        }
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
    try { this.initCloudAuthUI(); } catch (_) {}
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
      if (typeof this.scheduleCloudPush === 'function' && !this._isSyncingFromCloud) {
        this.scheduleCloudPush('studyProgress');
      }
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
      if (typeof this.scheduleCloudPush === 'function' && !this._isSyncingFromCloud) {
        this.scheduleCloudPush('roadmapState');
      }
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
      if (typeof this.scheduleCloudPush === 'function' && !this._isSyncingFromCloud) {
        this.scheduleCloudPush('roadmapState');
      }
      return true;
    } catch (_) {
      return false;
    }
  },
  exportStudyProgressJSON() {
    const progress = this.getStudyProgress();
    const roadmapState = this.getRoadmapState();
    const examHistory = this.getExamHistory();
    const payload = {
      app: 'TOEIC Master Study Backup',
      backupVersion: '1.2.0',
      exportedAt: new Date().toISOString(),
      studyProgress: progress,
      roadmapState,
      examHistory: Array.isArray(examHistory) ? examHistory.slice(0, 30) : []
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
      const incomingHistory = Array.isArray(parsed.examHistory) ? parsed.examHistory : null;
      const hasStudyFields = Boolean(
        source.vocabStatus ||
        source.vocabStarred ||
        source.vocabQuizBest ||
        source.grammarCompleted ||
        source.grammarQuizBest
      );
      if (!hasStudyFields && !incomingRoadmap && !incomingHistory) {
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
      if (incomingHistory && incomingHistory.length > 0) {
        const mergedHist = this._mergeExamHistories(this.getExamHistory(), incomingHistory);
        const storage = this._getStorage();
        if (storage) {
          try { storage.setItem(this.EXAM_HISTORY_KEY, JSON.stringify(mergedHist)); } catch (_) {}
        }
      }
      return { ok: saved, progress: this.getStudyProgress(), roadmapState: this.getRoadmapState() };
    } catch (err) {
      return { ok: false, error: 'Không thể đọc file JSON: ' + (err && err.message ? err.message : 'Lỗi cú pháp') };
    }
  },
  _firebaseApp: null,
  _firebaseAuth: null,
  _firebaseDb: null,
  _firebaseInitPromise: null,
  _currentUser: null,
  _cloudSyncStatus: 'idle', // 'idle' | 'syncing' | 'synced' | 'error'
  _cloudSyncError: '',
  _cloudPushTimer: null,
  _isSyncingFromCloud: false,
  _cloudModalOpen: false,
  _cloudModalTab: 'auth', // 'auth' | 'config' | 'guide'
  _authFormMode: 'login', // 'login' | 'register' | 'reset'
  _cloudPopstateBound: false,
  parseFirebaseConfigSnippet(rawInput) {
    if (!rawInput) return null;
    if (typeof rawInput === 'object' && !Array.isArray(rawInput)) {
      const apiKey = String(rawInput.apiKey || '').trim();
      const projectId = String(rawInput.projectId || '').trim();
      if (apiKey.length >= 10 && projectId.length >= 2) {
        return {
          apiKey,
          authDomain: String(rawInput.authDomain || `${projectId}.firebaseapp.com`).trim(),
          projectId,
          storageBucket: String(rawInput.storageBucket || `${projectId}.appspot.com`).trim(),
          messagingSenderId: String(rawInput.messagingSenderId || '').trim(),
          appId: String(rawInput.appId || '').trim()
        };
      }
      return null;
    }
    const str = String(rawInput).trim();
    if (!str) return null;
    try {
      const parsed = JSON.parse(str);
      if (parsed && typeof parsed === 'object') {
        return this.parseFirebaseConfigSnippet(parsed);
      }
    } catch (_) {}
    const extractField = (key) => {
      const reg = new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"'\\n]+)["']`, 'i');
      const m = str.match(reg);
      return m && m[1] ? m[1].trim() : '';
    };
    const apiKey = extractField('apiKey');
    const projectId = extractField('projectId');
    if (apiKey.length < 10 || projectId.length < 2) {
      return null;
    }
    return {
      apiKey,
      authDomain: extractField('authDomain') || `${projectId}.firebaseapp.com`,
      projectId,
      storageBucket: extractField('storageBucket') || `${projectId}.appspot.com`,
      messagingSenderId: extractField('messagingSenderId') || '',
      appId: extractField('appId') || ''
    };
  },
  getFirebaseConfig() {
    try {
      const cfgSource = (typeof AppConfig !== 'undefined' && AppConfig && AppConfig.FIREBASE_CONFIG)
        ? AppConfig.FIREBASE_CONFIG
        : (typeof window !== 'undefined' && window.AppConfig && window.AppConfig.FIREBASE_CONFIG ? window.AppConfig.FIREBASE_CONFIG : null);
      const fromCode = this.parseFirebaseConfigSnippet(cfgSource);
      if (fromCode) return fromCode;
      const storage = this._getStorage();
      if (storage) {
        const rawSaved = storage.getItem(this.FIREBASE_CONFIG_STORAGE_KEY);
        if (rawSaved) {
          const fromStorage = this.parseFirebaseConfigSnippet(rawSaved);
          if (fromStorage) return fromStorage;
        }
      }
    } catch (_) {}
    return null;
  },
  isFirebaseConfigured() {
    return Boolean(this.getFirebaseConfig());
  },
  saveFirebaseConfig(rawInput) {
    const parsed = this.parseFirebaseConfigSnippet(rawInput);
    if (!parsed) {
      return {
        ok: false,
        error: 'Không tìm thấy apiKey hoặc projectId hợp lệ. Hãy dán nguyên khối const firebaseConfig = { ... } từ Firebase Console.'
      };
    }
    try {
      const storage = this._getStorage();
      if (storage) {
        storage.setItem(this.FIREBASE_CONFIG_STORAGE_KEY, JSON.stringify(parsed));
      }
      this._firebaseInitPromise = null;
      this._firebaseApp = null;
      this._firebaseAuth = null;
      this._firebaseDb = null;
      return { ok: true, config: parsed };
    } catch (err) {
      return { ok: false, error: 'Không thể lưu cấu hình: ' + (err && err.message ? err.message : '') };
    }
  },
  clearFirebaseConfig() {
    try {
      const storage = this._getStorage();
      if (storage) {
        storage.removeItem(this.FIREBASE_CONFIG_STORAGE_KEY);
      }
      this._firebaseInitPromise = null;
      this._firebaseApp = null;
      this._firebaseAuth = null;
      this._firebaseDb = null;
      return true;
    } catch (_) {
      return false;
    }
  },
  getCachedCloudUser() {
    if (this._currentUser) return this._currentUser;
    try {
      const storage = this._getStorage();
      if (!storage) return null;
      const raw = storage.getItem(this.CLOUD_USER_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return (parsed && parsed.uid) ? parsed : null;
    } catch (_) {
      return null;
    }
  },
  _setCachedCloudUser(userObj) {
    try {
      const storage = this._getStorage();
      if (!storage) return;
      if (!userObj || !userObj.uid) {
        storage.removeItem(this.CLOUD_USER_CACHE_KEY);
        return;
      }
      storage.setItem(this.CLOUD_USER_CACHE_KEY, JSON.stringify({
        uid: userObj.uid,
        email: userObj.email || '',
        displayName: userObj.displayName || (userObj.email ? userObj.email.split('@')[0] : 'Học viên TOEIC'),
        photoURL: userObj.photoURL || ''
      }));
    } catch (_) {}
  },
  getCloudSyncMeta() {
    try {
      const storage = this._getStorage();
      if (!storage) return { lastSyncedAt: null };
      const raw = storage.getItem(this.CLOUD_SYNC_META_KEY);
      return raw ? JSON.parse(raw) : { lastSyncedAt: null };
    } catch (_) {
      return { lastSyncedAt: null };
    }
  },
  _setCloudSyncMeta(metaObj) {
    try {
      const storage = this._getStorage();
      if (!storage) return;
      const cur = this.getCloudSyncMeta();
      storage.setItem(this.CLOUD_SYNC_META_KEY, JSON.stringify({ ...cur, ...metaObj }));
    } catch (_) {}
  },
  _loadScriptOnce(src) {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      return Promise.reject(new Error('No DOM available'));
    }
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        if (existing.getAttribute('data-loaded') === 'true') return resolve();
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error(`Không thể tải script: ${src}`)));
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => {
        s.setAttribute('data-loaded', 'true');
        resolve();
      };
      s.onerror = () => reject(new Error(`Không thể tải SDK Firebase từ CDN: ${src}`));
      if (document.head) {
        document.head.appendChild(s);
      } else if (document.body) {
        document.body.appendChild(s);
      }
    });
  },
  async ensureFirebaseInitialized() {
    const config = this.getFirebaseConfig();
    if (!config) return false;
    if (this._firebaseAuth && this._firebaseDb) return true;
    if (this._firebaseInitPromise) return this._firebaseInitPromise;
    this._firebaseInitPromise = (async () => {
      try {
        const hasGlobalFirebase = typeof window !== 'undefined' && window.firebase && typeof window.firebase.initializeApp === 'function';
        if (!hasGlobalFirebase) {
          const ver = '10.14.1';
          await this._loadScriptOnce(`https://www.gstatic.com/firebasejs/${ver}/firebase-app-compat.js`);
          await this._loadScriptOnce(`https://www.gstatic.com/firebasejs/${ver}/firebase-auth-compat.js`);
          await this._loadScriptOnce(`https://www.gstatic.com/firebasejs/${ver}/firebase-firestore-compat.js`);
        }
        const fb = (typeof window !== 'undefined' && window.firebase) ? window.firebase : null;
        if (!fb) throw new Error('Firebase SDK chưa sẵn sàng.');
        if (!fb.apps || fb.apps.length === 0) {
          this._firebaseApp = fb.initializeApp(config);
        } else {
          this._firebaseApp = fb.app();
        }
        this._firebaseAuth = fb.auth();
        this._firebaseDb = fb.firestore();
        this._firebaseAuth.onAuthStateChanged(async (user) => {
          if (user) {
            this._currentUser = {
              uid: user.uid,
              email: user.email || '',
              displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'Học viên TOEIC'),
              photoURL: user.photoURL || ''
            };
            this._setCachedCloudUser(this._currentUser);
            this.updateCloudAuthHeaderBadge();
            this.renderCloudAuthModalBody();
            await this.syncWithCloud('login');
          } else {
            this._currentUser = null;
            this._cloudSyncStatus = 'idle';
            this._setCachedCloudUser(null);
            this.updateCloudAuthHeaderBadge();
            this.renderCloudAuthModalBody();
          }
        });
        return true;
      } catch (err) {
        console.warn('Firebase initialization error:', err);
        this._cloudSyncStatus = 'error';
        this._cloudSyncError = err && err.message ? err.message : 'Lỗi khởi tạo Firebase';
        this._firebaseInitPromise = null;
        return false;
      }
    })();
    return this._firebaseInitPromise;
  },
  _compactHistoryForCloud(historyList) {
    if (!Array.isArray(historyList)) return [];
    return historyList.slice(0, 30).map(rec => {
      if (!rec || typeof rec !== 'object') return null;
      const answersMap = {};
      if (Array.isArray(rec.detailedQuestions)) {
        rec.detailedQuestions.forEach(q => {
          if (q && q.questionNumber && q.userChoice) {
            answersMap[q.questionNumber] = q.userChoice;
          }
        });
      }
      return {
        id: rec.id || '',
        date: rec.date || new Date().toISOString(),
        bookName: rec.bookName || 'EST 2022',
        testId: rec.testId || 1,
        testTitle: rec.testTitle || '',
        mode: rec.mode || 'full',
        partFilter: rec.partFilter || null,
        dayFilter: rec.dayFilter || null,
        totalQuestions: rec.totalQuestions || 0,
        answeredCount: rec.answeredCount || 0,
        totalCorrect: rec.totalCorrect || 0,
        listeningCorrect: rec.listeningCorrect || 0,
        readingCorrect: rec.readingCorrect || 0,
        listeningScore: rec.listeningScore || 0,
        readingScore: rec.readingScore || 0,
        totalScore: rec.totalScore || 0,
        accuracyPercent: rec.accuracyPercent || 0,
        timeSpentSeconds: rec.timeSpentSeconds || 0,
        partStats: rec.partStats || null,
        answersMap,
        detailedQuestions: Array.isArray(rec.detailedQuestions)
          ? rec.detailedQuestions.map(q => ({
              questionNumber: q.questionNumber,
              part: q.part,
              groupId: q.groupId,
              userChoice: q.userChoice,
              correctChoice: q.correctChoice,
              isCorrect: q.isCorrect
            }))
          : []
      };
    }).filter(Boolean);
  },
  _mergeExamHistories(localList, cloudList) {
    const a = Array.isArray(localList) ? localList : [];
    const b = Array.isArray(cloudList) ? cloudList : [];
    const map = new Map();
    const makeKey = (item) => {
      if (!item || typeof item !== 'object') return '';
      if (item.id && typeof item.id === 'string') return item.id.trim();
      return `${item.date || ''}_${item.bookName || 'EST 2022'}_${item.testId || 1}_${item.mode || 'full'}_${item.totalScore || 0}`;
    };
    [...a, ...b].forEach(item => {
      const k = makeKey(item);
      if (!k) return;
      const existing = map.get(k);
      if (!existing) {
        map.set(k, item);
      } else {
        const lenCur = Array.isArray(existing.detailedQuestions) ? existing.detailedQuestions.length : 0;
        const lenNew = Array.isArray(item.detailedQuestions) ? item.detailedQuestions.length : 0;
        if (lenNew > lenCur) {
          map.set(k, item);
        }
      }
    });
    return Array.from(map.values())
      .sort((x, y) => {
        const tx = Date.parse(x.date || '') || 0;
        const ty = Date.parse(y.date || '') || 0;
        return ty - tx;
      })
      .slice(0, 30);
  },
  _mergeStudyProgressData(localProg, cloudProg) {
    const loc = localProg || this._getDefaultStudyProgress();
    const cld = (cloudProg && typeof cloudProg === 'object') ? cloudProg : this._getDefaultStudyProgress();
    const vocabStatus = { ...(cld.vocabStatus || {}), ...(loc.vocabStatus || {}) };
    for (const k of Object.keys(cld.vocabStatus || {})) {
      if (cld.vocabStatus[k] === 'mastered' || loc.vocabStatus?.[k] === 'mastered') {
        vocabStatus[k] = 'mastered';
      } else if (cld.vocabStatus[k] === 'learning' || loc.vocabStatus?.[k] === 'learning') {
        vocabStatus[k] = 'learning';
      }
    }
    const vocabStarred = { ...(cld.vocabStarred || {}), ...(loc.vocabStarred || {}) };
    const mergeQuizMap = (m1 = {}, m2 = {}) => {
      const out = { ...m1 };
      for (const [k, v] of Object.entries(m2)) {
        if (!v || typeof v !== 'object') continue;
        if (!out[k] || typeof out[k] !== 'object') {
          out[k] = v;
        } else {
          const bestC = Math.max(Number(out[k].correct) || 0, Number(v.correct) || 0);
          const isNewer = (Date.parse(v.updatedAt || '') || 0) >= (Date.parse(out[k].updatedAt || '') || 0);
          out[k] = {
            ...(isNewer ? out[k] : v),
            ...(isNewer ? v : out[k]),
            correct: bestC
          };
        }
      }
      return out;
    };
    const locTime = Date.parse(loc.updatedAt || '') || 0;
    const cldTime = Date.parse(cld.updatedAt || '') || 0;
    return {
      version: '1.0.0',
      lastBand: (locTime >= cldTime ? loc.lastBand : cld.lastBand) || '450',
      vocabStatus: this._sanitizePlainObject(vocabStatus),
      vocabStarred: this._sanitizePlainObject(vocabStarred),
      vocabQuizBest: this._sanitizePlainObject(mergeQuizMap(cld.vocabQuizBest, loc.vocabQuizBest)),
      grammarCompleted: this._sanitizePlainObject({ ...(cld.grammarCompleted || {}), ...(loc.grammarCompleted || {}) }),
      grammarQuizBest: this._sanitizePlainObject(mergeQuizMap(cld.grammarQuizBest, loc.grammarQuizBest)),
      updatedAt: new Date().toISOString()
    };
  },
  _mergeRoadmapStateData(localRm, cloudRm) {
    const loc = localRm || this._getDefaultRoadmapState();
    const cld = (cloudRm && typeof cloudRm === 'object') ? cloudRm : this._getDefaultRoadmapState();
    const locTime = Date.parse(loc.updatedAt || '') || 0;
    const cldTime = Date.parse(cld.updatedAt || '') || 0;
    const primary = (loc.placementDone && !cld.placementDone)
      ? loc
      : ((!loc.placementDone && cld.placementDone) ? cld : (locTime >= cldTime ? loc : cld));
    const secondary = primary === loc ? cld : loc;
    const nodeProgress = { ...(secondary.nodeProgress || {}), ...(primary.nodeProgress || {}) };
    const allNodeKeys = new Set([
      ...Object.keys(loc.nodeProgress || {}),
      ...Object.keys(cld.nodeProgress || {})
    ]);
    allNodeKeys.forEach(nid => {
      const n1 = loc.nodeProgress?.[nid];
      const n2 = cld.nodeProgress?.[nid];
      if (n1 && n2 && typeof n1 === 'object' && typeof n2 === 'object') {
        const steps1 = (n1.steps && typeof n1.steps === 'object') ? n1.steps : {};
        const steps2 = (n2.steps && typeof n2.steps === 'object') ? n2.steps : {};
        nodeProgress[nid] = {
          ...n2,
          ...n1,
          unlocked: Boolean(n1.unlocked || n2.unlocked),
          completed: Boolean(n1.completed || n2.completed),
          stars: Math.max(Number(n1.stars) || 0, Number(n2.stars) || 0),
          steps: {
            review: Boolean(steps1.review || steps2.review),
            study: Boolean(steps1.study || steps2.study),
            practice: Boolean(steps1.practice || steps2.practice)
          }
        };
      }
    });
    const reviewQueue = { ...(secondary.reviewQueue || {}), ...(primary.reviewQueue || {}) };
    for (const [qid, item] of Object.entries(secondary.reviewQueue || {})) {
      const cur = reviewQueue[qid];
      if (cur && item && typeof cur === 'object' && typeof item === 'object') {
        if ((Number(item.box) || 1) > (Number(cur.box) || 1)) {
          reviewQueue[qid] = item;
        }
      }
    }
    const s1 = loc.streak || {};
    const s2 = cld.streak || {};
    const mergedDates = Array.from(new Set([...(Array.isArray(s1.activeDates) ? s1.activeDates : []), ...(Array.isArray(s2.activeDates) ? s2.activeDates : [])]))
      .filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort()
      .slice(-60);
    return {
      version: '1.0.0',
      initialized: Boolean(loc.initialized || cld.initialized),
      placementDone: Boolean(loc.placementDone || cld.placementDone),
      placementResult: primary.placementResult || secondary.placementResult || null,
      profile: primary.profile || secondary.profile || null,
      zones: (Array.isArray(primary.zones) && primary.zones.length > 0) ? primary.zones : (Array.isArray(secondary.zones) ? secondary.zones : []),
      nodeProgress: this._sanitizePlainObject(nodeProgress),
      reviewQueue: this._sanitizePlainObject(reviewQueue),
      streak: {
        count: Math.max(Number(s1.count) || 0, Number(s2.count) || 0),
        best: Math.max(Number(s1.best) || 0, Number(s2.best) || 0),
        lastActiveDate: mergedDates.length > 0 ? mergedDates[mergedDates.length - 1] : (s1.lastActiveDate || s2.lastActiveDate || null),
        activeDates: mergedDates
      },
      updatedAt: new Date().toISOString()
    };
  },
  mergeCloudAndLocalData(cloudDoc) {
    const safeCloud = (cloudDoc && typeof cloudDoc === 'object') ? cloudDoc : {};
    const mergedHistory = this._mergeExamHistories(this.getExamHistory(), safeCloud.examHistory);
    const mergedStudy = this._mergeStudyProgressData(this.getStudyProgress(), safeCloud.studyProgress);
    const mergedRoadmap = this._mergeRoadmapStateData(this.getRoadmapState(), safeCloud.roadmapState);
    const localActive = this.getActiveSession();
    const cloudActive = (safeCloud.activeSession && typeof safeCloud.activeSession === 'object' && !Array.isArray(safeCloud.activeSession))
      ? safeCloud.activeSession
      : null;
    let mergedActive = localActive;
    if (cloudActive && cloudActive.lastUpdated && Number(cloudActive.timeRemaining) > 0) {
      const TTL_24H = 24 * 60 * 60 * 1000;
      const isFresh = (Date.now() - Number(cloudActive.lastUpdated)) <= TTL_24H;
      if (isFresh && (!localActive || Number(cloudActive.lastUpdated) > Number(localActive.lastUpdated || 0))) {
        mergedActive = cloudActive;
      }
    }
    this._isSyncingFromCloud = true;
    try {
      const storage = this._getStorage();
      if (storage) {
        storage.setItem(this.EXAM_HISTORY_KEY, JSON.stringify(mergedHistory));
        storage.setItem(this.STUDY_PROGRESS_KEY, JSON.stringify(mergedStudy));
        storage.setItem(this.ROADMAP_STATE_KEY, JSON.stringify(mergedRoadmap));
        if (mergedActive) {
          storage.setItem(this.ACTIVE_SESSION_KEY, JSON.stringify(mergedActive));
        }
      }
    } catch (_) {} finally {
      this._isSyncingFromCloud = false;
    }
    return {
      examHistory: mergedHistory,
      studyProgress: mergedStudy,
      roadmapState: mergedRoadmap,
      activeSession: mergedActive
    };
  },
  async syncWithCloud(triggerSource = 'manual') {
    const ready = await this.ensureFirebaseInitialized();
    if (!ready || !this._firebaseDb || !this._currentUser || !this._currentUser.uid) {
      return { ok: false, error: 'Chưa đăng nhập hoặc chưa kết nối Firebase.' };
    }
    this._cloudSyncStatus = 'syncing';
    this._cloudSyncError = '';
    this.updateCloudAuthHeaderBadge();
    this.renderCloudAuthModalBody();
    try {
      const uid = this._currentUser.uid;
      const docRef = this._firebaseDb.collection('users').doc(uid);
      const snap = await docRef.get();
      const cloudData = (snap && snap.exists) ? snap.data() : {};
      const merged = this.mergeCloudAndLocalData(cloudData);
      const nowIso = new Date().toISOString();
      await docRef.set({
        profile: {
          uid: this._currentUser.uid,
          email: this._currentUser.email || '',
          displayName: this._currentUser.displayName || '',
          photoURL: this._currentUser.photoURL || '',
          lastSyncedAt: nowIso
        },
        examHistory: this._compactHistoryForCloud(merged.examHistory),
        studyProgress: merged.studyProgress,
        roadmapState: merged.roadmapState,
        activeSession: merged.activeSession || null,
        updatedAt: nowIso
      }, { merge: true });
      this._cloudSyncStatus = 'synced';
      this._setCloudSyncMeta({ lastSyncedAt: nowIso, uid });
      this.updateCloudAuthHeaderBadge();
      this.renderCloudAuthModalBody();
      this._notifyPageDataRefreshed(triggerSource);
      return { ok: true, syncedAt: nowIso };
    } catch (err) {
      console.warn('Cloud sync failed:', err);
      this._cloudSyncStatus = 'error';
      this._cloudSyncError = this._formatFirebaseError(err);
      this.updateCloudAuthHeaderBadge();
      this.renderCloudAuthModalBody();
      return { ok: false, error: this._cloudSyncError };
    }
  },
  scheduleCloudPush(changedSection = 'all') {
    if (this._isSyncingFromCloud) return false;
    const cachedUser = this.getCachedCloudUser();
    if (!cachedUser || !this.isFirebaseConfigured()) return false;
    if (this._cloudPushTimer) {
      clearTimeout(this._cloudPushTimer);
    }
    this._cloudPushTimer = setTimeout(async () => {
      try {
        const ready = await this.ensureFirebaseInitialized();
        if (!ready || !this._firebaseDb || !this._currentUser || !this._currentUser.uid) return;
        const uid = this._currentUser.uid;
        const nowIso = new Date().toISOString();
        const payload = {
          updatedAt: nowIso,
          'profile.lastSyncedAt': nowIso
        };
        if (changedSection === 'activeSession' || changedSection === 'all') {
          payload.activeSession = this.getActiveSession() || null;
        }
        if (changedSection === 'examHistory' || changedSection === 'all') {
          payload.examHistory = this._compactHistoryForCloud(this.getExamHistory());
        }
        if (changedSection === 'studyProgress' || changedSection === 'all') {
          payload.studyProgress = this.getStudyProgress();
        }
        if (changedSection === 'roadmapState' || changedSection === 'all') {
          payload.roadmapState = this.getRoadmapState();
        }
        await this._firebaseDb.collection('users').doc(uid).set(payload, { merge: true });
        this._cloudSyncStatus = 'synced';
        this._setCloudSyncMeta({ lastSyncedAt: nowIso, uid });
        this.updateCloudAuthHeaderBadge();
      } catch (err) {
        console.warn('Background cloud push error:', err);
      }
    }, 1800);
    return true;
  },
  _notifyPageDataRefreshed(source) {
    if (typeof window === 'undefined') return;
    try {
      if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('toeic-cloud-sync-complete', { detail: { source } }));
      }
      if (typeof window.checkActiveSession === 'function') window.checkActiveSession();
      if (typeof window.renderTestsGrid === 'function') window.renderTestsGrid();
      if (typeof window.updateRoadmapQuickStrip === 'function') window.updateRoadmapQuickStrip();
      if (typeof window.renderHistory === 'function') window.renderHistory();
      if (typeof window.RoadmapEngine !== 'undefined' && window.RoadmapEngine && typeof window.RoadmapEngine.init === 'function') {
        window.RoadmapEngine.state = this.getRoadmapState();
        if (typeof window.RoadmapEngine.renderAll === 'function') window.RoadmapEngine.renderAll();
      }
    } catch (_) {}
  },
  _formatFirebaseError(err) {
    if (!err) return 'Đã xảy ra lỗi không xác định.';
    const code = String(err.code || '').toLowerCase();
    const msg = String(err.message || '');
    if (code.includes('invalid-email')) return 'Địa chỉ Email không hợp lệ.';
    if (code.includes('user-not-found') || code.includes('invalid-credential') || code.includes('invalid-login-credentials')) {
      return 'Email hoặc mật khẩu không chính xác.';
    }
    if (code.includes('wrong-password')) return 'Mật khẩu không chính xác.';
    if (code.includes('email-already-in-use')) return 'Email này đã được đăng ký. Hãy chuyển sang Đăng nhập.';
    if (code.includes('weak-password')) return 'Mật khẩu cần tối thiểu 6 ký tự.';
    if (code.includes('popup-closed-by-user')) return 'Bạn đã đóng cửa sổ đăng nhập Google.';
    if (code.includes('unauthorized-domain')) {
      const host = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : 'domain hiện tại';
      return `Tên miền "${host}" chưa được cấp phép trong Firebase. Hãy vào Firebase Console ➔ Authentication ➔ Settings ➔ Authorized domains ➔ Add domain "${host}".`;
    }
    if (code.includes('permission-denied') || msg.includes('Missing or insufficient permissions')) {
      return 'Chưa cấp quyền đọc/ghi Firestore. Hãy vào tab "📖 Hướng dẫn" và copy Security Rules dán vào Firestore Rules.';
    }
    return msg || 'Lỗi kết nối đến máy chủ xác thực.';
  },
  async signInWithGoogle() {
    const ready = await this.ensureFirebaseInitialized();
    if (!ready || !this._firebaseAuth) {
      return { ok: false, error: 'Vui lòng cấu hình Firebase trước khi đăng nhập.' };
    }
    try {
      const fb = window.firebase;
      const provider = new fb.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const res = await this._firebaseAuth.signInWithPopup(provider);
      return { ok: true, user: res && res.user ? res.user : null };
    } catch (err) {
      const code = String(err && err.code ? err.code : '');
      if (code.includes('popup-blocked')) {
        try {
          const fb = window.firebase;
          const provider = new fb.auth.GoogleAuthProvider();
          await this._firebaseAuth.signInWithRedirect(provider);
          return { ok: true, redirecting: true };
        } catch (redirErr) {
          return { ok: false, error: this._formatFirebaseError(redirErr) };
        }
      }
      return { ok: false, error: this._formatFirebaseError(err) };
    }
  },
  async submitEmailAuth(mode, email, password, displayName = '') {
    const cleanEmail = String(email || '').trim();
    const cleanPass = String(password || '');
    const cleanName = String(displayName || '').trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { ok: false, error: 'Vui lòng nhập địa chỉ Email hợp lệ.' };
    }
    if (mode === 'reset') {
      const ready = await this.ensureFirebaseInitialized();
      if (!ready || !this._firebaseAuth) return { ok: false, error: 'Chưa cấu hình Firebase.' };
      try {
        await this._firebaseAuth.sendPasswordResetEmail(cleanEmail);
        return { ok: true, resetSent: true, message: `Đã gửi link đặt lại mật khẩu tới ${cleanEmail}. Hãy kiểm tra hộp thư!` };
      } catch (err) {
        return { ok: false, error: this._formatFirebaseError(err) };
      }
    }
    if (cleanPass.length < 6) {
      return { ok: false, error: 'Mật khẩu phải có từ 6 ký tự trở lên.' };
    }
    const ready = await this.ensureFirebaseInitialized();
    if (!ready || !this._firebaseAuth) {
      return { ok: false, error: 'Vui lòng cấu hình Firebase trước khi đăng nhập.' };
    }
    try {
      if (mode === 'register') {
        const cred = await this._firebaseAuth.createUserWithEmailAndPassword(cleanEmail, cleanPass);
        if (cred && cred.user && cleanName && typeof cred.user.updateProfile === 'function') {
          await cred.user.updateProfile({ displayName: cleanName });
          this._currentUser = {
            uid: cred.user.uid,
            email: cred.user.email || cleanEmail,
            displayName: cleanName,
            photoURL: ''
          };
          this._setCachedCloudUser(this._currentUser);
        }
        return { ok: true, user: cred ? cred.user : null };
      } else {
        const cred = await this._firebaseAuth.signInWithEmailAndPassword(cleanEmail, cleanPass);
        return { ok: true, user: cred ? cred.user : null };
      }
    } catch (err) {
      return { ok: false, error: this._formatFirebaseError(err) };
    }
  },
  async signOutCloudUser() {
    try {
      if (this._firebaseAuth) {
        await this._firebaseAuth.signOut();
      }
      this._currentUser = null;
      this._cloudSyncStatus = 'idle';
      this._setCachedCloudUser(null);
      this.updateCloudAuthHeaderBadge();
      this.renderCloudAuthModalBody();
      return true;
    } catch (_) {
      return false;
    }
  },
  initCloudAuthUI() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
    const menuPopover = document.getElementById('main-menu-popover');
    if (menuPopover && typeof menuPopover.querySelector === 'function') {
      const menuList = menuPopover.querySelector('.main-menu-list');
      if (menuList && !document.getElementById('menu-cloud-auth-btn')) {
        const authBtn = document.createElement('button');
        authBtn.type = 'button';
        authBtn.id = 'menu-cloud-auth-btn';
        authBtn.className = 'main-menu-item cloud-auth-menu-item';
        authBtn.setAttribute('onclick', 'StorageService.openCloudAuthModal()');
        menuList.insertBefore(authBtn, menuList.firstChild);
      }
    }
    this.updateCloudAuthHeaderBadge();
    if (!this._cloudPopstateBound && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      this._cloudPopstateBound = true;
      window.addEventListener('popstate', () => {
        if (this._cloudModalOpen) {
          this.closeCloudAuthModal(true);
        }
      });
    }
    if (this.isFirebaseConfigured()) {
      setTimeout(() => {
        this.ensureFirebaseInitialized();
      }, 120);
    }
  },
  updateCloudAuthHeaderBadge() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
    const user = this.getCachedCloudUser();
    const configured = this.isFirebaseConfigured();
    const authBtn = document.getElementById('menu-cloud-auth-btn');
    const menuTriggerBtn = document.getElementById('main-menu-btn');
    if (menuTriggerBtn && menuTriggerBtn.classList && typeof menuTriggerBtn.classList.toggle === 'function') {
      menuTriggerBtn.classList.toggle('has-cloud-user', Boolean(user));
    }
    if (!authBtn) return;
    if (user) {
      const statusLabel = this._cloudSyncStatus === 'syncing'
        ? '⏳ Đang đồng bộ dữ liệu...'
        : (this._cloudSyncStatus === 'error'
            ? '⚠️ Lỗi đồng bộ • Nhấn để kiểm tra'
            : '☁️ Đã đồng bộ Đám mây • Quản lý tài khoản');
      const safeName = String(user.displayName || user.email || 'Tài khoản').replace(/[<>&"']/g, '');
      authBtn.innerHTML = `
        <span class="main-menu-item-left">
          <span class="main-menu-item-icon">🟢</span>
          <span class="main-menu-item-text">
            <span class="main-menu-item-title">${safeName}</span>
            <span class="main-menu-item-sub">${statusLabel}</span>
          </span>
        </span>
      `;
    } else {
      const subText = configured
        ? 'Đăng nhập Google / Email để lưu dữ liệu đa thiết bị'
        : 'Đăng nhập & Hướng dẫn kết nối Firebase Cloud';
      authBtn.innerHTML = `
        <span class="main-menu-item-left">
          <span class="main-menu-item-icon">☁️</span>
          <span class="main-menu-item-text">
            <span class="main-menu-item-title">Tài Khoản &amp; Đồng Bộ Đám Mây</span>
            <span class="main-menu-item-sub">${subText}</span>
          </span>
        </span>
      `;
    }
  },
  _ensureCloudModalDOM() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return null;
    let modal = document.getElementById('cloud-auth-modal');
    if (modal) return modal;
    if (!document.body || typeof document.createElement !== 'function') return null;
    modal = document.createElement('div');
    modal.id = 'cloud-auth-modal';
    modal.className = 'cloud-auth-modal-backdrop';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'cloud-auth-modal-title');
    modal.style.display = 'none';
    modal.onclick = (e) => {
      if (e && e.target === modal) {
        this.closeCloudAuthModal();
      }
    };
    modal.innerHTML = `
      <div class="cloud-auth-modal-dialog" onclick="event.stopPropagation()">
        <div class="cloud-auth-modal-header">
          <div class="cloud-auth-modal-title-wrap">
            <span class="cloud-auth-modal-icon">☁️</span>
            <h3 id="cloud-auth-modal-title" class="cloud-auth-modal-title">Tài Khoản &amp; Đồng Bộ Đám Mây</h3>
          </div>
          <button type="button" class="cloud-auth-close-btn" id="cloud-auth-close-btn" onclick="StorageService.closeCloudAuthModal()" aria-label="Đóng hộp thoại" title="Đóng (Esc)">✕</button>
        </div>
        <div class="cloud-auth-tabs-bar" id="cloud-auth-tabs-bar">
          <button type="button" class="cloud-auth-tab-btn" data-tab="auth" onclick="StorageService.switchCloudModalTab('auth')">👤 Tài khoản</button>
          <button type="button" class="cloud-auth-tab-btn" data-tab="config" onclick="StorageService.switchCloudModalTab('config')">⚙️ Cấu hình Firebase</button>
          <button type="button" class="cloud-auth-tab-btn" data-tab="guide" onclick="StorageService.switchCloudModalTab('guide')">📖 Hướng dẫn (4 bước)</button>
        </div>
        <div class="cloud-auth-modal-body" id="cloud-auth-modal-body"></div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  },
  openCloudAuthModal(initialTab = null) {
    this.closeHeaderPopovers();
    const modal = this._ensureCloudModalDOM();
    if (!modal) return false;
    if (initialTab) {
      this._cloudModalTab = initialTab;
    } else if (!this.isFirebaseConfigured()) {
      this._cloudModalTab = 'guide';
    } else {
      this._cloudModalTab = 'auth';
    }
    this._cloudModalOpen = true;
    modal.style.display = 'flex';
    try {
      if (typeof window !== 'undefined' && window.history && typeof window.history.pushState === 'function') {
        window.history.pushState({ toeicCloudAuthModal: true }, '');
      }
    } catch (_) {}
    if (this.isFirebaseConfigured()) {
      this.ensureFirebaseInitialized();
    }
    this.renderCloudAuthModalBody();
    return true;
  },
  closeCloudAuthModal(fromPopState = false) {
    if (typeof document === 'undefined') return false;
    const modal = document.getElementById('cloud-auth-modal');
    if (modal && modal.style) {
      modal.style.display = 'none';
    }
    const wasOpen = this._cloudModalOpen;
    this._cloudModalOpen = false;
    if (wasOpen && !fromPopState) {
      try {
        if (typeof window !== 'undefined' && window.history && window.history.state && window.history.state.toeicCloudAuthModal) {
          window.history.back();
        }
      } catch (_) {}
    }
    return true;
  },
  switchCloudModalTab(tabName) {
    if (!['auth', 'config', 'guide'].includes(tabName)) return;
    this._cloudModalTab = tabName;
    this.renderCloudAuthModalBody();
  },
  switchAuthFormMode(mode) {
    if (!['login', 'register', 'reset'].includes(mode)) return;
    this._authFormMode = mode;
    this.renderCloudAuthModalBody();
  },
  setCloudModalFeedback(msg, isError = false) {
    if (typeof document === 'undefined') return;
    const box = document.getElementById('cloud-auth-feedback');
    if (!box) return;
    if (!msg) {
      box.style.display = 'none';
      box.textContent = '';
      return;
    }
    box.style.display = 'block';
    box.className = `cloud-auth-feedback ${isError ? 'is-error' : 'is-success'}`;
    box.textContent = msg;
  },
  renderCloudAuthModalBody() {
    if (typeof document === 'undefined') return;
    const body = document.getElementById('cloud-auth-modal-body');
    if (!body) return;
    const tabsBar = document.getElementById('cloud-auth-tabs-bar');
    if (tabsBar && typeof tabsBar.querySelectorAll === 'function') {
      tabsBar.querySelectorAll('.cloud-auth-tab-btn').forEach(btn => {
        const t = btn.getAttribute('data-tab');
        if (btn.classList) btn.classList.toggle('active', t === this._cloudModalTab);
      });
    }
    const configured = this.isFirebaseConfigured();
    const user = this.getCachedCloudUser();
    if (this._cloudModalTab === 'guide') {
      const host = (typeof window !== 'undefined' && window.location && window.location.hostname)
        ? window.location.hostname
        : 'ten-web-cua-ban.pages.dev';
      const firestoreRules = `rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /users/{userId} {\n      allow read, write: if request.auth != null && request.auth.uid == userId;\n    }\n  }\n}`;
      body.innerHTML = `
        <div class="cloud-guide-container">
          <div class="cloud-guide-banner">
            <strong>🚀 Hướng dẫn cài đặt Đăng nhập &amp; Lưu dữ liệu Đám mây (Hướng B: Firebase + Cloudflare Pages)</strong>
            <p>Chỉ mất ~3 phút để tạo kho lưu trữ miễn phí của Google (100% Free cho hàng chục nghìn người dùng) và kết nối với Cloudflare Pages.</p>
          </div>
          <div class="cloud-guide-steps">
            <div class="cloud-guide-step">
              <div class="step-badge">Bước 1</div>
              <div class="step-content">
                <h4>Tạo Firebase Project &amp; Lấy mã Web App</h4>
                <ol>
                  <li>Truy cập <a href="https://console.firebase.google.com/" target="_blank" rel="noopener">console.firebase.google.com</a> ➔ Nhấn <strong>Create a project</strong> (Đặt tên tùy ý, ví dụ: <code>toeic-master-cloud</code>).</li>
                  <li>Tại trang chủ Project, bấm biểu tượng <strong>Web (<code>&lt;/&gt;</code>)</strong> để tạo ứng dụng Web.</li>
                  <li>Copy khối mã <code>const firebaseConfig = { apiKey: "...", ... };</code> mà Firebase cung cấp.</li>
                </ol>
              </div>
            </div>
            <div class="cloud-guide-step">
              <div class="step-badge">Bước 2</div>
              <div class="step-content">
                <h4>Bật Đăng nhập Google / Email &amp; Cấp quyền tên miền Cloudflare Pages</h4>
                <ol>
                  <li>Menu trái chọn <strong>Build ➔ Authentication ➔ Get started</strong>.</li>
                  <li>Trong tab <strong>Sign-in method</strong>: Bật (Enable) <strong>Google</strong> và <strong>Email/Password</strong> ➔ Nhấn <strong>Save</strong>.</li>
                  <li>Chuyển sang tab <strong>Settings ➔ Authorized domains</strong> ➔ Nhấn <strong>Add domain</strong> và thêm tên miền Cloudflare Pages của bạn (ví dụ: <code>${host}</code>).</li>
                </ol>
              </div>
            </div>
            <div class="cloud-guide-step">
              <div class="step-badge">Bước 3</div>
              <div class="step-content">
                <h4>Tạo Cloud Firestore Database &amp; Dán Quy tắc Bảo mật (Rules)</h4>
                <ol>
                  <li>Menu trái chọn <strong>Build ➔ Firestore Database ➔ Create database</strong> (Chọn vị trí <code>asia-southeast1 (Singapore)</code> để tốc độ về Việt Nam nhanh nhất).</li>
                  <li>Vào tab <strong>Rules</strong> của Firestore, dán đoạn mã bảo mật bên dưới (chỉ cho phép chính chủ đọc/ghi dữ liệu của mình) rồi nhấn <strong>Publish</strong>:</li>
                </ol>
                <div class="cloud-code-box-wrap">
                  <pre class="cloud-code-pre" id="firestore-rules-code">${firestoreRules}</pre>
                  <button type="button" class="btn btn-secondary btn-sm cloud-copy-btn" onclick="StorageService.copyFirestoreRules()">📋 Copy Rules</button>
                </div>
              </div>
            </div>
            <div class="cloud-guide-step">
              <div class="step-badge">Bước 4</div>
              <div class="step-content">
                <h4>Dán cấu hình vào Web để hoàn tất</h4>
                <p>Cách 1 (Thử ngay trên trình duyệt): Chuyển sang tab <strong>⚙️ Cấu hình Firebase</strong> bên trên và dán đoạn <code>firebaseConfig</code> vào.</p>
                <p>Cách 2 (Cố định cho mọi người dùng trên Cloudflare Pages): Dán vào mục <code>FIREBASE_CONFIG</code> trong file <code>toeic-web/js/app-config.js</code> rồi chạy lệnh deploy (<code>/cao-deploy</code>).</p>
              </div>
            </div>
          </div>
          <div class="cloud-guide-footer">
            <button type="button" class="btn btn-primary" onclick="StorageService.switchCloudModalTab('config')">⚙️ Mở tab Dán Cấu hình Firebase ➔</button>
          </div>
        </div>
      `;
      return;
    }
    if (this._cloudModalTab === 'config') {
      const currentCfg = this.getFirebaseConfig();
      const prettyJson = currentCfg ? JSON.stringify(currentCfg, null, 2) : '';
      body.innerHTML = `
        <div class="cloud-config-container">
          <div id="cloud-auth-feedback" style="display:none;"></div>
          <p class="cloud-config-desc">
            Dán nguyên khối <code>const firebaseConfig = { ... }</code> hoặc JSON từ <strong>Firebase Console ➔ Project Settings ➔ General ➔ Your apps</strong> vào ô dưới đây:
          </p>
          <textarea id="firebase-config-input" class="cloud-config-textarea" rows="8" placeholder='const firebaseConfig = {\n  apiKey: "AIzaSy...",\n  authDomain: "your-app.firebaseapp.com",\n  projectId: "your-app",\n  storageBucket: "your-app.appspot.com",\n  messagingSenderId: "123456789",\n  appId: "1:123456789:web:abcdef"\n};'>${prettyJson}</textarea>
          <div class="cloud-config-actions">
            <button type="button" class="btn btn-primary" onclick="StorageService.handleSaveFirebaseConfigClick()">💾 Lưu &amp; Kết nối ngay</button>
            <button type="button" class="btn btn-secondary" onclick="StorageService.copyAppConfigSnippet()">📋 Copy mã cho js/app-config.js</button>
            ${currentCfg ? `<button type="button" class="btn btn-secondary" onclick="StorageService.handleClearFirebaseConfigClick()" style="color: var(--danger);">🗑️ Xóa cấu hình</button>` : ''}
          </div>
        </div>
      `;
      return;
    }
    if (!configured) {
      body.innerHTML = `
        <div class="cloud-unconfigured-card">
          <div class="unconfigured-icon">⚡</div>
          <h4>Chưa kết nối thông số Firebase Project</h4>
          <p>Để bật tính năng Đăng nhập Google / Email và đồng bộ dữ liệu trên Cloudflare Pages, bạn chỉ cần tạo 1 Project Firebase miễn phí và dán cấu hình vào đây.</p>
          <div class="unconfigured-actions">
            <button type="button" class="btn btn-primary" onclick="StorageService.switchCloudModalTab('guide')">📖 Xem Hướng dẫn 4 bước</button>
            <button type="button" class="btn btn-secondary" onclick="StorageService.switchCloudModalTab('config')">⚙️ Dán mã firebaseConfig</button>
          </div>
        </div>
      `;
      return;
    }
    if (user) {
      const histCount = this.getExamHistory().length;
      const study = this.getStudyProgress();
      const vocabCount = Object.keys(study.vocabStatus || {}).length;
      const grammarCount = Object.keys(study.grammarCompleted || {}).length;
      const rm = this.getRoadmapState();
      const streakCount = rm.streak?.count || 0;
      const syncMeta = this.getCloudSyncMeta();
      const lastSyncStr = syncMeta.lastSyncedAt
        ? new Date(syncMeta.lastSyncedAt).toLocaleString('vi-VN')
        : 'Vừa đồng bộ';
      const safeName = String(user.displayName || 'Học viên TOEIC').replace(/[<>&"']/g, '');
      const safeEmail = String(user.email || '').replace(/[<>&"']/g, '');
      const avatarInitial = (safeName[0] || 'U').toUpperCase();
      body.innerHTML = `
        <div class="cloud-profile-container">
          <div id="cloud-auth-feedback" style="display:none;"></div>
          <div class="cloud-profile-card">
            <div class="cloud-profile-avatar">
              ${user.photoURL ? `<img src="${user.photoURL}" alt="Avatar" referrerpolicy="no-referrer">` : `<span>${avatarInitial}</span>`}
            </div>
            <div class="cloud-profile-info">
              <div class="cloud-profile-name">${safeName}</div>
              <div class="cloud-profile-email">${safeEmail}</div>
              <div class="cloud-profile-sync-badge ${this._cloudSyncStatus}">
                ${this._cloudSyncStatus === 'syncing'
                  ? '⏳ Đang đồng bộ lên đám mây...'
                  : (this._cloudSyncStatus === 'error'
                      ? `⚠️ ${this._cloudSyncError || 'Lỗi đồng bộ'}`
                      : `✅ Đã đồng bộ Cloud • ${lastSyncStr}`)}
              </div>
            </div>
          </div>
          <div class="cloud-stats-grid">
            <div class="cloud-stat-box">
              <span class="cloud-stat-val">${histCount}</span>
              <span class="cloud-stat-lbl">Bài thi đã lưu</span>
            </div>
            <div class="cloud-stat-box">
              <span class="cloud-stat-val">${vocabCount}</span>
              <span class="cloud-stat-lbl">Từ vựng đã học</span>
            </div>
            <div class="cloud-stat-box">
              <span class="cloud-stat-val">${grammarCount}</span>
              <span class="cloud-stat-lbl">Chuyên đề Ngữ pháp</span>
            </div>
            <div class="cloud-stat-box">
              <span class="cloud-stat-val">🔥 ${streakCount}</span>
              <span class="cloud-stat-lbl">Chuỗi ngày học</span>
            </div>
          </div>
          <div class="cloud-profile-actions">
            <button type="button" class="btn btn-primary" onclick="StorageService.handleManualCloudSync()">🔄 Đồng bộ ngay</button>
            <button type="button" class="btn btn-secondary" onclick="StorageService.downloadBackupFile()">📤 Xuất file Backup (.json)</button>
            <button type="button" class="btn btn-secondary" onclick="StorageService.signOutCloudUser()" style="color: var(--danger);">🚪 Đăng xuất</button>
          </div>
        </div>
      `;
      return;
    }
    const mode = this._authFormMode || 'login';
    body.innerHTML = `
      <div class="cloud-login-container">
        <div id="cloud-auth-feedback" style="display:none;"></div>
        <button type="button" class="cloud-google-btn" onclick="StorageService.handleGoogleLoginClick()">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
          <span>Tiếp tục nhanh bằng tài khoản Google</span>
        </button>
        <div class="cloud-auth-divider"><span>hoặc dùng Email</span></div>
        <form class="cloud-email-form" onsubmit="event.preventDefault(); StorageService.handleEmailFormSubmit()">
          ${mode === 'register' ? `
            <div class="cloud-form-field">
              <label for="cloud-auth-name">Tên hiển thị</label>
              <input type="text" id="cloud-auth-name" placeholder="Ví dụ: Minh Hoàng" autocomplete="name">
            </div>
          ` : ''}
          <div class="cloud-form-field">
            <label for="cloud-auth-email">Địa chỉ Email</label>
            <input type="email" id="cloud-auth-email" placeholder="you@example.com" required autocomplete="email">
          </div>
          ${mode !== 'reset' ? `
            <div class="cloud-form-field">
              <label for="cloud-auth-password">Mật khẩu (tối thiểu 6 ký tự)</label>
              <input type="password" id="cloud-auth-password" placeholder="••••••••" required autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}">
            </div>
          ` : ''}
          <button type="submit" class="btn btn-primary cloud-submit-btn">
            ${mode === 'register' ? '✨ Tạo tài khoản &amp; Đồng bộ ngay' : (mode === 'reset' ? '📩 Gửi link đặt lại mật khẩu' : '🔑 Đăng nhập &amp; Đồng bộ')}
          </button>
        </form>
        <div class="cloud-auth-switch-links">
          ${mode === 'login' ? `
            <span>Chưa có tài khoản? <button type="button" class="cloud-link-btn" onclick="StorageService.switchAuthFormMode('register')">Đăng ký miễn phí</button></span>
            <button type="button" class="cloud-link-btn" onclick="StorageService.switchAuthFormMode('reset')">Quên mật khẩu?</button>
          ` : `
            <span>Đã có tài khoản? <button type="button" class="cloud-link-btn" onclick="StorageService.switchAuthFormMode('login')">Quay lại Đăng nhập</button></span>
          `}
        </div>
      </div>
    `;
  },
  async handleGoogleLoginClick() {
    this.setCloudModalFeedback('⏳ Đang mở cửa sổ đăng nhập Google...', false);
    const res = await this.signInWithGoogle();
    if (!res.ok) {
      this.setCloudModalFeedback(res.error, true);
    } else if (!res.redirecting) {
      this.setCloudModalFeedback('✅ Đăng nhập thành công! Đang đồng bộ dữ liệu...', false);
    }
  },
  async handleEmailFormSubmit() {
    const mode = this._authFormMode || 'login';
    const emailEl = document.getElementById('cloud-auth-email');
    const passEl = document.getElementById('cloud-auth-password');
    const nameEl = document.getElementById('cloud-auth-name');
    const email = emailEl ? emailEl.value : '';
    const pass = passEl ? passEl.value : '';
    const name = nameEl ? nameEl.value : '';
    this.setCloudModalFeedback('⏳ Đang xử lý xác thực...', false);
    const res = await this.submitEmailAuth(mode, email, pass, name);
    if (!res.ok) {
      this.setCloudModalFeedback(res.error, true);
    } else if (res.resetSent) {
      this.setCloudModalFeedback(res.message, false);
    } else {
      this.setCloudModalFeedback('✅ Xác thực thành công! Đang đồng bộ dữ liệu...', false);
    }
  },
  async handleManualCloudSync() {
    this.setCloudModalFeedback('⏳ Đang đồng bộ dữ liệu 2 chiều với Cloud Firestore...', false);
    const res = await this.syncWithCloud('manual');
    if (res.ok) {
      this.setCloudModalFeedback('✅ Đã đồng bộ thành công toàn bộ Lịch sử thi, Từ vựng & Lộ trình!', false);
    } else {
      this.setCloudModalFeedback(res.error || 'Đồng bộ thất bại.', true);
    }
  },
  async handleSaveFirebaseConfigClick() {
    const inputEl = document.getElementById('firebase-config-input');
    const raw = inputEl ? inputEl.value : '';
    const res = this.saveFirebaseConfig(raw);
    if (!res.ok) {
      this.setCloudModalFeedback(res.error, true);
      return;
    }
    this.updateCloudAuthHeaderBadge();
    this.setCloudModalFeedback('✅ Đã lưu cấu hình Firebase! Đang kiểm tra kết nối...', false);
    const ok = await this.ensureFirebaseInitialized();
    if (ok) {
      this._cloudModalTab = 'auth';
      this.renderCloudAuthModalBody();
      this.setCloudModalFeedback('🎉 Kết nối Firebase thành công! Bạn có thể đăng nhập ngay bây giờ.', false);
    } else {
      this.setCloudModalFeedback('⚠️ Đã lưu cấu hình nhưng không thể tải SDK Firebase. Hãy kiểm tra kết nối mạng.', true);
    }
  },
  handleClearFirebaseConfigClick() {
    this.clearFirebaseConfig();
    this.updateCloudAuthHeaderBadge();
    this.renderCloudAuthModalBody();
    this.setCloudModalFeedback('Đã xóa cấu hình Firebase lưu trên trình duyệt.', false);
  },
  copyFirestoreRules() {
    const rules = `rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /users/{userId} {\n      allow read, write: if request.auth != null && request.auth.uid == userId;\n    }\n  }\n}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(rules).catch(() => {});
    }
  },
  copyAppConfigSnippet() {
    const inputEl = document.getElementById('firebase-config-input');
    const parsed = this.parseFirebaseConfigSnippet(inputEl ? inputEl.value : '') || this.getFirebaseConfig();
    if (!parsed) {
      this.setCloudModalFeedback('Hãy dán firebaseConfig hợp lệ vào ô bên trên trước khi copy.', true);
      return;
    }
    const snippet = `  FIREBASE_CONFIG: ${JSON.stringify(parsed, null, 4).replace(/\n/g, '\n  ')},`;
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(snippet).then(() => {
        this.setCloudModalFeedback('📋 Đã copy đoạn mã chuẩn! Bạn có thể dán đè vào mục FIREBASE_CONFIG trong toeic-web/js/app-config.js.', false);
      }).catch(() => {});
    }
  },
  downloadBackupFile() {
    if (typeof document === 'undefined') return;
    try {
      const jsonStr = this.exportStudyProgressJSON();
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `toeic-master-backup-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (_) {}
  }
};
if (typeof window !== 'undefined') {
  window.StorageService = StorageService;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StorageService;
}