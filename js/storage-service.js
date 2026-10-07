// ==========================================================================
// TOEIC MASTER — storage-service.js
// Auto-Save, Session Recovery, LocalStorage Management, Exam History
// ==========================================================================

const StorageService = {
  ACTIVE_SESSION_KEY: 'toeic_active_exam_session',
  EXAM_HISTORY_KEY: 'toeic_exam_history',
  THEME_KEY: 'toeic_theme_preference',

  // ── Auto-Save Current In-Progress Exam ──
  saveActiveSession(sessionData) {
    try {
      localStorage.setItem(this.ACTIVE_SESSION_KEY, JSON.stringify({
        ...sessionData,
        lastUpdated: Date.now()
      }));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  },

  getActiveSession() {
    try {
      const data = localStorage.getItem(this.ACTIVE_SESSION_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },

  clearActiveSession() {
    localStorage.removeItem(this.ACTIVE_SESSION_KEY);
  },

  // ── Exam History Management ──
  saveExamResult(resultRecord) {
    try {
      const history = this.getExamHistory();
      // Keep detailed questions slim to prevent localStorage quota exhaustion (5MB limit)
      const slimDetailed = (resultRecord.detailedQuestions || []).map(q => ({
        questionNumber: q.questionNumber,
        part: q.part,
        groupId: q.groupId,
        imageUrl: q.imageUrl || '',
        expectedRange: q.expectedRange || null,
        userChoice: q.userChoice,
        correctChoice: q.correctChoice,
        isCorrect: q.isCorrect
      }));

      const slimRecord = {
        ...resultRecord,
        detailedQuestions: slimDetailed
      };

      history.unshift({
        id: 'result_' + Date.now(),
        date: new Date().toISOString(),
        ...slimRecord
      });
      // Keep last 30 results
      localStorage.setItem(this.EXAM_HISTORY_KEY, JSON.stringify(history.slice(0, 30)));
    } catch (e) {
      console.warn('Failed to save exam history, trimming old records:', e);
      try {
        const history = this.getExamHistory().slice(0, 5);
        localStorage.setItem(this.EXAM_HISTORY_KEY, JSON.stringify(history));
      } catch (err) {
        console.error('Critical quota exceeded:', err);
      }
    }
  },

  getExamHistory() {
    try {
      const data = localStorage.getItem(this.EXAM_HISTORY_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  deleteExamRecord(index) {
    try {
      const history = this.getExamHistory();
      if (index >= 0 && index < history.length) {
        history.splice(index, 1);
        localStorage.setItem(this.EXAM_HISTORY_KEY, JSON.stringify(history));
        if (history.length === 0) {
          localStorage.removeItem('toeic_latest_result');
          sessionStorage.removeItem('toeic_latest_result');
        }
        return true;
      }
      return false;
    } catch (e) {
      console.warn('Failed to delete exam record:', e);
      return false;
    }
  },

  clearAllHistory() {
    try {
      localStorage.removeItem(this.EXAM_HISTORY_KEY);
      localStorage.removeItem('toeic_latest_result');
      sessionStorage.removeItem('toeic_latest_result');
      this.clearActiveSession();
      return true;
    } catch (e) {
      console.warn('Failed to clear all history:', e);
      return false;
    }
  },

  // Temporary storage for result page viewing
  setCurrentResult(result) {
    try {
      sessionStorage.setItem('toeic_latest_result', JSON.stringify(result));
    } catch (e) {
      console.warn('sessionStorage failed, fallback to localStorage:', e);
      try {
        localStorage.setItem('toeic_latest_result', JSON.stringify(result));
      } catch (err) {
        console.error('All storage attempts failed:', err);
      }
    }
  },

  getCurrentResult() {
    try {
      const data = sessionStorage.getItem('toeic_latest_result') || localStorage.getItem('toeic_latest_result');
      if (data) return JSON.parse(data);
      const history = this.getExamHistory();
      return history && history.length > 0 ? history[0] : null;
    } catch (e) {
      return null;
    }
  },

  // ── Theme Preference ──
  getTheme() {
    return localStorage.getItem(this.THEME_KEY) || 'dark';
  },

  setTheme(theme) {
    localStorage.setItem(this.THEME_KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
  },

  initTheme() {
    const saved = this.getTheme();
    this.setTheme(saved);
  }
};
