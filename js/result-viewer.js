// ==========================================================================
// TOEIC MASTER — result-viewer.js
// Result Calculation, Score Overview, and Collapsible Explanations (Accordion)
// ==========================================================================

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

  async _fetchDatabase(url) {
    if (!url) return null;
    let db = null;
    if (typeof fetch === 'function') {
      try {
        const res = await fetch(url);
        if (res && res.ok) {
          db = await res.json();
          return db;
        }
      } catch (fetchErr) {
        // Fallback for Node.js test environment where fetch cannot resolve relative URL
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

  async init(customSearch = null) {
    const searchStr = (typeof customSearch === 'string')
      ? customSearch
      : ((typeof window !== 'undefined' && window.location && window.location.search) ? window.location.search : '');
    const urlParams = new URLSearchParams(searchStr);
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

    if (urlResultId && storage && typeof storage.getExamHistory === 'function') {
      const history = storage.getExamHistory();
      const match = Array.isArray(history) ? history.find(h => h && h.id === urlResultId) : null;
      if (match) {
        this.resultData = match;
      }
    }

    if (!this.resultData && urlTestId && storage) {
      const current = (typeof storage.getCurrentResult === 'function') ? storage.getCurrentResult() : null;
      if (current && parseInt(current.testId, 10) === urlTestId) {
        this.resultData = current;
      } else if (typeof storage.getExamHistory === 'function') {
        const history = storage.getExamHistory();
        const match = Array.isArray(history) ? history.find(h => h && parseInt(h.testId, 10) === urlTestId) : null;
        if (match) {
          this.resultData = match;
        }
      }
    }

    if (!this.resultData && storage && typeof storage.getCurrentResult === 'function') {
      this.resultData = storage.getCurrentResult();
    }

    // If user requested a specific ?test=N and current resultData does not match, or if no resultData:
    if (urlTestId && (!this.resultData || parseInt(this.resultData.testId, 10) !== urlTestId)) {
      await this.loadReviewModeFromDB(urlTestId);
    }

    if (!this.resultData) {
      console.warn('Không tìm thấy kết quả bài thi. Đang chuyển về trang chủ...');
      if (typeof window !== 'undefined' && window.location) {
        try { window.location.href = 'index.html'; } catch (_) {}
      }
      return false;
    }

    const urlPart = urlParams.get('part');
    if (urlPart && /^part[1-7]$/i.test(urlPart.trim())) {
      this.currentPartFilter = urlPart.trim().toLowerCase();
    } else if (this.resultData && this.resultData.mode === 'part' && this.resultData.partFilter) {
      this.currentPartFilter = String(this.resultData.partFilter).toLowerCase();
    } else if (this.currentPartFilter === 'all') {
      this.currentPartFilter = 'part1';
    }

    if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
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

    if (typeof this.renderSummary === 'function') this.renderSummary();
    if (typeof this.updateFilterCounts === 'function') this.updateFilterCounts();

    // CRITICAL: Always rehydrate full media (images, audio, passages) and clean explanations before render
    if (typeof this.rehydrateExplanationsFromDB === 'function') await this.rehydrateExplanationsFromDB();
    if (typeof this.renderDetailedReview === 'function') this.renderDetailedReview();
    return true;
  },

  async loadReviewModeFromDB(testId) {
    try {
      const clampedId = (Number.isFinite(testId) && testId >= 1 && testId <= 10) ? Math.floor(testId) : 1;
      const config = this._getConfig();
      const storage = this._getStorage();
      const url = (config && typeof config.getDatabaseUrl === 'function')
        ? config.getDatabaseUrl()
        : 'data/database_compiled.json';
      const db = await this._fetchDatabase(url);
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

      // Part 1
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

      // Part 2
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

      // Part 3
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

      // Part 4
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

      // Part 5
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

      // Part 6
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

      // Part 7
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

      const currentBook = (config && typeof config.getSelectedBook === 'function')
        ? config.getSelectedBook()
        : 'EST 2022';

      this.resultData = {
        id: 'review_test_' + clampedId,
        date: new Date().toISOString(),
        bookName: currentBook,
        testId: clampedId,
        testTitle: `${currentBook} — Test ${clampedId < 10 ? '0' : ''}${clampedId} (Chế độ xem đáp án & giải thích)`,
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

  // ── Render Top Overview (Score Hero & Part Breakdown) ──
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
    if (titleEl && r.testTitle) titleEl.textContent = r.testTitle;

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

      // Update 3 overview cards
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

    // Render Part Breakdown Grid
    const partGrid = document.getElementById('result-part-breakdown');
    if (partGrid) {
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
          <div class="part-stat-card" style="grid-column: 1 / -1; padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
              <div>
                <span style="font-weight: 800; font-size: 1.15rem; color: var(--text-primary);">${partName}</span>
                <span class="badge" style="margin-left: 10px; background: rgba(99, 102, 241, 0.15); color: var(--accent-secondary); font-size: 0.8rem; padding: 3px 10px; border-radius: 6px;">${this.escapeHtml(badge)}</span>
              </div>
              <span style="font-weight: 800; font-size: 1.1rem; color: ${color};">
                ${accuracy}% (${totalCorr}/${totalQ} câu)
              </span>
            </div>
            <div class="part-progress-bar" role="progressbar" aria-valuenow="${accuracy}" aria-valuemin="0" aria-valuemax="100" aria-label="Tỷ lệ chính xác ${accuracy}%" style="height: 10px; margin-bottom: 12px;">
              <div class="part-progress-fill" style="width: ${accuracy}%; background: ${color};"></div>
            </div>
            <p style="color: var(--text-secondary); font-size: 0.92rem; margin: 0;">💡 <strong>Đánh giá năng lực:</strong> ${this.escapeHtml(advice)}</p>
          </div>
        `;
      } else if (r.partStats && typeof r.partStats === 'object') {
        for (const [key, stat] of Object.entries(r.partStats)) {
          if (!stat || typeof stat !== 'object') continue;
          const partInfo = partsConfig[key];
          const partName = this.escapeHtml(partInfo?.name || key);
          const statTotal = Number.isFinite(stat.total) && stat.total > 0 ? stat.total : 0;
          const statCorrect = Number.isFinite(stat.correct) && stat.correct >= 0 ? stat.correct : 0;
          const pct = statTotal > 0 ? Math.max(0, Math.min(100, Math.round((statCorrect / statTotal) * 100))) : 0;
          const color = pct >= 70 ? 'var(--success)' : (pct >= 50 ? 'var(--warning)' : 'var(--danger)');

          partHtml += `
            <div class="part-stat-card">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 700; font-size: 0.95rem;">${partName}</span>
                <span style="font-weight: 700; color: ${color};">
                  ${pct}% (${statCorrect}/${statTotal})
                </span>
              </div>
              <div class="part-progress-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Tỷ lệ chính xác ${partName}: ${pct}%">
                <div class="part-progress-fill" style="width: ${pct}%; background: ${color};"></div>
              </div>
            </div>
          `;
        }
      }
      partGrid.innerHTML = partHtml;
    }

    // Adapt Part filter pills in review section
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

  // ── Show / Hide Detailed Review Section ──
  showDetailedReviewSection() {
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
        const prefersReduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: offsetTop, behavior: prefersReduced ? 'auto' : 'smooth' });
      }
      return true;
    }
    return false;
  },

  // ── Update Filter Button Counts (Real-time numbers for all/correct/wrong/unanswered) ──
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

  // ── Status Filter: All / Correct / Wrong / Unanswered ──
  setStatusFilter(status) {
    const raw = (typeof status === 'string') ? status.trim().toLowerCase() : '';
    const valid = ['all', 'correct', 'wrong', 'unanswered'];
    const targetStatus = valid.includes(raw) ? raw : 'all';
    this.currentStatusFilter = targetStatus;

    if (typeof document !== 'undefined') {
      // Auto-reveal detailed review section if hidden
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

  // ── Part Filter: All / Part 1 .. Part 7 ──
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

    // Part Practice Mode Isolation
    if (this.resultData && this.resultData.mode === 'part' && this.resultData.partFilter) {
      const allowedPart = String(this.resultData.partFilter).toLowerCase();
      if (targetPart !== allowedPart && targetPart !== 'all') {
        targetPart = allowedPart;
      }
    }

    this.currentPartFilter = targetPart;

    // Stop current audio when switching parts to prevent ghost audio
    if (typeof AudioController !== 'undefined' && typeof AudioController.stopCurrent === 'function') {
      try { AudioController.stopCurrent(); } catch (_) {}
    }

    if (typeof document !== 'undefined') {
      // Auto-reveal detailed review section if hidden
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
    return targetPart;
  },

  // Backward compatibility
  setFilter(filterType) {
    return this.setStatusFilter(filterType);
  },

  // ── Render Detailed Review List (Grouped for Part 3, 4, 6, 7; Single for 1, 2, 5) ──
  renderDetailedReview() {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('review-questions-container');
    if (!container || !this.resultData) return;

    const rawQuestions = Array.isArray(this.resultData.detailedQuestions) ? this.resultData.detailedQuestions : [];
    const questions = rawQuestions.filter(Boolean);
    let filtered = questions;

    // Filter by Part
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

    // Filter by Status
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

    // Build groups for Parts 3, 4, 6, 7 so 1 passage image is displayed with its questions underneath
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
            currentGroup.groupAudioUrl = q.audioUrl || q.groupAudioUrl;
          }
          if (!currentGroup.groupTranslation) {
            currentGroup.groupTranslation = synthFromSentences(currentGroup.groupSentences) || synthFromPassages(currentGroup.groupPassages);
          }
          currentGroup.questions.push(q);
        } else {
          const gSentences = q.groupSentences || [];
          const gPassages = q.groupPassages || [];
          const gTrans = q.groupTranslation || q.passageTranslation || synthFromSentences(gSentences) || synthFromPassages(gPassages) || '';
          currentGroup = {
            type: 'group',
            groupId: q.groupId,
            part: q.part,
            expectedRange: q.expectedRange || [q.questionNumber, q.questionNumber],
            groupPassages: gPassages,
            groupSentences: gSentences,
            groupTranscript: q.groupTranscript || '',
            groupTranslation: gTrans,
            groupAudioUrl: q.audioUrl || q.groupAudioUrl || '',
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
    groupedItems.forEach(item => {
      if (item.type === 'single') {
        html += this.renderSingleQuestionReview(item.question);
      } else {
        html += this.renderGroupQuestionReview(item);
      }
    });

    // Bottom Next / Prev Part navigation bar for Full Review mode
    if (this.resultData && this.resultData.mode !== 'part' && /^part([1-7])$/i.test(this.currentPartFilter)) {
      const curIdx = parseInt(this.currentPartFilter.replace(/part/i, ''), 10);
      const prevPart = curIdx > 1 ? `part${curIdx - 1}` : null;
      const nextPart = curIdx < 7 ? `part${curIdx + 1}` : null;
      html += `
        <div class="review-part-footer-nav" style="display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 20px 0 8px; padding: 12px 16px; background: var(--bg-glass-card); border: 1px solid var(--border-glass); border-radius: var(--radius-lg);">
          ${prevPart ? `
            <button type="button" class="btn btn-secondary" onclick="ResultViewer.setPartFilter('${prevPart}'); window.scrollTo({top: Math.max(0, (document.getElementById('detailed-review-section')?.offsetTop || 0) - 80), behavior: 'smooth'});">
              ⬅ Part ${curIdx - 1}
            </button>
          ` : `<div></div>`}
          ${nextPart ? `
            <button type="button" class="btn btn-primary" onclick="ResultViewer.setPartFilter('${nextPart}'); window.scrollTo({top: Math.max(0, (document.getElementById('detailed-review-section')?.offsetTop || 0) - 80), behavior: 'smooth'});" style="margin-left: auto;">
              Part tiếp theo: Part ${curIdx + 1} ➔
            </button>
          ` : `<div></div>`}
        </div>
      `;
    }

    container.innerHTML = html;
  },

  // ── Render Standalone Question Review (Part 1, Part 2, Part 5) ──
  renderSingleQuestionReview(q) {
    const config = this._getConfig();
    const qNum = q.questionNumber;
    const userChoice = q.userChoice;
    const correctChoice = q.correctChoice;
    const isCorrect = q.isCorrect;
    const hasExplanation = Boolean(q.explanation || q.analysis || q.tips || q.optionsTranslation || q.translation);
    const audioUrl = q.audioUrl;
    const imgUrl = (config && typeof config.resolveAssetUrl === 'function')
      ? config.resolveAssetUrl(q.imageUrl)
      : (q.imageUrl || '');
    const playerId = `review_player_${qNum}`;
    const partInfo = (config && typeof config.getPartByQuestionNum === 'function')
      ? config.getPartByQuestionNum(qNum)
      : null;
    const partKey = partInfo ? partInfo.key : (q.part || '');

    // Clean redundant ETS boilerplate prompt & translation for Part 1 photographs
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
            <span class="review-part-tag">${partInfo?.name || 'Part'}</span>
            ${isCorrect 
              ? '<span class="status-badge status-correct">✅ Đúng</span>' 
              : (userChoice 
                  ? '<span class="status-badge status-wrong">❌ Sai</span>' 
                  : '<span class="status-badge status-empty">⚪ Chưa làm</span>')}
          </div>
        </div>

        <!-- Part 1: Photograph with direct click-to-zoom (No blinding background, no black zoom button) -->
        ${imgUrl ? `
          <div class="q-image-container" style="cursor: pointer;" onclick="UIRenderer.openLightbox('${imgUrl}')" title="Nhấn để phóng to hình ảnh">
            <img src="${imgUrl}" alt="Photo Question ${qNum}" loading="lazy">
          </div>
        ` : ''}

        <!-- Audio Player (Part 1 - 2) -->
        ${audioUrl ? UIRenderer.renderAudioPlayer(playerId, audioUrl, `Nghe lại câu ${qNum}`) : ''}

        <!-- Part 2: Spoken Question Script + Inline Question Translation -->
        ${(partKey === 'part2' && (cleanQuestionText || cleanQuestionTrans)) ? `
          <div style="background: rgba(99, 102, 241, 0.12); border-left: 3px solid var(--accent-primary); padding: 8px 12px; border-radius: var(--radius-sm); margin: 8px 0 12px;">
            <span style="font-size: 0.72rem; font-weight: 700; color: var(--accent-secondary); text-transform: uppercase;">🔊 Lời thoại câu hỏi:</span>
            ${cleanQuestionText ? `<p style="font-size: 0.92rem; font-weight: 600; color: var(--text-primary); margin-top: 2px;">"${cleanQuestionText}"</p>` : ''}
            ${cleanQuestionTrans ? `<p class="question-trans-inline" style="font-size: 0.86rem; color: var(--text-secondary); margin-top: 4px; font-style: italic;">${cleanQuestionTrans}</p>` : ''}
          </div>
        ` : ''}

        <!-- Question Text & Inline Translation for Part 5 (or Part 1 if non-boilerplate question exists) -->
        ${(partKey !== 'part2' && (cleanQuestionText || cleanQuestionTrans)) ? `
          <div class="question-text-block" style="margin: 10px 0 12px;">
            ${cleanQuestionText ? `<p class="question-text" style="font-size: 0.98rem; font-weight: 600; margin: 0; line-height: 1.5;">${cleanQuestionText}</p>` : ''}
            ${cleanQuestionTrans ? `<p class="question-trans-inline" style="font-size: 0.88rem; color: var(--text-secondary); margin: 4px 0 0; line-height: 1.45; font-style: italic;">${cleanQuestionTrans}</p>` : ''}
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

  // ── Render Grouped Questions Review (Parts 3, 4, 6, 7) — 1 Image/Audio Block + Sub-questions underneath ──
  renderGroupQuestionReview(group) {
    const config = this._getConfig();
    const isReading = ['part6', 'part7'].includes(group.part);
    const gid = group.groupId;
    const range = group.expectedRange || [0, 0];
    const badgeLabel = group.part === 'part6' ? 'Part 6'
      : group.part === 'part7' ? 'Part 7'
      : group.part === 'part3' ? 'Part 3'
      : 'Part 4';

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
                      <div style="font-size: 0.81rem; color: var(--text-secondary); white-space: pre-line;">${s.analysis}</div>
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

                    <!-- Floating Sentence Lookup Popover (positions above or below clicked coordinate) -->
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

        <!-- Reading (Part 6 & 7): Master Passage Translation Accordion -->
        ${isReading && group.groupTranslation ? `
          <details class="passage-master-translation">
            <summary>📖 Dịch toàn bài</summary>
            <div class="translation-box" style="margin-top: 6px; white-space: pre-line;">${group.groupTranslation}</div>
          </details>
        ` : ''}

        <!-- Sub-questions belonging to this group -->
        <div class="group-subquestions-list">
          ${group.questions.map(q => this.renderSubQuestionItem(q)).join('')}
        </div>
      </div>
    `;
  },

  // ── Render Individual Sub-Question Item under the Group Image ──
  renderSubQuestionItem(q) {
    const qNum = q.questionNumber;
    const userChoice = q.userChoice;
    const correctChoice = q.correctChoice;
    const isCorrect = q.isCorrect;
    const hasExplanation = Boolean(q.explanation || q.analysis || q.tips || q.optionsTranslation || q.translation);
    const questionTrans = (q.translation || q.questionTranslation || '').trim();

    return `
      <div class="review-q-card animate-fade-in" id="review_q_${qNum}" style="margin-top: 14px; margin-bottom: 0;">
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

        ${(q.questionText || questionTrans) ? `
          <div class="question-text-block" style="margin: 10px 0 12px;">
            ${q.questionText ? `<p class="question-text" style="font-size: 0.98rem; font-weight: 600; margin: 0; line-height: 1.5;">${q.questionText}</p>` : ''}
            ${questionTrans ? `<p class="question-trans-inline" style="font-size: 0.88rem; color: var(--text-secondary); margin: 4px 0 0; line-height: 1.45; font-style: italic;">${questionTrans}</p>` : ''}
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

  // ── Render Shared Explanation Content Panel (Pedagogical Cards) ──
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
            <div class="exp-text-prose exp-analysis-text">${q.analysis}</div>
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
            <div class="exp-text-prose exp-analysis-text" style="white-space: pre-line;">${q.tips}</div>
          </div>
        </div>
      ` : ''}
    `;
  },

  // ── Toggle Individual Question Explanation Accordion ──
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

  // ── Master Toggle: Expand / Collapse All ──
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
      // Smart Auto-Toggle: if any panel is closed, expand all; otherwise collapse all
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

  // ── Interactive Passage Sentence Lookup (Part 6 & Part 7) ──
  getPassage(gid, pIdx) {
    if (this.groupsMap && this.groupsMap[gid]) {
      return this.groupsMap[gid].groupPassages?.[pIdx] || null;
    }
    const q = (this.resultData?.detailedQuestions || []).find(x => x.groupId === gid || x.questionNumber === gid);
    return q && q.groupPassages && q.groupPassages[pIdx] ? q.groupPassages[pIdx] : null;
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
      const bFont = Math.max(5.5, Math.min(11, renderW * 0.0125));
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

      // Tính % phạm vi từ đầu tiên (ví dụ chữ "The" ngay phía trên số 1) để mở rộng vùng chạm bao phủ cả từ
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
    if (!passage || !passage.sentences || passage.sentences.length === 0) return;

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

  selectSentence(gid, pIdx, sIdx, prefix = '') {
    const passage = this.getPassage(gid, pIdx);
    if (!passage || !passage.sentences || !passage.sentences[sIdx]) return;
    const s = passage.sentences[sIdx];

    const layer = document.getElementById(`overlays_${prefix}${gid}_${pIdx}`);
    if (layer) {
      layer.querySelectorAll('.sentence-overlay-box').forEach(b => b.classList.remove('active'));
      layer.querySelectorAll(`.sentence-box-${prefix}${gid}-${pIdx}-${sIdx}`).forEach(b => b.classList.add('active'));
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
        note.textContent = s.analysis ? `💡 ${s.analysis}` : '';
        note.style.display = s.analysis ? 'block' : 'none';
      }

      // Định vị popup ngay dưới hoặc ngay trên tọa độ câu vừa chạm
      const firstR = s.regions && s.regions[0];
      const refH = passage.imageHeight || 1000;
      const sy1Pct = firstR
        ? ((typeof firstR.yPct === 'number' && !isNaN(firstR.yPct)) ? firstR.yPct : ((firstR.y1 / refH) * 100))
        : 30;
      const sy0Pct = (firstR && firstR.y0 != null)
        ? ((firstR.y0 / refH) * 100)
        : Math.max(0, sy1Pct - 2.6);

      if (sy1Pct <= 55) {
        // Câu nằm ở nửa trên ảnh -> Hiển thị thẻ dịch ngay bên dưới câu
        card.style.top = `${Math.min(88, sy1Pct + 1.8).toFixed(2)}%`;
        card.style.bottom = 'auto';
      } else {
        // Câu nằm ở nửa dưới ảnh -> Hiển thị thẻ dịch ngay phía trên câu
        card.style.bottom = `${Math.min(88, Math.max(3, 100 - sy0Pct + 1.0)).toFixed(2)}%`;
        card.style.top = 'auto';
      }

      card.style.display = 'block';
    }
  },

  closeSentenceCard(gid, pIdx, prefix = '') {
    const card = document.getElementById(`sentence_card_${prefix}${gid}_${pIdx}`);
    if (card) card.style.display = 'none';

    const layer = document.getElementById(`overlays_${prefix}${gid}_${pIdx}`);
    if (layer) {
      layer.querySelectorAll('.sentence-overlay-box').forEach(b => b.classList.remove('active'));
    }
  },

  openPassageLightbox(gid, pIdx, url) {
    const opened = UIRenderer.openLightbox(url);
    if (!opened || typeof document === 'undefined') return opened;

    const modal = document.getElementById('image-lightbox-modal');
    if (!modal || typeof modal.querySelector !== 'function') return opened;
    const imgEl = modal.querySelector('#lightbox-modal-img');
    const container = modal.querySelector('.lightbox-img-container') || (imgEl && imgEl.parentElement);
    if (!imgEl || !container || typeof document.createElement !== 'function') return opened;

    // Tạo lớp tọa độ câu và thẻ popup dịch câu ngay trong chế độ kính lúp (Lightbox)
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

  // ── Dynamically rehydrate latest explanations from DB if any questions were missing explanations ──
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
      const url = (config && typeof config.getDatabaseUrl === 'function')
        ? (targetBook ? config.getDatabaseUrl(targetBook) : config.getDatabaseUrl())
        : 'data/database_compiled.json';
      const db = await this._fetchDatabase(url);
      if (!db) return false;
      const tests = db.tests || (Array.isArray(db) ? db : [db]);

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

      // Safe clone helper breaking circular reference leak
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
          // Sync clean options from DB
          if (freshQ.options) {
            const freshOptsStr = JSON.stringify(freshQ.options, (k, v) => k === '_parentGroup' ? undefined : v);
            if (JSON.stringify(q.options, (k, v) => k === '_parentGroup' ? undefined : v) !== freshOptsStr) {
              q.options = safeClone(freshQ.options);
              hasUpdates = true;
            }
          }
          // Sync clean questionText
          if (freshQ.questionText && q.questionText !== freshQ.questionText) {
            q.questionText = freshQ.questionText;
            hasUpdates = true;
          }
          // Sync imageUrl (Critical for Part 1 photographs!)
          if (freshQ.imageUrl && q.imageUrl !== freshQ.imageUrl) {
            q.imageUrl = freshQ.imageUrl;
            hasUpdates = true;
          }
          // Sync audioUrl (Part 1, 2)
          if (freshQ.audioUrl && q.audioUrl !== freshQ.audioUrl) {
            q.audioUrl = freshQ.audioUrl;
            hasUpdates = true;
          }
          // Sync latest explanation
          if (freshQ.explanation && q.explanation !== freshQ.explanation) {
            q.explanation = freshQ.explanation;
            hasUpdates = true;
          }
          // Sync latest analysis
          if (freshQ.analysis && q.analysis !== freshQ.analysis) {
            q.analysis = freshQ.analysis;
            hasUpdates = true;
          }
          // Sync latest tips
          if (freshQ.tips && q.tips !== freshQ.tips) {
            q.tips = freshQ.tips;
            hasUpdates = true;
          }
          // Sync latest question translation
          const freshTrans = freshQ.translation || freshQ.questionTranslation || '';
          if (freshTrans && q.translation !== freshTrans) {
            q.translation = freshTrans;
            hasUpdates = true;
          }
          // Sync options translation
          if (freshQ.optionsTranslation) {
            const freshOptTransStr = JSON.stringify(freshQ.optionsTranslation, (k, v) => k === '_parentGroup' ? undefined : v);
            if (JSON.stringify(q.optionsTranslation, (k, v) => k === '_parentGroup' ? undefined : v) !== freshOptTransStr) {
              q.optionsTranslation = safeClone(freshQ.optionsTranslation);
              hasUpdates = true;
            }
          }
          // Sync correct answer & recalculate isCorrect
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

        // If question belongs to a group (Part 3, 4, 6, 7)
        const freshG = (q.groupId && gMap[q.groupId]) || qGroupMap[q.questionNumber];
        if (freshG) {
          if (!q.groupId && freshG.groupId) {
            q.groupId = freshG.groupId;
            hasUpdates = true;
          }
          // Sync group image / graphic for Part 3 & 4
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
          // Sync groupPassages (passages, images, coordinates) with deep clone
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
          // Sync groupSentences
          if (freshG.sentences && freshG.sentences.length > 0) {
            const freshSentStr = JSON.stringify(freshG.sentences);
            if (!q.groupSentences || JSON.stringify(q.groupSentences) !== freshSentStr) {
              q.groupSentences = safeClone(freshG.sentences);
              hasUpdates = true;
            }
          }
          // Sync group expected range (cloned array)
          if (freshG.expectedRange && (!q.expectedRange || q.expectedRange[0] !== freshG.expectedRange[0])) {
            q.expectedRange = Array.isArray(freshG.expectedRange) ? [...freshG.expectedRange] : freshG.expectedRange;
            hasUpdates = true;
          }
          // Sync group audio
          if (freshG.audioUrl && (!q.audioUrl || !q.groupAudioUrl)) {
            q.audioUrl = freshG.audioUrl;
            q.groupAudioUrl = freshG.audioUrl;
            hasUpdates = true;
          }
          // Sync group translation & transcript
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

      // Recalculate score stats if any correctChoice changed
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

  // Format Part 3 & 4 dialogue with distinct speaker badges
  formatDialogue(text) {
    if (!text) return '';
    const lines = text.split('\n');
    return lines.map(rawLine => {
      const line = rawLine.trim();
      if (!line) return '';
      // Support both "[Woman] ...", "[Man 1] ..." and "Woman: ...", "Người đàn ông: ..."
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
