// ==========================================================================
// TOEIC MASTER — ui-renderer.js
// Dynamic Rendering for Questions 1-200 (Parts 1 - 7), Passages, and Palette
// ==========================================================================

const UIRenderer = {
  // ── Helper: Resolve Asset URL safely with AppConfig fallback ──
  resolveUrl(url) {
    if (!url || typeof url !== 'string') return '';
    if (typeof AppConfig !== 'undefined' && typeof AppConfig.resolveAssetUrl === 'function') {
      return AppConfig.resolveAssetUrl(url);
    }
    return url;
  },

  _resolveUrl(url) {
    return this.resolveUrl(url);
  },

  // ── Helper: Escape HTML attributes to prevent XSS / breakout ──
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },

  _escapeHtml(str) {
    return this.escapeHtml(str);
  },

  // ── Render Part 1 Question (Photographs) ──
  renderPart1(q, userAns, isFlagged, isPartMode = false) {
    if (!q || typeof q !== 'object' || Array.isArray(q)) return '';
    const qNum = parseInt(q.questionNumber, 10) || 0;
    if (qNum <= 0) return '';
    const resolver = (this && typeof this.resolveUrl === 'function') ? this.resolveUrl.bind(this) : UIRenderer.resolveUrl;
    const escaper = (this && typeof this.escapeHtml === 'function') ? this.escapeHtml.bind(this) : UIRenderer.escapeHtml;

    const imgUrl = resolver(q.imageUrl);
    const audioUrl = resolver(q.audioUrl);
    const safeImgUrl = escaper(imgUrl);
    const flagged = Boolean(isFlagged);
    const normalizedAns = typeof userAns === 'string' ? userAns.trim().toUpperCase() : '';

    return `
      <div class="question-item animate-fade-in" id="q_item_${qNum}" data-qnum="${qNum}">
        <div class="question-header">
          <span class="q-number-badge">Câu ${qNum}</span>
          <button class="flag-btn ${flagged ? 'flagged' : ''}"
                  onclick="ExamEngine.toggleFlag(${qNum})"
                  title="${flagged ? 'Bỏ gắn cờ' : 'Gắn cờ xem lại'}"
                  aria-label="${flagged ? 'Bỏ gắn cờ câu ' + qNum : 'Gắn cờ xem lại câu ' + qNum}"
                  aria-pressed="${flagged ? 'true' : 'false'}">
            ${flagged ? '🚩' : '🏳️'}
          </button>
        </div>

        ${imgUrl ? `
          <div class="q-image-container zoomable-image-wrap"
               role="button"
               tabindex="0"
               data-img-url="${safeImgUrl}"
               onclick="UIRenderer.openLightbox(this.getAttribute('data-img-url'))"
               onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();UIRenderer.openLightbox(this.getAttribute('data-img-url'));}"
               title="Nhấn để phóng to ảnh"
               aria-label="Phóng to ảnh câu ${qNum}">
            <img src="${safeImgUrl}" alt="Photo Question ${qNum}" loading="lazy" onerror="if(this.parentElement)this.parentElement.style.display='none';">
          </div>
        ` : ''}

        ${isPartMode && audioUrl ? `
          <div style="margin: 12px 0;">
            ${(this && typeof this.renderAudioPlayer === 'function' ? this : UIRenderer).renderAudioPlayer(`audio_p1_${qNum}`, audioUrl, `Nghe Audio Câu ${qNum}`)}
          </div>
        ` : ''}

        <!-- ETS Real Exam: Candidate listens to 4 statements A, B, C, D in audio -->
        <div class="options-group listening-blind-options" role="group" aria-label="Phương án trả lời câu ${qNum}">
          ${['A', 'B', 'C', 'D'].map(opt => `
            <button class="option-btn blind-opt-btn${normalizedAns === opt ? ' selected' : ''}"
                    onclick="ExamEngine.selectAnswer(${qNum}, '${opt}')"
                    aria-label="Câu ${qNum} chọn đáp án ${opt}"
                    aria-pressed="${normalizedAns === opt ? 'true' : 'false'}">
              <span class="option-letter">${opt}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  },

  // ── Render Part 2 Question (Question-Response) ──
  renderPart2(q, userAns, isFlagged, isPartMode = false) {
    if (!q || typeof q !== 'object' || Array.isArray(q)) return '';
    const qNum = parseInt(q.questionNumber, 10) || 0;
    if (qNum <= 0) return '';

    const resolver = (this && typeof this.resolveUrl === 'function') ? this.resolveUrl.bind(this) : UIRenderer.resolveUrl;
    const audioUrl = resolver(q.audioUrl);
    const flagged = Boolean(isFlagged);
    const normalizedAns = typeof userAns === 'string' ? userAns.trim().toUpperCase() : '';

    return `
      <div class="question-item animate-fade-in" id="q_item_${qNum}" data-qnum="${qNum}">
        <div class="question-header">
          <span class="q-number-badge">Câu ${qNum}</span>
          <button class="flag-btn ${flagged ? 'flagged' : ''}"
                  onclick="ExamEngine.toggleFlag(${qNum})"
                  title="${flagged ? 'Bỏ gắn cờ' : 'Gắn cờ xem lại'}"
                  aria-label="${flagged ? 'Bỏ gắn cờ câu ' + qNum : 'Gắn cờ xem lại câu ' + qNum}"
                  aria-pressed="${flagged ? 'true' : 'false'}">
            ${flagged ? '🚩' : '🏳️'}
          </button>
        </div>

        ${isPartMode && audioUrl ? `
          <div style="margin: 12px 0;">
            ${(this && typeof this.renderAudioPlayer === 'function' ? this : UIRenderer).renderAudioPlayer(`audio_p2_${qNum}`, audioUrl, `Nghe Audio Câu ${qNum}`)}
          </div>
        ` : ''}

        <!-- ETS Real Exam: 3 spoken responses A, B, C -->
        <div class="options-group listening-blind-options part2-blind-options" role="group" aria-label="Phương án trả lời câu ${qNum}">
          ${['A', 'B', 'C'].map(opt => `
            <button class="option-btn blind-opt-btn${normalizedAns === opt ? ' selected' : ''}"
                    onclick="ExamEngine.selectAnswer(${qNum}, '${opt}')"
                    aria-label="Câu ${qNum} chọn đáp án ${opt}"
                    aria-pressed="${normalizedAns === opt ? 'true' : 'false'}">
              <span class="option-letter">${opt}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  },

  // ── Render Part 3 & Part 4 Group (Conversations & Talks) ──
  renderGroupAudio(group, partKey, userAnswers, flaggedSet, isPartMode = false) {
    if (!group || typeof group !== 'object' || Array.isArray(group)) return '';
    const range = Array.isArray(group.expectedRange) ? group.expectedRange : [0, 0];
    const gid = group.groupId || 'group_0';
    const passages = Array.isArray(group.passages) ? group.passages : [];
    const questions = Array.isArray(group.questions) ? group.questions : [];

    const resolver = (this && typeof this.resolveUrl === 'function') ? this.resolveUrl.bind(this) : UIRenderer.resolveUrl;
    const escaper = (this && typeof this.escapeHtml === 'function') ? this.escapeHtml.bind(this) : UIRenderer.escapeHtml;

    const groupAudio = resolver(group.audioUrl);

    return `
      <div class="passages-card animate-fade-in" id="group_box_${gid}">
        <div class="passage-header">
          🎧 ${partKey === 'part3' ? 'Part 3: Conversations' : 'Part 4: Short Talks'} (Câu ${range[0]} - ${range[1]})
        </div>

        ${(isPartMode && groupAudio) ? `
          <div style="margin: 12px 0;">
            ${(this && typeof this.renderAudioPlayer === 'function' ? this : UIRenderer).renderAudioPlayer(`audio_${gid}`, groupAudio, `Nghe đoạn hội thoại/bài nói (Câu ${range[0]} - ${range[1]})`)}
          </div>
        ` : ''}

        ${passages.length > 0 ? `
          <div style="margin: 10px 0;">
            ${passages.map(p => {
              const pUrl = typeof p === 'string' ? p : (p && p.imageUrl ? p.imageUrl : '');
              const fullUrl = resolver(pUrl);
              const safeFullUrl = escaper(fullUrl);
              if (!fullUrl) return '';
              return `
                <div class="q-image-container zoomable-image-wrap"
                     role="button"
                     tabindex="0"
                     data-img-url="${safeFullUrl}"
                     onclick="UIRenderer.openLightbox(this.getAttribute('data-img-url'))"
                     onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();UIRenderer.openLightbox(this.getAttribute('data-img-url'));}"
                     title="Nhấn để phóng to ảnh"
                     aria-label="Phóng to hình ảnh minh họa (Câu ${range[0]} - ${range[1]})">
                  <img src="${safeFullUrl}" alt="Graphic" loading="lazy" onerror="if(this.parentElement)this.parentElement.style.display='none';">
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}

        <div class="group-questions-list" style="margin-top: 10px; display: flex; flex-direction: column; gap: 8px;">
          ${questions.map(q => {
            if (!q || typeof q !== 'object' || Array.isArray(q)) return '';
            const qNum = parseInt(q.questionNumber, 10);
            if (isNaN(qNum) || qNum <= 0) return '';

            const rawAns = (userAnswers && typeof userAnswers === 'object') ? userAnswers[qNum] : '';
            const userAns = typeof rawAns === 'string' ? rawAns.trim().toUpperCase() : '';
            const isFlagged = Boolean(flaggedSet && typeof flaggedSet.has === 'function' ? flaggedSet.has(qNum) : false);

            return `
              <div class="question-item" id="q_item_${qNum}" data-qnum="${qNum}" style="background: var(--bg-tertiary); margin-bottom: 0;">
                <div class="question-header">
                  <span class="q-number-badge">Câu ${qNum}</span>
                  <button class="flag-btn ${isFlagged ? 'flagged' : ''}"
                          onclick="ExamEngine.toggleFlag(${qNum})"
                          title="${isFlagged ? 'Bỏ gắn cờ' : 'Gắn cờ xem lại'}"
                          aria-label="${isFlagged ? 'Bỏ gắn cờ câu ' + qNum : 'Gắn cờ xem lại câu ' + qNum}"
                          aria-pressed="${isFlagged ? 'true' : 'false'}">
                    ${isFlagged ? '🚩' : '🏳️'}
                  </button>
                </div>
                <p class="question-text">${escaper(q.questionText || '')}</p>
                <div class="options-group" role="group" aria-label="Phương án trả lời câu ${qNum}">
                  ${['A', 'B', 'C', 'D'].map(opt => `
                    <button class="option-btn${userAns === opt ? ' selected' : ''}"
                            onclick="ExamEngine.selectAnswer(${qNum}, '${opt}')"
                            aria-label="Câu ${qNum} chọn đáp án ${opt}"
                            aria-pressed="${userAns === opt ? 'true' : 'false'}">
                      <span class="option-letter">${opt}</span>
                      <span class="option-text">${escaper(q.options?.[opt] || '')}</span>
                    </button>
                  `).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  },

  // ── Render Part 5 Question (Incomplete Sentences) ──
  renderPart5(q, userAns, isFlagged) {
    if (!q || typeof q !== 'object' || Array.isArray(q)) return '';
    const qNum = parseInt(q.questionNumber, 10);
    if (isNaN(qNum) || qNum <= 0) return '';

    const escaper = (this && typeof this.escapeHtml === 'function') ? this.escapeHtml.bind(this) : UIRenderer.escapeHtml;
    const flagged = Boolean(isFlagged);
    const normalizedAns = typeof userAns === 'string' ? userAns.trim().toUpperCase() : '';

    return `
      <div class="question-item animate-fade-in" id="q_item_${qNum}" data-qnum="${qNum}">
        <div class="question-header">
          <span class="q-number-badge">Câu ${qNum}</span>
          <button class="flag-btn ${flagged ? 'flagged' : ''}"
                  onclick="ExamEngine.toggleFlag(${qNum})"
                  title="${flagged ? 'Bỏ gắn cờ' : 'Gắn cờ xem lại'}"
                  aria-label="${flagged ? 'Bỏ gắn cờ câu ' + qNum : 'Gắn cờ xem lại câu ' + qNum}"
                  aria-pressed="${flagged ? 'true' : 'false'}">
            ${flagged ? '🚩' : '🏳️'}
          </button>
        </div>

        <p class="question-text">${escaper(q.questionText || '')}</p>

        <div class="options-group" role="group" aria-label="Phương án trả lời câu ${qNum}">
          ${['A', 'B', 'C', 'D'].map(opt => `
            <button class="option-btn${normalizedAns === opt ? ' selected' : ''}"
                    onclick="ExamEngine.selectAnswer(${qNum}, '${opt}')"
                    aria-label="Câu ${qNum} chọn đáp án ${opt}"
                    aria-pressed="${normalizedAns === opt ? 'true' : 'false'}">
              <span class="option-letter">${opt}</span>
              <span class="option-text">${escaper(q.options?.[opt] || '')}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  },

  // ── Render Part 6 & Part 7 Group (Reading Passages) ──
  renderReadingGroup(group, partKey, userAnswers, flaggedSet) {
    if (!group || typeof group !== 'object' || Array.isArray(group)) return '';
    const range = Array.isArray(group.expectedRange) ? group.expectedRange : [0, 0];
    const gid = group.groupId || 'group_0';
    const passages = Array.isArray(group.passages) ? group.passages : [];
    const questions = Array.isArray(group.questions) ? group.questions : [];

    const resolver = (this && typeof this.resolveUrl === 'function') ? this.resolveUrl.bind(this) : UIRenderer.resolveUrl;
    const escaper = (this && typeof this.escapeHtml === 'function') ? this.escapeHtml.bind(this) : UIRenderer.escapeHtml;

    return `
      <div class="passages-card animate-fade-in" id="group_box_${gid}">
        <div class="passage-header">
          📖 ${partKey === 'part6' ? 'Part 6: Text Completion' : 'Part 7: Reading Comprehension'} (Câu ${range[0]} - ${range[1]})
        </div>

        ${passages.length > 0 ? `
          <div class="passages-images-wrap" style="margin-bottom: 14px;">
            ${passages.map(p => {
              const pUrl = typeof p === 'string' ? p : (p && p.imageUrl ? p.imageUrl : '');
              const fullUrl = resolver(pUrl);
              const safeFullUrl = escaper(fullUrl);
              if (!fullUrl) return '';
              return `
                <div class="q-image-container zoomable-image-wrap"
                     role="button"
                     tabindex="0"
                     data-img-url="${safeFullUrl}"
                     onclick="UIRenderer.openLightbox(this.getAttribute('data-img-url'))"
                     onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();UIRenderer.openLightbox(this.getAttribute('data-img-url'));}"
                     title="Nhấn để phóng to ảnh"
                     aria-label="Phóng to hình ảnh bài đọc (Câu ${range[0]} - ${range[1]})"
                     style="background:#ffffff; border-radius: 6px; margin-bottom: 8px;">
                  <img src="${safeFullUrl}" alt="Passage" loading="lazy" onerror="if(this.parentElement)this.parentElement.style.display='none';">
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}

        <div class="group-questions-list" style="display: flex; flex-direction: column; gap: 8px;">
          ${questions.map(q => {
            if (!q || typeof q !== 'object' || Array.isArray(q)) return '';
            const qNum = parseInt(q.questionNumber, 10);
            if (isNaN(qNum) || qNum <= 0) return '';

            const rawAns = (userAnswers && typeof userAnswers === 'object') ? userAnswers[qNum] : '';
            const userAns = typeof rawAns === 'string' ? rawAns.trim().toUpperCase() : '';
            const isFlagged = Boolean(flaggedSet && typeof flaggedSet.has === 'function' ? flaggedSet.has(qNum) : false);

            return `
              <div class="question-item" id="q_item_${qNum}" data-qnum="${qNum}" style="background: var(--bg-tertiary); margin-bottom: 0;">
                <div class="question-header">
                  <span class="q-number-badge">Câu ${qNum}</span>
                  <button class="flag-btn ${isFlagged ? 'flagged' : ''}"
                          onclick="ExamEngine.toggleFlag(${qNum})"
                          title="${isFlagged ? 'Bỏ gắn cờ' : 'Gắn cờ xem lại'}"
                          aria-label="${isFlagged ? 'Bỏ gắn cờ câu ' + qNum : 'Gắn cờ xem lại câu ' + qNum}"
                          aria-pressed="${isFlagged ? 'true' : 'false'}">
                    ${isFlagged ? '🚩' : '🏳️'}
                  </button>
                </div>
                ${q.questionText ? `<p class="question-text">${escaper(q.questionText)}</p>` : ''}
                <div class="options-group" role="group" aria-label="Phương án trả lời câu ${qNum}">
                  ${['A', 'B', 'C', 'D'].map(opt => `
                    <button class="option-btn${userAns === opt ? ' selected' : ''}"
                            onclick="ExamEngine.selectAnswer(${qNum}, '${opt}')"
                            aria-label="Câu ${qNum} chọn đáp án ${opt}"
                            aria-pressed="${userAns === opt ? 'true' : 'false'}">
                      <span class="option-letter">${opt}</span>
                      <span class="option-text">${escaper(q.options?.[opt] || '')}</span>
                    </button>
                  `).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  },

  // ── Custom Sleek Audio Player HTML ──
  renderAudioPlayer(playerId, audioUrl, label = 'Phát âm thanh') {
    return `
      <div class="audio-player-box" id="${playerId}">
        <audio preload="none"></audio>
        <button class="audio-play-btn" onclick="AudioController.togglePlay('${playerId}', '${audioUrl}')" title="${label}" aria-label="${label}" aria-pressed="false">
          ▶
        </button>
        <div class="audio-progress-wrap">
          <div class="audio-top-info">
            <span class="audio-label-text">🎧 ${label}</span>
            <div class="audio-time-pill">
              <span class="audio-current-time">00:00</span> / <span class="audio-total-time">--:--</span>
            </div>
          </div>
          <div class="audio-track-bar" onclick="AudioController.seekAudio('${playerId}', event)">
            <div class="audio-fill-bar"></div>
          </div>
        </div>
      </div>
    `;
  },

  // ── Render Question Palette (Supports arbitrary question number ranges) ──
  renderPalette(questionListOrCount, userAnswers, flaggedSet, currentQNum = null) {
    let questionNumbers = [];
    if (Array.isArray(questionListOrCount)) {
      questionNumbers = questionListOrCount
        .map(item => {
          if (typeof item === 'number') return Math.floor(item);
          if (typeof item === 'string') return parseInt(item, 10);
          if (item && typeof item === 'object' && item.questionNumber !== undefined) {
            return parseInt(item.questionNumber, 10);
          }
          return NaN;
        })
        .filter(num => Number.isInteger(num) && num > 0);
      questionNumbers = Array.from(new Set(questionNumbers));
    } else if (typeof questionListOrCount === 'number') {
      const count = Number.isFinite(questionListOrCount) ? Math.floor(questionListOrCount) : 0;
      if (count > 0) {
        const safeCount = Math.min(count, 500);
        questionNumbers = Array.from({ length: safeCount }, (_, i) => i + 1);
      } else {
        questionNumbers = [];
      }
    } else if (typeof questionListOrCount === 'string') {
      const parsedCount = parseInt(questionListOrCount, 10);
      if (Number.isFinite(parsedCount) && parsedCount > 0) {
        const safeCount = Math.min(parsedCount, 500);
        questionNumbers = Array.from({ length: safeCount }, (_, i) => i + 1);
      } else {
        questionNumbers = [];
      }
    } else if (questionListOrCount === null || questionListOrCount === undefined) {
      questionNumbers = Array.from({ length: 200 }, (_, i) => i + 1);
    } else {
      questionNumbers = [];
    }

    if (questionNumbers.length === 0) {
      questionNumbers = Array.from({ length: 200 }, (_, i) => i + 1);
    }

    const safeUserAnswers = (userAnswers && typeof userAnswers === 'object' && !Array.isArray(userAnswers))
      ? userAnswers
      : {};

    const hasFlag = (qNum) => {
      if (!flaggedSet) return false;
      if (typeof flaggedSet.has === 'function') return flaggedSet.has(qNum);
      if (Array.isArray(flaggedSet)) return flaggedSet.includes(qNum);
      if (typeof flaggedSet === 'object') return Boolean(flaggedSet[qNum]);
      return false;
    };

    const getAnswer = (qNum) => {
      const ans = safeUserAnswers[qNum];
      if (ans === undefined || ans === null) return '';
      return String(ans).trim().toUpperCase();
    };

    const escaper = (this && typeof this.escapeHtml === 'function') ? this.escapeHtml.bind(this) : UIRenderer.escapeHtml;

    const totalQuestions = questionNumbers.length;
    const answeredCount = questionNumbers.filter(qNum => Boolean(getAnswer(qNum))).length;
    const flaggedCount = questionNumbers.filter(qNum => hasFlag(qNum)).length;
    const remainingCount = Math.max(0, totalQuestions - answeredCount);

    const curr = (currentQNum !== null && currentQNum !== undefined) ? parseInt(currentQNum, 10) : null;

    let gridHtml = '';
    for (const qNum of questionNumbers) {
      const userAns = getAnswer(qNum);
      const isAnswered = Boolean(userAns);
      const isFlagged = hasFlag(qNum);
      const isCurrent = Number.isInteger(curr) && qNum === curr;

      const statusText = isAnswered ? `đã chọn ${userAns}` : 'chưa làm';
      const flagText = isFlagged ? ', đã đánh dấu xem lại' : '';
      const currentText = isCurrent ? ', câu hiện tại' : '';
      const titleText = escaper(`Câu ${qNum} ${isAnswered ? `(Đã chọn ${userAns})` : '(Chưa làm)'}${isFlagged ? ' [Đã đánh dấu]' : ''}`);
      const ariaLabel = escaper(`Câu ${qNum}: ${statusText}${flagText}${currentText}`);

      const btnClasses = ['palette-btn', isAnswered && 'answered', isFlagged && 'flagged', isCurrent && 'current'].filter(Boolean).join(' ');

      gridHtml += `
        <button type="button"
                class="${btnClasses}"
                id="palette_btn_${qNum}"
                data-qnum="${qNum}"
                onclick="ExamEngine.scrollToQuestion(${qNum})"
                title="${titleText}"
                aria-label="${ariaLabel}"${isCurrent ? ' aria-current="true"' : ''}>
          ${qNum}
        </button>
      `;
    }

    return `
      <div class="palette-container" role="navigation" aria-label="Bảng điều hướng câu hỏi thi">
        <div class="palette-stats" role="group" aria-label="Thống kê tiến độ bài thi">
          <div class="palette-stat-box">
            <span style="color: var(--accent-primary); font-weight: 700; font-size: 1.1rem;">${answeredCount}</span>
            <p style="color: var(--text-muted); font-size: 0.75rem;">Đã làm</p>
          </div>
          <div class="palette-stat-box">
            <span style="color: var(--text-secondary); font-weight: 700; font-size: 1.1rem;">${remainingCount}</span>
            <p style="color: var(--text-muted); font-size: 0.75rem;">Chưa làm</p>
          </div>
          <div class="palette-stat-box">
            <span style="color: var(--warning); font-weight: 700; font-size: 1.1rem;">${flaggedCount}</span>
            <p style="color: var(--text-muted); font-size: 0.75rem;">Đánh dấu</p>
          </div>
        </div>
        <div class="palette-grid" role="group" aria-label="Danh sách câu hỏi">
          ${gridHtml}
        </div>
      </div>
    `;
  },

  // ── Lightbox Zoom Modal Helper ──
  openLightbox(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim() || typeof document === 'undefined') {
      return false;
    }

    let modal = document.getElementById('image-lightbox-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'image-lightbox-modal';
      modal.className = 'image-lightbox-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-label', 'Phóng to hình ảnh');
      modal.tabIndex = -1;
      modal.innerHTML = `
        <button class="lightbox-close-btn" type="button" onclick="UIRenderer.closeLightbox()" aria-label="Đóng phóng to">&times;</button>
        <div class="lightbox-img-container" onclick="event.stopPropagation()">
          <img id="lightbox-modal-img" src="" alt="Zoomed view">
        </div>
      `;
      modal.onclick = () => UIRenderer.closeLightbox();
      document.body.appendChild(modal);
    }

    // Save previous focus element
    if (typeof document !== 'undefined' && document.activeElement) {
      this._lastFocusedElement = document.activeElement;
    }

    // Lock background scrolling
    if (document.body) {
      this._prevBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    const imgEl = modal.querySelector('#lightbox-modal-img');
    if (imgEl) {
      const errBox = modal.querySelector('.lightbox-error-msg');
      if (errBox) errBox.remove();
      const prevOverlays = modal.querySelector('.lightbox-passage-overlays');
      if (prevOverlays && typeof prevOverlays.remove === 'function') prevOverlays.remove();
      const prevPopover = modal.querySelector('.lightbox-sentence-popover');
      if (prevPopover && typeof prevPopover.remove === 'function') prevPopover.remove();
      const prevDock = modal.querySelector('.lightbox-sentence-dock');
      if (prevDock && typeof prevDock.remove === 'function') prevDock.remove();
      const prevToolbar = modal.querySelector('.lightbox-coord-toolbar');
      if (prevToolbar && typeof prevToolbar.remove === 'function') prevToolbar.remove();
      imgEl.onload = null;
      imgEl.onclick = null;
      imgEl.style.display = '';
      imgEl.onerror = () => {
        imgEl.style.display = 'none';
        let err = modal.querySelector('.lightbox-error-msg');
        if (!err) {
          err = document.createElement('div');
          err.className = 'lightbox-error-msg';
          err.style.cssText = 'color: #ffffff; padding: 24px; text-align: center; font-size: 0.95rem; line-height: 1.5;';
          err.textContent = 'Không thể tải hình ảnh. Vui lòng kiểm tra lại kết nối mạng.';
          imgEl.parentElement.appendChild(err);
        }
      };
      imgEl.src = imageUrl.trim();
    }

    modal.classList.add('open');

    // Focus management: move focus into close button or modal
    const closeBtn = modal.querySelector('.lightbox-close-btn');
    if (closeBtn && typeof closeBtn.focus === 'function') {
      try { closeBtn.focus(); } catch (_) {}
    } else if (typeof modal.focus === 'function') {
      try { modal.focus(); } catch (_) {}
    }

    // Add Escape key listener if not already bound
    if (!UIRenderer._escapeKeyBound) {
      UIRenderer._escapeKeyBound = (e) => {
        if (e && (e.key === 'Escape' || e.key === 'Esc')) {
          UIRenderer.closeLightbox();
        }
      };
      document.addEventListener('keydown', UIRenderer._escapeKeyBound);
    }

    return true;
  },

  closeLightbox() {
    if (typeof document === 'undefined') return false;
    const modal = document.getElementById('image-lightbox-modal');
    if (!modal || !modal.classList.contains('open')) return false;

    modal.classList.remove('open');

    const prevDock = modal.querySelector('.lightbox-sentence-dock');
    if (prevDock && typeof prevDock.remove === 'function') prevDock.remove();
    const prevToolbar = modal.querySelector('.lightbox-coord-toolbar');
    if (prevToolbar && typeof prevToolbar.remove === 'function') prevToolbar.remove();

    // Restore background scrolling
    if (document.body) {
      document.body.style.overflow = (typeof this._prevBodyOverflow === 'string') ? this._prevBodyOverflow : '';
    }

    // Restore focus to trigger element
    if (this._lastFocusedElement && typeof this._lastFocusedElement.focus === 'function') {
      try { this._lastFocusedElement.focus(); } catch (_) {}
    }
    this._lastFocusedElement = null;

    if (UIRenderer._escapeKeyBound) {
      document.removeEventListener('keydown', UIRenderer._escapeKeyBound);
      UIRenderer._escapeKeyBound = null;
    }

    return true;
  }
};

if (typeof window !== 'undefined') {
  window.UIRenderer = UIRenderer;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = UIRenderer;
}
