// ==========================================================================
// TOEIC MASTER — exam-engine.js
// Exam Lifecycle: Timer, State Management, Submission, Auto-Save
// ==========================================================================

const ExamEngine = {
  testId: 1,
  mode: 'full', // 'full' or 'part'
  partFilter: null, // 'part1'..'part7'
  testData: null,
  allQuestionsMap: {}, // qNum -> question object
  userAnswers: {},     // qNum -> 'A' | 'B' | 'C' | 'D'
  flaggedQuestions: new Set(),
  timeRemaining: 120 * 60, // 120 minutes in seconds
  timerInterval: null,
  startTime: null,

  async init() {
    // 1. Parse URL Parameters: ?test=1&mode=full or ?test=1&mode=part&part=part5
    const urlParams = new URLSearchParams(window.location.search);
    this.testId = parseInt(urlParams.get('test')) || 1;
    this.mode = urlParams.get('mode') || 'full';
    this.partFilter = urlParams.get('part') || null;

    // 2. Set default timer based on mode
    if (this.mode === 'full') {
      this.timeRemaining = 120 * 60; // 120 mins
    } else if (this.partFilter) {
      const partInfo = AppConfig.PARTS[this.partFilter];
      // Estimate ~45s per question
      this.timeRemaining = Math.max(10 * 60, (partInfo?.count || 30) * 50);
    } else {
      this.timeRemaining = 120 * 60;
    }

    // 3. Load database from API
    try {
      this.showLoading(true);
      const res = await fetch(AppConfig.getDatabaseUrl());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const db = await res.json();
      
      const currentTest = db.tests?.find(t => t.testId === this.testId) || db.tests?.[0];
      if (!currentTest) throw new Error('Không tìm thấy dữ liệu đề thi');
      this.testData = currentTest;

      // 4. Index all questions
      this.indexQuestions(currentTest);

      // 5. Check if we have an active session to restore
      this.restoreActiveSession();

      // 6. Render UI
      this.renderExamPage();

      // 7. Start timer
      this.startTimer();
      this.showLoading(false);
    } catch (err) {
      console.error('Failed to load exam data:', err);
      this.showError(`Không thể tải dữ liệu đề thi (${err.message}). Vui lòng kiểm tra file data/database_compiled.json.`);
    }
  },

  // Index questions for O(1) lookup
  indexQuestions(test) {
    this.allQuestionsMap = {};
    const lc = test.listening || {};
    const rc = test.reading || {};

    // Part 1 & 2
    (lc.part1?.questions || []).forEach(q => {
      q.part = 'part1';
      q.groupId = 'p1_q' + q.questionNumber;
      q.expectedRange = [q.questionNumber, q.questionNumber];
      this.allQuestionsMap[q.questionNumber] = q;
    });
    (lc.part2?.questions || []).forEach(q => {
      q.part = 'part2';
      q.groupId = 'p2_q' + q.questionNumber;
      q.expectedRange = [q.questionNumber, q.questionNumber];
      this.allQuestionsMap[q.questionNumber] = q;
    });

    // Part 3 & 4
    (lc.part3?.groups || []).forEach((g, gIdx) => {
      const gid = g.groupId || `p3_g${gIdx + 1}`;
      const range = g.expectedRange || [g.questions?.[0]?.questionNumber, g.questions?.[g.questions.length - 1]?.questionNumber];
      (g.questions || []).forEach((q, idx) => {
        q.part = 'part3';
        q.groupId = gid;
        q.expectedRange = range;
        q.groupTranscript = g.transcript || '';
        q.groupTranslation = g.passageTranslation || g.translation || '';
        q.groupAudioUrl = g.audioUrl || q.audioUrl || '';
        q.groupPassages = g.passages || [];
        q.isFirstInGroup = idx === 0;
        this.allQuestionsMap[q.questionNumber] = q;
      });
    });
    (lc.part4?.groups || []).forEach((g, gIdx) => {
      const gid = g.groupId || `p4_g${gIdx + 1}`;
      const range = g.expectedRange || [g.questions?.[0]?.questionNumber, g.questions?.[g.questions.length - 1]?.questionNumber];
      (g.questions || []).forEach((q, idx) => {
        q.part = 'part4';
        q.groupId = gid;
        q.expectedRange = range;
        q.groupTranscript = g.transcript || '';
        q.groupTranslation = g.passageTranslation || g.translation || '';
        q.groupAudioUrl = g.audioUrl || q.audioUrl || '';
        q.groupPassages = g.passages || [];
        q.isFirstInGroup = idx === 0;
        this.allQuestionsMap[q.questionNumber] = q;
      });
    });

    // Part 5
    (rc.part5?.questions || []).forEach(q => {
      q.part = 'part5';
      q.groupId = 'p5_q' + q.questionNumber;
      q.expectedRange = [q.questionNumber, q.questionNumber];
      this.allQuestionsMap[q.questionNumber] = q;
    });

    // Part 6 & 7
    (rc.part6?.groups || []).forEach((g, gIdx) => {
      const gid = g.groupId || `p6_g${gIdx + 1}`;
      const range = g.expectedRange || [g.questions?.[0]?.questionNumber, g.questions?.[g.questions.length - 1]?.questionNumber];
      (g.questions || []).forEach((q, idx) => {
        q.part = 'part6';
        q.groupId = gid;
        q.expectedRange = range;
        q.groupPassages = g.passages || [];
        q.groupTranslation = g.passageTranslation || g.translation || '';
        q.isFirstInGroup = idx === 0;
        this.allQuestionsMap[q.questionNumber] = q;
      });
    });
    (rc.part7?.groups || []).forEach((g, gIdx) => {
      const gid = g.groupId || `p7_g${gIdx + 1}`;
      const range = g.expectedRange || [g.questions?.[0]?.questionNumber, g.questions?.[g.questions.length - 1]?.questionNumber];
      (g.questions || []).forEach((q, idx) => {
        q.part = 'part7';
        q.groupId = gid;
        q.expectedRange = range;
        q.groupPassages = g.passages || [];
        q.groupTranslation = g.passageTranslation || g.translation || '';
        q.isFirstInGroup = idx === 0;
        this.allQuestionsMap[q.questionNumber] = q;
      });
    });
  },

  restoreActiveSession() {
    const saved = StorageService.getActiveSession();
    if (saved && saved.testId === this.testId && saved.mode === this.mode && saved.partFilter === this.partFilter) {
      // Check if session is recent (< 24 hours)
      if (Date.now() - saved.lastUpdated < 24 * 3600 * 1000) {
        this.userAnswers = saved.userAnswers || {};
        this.flaggedQuestions = new Set(saved.flaggedQuestions || []);
        if (saved.timeRemaining > 10) {
          this.timeRemaining = saved.timeRemaining;
        }
        console.log(`Restored active session: ${Object.keys(this.userAnswers).length} answers restored.`);
      }
    }
  },

  saveCurrentProgress() {
    StorageService.saveActiveSession({
      testId: this.testId,
      mode: this.mode,
      partFilter: this.partFilter,
      userAnswers: this.userAnswers,
      flaggedQuestions: Array.from(this.flaggedQuestions),
      timeRemaining: this.timeRemaining
    });
  },

  startTimer() {
    this.startTime = Date.now();
    this.updateTimerDisplay();
    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.timeRemaining--;
      this.updateTimerDisplay();
      if (this.timeRemaining % 5 === 0) {
        this.saveCurrentProgress(); // Auto-save every 5s
      }
      if (this.timeRemaining <= 0) {
        clearInterval(this.timerInterval);
        alert('Hết giờ làm bài! Hệ thống sẽ tự động nộp bài.');
        this.submitExam(true);
      }
    }, 1000);
  },

  updateTimerDisplay() {
    const timerEls = document.querySelectorAll('.exam-timer-val');
    const m = Math.floor(this.timeRemaining / 60);
    const s = this.timeRemaining % 60;
    const timeStr = `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;

    timerEls.forEach(el => {
      el.textContent = timeStr;
      const wrap = el.closest('.exam-timer');
      if (wrap) {
        if (this.timeRemaining <= 300) {
          wrap.className = 'exam-timer danger';
        } else if (this.timeRemaining <= 900) {
          wrap.className = 'exam-timer warning';
        }
      }
    });
  },

  selectAnswer(qNum, optLetter) {
    if (this.userAnswers[qNum] === optLetter) {
      delete this.userAnswers[qNum]; // Toggle off if clicked again
    } else {
      this.userAnswers[qNum] = optLetter;
    }

    // Update question options UI
    const qItem = document.getElementById(`q_item_${qNum}`);
    if (qItem) {
      qItem.querySelectorAll('.option-btn').forEach(btn => {
        const letter = btn.querySelector('.option-letter').textContent.replace(/[()]/g, '').trim();
        if (letter === this.userAnswers[qNum]) {
          btn.classList.add('selected');
        } else {
          btn.classList.remove('selected');
        }
      });
    }

    // Update Palette UI
    this.updatePaletteUI();
    this.saveCurrentProgress();
  },

  toggleFlag(qNum) {
    if (this.flaggedQuestions.has(qNum)) {
      this.flaggedQuestions.delete(qNum);
    } else {
      this.flaggedQuestions.add(qNum);
    }

    // Update question flag button
    const qItem = document.getElementById(`q_item_${qNum}`);
    if (qItem) {
      const btn = qItem.querySelector('.flag-btn');
      if (btn) {
        const isFlagged = this.flaggedQuestions.has(qNum);
        btn.className = `flag-btn ${isFlagged ? 'flagged' : ''}`;
        btn.innerHTML = isFlagged ? '🚩' : '🏳️';
        btn.title = isFlagged ? 'Bỏ gắn cờ' : 'Gắn cờ xem lại';
      }
    }

    this.updatePaletteUI();
    this.saveCurrentProgress();
  },

  scrollToQuestion(qNum) {
    const el = document.getElementById(`q_item_${qNum}`);
    if (el) {
      const headerOffset = 80;
      const elPos = el.getBoundingClientRect().top;
      const offsetPos = elPos + window.pageYOffset - headerOffset;
      window.scrollTo({ top: offsetPos, behavior: 'smooth' });

      // Highlight active
      document.querySelectorAll('.question-item.active').forEach(i => i.classList.remove('active'));
      el.classList.add('active');

      // Close mobile drawer if open
      this.closeMobileDrawer();
    }
  },

  updatePaletteUI() {
    const paletteContainers = document.querySelectorAll('.palette-container-wrapper');
    const totalCount = this.getTotalQuestionsCount();
    const html = UIRenderer.renderPalette(totalCount, this.userAnswers, this.flaggedQuestions);
    paletteContainers.forEach(c => c.innerHTML = html);

    // Update mobile bottom bar badge
    const answeredCount = Object.keys(this.userAnswers).length;
    const badgeEl = document.getElementById('mobile-answered-badge');
    if (badgeEl) {
      badgeEl.textContent = `${answeredCount}/${totalCount}`;
    }
  },

  getTotalQuestionsCount() {
    if (this.mode === 'part' && this.partFilter) {
      return AppConfig.PARTS[this.partFilter]?.count || 200;
    }
    return 200;
  },

  renderExamPage() {
    const container = document.getElementById('exam-questions-list');
    if (!container) return;

    let html = '';
    const lc = this.testData.listening || {};
    const rc = this.testData.reading || {};

    const shouldRenderPart = (partKey) => {
      if (this.mode === 'full') return true;
      return this.partFilter === partKey;
    };

    // Helper to render compact modern divider
    const renderPartDivider = (badge, name, range) => `
      <div class="part-section-divider">
        <span class="part-badge">${badge}</span>
        <span class="part-name">${name}</span>
        <span class="part-range">${range}</span>
      </div>
    `;

    // Master Continuous Audio for Listening (Part 1 - 4) in Header
    const hasListening = this.mode === 'full' || ['part1', 'part2', 'part3', 'part4'].includes(this.partFilter);
    const headerPlayer = document.getElementById('master-lc-card');
    if (headerPlayer) {
      headerPlayer.style.display = hasListening ? 'flex' : 'none';
    }

    // Part 1
    if (shouldRenderPart('part1')) {
      html += renderPartDivider('Part 1', 'Photographs', 'Câu 1 – 6');
      (lc.part1?.questions || []).forEach(q => {
        html += UIRenderer.renderPart1(q, this.userAnswers[q.questionNumber], this.flaggedQuestions.has(q.questionNumber));
      });
    }

    // Part 2
    if (shouldRenderPart('part2')) {
      html += renderPartDivider('Part 2', 'Question-Response', 'Câu 7 – 31');
      (lc.part2?.questions || []).forEach(q => {
        html += UIRenderer.renderPart2(q, this.userAnswers[q.questionNumber], this.flaggedQuestions.has(q.questionNumber));
      });
    }

    // Part 3
    if (shouldRenderPart('part3')) {
      html += renderPartDivider('Part 3', 'Conversations', 'Câu 32 – 70');
      (lc.part3?.groups || []).forEach(g => {
        html += UIRenderer.renderGroupAudio(g, 'part3', this.userAnswers, this.flaggedQuestions);
      });
    }

    // Part 4
    if (shouldRenderPart('part4')) {
      html += renderPartDivider('Part 4', 'Short Talks', 'Câu 71 – 100');
      (lc.part4?.groups || []).forEach(g => {
        html += UIRenderer.renderGroupAudio(g, 'part4', this.userAnswers, this.flaggedQuestions);
      });
    }

    // Part 5
    if (shouldRenderPart('part5')) {
      html += renderPartDivider('Part 5', 'Incomplete Sentences', 'Câu 101 – 130');
      (lc.part5?.questions || rc.part5?.questions || []).forEach(q => {
        html += UIRenderer.renderPart5(q, this.userAnswers[q.questionNumber], this.flaggedQuestions.has(q.questionNumber));
      });
    }

    // Part 6
    if (shouldRenderPart('part6')) {
      html += renderPartDivider('Part 6', 'Text Completion', 'Câu 131 – 146');
      (rc.part6?.groups || []).forEach(g => {
        html += UIRenderer.renderReadingGroup(g, 'part6', this.userAnswers, this.flaggedQuestions);
      });
    }

    // Part 7
    if (shouldRenderPart('part7')) {
      html += renderPartDivider('Part 7', 'Reading Comprehension', 'Câu 147 – 200');
      (rc.part7?.groups || []).forEach(g => {
        html += UIRenderer.renderReadingGroup(g, 'part7', this.userAnswers, this.flaggedQuestions);
      });
    }

    container.innerHTML = html;
    if (hasListening) {
      this.initMasterAudio();
    }
    this.updatePaletteUI();
  },

  // ── Master LC Audio Controls ──
  initMasterAudio() {
    const audioEl = document.getElementById('master-audio-element');
    if (!audioEl) return;
    const url = AppConfig.getFullLcAudioUrl(this.testId);
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
      }
    };

    audioEl.onpause = () => {
      if (playBtn) {
        playBtn.innerHTML = '▶';
        playBtn.classList.remove('playing');
      }
    };

    audioEl.onended = () => {
      if (playBtn) {
        playBtn.innerHTML = '▶';
        playBtn.classList.remove('playing');
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
    // ETS rules: candidate cannot scrub or seek audio during the exam!
    return;
  },

  toggleMasterMute() {
    const audioEl = document.getElementById('master-audio-element');
    const muteBtn = document.getElementById('master-mute-btn');
    if (!audioEl) return;
    audioEl.muted = !audioEl.muted;
    if (muteBtn) {
      muteBtn.textContent = audioEl.muted ? '🔇' : '🔊';
    }
  },

  stopMasterAudio() {
    const audioEl = document.getElementById('master-audio-element');
    if (audioEl) {
      audioEl.pause();
    }
  },

  // ── Modal & Drawer Handlers ──
  openMobileDrawer() {
    const drawer = document.getElementById('mobile-drawer');
    if (drawer) drawer.classList.add('open');
  },

  closeMobileDrawer() {
    const drawer = document.getElementById('mobile-drawer');
    if (drawer) drawer.classList.remove('open');
  },

  // ── Total Questions Count Helper ──
  getTotalQuestionsCount() {
    if (this.mode === 'part' && this.partFilter) {
      return AppConfig.PARTS[this.partFilter]?.count || Object.keys(this.allQuestionsMap).length || 200;
    }
    return Object.keys(this.allQuestionsMap).length || 200;
  },

  // ── Exam Submission & Scoring ──
  confirmSubmit() {
    const total = this.getTotalQuestionsCount();
    const answered = Object.keys(this.userAnswers).length;
    const unanswered = Math.max(0, total - answered);

    const modalEl = document.getElementById('submit-confirm-modal');
    if (!modalEl) {
      if (window.confirm(`Bạn đã hoàn thành ${answered}/${total} câu hỏi. Bạn có chắc chắn muốn nộp bài không?`)) {
        this.submitExam(false);
      }
      return;
    }

    const doneEl = document.getElementById('modal-stat-done');
    const leftEl = document.getElementById('modal-stat-left');
    const warningEl = document.getElementById('modal-warning-text');

    if (doneEl) doneEl.textContent = `${answered}`;
    if (leftEl) leftEl.textContent = `${unanswered}`;

    if (warningEl) {
      if (unanswered > 0) {
        warningEl.innerHTML = `Bạn vẫn còn <strong style="color: #ef4444;">${unanswered} câu chưa trả lời</strong>.<br>Bạn có chắc chắn muốn kết thúc bài thi và xem kết quả ngay không?`;
      } else {
        warningEl.innerHTML = `🎉 Tuyệt vời! Bạn đã hoàn thành toàn bộ <strong style="color: #10b981;">${total}/${total}</strong> câu hỏi.<br>Bạn có muốn nộp bài để xem điểm chi tiết ngay bây giờ?`;
      }
    }

    modalEl.style.display = 'flex';
  },

  closeSubmitModal() {
    const modalEl = document.getElementById('submit-confirm-modal');
    if (modalEl) modalEl.style.display = 'none';
  },

  executeSubmit() {
    const btn = document.getElementById('btn-modal-confirm-submit');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Đang chấm điểm...';
    }
    this.closeSubmitModal();
    this.submitExam(false);
  },

  submitExam(isAuto = false) {
    clearInterval(this.timerInterval);
    this.stopMasterAudio();
    AudioController.stopCurrent();

    // 1. Calculate Results
    let correctCountLC = 0;
    let correctCountRC = 0;
    let totalCorrect = 0;
    const partStats = {};

    Object.keys(AppConfig.PARTS).forEach(k => {
      partStats[k] = { correct: 0, total: AppConfig.PARTS[k].count, answered: 0 };
    });

    const detailedQuestions = [];

    // Evaluate each question
    for (let qNum = 1; qNum <= 200; qNum++) {
      const qObj = this.allQuestionsMap[qNum];
      if (!qObj) continue;

      const userChoice = this.userAnswers[qNum] || '';
      const correctChoice = (qObj.correctAnswer || '').toUpperCase();
      const isCorrect = userChoice && correctChoice && (userChoice === correctChoice);

      const partInfo = AppConfig.getPartByQuestionNum(qNum);
      if (partInfo) {
        if (userChoice) partStats[partInfo.key].answered++;
        if (isCorrect) {
          partStats[partInfo.key].correct++;
          if (partInfo.section === 'listening') correctCountLC++;
          if (partInfo.section === 'reading') correctCountRC++;
          totalCorrect++;
        }
      }

      detailedQuestions.push({
        questionNumber: qNum,
        part: partInfo ? partInfo.key : (qObj.part || ''),
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
        groupTranscript: qObj.groupTranscript || '',
        groupTranslation: qObj.groupTranslation || '',
        groupPassages: qObj.groupPassages || [],
        isFirstInGroup: Boolean(qObj.isFirstInGroup)
      });
    }

    const scaledLC = AppConfig.calculateListeningScore(correctCountLC);
    const scaledRC = AppConfig.calculateReadingScore(correctCountRC);
    const totalScore = scaledLC + scaledRC;

    const resultPayload = {
      testId: this.testId,
      testTitle: `EST 2022 — Test ${this.testId < 10 ? '0' : ''}${this.testId}`,
      mode: this.mode,
      partFilter: this.partFilter,
      totalCorrect,
      totalQuestions: this.getTotalQuestionsCount(),
      correctCountLC,
      correctCountRC,
      scaledLC,
      scaledRC,
      totalScore,
      partStats,
      detailedQuestions,
      timeSpentSeconds: (this.mode === 'full' ? 120 * 60 : 3600) - this.timeRemaining
    };

    // 2. Save result and clear active session
    StorageService.setCurrentResult(resultPayload);
    StorageService.saveExamResult(resultPayload);
    StorageService.clearActiveSession();

    // 3. Redirect to Result Page
    window.location.href = 'result.html';
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

window.ExamEngine = ExamEngine;
