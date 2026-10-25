/* Protected by TOEIC Master DataShield v2 */
const RoadmapEngine = {
  PACK_SIZE: 30,
  PLACEMENT_DURATION_SEC: 15 * 60, // 15 minutes for 20-question Mini TOEIC
  CHALLENGE_DURATION_SEC: 12 * 60, // 12 minutes for Skip/Boss Quick Challenge
  EBBINGHAUS_DAYS: [1, 3, 7, 14, 30],
  ZONES: [
    {
      band: '450',
      targetScore: 450,
      minPassScore: 430,
      order: 1,
      icon: '🌱',
      bossIcon: '🛡️',
      name: 'Chặng 1: Khu Rừng Nền Tảng',
      shortName: 'Chặng 450+',
      badge: '450+',
      themeColor: '#10b981',
      subtitle: 'Xây gốc từ loại, thì cơ bản, nghe bắt từ khóa Part 1–2 & đọc câu đơn'
    },
    {
      band: '550',
      targetScore: 550,
      minPassScore: 530,
      order: 2,
      icon: '⚓',
      bossIcon: '🐙',
      name: 'Chặng 2: Hải Cảng Vững Bước',
      shortName: 'Chặng 550+',
      badge: '550+',
      themeColor: '#0ea5e9',
      subtitle: 'Câu bị động, V-ing/To-V, hội thoại ngắn Part 3 & thông báo ngắn Part 7'
    },
    {
      band: '650',
      targetScore: 650,
      minPassScore: 630,
      order: 3,
      icon: '🏰',
      bossIcon: '🐉',
      name: 'Chặng 3: Thành Trì Bứt Phá',
      shortName: 'Chặng 650+',
      badge: '650+',
      themeColor: '#6366f1',
      subtitle: 'Mệnh đề quan hệ rút gọn, liên từ bẫy, nghe suy luận Part 3–4 & điền đoạn Part 6'
    },
    {
      band: '750',
      targetScore: 750,
      minPassScore: 730,
      order: 4,
      icon: '🏔️',
      bossIcon: '🦅',
      name: 'Chặng 4: Đỉnh Núi Thành Thạo',
      shortName: 'Chặng 750+',
      badge: '750+',
      themeColor: '#a855f7',
      subtitle: 'Đảo ngữ/giả định, paraphrase thương mại nâng cao & đọc ghép đôi Part 7'
    },
    {
      band: '850',
      targetScore: 850,
      minPassScore: 830,
      order: 5,
      icon: '👑',
      bossIcon: '🏆',
      name: 'Chặng 5: Vương Miện Đỉnh Cao',
      shortName: 'Chặng 850+',
      badge: '850+',
      themeColor: '#f59e0b',
      subtitle: 'Collocations tinh tế, bẫy ngữ cảnh khó nhất & bài đọc ba dưới áp lực phòng thi'
    }
  ],
  PART_LABELS: {
    part1: 'Part 1 (Mô tả tranh)',
    part2: 'Part 2 (Hỏi – Đáp phản xạ)',
    part3: 'Part 3 (Hội thoại ngắn)',
    part4: 'Part 4 (Bài nói chuyện)',
    part5: 'Part 5 (Điền câu ngắn)',
    part6: 'Part 6 (Hoàn thành đoạn văn)',
    part7: 'Part 7 (Đọc hiểu văn bản)'
  },
  _getStorage() {
    if (typeof StorageService !== 'undefined' && StorageService) return StorageService;
    if (typeof window !== 'undefined' && window.StorageService) return window.StorageService;
    return null;
  },
  _getAppConfig() {
    if (typeof AppConfig !== 'undefined' && AppConfig) return AppConfig;
    if (typeof window !== 'undefined' && window.AppConfig) return window.AppConfig;
    return null;
  },
  _getStudyData(overrideData) {
    if (overrideData && typeof overrideData === 'object') return overrideData;
    if (typeof StudyData !== 'undefined' && StudyData) return StudyData;
    if (typeof window !== 'undefined' && window.StudyData) return window.StudyData;
    return { bands: [], officialVocabPart5: [], grammarTopics: [], etsDictionary: [] };
  },
  _toDateKey(dateInput) {
    const d = dateInput ? new Date(dateInput) : new Date();
    if (isNaN(d.getTime())) return '2026-01-01';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },
  _formatDisplayDate(dateInput) {
    const d = dateInput ? new Date(dateInput) : new Date();
    if (isNaN(d.getTime())) return '--/--/----';
    const day = String(d.getDate()).padStart(2, '0');
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const y = d.getFullYear();
    return `${day}/${m}/${y}`;
  },
  _daysBetween(startDateInput, endDateInput) {
    const d1 = new Date(this._toDateKey(startDateInput) + 'T00:00:00');
    const d2 = new Date(this._toDateKey(endDateInput) + 'T00:00:00');
    return Math.round((d2.getTime() - d1.getTime()) / (24 * 3600 * 1000));
  },
  getZoneByBand(band) {
    const clean = String(band || '450').replace('+', '').trim();
    return this.ZONES.find(z => z.band === clean) || this.ZONES[0];
  },
  scoreToStartBand(score) {
    const s = Number(score) || 0;
    if (s < 425) return '450';
    if (s < 525) return '550';
    if (s < 625) return '650';
    if (s < 725) return '750';
    return '850';
  },
  suggestTargetBands(estimatedScore) {
    const s = Number(estimatedScore) || 300;
    const allTargets = [
      { band: '450', targetScore: 450, label: '450+ Nền tảng' },
      { band: '550', targetScore: 550, label: '550+ Giao tiếp cơ bản' },
      { band: '650', targetScore: 650, label: '650+ Chuẩn ra trường / Đi làm' },
      { band: '750', targetScore: 750, label: '750+ Thành thạo thương mại' },
      { band: '850', targetScore: 850, label: '850+ Đỉnh cao quốc tế' }
    ];
    const available = allTargets.filter(t => t.targetScore > s + 25);
    if (available.length === 0) {
      return [{ band: '850', targetScore: Math.max(880, Math.min(990, Math.ceil((s + 60) / 10) * 10)), label: '900+ Tinh hoa TOEIC', recommended: true }];
    }
    let recIdx = available.findIndex(t => t.targetScore - s >= 120 && t.targetScore - s <= 250);
    if (recIdx < 0) recIdx = 0;
    return available.map((t, idx) => ({
      ...t,
      recommended: idx === recIdx
    }));
  },
  async loadDiagnosticTestData(preferredBook = 'EST 2026', preferredTestId = 10) {
    const cfg = this._getAppConfig();
    const booksToTry = [preferredBook, 'EST 2022'];
    for (const book of booksToTry) {
      if (cfg && typeof cfg.fetchTestShard === 'function') {
        try {
          const shardDb = await cfg.fetchTestShard(book, preferredTestId, 'review');
          if (shardDb && Array.isArray(shardDb.tests) && shardDb.tests.length > 0) {
            return { book, test: shardDb.tests[0] };
          }
        } catch (_) {}
      }
      if (typeof fetch === 'function') {
        try {
          const url = cfg && typeof cfg.getDatabaseUrl === 'function'
            ? cfg.getDatabaseUrl(book)
            : 'data/database_compiled.json';
          const res = await fetch(url);
          if (res && res.ok) {
            const db = await res.json();
            const tests = Array.isArray(db.tests) ? db.tests : (Array.isArray(db) ? db : []);
            const found = tests.find(t => Number(t.testId || t.id) === Number(preferredTestId)) || tests[tests.length - 1];
            if (found) return { book, test: found };
          }
        } catch (_) {}
      }
    }
    return { book: preferredBook, test: null };
  },
  _resolveUrl(rawUrl) {
    if (!rawUrl) return '';
    const cfg = this._getAppConfig();
    if (cfg && typeof cfg.resolveAssetUrl === 'function') {
      return cfg.resolveAssetUrl(rawUrl);
    }
    return String(rawUrl).replace(/\\/g, '/').replace(/^\/+/, '');
  },
  buildPlacementTestQuestions(options = {}) {
    const studyData = this._getStudyData(options.studyData);
    const testObj = options.testObj || null;
    const bookName = options.bookName || 'EST 2026';
    const questions = [];
    const getArr = (p, key) => {
      if (!p) return [];
      if (Array.isArray(p)) return p;
      return Array.isArray(p[key]) ? p[key] : [];
    };
    if (testObj && testObj.listening) {
      const lc = testObj.listening;
      const p1List = getArr(lc.part1, 'questions');
      [0, 3].forEach((idx, n) => {
        const q = p1List[idx] || p1List[n];
        if (q && q.audioUrl) {
          questions.push({
            uid: `pl_p1_${q.questionNumber}`,
            section: 'listening',
            skillKey: 'lc_reflex',
            examPart: 'part1',
            band: n === 0 ? '450' : '550',
            partBadge: 'Part 1 • Mô tả tranh',
            prompt: 'Nghe 4 câu mô tả (A, B, C, D) và chọn câu mô tả đúng nhất bức ảnh dưới đây:',
            imageUrls: q.imageUrl ? [this._resolveUrl(q.imageUrl)] : [],
            audioUrl: this._resolveUrl(q.audioUrl),
            maskOptionText: true,
            options: {
              A: 'Đáp án (A) — Nghe trong băng',
              B: 'Đáp án (B) — Nghe trong băng',
              C: 'Đáp án (C) — Nghe trong băng',
              D: 'Đáp án (D) — Nghe trong băng'
            },
            realOptions: q.options || null,
            correctAnswer: String(q.correctAnswer || 'A').trim().toUpperCase(),
            explanation: q.analysis || q.transcript || 'Nghe kỹ chủ ngữ và hành động chính trong tranh.',
            sourceLabel: `${bookName.replace('EST', 'ETS')} • Test ${testObj.testId || 10} • Q${q.questionNumber}`
          });
        }
      });
      const p2List = getArr(lc.part2, 'questions');
      [1, 8, 16].forEach((idx, n) => {
        const q = p2List[idx] || p2List[n];
        if (q && q.audioUrl) {
          const bands = ['450', '650', '750'];
          questions.push({
            uid: `pl_p2_${q.questionNumber}`,
            section: 'listening',
            skillKey: 'lc_reflex',
            examPart: 'part2',
            band: bands[n] || '550',
            partBadge: 'Part 2 • Hỏi – Đáp phản xạ',
            prompt: 'Nghe 1 câu hỏi/phát biểu và 3 lời hồi đáp (A, B, C), chọn lời hồi đáp phù hợp nhất:',
            imageUrls: [],
            audioUrl: this._resolveUrl(q.audioUrl),
            maskOptionText: true,
            options: {
              A: 'Đáp án (A) — Nghe trong băng',
              B: 'Đáp án (B) — Nghe trong băng',
              C: 'Đáp án (C) — Nghe trong băng'
            },
            realOptions: q.options || null,
            correctAnswer: String(q.correctAnswer || 'A').trim().toUpperCase(),
            explanation: q.analysis || q.transcript || 'Bắt từ để hỏi (Who/When/Where/Why/How) và loại câu trả lời lặp âm.',
            sourceLabel: `${bookName.replace('EST', 'ETS')} • Test ${testObj.testId || 10} • Q${q.questionNumber}`
          });
        }
      });
      const p3Groups = getArr(lc.part3, 'groups');
      const p3Group = p3Groups.find(g => g && g.audioUrl && Array.isArray(g.questions) && g.questions.length >= 3) || p3Groups[0];
      if (p3Group && Array.isArray(p3Group.questions)) {
        p3Group.questions.slice(0, 3).forEach((q, idx) => {
          const bands = ['550', '650', '750'];
          questions.push({
            uid: `pl_p3_${q.questionNumber}`,
            groupKey: `pl_p3_grp_${p3Group.groupId || '1'}`,
            section: 'listening',
            skillKey: 'lc_context',
            examPart: 'part3',
            band: bands[idx] || '650',
            partBadge: `Part 3 • Hội thoại (Câu ${idx + 1}/3 cùng đoạn băng)`,
            prompt: q.questionText || 'Listen to the conversation and choose the best answer.',
            imageUrls: q.imageUrl ? [this._resolveUrl(q.imageUrl)] : [],
            audioUrl: this._resolveUrl(p3Group.audioUrl || q.audioUrl),
            maskOptionText: false,
            options: q.options || { A: 'Option A', B: 'Option B', C: 'Option C', D: 'Option D' },
            correctAnswer: String(q.correctAnswer || 'A').trim().toUpperCase(),
            explanation: q.analysis || 'Đọc trước câu hỏi và bắt từ khóa đồng nghĩa (paraphrase) trong hội thoại.',
            sourceLabel: `${bookName.replace('EST', 'ETS')} • Test ${testObj.testId || 10} • Q${q.questionNumber}`
          });
        });
      }
      const p4Groups = getArr(lc.part4, 'groups');
      const p4Group = p4Groups.find(g => g && g.audioUrl && Array.isArray(g.questions) && g.questions.length >= 2) || p4Groups[0];
      if (p4Group && Array.isArray(p4Group.questions)) {
        p4Group.questions.slice(0, 2).forEach((q, idx) => {
          const bands = ['650', '850'];
          questions.push({
            uid: `pl_p4_${q.questionNumber}`,
            groupKey: `pl_p4_grp_${p4Group.groupId || '1'}`,
            section: 'listening',
            skillKey: 'lc_context',
            examPart: 'part4',
            band: bands[idx] || '750',
            partBadge: `Part 4 • Bài nói ngắn (Câu ${idx + 1}/2 cùng đoạn băng)`,
            prompt: q.questionText || 'Listen to the talk and choose the best answer.',
            imageUrls: q.imageUrl ? [this._resolveUrl(q.imageUrl)] : [],
            audioUrl: this._resolveUrl(p4Group.audioUrl || q.audioUrl),
            maskOptionText: false,
            options: q.options || { A: 'Option A', B: 'Option B', C: 'Option C', D: 'Option D' },
            correctAnswer: String(q.correctAnswer || 'A').trim().toUpperCase(),
            explanation: q.analysis || 'Chú ý câu mở đầu để biết chủ đề bài nói và câu cuối cho hành động tiếp theo.',
            sourceLabel: `${bookName.replace('EST', 'ETS')} • Test ${testObj.testId || 10} • Q${q.questionNumber}`
          });
        });
      }
    }
    const gTopics = Array.isArray(studyData.grammarTopics) ? studyData.grammarTopics : [];
    ['450', '550', '650', '750', '850'].forEach((band, bIdx) => {
      const bandTopics = gTopics.filter(t => String(t.band) === band && Array.isArray(t.practiceQuestions) && t.practiceQuestions.length > 0);
      const chosenTopic = bandTopics[bIdx % Math.max(1, bandTopics.length)];
      const q = chosenTopic ? (chosenTopic.practiceQuestions[2] || chosenTopic.practiceQuestions[0]) : null;
      if (q) {
        questions.push({
          uid: `pl_g_${band}_${q.id}`,
          section: 'reading',
          skillKey: 'rc_grammar',
          examPart: 'part5',
          band,
          topicId: chosenTopic.id,
          partBadge: `Part 5 • Ngữ pháp mốc ${band}+`,
          prompt: q.questionText,
          imageUrls: [],
          audioUrl: '',
          maskOptionText: false,
          options: q.options,
          correctAnswer: String(q.correctAnswer || 'A').trim().toUpperCase(),
          explanation: q.explanation || q.questionTranslation || '',
          translation: q.questionTranslation || '',
          sourceLabel: q.source || `Part 5 Grammar (${band}+)`
        });
      }
    });
    const vList = Array.isArray(studyData.officialVocabPart5) ? studyData.officialVocabPart5 : [];
    ['450', '650', '850'].forEach((band, vIdx) => {
      const matches = vList.filter(q => String(q.band) === band);
      const q = matches[vIdx + 1] || matches[0];
      if (q) {
        questions.push({
          uid: `pl_v_${band}_${q.id}`,
          section: 'reading',
          skillKey: 'rc_vocab',
          examPart: 'part5',
          band,
          targetWord: q.targetWord || '',
          partBadge: `Part 5 • Từ vựng mốc ${band}+`,
          prompt: q.questionText,
          imageUrls: [],
          audioUrl: '',
          maskOptionText: false,
          options: q.options,
          correctAnswer: String(q.correctAnswer || 'A').trim().toUpperCase(),
          explanation: q.explanation || q.questionTranslation || '',
          translation: q.questionTranslation || '',
          sourceLabel: q.source || `Part 5 Vocabulary (${band}+)`
        });
      }
    });
    let p7Added = 0;
    if (testObj && testObj.reading) {
      const p7Groups = getArr(testObj.reading.part7, 'groups');
      const p7Group = p7Groups.find(g => g && Array.isArray(g.questions) && g.questions.length === 2 && Array.isArray(g.passages) && g.passages.length > 0) || p7Groups[0];
      if (p7Group && Array.isArray(p7Group.questions)) {
        const passageImgs = (p7Group.passages || []).map(p => this._resolveUrl(p.imageUrl)).filter(Boolean);
        p7Group.questions.slice(0, 2).forEach((q, idx) => {
          questions.push({
            uid: `pl_p7_${q.questionNumber}`,
            groupKey: `pl_p7_grp_${p7Group.groupId || '1'}`,
            section: 'reading',
            skillKey: 'rc_passage',
            examPart: 'part7',
            band: idx === 0 ? '550' : '750',
            partBadge: `Part 7 • Đọc hiểu văn bản (Câu ${idx + 1}/2)`,
            prompt: q.questionText || 'Read the passage above and choose the best answer.',
            imageUrls: passageImgs,
            audioUrl: '',
            maskOptionText: false,
            options: q.options || { A: 'Option A', B: 'Option B', C: 'Option C', D: 'Option D' },
            correctAnswer: String(q.correctAnswer || 'A').trim().toUpperCase(),
            explanation: q.analysis || 'Đọc câu hỏi trước để định vị từ khóa trên đoạn văn rồi đối chiếu đáp án.',
            sourceLabel: `${bookName.replace('EST', 'ETS')} • Test ${testObj.testId || 10} • Q${q.questionNumber}`
          });
          p7Added++;
        });
      }
    }
    let padIdx = 0;
    while (questions.length < 20 && vList.length > 0) {
      const q = vList[(padIdx * 7 + 3) % vList.length];
      padIdx++;
      if (!q || questions.some(existing => existing.uid.endsWith(q.id))) continue;
      const isFakeLc = questions.filter(x => x.section === 'listening').length < 10;
      questions.push({
        uid: `pl_pad_${questions.length + 1}_${q.id}`,
        section: isFakeLc ? 'listening' : 'reading',
        skillKey: isFakeLc ? 'lc_context' : (p7Added < 2 ? 'rc_passage' : 'rc_vocab'),
        examPart: isFakeLc ? 'part3' : 'part5',
        band: String(q.band || '550'),
        partBadge: `Câu chẩn đoán bổ sung (${q.band || '550'}+)`,
        prompt: q.questionText,
        imageUrls: [],
        audioUrl: '',
        maskOptionText: false,
        options: q.options,
        correctAnswer: String(q.correctAnswer || 'A').trim().toUpperCase(),
        explanation: q.explanation || '',
        translation: q.questionTranslation || '',
        sourceLabel: q.source || 'ETS Corpus'
      });
    }
    return questions.slice(0, 20).map((q, idx) => ({
      ...q,
      index: idx + 1
    }));
  },
  evaluatePlacementResult(questions, userAnswers = {}) {
    const safeQs = Array.isArray(questions) ? questions : [];
    const bandWeight = { '450': 1.0, '550': 1.1, '650': 1.2, '750': 1.3, '850': 1.4 };
    const skillDefs = {
      lc_reflex: { key: 'lc_reflex', label: 'Nghe phản xạ (Part 1–2)', correct: 0, total: 0, parts: ['part1', 'part2'] },
      lc_context: { key: 'lc_context', label: 'Nghe hội thoại & bài nói (Part 3–4)', correct: 0, total: 0, parts: ['part3', 'part4'] },
      rc_grammar: { key: 'rc_grammar', label: 'Ngữ pháp tốc độ (Part 5)', correct: 0, total: 0, parts: ['part5'] },
      rc_vocab: { key: 'rc_vocab', label: 'Từ vựng ETS thương mại', correct: 0, total: 0, parts: ['part5', 'part6'] },
      rc_passage: { key: 'rc_passage', label: 'Đọc hiểu đoạn văn (Part 6–7)', correct: 0, total: 0, parts: ['part7', 'part6'] }
    };
    let lcCorrect = 0;
    let lcTotal = 0;
    let lcWeightedEarned = 0;
    let lcWeightedMax = 0;
    let rcCorrect = 0;
    let rcTotal = 0;
    let rcWeightedEarned = 0;
    let rcWeightedMax = 0;
    const wrongItems = [];
    const partStats = {};
    safeQs.forEach(q => {
      const picked = String(userAnswers[q.uid] || userAnswers[q.index] || '').trim().toUpperCase();
      const isCorrect = picked !== '' && picked === String(q.correctAnswer || '').trim().toUpperCase();
      const w = bandWeight[String(q.band)] || 1.1;
      if (q.section === 'listening') {
        lcTotal++;
        lcWeightedMax += w;
        if (isCorrect) {
          lcCorrect++;
          lcWeightedEarned += w;
        }
      } else {
        rcTotal++;
        rcWeightedMax += w;
        if (isCorrect) {
          rcCorrect++;
          rcWeightedEarned += w;
        }
      }
      const sk = skillDefs[q.skillKey] || skillDefs.rc_vocab;
      sk.total++;
      if (isCorrect) sk.correct++;
      const ep = q.examPart || 'part5';
      if (!partStats[ep]) partStats[ep] = { correct: 0, total: 0 };
      partStats[ep].total++;
      if (isCorrect) partStats[ep].correct++;
      if (!isCorrect) {
        wrongItems.push({
          uid: q.uid,
          band: q.band || '450',
          skillKey: q.skillKey,
          examPart: ep,
          targetWord: q.targetWord || '',
          topicId: q.topicId || '',
          prompt: q.maskOptionText
            ? `${q.prompt} (${q.sourceLabel || q.partBadge})`
            : q.prompt,
          options: q.realOptions || q.options,
          correctAnswer: q.correctAnswer,
          userAnswer: picked || null,
          explanation: q.explanation || '',
          audioUrl: q.audioUrl || '',
          imageUrls: Array.isArray(q.imageUrls) ? q.imageUrls.slice() : []
        });
      }
    });
    const cfg = this._getAppConfig();
    const lcRatio = lcWeightedMax > 0 ? (lcWeightedEarned / lcWeightedMax) : 0;
    const rcRatio = rcWeightedMax > 0 ? (rcWeightedEarned / rcWeightedMax) : 0;
    const estLcOutOf100 = Math.round(lcRatio * 100);
    const estRcOutOf100 = Math.round(rcRatio * 100);
    const lcScore = (cfg && typeof cfg.calculateListeningScore === 'function')
      ? cfg.calculateListeningScore(estLcOutOf100)
      : Math.max(5, Math.min(495, Math.round((estLcOutOf100 * 4.95) / 5) * 5));
    const rcScore = (cfg && typeof cfg.calculateReadingScore === 'function')
      ? cfg.calculateReadingScore(estRcOutOf100)
      : Math.max(5, Math.min(495, Math.round((estRcOutOf100 * 4.95) / 5) * 5));
    const estimatedScore = lcScore + rcScore;
    const skillBreakdown = Object.values(skillDefs).map(s => {
      const pct = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
      return {
        key: s.key,
        label: s.label,
        correct: s.correct,
        total: s.total,
        percent: pct,
        level: pct >= 75 ? 'strong' : (pct >= 50 ? 'medium' : 'weak'),
        parts: s.parts
      };
    });
    const weakPartsSet = new Set();
    skillBreakdown
      .slice()
      .sort((a, b) => a.percent - b.percent)
      .forEach(s => {
        if (s.percent < 75) {
          s.parts.forEach(p => weakPartsSet.add(p));
        }
      });
    if (weakPartsSet.size === 0) {
      ['part3', 'part7', 'part4'].forEach(p => weakPartsSet.add(p));
    }
    const startBand = this.scoreToStartBand(estimatedScore);
    const suggestedTargets = this.suggestTargetBands(estimatedScore);
    const recommendedTarget = (suggestedTargets.find(t => t.recommended) || suggestedTargets[0]).band;
    return {
      completedAt: new Date().toISOString(),
      totalCorrect: lcCorrect + rcCorrect,
      totalQuestions: safeQs.length,
      lcCorrect,
      lcTotal,
      rcCorrect,
      rcTotal,
      lcScore,
      rcScore,
      estimatedScore,
      startBand,
      recommendedTargetBand: recommendedTarget,
      suggestedTargets,
      skillBreakdown,
      weakParts: Array.from(weakPartsSet),
      wrongItems
    };
  },
  buildZoneChallengeQuestions(zoneBand, options = {}) {
    const cleanBand = String(zoneBand || '550').replace('+', '').trim();
    const studyData = this._getStudyData(options.studyData);
    const testObj = options.testObj || null;
    const count = options.count || 12;
    const isBossQuick = options.challengeType === 'boss_quick' || count >= 15;
    const bandIdx = Math.max(0, ['450', '550', '650', '750', '850'].indexOf(cleanBand));
    const items = [];
    if (testObj && testObj.listening) {
      const p2List = Array.isArray(testObj.listening.part2)
        ? testObj.listening.part2
        : (testObj.listening.part2 && testObj.listening.part2.questions) || [];
      const p3Groups = Array.isArray(testObj.listening.part3)
        ? testObj.listening.part3
        : (testObj.listening.part3 && testObj.listening.part3.groups) || [];
      const p2PickIdx = p2List.length > 0
        ? ((bandIdx * 4 + (isBossQuick ? 7 : 2)) % p2List.length)
        : 0;
      const p2Item = p2List[p2PickIdx] || p2List[0];
      if (p2Item && p2Item.audioUrl) {
        items.push({
          uid: `ch_p2_${cleanBand}_${p2Item.questionNumber}`,
          section: 'listening',
          band: cleanBand,
          partBadge: `Nghe phản xạ Part 2 (${cleanBand}+)`,
          prompt: 'Nghe câu hỏi và 3 phương án (A, B, C), chọn đáp án đúng nhất:',
          audioUrl: this._resolveUrl(p2Item.audioUrl),
          imageUrls: [],
          maskOptionText: true,
          options: { A: 'Đáp án (A)', B: 'Đáp án (B)', C: 'Đáp án (C)' },
          realOptions: p2Item.options || null,
          correctAnswer: String(p2Item.correctAnswer || 'A').trim().toUpperCase(),
          explanation: p2Item.analysis || p2Item.transcript || ''
        });
      }
      const p3PickIdx = p3Groups.length > 0
        ? ((bandIdx * 2 + (isBossQuick ? 5 : 1)) % p3Groups.length)
        : 0;
      const g = p3Groups[p3PickIdx] || p3Groups[0];
      if (g && g.audioUrl && Array.isArray(g.questions)) {
        g.questions.slice(0, 2).forEach((q, idx) => {
          items.push({
            uid: `ch_p3_${cleanBand}_${q.questionNumber}`,
            section: 'listening',
            band: cleanBand,
            partBadge: `Nghe hội thoại Part 3 (Câu ${idx + 1}/2)`,
            prompt: q.questionText,
            audioUrl: this._resolveUrl(g.audioUrl),
            imageUrls: q.imageUrl ? [this._resolveUrl(q.imageUrl)] : [],
            maskOptionText: false,
            options: q.options,
            correctAnswer: String(q.correctAnswer || 'A').trim().toUpperCase(),
            explanation: q.analysis || ''
          });
        });
      }
    }
    const gTopics = (studyData.grammarTopics || []).filter(t => String(t.band) === cleanBand);
    const gOffsets = isBossQuick ? [1, 5] : [0, 4];
    gTopics.forEach((topic, tIdx) => {
      const pqs = topic.practiceQuestions || [];
      if (pqs.length === 0) return;
      gOffsets.forEach(offset => {
        const q = pqs[(offset + tIdx) % pqs.length];
        if (q && items.length < count && !items.some(x => x.uid === `ch_g_${cleanBand}_${q.id}`)) {
          items.push({
            uid: `ch_g_${cleanBand}_${q.id}`,
            section: 'reading',
            band: cleanBand,
            partBadge: `Ngữ pháp ${cleanBand}+ • ${topic.title}`,
            prompt: q.questionText,
            audioUrl: '',
            imageUrls: [],
            maskOptionText: false,
            options: q.options,
            correctAnswer: String(q.correctAnswer || 'A').trim().toUpperCase(),
            explanation: q.explanation || q.questionTranslation || ''
          });
        }
      });
    });
    const vList = (studyData.officialVocabPart5 || []).filter(q => String(q.band) === cleanBand);
    const vStart = isBossQuick ? 6 : 0;
    for (let step = 0; items.length < count && step < vList.length; step++) {
      const q = vList[(vStart + step) % vList.length];
      if (!q || items.some(x => x.uid.endsWith(q.id))) continue;
      items.push({
        uid: `ch_v_${cleanBand}_${q.id}`,
        section: 'reading',
        band: cleanBand,
        partBadge: `Từ vựng ETS ${cleanBand}+`,
        prompt: q.questionText,
        audioUrl: '',
        imageUrls: [],
        maskOptionText: false,
        options: q.options,
        correctAnswer: String(q.correctAnswer || 'A').trim().toUpperCase(),
        explanation: q.explanation || q.questionTranslation || ''
      });
    }
    return items.slice(0, count).map((item, idx) => ({ ...item, index: idx + 1 }));
  },
  calculateTimelineEstimate(startScore, targetBand, dailyMinutes = 45, startDateInput = null) {
    const sScore = Math.max(10, Math.min(990, Number(startScore) || 350));
    const cleanTargetBand = String(targetBand || '650').replace('+', '').trim();
    const targetZone = this.getZoneByBand(cleanTargetBand);
    const targetScore = Math.max(sScore + 60, targetZone.targetScore);
    const mins = [30, 45, 60].includes(Number(dailyMinutes)) ? Number(dailyMinutes) : 45;
    const deltaScore = Math.max(60, targetScore - sScore);
    const totalStudyHours = Math.max(8, Math.round((deltaScore / 100) * 28));
    const rawDays = Math.round((totalStudyHours * 60) / mins);
    const totalStudyNodes = Math.max(10, Math.min(90, rawDays));
    const startBand = this.scoreToStartBand(sScore);
    const startOrder = this.getZoneByBand(startBand).order;
    const endOrder = Math.max(startOrder, targetZone.order);
    const activeZonesCount = endOrder - startOrder + 1;
    const totalBossNodes = activeZonesCount;
    const estimatedDays = totalStudyNodes + totalBossNodes;
    const baseDate = startDateInput ? new Date(startDateInput) : new Date();
    const etaDate = new Date(baseDate.getTime() + estimatedDays * 24 * 3600 * 1000);
    return {
      startScore: sScore,
      startBand,
      targetBand: cleanTargetBand,
      targetScore,
      dailyMinutes: mins,
      deltaScore,
      totalStudyHours,
      totalStudyNodes,
      totalBossNodes,
      activeZonesCount,
      estimatedDays,
      etaDateIso: etaDate.toISOString(),
      etaDateFormatted: this._formatDisplayDate(etaDate)
    };
  },
  generateRoadmapPlan(config = {}) {
    const studyData = this._getStudyData(config.studyData);
    const startScore = Math.max(10, Math.min(990, Number(config.startScore) || 350));
    const cleanTargetBand = String(config.targetBand || '650').replace('+', '').trim();
    const dailyMinutes = [30, 45, 60].includes(Number(config.dailyMinutes)) ? Number(config.dailyMinutes) : 45;
    const weakParts = Array.isArray(config.weakParts) && config.weakParts.length > 0
      ? config.weakParts
      : ['part2', 'part3', 'part5', 'part7'];
    const est = this.calculateTimelineEstimate(startScore, cleanTargetBand, dailyMinutes, config.startedAt);
    const startZoneObj = this.getZoneByBand(est.startBand);
    const targetZoneObj = this.getZoneByBand(cleanTargetBand);
    const maxOrder = Math.max(startZoneObj.order, targetZoneObj.order);
    const dictList = Array.isArray(studyData.etsDictionary) ? studyData.etsDictionary : [];
    const grammarTopics = Array.isArray(studyData.grammarTopics) ? studyData.grammarTopics : [];
    const relevantZones = this.ZONES.filter(z => z.order <= maxOrder);
    const activeZones = relevantZones.filter(z => z.order >= startZoneObj.order);
    const basePerZone = Math.max(4, Math.floor(est.totalStudyNodes / Math.max(1, activeZones.length)));
    let remainder = Math.max(0, est.totalStudyNodes - basePerZone * activeZones.length);
    const booksCycle = ['EST 2022', 'EST 2023', 'EST 2024', 'EST 2026'];
    let dailySlotCursor = 0; // each 6 slots = 1 full 200Q test (Tests 1..8) in 6-day split mode!
    let weakDrillCursor = 0; // dedicated cursor so Weak-Part drills never repeat the same Book+Test+Part
    let bossTestCursor = 0;
    let globalDayNum = 0;
    const zonesOutput = [];
    const nodeProgress = {};
    let firstActiveAssigned = false;
    relevantZones.forEach(zMeta => {
      const isPreCleared = zMeta.order < startZoneObj.order;
      const isFinalZone = zMeta.order === maxOrder;
      const zoneNodes = [];
      if (isPreCleared) {
        const preNodeId = `node_pre_${zMeta.band}`;
        zoneNodes.push({
          id: preNodeId,
          zoneBand: zMeta.band,
          type: 'placement_cleared',
          dayNumber: 0,
          title: `Đã vượt qua ${zMeta.shortName}`,
          subtitle: `Miễn giảm nhờ đạt ${startScore}đ ở bài Test đầu vào`,
          icon: '✨',
          steps: []
        });
        nodeProgress[preNodeId] = {
          status: 'completed',
          stars: 3,
          completedAt: new Date().toISOString(),
          stepDone: { review: true, learn: true, practice: true }
        };
        zonesOutput.push({
          ...zMeta,
          zoneStatus: 'cleared_by_placement',
          isFinalZone: false,
          nodes: zoneNodes
        });
        return;
      }
      const studyCountForZone = basePerZone + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
      const bandWords = dictList.filter(e => String(e.band) === zMeta.band);
      const totalPacksInBand = Math.max(1, Math.ceil(bandWords.length / this.PACK_SIZE));
      const bandGrammar = grammarTopics.filter(t => String(t.band) === zMeta.band);
      const checkpointIndex = studyCountForZone >= 6 ? Math.floor(studyCountForZone / 2) : -1;
      let vocabPackCursor = 0;
      let grammarTopicCursor = 0;
      for (let i = 0; i < studyCountForZone; i++) {
        globalDayNum++;
        const isCheckpoint = (i === checkpointIndex);
        const nodeId = `node_${zMeta.band}_d${globalDayNum}`;
        const wantGrammarSlot = (bandGrammar.length > 0) && (i % 3 === 1);
        const canUseFreshGrammar = wantGrammarSlot && (
          grammarTopicCursor < bandGrammar.length || vocabPackCursor >= totalPacksInBand
        );
        let learnTask;
        if (canUseFreshGrammar) {
          const gTopic = bandGrammar[grammarTopicCursor % bandGrammar.length];
          const grammarPass = Math.floor(grammarTopicCursor / bandGrammar.length) + 1;
          grammarTopicCursor++;
          const qTotal = Array.isArray(gTopic.practiceQuestions) ? gTopic.practiceQuestions.length : 20;
          const baseMinQ = dailyMinutes >= 45 ? 8 : 5;
          const clampedMinQ = Math.min(Math.max(1, qTotal), baseMinQ * grammarPass);
          learnTask = {
            stepKey: 'learn',
            kind: 'grammar_topic',
            band: zMeta.band,
            topicId: gTopic.id,
            topicTitle: gTopic.title,
            grammarPass,
            questionCount: qTotal,
            title: grammarPass > 1
              ? `Ngữ pháp ${zMeta.badge}: ${gTopic.title} (Chuyên sâu)`
              : `Ngữ pháp ${zMeta.badge}: ${gTopic.title}`,
            desc: dailyMinutes >= 45
              ? `Đọc công thức Mẹo 5s & giải tối thiểu ${clampedMinQ} câu Part 5 chuyên đề "${gTopic.title}"`
              : `Nắm công thức Mẹo 5s & giải tối thiểu ${clampedMinQ} câu Part 5 chuyên đề "${gTopic.title}"`,
            minQuestions: clampedMinQ,
            estMinutes: dailyMinutes >= 45 ? 15 : 10,
            url: `grammar.html?band=${zMeta.band}&tab=theory&topic=${encodeURIComponent(gTopic.id)}&from=roadmap&node=${encodeURIComponent(nodeId)}`
          };
        } else {
          const packNum = (vocabPackCursor % totalPacksInBand) + 1;
          vocabPackCursor++;
          const sliceStart = (packNum - 1) * this.PACK_SIZE;
          const actualPackSize = bandWords.length > 0
            ? Math.max(1, Math.min(this.PACK_SIZE, bandWords.length - sliceStart))
            : this.PACK_SIZE;
          const rawMinWords = dailyMinutes >= 45 ? 10 : 8;
          const clampedMinWords = Math.min(actualPackSize, rawMinWords);
          learnTask = {
            stepKey: 'learn',
            kind: 'vocab_pack',
            band: zMeta.band,
            packNum,
            packSize: actualPackSize,
            quizTopicId: `dict_${zMeta.band}_p${packNum}`,
            title: `Từ vựng ${zMeta.badge}: Bộ ${packNum} (${actualPackSize} từ ETS)`,
            desc: dailyMinutes >= 45
              ? `Lật Flashcard Bộ ${packNum} (đánh dấu ít nhất ${clampedMinWords} từ) hoặc hoàn thành bài Quiz Bộ ${packNum}`
              : `Học Flashcard Bộ ${packNum} (đánh dấu ít nhất ${clampedMinWords} từ) hoặc làm Quiz Bộ ${packNum}`,
            minMarkedWords: clampedMinWords,
            estMinutes: dailyMinutes >= 45 ? 15 : 10,
            url: `vocab.html?band=${zMeta.band}&mode=flashcard&pack=${packNum}&from=roadmap&node=${encodeURIComponent(nodeId)}`
          };
        }
        const useWeakPartDrill = !isCheckpoint && (i % 3 === 2) && weakParts.length > 0;
        let practiceTask;
        if (useWeakPartDrill) {
          const targetPart = weakParts[weakDrillCursor % weakParts.length] || 'part3';
          const pBook = booksCycle[weakDrillCursor % booksCycle.length];
          const pTest = (Math.floor(weakDrillCursor / booksCycle.length) % 8) + 1; // Tests 1..8
          weakDrillCursor++;
          practiceTask = {
            stepKey: 'practice',
            kind: 'exam_part',
            examMode: 'part',
            book: pBook,
            testId: pTest,
            partFilter: targetPart,
            title: `Bồi đắp điểm yếu: ${this.PART_LABELS[targetPart] || targetPart.toUpperCase()}`,
            desc: `Luyện chuyên sâu ${this.PART_LABELS[targetPart] || targetPart} trên ${pBook.replace('EST', 'ETS')} — Test ${pTest}`,
            estMinutes: dailyMinutes >= 60 ? 25 : 15,
            url: `exam.html?book=${encodeURIComponent(pBook)}&test=${pTest}&mode=part&part=${encodeURIComponent(targetPart)}&from=roadmap&node=${encodeURIComponent(nodeId)}`
          };
        } else {
          const dBook = booksCycle[Math.floor(dailySlotCursor / 48) % booksCycle.length];
          const dTest = (Math.floor(dailySlotCursor / 6) % 8) + 1; // Tests 1..8 (reserving Tests 9..10 for Boss & Placement)
          const dDay = (dailySlotCursor % 6) + 1; // Day 1..6
          dailySlotCursor++;
          practiceTask = {
            stepKey: 'practice',
            kind: 'exam_daily',
            examMode: 'daily',
            book: dBook,
            testId: dTest,
            dayFilter: dDay,
            title: `${dBook.replace('EST', 'ETS')} Test ${dTest} — Ngày ${dDay}/6`,
            desc: `Luyện đều 7 Part (~33 câu • 20 phút, Audio cắt từng câu & không cắt lẻ đoạn đọc)`,
            estMinutes: 20,
            url: `exam.html?book=${encodeURIComponent(dBook)}&test=${dTest}&mode=daily&day=${dDay}&from=roadmap&node=${encodeURIComponent(nodeId)}`
          };
        }
        const reviewCount = dailyMinutes >= 60 ? 8 : (dailyMinutes >= 45 ? 6 : 5);
        const reviewTask = {
          stepKey: 'review',
          kind: 'spaced_review',
          band: zMeta.band,
          questionCount: reviewCount,
          title: `Ôn tập ngắt quãng (${reviewCount} câu Ebbinghaus)`,
          desc: 'Ôn lại từ chưa thuộc & câu từng làm sai theo chu kỳ 1–3–7–14 ngày ngay trên Bản đồ',
          estMinutes: 5
        };
        zoneNodes.push({
          id: nodeId,
          zoneBand: zMeta.band,
          type: isCheckpoint ? 'checkpoint' : 'study',
          dayNumber: globalDayNum,
          title: isCheckpoint ? `Trạm Kiểm Tra Giữa Chặng • Ngày ${globalDayNum}` : `Ngày ${globalDayNum}`,
          subtitle: `${learnTask.kind === 'grammar_topic' ? '📐 Ngữ pháp' : '📚 Từ vựng'} + 🎯 ${practiceTask.examMode === 'part' ? 'Part yếu' : 'Đề 6 ngày'}`,
          icon: isCheckpoint ? '🚩' : (learnTask.kind === 'grammar_topic' ? '📐' : '📘'),
          steps: [reviewTask, learnTask, practiceTask]
        });
        nodeProgress[nodeId] = {
          status: !firstActiveAssigned ? 'active' : 'locked',
          unlockedAt: !firstActiveAssigned ? new Date().toISOString() : null,
          stars: 0,
          completedAt: null,
          stepDone: { review: false, learn: false, practice: false },
          reviewScore: null
        };
        if (!firstActiveAssigned) firstActiveAssigned = true;
      }
      const bossSlots = [
        { book: 'EST 2022', testId: 10 },
        { book: 'EST 2023', testId: 10 },
        { book: 'EST 2024', testId: 10 },
        { book: 'EST 2026', testId: 9 },
        { book: 'EST 2022', testId: 9 }
      ];
      globalDayNum++;
      const bossPick = bossSlots[bossTestCursor % bossSlots.length];
      bossTestCursor++;
      const bossBook = bossPick.book;
      const bossTestId = bossPick.testId;
      const bossNodeId = `node_boss_${zMeta.band}`;
      zoneNodes.push({
        id: bossNodeId,
        zoneBand: zMeta.band,
        type: 'boss',
        isFinalGoalBoss: isFinalZone,
        dayNumber: globalDayNum,
        minPassScore: isFinalZone ? est.targetScore - 15 : zMeta.minPassScore,
        targetScore: isFinalZone ? est.targetScore : zMeta.targetScore,
        title: isFinalZone
          ? `🏁 VẠCH ĐÍCH: Chinh Phục ${est.targetScore}+ TOEIC`
          : `👑 Ải Boss Cuối ${zMeta.shortName}`,
        subtitle: isFinalZone
          ? `Thử thách tốt nghiệp Lộ trình • Đạt chuẩn ${est.targetScore - 15}+ điểm để chạm Cúp Vô Địch!`
          : `Vượt chuẩn ${zMeta.minPassScore}+ điểm ở Full Test (hoặc >= 75% Bài Boss Nhanh) để mở chặng mới`,
        icon: isFinalZone ? '🏆' : zMeta.bossIcon,
        steps: [
          {
            stepKey: 'practice',
            kind: 'boss_exam',
            examMode: 'full',
            book: bossBook,
            testId: bossTestId,
            minPassScore: isFinalZone ? est.targetScore - 15 : zMeta.minPassScore,
            title: `Đấu Boss Phòng Thi: ${bossBook.replace('EST', 'ETS')} — Full Test ${bossTestId}`,
            desc: `Làm Full Test 200 câu (120 phút) đạt >= ${isFinalZone ? est.targetScore - 15 : zMeta.minPassScore}đ HOẶC vượt Bài Khảo Sát Boss Nhanh 12 phút ngay tại đây`,
            estMinutes: 120,
            url: `exam.html?book=${encodeURIComponent(bossBook)}&test=${bossTestId}&mode=full&from=roadmap&node=${encodeURIComponent(bossNodeId)}`
          }
        ]
      });
      nodeProgress[bossNodeId] = {
        status: !firstActiveAssigned ? 'active' : 'locked',
        unlockedAt: !firstActiveAssigned ? new Date().toISOString() : null,
        stars: 0,
        completedAt: null,
        stepDone: { review: true, learn: true, practice: false },
        bossClearedBy: null
      };
      if (!firstActiveAssigned) firstActiveAssigned = true;
      zonesOutput.push({
        ...zMeta,
        zoneStatus: zMeta.order === startZoneObj.order ? 'active' : 'locked',
        isFinalZone,
        nodes: zoneNodes
      });
    });
    const nowIso = new Date().toISOString();
    return {
      initialized: true,
      placementDone: true,
      profile: {
        startScore: est.startScore,
        currentScore: est.startScore,
        startBand: est.startBand,
        targetBand: est.targetBand,
        targetScore: est.targetScore,
        dailyMinutes: est.dailyMinutes,
        weakParts,
        totalStudyHours: est.totalStudyHours,
        startedAt: config.startedAt || nowIso,
        updatedAt: nowIso
      },
      zones: zonesOutput,
      nodeProgress
    };
  },
  mergeRoadmapProgressOnReplan(previousState, freshPlan, studyDataOverride = null) {
    if (!freshPlan || typeof freshPlan !== 'object') return freshPlan;
    const hasPriorActivePlan = Boolean(
      previousState &&
      previousState.initialized &&
      previousState.profile &&
      previousState.nodeProgress &&
      typeof previousState.nodeProgress === 'object'
    );
    const mergedState = {
      ...(previousState && typeof previousState === 'object' ? previousState : {}),
      initialized: true,
      placementDone: true,
      profile: {
        ...freshPlan.profile,
        startedAt: (hasPriorActivePlan && previousState.profile.startedAt)
          ? previousState.profile.startedAt
          : freshPlan.profile.startedAt,
        currentScore: hasPriorActivePlan
          ? Math.max(Number(freshPlan.profile.startScore) || 0, Number(previousState.profile.currentScore) || 0)
          : freshPlan.profile.currentScore
      },
      zones: freshPlan.zones,
      nodeProgress: { ...freshPlan.nodeProgress },
      reviewQueue: (previousState && previousState.reviewQueue) ? { ...previousState.reviewQueue } : {},
      streak: (previousState && previousState.streak)
        ? { ...previousState.streak }
        : { count: 0, best: 0, lastActiveDate: null, activeDates: [] }
    };
    if (hasPriorActivePlan) {
      const oldNpMap = previousState.nodeProgress || {};
      const oldCompletedReviewQueue = [];
      Object.keys(oldNpMap).forEach(oldId => {
        const oldNp = oldNpMap[oldId];
        if (!oldNp || oldId.startsWith('node_pre_')) return;
        if (oldId.startsWith('node_boss_')) {
          if (mergedState.nodeProgress[oldId] && oldNp.status === 'completed') {
            mergedState.nodeProgress[oldId] = { ...oldNp };
          }
          return;
        }
        if (oldNp.skippedByChallenge && mergedState.nodeProgress[oldId]) {
          mergedState.nodeProgress[oldId] = { ...oldNp };
          return;
        }
        if (oldNp.status === 'completed' && mergedState.nodeProgress[oldId]) {
          mergedState.nodeProgress[oldId] = { ...oldNp };
          return;
        }
        if (oldNp.stepDone && oldNp.stepDone.review) {
          oldCompletedReviewQueue.push({
            oldId,
            reviewScore: oldNp.reviewScore || null,
            completedAt: oldNp.completedAt || null,
            stars: oldNp.stars || 0
          });
        }
      });
      const skippedBands = new Set();
      (previousState.zones || []).forEach(oz => {
        const realOld = (oz.nodes || []).filter(n => n.type !== 'placement_cleared');
        if (realOld.length > 0 && realOld.every(n => oldNpMap[n.id] && oldNpMap[n.id].skippedByChallenge)) {
          skippedBands.add(String(oz.band));
        }
      });
      let reviewCarryIdx = 0;
      (mergedState.zones || []).forEach(z => {
        if (z.zoneStatus === 'cleared_by_placement') return;
        const isZoneSkipped = skippedBands.has(String(z.band));
        (z.nodes || []).forEach(n => {
          if (n.type === 'placement_cleared') return;
          if (isZoneSkipped) {
            mergedState.nodeProgress[n.id] = {
              ...(mergedState.nodeProgress[n.id] || {}),
              status: 'completed',
              stars: 2,
              skippedByChallenge: true,
              completedAt: new Date().toISOString(),
              stepDone: { review: true, learn: true, practice: true }
            };
            return;
          }
          if (n.type !== 'boss' && reviewCarryIdx < oldCompletedReviewQueue.length) {
            const carried = oldCompletedReviewQueue[reviewCarryIdx++];
            const curNp = mergedState.nodeProgress[n.id] || {};
            mergedState.nodeProgress[n.id] = {
              ...curNp,
              stepDone: { ...(curNp.stepDone || {}), review: true },
              reviewScore: carried.reviewScore
            };
          }
        });
      });
    }
    return this.syncRoadmapProgress(mergedState, studyDataOverride);
  },
  seedReviewQueueFromMistakes(existingQueue = {}, wrongItems = []) {
    const queue = { ...(existingQueue || {}) };
    const todayIso = new Date().toISOString();
    (wrongItems || []).forEach(item => {
      if (!item || !item.options || !item.correctAnswer) return;
      if (!item.prompt) return;
      const key = `rv_${item.uid}`;
      queue[key] = {
        id: key,
        kind: item.targetWord ? 'vocab' : (item.topicId ? 'grammar' : 'exam_q'),
        band: item.band || '450',
        box: 1,
        wrongCount: ((queue[key] && queue[key].wrongCount) || 0) + 1,
        nextReviewAt: todayIso, // Due immediately on Day 1!
        payload: {
          prompt: item.prompt,
          options: item.options,
          correctAnswer: item.correctAnswer,
          explanation: item.explanation || '',
          audioUrl: item.audioUrl || '',
          imageUrls: Array.isArray(item.imageUrls) ? item.imageUrls.slice() : [],
          speakWord: item.speakWord || item.targetWord || '',
          targetWord: item.targetWord || ''
        }
      };
    });
    return queue;
  },
  harvestStudyMistakesIntoQueue(roadmapState, studyDataOverride) {
    if (!roadmapState || typeof roadmapState !== 'object') return {};
    const storage = this._getStorage();
    const studyData = this._getStudyData(studyDataOverride);
    const queue = { ...(roadmapState.reviewQueue || {}) };
    const nowIso = new Date().toISOString();
    const gTopics = Array.isArray(studyData.grammarTopics) ? studyData.grammarTopics : [];
    const vPart5List = Array.isArray(studyData.officialVocabPart5) ? studyData.officialVocabPart5 : [];
    if (storage && typeof storage.getStudyProgress === 'function') {
      const sp = storage.getStudyProgress();
      const dict = Array.isArray(studyData.etsDictionary) ? studyData.etsDictionary : [];
      const dictById = {};
      dict.forEach(e => { dictById[e.id] = e; });
      const candidateWordIds = new Set([
        ...Object.keys(sp.vocabStatus || {}).filter(id => sp.vocabStatus[id] === 'learning'),
        ...Object.keys(sp.vocabStarred || {}).filter(id => sp.vocabStarred[id])
      ]);
      candidateWordIds.forEach(wId => {
        const qKey = `rv_word_${wId}`;
        if (queue[qKey]) {
          if (sp.vocabStatus && sp.vocabStatus[wId] === 'learning' && (queue[qKey].box || 1) >= 3) {
            queue[qKey] = {
              ...queue[qKey],
              box: 1,
              nextReviewAt: nowIso
            };
          }
          return;
        }
        const entry = dictById[wId];
        if (!entry) return;
        const sameBand = dict.filter(d => d.band === entry.band && d.id !== entry.id);
        const distractors = [];
        for (let i = 0; i < sameBand.length && distractors.length < 3; i += 7) {
          if (sameBand[i] && sameBand[i].m && sameBand[i].m !== entry.m) {
            distractors.push(sameBand[i].m);
          }
        }
        while (distractors.length < 3) {
          distractors.push(['phê duyệt ngân sách', 'lịch trình bảo trì', 'báo cáo doanh thu'][distractors.length]);
        }
        const optsArr = [entry.m, ...distractors.slice(0, 3)];
        const letters = ['A', 'B', 'C', 'D'];
        const shift = entry.w.length % 4;
        const rotated = optsArr.map((_, idx) => optsArr[(idx + shift) % 4]);
        const ansIdx = rotated.indexOf(entry.m);
        const optMap = { A: rotated[0], B: rotated[1], C: rotated[2], D: rotated[3] };
        queue[qKey] = {
          id: qKey,
          kind: 'vocab',
          wordId: entry.id,
          band: entry.band || '450',
          box: 1,
          wrongCount: 1,
          nextReviewAt: nowIso,
          payload: {
            prompt: `Nghĩa chuẩn TOEIC của từ "${entry.w}" (${entry.pos || 'vocab'}) là gì?`,
            options: optMap,
            correctAnswer: letters[ansIdx >= 0 ? ansIdx : 0],
            explanation: `${entry.w} ${entry.ipa || ''}: ${entry.m}${entry.ex ? ' — VD: ' + entry.ex : ''}`,
            imageUrls: [],
            speakWord: entry.w
          }
        };
      });
      gTopics.forEach(topic => {
        const bestRec = sp.grammarQuizBest && sp.grammarQuizBest[topic.id];
        if (!bestRec || !bestRec.answers) return;
        (topic.practiceQuestions || []).forEach(q => {
          const picked = bestRec.answers[q.id];
          if (picked && picked !== q.correctAnswer) {
            const qKey = `rv_gram_${q.id}`;
            if (!queue[qKey]) {
              queue[qKey] = {
                id: qKey,
                kind: 'grammar',
                band: topic.band || '450',
                box: 1,
                wrongCount: 1,
                nextReviewAt: nowIso,
                payload: {
                  prompt: q.questionText,
                  options: q.options,
                  correctAnswer: q.correctAnswer,
                  explanation: q.explanation || q.questionTranslation || '',
                  imageUrls: []
                }
              };
            }
          }
        });
      });
    }
    if (storage && typeof storage.getExamHistory === 'function') {
      const historyList = storage.getExamHistory() || [];
      if (historyList.length > 0 && (vPart5List.length > 0 || gTopics.length > 0)) {
        const part5Lookup = {};
        vPart5List.forEach(q => {
          if (q && q.bookShort && q.testId && q.questionNumber) {
            part5Lookup[`${q.bookShort}_${q.testId}_${q.questionNumber}`] = { ...q, kind: 'vocab', band: q.band || '550' };
          }
        });
        gTopics.forEach(t => {
          (t.practiceQuestions || []).forEach(q => {
            if (q && q.bookShort && q.testId && q.questionNumber) {
              part5Lookup[`${q.bookShort}_${q.testId}_${q.questionNumber}`] = { ...q, kind: 'grammar', band: t.band || '550' };
            }
          });
        });
        const getBookShort = (rec) => {
          const raw = String(rec.bookName || rec.testTitle || '');
          if (raw.includes('2026')) return '26';
          if (raw.includes('2024')) return '24';
          if (raw.includes('2023')) return '23';
          return '22';
        };
        historyList.slice(0, 8).forEach(rec => {
          if (!rec || !Array.isArray(rec.detailedQuestions)) return;
          const bShort = getBookShort(rec);
          const tId = Number(rec.testId) || 1;
          rec.detailedQuestions.forEach(dq => {
            const qNum = Number(dq && (dq.questionNumber || dq.questionNum));
            if (!dq || qNum < 101 || qNum > 130) return;
            const userPick = dq.userChoice || dq.userSelected;
            if (!userPick || dq.isCorrect) return;
            const lookupKey = `${bShort}_${tId}_${qNum}`;
            const p5Item = part5Lookup[lookupKey];
            if (!p5Item) return;
            const qKey = `rv_examp5_${lookupKey}`;
            if (queue[qKey]) return;
            queue[qKey] = {
              id: qKey,
              kind: p5Item.kind || 'exam_q',
              band: String(p5Item.band || '550'),
              box: 1,
              wrongCount: 1,
              nextReviewAt: nowIso,
              payload: {
                prompt: p5Item.questionText,
                options: p5Item.options,
                correctAnswer: p5Item.correctAnswer,
                explanation: p5Item.explanation || p5Item.questionTranslation || '',
                audioUrl: '',
                imageUrls: [],
                speakWord: p5Item.targetWord || ''
              }
            };
          });
        });
      }
    }
    roadmapState.reviewQueue = queue;
    return queue;
  },
  getDueReviewItems(roadmapState, asOfDate = null) {
    const queue = (roadmapState && roadmapState.reviewQueue) ? roadmapState.reviewQueue : {};
    const nowTs = asOfDate ? new Date(asOfDate).getTime() : Date.now();
    return Object.values(queue)
      .filter(item => item && item.payload && item.payload.options)
      .filter(item => {
        if (!item.nextReviewAt) return true;
        const dueTs = new Date(item.nextReviewAt).getTime();
        return isNaN(dueTs) || dueTs <= nowTs;
      })
      .sort((a, b) => (a.box || 1) - (b.box || 1) || (b.wrongCount || 0) - (a.wrongCount || 0));
  },
  buildDailyReviewQuiz(roadmapState, targetBand = '450', count = 5, studyDataOverride = null) {
    this.harvestStudyMistakesIntoQueue(roadmapState, studyDataOverride);
    const due = this.getDueReviewItems(roadmapState);
    const quiz = [];
    due.slice(0, count).forEach(item => {
      quiz.push({
        reviewId: item.id,
        isFromQueue: true,
        box: item.box || 1,
        kind: item.kind || 'vocab',
        wordId: item.wordId || null,
        prompt: item.payload.prompt,
        options: item.payload.options,
        correctAnswer: item.payload.correctAnswer,
        explanation: item.payload.explanation || '',
        audioUrl: item.payload.audioUrl || '',
        imageUrls: Array.isArray(item.payload.imageUrls) ? item.payload.imageUrls.slice() : [],
        speakWord: item.payload.speakWord || ''
      });
    });
    if (quiz.length < count) {
      const studyData = this._getStudyData(studyDataOverride);
      const cleanBand = String(targetBand || '450').replace('+', '').trim();
      const vP5 = (studyData.officialVocabPart5 || []).filter(q => String(q.band) === cleanBand);
      const fallbackPool = vP5.length > 0 ? vP5 : (studyData.officialVocabPart5 || []);
      let idx = 0;
      while (quiz.length < count && idx < fallbackPool.length) {
        const q = fallbackPool[idx++];
        const rId = `rv_sup_${q.id}`;
        if (quiz.some(x => x.reviewId === rId)) continue;
        quiz.push({
          reviewId: rId,
          isFromQueue: false,
          box: 1,
          kind: 'vocab',
          prompt: q.questionText,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation || q.questionTranslation || '',
          audioUrl: '',
          imageUrls: [],
          speakWord: q.targetWord || ''
        });
      }
    }
    return quiz.slice(0, count).map((q, i) => ({ ...q, index: i + 1 }));
  },
  recordReviewQuizSubmission(roadmapState, nodeId, quizQuestions, userAnswers = {}, nowInput = null) {
    if (!roadmapState || !Array.isArray(quizQuestions)) return { correct: 0, total: 0 };
    const now = nowInput ? new Date(nowInput) : new Date();
    const queue = { ...(roadmapState.reviewQueue || {}) };
    const storage = this._getStorage();
    let correct = 0;
    quizQuestions.forEach(q => {
      const picked = String(userAnswers[q.reviewId] || '').trim().toUpperCase();
      const isRight = picked !== '' && picked === String(q.correctAnswer || '').trim().toUpperCase();
      if (isRight) correct++;
      const existing = queue[q.reviewId];
      if (isRight) {
        if (existing) {
          const nextBox = Math.min(this.EBBINGHAUS_DAYS.length, (existing.box || 1) + 1);
          const intervalDays = this.EBBINGHAUS_DAYS[nextBox - 1] || 7;
          const nextDate = new Date(now.getTime() + intervalDays * 24 * 3600 * 1000);
          queue[q.reviewId] = {
            ...existing,
            box: nextBox,
            lastReviewedAt: now.toISOString(),
            nextReviewAt: nextDate.toISOString()
          };
          if (nextBox >= 3 && existing.wordId && storage && typeof storage.setVocabWordStatus === 'function') {
            storage.setVocabWordStatus(existing.wordId, 'mastered');
          }
        }
      } else {
        const tomorrow = new Date(now.getTime() + 1 * 24 * 3600 * 1000);
        queue[q.reviewId] = {
          id: q.reviewId,
          kind: q.kind || 'vocab',
          wordId: q.wordId || (existing && existing.wordId) || null,
          band: (existing && existing.band) || '450',
          box: 1,
          wrongCount: ((existing && existing.wrongCount) || 0) + 1,
          lastReviewedAt: now.toISOString(),
          nextReviewAt: tomorrow.toISOString(),
          payload: {
            prompt: q.prompt,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation || '',
            audioUrl: q.audioUrl || '',
            imageUrls: Array.isArray(q.imageUrls)
              ? q.imageUrls.slice()
              : (existing && existing.payload && Array.isArray(existing.payload.imageUrls) ? existing.payload.imageUrls.slice() : []),
            speakWord: q.speakWord || ''
          }
        };
      }
    });
    roadmapState.reviewQueue = queue;
    if (nodeId && roadmapState.nodeProgress && roadmapState.nodeProgress[nodeId]) {
      const np = roadmapState.nodeProgress[nodeId];
      np.stepDone = { ...(np.stepDone || {}), review: true };
      np.reviewScore = { correct, total: quizQuestions.length };
    }
    this._touchStreak(roadmapState, now);
    this.syncRoadmapProgress(roadmapState);
    if (storage && typeof storage.saveRoadmapState === 'function') {
      storage.saveRoadmapState(roadmapState);
    }
    return { correct, total: quizQuestions.length };
  },
  _touchStreak(roadmapState, dateInput = null) {
    if (!roadmapState) return;
    const todayKey = this._toDateKey(dateInput);
    const st = roadmapState.streak || { count: 0, best: 0, lastActiveDate: null, activeDates: [] };
    if (st.lastActiveDate === todayKey) return;
    if (st.lastActiveDate) {
      const diff = this._daysBetween(st.lastActiveDate, todayKey);
      if (diff === 1) {
        st.count = (st.count || 0) + 1;
      } else if (diff > 1) {
        st.count = 1;
      }
    } else {
      st.count = 1;
    }
    st.best = Math.max(st.best || 0, st.count);
    st.lastActiveDate = todayKey;
    const dates = new Set(Array.isArray(st.activeDates) ? st.activeDates : []);
    dates.add(todayKey);
    st.activeDates = Array.from(dates).sort().slice(-60);
    roadmapState.streak = st;
  },
  syncRoadmapProgress(roadmapStateInput = null, studyDataOverride = null) {
    const storage = this._getStorage();
    const state = roadmapStateInput || (storage && typeof storage.getRoadmapState === 'function' ? storage.getRoadmapState() : null);
    if (!state || !state.initialized || !Array.isArray(state.zones)) return state;
    const studyData = this._getStudyData(studyDataOverride);
    const studyProg = (storage && typeof storage.getStudyProgress === 'function')
      ? storage.getStudyProgress()
      : { vocabStatus: {}, vocabQuizBest: {}, grammarCompleted: {}, grammarQuizBest: {} };
    const examHistory = (storage && typeof storage.getExamHistory === 'function')
      ? (storage.getExamHistory() || [])
      : [];
    const dictList = Array.isArray(studyData.etsDictionary) ? studyData.etsDictionary : [];
    const dictWordsByBand = {};
    ['450', '550', '650', '750', '850'].forEach(b => {
      dictWordsByBand[b] = dictList.filter(e => String(e.band) === b);
    });
    let anyChanged = false;
    const allNodesFlat = [];
    state.zones.forEach(z => {
      (z.nodes || []).forEach(n => allNodesFlat.push({ zone: z, node: n }));
    });
    const usedExamRecordKeys = new Set();
    allNodesFlat.forEach(({ node }) => {
      const np = state.nodeProgress[node.id];
      if (np && (np.status === 'completed' || (np.stepDone && np.stepDone.practice)) && np.matchedExamKey) {
        usedExamRecordKeys.add(np.matchedExamKey);
      }
    });
    const checkLearnStepDone = (step) => {
      if (!step) return { done: true, accuracy: 0.85 };
      if (step.kind === 'vocab_pack') {
        const quizRec = studyProg.vocabQuizBest && studyProg.vocabQuizBest[step.quizTopicId];
        if (quizRec && Number(quizRec.total) > 0) {
          return { done: true, accuracy: (Number(quizRec.correct) || 0) / Number(quizRec.total) };
        }
        const bandEntries = dictWordsByBand[String(step.band)] || [];
        const startIdx = ((Number(step.packNum) || 1) - 1) * this.PACK_SIZE;
        const packSlice = bandEntries.slice(startIdx, startIdx + this.PACK_SIZE);
        const markedCount = packSlice.filter(e => {
          const s = studyProg.vocabStatus && studyProg.vocabStatus[e.id];
          return s === 'mastered' || s === 'learning';
        }).length;
        const minReq = Math.min(step.minMarkedWords || 8, Math.max(1, packSlice.length));
        if (markedCount >= minReq) {
          const masteredCount = packSlice.filter(e => studyProg.vocabStatus && studyProg.vocabStatus[e.id] === 'mastered').length;
          return { done: true, accuracy: Math.min(1, 0.7 + (masteredCount / Math.max(1, packSlice.length)) * 0.3) };
        }
        return { done: false, progressText: `${markedCount}/${minReq} từ` };
      }
      if (step.kind === 'grammar_topic') {
        const rec = studyProg.grammarQuizBest && studyProg.grammarQuizBest[step.topicId];
        const answeredCount = rec && rec.answers ? Object.keys(rec.answers).length : 0;
        const minQ = step.minQuestions || 5;
        if ((!step.grammarPass || step.grammarPass <= 1) && studyProg.grammarCompleted && studyProg.grammarCompleted[step.topicId]) {
          const acc = (rec && Number(rec.total) > 0) ? (Number(rec.correct) / Number(rec.total)) : 0.85;
          return { done: true, accuracy: acc };
        }
        if (answeredCount >= minQ) {
          const acc = Number(rec && rec.total) > 0 ? (Number(rec.correct) / Number(rec.total)) : 0.75;
          return { done: true, accuracy: acc };
        }
        return { done: false, progressText: `${answeredCount}/${minQ} câu` };
      }
      return { done: false };
    };
    const checkPracticeStepDone = (step, unlockedAtIso, currentNodeNp = null) => {
      if (!step) return { done: true, accuracy: 0.85 };
      const unlockedTs = unlockedAtIso ? new Date(unlockedAtIso).getTime() : 0;
      const normalizeBook = (rec) => {
        if (rec.bookName) return rec.bookName;
        const t = String(rec.testTitle || '');
        if (t.includes('2026')) return 'EST 2026';
        if (t.includes('2024')) return 'EST 2024';
        if (t.includes('2023')) return 'EST 2023';
        return 'EST 2022';
      };
      const getRecKey = (rec) => {
        if (rec.id) return String(rec.id);
        return `${rec.completedAt || ''}_${rec.mode || ''}_${rec.testId || ''}_${rec.dayFilter || rec.partFilter || 'full'}`;
      };
      if (step.kind === 'exam_daily') {
        const match = examHistory.find(rec => {
          if (!rec || rec.mode !== 'daily') return false;
          const k = getRecKey(rec);
          if (usedExamRecordKeys.has(k) && (!currentNodeNp || currentNodeNp.matchedExamKey !== k)) return false;
          const exactTarget = normalizeBook(rec) === step.book &&
            Number(rec.testId) === Number(step.testId) &&
            Number(rec.dayFilter) === Number(step.dayFilter);
          const takenAfterUnlock = unlockedTs > 0 && rec.completedAt && new Date(rec.completedAt).getTime() >= unlockedTs;
          return exactTarget || takenAfterUnlock;
        });
        if (match) {
          const k = getRecKey(match);
          usedExamRecordKeys.add(k);
          if (currentNodeNp) currentNodeNp.matchedExamKey = k;
          const acc = Number(match.totalQuestions) > 0 ? (Number(match.totalCorrect) / Number(match.totalQuestions)) : 0.75;
          return { done: true, accuracy: acc, matchedKey: k };
        }
        return { done: false };
      }
      if (step.kind === 'exam_part') {
        const match = examHistory.find(rec => {
          if (!rec || rec.mode !== 'part') return false;
          const k = getRecKey(rec);
          if (usedExamRecordKeys.has(k) && (!currentNodeNp || currentNodeNp.matchedExamKey !== k)) return false;
          const samePart = String(rec.partFilter || '').toLowerCase() === String(step.partFilter || '').toLowerCase();
          if (!samePart) return false;
          const exactTarget = normalizeBook(rec) === step.book && Number(rec.testId) === Number(step.testId);
          const takenAfterUnlock = unlockedTs > 0 && rec.completedAt && new Date(rec.completedAt).getTime() >= unlockedTs;
          return exactTarget || takenAfterUnlock;
        });
        if (match) {
          const k = getRecKey(match);
          usedExamRecordKeys.add(k);
          if (currentNodeNp) currentNodeNp.matchedExamKey = k;
          const acc = Number(match.totalQuestions) > 0 ? (Number(match.totalCorrect) / Number(match.totalQuestions)) : 0.75;
          return { done: true, accuracy: acc, matchedKey: k };
        }
        return { done: false };
      }
      if (step.kind === 'boss_exam') {
        const minPass = Number(step.minPassScore) || 430;
        const match = examHistory.find(rec => {
          if (!rec || rec.mode === 'part' || rec.mode === 'daily') return false;
          const k = getRecKey(rec);
          if (usedExamRecordKeys.has(k) && (!currentNodeNp || currentNodeNp.matchedExamKey !== k)) return false;
          const score = Number(rec.totalScore) || 0;
          if (score < minPass) return false;
          const exactTarget = normalizeBook(rec) === step.book && Number(rec.testId) === Number(step.testId);
          const takenAfterUnlock = unlockedTs > 0 && rec.completedAt && new Date(rec.completedAt).getTime() >= unlockedTs;
          return exactTarget || takenAfterUnlock;
        });
        if (match) {
          const k = getRecKey(match);
          usedExamRecordKeys.add(k);
          if (currentNodeNp) currentNodeNp.matchedExamKey = k;
          return { done: true, accuracy: 0.9, fullScore: Number(match.totalScore) || minPass, matchedKey: k };
        }
        return { done: false };
      }
      return { done: false };
    };
    for (let idx = 0; idx < allNodesFlat.length; idx++) {
      const { zone, node } = allNodesFlat[idx];
      const np = state.nodeProgress[node.id] || {
        status: 'locked',
        stars: 0,
        stepDone: { review: false, learn: false, practice: false }
      };
      state.nodeProgress[node.id] = np;
      if (np.status === 'completed' || node.type === 'placement_cleared') {
        if (idx + 1 < allNodesFlat.length) {
          const nextNode = allNodesFlat[idx + 1].node;
          const nextNp = state.nodeProgress[nextNode.id];
          if (nextNp && nextNp.status === 'locked') {
            nextNp.status = 'active';
            nextNp.unlockedAt = new Date().toISOString();
            anyChanged = true;
          }
        }
        continue;
      }
      if (np.status !== 'active') continue;
      let accSum = 0;
      let accCount = 0;
      if (node.type === 'boss') {
        const bossStep = (node.steps || [])[0];
        if (!np.stepDone.practice) {
          const res = checkPracticeStepDone(bossStep, np.unlockedAt, np);
          if (res.done) {
            np.stepDone.practice = true;
            np.bossClearedBy = 'full_exam';
            if (res.fullScore && state.profile) {
              state.profile.currentScore = Math.max(Number(state.profile.currentScore) || 0, res.fullScore);
            }
            anyChanged = true;
          }
        }
        if (np.stepDone.practice) {
          np.status = 'completed';
          np.stars = np.stars || 3;
          np.completedAt = np.completedAt || new Date().toISOString();
          this._touchStreak(state);
          anyChanged = true;
          if (idx + 1 < allNodesFlat.length) {
            const nextNp = state.nodeProgress[allNodesFlat[idx + 1].node.id];
            if (nextNp && nextNp.status === 'locked') {
              nextNp.status = 'active';
              nextNp.unlockedAt = new Date().toISOString();
            }
          }
        }
      } else {
        const learnStep = (node.steps || []).find(s => s.stepKey === 'learn');
        const practiceStep = (node.steps || []).find(s => s.stepKey === 'practice');
        const learnCheck = checkLearnStepDone(learnStep);
        if (learnCheck.done && !np.stepDone.learn) {
          np.stepDone.learn = true;
          this._touchStreak(state);
          anyChanged = true;
        }
        np.learnProgressText = learnCheck.progressText || '';
        if (learnCheck.done) {
          accSum += (learnCheck.accuracy || 0.8);
          accCount++;
        }
        const pracCheck = checkPracticeStepDone(practiceStep, np.unlockedAt, np);
        if (pracCheck.done && !np.stepDone.practice) {
          np.stepDone.practice = true;
          this._touchStreak(state);
          anyChanged = true;
        }
        if (pracCheck.done) {
          accSum += (pracCheck.accuracy || 0.8);
          accCount++;
        }
        if (np.stepDone.review && np.reviewScore && np.reviewScore.total > 0) {
          accSum += (np.reviewScore.correct / np.reviewScore.total);
          accCount++;
        }
        if (np.stepDone.review && np.stepDone.learn && np.stepDone.practice) {
          const avgAcc = accCount > 0 ? (accSum / accCount) : 0.8;
          np.status = 'completed';
          np.stars = avgAcc >= 0.82 ? 3 : (avgAcc >= 0.62 ? 2 : 1);
          np.completedAt = np.completedAt || new Date().toISOString();
          this._touchStreak(state);
          anyChanged = true;
          if (idx + 1 < allNodesFlat.length) {
            const nextNp = state.nodeProgress[allNodesFlat[idx + 1].node.id];
            if (nextNp && nextNp.status === 'locked') {
              nextNp.status = 'active';
              nextNp.unlockedAt = new Date().toISOString();
            }
          }
        }
      }
    }
    let completedRealNodes = 0;
    let totalRealNodes = 0;
    state.zones.forEach(z => {
      if (z.zoneStatus === 'cleared_by_placement') return;
      const realNodes = (z.nodes || []).filter(n => n.type !== 'placement_cleared');
      totalRealNodes += realNodes.length;
      const doneInZone = realNodes.filter(n => state.nodeProgress[n.id] && state.nodeProgress[n.id].status === 'completed').length;
      completedRealNodes += doneInZone;
      const hasActive = realNodes.some(n => state.nodeProgress[n.id] && state.nodeProgress[n.id].status === 'active');
      if (realNodes.length > 0 && doneInZone === realNodes.length) {
        z.zoneStatus = 'completed';
      } else if (hasActive || doneInZone > 0) {
        z.zoneStatus = 'active';
      } else {
        z.zoneStatus = 'locked';
      }
    });
    if (state.profile && totalRealNodes > 0) {
      const startS = Number(state.profile.startScore) || 350;
      const targetS = Number(state.profile.targetScore) || 650;
      const interpolated = Math.round((startS + ((targetS - startS) * (completedRealNodes / totalRealNodes))) / 5) * 5;
      let highestClearedZoneScore = 0;
      state.zones.forEach(z => {
        if (z.zoneStatus === 'completed') {
          highestClearedZoneScore = Math.max(highestClearedZoneScore, Number(z.targetScore) || 0);
        }
      });
      const recentFullScores = examHistory
        .filter(r => r && r.mode !== 'part' && r.mode !== 'daily' && Number(r.totalScore) > 0)
        .slice(0, 3)
        .map(r => Number(r.totalScore));
      const bestRecentFull = recentFullScores.length > 0 ? Math.max(...recentFullScores) : 0;
      const nextCurrent = Math.max(startS, interpolated, highestClearedZoneScore, bestRecentFull);
      if (nextCurrent !== state.profile.currentScore) {
        state.profile.currentScore = nextCurrent;
        anyChanged = true;
      }
      if (examHistory.length > 0) {
        const partAccuracyAccum = {};
        examHistory.slice(0, 5).forEach(rec => {
          if (!rec) return;
          if (rec.partBreakdown && typeof rec.partBreakdown === 'object') {
            Object.keys(rec.partBreakdown).forEach(pk => {
              const pb = rec.partBreakdown[pk];
              if (!pb || !pb.total) return;
              if (!partAccuracyAccum[pk]) partAccuracyAccum[pk] = { correct: 0, total: 0 };
              partAccuracyAccum[pk].correct += (Number(pb.correct) || 0);
              partAccuracyAccum[pk].total += (Number(pb.total) || 0);
            });
          }
        });
        const dynamicWeak = Object.keys(partAccuracyAccum)
          .filter(pk => {
            const acc = partAccuracyAccum[pk].total > 0
              ? (partAccuracyAccum[pk].correct / partAccuracyAccum[pk].total)
              : 1;
            return acc < 0.65;
          })
          .sort((a, b) => (partAccuracyAccum[a].correct / partAccuracyAccum[a].total) - (partAccuracyAccum[b].correct / partAccuracyAccum[b].total));
        if (dynamicWeak.length > 0) {
          const mergedWeak = Array.from(new Set([...dynamicWeak, ...(state.profile.weakParts || [])])).slice(0, 4);
          if (JSON.stringify(mergedWeak) !== JSON.stringify(state.profile.weakParts)) {
            state.profile.weakParts = mergedWeak;
            anyChanged = true;
          }
        }
      }
    }
    if (anyChanged && storage && typeof storage.saveRoadmapState === 'function') {
      storage.saveRoadmapState(state);
    }
    return state;
  },
  completeZoneOrBossChallenge(roadmapState, mode, zoneBand, correct, total) {
    if (!roadmapState || !Array.isArray(roadmapState.zones)) return { passed: false };
    const ratio = total > 0 ? (correct / total) : 0;
    const minRatio = mode === 'skip_zone' ? 0.75 : 0.72;
    const passed = ratio >= minRatio;
    if (!passed) {
      return { passed: false, ratio, minRatio };
    }
    const cleanBand = String(zoneBand || '').replace('+', '').trim();
    const targetZone = roadmapState.zones.find(z => String(z.band) === cleanBand);
    if (!targetZone) return { passed: false };
    const nowIso = new Date().toISOString();
    const stars = ratio >= 0.9 ? 3 : 2;
    if (mode === 'skip_zone') {
      roadmapState.zones
        .filter(z => z.order <= targetZone.order && z.zoneStatus !== 'cleared_by_placement')
        .forEach(zToComplete => {
          (zToComplete.nodes || []).forEach(n => {
            const np = roadmapState.nodeProgress[n.id] || {};
            if (np.status !== 'completed') {
              roadmapState.nodeProgress[n.id] = {
                ...np,
                status: 'completed',
                stars,
                completedAt: nowIso,
                skippedByChallenge: true,
                stepDone: { review: true, learn: true, practice: true }
              };
            }
          });
        });
    } else if (mode === 'boss_quick') {
      const bossNode = (targetZone.nodes || []).find(n => n.type === 'boss');
      if (bossNode) {
        const np = roadmapState.nodeProgress[bossNode.id] || {};
        roadmapState.nodeProgress[bossNode.id] = {
          ...np,
          status: 'completed',
          stars,
          completedAt: nowIso,
          bossClearedBy: 'quick_challenge',
          stepDone: { review: true, learn: true, practice: true }
        };
      }
    }
    this._touchStreak(roadmapState);
    this.syncRoadmapProgress(roadmapState);
    const storage = this._getStorage();
    if (storage && typeof storage.saveRoadmapState === 'function') {
      storage.saveRoadmapState(roadmapState);
    }
    return { passed: true, ratio, stars };
  },
  getDashboardMetrics(roadmapState, nowInput = null) {
    if (!roadmapState || !roadmapState.initialized || !roadmapState.profile) {
      return { initialized: false };
    }
    const now = nowInput ? new Date(nowInput) : new Date();
    const prof = roadmapState.profile;
    let totalNodes = 0;
    let completedNodes = 0;
    let totalStars = 0;
    let maxStars = 0;
    let activeNode = null;
    let activeZone = null;
    (roadmapState.zones || []).forEach(z => {
      if (z.zoneStatus === 'cleared_by_placement') return;
      (z.nodes || []).forEach(n => {
        if (n.type === 'placement_cleared') return;
        totalNodes++;
        maxStars += 3;
        const np = roadmapState.nodeProgress && roadmapState.nodeProgress[n.id];
        if (np && np.status === 'completed') {
          completedNodes++;
          totalStars += (Number(np.stars) || 0);
        } else if (!activeNode && np && np.status === 'active') {
          activeNode = n;
          activeZone = z;
        }
      });
    });
    const isAllFinished = totalNodes > 0 && completedNodes === totalNodes;
    const progressPercent = totalNodes > 0 ? Math.round((completedNodes / totalNodes) * 100) : 0;
    const remainingNodes = Math.max(0, totalNodes - completedNodes);
    const elapsedDays = Math.max(0, this._daysBetween(prof.startedAt, now));
    const paceDelta = completedNodes - elapsedDays;
    let paceState = 'ontrack';
    let paceLabel = '✅ Đúng tiến độ';
    if (isAllFinished) {
      paceState = 'finished';
      paceLabel = '🏆 Đã chạm Vạch Đích!';
    } else if (paceDelta >= 1) {
      paceState = 'ahead';
      paceLabel = `🚀 Vượt lịch +${paceDelta} ngày`;
    } else if (paceDelta <= -2) {
      paceState = 'behind';
      paceLabel = `⚠️ Trễ ${Math.abs(paceDelta)} ngày • Đã tự cân bằng ETA`;
    }
    const todayKey = this._toDateKey(now);
    const didCompleteToday = Object.values(roadmapState.nodeProgress || {}).some(
      np => np && np.completedAt && this._toDateKey(np.completedAt) === todayKey
    );
    const daysLeftForEta = Math.max(0, remainingNodes - (didCompleteToday ? 0 : 1));
    const etaDate = new Date(now.getTime() + daysLeftForEta * 24 * 3600 * 1000);
    const dueReviews = this.getDueReviewItems(roadmapState, now);
    const rawStreak = roadmapState.streak || {};
    const daysSinceLastActive = rawStreak.lastActiveDate
      ? this._daysBetween(rawStreak.lastActiveDate, now)
      : 999;
    const effectiveStreakCount = daysSinceLastActive > 1 ? 0 : (Number(rawStreak.count) || 0);
    return {
      initialized: true,
      isAllFinished,
      startScore: Number(prof.startScore) || 350,
      currentScore: Number(prof.currentScore) || Number(prof.startScore) || 350,
      targetBand: prof.targetBand || '650',
      targetScore: Number(prof.targetScore) || 650,
      dailyMinutes: Number(prof.dailyMinutes) || 45,
      totalNodes,
      completedNodes,
      remainingNodes,
      progressPercent,
      totalStars,
      maxStars,
      streakCount: effectiveStreakCount,
      bestStreak: Number(rawStreak.best) || 0,
      paceState,
      paceDelta,
      paceLabel,
      etaDateFormatted: isAllFinished ? 'Hoàn thành 🎉' : this._formatDisplayDate(etaDate),
      dueReviewCount: dueReviews.length,
      activeNode,
      activeZone
    };
  }
};
if (typeof window !== 'undefined') {
  window.RoadmapEngine = RoadmapEngine;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RoadmapEngine;
}