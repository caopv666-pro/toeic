// ==========================================================================
// TOEIC MASTER — ui-renderer.js
// Dynamic Rendering for Questions 1-200 (Parts 1 - 7), Passages, and Palette
// ==========================================================================

const UIRenderer = {
  // ── Render Part 1 Question (Photographs) ──
  renderPart1(q, userAns, isFlagged) {
    const qNum = q.questionNumber;
    const imgUrl = AppConfig.resolveAssetUrl(q.imageUrl);

    return `
      <div class="question-item animate-fade-in" id="q_item_${qNum}" data-qnum="${qNum}">
        <div class="question-header">
          <span class="q-number-badge">Câu ${qNum}</span>
          <button class="flag-btn ${isFlagged ? 'flagged' : ''}" onclick="ExamEngine.toggleFlag(${qNum})" title="${isFlagged ? 'Bỏ gắn cờ' : 'Gắn cờ xem lại'}">
            ${isFlagged ? '🚩' : '🏳️'}
          </button>
        </div>

        ${imgUrl ? `
          <div class="q-image-container zoomable-image-wrap" onclick="UIRenderer.openLightbox('${imgUrl}')" title="Nhấn để phóng to ảnh">
            <img src="${imgUrl}" alt="Photo Question ${qNum}" loading="lazy">
          </div>
        ` : ''}

        <!-- ETS Real Exam: Candidate listens to 4 statements A, B, C, D in continuous audio -->
        <div class="options-group listening-blind-options">
          ${['A', 'B', 'C', 'D'].map(opt => `
            <button class="option-btn blind-opt-btn ${userAns === opt ? 'selected' : ''}" onclick="ExamEngine.selectAnswer(${qNum}, '${opt}')">
              <span class="option-letter">${opt}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  },

  // ── Render Part 2 Question (Question-Response) ──
  renderPart2(q, userAns, isFlagged) {
    const qNum = q.questionNumber;

    return `
      <div class="question-item animate-fade-in" id="q_item_${qNum}" data-qnum="${qNum}">
        <div class="question-header">
          <span class="q-number-badge">Câu ${qNum}</span>
          <button class="flag-btn ${isFlagged ? 'flagged' : ''}" onclick="ExamEngine.toggleFlag(${qNum})" title="${isFlagged ? 'Bỏ gắn cờ' : 'Gắn cờ xem lại'}">
            ${isFlagged ? '🚩' : '🏳️'}
          </button>
        </div>

        <!-- ETS Real Exam: 3 spoken responses A, B, C in continuous audio -->
        <div class="options-group listening-blind-options" style="grid-template-columns: repeat(3, 1fr);">
          ${['A', 'B', 'C'].map(opt => `
            <button class="option-btn blind-opt-btn ${userAns === opt ? 'selected' : ''}" onclick="ExamEngine.selectAnswer(${qNum}, '${opt}')">
              <span class="option-letter">${opt}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  },

  // ── Render Part 3 & Part 4 Group (Conversations & Talks) ──
  renderGroupAudio(group, partKey, userAnswers, flaggedSet) {
    const range = group.expectedRange || [0, 0];
    const gid = group.groupId;
    const passages = group.passages || [];

    return `
      <div class="passages-card animate-fade-in" id="group_box_${gid}">
        <div class="passage-header">
          🎧 ${partKey === 'part3' ? 'Part 3: Conversations' : 'Part 4: Short Talks'} (Câu ${range[0]} - ${range[1]})
        </div>

        ${passages.length > 0 ? `
          <div style="margin: 10px 0;">
            ${passages.map(p => {
              const pUrl = typeof p === 'string' ? p : p.imageUrl;
              const fullUrl = AppConfig.resolveAssetUrl(pUrl);
              return `
                <div class="q-image-container zoomable-image-wrap" onclick="UIRenderer.openLightbox('${fullUrl}')" title="Nhấn để phóng to ảnh">
                  <img src="${fullUrl}" alt="Graphic" loading="lazy">
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}

        <div class="group-questions-list" style="margin-top: 10px; display: flex; flex-direction: column; gap: 8px;">
          ${(group.questions || []).map(q => {
            const qNum = q.questionNumber;
            const userAns = userAnswers[qNum];
            const isFlagged = flaggedSet.has(qNum);
            return `
              <div class="question-item" id="q_item_${qNum}" data-qnum="${qNum}" style="background: var(--bg-tertiary); margin-bottom: 0;">
                <div class="question-header">
                  <span class="q-number-badge">Câu ${qNum}</span>
                  <button class="flag-btn ${isFlagged ? 'flagged' : ''}" onclick="ExamEngine.toggleFlag(${qNum})" title="${isFlagged ? 'Bỏ gắn cờ' : 'Gắn cờ xem lại'}">
                    ${isFlagged ? '🚩' : '🏳️'}
                  </button>
                </div>
                <p class="question-text">${q.questionText || ''}</p>
                <div class="options-group">
                  ${['A', 'B', 'C', 'D'].map(opt => `
                    <button class="option-btn ${userAns === opt ? 'selected' : ''}" onclick="ExamEngine.selectAnswer(${qNum}, '${opt}')">
                      <span class="option-letter">${opt}</span>
                      <span class="option-text">${q.options?.[opt] || ''}</span>
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
    const qNum = q.questionNumber;

    return `
      <div class="question-item animate-fade-in" id="q_item_${qNum}" data-qnum="${qNum}">
        <div class="question-header">
          <span class="q-number-badge">Câu ${qNum}</span>
          <button class="flag-btn ${isFlagged ? 'flagged' : ''}" onclick="ExamEngine.toggleFlag(${qNum})" title="${isFlagged ? 'Bỏ gắn cờ' : 'Gắn cờ xem lại'}">
            ${isFlagged ? '🚩' : '🏳️'}
          </button>
        </div>

        <p class="question-text">${q.questionText || ''}</p>

        <div class="options-group">
          ${['A', 'B', 'C', 'D'].map(opt => `
            <button class="option-btn ${userAns === opt ? 'selected' : ''}" onclick="ExamEngine.selectAnswer(${qNum}, '${opt}')">
              <span class="option-letter">${opt}</span>
              <span class="option-text">${q.options?.[opt] || ''}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  },

  // ── Render Part 6 & Part 7 Group (Reading Passages) ──
  renderReadingGroup(group, partKey, userAnswers, flaggedSet) {
    const range = group.expectedRange || [0, 0];
    const gid = group.groupId;
    const passages = group.passages || [];

    return `
      <div class="passages-card animate-fade-in" id="group_box_${gid}">
        <div class="passage-header">
          📖 ${partKey === 'part6' ? 'Part 6: Text Completion' : 'Part 7: Reading Comprehension'} (Câu ${range[0]} - ${range[1]})
        </div>

        ${passages.length > 0 ? `
          <div class="passages-images-wrap" style="margin-bottom: 14px;">
            ${passages.map(p => {
              const pUrl = typeof p === 'string' ? p : p.imageUrl;
              const fullUrl = AppConfig.resolveAssetUrl(pUrl);
              return `
                <div class="q-image-container zoomable-image-wrap" onclick="UIRenderer.openLightbox('${fullUrl}')" title="Nhấn để phóng to ảnh" style="background:#ffffff; border-radius: 6px; margin-bottom: 8px;">
                  <img src="${fullUrl}" alt="Passage" loading="lazy">
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}

        <div class="group-questions-list" style="display: flex; flex-direction: column; gap: 8px;">
          ${(group.questions || []).map(q => {
            const qNum = q.questionNumber;
            const userAns = userAnswers[qNum];
            const isFlagged = flaggedSet.has(qNum);
            return `
              <div class="question-item" id="q_item_${qNum}" data-qnum="${qNum}" style="background: var(--bg-tertiary); margin-bottom: 0;">
                <div class="question-header">
                  <span class="q-number-badge">Câu ${qNum}</span>
                  <button class="flag-btn ${isFlagged ? 'flagged' : ''}" onclick="ExamEngine.toggleFlag(${qNum})" title="${isFlagged ? 'Bỏ gắn cờ' : 'Gắn cờ xem lại'}">
                    ${isFlagged ? '🚩' : '🏳️'}
                  </button>
                </div>
                ${q.questionText ? `<p class="question-text">${q.questionText}</p>` : ''}
                <div class="options-group">
                  ${['A', 'B', 'C', 'D'].map(opt => `
                    <button class="option-btn ${userAns === opt ? 'selected' : ''}" onclick="ExamEngine.selectAnswer(${qNum}, '${opt}')">
                      <span class="option-letter">${opt}</span>
                      <span class="option-text">${q.options?.[opt] || ''}</span>
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
        <button class="audio-play-btn" onclick="AudioController.togglePlay('${playerId}', '${audioUrl}')" title="${label}">
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

  // ── Render Question Palette (200 Circles) ──
  renderPalette(totalQuestions, userAnswers, flaggedSet, currentQNum = 1) {
    const answeredCount = Object.keys(userAnswers).length;
    const flaggedCount = flaggedSet.size;
    const remainingCount = totalQuestions - answeredCount;

    let gridHtml = '';
    for (let i = 1; i <= totalQuestions; i++) {
      const isAnswered = Boolean(userAnswers[i]);
      const isFlagged = flaggedSet.has(i);
      const isCurrent = i === currentQNum;

      gridHtml += `
        <button class="palette-btn ${isAnswered ? 'answered' : ''} ${isFlagged ? 'flagged' : ''} ${isCurrent ? 'current' : ''}"
                id="palette_btn_${i}"
                onclick="ExamEngine.scrollToQuestion(${i})"
                title="Câu ${i} ${isAnswered ? `(Đã chọn ${userAnswers[i]})` : ''}">
          ${i}
        </button>
      `;
    }

    return `
      <div class="palette-container">
        <div class="palette-stats">
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
        <div class="palette-grid">
          ${gridHtml}
        </div>
      </div>
    `;
  },

  // ── Lightbox Zoom Modal Helper ──
  openLightbox(imageUrl) {
    let modal = document.getElementById('image-lightbox-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'image-lightbox-modal';
      modal.className = 'image-lightbox-modal';
      modal.innerHTML = `
        <button class="lightbox-close-btn" onclick="UIRenderer.closeLightbox()">&times;</button>
        <div class="lightbox-img-container" onclick="event.stopPropagation()">
          <img id="lightbox-modal-img" src="" alt="Zoomed view">
        </div>
      `;
      modal.onclick = () => UIRenderer.closeLightbox();
      document.body.appendChild(modal);
    }
    const imgEl = modal.querySelector('#lightbox-modal-img');
    if (imgEl) imgEl.src = imageUrl;
    modal.classList.add('open');
  },

  closeLightbox() {
    const modal = document.getElementById('image-lightbox-modal');
    if (modal) modal.classList.remove('open');
  }
};
