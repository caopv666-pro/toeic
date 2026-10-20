// ==========================================================================
// TOEIC MASTER — storage-service.js
// Auto-Save, Session Recovery, LocalStorage Management, Exam History
// ==========================================================================

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

  _getStorage() {
    return getSafeLocalStorage();
  },

  _getSessionStorage() {
    return getSafeSessionStorage();
  },

  // ── Auto-Save Current In-Progress Exam ──
  saveActiveSession(sessionData) {
    // 1. Type Safety & Payload Validation
    if (!sessionData || typeof sessionData !== 'object' || Array.isArray(sessionData)) {
      return false;
    }

    // 2. Storage Availability Guard
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
      // 3. Quota Exceeded Recovery
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
        // Self-Healing on SyntaxError: clear corrupt data from storage
        this.clearActiveSession();
        return null;
      }

      // Payload validation: must be a plain non-array object
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        this.clearActiveSession();
        return null;
      }

      // Check TTL 24h (24 * 60 * 60 * 1000 ms)
      const TTL_24H = 24 * 60 * 60 * 1000;
      if (parsed.lastUpdated && (Date.now() - Number(parsed.lastUpdated)) > TTL_24H) {
        this.clearActiveSession();
        return null;
      }

      // Expire session if time remaining is depleted (<= 0)
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

  // ── Exam History Management ──
  saveExamResult(resultRecord) {
    // 1. Payload Validation & Type Safety
    if (!resultRecord || typeof resultRecord !== 'object' || Array.isArray(resultRecord)) {
      return null;
    }

    const storage = this._getStorage();
    if (!storage) {
      return null;
    }

    try {
      const history = this.getExamHistory();
      // Keep detailed questions slim to prevent localStorage quota exhaustion (5MB limit)
      const rawDetailed = Array.isArray(resultRecord.detailedQuestions)
        ? resultRecord.detailedQuestions.filter(q => q && typeof q === 'object')
        : [];

      const slimDetailed = rawDetailed.map(q => ({
        questionNumber: q.questionNumber,
        part: q.part,
        groupId: q.groupId,
        imageUrl: q.imageUrl || '',
        expectedRange: q.expectedRange || null,
        userChoice: q.userChoice,
        correctChoice: q.correctChoice,
        isCorrect: q.isCorrect
      }));

      // ID uniqueness prevention
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

      // Prepend new record, keep up to 30 results
      const updatedHistory = [newRecord, ...history].slice(0, 30);

      try {
        storage.setItem(this.EXAM_HISTORY_KEY, JSON.stringify(updatedHistory));
        return newRecord.id;
      } catch (e) {
        console.warn('Failed to save exam history, trimming old records:', e);

        // Tier 1 Recovery: Keep new record + up to 4 recent records
        try {
          const trimmedHistory = [newRecord, ...history.slice(0, 4)];
          storage.setItem(this.EXAM_HISTORY_KEY, JSON.stringify(trimmedHistory));
          return newRecord.id;
        } catch (tier1Err) {
          console.warn('Tier 1 recovery failed, attempting Tier 2 (stripping detailedQuestions from older records)...', tier1Err);

          // Tier 2 Recovery: Strip detailedQuestions from all older records
          try {
            const strippedHistory = [
              newRecord,
              ...history.slice(0, 4).map(rec => ({ ...rec, detailedQuestions: [] }))
            ];
            storage.setItem(this.EXAM_HISTORY_KEY, JSON.stringify(strippedHistory));
            return newRecord.id;
          } catch (tier2Err) {
            console.warn('Tier 2 recovery failed, attempting Tier 3 (saving only new record without details)...', tier2Err);

            // Tier 3 Recovery: Strip detailedQuestions from newRecord as well if critically needed
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
        // Self-Healing on SyntaxError: clear corrupt data from storage
        try { storage.removeItem(this.EXAM_HISTORY_KEY); } catch (_) {}
        return [];
      }

      // 1. Array Contract Guarantee: Must be a valid Array
      if (!Array.isArray(parsed)) {
        try { storage.removeItem(this.EXAM_HISTORY_KEY); } catch (_) {}
        return [];
      }

      // 2. Data Sanitization: Filter out null, undefined, primitive, or array items
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
      // 1. Guard against null, undefined, booleans, arrays and empty values that coerce to 0
      if (target === null || target === undefined || typeof target === 'boolean') {
        return false;
      }

      const storage = this._getStorage();
      if (!storage) return false;

      const history = this.getExamHistory();
      if (!Array.isArray(history) || history.length === 0) return false;

      let targetIndex = -1;

      // 2. Resolve target: by numeric index or by record ID string
      if (typeof target === 'number') {
        if (Number.isInteger(target) && target >= 0 && target < history.length) {
          targetIndex = target;
        }
      } else if (typeof target === 'string') {
        const trimmed = target.trim();
        if (trimmed) {
          // Check by record ID first
          const foundById = history.findIndex(rec => rec && rec.id === trimmed);
          if (foundById !== -1) {
            targetIndex = foundById;
          } else if (/^\d+$/.test(trimmed)) {
            // Non-negative integer string index
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

      // 3. Synchronize toeic_latest_result cleanup
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
          // Point toeic_latest_result to the most recent remaining record in history
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

      // 1. Guard against environments with no storage access (False Positive Success Prevention)
      if (!storage && !sessStorage) {
        console.warn('No storage access available to clear history.');
        return false;
      }

      let hasErrors = false;

      // 2. Clear exam history and latest result from localStorage (Fault Isolation)
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

      // 3. Clear latest result from sessionStorage (Fault Isolation)
      if (sessStorage) {
        try {
          sessStorage.removeItem(this.LATEST_RESULT_KEY || 'toeic_latest_result');
        } catch (e) {
          hasErrors = true;
          console.warn('Failed to remove latest result from sessionStorage:', e);
        }
      }

      // 4. Clear active in-progress exam session (Fault Isolation)
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

  // Temporary storage for result page viewing
  setCurrentResult(result) {
    // 1. Type Safety & Payload Validation (Object Contract)
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
      serialized = JSON.stringify(result);
    } catch (err) {
      console.warn('Failed to serialize result object in setCurrentResult:', err);
      return false;
    }

    const key = this.LATEST_RESULT_KEY || 'toeic_latest_result';
    let saved = false;

    const buildSlimSerialized = () => {
      try {
        const rawDetailed = Array.isArray(result.detailedQuestions)
          ? result.detailedQuestions.filter(q => q && typeof q === 'object')
          : [];
        const slimDetailed = rawDetailed.map(q => ({
          questionNumber: q.questionNumber,
          part: q.part,
          groupId: q.groupId,
          imageUrl: q.imageUrl || '',
          expectedRange: q.expectedRange || null,
          userChoice: q.userChoice,
          correctChoice: q.correctChoice,
          isCorrect: q.isCorrect
        }));
        return JSON.stringify({ ...result, detailedQuestions: slimDetailed });
      } catch (_) {
        return null;
      }
    };

    // 2. Try saving to sessionStorage first (primary for current tab session)
    if (sessStorage) {
      try {
        try { sessStorage.removeItem(key); } catch (_) {}
        sessStorage.setItem(key, serialized);
        saved = true;
      } catch (e) {
        const slimStr = buildSlimSerialized();
        if (slimStr) {
          try {
            sessStorage.setItem(key, slimStr);
            saved = true;
          } catch (_) {}
        }
        if (!saved) console.warn('sessionStorage failed in setCurrentResult:', e);
      }
    }

    // 3. Mirror or fallback to localStorage (cross-tab / refresh persistence)
    if (storage) {
      try {
        try { storage.removeItem(key); } catch (_) {}
        storage.setItem(key, serialized);
        saved = true;
      } catch (err) {
        const slimStr = buildSlimSerialized();
        if (slimStr) {
          try {
            storage.setItem(key, slimStr);
            saved = true;
          } catch (_) {}
        }
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
      // 1. Check sessionStorage first
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
              // Self-healing: remove corrupt/invalid entry from sessionStorage
              try { sessStorage.removeItem(key); } catch (_) {}
            }
          }
        } catch (_) {}
      }

      // 2. Check localStorage fallback if sessionStorage had no valid result
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
              // Self-healing: remove corrupt/invalid entry from localStorage
              try { storage.removeItem(key); } catch (_) {}
            }
          }
        } catch (_) {}
      }

      // 3. Fallback to most recent record in history if available
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

  // ── Theme Preference ──
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
      // Self-healing: invalid stored theme, cleanup storage and fallback to dark
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

    // 1. Save to storage with try-catch
    try {
      const storage = this._getStorage();
      if (storage) {
        storage.setItem(this.THEME_KEY, targetTheme);
      }
    } catch (e) {
      console.warn('Failed to save theme to storage:', e);
    }

    // 2. Apply data-theme attribute on document.documentElement
    try {
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.setAttribute('data-theme', targetTheme);
      }
    } catch (e) {
      console.warn('Failed to apply data-theme attribute to DOM:', e);
    }

    // 3. Dispatch 'toeic-theme-change' custom event
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
    const saved = this.getTheme();
    return this.setTheme(saved);
  },

  toggleTheme() {
    const current = this.getTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    return this.setTheme(next);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = StorageService;
}
