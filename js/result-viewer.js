/* Protected by TOEIC Master DataShield v2 */
const ResultViewer = {
  resultData: null,
  currentStatusFilter: 'all', // 'all', 'correct', 'wrong', 'unanswered'
  currentPartFilter: 'all',   // 'all', 'part1', 'part2', 'part3', 'part4', 'part5', 'part6', 'part7'
  _getStorage() {
    return (typeof StorageService !== 'undefined')
      ? StorageService
      : (typeof window !== 'undefined' && window.StorageService ? window.StorageService : (typeof global !== 'undefined' ? global.StorageService : null));
  },
  _getConfig() {
    const defaultParts = {
      part1: { name: 'Part 1: Photographs', count: 6, section: 'listening' },
      part2: { name: 'Part 2: Question-Response', count: 25, section: 'listening' },
      part3: { name: 'Part 3: Conversations', count: 39, section: 'listening' },
      part4: { name: 'Part 4: Short Talks', count: 30, section: 'listening' },
      part5: { name: 'Part 5: Incomplete Sentences', count: 30, section: 'reading' },
      part6: { name: 'Part 6: Text Completion', count: 16, section: 'reading' },
      part7: { name: 'Part 7: Reading Comprehension', count: 54, section: 'reading' }
    };
    const cfg = (typeof AppConfig !== 'undefined')
      ? AppConfig
      : (typeof window !== 'undefined' && window.AppConfig ? window.AppConfig : (typeof global !== 'undefined' ? global.AppConfig : null));
    if (cfg) return cfg;
    return {
      PARTS: defaultParts,
      getDatabaseUrl: () => 'data/database_compiled.json',
      resolveAssetUrl: (p) => p || '',
      getPartByQuestionNum: (qNum) => {
        if (!qNum || qNum < 1 || qNum > 200) return null;
        if (qNum <= 6) return { key: 'part1', ...defaultParts.part1 };
        if (qNum <= 31) return { key: 'part2', ...defaultParts.part2 };
        if (qNum <= 70) return { key: 'part3', ...defaultParts.part3 };
        if (qNum <= 100) return { key: 'part4', ...defaultParts.part4 };
        if (qNum <= 130) return { key: 'part5', ...defaultParts.part5 };
        if (qNum <= 146) return { key: 'part6', ...defaultParts.part6 };
        return { key: 'part7', ...defaultParts.part7 };
      }
    };
  },
  async _fetchDatabase(url, testIdHint = null, bookHint = null) {
    if (!url) return null;
    const config = this._getConfig();
    if (testIdHint && config && typeof config.fetchTestShard === 'function') {
      try {
        const shardDb = await config.fetchTestShard(bookHint || undefined, testIdHint, 'review');
        if (shardDb && Array.isArray(shardDb.tests) && shardDb.tests.length > 0) {
          return shardDb;
        }
      } catch (_) {}
    }
    let db = null;
    if (typeof fetch === 'function') {
      try {
        const res = await fetch(url);
        if (res && res.ok) {
          db = await res.json();
          return db;
        }
      } catch (fetchErr) {
        if (typeof process !== 'undefined' && process.versions && process.versions.node) {
          try {
            const fs = require('fs');
            const path = require('path');
            const cleanPath = String(url).split('?')[0].replace(/^[/\\]+/, '');
            const fullPath = path.resolve(process.cwd(), cleanPath);
            if (fs.existsSync(fullPath)) {
              return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            }
          } catch (_) {}
        }
      }
    } else if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      try {
        const fs = require('fs');
        const path = require('path');
        const cleanPath = String(url).split('?')[0].replace(/^[/\\]+/, '');
        const fullPath = path.resolve(process.cwd(), cleanPath);
        if (fs.existsSync(fullPath)) {
          return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        }
      } catch (_) {}
    }
    return db;
  },
  _normalizeBookParam(raw) {
    if (!raw) return null;
    const config = this._getConfig();
    if (config && typeof config.normalizeBookName === 'function') {
      return config.normalizeBookName(raw);
    }
    const s = String(raw).trim().toUpperCase();
    if (s === '2026' || s === 'EST 2026' || s === 'ETS 2026') return 'EST 2026';
    if (s === '2024' || s === 'EST 2024' || s === 'ETS 2024') return 'EST 2024';
    if (s === '2023' || s === 'EST 2023' || s === 'ETS 2023') return 'EST 2023';
    if (s === '2022' || s === 'EST 2022' || s === 'ETS 2022') return 'EST 2022';
    return null;
  },
  async init(customSearch = null) {
    this.resultData = null;
    const searchStr = (typeof customSearch === 'string')
      ? customSearch
      : ((typeof window !== 'undefined' && window.location && window.location.search) ? window.location.search : '');
    const urlParams = new URLSearchParams(searchStr);
    const rawBook = urlParams.get('name') || urlParams.get('book');
    const urlBook = this._normalizeBookParam(rawBook);
    const config = this._getConfig();
    if (urlBook && config && typeof config.setSelectedBook === 'function') {
      config.setSelectedBook(urlBook);
    }
    const activeBook = urlBook || ((config && typeof config.getSelectedBook === 'function')
      ? this._normalizeBookParam(config.getSelectedBook())
      : null);
    let targetQNum = null;
    const rawQ = urlParams.get('q') || urlParams.get('question');
    if (rawQ) {
      const qMatch = String(rawQ).match(/\d+/);
      if (qMatch) {
        const parsedQ = parseInt(qMatch[0], 10);
        if (!isNaN(parsedQ) && parsedQ >= 1 && parsedQ <= 200) {
          targetQNum = parsedQ;
        }
      }
    }
    const showParam = (urlParams.get('show') || urlParams.get('section') || '').trim().toLowerCase();
    const isDirectReview = Boolean(targetQNum || showParam === 'review' || showParam === 'detail');
    if (isDirectReview && typeof document !== 'undefined' && document.documentElement && document.documentElement.classList) {
      document.documentElement.classList.add('no-animations');
    }
    let urlTestId = null;
    const rawTest = urlParams.get('test');
    if (rawTest) {
      const match = String(rawTest).match(/[+-]?\d+/);
      if (match) {
        const parsed = parseInt(match[0], 10);
        if (!isNaN(parsed)) {
          urlTestId = Math.min(10, Math.max(1, parsed));
        }
      }
    }
    const urlResultId = urlParams.get('id');
    const storage = this._getStorage();
    const matchesBook = (item) => {
      if (!item) return true;
      const targetBookToMatch = urlBook || activeBook;
      if (!targetBookToMatch) return true;
      const itemBook = this._normalizeBookParam(item.bookName || item.book);
      if (itemBook) return itemBook === targetBookToMatch;
      if (item.testTitle) {
        const titleBook = this._normalizeBookParam(item.testTitle);
        if (titleBook) return titleBook === targetBookToMatch;
      }
      return !urlBook;
    };
    if (isDirectReview && !urlResultId) {
      await this.loadReviewModeFromDB(urlTestId || 1, activeBook);
    }
    if (!this.resultData && urlResultId && storage && typeof storage.getExamHistory === 'function') {
      const history = storage.getExamHistory();
      const match = Array.isArray(history) ? history.find(h => h && h.id === urlResultId) : null;
      if (match) {
        this.resultData = match;
      }
    }
    if (!this.resultData && urlTestId && storage) {
      const current = (typeof storage.getCurrentResult === 'function') ? storage.getCurrentResult() : null;
      if (current && parseInt(current.testId, 10) === urlTestId && matchesBook(current)) {
        this.resultData = current;
      } else if (typeof storage.getExamHistory === 'function') {
        const history = storage.getExamHistory();
        const match = Array.isArray(history) ? history.find(h => h && parseInt(h.testId, 10) === urlTestId && matchesBook(h)) : null;
        if (match) {
          this.resultData = match;
        }
      }
    }
    if (!this.resultData && !urlBook && storage && typeof storage.getCurrentResult === 'function') {
      this.resultData = storage.getCurrentResult();
    }
    const needsDBLoad =
      (!isDirectReview || urlResultId) && (
        (urlTestId && (!this.resultData || parseInt(this.resultData.testId, 10) !== urlTestId)) ||
        (urlBook && (!this.resultData || !matchesBook(this.resultData))) ||
        (targetQNum && (!this.resultData || !Array.isArray(this.resultData.detailedQuestions) || !this.resultData.detailedQuestions.some(q => q && Number(q.questionNumber) === targetQNum)))
      );
    if (needsDBLoad) {
      await this.loadReviewModeFromDB(urlTestId || (this.resultData && parseInt(this.resultData.testId, 10)) || 1, activeBook);
    }
    if (!this.resultData) {
      console.warn('Không tìm thấy kết quả bài thi. Đang chuyển về trang chủ...');
      if (typeof window !== 'undefined' && window.location) {
        try { window.location.href = 'index.html'; } catch (_) {}
      }
      return false;
    }
    const urlPart = urlParams.get('part');
    if (targetQNum && config && typeof config.getPartByQuestionNum === 'function') {
      const qPartInfo = config.getPartByQuestionNum(targetQNum);
      if (qPartInfo && qPartInfo.key) {
        this.currentPartFilter = qPartInfo.key;
      }
      this.currentStatusFilter = 'all';
    } else if (urlPart && /^part[1-7]$/i.test(urlPart.trim())) {
      this.currentPartFilter = urlPart.trim().toLowerCase();
    } else if (this.resultData && this.resultData.mode === 'part' && this.resultData.partFilter) {
      this.currentPartFilter = String(this.resultData.partFilter).toLowerCase();
    } else if (this.currentPartFilter === 'all') {
      this.currentPartFilter = 'part1';
    }
    if (typeof document !== 'undefined') {
      if (isDirectReview) {
        const section = document.getElementById('detailed-review-section');
        if (section) section.style.display = 'block';
        const btn = document.getElementById('btn-show-detail');
        if (btn && typeof btn.setAttribute === 'function') {
          btn.setAttribute('aria-expanded', 'true');
        }
      }
      if (typeof document.querySelectorAll === 'function') {
        document.querySelectorAll('#part-filter-group .filter-pill-btn').forEach(btn => {
          const btnPart = btn.dataset ? btn.dataset.part : (btn.getAttribute && btn.getAttribute('data-part'));
          const isActive = (btnPart === this.currentPartFilter);
          if (btn.classList && typeof btn.classList.toggle === 'function') {
            btn.classList.toggle('active', isActive);
          }
          if (typeof btn.setAttribute === 'function') {
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          }
        });
      }
    }
    if (typeof this.renderSummary === 'function') this.renderSummary();
    if (typeof this.updateFilterCounts === 'function') this.updateFilterCounts();
    if (typeof this.rehydrateExplanationsFromDB === 'function') await this.rehydrateExplanationsFromDB();
    if (typeof this.renderDetailedReview === 'function') this.renderDetailedReview();
    if (targetQNum && typeof this.scrollToQuestionInReview === 'function') {
      this.scrollToQuestionInReview(targetQNum, true);
    } else if (isDirectReview && typeof this.showDetailedReviewSection === 'function') {
      this.showDetailedReviewSection();
    }
    this.bindGlobalClickOutside();
    return true;
  },
  async loadReviewModeFromDB(testId, bookOverride = null) {
    try {
      const clampedId = (Number.isFinite(testId) && testId >= 1 && testId <= 10) ? Math.floor(testId) : 1;
      const config = this._getConfig();
      const storage = this._getStorage();
      const normalizedBook = this._normalizeBookParam(bookOverride);
      if (normalizedBook && config && typeof config.setSelectedBook === 'function') {
        config.setSelectedBook(normalizedBook);
      }
      const url = (config && typeof config.getDatabaseUrl === 'function')
        ? config.getDatabaseUrl(normalizedBook || undefined)
        : 'data/database_compiled.json';
      const db = await this._fetchDatabase(url, clampedId, normalizedBook);
      if (!db) {
        console.warn(`Fetch database returned empty or failed for ${url}`);
        return false;
      }
      const tests = db.tests || (Array.isArray(db) ? db : [db]);
      const currentTest = tests.find(t => {
        const tid = Number(t.testId !== undefined ? t.testId : t.id);
        return tid === clampedId;
      }) || tests[0];
      if (!currentTest) return false;
      const detailedQuestions = [];
      const partStats = {};
      const partsConfig = (config && config.PARTS) ? config.PARTS : {};
      Object.keys(partsConfig).forEach(k => {
        partStats[k] = { total: partsConfig[k]?.count || 0, correct: partsConfig[k]?.count || 0, answered: partsConfig[k]?.count || 0 };
      });
      const lc = currentTest.listening || {};
      const rc = currentTest.reading || {};
      const getPartQuestions = (p) => Array.isArray(p) ? p : (Array.isArray(p?.questions) ? p.questions : []);
      const getPartGroups = (p) => Array.isArray(p) ? p : (Array.isArray(p?.groups) ? p.groups : []);
      const buildSentencesTrans = (sentences) => Array.isArray(sentences)
        ? sentences.filter(s => s && s.translation).map(s => (s.speaker ? `[${s.speaker}] ${s.translation}` : s.translation)).join('\n')
        : '';
      const buildPassagesTrans = (passages) => Array.isArray(passages)
        ? passages.flatMap(p => Array.isArray(p?.sentences) ? p.sentences.map(s => s?.translation).filter(Boolean) : []).join('\n')
        : '';
      getPartQuestions(lc.part1).forEach(q => {
        detailedQuestions.push({
          questionNumber: q.questionNumber,
          part: 'part1',
          groupId: 'p1_q' + q.questionNumber,
          expectedRange: [q.questionNumber, q.questionNumber],
          userChoice: q.correctAnswer || 'A',
          correctChoice: q.correctAnswer || 'A',
          isCorrect: true,
          questionText: q.questionText || '',
          imageUrl: q.imageUrl || '',
          audioUrl: q.audioUrl || '',
          options: q.options || {},
          explanation: q.explanation || '',
          translation: q.questionTranslation || q.translation || '',
          optionsTranslation: q.optionsTranslation || {},
          analysis: q.analysis || '',
          tips: q.tips || '',
          groupTranscript: '',
          groupTranslation: '',
          groupSentences: [],
          groupPassages: [],
          isFirstInGroup: true
        });
      });
      getPartQuestions(lc.part2).forEach(q => {
        detailedQuestions.push({
          questionNumber: q.questionNumber,
          part: 'part2',
          groupId: 'p2_q' + q.questionNumber,
          expectedRange: [q.questionNumber, q.questionNumber],
          userChoice: q.correctAnswer || 'A',
          correctChoice: q.correctAnswer || 'A',
          isCorrect: true,
          questionText: q.questionText || '',
          imageUrl: '',
          audioUrl: q.audioUrl || '',
          options: q.options || {},
          explanation: q.explanation || '',
          translation: q.questionTranslation || q.translation || '',
          optionsTranslation: q.optionsTranslation || {},
          analysis: q.analysis || '',
          tips: q.tips || '',
          groupTranscript: '',
          groupTranslation: '',
          groupSentences: [],
          groupPassages: [],
          isFirstInGroup: true
        });
      });
      getPartGroups(lc.part3).forEach((g, gIdx) => {
        const gid = g.groupId || `p3_g${gIdx + 1}`;
        const range = g.expectedRange || [g.questions?.[0]?.questionNumber, g.questions?.[g.questions.length - 1]?.questionNumber];
        const synthTrans = g.passageTranslation || g.translation || buildSentencesTrans(g.sentences);
        (g.questions || []).forEach((q, idx) => {
          detailedQuestions.push({
            questionNumber: q.questionNumber,
            part: 'part3',
            groupId: gid,
            expectedRange: range,
            userChoice: q.correctAnswer || 'A',
            correctChoice: q.correctAnswer || 'A',
            isCorrect: true,
            questionText: q.questionText || '',
            imageUrl: g.imageUrl || g.graphicUrl || (g.passages && g.passages[0] && g.passages[0].imageUrl) || '',
            audioUrl: g.audioUrl || q.audioUrl || '',
            options: q.options || {},
            explanation: q.explanation || '',
            translation: q.questionTranslation || q.translation || '',
            optionsTranslation: q.optionsTranslation || {},
            analysis: q.analysis || '',
            tips: q.tips || '',
            groupTranscript: g.transcript || '',
            groupTranslation: synthTrans,
            groupSentences: g.sentences ? JSON.parse(JSON.stringify(g.sentences)) : [],
            groupPassages: g.passages ? JSON.parse(JSON.stringify(g.passages, (k, v) => k === '_parentGroup' ? undefined : v)) : [],
            isFirstInGroup: idx === 0
          });
        });
      });
      getPartGroups(lc.part4).forEach((g, gIdx) => {
        const gid = g.groupId || `p4_g${gIdx + 1}`;
        const range = g.expectedRange || [g.questions?.[0]?.questionNumber, g.questions?.[g.questions.length - 1]?.questionNumber];
        const synthTrans = g.passageTranslation || g.translation || buildSentencesTrans(g.sentences);
        (g.questions || []).forEach((q, idx) => {
          detailedQuestions.push({
            questionNumber: q.questionNumber,
            part: 'part4',
            groupId: gid,
            expectedRange: range,
            userChoice: q.correctAnswer || 'A',
            correctChoice: q.correctAnswer || 'A',
            isCorrect: true,
            questionText: q.questionText || '',
            imageUrl: g.imageUrl || g.graphicUrl || (g.passages && g.passages[0] && g.passages[0].imageUrl) || '',
            audioUrl: g.audioUrl || q.audioUrl || '',
            options: q.options || {},
            explanation: q.explanation || '',
            translation: q.questionTranslation || q.translation || '',
            optionsTranslation: q.optionsTranslation || {},
            analysis: q.analysis || '',
            tips: q.tips || '',
            groupTranscript: g.transcript || '',
            groupTranslation: synthTrans,
            groupSentences: g.sentences ? JSON.parse(JSON.stringify(g.sentences)) : [],
            groupPassages: g.passages ? JSON.parse(JSON.stringify(g.passages, (k, v) => k === '_parentGroup' ? undefined : v)) : [],
            isFirstInGroup: idx === 0
          });
        });
      });
      getPartQuestions(rc.part5).forEach(q => {
        detailedQuestions.push({
          questionNumber: q.questionNumber,
          part: 'part5',
          groupId: 'p5_q' + q.questionNumber,
          expectedRange: [q.questionNumber, q.questionNumber],
          userChoice: q.correctAnswer || 'A',
          correctChoice: q.correctAnswer || 'A',
          isCorrect: true,
          questionText: q.questionText || '',
          imageUrl: '',
          audioUrl: '',
          options: q.options || {},
          explanation: q.explanation || '',
          translation: q.questionTranslation || q.translation || '',
          optionsTranslation: q.optionsTranslation || {},
          analysis: q.analysis || '',
          tips: q.tips || '',
          groupTranscript: '',
          groupTranslation: '',
          groupSentences: [],
          groupPassages: [],
          isFirstInGroup: true
        });
      });
      getPartGroups(rc.part6).forEach((g, gIdx) => {
        const gid = g.groupId || `p6_g${gIdx + 1}`;
        const range = g.expectedRange || [g.questions?.[0]?.questionNumber, g.questions?.[g.questions.length - 1]?.questionNumber];
        const synthTrans = g.passageTranslation || g.translation || buildSentencesTrans(g.sentences) || buildPassagesTrans(g.passages);
        (g.questions || []).forEach((q, idx) => {
          detailedQuestions.push({
            questionNumber: q.questionNumber,
            part: 'part6',
            groupId: gid,
            expectedRange: range,
            userChoice: q.correctAnswer || 'A',
            correctChoice: q.correctAnswer || 'A',
            isCorrect: true,
            questionText: q.questionText || '',
            imageUrl: '',
            audioUrl: '',
            options: q.options || {},
            explanation: q.explanation || '',
            translation: q.questionTranslation || q.translation || '',
            optionsTranslation: q.optionsTranslation || {},
            analysis: q.analysis || '',
            tips: q.tips || '',
            groupTranscript: '',
            groupTranslation: synthTrans,
            groupSentences: g.sentences ? JSON.parse(JSON.stringify(g.sentences)) : [],
            groupPassages: g.passages ? JSON.parse(JSON.stringify(g.passages, (k, v) => k === '_parentGroup' ? undefined : v)) : [],
            isFirstInGroup: idx === 0
          });
        });
      });
      getPartGroups(rc.part7).forEach((g, gIdx) => {
        const gid = g.groupId || `p7_g${gIdx + 1}`;
        const range = g.expectedRange || [g.questions?.[0]?.questionNumber, g.questions?.[g.questions.length - 1]?.questionNumber];
        const synthTrans = g.passageTranslation || g.translation || buildSentencesTrans(g.sentences) || buildPassagesTrans(g.passages);
        (g.questions || []).forEach((q, idx) => {
          detailedQuestions.push({
            questionNumber: q.questionNumber,
            part: 'part7',
            groupId: gid,
            expectedRange: range,
            userChoice: q.correctAnswer || 'A',
            correctChoice: q.correctAnswer || 'A',
            isCorrect: true,
            questionText: q.questionText || '',
            imageUrl: '',
            audioUrl: '',
            options: q.options || {},
            explanation: q.explanation || '',
            translation: q.questionTranslation || q.translation || '',
            optionsTranslation: q.optionsTranslation || {},
            analysis: q.analysis || '',
            tips: q.tips || '',
            groupTranscript: '',
            groupTranslation: synthTrans,
            groupSentences: g.sentences ? JSON.parse(JSON.stringify(g.sentences)) : [],
            groupPassages: g.passages ? JSON.parse(JSON.stringify(g.passages, (k, v) => k === '_parentGroup' ? undefined : v)) : [],
            isFirstInGroup: idx === 0
          });
        });
      });
      const currentBook = normalizedBook || ((config && typeof config.getSelectedBook === 'function')
        ? config.getSelectedBook()
        : 'EST 2022');
      this.resultData = {
        id: 'review_test_' + clampedId,
        date: new Date().toISOString(),
        bookName: currentBook,
        testId: clampedId,
        testTitle: `${currentBook} — Test ${clampedId < 10 ? '0' : ''}${clampedId}`,
        mode: 'review',
        partFilter: null,
        totalCorrect: 200,
        totalQuestions: 200,
        correctCountLC: 100,
        correctCountRC: 100,
        scaledLC: 495,
        scaledRC: 495,
        totalScore: 990,
        partStats,
        detailedQuestions,
        timeSpentSeconds: 0
      };
      if (storage && typeof storage.setCurrentResult === 'function') {
        try { storage.setCurrentResult(this.resultData); } catch (_) {}
      }
      return true;
    } catch (e) {
      console.warn('loadReviewModeFromDB failed:', e);
      return false;
    }
  },
  formatTime(totalSeconds) {
    if (!totalSeconds || totalSeconds < 0) return '0 phút';
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m} phút ${s > 0 ? s + 's' : ''}`;
  },
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
  renderSummary() {
    if (!this.resultData || typeof this.resultData !== 'object' || Array.isArray(this.resultData)) {
      return false;
    }
    if (typeof document === 'undefined') return false;
    const r = this.resultData;
    const isPartMode = r.mode === 'part';
    const config = this._getConfig();
    const partsConfig = (config && config.PARTS) ? config.PARTS : {};
    const titleEl = document.getElementById('result-test-title');
    if (titleEl && r.testTitle) {
      const cleanTitle = r.testTitle.replace(/\s*\([Cc]hế độ xem[^)]*\)/g, '').trim();
      titleEl.textContent = cleanTitle;
    }
    const timeSpent = Number.isFinite(r.timeSpentSeconds) ? Math.max(0, Math.floor(r.timeSpentSeconds)) : 0;
    const timeEl = document.getElementById('result-time-spent');
    if (timeEl) timeEl.textContent = `⏱️ Thời gian làm bài: ${this.formatTime(timeSpent)}`;
    const totalScoreEl = document.getElementById('result-total-score');
    const scoreMaxEl = document.querySelector('.score-max');
    const lcScoreEl = document.getElementById('result-lc-score');
    const rcScoreEl = document.getElementById('result-rc-score');
    const totalCorrectEl = document.getElementById('result-total-correct');
    const totalQ = Number.isFinite(r.totalQuestions) && r.totalQuestions > 0 ? r.totalQuestions : 1;
    const totalCorr = Number.isFinite(r.totalCorrect) && r.totalCorrect >= 0 ? r.totalCorrect : 0;
    const rawAcc = Number.isFinite(r.accuracyRate) ? r.accuracyRate : Math.round((totalCorr / totalQ) * 100);
    const accuracy = Math.max(0, Math.min(100, Math.floor(rawAcc) || 0));
    if (isPartMode) {
      if (totalScoreEl) totalScoreEl.textContent = `${accuracy}%`;
      if (scoreMaxEl) scoreMaxEl.textContent = `ĐỘ CHÍNH XÁC (${totalCorr}/${totalQ})`;
      const lcCard = (lcScoreEl && typeof lcScoreEl.closest === 'function') ? lcScoreEl.closest('.score-summary-card') : null;
      const rcCard = (rcScoreEl && typeof rcScoreEl.closest === 'function') ? rcScoreEl.closest('.score-summary-card') : null;
      const totalCard = (totalCorrectEl && typeof totalCorrectEl.closest === 'function') ? totalCorrectEl.closest('.score-summary-card') : null;
      if (lcCard) {
        const title = lcCard.querySelector('.score-summary-title');
        if (title) title.textContent = '🎯 Số câu đúng';
        lcScoreEl.textContent = `${totalCorr} / ${totalQ}`;
      }
      if (rcCard) {
        const title = rcCard.querySelector('.score-summary-title');
        if (title) title.textContent = '📊 Tỷ lệ chính xác';
        rcScoreEl.textContent = `${accuracy}%`;
        rcScoreEl.style.color = accuracy >= 80 ? 'var(--success)' : (accuracy >= 50 ? 'var(--warning)' : 'var(--danger)');
      }
      if (totalCard) {
        const title = totalCard.querySelector('.score-summary-title');
        if (title) title.textContent = '⏱️ Tốc độ trung bình';
        const avgSec = Math.round(timeSpent / totalQ);
        totalCorrectEl.textContent = `${avgSec}s / câu`;
      }
    } else {
      if (totalScoreEl) totalScoreEl.textContent = Number.isFinite(r.totalScore) ? r.totalScore : 0;
      if (scoreMaxEl) scoreMaxEl.textContent = '/ 990 ĐIỂM';
      if (lcScoreEl) lcScoreEl.textContent = `${Number.isFinite(r.scaledLC) ? r.scaledLC : 0} / 495`;
      if (rcScoreEl) rcScoreEl.textContent = `${Number.isFinite(r.scaledRC) ? r.scaledRC : 0} / 495`;
      if (totalCorrectEl) totalCorrectEl.textContent = `${totalCorr} / ${totalQ}`;
    }
    const partGrid = document.getElementById('result-part-breakdown');
    if (partGrid) {
      if (partGrid.classList) partGrid.classList.add('has-donuts');
      let partHtml = '';
      if (isPartMode && r.partFilter) {
        const pKey = r.partFilter;
        const partInfo = partsConfig[pKey];
        const partName = this.escapeHtml(partInfo?.name || pKey.toUpperCase());
        let badge = '🏆 Xuất sắc';
        let advice = 'Bạn đã nắm rất vững kiến thức và kỹ năng của phần thi này!';
        let color = 'var(--success)';
        if (accuracy < 50) {
          badge = '⚠️ Cần cố gắng';
          advice = 'Hãy xem kỹ lời giải chi tiết, từ vựng và cấu trúc ngữ pháp từng câu bên dưới.';
          color = 'var(--danger)';
        } else if (accuracy < 75) {
          badge = '🥈 Khá tốt';
          advice = 'Nắm vững kiến thức cơ bản. Hãy kiểm tra các câu làm sai để tránh bẫy ETS.';
          color = 'var(--warning)';
        }
        partHtml = `
          <div class="part-stat-card part-single-summary-card">
            <div class="part-single-summary-chart">
              <div class="part-donut-chart-wrap" role="progressbar" aria-valuenow="${accuracy}" aria-valuemin="0" aria-valuemax="100" aria-label="Tỷ lệ chính xác ${accuracy}%">
                <svg class="part-donut-chart" viewBox="0 0 36 36" role="img" aria-hidden="true">
                  <path class="part-donut-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path class="part-donut-fill" stroke-dasharray="${accuracy}, 100" stroke="${color}" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <text x="18" y="18" dy=".3em" text-anchor="middle" class="part-donut-pct" fill="${color}">${accuracy}%</text>
                </svg>
              </div>
            </div>
            <div class="part-single-summary-info">
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px;">
                <span style="font-weight: 800; font-size: 1.15rem; color: var(--text-primary);">${partName}</span>
                <span class="badge" style="background: rgba(99, 102, 241, 0.15); color: var(--accent-secondary); font-size: 0.8rem; padding: 3px 10px; border-radius: 6px;">${this.escapeHtml(badge)}</span>
                <span style="font-weight: 800; font-size: 1.05rem; color: ${color};">(${totalCorr}/${totalQ} câu)</span>
              </div>
              <p style="color: var(--text-secondary); font-size: 0.92rem; margin: 0;">💡 <strong>Đánh giá năng lực:</strong> ${this.escapeHtml(advice)}</p>
            </div>
          </div>
        `;
      } else if (r.partStats && typeof r.partStats === 'object') {
        for (const [key, stat] of Object.entries(r.partStats)) {
          if (!stat || typeof stat !== 'object') continue;
          const partInfo = partsConfig[key];
          const rawName = partInfo?.name || key;
          const partNum = key.replace(/^part(\d+)$/i, 'Part $1');
          const partSub = rawName.includes(':') ? rawName.split(':')[1].trim() : '';
          const partName = this.escapeHtml(rawName);
          const statTotal = Number.isFinite(stat.total) && stat.total > 0 ? stat.total : 0;
          const statCorrect = Number.isFinite(stat.correct) && stat.correct >= 0 ? stat.correct : 0;
          const pct = statTotal > 0 ? Math.max(0, Math.min(100, Math.round((statCorrect / statTotal) * 100))) : 0;
          const color = pct >= 70 ? 'var(--success)' : (pct >= 50 ? 'var(--warning)' : 'var(--danger)');
          partHtml += `
            <div class="part-stat-card part-donut-card"
                 role="button"
                 tabindex="0"
                 onclick="ResultViewer.setPartFilter('${key}'); document.getElementById('detailed-review-section')?.scrollIntoView({behavior: 'smooth', block: 'start'});"
                 onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault(); ResultViewer.setPartFilter('${key}'); document.getElementById('detailed-review-section')?.scrollIntoView({behavior: 'smooth', block: 'start'});}"
                 title="${partName}: ${pct}% (${statCorrect}/${statTotal} câu) - Nhấn để xem chi tiết"
                 aria-label="${partName}: ${pct}%, ${statCorrect} trên ${statTotal} câu đúng. Nhấn để lọc phần này.">
              <div class="part-donut-chart-wrap" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Tỷ lệ chính xác ${partName}: ${pct}%">
                <svg class="part-donut-chart" viewBox="0 0 36 36" role="img" aria-hidden="true">
                  <path class="part-donut-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path class="part-donut-fill" stroke-dasharray="${pct}, 100" stroke="${color}" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <text x="18" y="18" dy=".3em" text-anchor="middle" class="part-donut-pct" fill="${color}">${pct}%</text>
                </svg>
              </div>
              <div class="part-donut-info">
                <span class="part-donut-name">${partNum}</span>
                ${partSub ? `<span class="part-donut-sub" title="${this.escapeHtml(partSub)}">${this.escapeHtml(partSub)}</span>` : ''}
                <span class="part-donut-score" style="color: ${color};">${statCorrect}/${statTotal}</span>
              </div>
            </div>
          `;
        }
      }
      partGrid.innerHTML = partHtml;
    }
    const partGroup = document.getElementById('part-filter-group');
    if (partGroup && isPartMode && r.partFilter) {
      const pInfo = partsConfig[r.partFilter];
      const pLabel = this.escapeHtml(pInfo?.name ? pInfo.name.split(':')[0] : String(r.partFilter).toUpperCase());
      partGroup.innerHTML = `
        <button class="filter-pill-btn active" data-part="${this.escapeHtml(r.partFilter)}" style="pointer-events: none;">
          ${pLabel} (${totalQ} câu)
        </button>
      `;
    }
    return true;
  },
  showDetailedReviewSection(instant = false) {
    if (typeof document === 'undefined') return false;
    const section = document.getElementById('detailed-review-section');
    if (section) {
      section.style.display = 'block';
      const btn = document.getElementById('btn-show-detail');
      if (btn && typeof btn.setAttribute === 'function') {
        btn.setAttribute('aria-expanded', 'true');
      }
      const scrollY = (typeof window !== 'undefined' && window.scrollY !== undefined)
        ? window.scrollY
        : ((typeof window !== 'undefined' && window.pageYOffset) || 0);
      const offsetTop = Math.max(0, section.getBoundingClientRect().top + scrollY - 80);
      if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
        const noAnim = Boolean(instant || (document.documentElement && document.documentElement.classList && document.documentElement.classList.contains('no-animations')));
        const prefersReduced = noAnim || (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        window.scrollTo({ top: offsetTop, behavior: prefersReduced ? 'auto' : 'smooth' });
      }
      return true;
    }
    return false;
  },
  scrollToQuestionInReview(qNum, instant = true) {
    const parsedQ = parseInt(qNum, 10);
    if (isNaN(parsedQ) || parsedQ < 1 || parsedQ > 200) return false;
    if (typeof document === 'undefined') return false;
    const section = document.getElementById('detailed-review-section');
    if (section) {
      section.style.display = 'block';
    }
    const btn = document.getElementById('btn-show-detail');
    if (btn && typeof btn.setAttribute === 'function') {
      btn.setAttribute('aria-expanded', 'true');
    }
    let qEl = document.getElementById(`review_q_${parsedQ}`);
    if (!qEl) {
      const config = this._getConfig();
      const pInfo = (config && typeof config.getPartByQuestionNum === 'function')
        ? config.getPartByQuestionNum(parsedQ)
        : null;
      if (pInfo && pInfo.key) {
        this.currentStatusFilter = 'all';
        this.setPartFilter(pInfo.key);
        qEl = document.getElementById(`review_q_${parsedQ}`);
      }
    }
    if (!qEl) return false;
    if (typeof document.querySelectorAll === 'function') {
      document.querySelectorAll('.audit-target-highlight').forEach(el => {
        if (el.classList) el.classList.remove('audit-target-highlight');
      });
    }
    if (qEl.classList) {
      qEl.classList.add('audit-target-highlight');
    }
    if (typeof qEl.closest === 'function') {
      const groupBox = qEl.closest('.reading-group-stage');
      if (groupBox) {
        const pKey = groupBox.getAttribute('data-part');
        const gIdx = parseInt(groupBox.getAttribute('data-group-index'), 10);
        if (!isNaN(gIdx) && pKey) {
          this.activateReadingGroup(pKey, gIdx, false);
        }
        const gId = groupBox.getAttribute('data-group-id');
        if (gId && typeof this.scrollToSubQuestion === 'function') {
          this.scrollToSubQuestion(gId, parsedQ);
        }
      }
    }
    let scrollTargetEl = qEl;
    if (typeof qEl.closest === 'function') {
      const groupCard = qEl.closest('.group-review-card');
      if (groupCard && typeof groupCard.querySelector === 'function') {
        const firstQInGroup = groupCard.querySelector('.review-q-card');
        if (firstQInGroup === qEl) {
          scrollTargetEl = groupCard;
        }
      }
    }
    const performScroll = () => {
      if (typeof window === 'undefined' || typeof window.scrollTo !== 'function') return;
      if (!scrollTargetEl || typeof scrollTargetEl.getBoundingClientRect !== 'function') return;
      const navbar = document.querySelector('.navbar');
      const filterBar = document.querySelector('.filter-tabs-bar');
      let stickyOffset = 12;
      if (navbar && typeof navbar.getBoundingClientRect === 'function') {
        stickyOffset += navbar.getBoundingClientRect().height || 0;
      }
      if (filterBar && typeof filterBar.getBoundingClientRect === 'function') {
        stickyOffset += filterBar.getBoundingClientRect().height || 0;
      }
      const currentScrollY = (window.scrollY !== undefined) ? window.scrollY : (window.pageYOffset || 0);
      const targetY = Math.max(0, Math.round(scrollTargetEl.getBoundingClientRect().top + currentScrollY - stickyOffset));
      if (instant) {
        window.scrollTo({ top: targetY, behavior: 'auto' });
      } else {
        window.scrollTo({ top: targetY, behavior: 'smooth' });
      }
    };
    performScroll();
    if (typeof window !== 'undefined') {
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => performScroll());
      }
      setTimeout(() => performScroll(), 60);
      setTimeout(() => performScroll(), 200);
      const container = document.getElementById('review-questions-container');
      if (container && typeof container.querySelectorAll === 'function') {
        const startTs = Date.now();
        container.querySelectorAll('img').forEach(img => {
          if (img && !img.complete && typeof img.addEventListener === 'function') {
            const onImgLoad = () => {
              if (Date.now() - startTs < 1500) {
                performScroll();
              }
            };
            img.addEventListener('load', onImgLoad, { once: true });
          }
        });
      }
    }
    return true;
  },
  updateFilterCounts() {
    if (!this.resultData || !this.resultData.detailedQuestions || !Array.isArray(this.resultData.detailedQuestions)) return false;
    const questions = this.resultData.detailedQuestions.filter(Boolean);
    const total = questions.length;
    let correct = 0;
    let wrong = 0;
    let unanswered = 0;
    questions.forEach(q => {
      const hasChoice = Boolean(q && q.userChoice && String(q.userChoice).trim());
      if (q.isCorrect) {
        correct++;
      } else if (hasChoice) {
        wrong++;
      } else {
        unanswered++;
      }
    });
    if (typeof document !== 'undefined') {
      const cAll = document.getElementById('count-all');
      if (cAll) cAll.textContent = `(${total})`;
      const cCorrect = document.getElementById('count-correct');
      if (cCorrect) cCorrect.textContent = `(${correct})`;
      const cWrong = document.getElementById('count-wrong');
      if (cWrong) cWrong.textContent = `(${wrong})`;
      const cUnanswered = document.getElementById('count-unanswered');
      if (cUnanswered) cUnanswered.textContent = `(${unanswered})`;
    }
    return { total, correct, wrong, unanswered };
  },
  setStatusFilter(status) {
    const raw = (typeof status === 'string') ? status.trim().toLowerCase() : '';
    const valid = ['all', 'correct', 'wrong', 'unanswered'];
    const targetStatus = valid.includes(raw) ? raw : 'all';
    this.currentStatusFilter = targetStatus;
    if (typeof document !== 'undefined') {
      const section = document.getElementById('detailed-review-section');
      if (section && (section.style.display === 'none' || !section.style.display)) {
        section.style.display = 'block';
      }
      if (typeof document.querySelectorAll === 'function') {
        document.querySelectorAll('#status-filter-group .filter-tab-btn').forEach(btn => {
          const isActive = btn.dataset ? (btn.dataset.status === targetStatus) : (btn.getAttribute && btn.getAttribute('data-status') === targetStatus);
          if (btn.classList && typeof btn.classList.toggle === 'function') {
            btn.classList.toggle('active', isActive);
          }
          if (typeof btn.setAttribute === 'function') {
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          }
        });
      }
    }
    if (typeof this.renderDetailedReview === 'function') {
      this.renderDetailedReview();
    }
    return targetStatus;
  },
  setPartFilter(part) {
    let raw = '';
    if (typeof part === 'number' && Number.isInteger(part) && part >= 1 && part <= 7) {
      raw = 'part' + part;
    } else if (typeof part === 'string') {
      const trimmed = part.trim().toLowerCase();
      if (/^[1-7]$/.test(trimmed)) {
        raw = 'part' + trimmed;
      } else {
        raw = trimmed;
      }
    }
    const valid = ['all', 'part1', 'part2', 'part3', 'part4', 'part5', 'part6', 'part7'];
    let targetPart = valid.includes(raw) ? raw : 'all';
    if (this.resultData && this.resultData.mode === 'part' && this.resultData.partFilter) {
      const allowedPart = String(this.resultData.partFilter).toLowerCase();
      if (targetPart !== allowedPart && targetPart !== 'all') {
        targetPart = allowedPart;
      }
    }
    this.currentPartFilter = targetPart;
    if (typeof AudioController !== 'undefined' && typeof AudioController.stopCurrent === 'function') {
      try { AudioController.stopCurrent(); } catch (_) {}
    }
    if (typeof document !== 'undefined') {
      const section = document.getElementById('detailed-review-section');
      if (section && (section.style.display === 'none' || !section.style.display)) {
        section.style.display = 'block';
      }
      if (typeof document.querySelectorAll === 'function') {
        document.querySelectorAll('#part-filter-group .filter-pill-btn').forEach(btn => {
          const isActive = btn.dataset ? (btn.dataset.part === targetPart) : (btn.getAttribute && btn.getAttribute('data-part') === targetPart);
          if (btn.classList && typeof btn.classList.toggle === 'function') {
            btn.classList.toggle('active', isActive);
          }
          if (typeof btn.setAttribute === 'function') {
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          }
        });
      }
    }
    if (typeof this.renderDetailedReview === 'function') {
      this.renderDetailedReview();
    }
    if ((targetPart === 'part6' || targetPart === 'part7') && typeof window !== 'undefined' && window.innerWidth <= 768 && typeof document !== 'undefined' && typeof document.querySelector === 'function') {
      const activeCard = document.querySelector(`.reading-group-stage.mobile-active-group[data-part="${targetPart}"]`);
      if (activeCard && typeof activeCard.getBoundingClientRect === 'function' && typeof window.scrollTo === 'function') {
        const cardTop = activeCard.getBoundingClientRect().top + (window.pageYOffset || (document.documentElement ? document.documentElement.scrollTop : 0) || 0);
        window.scrollTo({ top: Math.max(0, cardTop - 76), behavior: 'smooth' });
      }
    }
    return targetPart;
  },
  setFilter(filterType) {
    return this.setStatusFilter(filterType);
  },
  navReadingGroup(partKey, delta) {
    if (typeof document === 'undefined') return;
    const stageCards = Array.from(document.querySelectorAll(`.reading-group-stage[data-part="${partKey}"]`));
    if (stageCards.length === 0) return;
    let currentIdx = stageCards.findIndex(c => c.classList.contains('mobile-active-group'));
    if (currentIdx === -1) {
      const navBar = document.getElementById(`reading-nav-${partKey}`);
      currentIdx = navBar ? parseInt(navBar.getAttribute('data-active-idx') || '0', 10) : 0;
    }
    const newIdx = currentIdx + delta;
    if (newIdx >= 0 && newIdx < stageCards.length) {
      this.activateReadingGroup(partKey, newIdx, true);
    }
  },
  activateReadingGroup(partKey, targetIdx, scroll = false) {
    if (typeof document === 'undefined') return;
    const stageCards = Array.from(document.querySelectorAll(`.reading-group-stage[data-part="${partKey}"]`));
    if (stageCards.length === 0) return;
    const safeIdx = Math.max(0, Math.min(stageCards.length - 1, targetIdx));
    stageCards.forEach((card, idx) => {
      if (idx === safeIdx) {
        card.classList.add('mobile-active-group');
      } else {
        card.classList.remove('mobile-active-group');
      }
    });
    const activeCard = stageCards[safeIdx];
    const rangeAttr = activeCard ? activeCard.getAttribute('data-range') : '';
    const rangeParts = rangeAttr ? rangeAttr.split('-') : [];
    const navBar = document.getElementById(`reading-nav-${partKey}`);
    if (navBar) {
      navBar.setAttribute('data-active-idx', String(safeIdx));
      const prevBtn = navBar.querySelector('.btn-group-prev');
      const nextBtn = navBar.querySelector('.btn-group-next');
      if (prevBtn) prevBtn.disabled = (safeIdx === 0);
      if (nextBtn) nextBtn.disabled = (safeIdx >= stageCards.length - 1);
      const partTitle = partKey === 'part6' ? 'Part 6' : 'Part 7';
      const badge = document.getElementById(`group-nav-badge-${partKey}`);
      if (badge) badge.textContent = `${partTitle} • Nhóm ${safeIdx + 1} / ${stageCards.length}`;
      const rangeLabel = document.getElementById(`group-nav-range-${partKey}`);
      if (rangeLabel && rangeParts.length === 2) {
        rangeLabel.textContent = `Câu ${rangeParts[0]} – ${rangeParts[1]}`;
      }
    }
    if (activeCard) {
      const passagesWrap = typeof activeCard.querySelector === 'function' ? activeCard.querySelector('.group-passages-wrap') : null;
      if (passagesWrap) passagesWrap.scrollLeft = 0;
      const subqList = typeof activeCard.querySelector === 'function' ? activeCard.querySelector('.group-subquestions-list') : null;
      if (subqList) subqList.scrollLeft = 0;
      if (typeof activeCard.querySelectorAll === 'function') {
        activeCard.querySelectorAll('.review-q-card').forEach(qCard => {
          qCard.scrollTop = 0;
        });
      }
      const nav = activeCard.querySelector('.mobile-subquestions-nav');
      if (nav && typeof nav.querySelectorAll === 'function') {
        nav.querySelectorAll('.subq-nav-pill').forEach((p, idx) => {
          p.classList.toggle('active', idx === 0);
          p.setAttribute('aria-selected', idx === 0 ? 'true' : 'false');
        });
      }
      const passageImgs = activeCard.querySelectorAll('img.interactive-passage-img');
      passageImgs.forEach(img => {
        const imgId = img.id || '';
        const match = imgId.match(/^img_(.+)_(\d+)$/);
        if (match) {
          const gId = match[1];
          const pIdx = parseInt(match[2], 10);
          this.setupPassageOverlays(img, gId, pIdx);
        }
      });
    }
    if (scroll && activeCard) {
      const navOffset = (typeof window !== 'undefined' && window.innerWidth <= 768) ? 76 : 90;
      const cardTop = activeCard.getBoundingClientRect().top + ((typeof window !== 'undefined' && window.pageYOffset) || (document.documentElement ? document.documentElement.scrollTop : 0) || 0);
      if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
        window.scrollTo({ top: Math.max(0, cardTop - navOffset), behavior: 'smooth' });
      }
    }
  },
  scrollToSubQuestion(gid, qNum) {
    if (typeof document === 'undefined') return;
    const qEl = document.getElementById(`review_q_${qNum}`);
    const listEl = document.getElementById(`subq_list_${gid}`);
    if (qEl && listEl) {
      const left = qEl.offsetLeft - listEl.offsetLeft;
      if (typeof listEl.scrollTo === 'function') {
        listEl.scrollTo({ left, behavior: 'smooth' });
      } else {
        listEl.scrollLeft = left;
      }
    }
    const nav = document.getElementById(`subq_nav_${gid}`);
    if (nav && typeof nav.querySelectorAll === 'function') {
      nav.querySelectorAll('.subq-nav-pill').forEach(p => {
        const isCurrent = p.id === `subq_pill_${gid}_${qNum}`;
        p.classList.toggle('active', isCurrent);
        p.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
      });
    }
  },
  handleSubQuestionsScroll(gid) {
    if (typeof document === 'undefined') return;
    const listEl = document.getElementById(`subq_list_${gid}`);
    if (!listEl) return;
    const scrollLeft = listEl.scrollLeft;
    const cardWidth = listEl.clientWidth || 300;
    const activeSubIdx = Math.max(0, Math.round(scrollLeft / cardWidth));
    const nav = document.getElementById(`subq_nav_${gid}`);
    if (nav && typeof nav.querySelectorAll === 'function') {
      const pills = Array.from(nav.querySelectorAll('.subq-nav-pill'));
      pills.forEach((p, idx) => {
        const isCurrent = (idx === activeSubIdx);
        p.classList.toggle('active', isCurrent);
        p.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
      });
      const activePill = pills[activeSubIdx];
      if (activePill && typeof activePill.scrollIntoView === 'function') {
        try {
          activePill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        } catch (_) {}
      }
    }
  },
  toggleReadingSheet(gid) {
    if (typeof document === 'undefined') return;
    const sheet = document.getElementById(`sheet_${gid}`);
    if (!sheet) return;
    const isExpanded = sheet.classList.toggle('sheet-expanded');
    const icon = sheet.querySelector('.reading-sheet-icon');
    if (icon) {
      icon.textContent = isExpanded ? '▼' : '▲';
    }
  },
  initReadingSheetGestures() {
    if (typeof document === 'undefined') return;
    const sheets = document.querySelectorAll('.reading-questions-sheet');
    sheets.forEach(sheet => {
      if (sheet._hasGestureAttached) return;
      sheet._hasGestureAttached = true;
      const handle = sheet.querySelector('.reading-sheet-handle');
      if (!handle) return;
      sheet.addEventListener('click', (e) => {
        if (!sheet.classList.contains('sheet-expanded')) {
          sheet.classList.add('sheet-expanded');
          const icon = sheet.querySelector('.reading-sheet-icon');
          if (icon) icon.textContent = '▼';
        }
      });
      handle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isExpanded = sheet.classList.toggle('sheet-expanded');
        const icon = sheet.querySelector('.reading-sheet-icon');
        if (icon) icon.textContent = isExpanded ? '▼' : '▲';
      });
      let startY = 0;
      let startX = 0;
      let isDragging = false;
      handle.addEventListener('touchstart', (e) => {
        if (!e.touches || e.touches.length === 0) return;
        startY = e.touches[0].clientY;
        startX = e.touches[0].clientX;
        isDragging = true;
      }, { passive: true });
      handle.addEventListener('touchmove', (e) => {
        if (!isDragging || !e.touches || e.touches.length === 0) return;
        const currentY = e.touches[0].clientY;
        const currentX = e.touches[0].clientX;
        const diffY = currentY - startY;
        const diffX = Math.abs(currentX - startX);
        if (diffX > Math.abs(diffY)) return;
        if (diffY < -25) {
          sheet.classList.add('sheet-expanded');
          const icon = sheet.querySelector('.reading-sheet-icon');
          if (icon) icon.textContent = '▼';
        } else if (diffY > 25) {
          sheet.classList.remove('sheet-expanded');
          const icon = sheet.querySelector('.reading-sheet-icon');
          if (icon) icon.textContent = '▲';
        }
      }, { passive: true });
      handle.addEventListener('touchend', () => {
        isDragging = false;
      }, { passive: true });
    });
  },
  renderDetailedReview() {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('review-questions-container');
    if (!container || !this.resultData) return;
    const rawQuestions = Array.isArray(this.resultData.detailedQuestions) ? this.resultData.detailedQuestions : [];
    const questions = rawQuestions.filter(Boolean);
    let filtered = questions;
    if (this.currentPartFilter !== 'all') {
      const config = this._getConfig();
      filtered = filtered.filter(q => {
        if (!q) return false;
        const pInfo = (config && typeof config.getPartByQuestionNum === 'function')
          ? config.getPartByQuestionNum(q.questionNumber)
          : null;
        const pKey = pInfo ? pInfo.key : (q.part || '');
        return pKey.toLowerCase() === this.currentPartFilter.toLowerCase();
      });
    }
    if (this.currentStatusFilter === 'correct') {
      filtered = filtered.filter(q => q.isCorrect);
    } else if (this.currentStatusFilter === 'wrong') {
      filtered = filtered.filter(q => {
        const hasChoice = Boolean(q && q.userChoice && String(q.userChoice).trim());
        return hasChoice && !q.isCorrect;
      });
    } else if (this.currentStatusFilter === 'unanswered') {
      filtered = filtered.filter(q => {
        const hasChoice = Boolean(q && q.userChoice && String(q.userChoice).trim());
        return !hasChoice;
      });
    }
    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 48px 20px; background: var(--bg-glass-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-glass);">
          <div style="font-size: 2rem; margin-bottom: 8px;">🔍</div>
          <p style="color: var(--text-secondary); font-size: 1.05rem; font-weight: 600;">Không có câu hỏi nào phù hợp với bộ lọc đã chọn.</p>
          <p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 4px;">Vui lòng chuyển đổi trạng thái kết quả hoặc phần thi khác.</p>
        </div>
      `;
      return;
    }
    this.groupsMap = {};
    const groupedItems = [];
    let currentGroup = null;
    const synthFromSentences = (sentences) => Array.isArray(sentences)
      ? sentences.filter(s => s && s.translation).map(s => (s.speaker ? `[${s.speaker}] ${s.translation}` : s.translation)).join('\n')
      : '';
    const synthFromPassages = (passages) => Array.isArray(passages)
      ? passages.flatMap(p => Array.isArray(p?.sentences) ? p.sentences.map(s => s?.translation).filter(Boolean) : []).join('\n')
      : '';
    filtered.forEach(q => {
      const isGroupedPart = ['part3', 'part4', 'part6', 'part7'].includes(q.part);
      if (isGroupedPart && q.groupId) {
        if (currentGroup && currentGroup.groupId === q.groupId) {
          if (!currentGroup.groupTranslation && (q.groupTranslation || q.passageTranslation)) {
            currentGroup.groupTranslation = q.groupTranslation || q.passageTranslation;
          }
          if ((!currentGroup.groupSentences || currentGroup.groupSentences.length === 0) && (q.groupSentences && q.groupSentences.length > 0)) {
            currentGroup.groupSentences = q.groupSentences;
          }
          if ((!currentGroup.groupPassages || currentGroup.groupPassages.length === 0) && (q.groupPassages && q.groupPassages.length > 0)) {
            currentGroup.groupPassages = q.groupPassages;
          }
          if (!currentGroup.groupAudioUrl && (q.audioUrl || q.groupAudioUrl)) {
            let gAudio = q.audioUrl || q.groupAudioUrl;
            if (gAudio && /TEST_\d+\.mp3|Test\d+\.mp3/i.test(gAudio)) {
              const bName = this.resultData?.bookName || 'EST 2022';
              const tId = this.resultData?.testId || 1;
              gAudio = `uploads/${bName}/LC/audio/cut/test${tId}/${currentGroup.groupId}.mp3`;
            }
            currentGroup.groupAudioUrl = gAudio;
          }
          if (!currentGroup.groupTranslation) {
            currentGroup.groupTranslation = synthFromSentences(currentGroup.groupSentences) || synthFromPassages(currentGroup.groupPassages);
          }
          currentGroup.questions.push(q);
        } else {
          const gSentences = q.groupSentences || [];
          const gPassages = q.groupPassages || [];
          const gTrans = q.groupTranslation || q.passageTranslation || synthFromSentences(gSentences) || synthFromPassages(gPassages) || '';
          let gAudio = q.audioUrl || q.groupAudioUrl || '';
          if (gAudio && /TEST_\d+\.mp3|Test\d+\.mp3/i.test(gAudio)) {
            const bName = this.resultData?.bookName || 'EST 2022';
            const tId = this.resultData?.testId || 1;
            gAudio = `uploads/${bName}/LC/audio/cut/test${tId}/${q.groupId}.mp3`;
          }
          currentGroup = {
            type: 'group',
            groupId: q.groupId,
            part: q.part,
            expectedRange: q.expectedRange || [q.questionNumber, q.questionNumber],
            groupPassages: gPassages,
            groupSentences: gSentences,
            groupTranscript: q.groupTranscript || '',
            groupTranslation: gTrans,
            groupAudioUrl: gAudio,
            questions: [q]
          };
          this.groupsMap[q.groupId] = currentGroup;
          groupedItems.push(currentGroup);
        }
      } else {
        currentGroup = null;
        groupedItems.push({
          type: 'single',
          question: q
        });
      }
    });
    let html = '';
    const readingGroups = groupedItems.filter(item => item.type === 'group' && ['part6', 'part7'].includes(item.part));
    let readingGroupIdx = 0;
    groupedItems.forEach(item => {
      if (item.type === 'single') {
        html += this.renderSingleQuestionReview(item.question);
      } else {
        const isReading = ['part6', 'part7'].includes(item.part);
        const gIdx = isReading ? readingGroupIdx++ : 0;
        html += this.renderGroupQuestionReview(item, gIdx, readingGroups.length);
      }
    });
    if (this.resultData && this.resultData.mode !== 'part' && /^part([1-7])$/i.test(this.currentPartFilter)) {
      const curIdx = parseInt(this.currentPartFilter.replace(/part/i, ''), 10);
      const prevPart = curIdx > 1 ? `part${curIdx - 1}` : null;
      const nextPart = curIdx < 7 ? `part${curIdx + 1}` : null;
      const isReadingPart = curIdx === 6 || curIdx === 7;
      html += `
        <div class="review-part-footer-nav ${isReadingPart ? 'reading-part-nav' : ''}" style="display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 20px 0 8px; padding: 12px 16px; background: var(--bg-glass-card); border: 1px solid var(--border-glass); border-radius: var(--radius-lg);">
          ${prevPart ? `
            <button type="button" class="btn btn-secondary" onclick="ResultViewer.setPartFilter('${prevPart}'); window.scrollTo({top: Math.max(0, (document.getElementById('detailed-review-section')?.offsetTop || 0) - 80), behavior: 'smooth'});">
              ⬅ Part ${curIdx - 1}
            </button>
          ` : `<div></div>`}
          ${nextPart ? `
            <button type="button" class="btn btn-primary" onclick="ResultViewer.setPartFilter('${nextPart}'); window.scrollTo({top: Math.max(0, (document.getElementById('detailed-review-section')?.offsetTop || 0) - 80), behavior: 'smooth'});" style="margin-left: auto;">
              Part ${curIdx + 1} ➔
            </button>
          ` : `<div></div>`}
        </div>
      `;
    }
    container.innerHTML = html;
    this.initReadingSheetGestures();
    if (typeof UIRenderer !== 'undefined' && typeof UIRenderer.syncReadingStageHeights === 'function') {
      UIRenderer.syncReadingStageHeights();
    }
  },
  renderSingleQuestionReview(q) {
    const config = this._getConfig();
    const qNum = q.questionNumber;
    const userChoice = q.userChoice;
    const correctChoice = q.correctChoice;
    const isCorrect = q.isCorrect;
    const hasExplanation = Boolean(q.explanation || q.analysis || q.tips || q.optionsTranslation || q.translation);
    let audioUrl = q.audioUrl;
    if (audioUrl && /TEST_\d+\.mp3|Test\d+\.mp3/i.test(audioUrl)) {
      const bName = this.resultData?.bookName || 'EST 2022';
      const tId = this.resultData?.testId || 1;
      audioUrl = `uploads/${bName}/LC/audio/cut/test${tId}/q${qNum}.mp3`;
    }
    const imgUrl = (config && typeof config.resolveAssetUrl === 'function')
      ? config.resolveAssetUrl(q.imageUrl)
      : (q.imageUrl || '');
    const playerId = `review_player_${qNum}`;
    const partInfo = (config && typeof config.getPartByQuestionNum === 'function')
      ? config.getPartByQuestionNum(qNum)
      : null;
    const partKey = partInfo ? partInfo.key : (q.part || '');
    let cleanQuestionText = (q.questionText || '').trim();
    if (/^(Look at the picture marked number \d+ in your test book\.?|Câu \d+$)/i.test(cleanQuestionText)) {
      cleanQuestionText = '';
    }
    let cleanQuestionTrans = (q.translation || q.questionTranslation || '').trim();
    if (partKey === 'part1' && (/^(Nhìn vào bức tranh|Hãy nhìn vào bức tranh)/i.test(cleanQuestionTrans) || !cleanQuestionText)) {
      cleanQuestionTrans = '';
    }
    const optionKeys = (partKey === 'part2' || !q.options?.['D']) ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
    return `
      <div class="review-q-card animate-fade-in" id="review_q_${qNum}">
        <!-- Question Review Header -->
        <div class="review-q-header">
          <div class="review-q-title-wrap">
            <span class="review-q-num">Câu ${qNum}</span>
            ${isCorrect 
              ? '<span class="status-badge status-correct">✅ Đúng</span>' 
              : (userChoice 
                  ? '<span class="status-badge status-wrong">❌ Sai</span>' 
                  : '<span class="status-badge status-empty">⚪ Chưa làm</span>')}
          </div>
          ${audioUrl ? UIRenderer.renderAudioPlayer(playerId, audioUrl, `Nghe lại câu ${qNum}`, true) : ''}
        </div>
        <!-- Part 1: Photograph with direct click-to-zoom (No blinding background, no black zoom button) -->
        ${imgUrl ? `
          <div class="q-image-container" style="cursor: pointer;" onclick="UIRenderer.openLightbox('${imgUrl}')" title="Nhấn để phóng to hình ảnh">
            <img src="${imgUrl}" alt="Photo Question ${qNum}" loading="lazy">
          </div>
        ` : ''}
        <!-- Part 2: Spoken Question Script + Inline Question Translation -->
        ${(partKey === 'part2' && (cleanQuestionText || cleanQuestionTrans)) ? `
          <div class="part2-script-box" style="background: rgba(99, 102, 241, 0.12); border-left: 3px solid var(--accent-primary); padding: 8px 12px; border-radius: var(--radius-sm); margin: 6px 0 10px;">
            ${cleanQuestionText ? `<p style="font-size: 0.92rem; font-weight: 600; color: var(--text-primary); margin: 0 0 4px;">"${cleanQuestionText}"</p>` : ''}
            ${cleanQuestionTrans ? `<p class="question-trans-inline" style="font-size: 0.86rem; color: var(--text-secondary); margin: 0; font-style: italic;">${cleanQuestionTrans}</p>` : ''}
          </div>
        ` : ''}
        <!-- Question Text & Inline Translation for Part 5 (or Part 1 if non-boilerplate question exists) -->
        ${(partKey !== 'part2' && (cleanQuestionText || cleanQuestionTrans)) ? `
          <div class="question-text-block" style="margin: 8px 0 10px;">
            ${cleanQuestionText ? `<p class="question-text review-question-text">${cleanQuestionText}</p>` : ''}
            ${(cleanQuestionTrans && cleanQuestionTrans.toLowerCase() !== cleanQuestionText.toLowerCase()) ? `<p class="question-trans-inline">${cleanQuestionTrans}</p>` : ''}
          </div>
        ` : ''}
        <!-- Options Group with Inline Translation -->
        <div class="review-options-group">
          ${optionKeys.map(opt => {
            const optText = q.options?.[opt];
            if (!optText && !q.options?.['C']) return '';
            const optTrans = q.optionsTranslation?.[opt];
            const isThisCorrect = (opt === correctChoice);
            const isThisUserChoice = (opt === userChoice);
            let cardClass = 'review-opt-card';
            let markHtml = '';
            if (isThisCorrect) {
              cardClass += ' opt-correct';
              markHtml = '<span class="opt-mark-icon mark-correct" title="Đáp án đúng">✓</span>';
            } else if (isThisUserChoice && !isCorrect) {
              cardClass += ' opt-user-wrong';
              markHtml = '<span class="opt-mark-icon mark-wrong" title="Bạn đã chọn">✗</span>';
            }
            return `
              <div class="${cardClass}">
                <span class="review-opt-letter">${opt}</span>
                <div class="review-opt-body">
                  <div class="review-opt-en">${optText || `(${opt})`}</div>
                  ${optTrans ? `<div class="review-opt-vi">${optTrans}</div>` : ''}
                </div>
                ${markHtml}
              </div>
            `;
          }).join('')}
        </div>
        <!-- Explanation Accordion -->
        <div style="margin-top: 12px;">
          <button class="explanation-toggle-btn" type="button" id="toggle_btn_${qNum}" aria-expanded="false" aria-controls="panel_exp_${qNum}" onclick="ResultViewer.toggleExplanation(${qNum})">
            <span>💡 Xem lời giải & Phân tích</span>
            <span class="arrow-icon">▼</span>
          </button>
          <div class="explanation-panel" id="panel_exp_${qNum}" role="region" aria-labelledby="toggle_btn_${qNum}" aria-hidden="true">
            ${this.renderExplanationContent(q, hasExplanation)}
          </div>
        </div>
      </div>
    `;
  },
  renderGroupQuestionReview(group, groupIndex = 0, totalGroups = 1) {
    const config = this._getConfig();
    const isReading = ['part6', 'part7'].includes(group.part);
    const gid = group.groupId;
    const range = group.expectedRange || [0, 0];
    const badgeLabel = group.part === 'part6' ? 'Part 6'
      : group.part === 'part7' ? 'Part 7'
      : group.part === 'part3' ? 'Part 3'
      : 'Part 4';
    const isActiveOnMobile = (groupIndex === 0);
    if (isReading) {
      return `
        <div class="group-review-card reading-group-stage is-reading-group animate-fade-in ${isActiveOnMobile ? 'mobile-active-group' : ''}"
             id="group_review_${gid}"
             data-group-id="${gid}"
             data-group-index="${groupIndex}"
             data-part="${group.part}"
             data-range="${range[0]}-${range[1]}">
          <!-- Pinned Top Zone on Mobile (131-134 -> Passage Image -> Câu 1, Câu 2) / Display Contents on PC -->
          <div class="reading-group-pinned-top">
            <!-- Mobile Top Navigation Header -->
            <div class="mobile-group-header-bar">
              <button type="button" class="btn-group-nav btn-group-prev" onclick="ResultViewer.navReadingGroup('${group.part}', -1)" ${groupIndex === 0 ? 'disabled' : ''} aria-label="Nhóm trước">
                ‹ Trước
              </button>
              <div class="group-nav-info">
                <span class="group-nav-range-title">Câu ${range[0]} – ${range[1]}</span>
              </div>
              <button type="button" class="btn-group-nav btn-group-next" onclick="ResultViewer.navReadingGroup('${group.part}', 1)" ${groupIndex === totalGroups - 1 ? 'disabled' : ''} aria-label="Nhóm tiếp theo">
                Tiếp ›
              </button>
            </div>
            <!-- Group Header (Desktop PC) -->
            <div class="group-review-header pc-only-header">
              <span class="group-review-badge">
                📖 ${badgeLabel} • Câu ${range[0]}–${range[1]}
              </span>
            </div>
            <!-- Left Column (Desktop) / Pinned Image & Sentence Dock (Mobile) -->
            <div class="reading-stage-images passages-images-wrap">
              ${group.groupPassages && group.groupPassages.length > 0 ? `
                <div class="group-passages-wrap" id="passages_wrap_${gid}">
                  ${group.groupPassages.map((p, pIdx) => {
                    const pUrl = typeof p === 'string' ? p : p.imageUrl;
                    const fullUrl = (config && typeof config.resolveAssetUrl === 'function') ? config.resolveAssetUrl(pUrl) : (pUrl || '');
                    const totalPassages = group.groupPassages.length;
                    return `
                      <div class="interactive-passage-container" id="pass_wrap_${gid}_${pIdx}">
                        <div class="passage-image-wrap" id="img_wrap_${gid}_${pIdx}">
                          ${totalPassages > 1 ? `<span class="passage-slide-indicator" aria-label="Ảnh ${pIdx + 1} trên ${totalPassages}">${pIdx + 1}/${totalPassages} ↔</span>` : ''}
                          <button type="button" class="image-zoom-btn-icon" onclick="event.stopPropagation(); ResultViewer.openPassageLightbox('${gid}', ${pIdx}, '${fullUrl}')" title="Phóng to ảnh" aria-label="Phóng to ảnh">🔍</button>
                          <img src="${fullUrl}" alt="Passage ${pIdx + 1}"
                               class="interactive-passage-img"
                               id="img_${gid}_${pIdx}"
                               onload="ResultViewer.setupPassageOverlays(this, '${gid}', ${pIdx})"
                               onclick="ResultViewer.handlePassageImageClick(event, this, '${gid}', ${pIdx})">
                          <div class="passage-overlays-layer" id="overlays_${gid}_${pIdx}"></div>
                          <!-- Floating Sentence Lookup Popover -->
                          <div class="sentence-lookup-card sentence-floating-popover" id="sentence_card_${gid}_${pIdx}" style="display: none;" onclick="event.stopPropagation()">
                            <div class="sentence-lookup-header">
                              <span class="sentence-badge" id="sentence_badge_${gid}_${pIdx}">Câu 1</span>
                              <button type="button" class="sentence-close-btn" onclick="ResultViewer.closeSentenceCard('${gid}', ${pIdx})">&times;</button>
                            </div>
                            <div class="sentence-text-en" id="sentence_en_${gid}_${pIdx}"></div>
                            <div class="sentence-text-vi" id="sentence_vi_${gid}_${pIdx}"></div>
                            <div class="sentence-text-note" id="sentence_note_${gid}_${pIdx}"></div>
                          </div>
                        </div>
                        ${Array.isArray(p.sentences) && p.sentences.length > 0 ? `
                          <div class="passage-inline-sentence-dock" id="sentence_dock_${gid}_${pIdx}" role="toolbar" aria-label="Danh sách câu bài đọc">
                            ${p.sentences.map((s, sIdx) => `
                              <button type="button" class="lightbox-sentence-btn inline-sentence-btn"
                                      id="btn_${gid}_${pIdx}_${sIdx}"
                                      data-sidx="${sIdx}"
                                      aria-pressed="false"
                                      aria-label="Xem dịch và giải thích câu ${sIdx + 1}"
                                      onclick="event.stopPropagation(); ResultViewer.handleSentenceBtnClick('${gid}', ${pIdx}, ${sIdx}, '')">
                                Câu ${sIdx + 1}
                              </button>
                            `).join('')}
                          </div>
                        ` : ''}
                      </div>
                    `;
                  }).join('')}
                </div>
              ` : ''}
            </div>
          </div>
          <!-- Right Column (Desktop) / Questions Section Underneath (Mobile): Sub-questions -->
          <div class="reading-questions-sheet" id="sheet_${gid}">
            <div class="reading-sheet-handle" onclick="ResultViewer.toggleReadingSheet('${gid}')" title="Vuốt lên/xuống hoặc nhấn để ẩn/hiện câu hỏi">
              <div class="reading-sheet-pill"></div>
              <div class="reading-sheet-title">
                <span class="reading-sheet-icon">▲</span>
                <span>Câu hỏi & Lời giải ${range[0]} - ${range[1]}</span>
              </div>
            </div>
            <div class="reading-sheet-body">
              <div class="group-subquestions-list" id="subq_list_${gid}">
                ${group.questions.map(q => this.renderSubQuestionItem(q)).join('')}
              </div>
            </div>
          </div>
        </div>
      `;
    }
    return `
      <div class="group-review-card animate-fade-in" id="group_review_${gid}">
        <!-- Group Header -->
        <div class="group-review-header">
          <span class="group-review-badge">
            ${isReading ? '📖' : '🎧'} ${badgeLabel} • Câu ${range[0]}–${range[1]}
          </span>
        </div>
        <!-- Listening (Part 3 & 4): Group Audio Player & Graphic -->
        ${!isReading && group.groupAudioUrl ? UIRenderer.renderAudioPlayer(`review_player_${gid}`, group.groupAudioUrl, `Nghe lại đoạn thoại Câu ${range[0]} - ${range[1]}`) : ''}
        ${!isReading && group.groupPassages && group.groupPassages.length > 0 ? `
          <div class="group-passages-wrap" style="margin: 8px 0;">
            ${group.groupPassages.map(p => {
              const pUrl = typeof p === 'string' ? p : p.imageUrl;
              const fullUrl = (config && typeof config.resolveAssetUrl === 'function') ? config.resolveAssetUrl(pUrl) : (pUrl || '');
              return `
                <div class="q-image-container" style="cursor: pointer;" onclick="UIRenderer.openLightbox('${fullUrl}')" title="Nhấn để phóng to ảnh">
                  <img src="${fullUrl}" alt="Graphic" loading="lazy">
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}
        <!-- Listening (Part 3 & 4): Transcript & Translation Accordion -->
        ${(!isReading && group.groupTranscript) ? `
          <details class="passage-transcript-box">
            <summary>📜 Lời thoại & Dịch</summary>
            <div style="margin-top: 10px; font-size: 0.86rem; line-height: 1.55; color: var(--text-primary);">
              ${this.formatDialogue(group.groupTranscript)}
            </div>
            ${group.groupTranslation ? `
              <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--border-glass);">
                <strong style="color: var(--accent-secondary); font-size: 0.82rem; display: block; margin-bottom: 6px;">🌐 Bản dịch tiếng Việt:</strong>
                <div>${this.formatDialogue(group.groupTranslation)}</div>
              </div>
            ` : ''}
            ${(Array.isArray(group.groupSentences) && group.groupSentences.some(s => s && s.analysis)) ? `
              <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--border-glass);">
                <strong style="color: var(--accent-secondary); font-size: 0.82rem; display: block; margin-bottom: 6px;">📚 Phân tích từ vựng & cấu trúc từng lượt thoại:</strong>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                  ${group.groupSentences.map((s, sIdx) => s && s.analysis ? `
                    <div style="background: rgba(255, 255, 255, 0.03); padding: 8px 10px; border-radius: var(--radius-sm); border-left: 2px solid var(--accent-primary);">
                      <div style="font-weight: 600; font-size: 0.84rem; color: var(--text-primary); margin-bottom: 4px;">${s.speaker ? `[${s.speaker}] ` : `Câu ${sIdx + 1}: `}${s.text || ''}</div>
                      <div class="analysis-formatted-wrap">${this.formatSentenceAnalysis(s.analysis)}</div>
                    </div>
                  ` : '').join('')}
                </div>
              </div>
            ` : ''}
          </details>
        ` : ''}
        <!-- Reading (Part 6 & 7): 1 Passage Image Container with Interactive Sentence Translation -->
        ${isReading && group.groupPassages && group.groupPassages.length > 0 ? `
          <div class="group-passages-wrap">
            ${group.groupPassages.map((p, pIdx) => {
              const pUrl = typeof p === 'string' ? p : p.imageUrl;
              const fullUrl = (config && typeof config.resolveAssetUrl === 'function') ? config.resolveAssetUrl(pUrl) : (pUrl || '');
              return `
                <div class="interactive-passage-container" id="pass_wrap_${gid}_${pIdx}">
                  <div class="passage-image-wrap" id="img_wrap_${gid}_${pIdx}">
                    <button type="button" class="image-zoom-btn-icon" onclick="event.stopPropagation(); ResultViewer.openPassageLightbox('${gid}', ${pIdx}, '${fullUrl}')" title="Phóng to ảnh" aria-label="Phóng to ảnh">🔍</button>
                    <img src="${fullUrl}" alt="Passage ${pIdx + 1}"
                         class="interactive-passage-img"
                         id="img_${gid}_${pIdx}"
                         onload="ResultViewer.setupPassageOverlays(this, '${gid}', ${pIdx})"
                         onclick="ResultViewer.handlePassageImageClick(event, this, '${gid}', ${pIdx})">
                    <div class="passage-overlays-layer" id="overlays_${gid}_${pIdx}"></div>
                    <!-- Floating Sentence Lookup Popover (positions below clicked coordinate, can overflow downward outside image) -->
                    <div class="sentence-lookup-card sentence-floating-popover" id="sentence_card_${gid}_${pIdx}" style="display: none;" onclick="event.stopPropagation()">
                      <div class="sentence-lookup-header">
                        <span class="sentence-badge" id="sentence_badge_${gid}_${pIdx}">Câu 1</span>
                        <button type="button" class="sentence-close-btn" onclick="ResultViewer.closeSentenceCard('${gid}', ${pIdx})">&times;</button>
                      </div>
                      <div class="sentence-text-en" id="sentence_en_${gid}_${pIdx}"></div>
                      <div class="sentence-text-vi" id="sentence_vi_${gid}_${pIdx}"></div>
                      <div class="sentence-text-note" id="sentence_note_${gid}_${pIdx}"></div>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}
        <!-- Sub-questions belonging to this group -->
        <div class="group-subquestions-list">
          ${group.questions.map(q => this.renderSubQuestionItem(q)).join('')}
        </div>
      </div>
    `;
  },
  renderSubQuestionItem(q) {
    const qNum = q.questionNumber;
    const userChoice = q.userChoice;
    const correctChoice = q.correctChoice;
    const isCorrect = q.isCorrect;
    const hasExplanation = Boolean(q.explanation || q.analysis || q.tips || q.optionsTranslation || q.translation);
    const cleanQText = (q.questionText || '').trim();
    const questionTrans = (q.translation || q.questionTranslation || '').trim();
    const showTrans = Boolean(questionTrans && questionTrans.toLowerCase() !== cleanQText.toLowerCase());
    return `
      <div class="review-q-card animate-fade-in" id="review_q_${qNum}" style="margin-top: 10px; margin-bottom: 0;">
        <div class="review-q-header">
          <div class="review-q-title-wrap">
            <span class="review-q-num">Câu ${qNum}</span>
            ${isCorrect 
              ? '<span class="status-badge status-correct">✅ Đúng</span>' 
              : (userChoice 
                  ? '<span class="status-badge status-wrong">❌ Sai</span>' 
                  : '<span class="status-badge status-empty">⚪ Chưa làm</span>')}
          </div>
        </div>
        ${(cleanQText || showTrans) ? `
          <div class="question-text-block" style="margin: 6px 0 8px;">
            ${cleanQText ? `<p class="question-text review-question-text">${cleanQText}</p>` : ''}
            ${showTrans ? `<p class="question-trans-inline">${questionTrans}</p>` : ''}
          </div>
        ` : ''}
        <!-- Options Group with Inline Translation -->
        <div class="review-options-group">
          ${['A', 'B', 'C', 'D'].map(opt => {
            const optText = q.options?.[opt];
            if (!optText && !q.options?.['C']) return '';
            const optTrans = q.optionsTranslation?.[opt];
            const isThisCorrect = (opt === correctChoice);
            const isThisUserChoice = (opt === userChoice);
            let cardClass = 'review-opt-card';
            let markHtml = '';
            if (isThisCorrect) {
              cardClass += ' opt-correct';
              markHtml = '<span class="opt-mark-icon mark-correct" title="Đáp án đúng">✓</span>';
            } else if (isThisUserChoice && !isCorrect) {
              cardClass += ' opt-user-wrong';
              markHtml = '<span class="opt-mark-icon mark-wrong" title="Bạn đã chọn">✗</span>';
            }
            return `
              <div class="${cardClass}">
                <span class="review-opt-letter">${opt}</span>
                <div class="review-opt-body">
                  <div class="review-opt-en">${optText || `(${opt})`}</div>
                  ${optTrans ? `<div class="review-opt-vi">${optTrans}</div>` : ''}
                </div>
                ${markHtml}
              </div>
            `;
          }).join('')}
        </div>
        <!-- Explanation Accordion -->
        <div style="margin-top: 12px;">
          <button type="button" class="explanation-toggle-btn" id="toggle_btn_${qNum}" aria-expanded="false" aria-controls="panel_exp_${qNum}" onclick="ResultViewer.toggleExplanation(${qNum})">
            <span>💡 Xem lời giải & Phân tích</span>
            <span class="arrow-icon">▼</span>
          </button>
          <div class="explanation-panel" id="panel_exp_${qNum}" role="region" aria-labelledby="toggle_btn_${qNum}" aria-hidden="true">
            ${this.renderExplanationContent(q, hasExplanation)}
          </div>
        </div>
      </div>
    `;
  },
  speakPhrase(text, btnEl = null) {
    if (!text || typeof text !== 'string') return false;
    const audioCtrl = (typeof AudioController !== 'undefined')
      ? AudioController
      : (typeof window !== 'undefined' && window.AudioController ? window.AudioController : null);
    if (audioCtrl && typeof audioCtrl.speakText === 'function') {
      return audioCtrl.speakText(text, btnEl);
    }
    if (typeof window !== 'undefined' && window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function') {
      try {
        window.speechSynthesis.cancel();
        const u = new window.SpeechSynthesisUtterance(text.trim());
        u.lang = 'en-US';
        u.rate = 0.94;
        window.speechSynthesis.speak(u);
        return true;
      } catch (_) {}
    }
    return false;
  },
  extractSpeakableEnglish(rawPhrase) {
    if (!rawPhrase || typeof rawPhrase !== 'string') return '';
    const trimmed = rawPhrase.trim();
    if (!trimmed) return '';
    if (/^(?:S\s*\+|To\s*\+\s*V|N1\s*\+|A,\s*B)/i.test(trimmed)) return '';
    const viRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
    let cleaned = trimmed
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ')
      .trim();
    if (!cleaned) return '';
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length === 0) return '';
    if (viRegex.test(words[0])) return '';
    cleaned = cleaned
      .replace(/\b(?:V-ing|V_ing|V-ed|V_ed|V-inf|V_inf|to-V|To-V|N\/V-ing|sth|sb)\b/gi, ' ')
      .replace(/(?:^|\s)\+\s*\b(?:S|V|O|N|C|Adj|Adv)\b/g, ' ')
      .replace(/\b(?:S|V|O|N|C)\b\s*\+/g, ' ')
      .replace(/\+/g, ' ');
    const enTokens = cleaned
      .split(/\s+/)
      .filter(tok => tok && !viRegex.test(tok));
    const result = enTokens.join(' ')
      .replace(/\s*=\s*/g, ', ')
      .replace(/\s*\/\s*/g, ', ')
      .replace(/^[,.\-–—:;'"`]+|[,.\-–—:;'"`]+$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (!/[a-zA-Z]{2,}/.test(result)) return '';
    if (/^(?:A,\s*B(?:,\s*and\s*C)?|is,\s*are)$/i.test(result)) return '';
    return result;
  },
  formatSentenceAnalysis(rawText) {
    if (!rawText || typeof rawText !== 'string') return '';
    const esc = (str) => this.escapeHtml(str);
    const viRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
    const normalized = rawText
      .replace(/([^\n])[ \t]+\*[ \t]+/g, '$1\n* ')
      .replace(/\r\n/g, '\n');
    const rawLines = normalized.split('\n').map(l => l.trim()).filter(Boolean);
    if (rawLines.length === 0) return '';
    let html = '';
    let inList = false;
    const closeList = () => {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
    };
    const renderSpeakerBtn = (ttsText) => {
      if (!ttsText) return '';
      const safeTts = esc(ttsText);
      return `<button type="button" class="phrase-tts-btn" data-tts="${safeTts}" onclick="event.stopPropagation(); ResultViewer.speakPhrase(this.getAttribute('data-tts'), this)" title="Phát âm: ${safeTts}" aria-label="Phát âm ${safeTts}" aria-pressed="false"><svg class="tts-speaker-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg></button>`;
    };
    const formatPhraseItem = (itemText) => {
      const qaMatch = itemText.match(/^(Q:\s*["']([^"']+)["']\s*(?:->|➔|=>)\s*A:\s*["']([^"']+)["'])\s*(.*)$/i);
      if (qaMatch) {
        const qaPhrase = qaMatch[1].trim();
        const qaSpeech = `${qaMatch[2].trim()} ${qaMatch[3].trim()}`;
        const qaMeaning = qaMatch[4].trim();
        return `<li class="analysis-list-item"><strong class="analysis-phrase analysis-phrase-clickable" onclick="if(this.nextElementSibling&&this.nextElementSibling.classList.contains('phrase-tts-btn'))this.nextElementSibling.click()">${esc(qaPhrase)}</strong>${renderSpeakerBtn(qaSpeech)}${qaMeaning ? ` <span class="analysis-meaning">${esc(qaMeaning)}</span>` : ''}</li>`;
      }
      if (/^\[Trong bài/i.test(itemText) && /(?:➔|->)/.test(itemText)) {
        const quoted = [];
        const qRegex = /["']([^"']{2,})["']/g;
        let qm;
        while ((qm = qRegex.exec(itemText)) !== null) {
          if (!viRegex.test(qm[1])) quoted.push(qm[1].trim());
        }
        const tts = quoted.join('. ');
        return `<li class="analysis-list-item"><span class="analysis-meaning">${esc(itemText)}</span>${renderSpeakerBtn(tts)}</li>`;
      }
      const eqIdx = itemText.indexOf(' = ');
      const colIdx = itemText.indexOf(': ');
      let splitIdx = -1;
      let sepLen = 2;
      if (eqIdx !== -1 && colIdx !== -1) {
        if (eqIdx < colIdx) {
          const between = itemText.slice(eqIdx + 3, colIdx);
          if (!viRegex.test(between)) {
            splitIdx = colIdx;
            sepLen = 2;
          } else {
            splitIdx = eqIdx;
            sepLen = 3;
          }
        } else {
          splitIdx = colIdx;
          sepLen = 2;
        }
      } else if (eqIdx !== -1) {
        splitIdx = eqIdx;
        sepLen = 3;
      } else if (colIdx !== -1) {
        splitIdx = colIdx;
        sepLen = 2;
      }
      if (splitIdx > 0 && splitIdx < 140) {
        const phrase = itemText.slice(0, splitIdx).trim();
        const meaning = itemText.slice(splitIdx + sepLen).trim();
        const ttsText = this.extractSpeakableEnglish(phrase);
        const clickAttr = ttsText
          ? ` class="analysis-phrase analysis-phrase-clickable" onclick="if(this.nextElementSibling&&this.nextElementSibling.classList.contains('phrase-tts-btn'))this.nextElementSibling.click()"`
          : ` class="analysis-phrase"`;
        return `<li class="analysis-list-item"><strong${clickAttr}>${esc(phrase)}</strong>${renderSpeakerBtn(ttsText)}: <span class="analysis-meaning">${esc(meaning)}</span></li>`;
      }
      return `<li class="analysis-list-item"><span class="analysis-meaning">${esc(itemText)}</span></li>`;
    };
    rawLines.forEach(line => {
      const isSectionHeader = line.endsWith(':') && !line.includes(': ') && !line.includes(' = ') &&
        (/^(?:📌\s*|🎯\s*|\d+[.)]\s*)?(?:Phân tích|Cấu trúc|Từ vựng|Ngữ pháp|Ghi chú|Bản chất|Các mẫu|Ví dụ)/i.test(line));
      const bulletMatch = !isSectionHeader ? line.match(/^(?:[*•\-+]|\d+[.)])\s+(.*)$/) : null;
      if (isSectionHeader) {
        closeList();
        const cleanHeader = line.replace(/^(?:📌|🎯)\s*/, '');
        const icon = line.startsWith('🎯') ? '🎯' : '📌';
        html += `<div class="analysis-section-title">${icon} ${esc(cleanHeader)}</div>`;
      } else if (bulletMatch) {
        if (!inList) {
          html += '<ul class="analysis-list">';
          inList = true;
        }
        html += formatPhraseItem(bulletMatch[1].trim());
      } else if (rawLines.length > 1) {
        if (/^(Ghi chú|Lưu ý):/i.test(line)) {
          closeList();
          html += `<div class="analysis-note-line">💡 ${esc(line)}</div>`;
        } else {
          if (!inList) {
            html += '<ul class="analysis-list">';
            inList = true;
          }
          html += formatPhraseItem(line);
        }
      } else {
        closeList();
        html += `<div class="analysis-note-line">💡 ${esc(line)}</div>`;
      }
    });
    closeList();
    return html;
  },
  formatTipsText(rawTips) {
    if (!rawTips || typeof rawTips !== 'string') return '';
    return rawTips
      .replace(/([^\n])[ \t]+\*[ \t]+/g, '$1\n• ')
      .replace(/^\*[ \t]+/gm, '• ')
      .trim();
  },
  renderExplanationContent(q, hasExplanation) {
    const hasExp = Boolean(q && q.explanation);
    const hasAnalysis = Boolean(q && q.analysis);
    const hasTips = Boolean(q && q.tips);
    if (!hasExplanation || (!hasExp && !hasAnalysis && !hasTips)) {
      return `
        <div class="exp-empty-notice">
          <span>ℹ️ Lời giải chi tiết và phân tích cho câu hỏi này đang được AI biên soạn và cập nhật.</span>
        </div>
      `;
    }
    return `
      <!-- Card: Lời giải chi tiết -->
      ${hasExp ? `
        <div class="exp-card exp-detail-card">
          <div class="exp-card-header">
            <span class="exp-icon">🎯</span>
            <span class="exp-title">Lời giải chi tiết</span>
          </div>
          <div class="exp-card-content">
            <div class="exp-text-prose">${q.explanation}</div>
          </div>
        </div>
      ` : ''}
      <!-- Card: Phân tích từ vựng & Cấu trúc ngữ pháp -->
      ${hasAnalysis ? `
        <div class="exp-card exp-analysis-card">
          <div class="exp-card-header">
            <span class="exp-icon">📚</span>
            <span class="exp-title">Phân tích từ vựng & Cấu trúc ngữ pháp</span>
          </div>
          <div class="exp-card-content">
            <div class="exp-text-prose exp-analysis-text">${this.formatSentenceAnalysis(q.analysis)}</div>
          </div>
        </div>
      ` : ''}
      <!-- Card: Mẹo làm bài & Bẫy thường gặp -->
      ${hasTips ? `
        <div class="exp-card exp-tips-card">
          <div class="exp-card-header">
            <span class="exp-icon">💡</span>
            <span class="exp-title">Mẹo làm bài & Bẫy thường gặp</span>
          </div>
          <div class="exp-card-content">
            <div class="exp-text-prose exp-analysis-text" style="white-space: pre-line;">${this.formatTipsText(q.tips)}</div>
          </div>
        </div>
      ` : ''}
    `;
  },
  toggleExplanation(qNum, forceState = null) {
    if (typeof document === 'undefined') return false;
    const num = parseInt(qNum, 10);
    if (!Number.isInteger(num) || num <= 0) return false;
    const panel = document.getElementById(`panel_exp_${num}`);
    const btn = document.getElementById(`toggle_btn_${num}`);
    if (!panel || !btn) return false;
    const currentlyVisible = panel.classList.contains('show');
    const shouldOpen = (typeof forceState === 'boolean') ? forceState : !currentlyVisible;
    if (shouldOpen) {
      panel.classList.add('show');
      if (typeof panel.setAttribute === 'function') panel.setAttribute('aria-hidden', 'false');
      btn.classList.add('expanded');
      if (typeof btn.setAttribute === 'function') btn.setAttribute('aria-expanded', 'true');
    } else {
      panel.classList.remove('show');
      if (typeof panel.setAttribute === 'function') panel.setAttribute('aria-hidden', 'true');
      btn.classList.remove('expanded');
      if (typeof btn.setAttribute === 'function') btn.setAttribute('aria-expanded', 'false');
    }
    return shouldOpen;
  },
  toggleAllExplanations(shouldExpand = null) {
    if (typeof document === 'undefined') return false;
    const container = (typeof document.getElementById === 'function' && document.getElementById('review-questions-container')) || document;
    let panels = (container && typeof container.querySelectorAll === 'function')
      ? container.querySelectorAll('.explanation-panel')
      : ((typeof document.querySelectorAll === 'function') ? document.querySelectorAll('.explanation-panel') : []);
    let buttons = (container && typeof container.querySelectorAll === 'function')
      ? container.querySelectorAll('.explanation-toggle-btn')
      : ((typeof document.querySelectorAll === 'function') ? document.querySelectorAll('.explanation-toggle-btn') : []);
    if ((!panels || panels.length === 0) && typeof document.querySelectorAll === 'function') {
      panels = document.querySelectorAll('.explanation-panel');
      buttons = document.querySelectorAll('.explanation-toggle-btn');
    }
    let expand;
    if (typeof shouldExpand === 'boolean') {
      expand = shouldExpand;
    } else if (typeof shouldExpand === 'string') {
      const s = shouldExpand.trim().toLowerCase();
      expand = (s === 'true' || s === '1');
    } else {
      let anyClosed = false;
      panels.forEach(p => {
        if (!p.classList.contains('show')) anyClosed = true;
      });
      expand = anyClosed;
    }
    if (expand) {
      const section = document.getElementById('detailed-review-section');
      if (section && (section.style.display === 'none' || !section.style.display)) {
        section.style.display = 'block';
      }
    }
    let affectedCount = 0;
    panels.forEach(p => {
      p.classList.toggle('show', expand);
      if (typeof p.setAttribute === 'function') {
        p.setAttribute('aria-hidden', expand ? 'false' : 'true');
      }
      affectedCount++;
    });
    buttons.forEach(b => {
      b.classList.toggle('expanded', expand);
      if (typeof b.setAttribute === 'function') {
        b.setAttribute('aria-expanded', expand ? 'true' : 'false');
      }
    });
    return {
      success: true,
      expanded: expand,
      count: affectedCount
    };
  },
  getPassage(gid, pIdx) {
    let p = null;
    if (this.groupsMap && this.groupsMap[gid]) {
      p = this.groupsMap[gid].groupPassages?.[pIdx] || null;
    } else {
      const q = (this.resultData?.detailedQuestions || []).find(x => x.groupId === gid || x.questionNumber === gid);
      p = q && q.groupPassages && q.groupPassages[pIdx] ? q.groupPassages[pIdx] : null;
    }
    if (p && typeof localStorage !== 'undefined' && !p._localLoaded) {
      try {
        let bName = this.resultData?.bookName || '';
        if (!bName && typeof this.resultData?.testTitle === 'string') {
          const match = this.resultData.testTitle.match(/^(EST\s+\d{4})/i);
          if (match) bName = match[1].toUpperCase();
        }
        if (!bName && typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const urlBook = params.get('book');
          if (urlBook) bName = urlBook.replace(/_/g, ' ');
        }
        const safeBook = (bName || 'EST_2022').replace(/\s+/g, '_');
        const testId = this.resultData?.testId || 1;
        const localKey = `toeic_coords_${safeBook}_test${testId}_${gid}_${pIdx}`;
        const saved = localStorage.getItem(localKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed.sentences) && parsed.sentences.length > 0) {
            p.sentences = parsed.sentences;
            if (parsed.customBadgeFontSize) p.customBadgeFontSize = parsed.customBadgeFontSize;
          }
        }
      } catch (_) {}
      p._localLoaded = true;
    }
    return p;
  },
  setupPassageOverlays(img, gid, pIdx, prefix = '') {
    const passage = this.getPassage(gid, pIdx);
    if (!passage || !passage.sentences || passage.sentences.length === 0) return;
    const layer = document.getElementById(`overlays_${prefix}${gid}_${pIdx}`);
    if (!layer) return;
    layer.innerHTML = '';
    const refW = passage.imageWidth || img.naturalWidth || 800;
    const refH = passage.imageHeight || img.naturalHeight || 1000;
    const applyProportionalBadgeScale = () => {
      const renderW = img.clientWidth || (typeof img.getBoundingClientRect === 'function' ? img.getBoundingClientRect().width : 0) || 360;
      let bFont = Math.max(5.5, Math.min(11, renderW * 0.0125));
      if (passage.customBadgeFontSize) {
        bFont = passage.customBadgeFontSize;
      }
      layer.style.setProperty('--badge-font', `${bFont.toFixed(2)}px`);
    };
    applyProportionalBadgeScale();
    if (typeof ResizeObserver !== 'undefined' && !img._badgeResizeObserver) {
      const ro = new ResizeObserver(() => applyProportionalBadgeScale());
      ro.observe(img);
      img._badgeResizeObserver = ro;
    }
    const renderWNow = img.clientWidth || (typeof img.getBoundingClientRect === 'function' ? img.getBoundingClientRect().width : 0) || 360;
    const isMobile = (typeof window !== 'undefined' && window.innerWidth <= 768) || renderWNow <= 480;
    passage.sentences.forEach((s, sIdx) => {
      const regions = s.regions || [];
      if (regions.length === 0) return;
      const firstR = regions[0];
      const rawLeftPct = (typeof firstR.xPct === 'number' && !isNaN(firstR.xPct))
        ? firstR.xPct
        : ((firstR.x0 / refW) * 100);
      const rawTopPct = (typeof firstR.yPct === 'number' && !isNaN(firstR.yPct))
        ? firstR.yPct
        : ((firstR.y1 / refH) * 100);
      const leftPct = Math.max(0.4, Math.min(97.5, rawLeftPct));
      const topPct = Math.max(0.8, Math.min(97.5, rawTopPct));
      const rawWordWPct = (firstR.x1 != null && firstR.x0 != null && firstR.x1 > firstR.x0)
        ? ((firstR.x1 - firstR.x0) / refW) * 100
        : (isMobile ? 5.2 : 3.8);
      const rawWordHPct = (firstR.y1 != null && firstR.y0 != null && firstR.y1 > firstR.y0)
        ? ((firstR.y1 - firstR.y0) / refH) * 100
        : (isMobile ? 2.8 : 2.1);
      const hitLeftPad = isMobile ? 0.9 : 0.45;
      const hitWidthPct = Math.max(isMobile ? 6.8 : 4.5, Math.min(16, rawWordWPct + (isMobile ? 2.2 : 1.1)));
      const hitUpPct = Math.max(isMobile ? 3.2 : 2.2, Math.min(7.5, rawWordHPct + (isMobile ? 0.8 : 0.4)));
      const hitDownPct = isMobile ? 2.0 : 1.3;
      const boxLeftPct = Math.max(0.2, leftPct - hitLeftPad);
      const boxTopPct = Math.max(0.2, topPct - hitUpPct);
      const boxWidthPct = Math.min(99.5 - boxLeftPct, hitWidthPct);
      const boxHeightPct = Math.min(99.5 - boxTopPct, hitUpPct + hitDownPct);
      const badge = document.createElement('button');
      badge.type = 'button';
      badge.className = `sentence-overlay-box sentence-num-marker sentence-box-${prefix}${gid}-${pIdx}-${sIdx}`;
      badge.style.left = `${boxLeftPct.toFixed(2)}%`;
      badge.style.top = `${boxTopPct.toFixed(2)}%`;
      badge.style.width = `${boxWidthPct.toFixed(2)}%`;
      badge.style.height = `${boxHeightPct.toFixed(2)}%`;
      const numSpan = document.createElement('span');
      numSpan.className = 'sentence-num-label';
      numSpan.textContent = `${sIdx + 1}`;
      badge.appendChild(numSpan);
      badge.title = `Câu ${sIdx + 1}: ${s.text || ''}`;
      badge.setAttribute('aria-label', `Câu ${sIdx + 1}`);
      badge.onclick = (e) => {
        e.stopPropagation();
        this.selectSentence(gid, pIdx, sIdx, prefix);
      };
      layer.appendChild(badge);
    });
  },
  handlePassageImageClick(event, img, gid, pIdx, prefix = '') {
    const passage = this.getPassage(gid, pIdx);
    if (!passage || !passage.sentences || !passage.sentences.length === 0) return;
    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const clickXPct = ((event.clientX - rect.left) / rect.width) * 100;
    const clickYPct = ((event.clientY - rect.top) / rect.height) * 100;
    const refW = passage.imageWidth || img.naturalWidth || rect.width;
    const refH = passage.imageHeight || img.naturalHeight || rect.height;
    const isMobile = (typeof window !== 'undefined' && window.innerWidth <= 768) || rect.width <= 480;
    let bestIdx = -1;
    let bestScore = Infinity;
    passage.sentences.forEach((s, idx) => {
      const firstR = s.regions && s.regions[0];
      if (!firstR) return;
      const sx0Pct = (typeof firstR.xPct === 'number' && !isNaN(firstR.xPct)) ? firstR.xPct : ((firstR.x0 / refW) * 100);
      const sy1Pct = (typeof firstR.yPct === 'number' && !isNaN(firstR.yPct)) ? firstR.yPct : ((firstR.y1 / refH) * 100);
      const wordWPct = (firstR.x1 != null && firstR.x0 != null && firstR.x1 > firstR.x0)
        ? ((firstR.x1 - firstR.x0) / refW) * 100
        : (isMobile ? 5.5 : 4.0);
      const wordHPct = (firstR.y1 != null && firstR.y0 != null && firstR.y1 > firstR.y0)
        ? ((firstR.y1 - firstR.y0) / refH) * 100
        : (isMobile ? 3.0 : 2.2);
      const minX = sx0Pct - (isMobile ? 2.4 : 1.5);
      const maxX = sx0Pct + Math.max(isMobile ? 7.5 : 5.0, wordWPct + (isMobile ? 2.5 : 1.5));
      const minY = sy1Pct - Math.max(isMobile ? 4.2 : 3.0, wordHPct + (isMobile ? 1.5 : 0.8));
      const maxY = sy1Pct + (isMobile ? 2.8 : 2.0);
      if (clickXPct >= minX && clickXPct <= maxX && clickYPct >= minY && clickYPct <= maxY) {
        const centerX = sx0Pct + wordWPct * 0.35;
        const centerY = sy1Pct - wordHPct * 0.25;
        const dist = Math.hypot(clickXPct - centerX, clickYPct - centerY);
        if (dist < bestScore) {
          bestScore = dist;
          bestIdx = idx;
        }
      }
    });
    if (bestIdx !== -1) {
      this.selectSentence(gid, pIdx, bestIdx, prefix);
    } else {
      this.closeSentenceCard(gid, pIdx, prefix);
    }
  },
  handleSentenceBtnClick(gid, pIdx, sIdx, prefix = 'lb_') {
    const card = document.getElementById(`sentence_card_${prefix}${gid}_${pIdx}`);
    const currentBtn = document.getElementById(`btn_${prefix}${gid}_${pIdx}_${sIdx}`);
    const isCurrentActive = currentBtn && currentBtn.classList.contains('active');
    const isCardVisible = card && card.style.display !== 'none';
    if (isCurrentActive && isCardVisible) {
      this.closeSentenceCard(gid, pIdx, prefix);
    } else {
      this.selectSentence(gid, pIdx, sIdx, prefix);
    }
  },
  selectSentence(gid, pIdx, sIdx, prefix = '') {
    const passage = this.getPassage(gid, pIdx);
    if (!passage || !passage.sentences || !passage.sentences[sIdx]) return;
    const s = passage.sentences[sIdx];
    const layer = document.getElementById(`overlays_${prefix}${gid}_${pIdx}`);
    if (layer && typeof layer.querySelectorAll === 'function') {
      layer.querySelectorAll('.sentence-overlay-box').forEach(b => b.classList.remove('active'));
      layer.querySelectorAll(`.sentence-box-${prefix}${gid}-${pIdx}-${sIdx}`).forEach(b => b.classList.add('active'));
    }
    const dock = document.getElementById(`sentence_dock_${prefix}${gid}_${pIdx}`);
    if (dock && typeof dock.querySelectorAll === 'function') {
      dock.querySelectorAll('.lightbox-sentence-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      const activeBtn = document.getElementById(`btn_${prefix}${gid}_${pIdx}_${sIdx}`);
      if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.setAttribute('aria-pressed', 'true');
        if (typeof activeBtn.scrollIntoView === 'function') {
          try {
            activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          } catch (_) {}
        }
      }
    }
    const card = document.getElementById(`sentence_card_${prefix}${gid}_${pIdx}`);
    const badge = document.getElementById(`sentence_badge_${prefix}${gid}_${pIdx}`);
    const en = document.getElementById(`sentence_en_${prefix}${gid}_${pIdx}`);
    const vi = document.getElementById(`sentence_vi_${prefix}${gid}_${pIdx}`);
    const note = document.getElementById(`sentence_note_${prefix}${gid}_${pIdx}`);
    if (card) {
      if (badge) badge.textContent = `Câu ${sIdx + 1} / ${passage.sentences.length}`;
      if (en) en.textContent = s.text || '';
      if (vi) vi.textContent = s.translation || 'Chưa có bản dịch cho câu này';
      if (note) {
        note.innerHTML = s.analysis ? this.formatSentenceAnalysis(s.analysis) : '';
        note.style.display = s.analysis ? 'block' : 'none';
      }
      if (!prefix && typeof document !== 'undefined') {
        document.querySelectorAll('.interactive-passage-container').forEach(el => {
          el.style.zIndex = '';
        });
        const passWrap = document.getElementById(`pass_wrap_${gid}_${pIdx}`);
        if (passWrap) passWrap.style.zIndex = '90';
        card.style.zIndex = '95';
        this.bindGlobalClickOutside();
      }
      const firstR = s.regions && s.regions[0];
      const refH = passage.imageHeight || 1000;
      const sy1Pct = firstR
        ? ((typeof firstR.yPct === 'number' && !isNaN(firstR.yPct)) ? firstR.yPct : ((firstR.y1 / refH) * 100))
        : 30;
      const sy0Pct = (firstR && firstR.y0 != null)
        ? ((firstR.y0 / refH) * 100)
        : Math.max(0, sy1Pct - 2.6);
      if (prefix === 'lb_') {
        card.style.top = 'calc(100% + 10px)';
        card.style.bottom = 'auto';
        card.style.maxHeight = '';
        if (typeof card.scrollIntoView === 'function') {
          try {
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          } catch (_) {}
        }
      } else {
        const isMobileView = (typeof window !== 'undefined' && window.innerWidth <= 768);
        const splitThreshold = isMobileView ? 50 : 25;
        if (sy0Pct < splitThreshold) {
          card.style.top = `calc(${Math.min(95, sy1Pct).toFixed(2)}% + 8px)`;
          card.style.bottom = 'auto';
          if (isMobileView) {
            card.style.maxHeight = `calc(${Math.max(46, 98 - sy1Pct).toFixed(0)}% + 18px)`;
          } else {
            card.style.maxHeight = '';
          }
        } else {
          card.style.top = 'auto';
          card.style.bottom = `calc(${Math.max(0, 100 - sy0Pct).toFixed(2)}% + 8px)`;
          if (isMobileView) {
            card.style.maxHeight = `calc(${Math.max(46, sy0Pct - 2).toFixed(0)}% - 10px)`;
          } else {
            card.style.maxHeight = '';
          }
        }
      }
      card.style.display = 'block';
      card.scrollTop = 0;
      if (!prefix && typeof window !== 'undefined' && typeof card.getBoundingClientRect === 'function') {
        setTimeout(() => {
          try {
            const cardRect = card.getBoundingClientRect();
            const navbar = document.querySelector('.navbar') || document.querySelector('.app-navbar');
            const filterBar = document.querySelector('.filter-tabs-bar');
            let headerH = 110;
            if (navbar && typeof navbar.getBoundingClientRect === 'function') {
              headerH = Math.max(headerH, (navbar.getBoundingClientRect().bottom || 48) + (filterBar ? (filterBar.getBoundingClientRect().height || 50) : 50));
            }
            if (cardRect.top < headerH + 10) {
              window.scrollBy({ top: cardRect.top - headerH - 16, behavior: 'smooth' });
            }
          } catch (_) {}
        }, 30);
      }
    }
  },
  closeSentenceCard(gid, pIdx, prefix = '') {
    const card = document.getElementById(`sentence_card_${prefix}${gid}_${pIdx}`);
    if (card) card.style.display = 'none';
    if (!prefix && typeof document !== 'undefined') {
      const passWrap = document.getElementById(`pass_wrap_${gid}_${pIdx}`);
      if (passWrap) passWrap.style.zIndex = '';
    }
    const layer = document.getElementById(`overlays_${prefix}${gid}_${pIdx}`);
    if (layer && typeof layer.querySelectorAll === 'function') {
      layer.querySelectorAll('.sentence-overlay-box').forEach(b => b.classList.remove('active'));
    }
    const dock = document.getElementById(`sentence_dock_${prefix}${gid}_${pIdx}`);
    if (dock && typeof dock.querySelectorAll === 'function') {
      dock.querySelectorAll('.lightbox-sentence-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
    }
  },
  closeAllSentenceCards() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('.sentence-lookup-card').forEach(c => {
      c.style.display = 'none';
    });
    document.querySelectorAll('.interactive-passage-container').forEach(el => {
      el.style.zIndex = '';
    });
    document.querySelectorAll('.sentence-overlay-box.active').forEach(b => {
      b.classList.remove('active');
    });
    document.querySelectorAll('.lightbox-sentence-btn.active').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
  },
  bindGlobalClickOutside() {
    if (this._clickOutsideBound || typeof document === 'undefined') return;
    this._clickOutsideBound = true;
    document.addEventListener('click', (e) => {
      const openCards = document.querySelectorAll('.sentence-lookup-card:not([style*="display: none"])');
      if (!openCards || openCards.length === 0) return;
      const targetEl = (typeof Element !== 'undefined' && e.target instanceof Element) ? e.target : (e.target && e.target.parentElement) || e.target;
      if (!targetEl) return;
      if (targetEl.closest && targetEl.closest('.sentence-lookup-card')) {
        return;
      }
      if (targetEl.closest && (targetEl.closest('.lightbox-sentence-btn') || targetEl.closest('.sentence-overlay-box'))) {
        return;
      }
      this.closeAllSentenceCards();
    });
  },
  openPassageLightbox(gid, pIdx, url) {
    const opened = UIRenderer.openLightbox(url);
    if (!opened || typeof document === 'undefined') return opened;
    const modal = document.getElementById('image-lightbox-modal');
    if (!modal || typeof modal.querySelector !== 'function') return opened;
    const imgEl = modal.querySelector('#lightbox-modal-img');
    const container = modal.querySelector('.lightbox-img-container') || (imgEl && imgEl.parentElement);
    if (!imgEl || !container || typeof document.createElement !== 'function') return opened;
    const prevDock = modal.querySelector('.lightbox-sentence-dock');
    if (prevDock && typeof prevDock.remove === 'function') prevDock.remove();
    const prevToolbar = modal.querySelector('.lightbox-coord-toolbar');
    if (prevToolbar && typeof prevToolbar.remove === 'function') prevToolbar.remove();
    if (this.isCoordEditAuthorized()) {
      const passage = this.getPassage(gid, pIdx);
      if (passage && Array.isArray(passage.sentences) && passage.sentences.length > 0) {
        const toolbar = document.createElement('div');
        toolbar.className = 'lightbox-coord-toolbar';
        toolbar.id = `coord_toolbar_lb_${gid}_${pIdx}`;
        toolbar.setAttribute('role', 'toolbar');
        toolbar.setAttribute('aria-label', 'Công cụ điều chỉnh tọa độ ô số');
        toolbar.onclick = (e) => e.stopPropagation();
        toolbar.innerHTML = `
          <div class="coord-toolbar-row coord-arrows-row">
            <button type="button" class="coord-tool-btn coord-arrow-btn" onclick="ResultViewer.shiftPassageCoords('${gid}', ${pIdx}, -0.3, 0)" title="Dịch toàn bộ sang trái 0.3%" aria-label="Dịch sang trái">◀</button>
            <button type="button" class="coord-tool-btn coord-arrow-btn" onclick="ResultViewer.shiftPassageCoords('${gid}', ${pIdx}, 0, -0.3)" title="Dịch toàn bộ lên trên 0.3%" aria-label="Dịch lên trên">▲</button>
            <button type="button" class="coord-tool-btn coord-arrow-btn" onclick="ResultViewer.shiftPassageCoords('${gid}', ${pIdx}, 0, 0.3)" title="Dịch toàn bộ xuống dưới 0.3%" aria-label="Dịch xuống dưới">▼</button>
            <button type="button" class="coord-tool-btn coord-arrow-btn" onclick="ResultViewer.shiftPassageCoords('${gid}', ${pIdx}, 0.3, 0)" title="Dịch toàn bộ sang phải 0.3%" aria-label="Dịch sang phải">▶</button>
          </div>
          <div class="coord-toolbar-row coord-actions-row">
            <button type="button" class="coord-tool-btn font-btn" onclick="ResultViewer.adjustPassageBadgeFont('${gid}', ${pIdx}, -0.5)" title="Giảm cỡ chữ số" aria-label="Giảm cỡ chữ số">A-</button>
            <button type="button" class="coord-tool-btn font-btn" onclick="ResultViewer.adjustPassageBadgeFont('${gid}', ${pIdx}, 0.5)" title="Tăng cỡ chữ số" aria-label="Tăng cỡ chữ số">A+</button>
            <span class="coord-offset-badge" id="coord_badge_lb_${gid}_${pIdx}">Δ: 0%</span>
            <button type="button" class="coord-tool-btn save-btn" id="btn_save_coords_lb_${gid}_${pIdx}" onclick="ResultViewer.savePassageCoords('${gid}', ${pIdx})" title="Lưu tọa độ mới vào DB">💾 Lưu</button>
            <button type="button" class="coord-tool-btn reset-btn" onclick="ResultViewer.resetPassageCoords('${gid}', ${pIdx})" title="Hoàn tác về ban đầu" aria-label="Hoàn tác">↺</button>
          </div>
        `;
        if (typeof container.insertAdjacentElement === 'function') {
          container.insertAdjacentElement('afterend', toolbar);
        } else {
          modal.appendChild(toolbar);
        }
      }
    }
    const overlaysLayer = document.createElement('div');
    overlaysLayer.className = 'passage-overlays-layer lightbox-passage-overlays';
    overlaysLayer.id = `overlays_lb_${gid}_${pIdx}`;
    container.appendChild(overlaysLayer);
    const popover = document.createElement('div');
    popover.className = 'sentence-lookup-card sentence-floating-popover lightbox-sentence-popover';
    popover.id = `sentence_card_lb_${gid}_${pIdx}`;
    popover.style.display = 'none';
    popover.onclick = (e) => e.stopPropagation();
    popover.innerHTML = `
      <div class="sentence-lookup-header">
        <span class="sentence-badge" id="sentence_badge_lb_${gid}_${pIdx}">Câu 1</span>
        <button type="button" class="sentence-close-btn" onclick="ResultViewer.closeSentenceCard('${gid}', ${pIdx}, 'lb_')">&times;</button>
      </div>
      <div class="sentence-text-en" id="sentence_en_lb_${gid}_${pIdx}"></div>
      <div class="sentence-text-vi" id="sentence_vi_lb_${gid}_${pIdx}"></div>
      <div class="sentence-text-note" id="sentence_note_lb_${gid}_${pIdx}"></div>
    `;
    container.appendChild(popover);
    const passage = this.getPassage(gid, pIdx);
    if (passage && Array.isArray(passage.sentences) && passage.sentences.length > 0) {
      const dock = document.createElement('div');
      dock.className = 'lightbox-sentence-dock';
      dock.id = `sentence_dock_lb_${gid}_${pIdx}`;
      dock.setAttribute('role', 'toolbar');
      dock.setAttribute('aria-label', 'Danh sách câu bài đọc');
      dock.onclick = (e) => e.stopPropagation();
      passage.sentences.forEach((s, sIdx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lightbox-sentence-btn';
        btn.id = `btn_lb_${gid}_${pIdx}_${sIdx}`;
        btn.setAttribute('data-sidx', `${sIdx}`);
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('aria-label', `Xem dịch và giải thích câu ${sIdx + 1}`);
        btn.textContent = `Câu ${sIdx + 1}`;
        btn.onclick = (e) => {
          e.stopPropagation();
          this.handleSentenceBtnClick(gid, pIdx, sIdx, 'lb_');
        };
        dock.appendChild(btn);
      });
      modal.appendChild(dock);
    }
    const bindOverlays = () => {
      this.setupPassageOverlays(imgEl, gid, pIdx, 'lb_');
    };
    imgEl.onload = bindOverlays;
    if (imgEl.complete) {
      setTimeout(bindOverlays, 0);
    }
    imgEl.onclick = (e) => {
      e.stopPropagation();
      this.handlePassageImageClick(e, imgEl, gid, pIdx, 'lb_');
    };
    return true;
  },
  openLightbox(url) {
    UIRenderer.openLightbox(url);
  },
  closeLightbox() {
    UIRenderer.closeLightbox();
  },
  isCoordEditAuthorized() {
    if (typeof window === 'undefined') return false;
    try {
      const p = new URLSearchParams(window.location.search);
      return p.get('pass') === '1231aA';
    } catch (_) {
      return false;
    }
  },
  shiftPassageCoords(gid, pIdx, dX, dY) {
    const passage = this.getPassage(gid, pIdx);
    if (!passage || !Array.isArray(passage.sentences)) return;
    if (!passage._origSentences) {
      passage._origSentences = JSON.parse(JSON.stringify(passage.sentences));
    }
    passage._shiftX = Number(((passage._shiftX || 0) + dX).toFixed(2));
    passage._shiftY = Number(((passage._shiftY || 0) + dY).toFixed(2));
    const refW = passage.imageWidth || 800;
    const refH = passage.imageHeight || 1000;
    passage.sentences.forEach(s => {
      if (!Array.isArray(s.regions)) return;
      s.regions.forEach(r => {
        if (!r) return;
        if (typeof r.xPct === 'number' && !isNaN(r.xPct)) {
          r.xPct = Number((r.xPct + dX).toFixed(2));
        }
        if (typeof r.yPct === 'number' && !isNaN(r.yPct)) {
          r.yPct = Number((r.yPct + dY).toFixed(2));
        }
        if (r.x0 != null) r.x0 = Math.round(r.x0 + (dX / 100) * refW);
        if (r.x1 != null) r.x1 = Math.round(r.x1 + (dX / 100) * refW);
        if (r.y0 != null) r.y0 = Math.round(r.y0 + (dY / 100) * refH);
        if (r.y1 != null) r.y1 = Math.round(r.y1 + (dY / 100) * refH);
      });
    });
    if (typeof document !== 'undefined') {
      const imgEl = document.querySelector('#lightbox-modal-img');
      if (imgEl) this.setupPassageOverlays(imgEl, gid, pIdx, 'lb_');
      const bgImg = document.getElementById(`img_${gid}_${pIdx}`);
      if (bgImg) this.setupPassageOverlays(bgImg, gid, pIdx, '');
      this.updateCoordBadge(gid, pIdx);
    }
  },
  adjustPassageBadgeFont(gid, pIdx, deltaPx) {
    const passage = this.getPassage(gid, pIdx);
    if (!passage) return;
    const current = passage.customBadgeFontSize || 7.5;
    const nextFont = Math.max(4.5, Math.min(14, Number((current + deltaPx).toFixed(1))));
    passage.customBadgeFontSize = nextFont;
    if (typeof document !== 'undefined') {
      const layer = document.getElementById(`overlays_lb_${gid}_${pIdx}`);
      if (layer) layer.style.setProperty('--badge-font', `${nextFont}px`);
      const bgLayer = document.getElementById(`overlays_${gid}_${pIdx}`);
      if (bgLayer) bgLayer.style.setProperty('--badge-font', `${nextFont}px`);
      this.updateCoordBadge(gid, pIdx);
    }
  },
  updateCoordBadge(gid, pIdx) {
    if (typeof document === 'undefined') return;
    const passage = this.getPassage(gid, pIdx);
    const b = document.getElementById(`coord_badge_lb_${gid}_${pIdx}`);
    if (!b || !passage) return;
    const sX = passage._shiftX || 0;
    const sY = passage._shiftY || 0;
    const fStr = passage.customBadgeFontSize ? ` | ${passage.customBadgeFontSize}px` : '';
    b.textContent = `X:${sX > 0 ? '+' : ''}${sX}% Y:${sY > 0 ? '+' : ''}${sY}%${fStr}`;
  },
  resetPassageCoords(gid, pIdx) {
    const passage = this.getPassage(gid, pIdx);
    if (!passage || !passage._origSentences) return;
    passage.sentences = JSON.parse(JSON.stringify(passage._origSentences));
    passage._shiftX = 0;
    passage._shiftY = 0;
    passage.customBadgeFontSize = null;
    if (typeof document !== 'undefined') {
      const imgEl = document.querySelector('#lightbox-modal-img');
      if (imgEl) this.setupPassageOverlays(imgEl, gid, pIdx, 'lb_');
      const bgImg = document.getElementById(`img_${gid}_${pIdx}`);
      if (bgImg) this.setupPassageOverlays(bgImg, gid, pIdx, '');
      const b = document.getElementById(`coord_badge_lb_${gid}_${pIdx}`);
      if (b) b.textContent = 'Δ: 0%';
    }
    this.showToast('↺ Đã hoàn tác về tọa độ ban đầu');
  },
  async savePassageCoords(gid, pIdx) {
    const passage = this.getPassage(gid, pIdx);
    if (!passage || !Array.isArray(passage.sentences)) return false;
    let bookName = this.resultData?.bookName || '';
    if (!bookName && typeof this.resultData?.testTitle === 'string') {
      const match = this.resultData.testTitle.match(/^(EST\s+\d{4})/i);
      if (match) bookName = match[1].toUpperCase();
    }
    if (!bookName && typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      const urlBook = p.get('book');
      if (urlBook) bookName = urlBook.replace(/_/g, ' ');
    }
    if (!bookName) bookName = 'EST 2026';
    let testId = Number(this.resultData?.testId || 1);
    if (isNaN(testId) && typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      const urlTest = parseInt(p.get('test'), 10);
      if (!isNaN(urlTest)) testId = urlTest;
    }
    const saveBtn = (typeof document !== 'undefined') ? document.getElementById(`btn_save_coords_lb_${gid}_${pIdx}`) : null;
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '⏳ Đang lưu...';
    }
    try {
      const safeBook = bookName.replace(/\s+/g, '_');
      const localKey = `toeic_coords_${safeBook}_test${testId}_${gid}_${pIdx}`;
      localStorage.setItem(localKey, JSON.stringify({
        sentences: passage.sentences,
        customBadgeFontSize: passage.customBadgeFontSize || null,
        updatedAt: new Date().toISOString()
      }));
    } catch (_) {}
    try {
      const res = await fetch('/api/save-passage-coords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pass: '1231aA',
          bookName,
          testId,
          groupId: gid,
          passageIdx: pIdx,
          sentences: passage.sentences,
          customBadgeFontSize: passage.customBadgeFontSize || null
        })
      });
      const data = await res.json();
      if (data && data.ok) {
        if (saveBtn) {
          saveBtn.textContent = '✅ Đã lưu!';
          setTimeout(() => {
            saveBtn.textContent = '💾 Lưu';
            saveBtn.disabled = false;
          }, 2000);
        }
        this.showToast('✅ Đã lưu tọa độ mới vào DB thành công!');
        return true;
      } else {
        throw new Error(data?.error || 'Lỗi server');
      }
    } catch (err) {
      if (saveBtn) {
        saveBtn.textContent = '💾 Đã lưu Local';
        setTimeout(() => {
          saveBtn.textContent = '💾 Lưu';
          saveBtn.disabled = false;
        }, 2000);
      }
      this.showToast('💾 Đã lưu vào LocalStorage (Chế độ static / offline)');
      return false;
    }
  },
  showToast(message, duration = 3000) {
    if (typeof document === 'undefined') return;
    let toast = document.getElementById('toeic-app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toeic-app-toast';
      toast.className = 'toeic-app-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    if (toast && toast.classList) toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      if (toast && toast.classList) toast.classList.remove('show');
    }, duration);
  },
  async rehydrateExplanationsFromDB() {
    if (!this.resultData || !Array.isArray(this.resultData.detailedQuestions)) return false;
    try {
      const config = this._getConfig();
      let targetBook = this.resultData?.bookName || '';
      if (!targetBook && typeof this.resultData?.testTitle === 'string') {
        const titleMatch = this.resultData.testTitle.match(/^(EST\s+\d{4})/i);
        if (titleMatch) targetBook = titleMatch[1].toUpperCase();
      }
      if (!targetBook && Array.isArray(this.resultData?.detailedQuestions)) {
        const has2026 = this.resultData.detailedQuestions.some(q =>
          (q?.imageUrl && String(q.imageUrl).includes('EST 2026')) ||
          (q?.groupImage && String(q.groupImage).includes('EST 2026')) ||
          (q?.audioUrl && String(q.audioUrl).includes('EST 2026'))
        );
        const has2024 = this.resultData.detailedQuestions.some(q =>
          (q?.imageUrl && String(q.imageUrl).includes('EST 2024')) ||
          (q?.groupImage && String(q.groupImage).includes('EST 2024')) ||
          (q?.audioUrl && String(q.audioUrl).includes('EST 2024'))
        );
        const has2023 = this.resultData.detailedQuestions.some(q =>
          (q?.imageUrl && String(q.imageUrl).includes('EST 2023')) ||
          (q?.groupImage && String(q.groupImage).includes('EST 2023')) ||
          (q?.audioUrl && String(q.audioUrl).includes('EST 2023'))
        );
        if (has2026) targetBook = 'EST 2026';
        else if (has2024) targetBook = 'EST 2024';
        else if (has2023) targetBook = 'EST 2023';
      }
      const rawId = this.resultData?.testId;
      let currentTestId = 1;
      if (typeof rawId === 'number' && Number.isFinite(rawId)) {
        currentTestId = Math.min(10, Math.max(1, Math.floor(rawId)));
      } else if (rawId !== null && rawId !== undefined) {
        const match = String(rawId).match(/\d+/);
        if (match) {
          const parsed = parseInt(match[0], 10);
          if (!isNaN(parsed)) {
            currentTestId = Math.min(10, Math.max(1, parsed));
          }
        }
      }
      const url = (config && typeof config.getDatabaseUrl === 'function')
        ? (targetBook ? config.getDatabaseUrl(targetBook) : config.getDatabaseUrl())
        : 'data/database_compiled.json';
      const db = await this._fetchDatabase(url, currentTestId, targetBook);
      if (!db) return false;
      const tests = db.tests || (Array.isArray(db) ? db : [db]);
      const test = tests.find(t => {
        if (!t) return false;
        const rawTid = t.testId !== undefined ? t.testId : t.id;
        let tid = null;
        if (typeof rawTid === 'number') {
          tid = rawTid;
        } else if (rawTid !== null && rawTid !== undefined) {
          const m = String(rawTid).match(/\d+/);
          if (m) tid = parseInt(m[0], 10);
        }
        return tid === currentTestId;
      }) || (rawId === null || rawId === undefined ? tests[0] : null);
      if (!test) {
        console.warn(`Rehydrate: Test ${currentTestId} not found in database`);
        return false;
      }
      const qMap = {};
      const gMap = {};
      const qGroupMap = {};
      const scanPart = (partObj) => {
        if (!partObj) return;
        if (Array.isArray(partObj)) {
          if (partObj.length > 0 && partObj[0] && Array.isArray(partObj[0].questions)) {
            partObj.forEach(g => {
              if (g.groupId) gMap[g.groupId] = g;
              (g.questions || []).forEach(q => {
                qGroupMap[q.questionNumber] = g;
                qMap[q.questionNumber] = q;
              });
            });
          } else {
            partObj.forEach(q => {
              if (q && q.questionNumber !== undefined) qMap[q.questionNumber] = q;
            });
          }
          return;
        }
        if (partObj.questions) {
          partObj.questions.forEach(q => { qMap[q.questionNumber] = q; });
        }
        if (partObj.groups) {
          partObj.groups.forEach(g => {
            if (g.groupId) gMap[g.groupId] = g;
            (g.questions || []).forEach(q => {
              qGroupMap[q.questionNumber] = g;
              qMap[q.questionNumber] = q;
            });
          });
        }
      };
      if (test.listening) {
        scanPart(test.listening.part1);
        scanPart(test.listening.part2);
        scanPart(test.listening.part3);
        scanPart(test.listening.part4);
      }
      if (test.reading) {
        scanPart(test.reading.part5);
        scanPart(test.reading.part6);
        scanPart(test.reading.part7);
      }
      let hasUpdates = false;
      let hasScoreUpdates = false;
      const safeClone = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        try {
          return JSON.parse(JSON.stringify(obj, (k, v) => (k === '_parentGroup' ? undefined : v)));
        } catch (_) {
          return Array.isArray(obj) ? [...obj] : { ...obj };
        }
      };
      const synthFromSentences = (sentences) => Array.isArray(sentences)
        ? sentences.filter(s => s && s.translation).map(s => (s.speaker ? `[${s.speaker}] ${s.translation}` : s.translation)).join('\n')
        : '';
      const synthFromPassages = (passages) => Array.isArray(passages)
        ? passages.flatMap(p => Array.isArray(p?.sentences) ? p.sentences.map(s => s?.translation).filter(Boolean) : []).join('\n')
        : '';
      const questions = Array.isArray(this.resultData?.detailedQuestions) ? this.resultData.detailedQuestions : [];
      if (questions.length === 0) return false;
      questions.forEach(q => {
        if (!q || typeof q !== 'object') return;
        if ('_parentGroup' in q) {
          try { delete q._parentGroup; } catch (_) {}
        }
        const freshQ = qMap[q.questionNumber];
        if (freshQ) {
          if (freshQ.options) {
            const freshOptsStr = JSON.stringify(freshQ.options, (k, v) => k === '_parentGroup' ? undefined : v);
            if (JSON.stringify(q.options, (k, v) => k === '_parentGroup' ? undefined : v) !== freshOptsStr) {
              q.options = safeClone(freshQ.options);
              hasUpdates = true;
            }
          }
          if (freshQ.questionText && q.questionText !== freshQ.questionText) {
            q.questionText = freshQ.questionText;
            hasUpdates = true;
          }
          if (freshQ.imageUrl && q.imageUrl !== freshQ.imageUrl) {
            q.imageUrl = freshQ.imageUrl;
            hasUpdates = true;
          }
          if (freshQ.audioUrl && (q.audioUrl !== freshQ.audioUrl || /TEST_\d+\.mp3|Test\d+\.mp3/i.test(q.audioUrl))) {
            q.audioUrl = freshQ.audioUrl;
            hasUpdates = true;
          }
          if (freshQ.explanation && q.explanation !== freshQ.explanation) {
            q.explanation = freshQ.explanation;
            hasUpdates = true;
          }
          if (freshQ.analysis && q.analysis !== freshQ.analysis) {
            q.analysis = freshQ.analysis;
            hasUpdates = true;
          }
          if (freshQ.tips && q.tips !== freshQ.tips) {
            q.tips = freshQ.tips;
            hasUpdates = true;
          }
          const freshTrans = freshQ.translation || freshQ.questionTranslation || '';
          if (freshTrans && q.translation !== freshTrans) {
            q.translation = freshTrans;
            hasUpdates = true;
          }
          if (freshQ.optionsTranslation) {
            const freshOptTransStr = JSON.stringify(freshQ.optionsTranslation, (k, v) => k === '_parentGroup' ? undefined : v);
            if (JSON.stringify(q.optionsTranslation, (k, v) => k === '_parentGroup' ? undefined : v) !== freshOptTransStr) {
              q.optionsTranslation = safeClone(freshQ.optionsTranslation);
              hasUpdates = true;
            }
          }
          const freshCorrect = freshQ.correctAnswer || freshQ.correctChoice;
          if (freshCorrect) {
            if (q.correctChoice !== freshCorrect) {
              q.correctChoice = freshCorrect;
              hasUpdates = true;
            }
            const cleanUser = q.userChoice ? String(q.userChoice).trim().toUpperCase() : '';
            const cleanCorrect = String(freshCorrect).trim().toUpperCase();
            const newIsCorrect = Boolean(cleanUser && cleanCorrect && cleanUser === cleanCorrect);
            if (q.isCorrect !== newIsCorrect) {
              q.isCorrect = newIsCorrect;
              hasScoreUpdates = true;
              hasUpdates = true;
            }
          }
        }
        const freshG = (q.groupId && gMap[q.groupId]) || qGroupMap[q.questionNumber];
        if (freshG) {
          if (freshG.groupId && q.groupId !== freshG.groupId) {
            q.groupId = freshG.groupId;
            hasUpdates = true;
          }
          const groupImg = freshG.imageUrl || freshG.image || freshG.graphicUrl || (freshG.graphic && freshG.graphic.url) || (freshG.passages && freshG.passages[0] && freshG.passages[0].imageUrl) || '';
          if (groupImg) {
            if (!q.imageUrl || q.imageUrl !== groupImg) {
              q.imageUrl = groupImg;
              hasUpdates = true;
            }
            if (!q.groupImage || q.groupImage !== groupImg) {
              q.groupImage = groupImg;
              hasUpdates = true;
            }
          }
          if (freshG.passages && freshG.passages.length > 0) {
            const freshPassagesStr = JSON.stringify(freshG.passages, (k, v) => k === '_parentGroup' ? undefined : v);
            if (!q.groupPassages || q.groupPassages.length === 0 || JSON.stringify(q.groupPassages, (k, v) => k === '_parentGroup' ? undefined : v) !== freshPassagesStr) {
              q.groupPassages = safeClone(freshG.passages);
              hasUpdates = true;
            }
          } else if (groupImg && (!q.groupPassages || q.groupPassages.length === 0)) {
            q.groupPassages = [{ imageUrl: groupImg }];
            hasUpdates = true;
          }
          if (freshG.sentences && freshG.sentences.length > 0) {
            const freshSentStr = JSON.stringify(freshG.sentences);
            if (!q.groupSentences || JSON.stringify(q.groupSentences) !== freshSentStr) {
              q.groupSentences = safeClone(freshG.sentences);
              hasUpdates = true;
            }
          }
          if (freshG.expectedRange && (!q.expectedRange || q.expectedRange[0] !== freshG.expectedRange[0])) {
            q.expectedRange = Array.isArray(freshG.expectedRange) ? [...freshG.expectedRange] : freshG.expectedRange;
            hasUpdates = true;
          }
          if (freshG.audioUrl && (!q.audioUrl || !q.groupAudioUrl || /TEST_\d+\.mp3|Test\d+\.mp3/i.test(q.audioUrl) || /TEST_\d+\.mp3|Test\d+\.mp3/i.test(q.groupAudioUrl))) {
            q.audioUrl = freshG.audioUrl;
            q.groupAudioUrl = freshG.audioUrl;
            hasUpdates = true;
          }
          const freshGTrans = freshG.passageTranslation || freshG.translation || synthFromSentences(freshG.sentences) || synthFromPassages(freshG.passages) || '';
          if (freshGTrans && q.groupTranslation !== freshGTrans) {
            q.groupTranslation = freshGTrans;
            hasUpdates = true;
          }
          if (freshG.transcript && q.groupTranscript !== freshG.transcript) {
            q.groupTranscript = freshG.transcript;
            hasUpdates = true;
          }
        }
      });
      if (hasScoreUpdates) {
        let totalCorrect = 0;
        let lcCorrect = 0;
        let rcCorrect = 0;
        const partsConfig = (config && config.PARTS) ? config.PARTS : {};
        const partStats = {};
        Object.keys(partsConfig).forEach(k => {
          partStats[k] = { correct: 0, total: partsConfig[k]?.count || 0, answered: 0 };
        });
        questions.forEach(qItem => {
          const partInfo = (config && typeof config.getPartByQuestionNum === 'function')
            ? config.getPartByQuestionNum(qItem.questionNumber)
            : null;
          const pKey = partInfo ? partInfo.key : (qItem.part || '');
          const sec = partInfo?.section || (qItem.questionNumber <= 100 ? 'listening' : 'reading');
          if (!partStats[pKey]) {
            partStats[pKey] = { correct: 0, total: partsConfig[pKey]?.count || 0, answered: 0 };
          }
          if (qItem.userChoice) partStats[pKey].answered++;
          if (qItem.isCorrect) {
            totalCorrect++;
            partStats[pKey].correct++;
            if (sec === 'listening') lcCorrect++;
            else rcCorrect++;
          }
        });
        this.resultData.totalCorrect = totalCorrect;
        this.resultData.correctCountLC = lcCorrect;
        this.resultData.correctCountRC = rcCorrect;
        const totalQ = this.resultData.totalQuestions || this.resultData.detailedQuestions.length;
        this.resultData.accuracyRate = totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : 0;
        this.resultData.partStats = partStats;
        const appCfg = (config && typeof config.calculateListeningScore === 'function')
          ? config
          : (typeof AppConfig !== 'undefined' ? AppConfig : null);
        const isPartMode = this.resultData.mode === 'part';
        const calcLC = (appCfg && typeof appCfg.calculateListeningScore === 'function')
          ? appCfg.calculateListeningScore.bind(appCfg)
          : (c) => Math.min(495, Math.max(5, Math.round((c * 4.95) / 5) * 5));
        const calcRC = (appCfg && typeof appCfg.calculateReadingScore === 'function')
          ? appCfg.calculateReadingScore.bind(appCfg)
          : (c) => Math.min(495, Math.max(5, Math.round((c * 4.95) / 5) * 5));
        if (!isPartMode) {
          this.resultData.scaledLC = calcLC(lcCorrect);
          this.resultData.scaledRC = calcRC(rcCorrect);
          this.resultData.totalScore = (this.resultData.scaledLC || 0) + (this.resultData.scaledRC || 0);
        } else {
          const pFilter = this.resultData.partFilter;
          const partSec = (partsConfig[pFilter] && partsConfig[pFilter].section)
            ? partsConfig[pFilter].section
            : (['part1', 'part2', 'part3', 'part4'].includes(pFilter) ? 'listening' : 'reading');
          if (partSec === 'listening') {
            this.resultData.scaledLC = calcLC(totalCorrect);
            this.resultData.totalScore = this.resultData.scaledLC;
          } else {
            this.resultData.scaledRC = calcRC(totalCorrect);
            this.resultData.totalScore = this.resultData.scaledRC;
          }
        }
        if (typeof this.renderSummary === 'function') {
          try { this.renderSummary(); } catch (_) {}
        }
        if (typeof this.updateFilterCounts === 'function') {
          try { this.updateFilterCounts(); } catch (_) {}
        }
      }
      if (hasUpdates || hasScoreUpdates) {
        (this.resultData.detailedQuestions || []).forEach(q => {
          if (q && '_parentGroup' in q) {
            try { delete q._parentGroup; } catch (_) {}
          }
        });
        const storage = this._getStorage();
        if (storage && typeof storage.setCurrentResult === 'function') {
          try { storage.setCurrentResult(this.resultData); } catch (_) {}
        }
      }
      return true;
    } catch (e) {
      console.warn('Rehydrate explanations skipped:', e);
      return false;
    }
  },
  formatDialogue(text) {
    if (!text) return '';
    const lines = text.split('\n');
    return lines.map(rawLine => {
      const line = rawLine.trim();
      if (!line) return '';
      const m = line.match(/^(?:\[((?:Man|Woman|Male|Female|Speaker|Narrator|Người đàn ông|Người phụ nữ)(?:\s+\d+)?)\]:?\s*|((?:Man|Woman|Male|Female|Speaker|Narrator|Người đàn ông|Người phụ nữ)(?:\s+\d+)?):\s*)(.*)$/i);
      if (m) {
        const spk = m[1] || m[2];
        const content = m[3];
        const spkLower = spk.toLowerCase();
        const isWoman = spkLower.includes('woman') || spkLower.includes('female') || spkLower.includes('phụ nữ');
        const isMan = !isWoman && (spkLower.includes('man') || spkLower.includes('male') || spkLower.includes('đàn ông'));
        const badgeClass = isMan ? 'speaker-badge-man' : 'speaker-badge-woman';
        const icon = isMan ? '👨' : '👩';
        return `<div class="dialogue-line"><span class="speaker-badge ${badgeClass}">${icon} ${spk}</span><span class="dialogue-content">${content}</span></div>`;
      }
      return `<div class="dialogue-line">${line}</div>`;
    }).join('');
  }
};
if (typeof window !== 'undefined') {
  window.ResultViewer = ResultViewer;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ResultViewer;
}