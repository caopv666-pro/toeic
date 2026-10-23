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
  }
};
if (typeof window !== 'undefined') {
  window.StorageService = StorageService;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StorageService;
}