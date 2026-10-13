// ==========================================================================
// TOEIC MASTER — exam-engine.js
// Exam Lifecycle: Timer, State Management, Submission, Auto-Save
// ==========================================================================

const PART_TIMES_SECONDS = {
  part1: 6 * 60,    // 6 mins (6 photos)
  part2: 12 * 60,   // 12 mins (25 questions)
  part3: 20 * 60,   // 20 mins (39 questions)
  part4: 15 * 60,   // 15 mins (30 questions)
  part5: 15 * 60,   // 15 mins (30 questions)
  part6: 12 * 60,   // 12 mins (16 questions)
  part7: 55 * 60    // 55 mins (54 questions)
};

const ExamEngine = {
  testId: 1,
  mode: 'full', // 'full' or 'part'
  partFilter: null, // 'part1'..'part7'
  testData: null,
  allQuestionsMap: {}, // qNum -> question object
  userAnswers: {},     // qNum -> 'A' | 'B' | 'C' | 'D'
  flaggedQuestions: new Set(),
  timeRemaining: 120 * 60, // in seconds
  initialTime: 120 * 60,
  timerInterval: null,
  startTime: null,
  currentQNum: null,
  _isSubmitting: false,

  PART_TIMES_SECONDS,

  parseQueryParams(searchOrParams) {
    let rawTest = '1';
    let rawMode = 'full';
    let rawPart = null;

    if (typeof searchOrParams === 'string') {
      const qs = searchOrParams.startsWith('?') ? searchOrParams.substring(1) : searchOrParams;
      const params = new URLSearchParams(qs);
      rawTest = params.get('test') || '1';
      rawMode = params.get('mode') || 'full';
      rawPart = params.get('part') || null;
    } else if (searchOrParams && typeof searchOrParams.get === 'function') {
      rawTest = searchOrParams.get('test') || '1';
      rawMode = searchOrParams.get('mode') || 'full';
      rawPart = searchOrParams.get('part') || null;
    } else if (searchOrParams && typeof searchOrParams === 'object') {
      rawTest = searchOrParams.test || '1';
      rawMode = searchOrParams.mode || 'full';
      rawPart = searchOrParams.part || null;
    }

    // 1. Boundary Clamping for testId (1 to 10)
    let testId = 1;
    if (typeof rawTest === 'number') {
      testId = Math.floor(rawTest);
    } else {
      const match = String(rawTest).match(/[+-]?\d+/);
      testId = match ? parseInt(match[0], 10) : 1;
    }
    if (isNaN(testId) || testId < 1) testId = 1;
    if (testId > 10) testId = 10;

    // 2. Whitelist validation for mode
    const normalizedMode = (typeof rawMode === 'string') ? rawMode.trim().toLowerCase() : 'full';
    const mode = (normalizedMode === 'part') ? 'part' : 'full';

    // 3. Validation for partFilter
    let partFilter = null;
    if (mode === 'part') {
      const validParts = (typeof AppConfig !== 'undefined' && AppConfig.PARTS)
        ? Object.keys(AppConfig.PARTS)
        : ['part1', 'part2', 'part3', 'part4', 'part5', 'part6', 'part7'];
      const p = (typeof rawPart === 'string') ? rawPart.trim().toLowerCase() : '';
      partFilter = validParts.includes(p) ? p : 'part1';
    }

    return { testId, mode, partFilter };
  },

  async init(customParams = null) {
    this._isSubmitting = false;
    // 1. Parse URL Parameters with validation & clamping
    const searchSource = customParams || (typeof window !== 'undefined' && window.location ? window.location.search : '');
    const parsed = this.parseQueryParams(searchSource);
    this.testId = parsed.testId;
    this.mode = parsed.mode;
    this.partFilter = parsed.partFilter;

    // 2. Set default timer based on mode
    const partTimes = this.PART_TIMES_SECONDS || PART_TIMES_SECONDS;
    if (this.mode === 'full') {
      this.timeRemaining = 120 * 60; // 120 mins
    } else if (this.partFilter && partTimes[this.partFilter]) {
      this.timeRemaining = partTimes[this.partFilter];
    } else {
      this.timeRemaining = 20 * 60;
    }
    this.initialTime = this.timeRemaining;

    // Update Header title badge with Part name if in part mode
    if (typeof document !== 'undefined') {
      const titleBadge = document.getElementById('exam-header-title');
      if (titleBadge) {
        const testNumStr = this.testId < 10 ? `0${this.testId}` : `${this.testId}`;
        if (this.mode === 'part' && this.partFilter && typeof AppConfig !== 'undefined' && AppConfig.PARTS && AppConfig.PARTS[this.partFilter]) {
          const pName = AppConfig.PARTS[this.partFilter].name.split(':')[0];
          titleBadge.textContent = `Test ${testNumStr} • ${pName}`;
          titleBadge.title = AppConfig.PARTS[this.partFilter].name;
        } else {
          titleBadge.textContent = `Test ${testNumStr}`;
        }
      }
    }

    // 3. Load database
    try {
      this.showLoading(true);
      const dbUrl = (typeof AppConfig !== 'undefined' && typeof AppConfig.getDatabaseUrl === 'function')
        ? AppConfig.getDatabaseUrl()
        : 'data/database_compiled.json';
      const res = await fetch(dbUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const db = await res.json();
      
      const tests = db.tests || (Array.isArray(db) ? db : [db]);
      const currentTest = tests.find(t => t.testId === this.testId || t.id === this.testId) || tests[0];
      if (!currentTest) throw new Error('Không tìm thấy dữ liệu đề thi');
      this.testData = currentTest;
      this.testId = currentTest.testId || currentTest.id || this.testId;

      // 4. Index all questions
      this.indexQuestions(currentTest);

      // 5. Check if we have an active session to restore
      this.restoreActiveSession();
      if (this._isSubmitting) {
        this.showLoading(false);
        return true;
      }

      // 6. Render UI
      this.renderExamPage();

      // 7. Start timer
      this.startTimer();
      this.showLoading(false);
      return true;
    } catch (err) {
      console.error('Failed to load exam data:', err);
      this.showLoading(false);
      this.showError(`Không thể tải dữ liệu đề thi (${err.message}). Vui lòng kiểm tra kết nối mạng và file database.`);
      return false;
    }
  },

  // Index questions for O(1) lookup
  indexQuestions(test) {
    this.allQuestionsMap = {};
    const lc = test.listening || {};
    const rc = test.reading || {};
    const getPartQuestions = (p) => Array.isArray(p) ? p : (Array.isArray(p?.questions) ? p.questions : []);
    const getPartGroups = (p) => Array.isArray(p) ? p : (Array.isArray(p?.groups) ? p.groups : []);

    // Part 1 & 2
    getPartQuestions(lc.part1).forEach(q => {
      q.part = 'part1';
      q.groupId = 'p1_q' + q.questionNumber;
      q.expectedRange = [q.questionNumber, q.questionNumber];
      this.allQuestionsMap[q.questionNumber] = q;
    });
    getPartQuestions(lc.part2).forEach(q => {
      q.part = 'part2';
      q.groupId = 'p2_q' + q.questionNumber;
      q.expectedRange = [q.questionNumber, q.questionNumber];
      this.allQuestionsMap[q.questionNumber] = q;
    });

    // Part 3 & 4
    getPartGroups(lc.part3).forEach((g, gIdx) => {
      const gid = g.groupId || `p3_g${gIdx + 1}`;
      const range = g.expectedRange || [g.questions?.[0]?.questionNumber, g.questions?.[g.questions.length - 1]?.questionNumber];
      (g.questions || []).forEach((q, idx) => {
        q.part = 'part3';
        q.groupId = gid;
        q.expectedRange = range;
        q.groupTranscript = g.transcript || '';
        q.groupTranslation = g.passageTranslation || g.translation || '';
        q.groupSentences = g.sentences || [];
        q.groupAudioUrl = g.audioUrl || q.audioUrl || '';
        q.groupPassages = g.passages || [];
        q.isFirstInGroup = idx === 0;
        this.allQuestionsMap[q.questionNumber] = q;
      });
    });
    getPartGroups(lc.part4).forEach((g, gIdx) => {
      const gid = g.groupId || `p4_g${gIdx + 1}`;
      const range = g.expectedRange || [g.questions?.[0]?.questionNumber, g.questions?.[g.questions.length - 1]?.questionNumber];
      (g.questions || []).forEach((q, idx) => {
        q.part = 'part4';
        q.groupId = gid;
        q.expectedRange = range;
        q.groupTranscript = g.transcript || '';
        q.groupTranslation = g.passageTranslation || g.translation || '';
        q.groupSentences = g.sentences || [];
        q.groupAudioUrl = g.audioUrl || q.audioUrl || '';
        q.groupPassages = g.passages || [];
        q.isFirstInGroup = idx === 0;
        this.allQuestionsMap[q.questionNumber] = q;
      });
    });

    // Part 5
    const p5List = getPartQuestions(rc.part5).length > 0 ? getPartQuestions(rc.part5) : getPartQuestions(lc.part5);
    p5List.forEach(q => {
      q.part = 'part5';
      q.groupId = 'p5_q' + q.questionNumber;
      q.expectedRange = [q.questionNumber, q.questionNumber];
      this.allQuestionsMap[q.questionNumber] = q;
    });

    // Part 6 & 7
    getPartGroups(rc.part6).forEach((g, gIdx) => {
      const gid = g.groupId || `p6_g${gIdx + 1}`;
      const range = g.expectedRange || [g.questions?.[0]?.questionNumber, g.questions?.[g.questions.length - 1]?.questionNumber];
      (g.questions || []).forEach((q, idx) => {
        q.part = 'part6';
        q.groupId = gid;
        q.expectedRange = range;
        q.groupPassages = g.passages || [];
        q.groupTranslation = g.passageTranslation || g.translation || '';
        q.groupSentences = g.sentences || [];
        q.isFirstInGroup = idx === 0;
        this.allQuestionsMap[q.questionNumber] = q;
      });
    });
    getPartGroups(rc.part7).forEach((g, gIdx) => {
      const gid = g.groupId || `p7_g${gIdx + 1}`;
      const range = g.expectedRange || [g.questions?.[0]?.questionNumber, g.questions?.[g.questions.length - 1]?.questionNumber];
      (g.questions || []).forEach((q, idx) => {
        q.part = 'part7';
        q.groupId = gid;
        q.expectedRange = range;
        q.groupPassages = g.passages || [];
        q.groupTranslation = g.passageTranslation || g.translation || '';
        q.groupSentences = g.sentences || [];
        q.isFirstInGroup = idx === 0;
        this.allQuestionsMap[q.questionNumber] = q;
      });
    });
  },

  // Get active question numbers array according to mode & partFilter
  getActiveQuestionNumbers() {
    const partsConfig = (typeof AppConfig !== 'undefined' && AppConfig.PARTS) ? AppConfig.PARTS : {};
    if (this.mode === 'part' && this.partFilter && partsConfig[this.partFilter]) {
      const { start, end } = partsConfig[this.partFilter];
      const list = [];
      for (let i = start; i <= end; i++) {
        if (this.allQuestionsMap[i]) list.push(i);
      }
      return list.length > 0 ? list : Array.from({ length: end - start + 1 }, (_, idx) => start + idx);
    }
    const all = Object.keys(this.allQuestionsMap).map(Number).sort((a, b) => a - b);
    return all.length > 0 ? all : Array.from({ length: 200 }, (_, idx) => idx + 1);
  },

  getTotalQuestionsCount() {
    return this.getActiveQuestionNumbers().length;
  },

  restoreActiveSession() {
    const storage = (typeof StorageService !== 'undefined')
      ? StorageService
      : (typeof window !== 'undefined' && window.StorageService ? window.StorageService : (typeof global !== 'undefined' ? global.StorageService : null));
    if (!storage || typeof storage.getActiveSession !== 'function') return false;

    const saved = storage.getActiveSession();
    if (!saved || typeof saved !== 'object') return false;

    const currentBook = (typeof AppConfig !== 'undefined' && typeof AppConfig.getSelectedBook === 'function')
      ? AppConfig.getSelectedBook()
      : 'EST 2022';
    const isBookMatch = !saved.bookName || String(saved.bookName).trim() === String(currentBook).trim();
    const isTestMatch = Number(saved.testId) === Number(this.testId);
    const isModeMatch = String(saved.mode || 'full').trim().toLowerCase() === String(this.mode || 'full').trim().toLowerCase();
    const isPartMatch = (saved.partFilter ? String(saved.partFilter).trim().toLowerCase() : null) === (this.partFilter ? String(this.partFilter).trim().toLowerCase() : null);

    if (isBookMatch && isTestMatch && isModeMatch && isPartMatch) {
      const lastUpdated = Number(saved.lastUpdated) || 0;
      if (lastUpdated > 0 && Date.now() - lastUpdated < 24 * 3600 * 1000) {
        // Whitelist and sanitize userAnswers
        const rawAnswers = (saved.userAnswers && typeof saved.userAnswers === 'object' && !Array.isArray(saved.userAnswers)) ? saved.userAnswers : {};
        const cleanAnswers = {};
        Object.keys(rawAnswers).forEach(k => {
          const num = parseInt(k, 10);
          const ans = typeof rawAnswers[k] === 'string' ? rawAnswers[k].trim().toUpperCase() : '';
          if (Number.isInteger(num) && num > 0 && ['A', 'B', 'C', 'D'].includes(ans)) {
            cleanAnswers[num] = ans;
          }
        });
        this.userAnswers = cleanAnswers;

        // Normalize flaggedQuestions Set to strictly integer values
        this.flaggedQuestions = new Set(
          (Array.isArray(saved.flaggedQuestions) ? saved.flaggedQuestions : [])
            .map(n => parseInt(n, 10))
            .filter(n => Number.isInteger(n) && n > 0)
        );

        if (Number.isFinite(saved.initialTime) && saved.initialTime > 0) {
          this.initialTime = Math.floor(saved.initialTime);
        }

        // DOM element synchronization if question elements already rendered
        if (typeof document !== 'undefined') {
          Object.keys(cleanAnswers).forEach(numStr => {
            const num = parseInt(numStr, 10);
            const ans = cleanAnswers[num];
            const qItem = document.getElementById(`q_item_${num}`);
            if (qItem) {
              qItem.querySelectorAll('.option-btn').forEach(btn => {
                const letterEl = btn.querySelector('.option-letter');
                const letter = letterEl
                  ? letterEl.textContent.replace(/[()]/g, '').trim().toUpperCase()
                  : (btn.getAttribute('data-opt') || btn.textContent.trim().toUpperCase());
                const isSelected = Boolean(letter === ans);
                btn.classList.toggle('selected', isSelected);
                btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
              });
            }
          });

          this.flaggedQuestions.forEach(num => {
            const qItem = document.getElementById(`q_item_${num}`);
            if (qItem) {
              const btn = qItem.querySelector('.flag-btn');
              if (btn) {
                btn.className = 'flag-btn flagged';
                btn.innerHTML = '🚩';
                btn.title = 'Bỏ gắn cờ';
                btn.setAttribute('aria-pressed', 'true');
                btn.setAttribute('aria-label', `Bỏ gắn cờ câu ${num}`);
              }
            }
          });
        }

        if (saved.timeRemaining !== undefined && Number.isFinite(saved.timeRemaining)) {
          const rem = Math.floor(saved.timeRemaining);
          const elapsed = Math.max(0, Math.floor((Date.now() - lastUpdated) / 1000));
          const currentRemaining = Math.max(0, rem - elapsed);

          if (currentRemaining <= 0) {
            this.timeRemaining = 0;
            if (typeof this.updatePaletteUI === 'function') {
              try { this.updatePaletteUI(); } catch (_) {}
            }
            this.submitExam(true);
            return true;
          } else {
            this.timeRemaining = currentRemaining;
          }
        }

        if (typeof this.updatePaletteUI === 'function') {
          try { this.updatePaletteUI(); } catch (_) {}
        }
        return true;
      }
    }
    return false;
  },

  saveCurrentProgress() {
    const storage = (typeof StorageService !== 'undefined')
      ? StorageService
      : (typeof window !== 'undefined' && window.StorageService ? window.StorageService : (typeof global !== 'undefined' ? global.StorageService : null));
    if (!storage || typeof storage.saveActiveSession !== 'function') return false;

    const currentBook = (typeof AppConfig !== 'undefined' && typeof AppConfig.getSelectedBook === 'function')
      ? AppConfig.getSelectedBook()
      : 'EST 2022';

    try {
      storage.saveActiveSession({
        bookName: currentBook,
        testId: this.testId,
        mode: this.mode,
        partFilter: this.partFilter,
        userAnswers: this.userAnswers,
        flaggedQuestions: Array.from(this.flaggedQuestions),
        timeRemaining: this.timeRemaining,
        initialTime: this.initialTime
      });
      return true;
    } catch (err) {
      console.warn('saveActiveSession error in saveCurrentProgress:', err);
      return false;
    }
  },

  startTimer() {
    this.startTime = Date.now();
    const sec = Number.isFinite(this.timeRemaining) ? Math.max(0, Math.floor(this.timeRemaining)) : 0;
    this.timeRemaining = sec;
    this._timerTargetEndTime = Date.now() + sec * 1000;
    this.updateTimerDisplay();

    this.stopTimer();

    if (this.timeRemaining <= 0) {
      this.closeSubmitModal();
      this.closeMobileDrawer();
      const renderer = (typeof UIRenderer !== 'undefined')
        ? UIRenderer
        : (typeof window !== 'undefined' && window.UIRenderer ? window.UIRenderer : (typeof global !== 'undefined' ? global.UIRenderer : null));
      if (renderer && typeof renderer.closeLightbox === 'function') {
        try { renderer.closeLightbox(); } catch (_) {}
      }
      this.submitExam(true);
      return;
    }

    this.timerInterval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.round((this._timerTargetEndTime - now) / 1000));
      this.timeRemaining = remaining;
      this.updateTimerDisplay();

      if (this.timeRemaining % 5 === 0) {
        this.saveCurrentProgress(); // Auto-save every 5s
      }
      if (this.timeRemaining <= 0) {
        this.stopTimer();
        this.closeSubmitModal();
        this.closeMobileDrawer();
        const renderer = (typeof UIRenderer !== 'undefined')
          ? UIRenderer
          : (typeof window !== 'undefined' && window.UIRenderer ? window.UIRenderer : (typeof global !== 'undefined' ? global.UIRenderer : null));
        if (renderer && typeof renderer.closeLightbox === 'function') {
          try { renderer.closeLightbox(); } catch (_) {}
        }
        this.submitExam(true);
      }
    }, 1000);
  },

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    return true;
  },

  updateTimerDisplay() {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
    const sec = Number.isFinite(this.timeRemaining) ? Math.max(0, Math.floor(this.timeRemaining)) : 0;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    const timeStr = `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;

    const timerEls = document.querySelectorAll('.exam-timer-val');
    timerEls.forEach(el => {
      el.textContent = timeStr;
      const wrap = el.closest('.exam-timer');
      if (wrap) {
        wrap.setAttribute('role', 'timer');
        wrap.setAttribute('aria-label', `Thời gian còn lại: ${m} phút ${s} giây`);
        wrap.classList.toggle('danger', sec <= 300);
        wrap.classList.toggle('warning', sec > 300 && sec <= 600);
      }
    });
  },

  selectAnswer(qNum, optLetter) {
    if (this._isSubmitting) return false;
    const num = parseInt(qNum, 10);
    if (isNaN(num) || num <= 0) return false;

    const opt = (typeof optLetter === 'string') ? optLetter.trim().toUpperCase() : '';
    if (!['A', 'B', 'C', 'D'].includes(opt)) return false;

    if (!this.userAnswers || typeof this.userAnswers !== 'object' || Array.isArray(this.userAnswers)) {
      this.userAnswers = {};
    }

    if (this.userAnswers[num] === opt) {
      delete this.userAnswers[num];
    } else {
      this.userAnswers[num] = opt;
    }
    this.currentQNum = num;

    // Update question options UI & ARIA attributes
    if (typeof document !== 'undefined') {
      const qItem = document.getElementById(`q_item_${num}`);
      if (qItem) {
        qItem.querySelectorAll('.option-btn').forEach(btn => {
          const letterEl = btn.querySelector('.option-letter');
          const letter = letterEl
            ? letterEl.textContent.replace(/[()]/g, '').trim().toUpperCase()
            : (btn.getAttribute('data-opt') || btn.textContent.trim().toUpperCase());
          const isSelected = Boolean(this.userAnswers[num] && letter === this.userAnswers[num]);
          btn.classList.toggle('selected', isSelected);
          btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        });
      }
    }

    // Update Palette UI
    this.updatePaletteUI();
    try {
      this.saveCurrentProgress();
    } catch (saveErr) {
      console.warn('Failed to save progress in selectAnswer:', saveErr);
    }

    return {
      qNum: num,
      answer: this.userAnswers[num] || null,
      selected: Boolean(this.userAnswers[num])
    };
  },

  toggleFlag(qNum) {
    if (this._isSubmitting) return false;
    const num = parseInt(qNum, 10);
    if (isNaN(num) || num <= 0) return false;

    if (!this.flaggedQuestions || typeof this.flaggedQuestions.has !== 'function') {
      this.flaggedQuestions = new Set(Array.isArray(this.flaggedQuestions) ? this.flaggedQuestions : []);
    }

    let isFlagged = false;
    if (this.flaggedQuestions.has(num)) {
      this.flaggedQuestions.delete(num);
      isFlagged = false;
    } else {
      this.flaggedQuestions.add(num);
      isFlagged = true;
    }
    this.currentQNum = num;

    // Update question flag button & ARIA attributes
    if (typeof document !== 'undefined') {
      const qItem = document.getElementById(`q_item_${num}`);
      if (qItem) {
        const btn = qItem.querySelector('.flag-btn');
        if (btn) {
          btn.className = `flag-btn ${isFlagged ? 'flagged' : ''}`;
          btn.innerHTML = isFlagged ? '🚩' : '🏳️';
          btn.title = isFlagged ? 'Bỏ gắn cờ' : 'Gắn cờ xem lại';
          btn.setAttribute('aria-pressed', isFlagged ? 'true' : 'false');
          btn.setAttribute('aria-label', isFlagged ? `Bỏ gắn cờ câu ${num}` : `Gắn cờ xem lại câu ${num}`);
        }
      }
    }

    this.updatePaletteUI();
    try {
      this.saveCurrentProgress();
    } catch (saveErr) {
      console.warn('Failed to save progress in toggleFlag:', saveErr);
    }
    return isFlagged;
  },

  scrollToQuestion(qNum) {
    if (this._isSubmitting) return false;
    const num = parseInt(qNum, 10);
    if (isNaN(num) || num <= 0) return false;
    this.currentQNum = num;
    if (typeof document === 'undefined') return true;

    const el = document.getElementById(`q_item_${num}`);
    if (el) {
      const headerOffset = 90;
      const elPos = el.getBoundingClientRect().top;
      const scrollY = (typeof window !== 'undefined' && typeof window.scrollY !== 'undefined')
        ? window.scrollY
        : ((typeof window !== 'undefined' && window.pageYOffset) || (document.documentElement ? document.documentElement.scrollTop : 0) || 0);
      const offsetPos = Math.max(0, elPos + scrollY - headerOffset);

      const prefersReducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
        window.scrollTo({ top: offsetPos, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
      }

      // Highlight active question
      document.querySelectorAll('.question-item.active').forEach(i => i.classList.remove('active'));
      el.classList.add('active');

      // Accessibility focus management
      el.setAttribute('tabindex', '-1');
      if (typeof el.focus === 'function') {
        try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
      }

      this.updatePaletteUI();
      this.closeMobileDrawer();
      return true;
    }

    this.updatePaletteUI();
    return false;
  },

  updatePaletteUI() {
    if (typeof document === 'undefined') return;
    const paletteContainers = document.querySelectorAll('.palette-container-wrapper');
    const qList = this.getActiveQuestionNumbers();
    const totalCount = qList.length;
    const answeredCount = qList.filter(qNum => Boolean(this.userAnswers[qNum])).length;
    const hasFlag = (qNum) => {
      if (!this.flaggedQuestions) return false;
      if (typeof this.flaggedQuestions.has === 'function') return this.flaggedQuestions.has(qNum);
      if (Array.isArray(this.flaggedQuestions)) return this.flaggedQuestions.includes(qNum);
      if (typeof this.flaggedQuestions === 'object') return Boolean(this.flaggedQuestions[qNum]);
      return false;
    };
    const flaggedCount = qList.filter(qNum => hasFlag(qNum)).length;
    const remainingCount = Math.max(0, totalCount - answeredCount);

    paletteContainers.forEach(container => {
      if (!container || typeof container.querySelector !== 'function') return;
      const grid = container.querySelector('.palette-grid');
      const existingBtns = grid ? grid.querySelectorAll('.palette-btn') : null;

      // Fast-path: If palette grid already exists with matching button count, update in-place
      // This preserves keyboard focus (Tab navigation) and scroll position without DOM thrashing
      if (grid && existingBtns && existingBtns.length === totalCount) {
        // Update stat counters
        const statBoxes = container.querySelectorAll('.palette-stat-box span');
        if (statBoxes.length >= 3) {
          statBoxes[0].textContent = answeredCount;
          statBoxes[1].textContent = remainingCount;
          statBoxes[2].textContent = flaggedCount;
        }

        // Update each button state in-place
        existingBtns.forEach(btn => {
          const qNum = parseInt(btn.getAttribute('data-qnum') || btn.textContent.trim(), 10);
          if (isNaN(qNum)) return;

          const rawAns = this.userAnswers[qNum];
          const userAns = rawAns ? String(rawAns).trim().toUpperCase() : '';
          const isAnswered = Boolean(userAns);
          const isFlagged = hasFlag(qNum);
          const isCurrent = Number.isInteger(this.currentQNum) && qNum === this.currentQNum;

          btn.classList.toggle('answered', isAnswered);
          btn.classList.toggle('flagged', isFlagged);
          btn.classList.toggle('current', isCurrent);

          if (isCurrent) {
            btn.setAttribute('aria-current', 'true');
          } else {
            btn.removeAttribute('aria-current');
          }

          const escaper = (typeof UIRenderer !== 'undefined' && typeof UIRenderer.escapeHtml === 'function')
            ? UIRenderer.escapeHtml
            : (s) => String(s);

          const safeAns = escaper(userAns);
          const statusText = isAnswered ? `Đã chọn ${safeAns}` : 'Chưa làm';
          const flagText = isFlagged ? ', Đang gắn cờ' : '';
          const currentText = isCurrent ? ', Đang xem' : '';
          btn.title = `Câu ${qNum} ${isAnswered ? `(Đã chọn ${userAns})` : '(Chưa làm)'}${isFlagged ? ' [Đã đánh dấu]' : ''}`;
          btn.setAttribute('aria-label', `Câu ${qNum}: ${statusText}${flagText}${currentText}`);
        });
      } else {
        // Full render fallback (first load or filter changed)
        const prevScrollTop = grid ? grid.scrollTop : 0;
        const renderer = (typeof UIRenderer !== 'undefined')
          ? UIRenderer
          : (typeof window !== 'undefined' && window.UIRenderer ? window.UIRenderer : (typeof global !== 'undefined' ? global.UIRenderer : null));
        if (renderer && typeof renderer.renderPalette === 'function') {
          container.innerHTML = renderer.renderPalette(qList, this.userAnswers, this.flaggedQuestions, this.currentQNum);
        }
        const newGrid = container.querySelector('.palette-grid');
        if (newGrid && prevScrollTop > 0) {
          newGrid.scrollTop = prevScrollTop;
        }
      }
    });

    // Update sidebar & mobile bottom bar badges
    const badgeEl = document.getElementById('mobile-answered-badge');
    if (badgeEl) {
      badgeEl.textContent = `${answeredCount}/${totalCount}`;
    }

    const sidebarBadge = document.getElementById('sidebar-total-badge');
    if (sidebarBadge) {
      sidebarBadge.textContent = `${totalCount} câu`;
    }
  },

  renderExamPage() {
    const container = document.getElementById('exam-questions-list');
    if (!container) return;

    let html = '';
    const lc = this.testData.listening || {};
    const rc = this.testData.reading || {};
    const isPartMode = this.mode === 'part';
    const getPartQuestions = (p) => Array.isArray(p) ? p : (Array.isArray(p?.questions) ? p.questions : []);
    const getPartGroups = (p) => Array.isArray(p) ? p : (Array.isArray(p?.groups) ? p.groups : []);

    const shouldRenderPart = (partKey) => {
      if (this.mode === 'full') return true;
      return this.partFilter === partKey;
    };

    const renderPartDivider = (badge, name, range) => `
      <div class="part-section-divider">
        <span class="part-badge">${badge}</span>
        <span class="part-name">${name}</span>
        <span class="part-range">${range}</span>
      </div>
    `;

    // Master Continuous Audio in Header is for Full Exam Mode only
    // In Part Practice mode, individual questions/groups have their own audio players
    const isFullListening = this.mode === 'full';
    const headerPlayer = document.getElementById('master-lc-card');
    if (headerPlayer) {
      headerPlayer.style.display = isFullListening ? 'flex' : 'none';
    }

    // Part 1
    if (shouldRenderPart('part1')) {
      html += renderPartDivider('Part 1', 'Photographs', 'Câu 1 – 6');
      getPartQuestions(lc.part1).forEach(q => {
        html += UIRenderer.renderPart1(q, this.userAnswers[q.questionNumber], this.flaggedQuestions.has(q.questionNumber), isPartMode);
      });
    }

    // Part 2
    if (shouldRenderPart('part2')) {
      html += renderPartDivider('Part 2', 'Question-Response', 'Câu 7 – 31');
      getPartQuestions(lc.part2).forEach(q => {
        html += UIRenderer.renderPart2(q, this.userAnswers[q.questionNumber], this.flaggedQuestions.has(q.questionNumber), isPartMode);
      });
    }

    // Part 3
    if (shouldRenderPart('part3')) {
      html += renderPartDivider('Part 3', 'Conversations', 'Câu 32 – 70');
      getPartGroups(lc.part3).forEach(g => {
        html += UIRenderer.renderGroupAudio(g, 'part3', this.userAnswers, this.flaggedQuestions, isPartMode);
      });
    }

    // Part 4
    if (shouldRenderPart('part4')) {
      html += renderPartDivider('Part 4', 'Short Talks', 'Câu 71 – 100');
      getPartGroups(lc.part4).forEach(g => {
        html += UIRenderer.renderGroupAudio(g, 'part4', this.userAnswers, this.flaggedQuestions, isPartMode);
      });
    }

    // Part 5
    if (shouldRenderPart('part5')) {
      html += renderPartDivider('Part 5', 'Incomplete Sentences', 'Câu 101 – 130');
      const p5List = getPartQuestions(rc.part5).length > 0 ? getPartQuestions(rc.part5) : getPartQuestions(lc.part5);
      p5List.forEach(q => {
        html += UIRenderer.renderPart5(q, this.userAnswers[q.questionNumber], this.flaggedQuestions.has(q.questionNumber));
      });
    }

    // Part 6
    if (shouldRenderPart('part6')) {
      html += renderPartDivider('Part 6', 'Text Completion', 'Câu 131 – 146');
      getPartGroups(rc.part6).forEach(g => {
        html += UIRenderer.renderReadingGroup(g, 'part6', this.userAnswers, this.flaggedQuestions);
      });
    }

    // Part 7
    if (shouldRenderPart('part7')) {
      html += renderPartDivider('Part 7', 'Reading Comprehension', 'Câu 147 – 200');
      getPartGroups(rc.part7).forEach(g => {
        html += UIRenderer.renderReadingGroup(g, 'part7', this.userAnswers, this.flaggedQuestions);
      });
    }

    container.innerHTML = html;
    if (isFullListening) {
      this.initMasterAudio();
    }
    this.updatePaletteUI();
  },

  // ── Master LC Audio Controls (Full Exam Mode) ──
  initMasterAudio() {
    const audioEl = document.getElementById('master-audio-element');
    if (!audioEl) return;
    const url = (typeof AppConfig !== 'undefined' && typeof AppConfig.getFullLcAudioUrl === 'function')
      ? AppConfig.getFullLcAudioUrl(this.testId)
      : `audio/TEST_${this.testId}.mp3`;
    audioEl.src = url;

    const fillEl = document.getElementById('master-audio-fill');
    const curEl = document.getElementById('master-audio-cur');
    const durEl = document.getElementById('master-audio-dur');
    const playBtn = document.getElementById('master-play-btn');

    audioEl.ontimeupdate = () => {
      if (!audioEl.duration) return;
      const pct = (audioEl.currentTime / audioEl.duration) * 100;
      if (fillEl) fillEl.style.width = `${pct}%`;
      if (curEl) curEl.textContent = AudioController.formatTime(audioEl.currentTime);
      if (durEl && (!durEl.dataset.set || durEl.textContent === '--:--')) {
        durEl.textContent = AudioController.formatTime(audioEl.duration);
        durEl.dataset.set = '1';
      }
    };

    audioEl.onloadedmetadata = () => {
      if (durEl) {
        durEl.textContent = AudioController.formatTime(audioEl.duration);
        durEl.dataset.set = '1';
      }
    };

    audioEl.onplay = () => {
      if (playBtn) {
        playBtn.innerHTML = '⏸';
        playBtn.classList.add('playing');
        if (typeof playBtn.setAttribute === 'function') playBtn.setAttribute('aria-pressed', 'true');
      }
    };

    audioEl.onpause = () => {
      if (playBtn) {
        playBtn.innerHTML = '▶';
        playBtn.classList.remove('playing');
        if (typeof playBtn.setAttribute === 'function') playBtn.setAttribute('aria-pressed', 'false');
      }
    };

    audioEl.onended = () => {
      if (playBtn) {
        playBtn.innerHTML = '▶';
        playBtn.classList.remove('playing');
        if (typeof playBtn.setAttribute === 'function') playBtn.setAttribute('aria-pressed', 'false');
      }
    };
  },

  toggleMasterAudio() {
    const audioEl = document.getElementById('master-audio-element');
    if (!audioEl) return;
    if (audioEl.paused) {
      AudioController.stopCurrent();
      audioEl.play().catch(err => console.warn('Playback blocked:', err));
    } else {
      audioEl.pause();
    }
  },

  seekMasterAudio(event) {
    return;
  },

  stopMasterAudio() {
    if (typeof document === 'undefined') return false;
    const audioEl = document.getElementById('master-audio-element');
    if (audioEl) {
      try {
        audioEl.pause();
        return true;
      } catch (err) {
        console.warn('stopMasterAudio pause error:', err);
        return false;
      }
    }
    return false;
  },

  // ── Modal & Drawer Handlers ──
  openMobileDrawer() {
    if (typeof document === 'undefined') return false;
    const drawer = (typeof document.getElementById === 'function') ? document.getElementById('mobile-drawer') : null;
    if (drawer) {
      drawer.classList.add('open');
      if (typeof drawer.setAttribute === 'function') drawer.setAttribute('aria-hidden', 'false');
    }
    const trigger = (typeof document.querySelector === 'function') ? document.querySelector('.mobile-palette-trigger') : null;
    if (trigger && typeof trigger.setAttribute === 'function') trigger.setAttribute('aria-expanded', 'true');
    return true;
  },

  closeMobileDrawer() {
    if (typeof document === 'undefined') return false;
    const drawer = (typeof document.getElementById === 'function') ? document.getElementById('mobile-drawer') : null;
    if (drawer) {
      drawer.classList.remove('open');
      if (typeof drawer.setAttribute === 'function') drawer.setAttribute('aria-hidden', 'true');
    }
    const trigger = (typeof document.querySelector === 'function') ? document.querySelector('.mobile-palette-trigger') : null;
    if (trigger && typeof trigger.setAttribute === 'function') trigger.setAttribute('aria-expanded', 'false');
    return true;
  },

  // ── Exam Submission & Scoring ──
  confirmSubmit() {
    if (this._isSubmitting) return false;
    if (typeof document === 'undefined') return false;
    const qList = this.getActiveQuestionNumbers();
    const total = qList.length;
    const userAnswers = (this.userAnswers && typeof this.userAnswers === 'object') ? this.userAnswers : {};
    const answered = qList.filter(qNum => Boolean(userAnswers[qNum])).length;
    const unanswered = Math.max(0, total - answered);

    const modalEl = document.getElementById('submit-confirm-modal');
    if (!modalEl) {
      if (typeof window !== 'undefined' && typeof window.confirm === 'function' && window.confirm(`Bạn đã hoàn thành ${answered}/${total} câu hỏi. Bạn có chắc chắn muốn nộp bài không?`)) {
        this.submitExam(false);
      }
      return true;
    }

    // Save previous active focus
    if (document.activeElement) {
      this._lastFocusedElementModal = document.activeElement;
    }

    // Lock background scroll
    if (document.body && document.body.style) {
      this._prevBodyOverflowModal = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    const doneEl = document.getElementById('modal-stat-done');
    const leftEl = document.getElementById('modal-stat-left');
    const warningEl = document.getElementById('modal-warning-text');
    const btn = document.getElementById('btn-modal-confirm-submit');

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Xác nhận nộp bài';
    }

    if (doneEl) doneEl.textContent = `${answered}`;
    if (leftEl) leftEl.textContent = `${unanswered}`;

    if (warningEl) {
      if (unanswered > 0) {
        warningEl.innerHTML = `Bạn vẫn còn <strong style="color: #ef4444;">${unanswered} câu chưa trả lời</strong>.<br>Bạn có chắc chắn muốn kết thúc bài làm và xem kết quả ngay không?`;
      } else {
        warningEl.innerHTML = `🎉 Tuyệt vời! Bạn đã hoàn thành toàn bộ <strong style="color: #10b981;">${total}/${total}</strong> câu hỏi.<br>Bạn có muốn nộp bài để xem điểm chi tiết ngay bây giờ?`;
      }
    }

    modalEl.style.display = 'flex';

    // Focus cancel button or modal for accessibility
    const cancelBtn = modalEl.querySelector('.btn-secondary');
    if (cancelBtn && typeof cancelBtn.focus === 'function') {
      try { cancelBtn.focus(); } catch (_) {}
    }

    // Escape key listener & Focus Trap (WCAG 2.1 AA)
    if (this._modalKeyDownHandler) {
      document.removeEventListener('keydown', this._modalKeyDownHandler);
      this._modalKeyDownHandler = null;
    }

    const focusableSelectors = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    this._modalKeyDownHandler = (e) => {
      if (!e) return;
      if (e.key === 'Escape' || e.key === 'Esc') {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        this.closeSubmitModal();
        return;
      }
      if (e.key === 'Tab') {
        const focusables = Array.from(modalEl.querySelectorAll(focusableSelectors));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            if (last && typeof last.focus === 'function') last.focus();
          }
        } else {
          if (document.activeElement === last) {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            if (first && typeof first.focus === 'function') first.focus();
          }
        }
      }
    };
    document.addEventListener('keydown', this._modalKeyDownHandler);

    return true;
  },

  closeSubmitModal() {
    if (typeof document === 'undefined') return false;
    const modalEl = document.getElementById('submit-confirm-modal');
    if (modalEl) {
      modalEl.style.display = 'none';

      // Restore background scroll
      if (document.body && document.body.style) {
        document.body.style.overflow = (typeof this._prevBodyOverflowModal === 'string') ? this._prevBodyOverflowModal : '';
      }

      // Restore trigger focus
      if (this._lastFocusedElementModal && typeof this._lastFocusedElementModal.focus === 'function') {
        try { this._lastFocusedElementModal.focus(); } catch (_) {}
      }
      this._lastFocusedElementModal = null;

      // Remove modal keydown listener
      if (this._modalKeyDownHandler) {
        document.removeEventListener('keydown', this._modalKeyDownHandler);
        this._modalKeyDownHandler = null;
      }

      return true;
    }
    return false;
  },

  executeSubmit() {
    if (this._isSubmitting) return false;
    if (typeof document !== 'undefined') {
      const btn = document.getElementById('btn-modal-confirm-submit');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Đang chấm điểm...';
      }
    }
    this.closeSubmitModal();
    return this.submitExam(false);
  },

  submitExam(isAuto = false) {
    if (this._isSubmitting) return false;
    this._isSubmitting = true;

    this.stopTimer();
    this.closeSubmitModal();
    this.closeMobileDrawer();
    if (typeof UIRenderer !== 'undefined' && typeof UIRenderer.closeLightbox === 'function') {
      try { UIRenderer.closeLightbox(); } catch (_) {}
    }
    this.stopMasterAudio();
    if (typeof AudioController !== 'undefined' && typeof AudioController.stopCurrent === 'function') {
      try { AudioController.stopCurrent(); } catch (_) {}
    }

    const isPartMode = this.mode === 'part';
    const activeQNums = this.getActiveQuestionNumbers();
    const detailedQuestions = [];
    let totalCorrect = 0;
    let totalAnswered = 0;

    let correctCountLC = 0;
    let correctCountRC = 0;
    const partStats = {};

    const defaultParts = {
      part1: { name: 'Part 1: Photographs', count: 6, section: 'listening' },
      part2: { name: 'Part 2: Question-Response', count: 25, section: 'listening' },
      part3: { name: 'Part 3: Conversations', count: 39, section: 'listening' },
      part4: { name: 'Part 4: Short Talks', count: 30, section: 'listening' },
      part5: { name: 'Part 5: Incomplete Sentences', count: 30, section: 'reading' },
      part6: { name: 'Part 6: Text Completion', count: 16, section: 'reading' },
      part7: { name: 'Part 7: Reading Comprehension', count: 54, section: 'reading' }
    };
    const partsConfig = (typeof AppConfig !== 'undefined' && AppConfig.PARTS) ? AppConfig.PARTS : defaultParts;
    Object.keys(partsConfig).forEach(k => {
      partStats[k] = { correct: 0, total: partsConfig[k]?.count || 0, answered: 0 };
    });

    activeQNums.forEach(qNum => {
      let qObj = (this.allQuestionsMap && typeof this.allQuestionsMap === 'object') ? this.allQuestionsMap[qNum] : null;
      if (!qObj) {
        const fallbackPartKey = (qNum <= 6 ? 'part1' : qNum <= 31 ? 'part2' : qNum <= 70 ? 'part3' : qNum <= 100 ? 'part4' : qNum <= 130 ? 'part5' : qNum <= 146 ? 'part6' : 'part7');
        qObj = {
          questionNumber: qNum,
          part: fallbackPartKey,
          groupId: 'q_' + qNum,
          expectedRange: [qNum, qNum],
          questionText: `Câu ${qNum}`,
          correctAnswer: '',
          options: {},
          explanation: '',
          translation: '',
          analysis: '',
          isFirstInGroup: true
        };
      }

      const rawAns = (this.userAnswers && typeof this.userAnswers === 'object') ? this.userAnswers[qNum] : '';
      const userChoice = rawAns ? String(rawAns).trim().toUpperCase() : '';
      const correctChoice = (qObj && qObj.correctAnswer) ? String(qObj.correctAnswer).trim().toUpperCase() : '';
      const isCorrect = Boolean(userChoice && correctChoice && (userChoice === correctChoice));

      const partInfo = (typeof AppConfig !== 'undefined' && typeof AppConfig.getPartByQuestionNum === 'function')
        ? AppConfig.getPartByQuestionNum(qNum)
        : (partsConfig[qObj.part] ? { ...partsConfig[qObj.part], key: qObj.part } : null);
      const pKey = partInfo ? partInfo.key : (qObj.part || (qNum <= 6 ? 'part1' : qNum <= 31 ? 'part2' : qNum <= 70 ? 'part3' : qNum <= 100 ? 'part4' : qNum <= 130 ? 'part5' : qNum <= 146 ? 'part6' : 'part7'));
      const section = partInfo?.section || (qNum <= 100 ? 'listening' : 'reading');

      if (!partStats[pKey]) {
        partStats[pKey] = { correct: 0, total: partsConfig[pKey]?.count || 0, answered: 0 };
      }

      if (userChoice) {
        totalAnswered++;
        partStats[pKey].answered++;
      }

      if (isCorrect) {
        totalCorrect++;
        partStats[pKey].correct++;
        if (section === 'listening') correctCountLC++;
        if (section === 'reading') correctCountRC++;
      }

      detailedQuestions.push({
        questionNumber: qNum,
        part: pKey,
        groupId: qObj.groupId || ('q_' + qNum),
        expectedRange: qObj.expectedRange || [qNum, qNum],
        userChoice,
        correctChoice,
        isCorrect,
        questionText: qObj.questionText || '',
        imageUrl: qObj.imageUrl || '',
        audioUrl: qObj.audioUrl || qObj.groupAudioUrl || '',
        options: qObj.options || {},
        explanation: qObj.explanation || '',
        translation: qObj.translation || qObj.questionTranslation || '',
        optionsTranslation: qObj.optionsTranslation || {},
        analysis: qObj.analysis || '',
        tips: qObj.tips || '',
        groupTranscript: qObj.groupTranscript || '',
        groupTranslation: qObj.groupTranslation || '',
        groupSentences: qObj.groupSentences || [],
        groupPassages: qObj.groupPassages || [],
        isFirstInGroup: Boolean(qObj.isFirstInGroup)
      });
    });

    const totalQuestions = activeQNums.length;
    const initT = (typeof this.initialTime === 'number' && Number.isFinite(this.initialTime)) ? Math.floor(Math.max(0, this.initialTime)) : 120 * 60;
    const remT = (typeof this.timeRemaining === 'number' && Number.isFinite(this.timeRemaining)) ? Math.floor(Math.max(0, this.timeRemaining)) : 0;
    const timeSpentSeconds = Math.max(0, initT - remT);
    const accuracyRate = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

    let scaledLC = 0;
    let scaledRC = 0;
    let totalScore = 0;

    const calcLC = (typeof AppConfig !== 'undefined' && typeof AppConfig.calculateListeningScore === 'function')
      ? AppConfig.calculateListeningScore.bind(AppConfig)
      : (c) => Math.min(495, Math.max(5, Math.round((c * 4.95) / 5) * 5));
    const calcRC = (typeof AppConfig !== 'undefined' && typeof AppConfig.calculateReadingScore === 'function')
      ? AppConfig.calculateReadingScore.bind(AppConfig)
      : (c) => Math.min(495, Math.max(5, Math.round((c * 4.95) / 5) * 5));

    if (!isPartMode) {
      scaledLC = calcLC(correctCountLC);
      scaledRC = calcRC(correctCountRC);
      totalScore = scaledLC + scaledRC;
    } else {
      const partSec = (partsConfig[this.partFilter] && partsConfig[this.partFilter].section)
        ? partsConfig[this.partFilter].section
        : (['part1', 'part2', 'part3', 'part4'].includes(this.partFilter) ? 'listening' : 'reading');
      if (partSec === 'listening') {
        scaledLC = calcLC(totalCorrect);
        totalScore = scaledLC;
      } else {
        scaledRC = calcRC(totalCorrect);
        totalScore = scaledRC;
      }
    }

    const currentBook = (typeof AppConfig !== 'undefined' && typeof AppConfig.getSelectedBook === 'function')
      ? AppConfig.getSelectedBook()
      : 'EST 2022';
    const testNum = (Number.isFinite(this.testId) && this.testId > 0) ? Math.floor(this.testId) : 1;
    const testNumStr = testNum < 10 ? `0${testNum}` : `${testNum}`;
    const partInfo = this.partFilter ? partsConfig[this.partFilter] : null;
    const testTitle = isPartMode
      ? `${currentBook} — Test ${testNumStr} (${partInfo?.name || (typeof this.partFilter === 'string' ? this.partFilter.toUpperCase() : 'PART')})`
      : `${currentBook} — Test ${testNumStr}`;

    const resultId = 'result_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const resultDate = new Date().toISOString();

    const resultPayload = {
      id: resultId,
      date: resultDate,
      bookName: currentBook,
      testId: testNum,
      testTitle,
      mode: this.mode,
      partFilter: this.partFilter,
      partName: partInfo?.name || '',
      isAutoSubmit: Boolean(isAuto),
      isTimeout: Boolean(isAuto),
      totalCorrect,
      totalQuestions,
      answeredCount: totalAnswered,
      accuracyRate,
      correctCountLC,
      correctCountRC,
      scaledLC,
      scaledRC,
      totalScore,
      partStats,
      detailedQuestions,
      timeSpentSeconds
    };

    const storage = (typeof StorageService !== 'undefined')
      ? StorageService
      : (typeof window !== 'undefined' && window.StorageService ? window.StorageService : (typeof global !== 'undefined' ? global.StorageService : null));

    if (storage) {
      if (typeof storage.setCurrentResult === 'function') {
        try { storage.setCurrentResult(resultPayload); } catch (_) {}
      }
      if (typeof storage.saveExamResult === 'function') {
        try {
          const savedId = storage.saveExamResult(resultPayload);
          if (savedId && typeof savedId === 'string') {
            resultPayload.id = savedId;
            if (typeof storage.setCurrentResult === 'function') {
              try { storage.setCurrentResult(resultPayload); } catch (_) {}
            }
          }
        } catch (_) {}
      }
      if (typeof storage.clearActiveSession === 'function') {
        try { storage.clearActiveSession(); } catch (_) {}
      }
    }

    if (typeof window !== 'undefined' && window.location) {
      try {
        window.location.href = 'result.html';
      } catch (navErr) {
        console.warn('Navigation to result.html failed:', navErr);
      }
    }
    return resultPayload;
  },

  showLoading(isLoading) {
    const el = document.getElementById('exam-loading-state');
    if (el) el.style.display = isLoading ? 'flex' : 'none';
  },

  showError(msg) {
    const el = document.getElementById('exam-error-state');
    if (el) {
      el.style.display = 'block';
      el.querySelector('.error-msg-text').textContent = msg;
    }
  }
};

ExamEngine.PART_TIMES_SECONDS = PART_TIMES_SECONDS;

if (typeof window !== 'undefined') {
  window.ExamEngine = ExamEngine;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExamEngine;
}
