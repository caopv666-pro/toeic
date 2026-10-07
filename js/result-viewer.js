// ==========================================================================
// TOEIC MASTER — result-viewer.js
// Result Calculation, Score Overview, and Collapsible Explanations (Accordion)
// ==========================================================================

const ResultViewer = {
  resultData: null,
  currentStatusFilter: 'all', // 'all', 'correct', 'wrong', 'unanswered'
  currentPartFilter: 'all',   // 'all', 'part1', 'part2', 'part3', 'part4', 'part5', 'part6', 'part7'

  async init() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlTestId = parseInt(urlParams.get('test')) || null;
    const urlResultId = urlParams.get('id');

    if (urlResultId) {
      const history = StorageService.getExamHistory();
      const match = history.find(h => h.id === urlResultId);
      if (match) {
        this.resultData = match;
      }
    }

    if (!this.resultData && urlTestId) {
      const current = StorageService.getCurrentResult();
      if (current && parseInt(current.testId) === urlTestId) {
        this.resultData = current;
      } else {
        const history = StorageService.getExamHistory();
        const match = history.find(h => parseInt(h.testId) === urlTestId);
        if (match) {
          this.resultData = match;
        }
      }
    }

    if (!this.resultData) {
      this.resultData = StorageService.getCurrentResult();
    }

    // If user requested a specific ?test=N and current resultData does not match, or if no resultData:
    if (urlTestId && (!this.resultData || parseInt(this.resultData.testId) !== urlTestId)) {
      await this.loadReviewModeFromDB(urlTestId);
    }

    if (!this.resultData) {
      alert('Không tìm thấy kết quả bài thi. Đang chuyển về trang chủ...');
      window.location.href = 'index.html';
      return;
    }

    this.renderSummary();
    this.updateFilterCounts();

    // CRITICAL: Always rehydrate full media (images, audio, passages) and clean explanations before render
    await this.rehydrateExplanationsFromDB();
    this.renderDetailedReview();
  },

  async loadReviewModeFromDB(testId) {
    try {
      const url = AppConfig.getDatabaseUrl();
      const res = await fetch(url);
      if (!res.ok) return;
      const db = await res.json();
      const tests = db.tests || (Array.isArray(db) ? db : [db]);
      const currentTest = tests.find(t => t.testId === testId || t.id === testId) || tests[0];
      if (!currentTest) return;

      const detailedQuestions = [];
      const partStats = {};
      Object.keys(AppConfig.PARTS).forEach(k => {
        partStats[k] = { total: AppConfig.PARTS[k].count, correct: AppConfig.PARTS[k].count, answered: AppConfig.PARTS[k].count };
      });

      const lc = currentTest.listening || {};
      const rc = currentTest.reading || {};

      // Part 1
      (lc.part1?.questions || []).forEach(q => {
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
          groupTranscript: '',
          groupTranslation: '',
          groupPassages: [],
          isFirstInGroup: true
        });
      });

      // Part 2
      (lc.part2?.questions || []).forEach(q => {
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
          groupTranscript: '',
          groupTranslation: '',
          groupPassages: [],
          isFirstInGroup: true
        });
      });

      // Part 3
      (lc.part3?.groups || []).forEach((g, gIdx) => {
        const gid = g.groupId || `p3_g${gIdx + 1}`;
        const range = g.expectedRange || [g.questions?.[0]?.questionNumber, g.questions?.[g.questions.length - 1]?.questionNumber];
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
            imageUrl: '',
            audioUrl: g.audioUrl || q.audioUrl || '',
            options: q.options || {},
            explanation: q.explanation || '',
            translation: q.questionTranslation || q.translation || '',
            optionsTranslation: q.optionsTranslation || {},
            analysis: q.analysis || '',
            groupTranscript: g.transcript || '',
            groupTranslation: g.passageTranslation || g.translation || '',
            groupPassages: g.passages || [],
            isFirstInGroup: idx === 0
          });
        });
      });

      // Part 4
      (lc.part4?.groups || []).forEach((g, gIdx) => {
        const gid = g.groupId || `p4_g${gIdx + 1}`;
        const range = g.expectedRange || [g.questions?.[0]?.questionNumber, g.questions?.[g.questions.length - 1]?.questionNumber];
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
            imageUrl: '',
            audioUrl: g.audioUrl || q.audioUrl || '',
            options: q.options || {},
            explanation: q.explanation || '',
            translation: q.questionTranslation || q.translation || '',
            optionsTranslation: q.optionsTranslation || {},
            analysis: q.analysis || '',
            groupTranscript: g.transcript || '',
            groupTranslation: g.passageTranslation || g.translation || '',
            groupPassages: g.passages || [],
            isFirstInGroup: idx === 0
          });
        });
      });

      // Part 5
      (rc.part5?.questions || []).forEach(q => {
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
          groupTranscript: '',
          groupTranslation: '',
          groupPassages: [],
          isFirstInGroup: true
        });
      });

      // Part 6
      (rc.part6?.groups || []).forEach((g, gIdx) => {
        const gid = g.groupId || `p6_g${gIdx + 1}`;
        const range = g.expectedRange || [g.questions?.[0]?.questionNumber, g.questions?.[g.questions.length - 1]?.questionNumber];
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
            groupTranscript: '',
            groupTranslation: g.passageTranslation || g.translation || '',
            groupPassages: g.passages || [],
            isFirstInGroup: idx === 0
          });
        });
      });

      // Part 7
      (rc.part7?.groups || []).forEach((g, gIdx) => {
        const gid = g.groupId || `p7_g${gIdx + 1}`;
        const range = g.expectedRange || [g.questions?.[0]?.questionNumber, g.questions?.[g.questions.length - 1]?.questionNumber];
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
            groupTranscript: '',
            groupTranslation: g.passageTranslation || g.translation || '',
            groupPassages: g.passages || [],
            isFirstInGroup: idx === 0
          });
        });
      });

      this.resultData = {
        testId: testId,
        testTitle: `EST 2022 — Test ${testId < 10 ? '0' : ''}${testId} (Chế độ xem đáp án & giải thích)`,
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

      StorageService.setCurrentResult(this.resultData);
    } catch (e) {
      console.warn('loadReviewModeFromDB failed:', e);
    }
  },

  formatTime(totalSeconds) {
    if (!totalSeconds || totalSeconds < 0) return '0 phút';
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m} phút ${s > 0 ? s + 's' : ''}`;
  },

  // ── Render Top Overview (Score Hero & Part Breakdown) ──
  renderSummary() {
    const r = this.resultData;
    const titleEl = document.getElementById('result-test-title');
    if (titleEl) titleEl.textContent = r.testTitle;

    const timeEl = document.getElementById('result-time-spent');
    if (timeEl) timeEl.textContent = `⏱️ Thời gian làm bài: ${this.formatTime(r.timeSpentSeconds)}`;

    const totalScoreEl = document.getElementById('result-total-score');
    if (totalScoreEl) totalScoreEl.textContent = r.totalScore;

    const lcScoreEl = document.getElementById('result-lc-score');
    if (lcScoreEl) lcScoreEl.textContent = `${r.scaledLC} / 495`;

    const rcScoreEl = document.getElementById('result-rc-score');
    if (rcScoreEl) rcScoreEl.textContent = `${r.scaledRC} / 495`;

    const totalCorrectEl = document.getElementById('result-total-correct');
    if (totalCorrectEl) totalCorrectEl.textContent = `${r.totalCorrect} / ${r.totalQuestions}`;

    // Render Part Breakdown Grid
    const partGrid = document.getElementById('result-part-breakdown');
    if (partGrid && r.partStats) {
      let partHtml = '';
      for (const [key, stat] of Object.entries(r.partStats)) {
        const partInfo = AppConfig.PARTS[key];
        const pct = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
        partHtml += `
          <div class="part-stat-card">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 700; font-size: 0.95rem;">${partInfo?.name || key}</span>
              <span style="font-weight: 700; color: ${pct >= 70 ? 'var(--success)' : (pct >= 50 ? 'var(--warning)' : 'var(--danger)')};">
                ${pct}% (${stat.correct}/${stat.total})
              </span>
            </div>
            <div class="part-progress-bar">
              <div class="part-progress-fill" style="width: ${pct}%; background: ${pct >= 70 ? 'var(--success)' : (pct >= 50 ? 'var(--warning)' : 'var(--danger)')};"></div>
            </div>
          </div>
        `;
      }
      partGrid.innerHTML = partHtml;
    }
  },

  // ── Show / Hide Detailed Review Section ──
  showDetailedReviewSection() {
    const section = document.getElementById('detailed-review-section');
    if (section) {
      section.style.display = 'block';
      const offsetTop = section.getBoundingClientRect().top + window.pageYOffset - 80;
      window.scrollTo({ top: offsetTop, behavior: 'smooth' });
    }
  },

  // ── Update Filter Button Counts (Real-time numbers for all/correct/wrong/unanswered) ──
  updateFilterCounts() {
    if (!this.resultData || !this.resultData.detailedQuestions) return;
    const questions = this.resultData.detailedQuestions;
    const total = questions.length;
    let correct = 0;
    let wrong = 0;
    let unanswered = 0;

    questions.forEach(q => {
      if (q.isCorrect) {
        correct++;
      } else if (q.userChoice) {
        wrong++;
      } else {
        unanswered++;
      }
    });

    const cAll = document.getElementById('count-all');
    if (cAll) cAll.textContent = `(${total})`;
    const cCorrect = document.getElementById('count-correct');
    if (cCorrect) cCorrect.textContent = `(${correct})`;
    const cWrong = document.getElementById('count-wrong');
    if (cWrong) cWrong.textContent = `(${wrong})`;
    const cUnanswered = document.getElementById('count-unanswered');
    if (cUnanswered) cUnanswered.textContent = `(${unanswered})`;
  },

  // ── Status Filter: All / Correct / Wrong / Unanswered ──
  setStatusFilter(status) {
    this.currentStatusFilter = status;
    document.querySelectorAll('#status-filter-group .filter-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.status === status);
    });
    this.renderDetailedReview();
  },

  // ── Part Filter: All / Part 1 .. Part 7 ──
  setPartFilter(part) {
    this.currentPartFilter = part;
    document.querySelectorAll('#part-filter-group .filter-pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.part === part);
    });
    this.renderDetailedReview();
  },

  // Backward compatibility
  setFilter(filterType) {
    this.setStatusFilter(filterType);
  },

  // ── Render Detailed Review List (Grouped for Part 3, 4, 6, 7; Single for 1, 2, 5) ──
  renderDetailedReview() {
    const container = document.getElementById('review-questions-container');
    if (!container || !this.resultData) return;

    const questions = this.resultData.detailedQuestions || [];
    let filtered = questions;

    // Filter by Part
    if (this.currentPartFilter !== 'all') {
      filtered = filtered.filter(q => {
        const pInfo = AppConfig.getPartByQuestionNum(q.questionNumber);
        const pKey = pInfo ? pInfo.key : (q.part || '');
        return pKey.toLowerCase() === this.currentPartFilter.toLowerCase();
      });
    }

    // Filter by Status
    if (this.currentStatusFilter === 'correct') {
      filtered = filtered.filter(q => q.isCorrect);
    } else if (this.currentStatusFilter === 'wrong') {
      filtered = filtered.filter(q => q.userChoice && !q.isCorrect);
    } else if (this.currentStatusFilter === 'unanswered') {
      filtered = filtered.filter(q => !q.userChoice);
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

    filtered.forEach(q => {
      const isGroupedPart = ['part3', 'part4', 'part6', 'part7'].includes(q.part);
      if (isGroupedPart && q.groupId) {
        if (currentGroup && currentGroup.groupId === q.groupId) {
          if (!currentGroup.groupTranslation && (q.groupTranslation || q.passageTranslation || q.translation)) {
            currentGroup.groupTranslation = q.groupTranslation || q.passageTranslation || q.translation;
          }
          if ((!currentGroup.groupPassages || currentGroup.groupPassages.length === 0) && (q.groupPassages && q.groupPassages.length > 0)) {
            currentGroup.groupPassages = q.groupPassages;
          }
          if (!currentGroup.groupAudioUrl && (q.audioUrl || q.groupAudioUrl)) {
            currentGroup.groupAudioUrl = q.audioUrl || q.groupAudioUrl;
          }
          currentGroup.questions.push(q);
        } else {
          currentGroup = {
            type: 'group',
            groupId: q.groupId,
            part: q.part,
            expectedRange: q.expectedRange || [q.questionNumber, q.questionNumber],
            groupPassages: q.groupPassages || [],
            groupTranscript: q.groupTranscript || '',
            groupTranslation: q.groupTranslation || q.passageTranslation || q.translation || '',
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

    container.innerHTML = html;
  },

  // ── Render Standalone Question Review (Part 1, Part 2, Part 5) ──
  renderSingleQuestionReview(q) {
    const qNum = q.questionNumber;
    const userChoice = q.userChoice;
    const correctChoice = q.correctChoice;
    const isCorrect = q.isCorrect;
    const hasExplanation = Boolean(q.explanation || q.translation || q.analysis || q.optionsTranslation);
    const audioUrl = q.audioUrl;
    const imgUrl = AppConfig.resolveAssetUrl(q.imageUrl);
    const playerId = `review_player_${qNum}`;
    const partInfo = AppConfig.getPartByQuestionNum(qNum);
    const partKey = partInfo ? partInfo.key : (q.part || '');

    // Clean redundant ETS boilerplate prompt for Part 1 photographs
    let cleanQuestionText = q.questionText || '';
    if (/^Look at the picture marked number \d+ in your test book\.?/i.test(cleanQuestionText.trim())) {
      cleanQuestionText = '';
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

        <!-- Part 2: Spoken Question Script -->
        ${(partKey === 'part2' && cleanQuestionText) ? `
          <div style="background: rgba(99, 102, 241, 0.12); border-left: 3px solid var(--accent-primary); padding: 8px 12px; border-radius: var(--radius-sm); margin: 8px 0 12px;">
            <span style="font-size: 0.72rem; font-weight: 700; color: var(--accent-secondary); text-transform: uppercase;">🔊 Lời thoại câu hỏi:</span>
            <p style="font-size: 0.92rem; font-weight: 600; color: var(--text-primary); margin-top: 2px;">"${cleanQuestionText}"</p>
          </div>
        ` : ''}

        <!-- Question Text for Part 1, 5 -->
        ${(partKey !== 'part2' && cleanQuestionText) ? `<p class="question-text" style="font-size: 0.98rem; font-weight: 600; margin: 10px 0 12px; line-height: 1.5;">${cleanQuestionText}</p>` : ''}

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
          <button class="explanation-toggle-btn" id="toggle_btn_${qNum}" onclick="ResultViewer.toggleExplanation(${qNum})">
            <span>💡 Xem giải thích & Dịch nghĩa</span>
            <span class="arrow-icon">▼</span>
          </button>

          <div class="explanation-panel" id="panel_exp_${qNum}">
            ${this.renderExplanationContent(q, hasExplanation)}
          </div>
        </div>
      </div>
    `;
  },

  // ── Render Grouped Questions Review (Parts 3, 4, 6, 7) — 1 Image/Audio Block + Sub-questions underneath ──
  renderGroupQuestionReview(group) {
    const isReading = ['part6', 'part7'].includes(group.part);
    const gid = group.groupId;
    const range = group.expectedRange || [0, 0];
    const badgeLabel = group.part === 'part6' ? 'Part 6: Điền từ vào đoạn văn'
      : group.part === 'part7' ? 'Part 7: Đọc hiểu đoạn văn'
      : group.part === 'part3' ? 'Part 3: Hội thoại (Conversations)'
      : 'Part 4: Bài nói ngắn (Short Talks)';

    return `
      <div class="group-review-card animate-fade-in" id="group_review_${gid}">
        <!-- Group Header -->
        <div class="group-review-header">
          <span class="group-review-badge">
            ${isReading ? '📖' : '🎧'} ${badgeLabel} (Câu ${range[0]} - ${range[1]})
          </span>
          <span class="group-review-meta">
            ${group.questions.length} câu hỏi hiển thị
          </span>
        </div>

        <!-- Listening (Part 3 & 4): Group Audio Player & Graphic -->
        ${!isReading && group.groupAudioUrl ? UIRenderer.renderAudioPlayer(`review_player_${gid}`, group.groupAudioUrl, `Nghe lại đoạn thoại Câu ${range[0]} - ${range[1]}`) : ''}

        ${!isReading && group.groupPassages && group.groupPassages.length > 0 ? `
          <div class="group-passages-wrap" style="margin: 8px 0;">
            ${group.groupPassages.map(p => {
              const pUrl = typeof p === 'string' ? p : p.imageUrl;
              const fullUrl = AppConfig.resolveAssetUrl(pUrl);
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
            <summary>📜 Xem Lời thoại bài nghe (Audio Transcript) & Bản dịch</summary>
            <div style="margin-top: 10px; font-size: 0.86rem; line-height: 1.55; color: var(--text-primary);">
              ${this.formatDialogue(group.groupTranscript)}
            </div>
            ${group.groupTranslation ? `
              <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--border-glass);">
                <strong style="color: var(--accent-secondary); font-size: 0.82rem; display: block; margin-bottom: 6px;">🌐 Bản dịch tiếng Việt:</strong>
                <div>${this.formatDialogue(group.groupTranslation)}</div>
              </div>
            ` : ''}
          </details>
        ` : ''}

        <!-- Reading (Part 6 & 7): 1 Passage Image Container with Interactive Sentence Translation -->
        ${isReading && group.groupPassages && group.groupPassages.length > 0 ? `
          <div class="group-passages-wrap">
            ${group.groupPassages.map((p, pIdx) => {
              const pUrl = typeof p === 'string' ? p : p.imageUrl;
              const fullUrl = AppConfig.resolveAssetUrl(pUrl);
              const hasSentences = p && p.sentences && p.sentences.length > 0;
              return `
                <div class="interactive-passage-container" id="pass_wrap_${gid}_${pIdx}">
                  <div class="passage-click-hint">
                    <span>👆 <strong>Chạm vào câu trên ảnh</strong> để xem dịch & giải thích</span>
                    <button class="image-zoom-btn-pill" onclick="UIRenderer.openLightbox('${fullUrl}')" title="Phóng to ảnh">🔍 Phóng to</button>
                  </div>

                  <div class="passage-image-wrap">
                    <img src="${fullUrl}" alt="Passage ${pIdx + 1}"
                         class="interactive-passage-img"
                         id="img_${gid}_${pIdx}"
                         onload="ResultViewer.setupPassageOverlays(this, '${gid}', ${pIdx})"
                         onclick="ResultViewer.handlePassageImageClick(event, this, '${gid}', ${pIdx})">
                    <div class="passage-overlays-layer" id="overlays_${gid}_${pIdx}"></div>
                  </div>

                  <!-- Sentence Lookup Card -->
                  <div class="sentence-lookup-card" id="sentence_card_${gid}_${pIdx}" style="display: none;">
                    <div class="sentence-lookup-header">
                      <span class="sentence-badge" id="sentence_badge_${gid}_${pIdx}">Câu 1</span>
                      <button class="sentence-close-btn" onclick="ResultViewer.closeSentenceCard('${gid}', ${pIdx})">&times;</button>
                    </div>
                    <div class="sentence-text-en" id="sentence_en_${gid}_${pIdx}"></div>
                    <div class="sentence-text-vi" id="sentence_vi_${gid}_${pIdx}"></div>
                    <div class="sentence-text-note" id="sentence_note_${gid}_${pIdx}"></div>
                  </div>

                  ${hasSentences ? `
                    <div class="sentence-pills-row" id="pills_${gid}_${pIdx}">
                      <span class="sentence-pills-label">Dịch từng câu:</span>
                      ${p.sentences.map((s, sIdx) => `
                        <button class="sentence-pill-btn" id="pill_${gid}_${pIdx}_${sIdx}" onclick="ResultViewer.selectSentence('${gid}', ${pIdx}, ${sIdx})">
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

        <!-- Reading (Part 6 & 7): Master Passage Translation Accordion -->
        ${isReading && group.groupTranslation ? `
          <details class="passage-master-translation">
            <summary>📖 Xem toàn văn bản dịch Tiếng Việt của bài đọc này</summary>
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
    const hasExplanation = Boolean(q.explanation || q.translation || q.analysis || q.optionsTranslation);

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

        ${q.questionText ? `<p class="question-text" style="font-size: 0.98rem; font-weight: 600; margin: 10px 0 12px; line-height: 1.5;">${q.questionText}</p>` : ''}

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
          <button class="explanation-toggle-btn" id="toggle_btn_${qNum}" onclick="ResultViewer.toggleExplanation(${qNum})">
            <span>💡 Xem giải thích & Dịch nghĩa</span>
            <span class="arrow-icon">▼</span>
          </button>

          <div class="explanation-panel" id="panel_exp_${qNum}">
            ${this.renderExplanationContent(q, hasExplanation)}
          </div>
        </div>
      </div>
    `;
  },

  // ── Render Shared Explanation Content Panel (Pedagogical Cards) ──
  renderExplanationContent(q, hasExplanation) {
    if (!hasExplanation) {
      return `
        <div class="exp-empty-notice">
          <span>ℹ️ Lời giải chi tiết và phân tích cho câu hỏi này đang được AI biên soạn và cập nhật.</span>
        </div>
      `;
    }

    const questionTrans = q.translation || q.questionTranslation;
    const hasExp = Boolean(q.explanation);
    const hasAnalysis = Boolean(q.analysis);

    return `
      <!-- Card 1: Dịch nghĩa câu hỏi (nếu có) -->
      ${questionTrans ? `
        <div class="exp-card exp-trans-card">
          <div class="exp-card-header">
            <span class="exp-icon">🌐</span>
            <span class="exp-title">Dịch nghĩa câu hỏi</span>
          </div>
          <div class="exp-card-content">
            <div class="exp-q-trans" style="margin-bottom: 0;">
              <div class="exp-q-trans-text" style="font-weight: 500; font-size: 0.94rem; color: var(--text-primary);">${questionTrans}</div>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Card 2: Lời giải chi tiết -->
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

      <!-- Card 3: Phân tích từ vựng & Cấu trúc ngữ pháp -->
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
    `;
  },

  // ── Toggle Individual Question Explanation Accordion ──
  toggleExplanation(qNum) {
    const panel = document.getElementById(`panel_exp_${qNum}`);
    const btn = document.getElementById(`toggle_btn_${qNum}`);
    if (!panel || !btn) return;

    const isVisible = panel.classList.contains('show');
    if (isVisible) {
      panel.classList.remove('show');
      btn.classList.remove('expanded');
    } else {
      panel.classList.add('show');
      btn.classList.add('expanded');
    }
  },

  // ── Master Toggle: Expand / Collapse All ──
  toggleAllExplanations(shouldExpand) {
    document.querySelectorAll('.explanation-panel').forEach(p => {
      p.classList.toggle('show', shouldExpand);
    });
    document.querySelectorAll('.explanation-toggle-btn').forEach(b => {
      b.classList.toggle('expanded', shouldExpand);
    });
  },

  // ── Interactive Passage Sentence Lookup (Part 6 & Part 7) ──
  getPassage(gid, pIdx) {
    if (this.groupsMap && this.groupsMap[gid]) {
      return this.groupsMap[gid].groupPassages?.[pIdx] || null;
    }
    const q = (this.resultData?.detailedQuestions || []).find(x => x.groupId === gid || x.questionNumber === gid);
    return q && q.groupPassages && q.groupPassages[pIdx] ? q.groupPassages[pIdx] : null;
  },

  setupPassageOverlays(img, gid, pIdx) {
    const passage = this.getPassage(gid, pIdx);
    if (!passage || !passage.sentences || passage.sentences.length === 0) return;

    const layer = document.getElementById(`overlays_${gid}_${pIdx}`);
    if (!layer) return;
    layer.innerHTML = '';

    const natW = img.naturalWidth || 800;
    const natH = img.naturalHeight || 1000;

    passage.sentences.forEach((s, sIdx) => {
      const regions = s.regions || [];
      regions.forEach(r => {
        const box = document.createElement('div');
        box.className = `sentence-overlay-box sentence-box-${gid}-${pIdx}-${sIdx}`;
        box.style.left = `${(r.x0 / natW) * 100}%`;
        box.style.top = `${(r.y0 / natH) * 100}%`;
        box.style.width = `${((r.x1 - r.x0) / natW) * 100}%`;
        box.style.height = `${((r.y1 - r.y0) / natH) * 100}%`;
        box.title = s.text || '';
        box.onclick = (e) => {
          e.stopPropagation();
          this.selectSentence(gid, pIdx, sIdx);
        };
        layer.appendChild(box);
      });
    });
  },

  handlePassageImageClick(event, img, gid, pIdx) {
    const passage = this.getPassage(gid, pIdx);
    if (!passage || !passage.sentences || passage.sentences.length === 0) return;

    const rect = img.getBoundingClientRect();
    const clientX = event.clientX - rect.left;
    const clientY = event.clientY - rect.top;
    const natW = img.naturalWidth || rect.width;
    const natH = img.naturalHeight || rect.height;
    const origX = (clientX / rect.width) * natW;
    const origY = (clientY / rect.height) * natH;

    // Find sentence containing point
    const sIdx = passage.sentences.findIndex(s =>
      (s.regions || []).some(r => origX >= r.x0 && origX <= r.x1 && origY >= r.y0 && origY <= r.y1)
    );
    if (sIdx !== -1) {
      this.selectSentence(gid, pIdx, sIdx);
    }
  },

  selectSentence(gid, pIdx, sIdx) {
    const passage = this.getPassage(gid, pIdx);
    if (!passage || !passage.sentences || !passage.sentences[sIdx]) return;
    const s = passage.sentences[sIdx];

    // Highlight overlay boxes
    const layer = document.getElementById(`overlays_${gid}_${pIdx}`);
    if (layer) {
      layer.querySelectorAll('.sentence-overlay-box').forEach(b => b.classList.remove('active'));
      layer.querySelectorAll(`.sentence-box-${gid}-${pIdx}-${sIdx}`).forEach(b => b.classList.add('active'));
    }

    // Highlight pill
    const pillsRow = document.getElementById(`pills_${gid}_${pIdx}`);
    if (pillsRow) {
      pillsRow.querySelectorAll('.sentence-pill-btn').forEach(btn => btn.classList.remove('active'));
      const activePill = document.getElementById(`pill_${gid}_${pIdx}_${sIdx}`);
      if (activePill) activePill.classList.add('active');
    }

    // Populate and show Card
    const card = document.getElementById(`sentence_card_${gid}_${pIdx}`);
    const badge = document.getElementById(`sentence_badge_${gid}_${pIdx}`);
    const en = document.getElementById(`sentence_en_${gid}_${pIdx}`);
    const vi = document.getElementById(`sentence_vi_${gid}_${pIdx}`);
    const note = document.getElementById(`sentence_note_${gid}_${pIdx}`);

    if (card) {
      if (badge) badge.textContent = `Câu ${sIdx + 1} / ${passage.sentences.length}`;
      if (en) en.textContent = s.text || '';
      if (vi) vi.textContent = s.translation || 'Chưa có bản dịch cho câu này';
      if (note) {
        note.textContent = s.analysis ? `💡 Phân tích: ${s.analysis}` : '';
        note.style.display = s.analysis ? 'block' : 'none';
      }
      card.style.display = 'block';
    }
  },

  closeSentenceCard(gid, pIdx) {
    const card = document.getElementById(`sentence_card_${gid}_${pIdx}`);
    if (card) card.style.display = 'none';

    const layer = document.getElementById(`overlays_${gid}_${pIdx}`);
    if (layer) {
      layer.querySelectorAll('.sentence-overlay-box').forEach(b => b.classList.remove('active'));
    }

    const pillsRow = document.getElementById(`pills_${gid}_${pIdx}`);
    if (pillsRow) {
      pillsRow.querySelectorAll('.sentence-pill-btn').forEach(btn => btn.classList.remove('active'));
    }
  },

  openLightbox(url) {
    UIRenderer.openLightbox(url);
  },

  closeLightbox() {
    UIRenderer.closeLightbox();
  },

  // ── Dynamically rehydrate latest explanations from DB if any questions were missing explanations ──
  async rehydrateExplanationsFromDB() {
    try {
      const url = AppConfig.getDatabaseUrl();
      const res = await fetch(url);
      if (!res.ok) return;
      const db = await res.json();
      const tests = db.tests || (Array.isArray(db) ? db : [db]);
      const currentTestId = this.resultData?.testId || 1;
      const test = tests.find(t => t.testId === currentTestId || t.id === currentTestId) || tests[0];
      if (!test) return;

      const qMap = {};
      const gMap = {};

      const scanPart = (partObj) => {
        if (!partObj) return;
        if (partObj.questions) {
          partObj.questions.forEach(q => { qMap[q.questionNumber] = q; });
        }
        if (partObj.groups) {
          partObj.groups.forEach(g => {
            if (g.groupId) gMap[g.groupId] = g;
            (g.questions || []).forEach(q => {
              q._parentGroup = g;
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
      (this.resultData.detailedQuestions || []).forEach(q => {
        const freshQ = qMap[q.questionNumber];
        if (freshQ) {
          // Sync clean options from DB
          if (freshQ.options) {
            const freshOptsStr = JSON.stringify(freshQ.options);
            if (JSON.stringify(q.options) !== freshOptsStr) {
              q.options = JSON.parse(freshOptsStr);
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
          // Sync latest question translation
          const freshTrans = freshQ.translation || freshQ.questionTranslation || '';
          if (freshTrans && q.translation !== freshTrans) {
            q.translation = freshTrans;
            hasUpdates = true;
          }
          // Sync options translation
          if (freshQ.optionsTranslation) {
            const freshOptTransStr = JSON.stringify(freshQ.optionsTranslation);
            if (JSON.stringify(q.optionsTranslation) !== freshOptTransStr) {
              q.optionsTranslation = JSON.parse(freshOptTransStr);
              hasUpdates = true;
            }
          }
          // Sync correct answer
          if (freshQ.correctAnswer && q.correctChoice !== freshQ.correctAnswer) {
            q.correctChoice = freshQ.correctAnswer;
            q.isCorrect = (q.userChoice === q.correctChoice);
            hasUpdates = true;
          }

          // If question belongs to a group (Part 3, 4, 6, 7)
          const freshG = (q.groupId && gMap[q.groupId]) || freshQ._parentGroup;
          if (freshG) {
            if (!q.groupId && freshG.groupId) {
              q.groupId = freshG.groupId;
              hasUpdates = true;
            }
            // Sync groupPassages (passages, images, coordinates)
            if (freshG.passages && freshG.passages.length > 0 && (!q.groupPassages || q.groupPassages.length === 0)) {
              q.groupPassages = freshG.passages;
              hasUpdates = true;
            }
            // Sync group expected range
            if (freshG.expectedRange && (!q.expectedRange || q.expectedRange[0] !== freshG.expectedRange[0])) {
              q.expectedRange = freshG.expectedRange;
              hasUpdates = true;
            }
            // Sync group audio
            if (freshG.audioUrl && (!q.audioUrl || !q.groupAudioUrl)) {
              q.audioUrl = freshG.audioUrl;
              q.groupAudioUrl = freshG.audioUrl;
              hasUpdates = true;
            }
            // Sync group translation & transcript
            const freshGTrans = freshG.passageTranslation || freshG.translation || '';
            if (freshGTrans && q.groupTranslation !== freshGTrans) {
              q.groupTranslation = freshGTrans;
              hasUpdates = true;
            }
            if (freshG.transcript && q.groupTranscript !== freshG.transcript) {
              q.groupTranscript = freshG.transcript;
              hasUpdates = true;
            }
          }
        }
      });

      if (hasUpdates) {
        StorageService.setCurrentResult(this.resultData);
      }
    } catch (e) {
      console.warn('Rehydrate explanations skipped:', e);
    }
  },

  // Format Part 3 & 4 dialogue with distinct speaker badges
  formatDialogue(text) {
    if (!text) return '';
    const lines = text.split('\n');
    return lines.map(rawLine => {
      const line = rawLine.trim();
      if (!line) return '';
      // Support: Man, Woman, Man 1, Man 2, Woman 1, Woman 2, Người đàn ông, Người phụ nữ...
      const m = line.match(/^((?:Man|Woman|Người đàn ông|Người phụ nữ)(?:\s+\d)?):\s*(.*)$/i);
      if (m) {
        const spk = m[1];
        const content = m[2];
        const isMan = spk.toLowerCase().includes('man') || spk.toLowerCase().includes('đàn ông');
        const badgeClass = isMan ? 'speaker-badge-man' : 'speaker-badge-woman';
        const icon = isMan ? '👨' : '👩';
        return `<div class="dialogue-line"><span class="speaker-badge ${badgeClass}">${icon} ${spk}</span><span class="dialogue-content">${content}</span></div>`;
      }
      return `<div class="dialogue-line">${line}</div>`;
    }).join('');
  }
};
