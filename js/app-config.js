// ==========================================================================
// TOEIC MASTER — app-config.js
// API Endpoints, Score Conversion Scale, and Exam Constants
// ==========================================================================

const AppConfig = {
  // Self-hosted static database and media assets in toeic-web
  // Empty API_BASE_URL loads all data and assets locally from current origin (no port 3000 needed)
  API_BASE_URL: '',
  BOOK_NAME: 'EST 2022',
  
  // Endpoint to fetch compiled test database directly from local web data folder
  getDatabaseUrl() {
    return `data/database_compiled.json?v=${Date.now()}`;
  },
  
  // Resolve asset URLs (images, audio) locally
  resolveAssetUrl(path) {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    if (this.API_BASE_URL) {
      return `${this.API_BASE_URL}/${cleanPath}`;
    }
    return cleanPath;
  },

  // Full 45-minute continuous Listening audio for exam mode
  getFullLcAudioUrl(testId) {
    const id = parseInt(testId) || 1;
    let filename = `TEST_${id}.mp3`;
    if (id === 9) filename = 'Test09.mp3';
    if (id === 10) filename = 'Test10.mp3';
    return this.resolveAssetUrl(`uploads/${encodeURIComponent(this.BOOK_NAME)}/LC/audio/${filename}`);
  },

  // Part Boundaries (200 Questions Total)
  PARTS: {
    part1: { name: 'Part 1: Photographs', start: 1, end: 6, count: 6, section: 'listening' },
    part2: { name: 'Part 2: Question-Response', start: 7, end: 31, count: 25, section: 'listening' },
    part3: { name: 'Part 3: Conversations', start: 32, end: 70, count: 39, section: 'listening' },
    part4: { name: 'Part 4: Short Talks', start: 71, end: 100, count: 30, section: 'listening' },
    part5: { name: 'Part 5: Incomplete Sentences', start: 101, end: 130, count: 30, section: 'reading' },
    part6: { name: 'Part 6: Text Completion', start: 131, end: 146, count: 16, section: 'reading' },
    part7: { name: 'Part 7: Reading Comprehension', start: 147, end: 200, count: 54, section: 'reading' }
  },

  // Helper to determine which part a question belongs to
  getPartByQuestionNum(qNum) {
    for (const [key, part] of Object.entries(this.PARTS)) {
      if (qNum >= part.start && qNum <= part.end) {
        return { key, ...part };
      }
    }
    return null;
  },

  // ETS TOEIC Score Conversion Table (Correct answers count -> Scaled Score 5-495)
  // Standard approximation used by ETS actual test scoring
  calculateListeningScore(correctCount) {
    if (correctCount <= 0) return 5;
    if (correctCount >= 96) return 495;
    if (correctCount >= 90) return 460 + (correctCount - 90) * 5;
    if (correctCount >= 80) return 410 + (correctCount - 80) * 5;
    if (correctCount >= 70) return 355 + (correctCount - 70) * 5;
    if (correctCount >= 60) return 305 + (correctCount - 60) * 5;
    if (correctCount >= 50) return 250 + (correctCount - 50) * 5;
    if (correctCount >= 40) return 195 + (correctCount - 40) * 5;
    if (correctCount >= 30) return 140 + (correctCount - 30) * 5;
    if (correctCount >= 20) return 90 + (correctCount - 20) * 5;
    return Math.max(5, correctCount * 4.5);
  },

  calculateReadingScore(correctCount) {
    if (correctCount <= 0) return 5;
    if (correctCount >= 97) return 495;
    if (correctCount >= 90) return 455 + (correctCount - 90) * 5;
    if (correctCount >= 80) return 400 + (correctCount - 80) * 5;
    if (correctCount >= 70) return 345 + (correctCount - 70) * 5;
    if (correctCount >= 60) return 290 + (correctCount - 60) * 5;
    if (correctCount >= 50) return 235 + (correctCount - 50) * 5;
    if (correctCount >= 40) return 180 + (correctCount - 40) * 5;
    if (correctCount >= 30) return 125 + (correctCount - 30) * 5;
    if (correctCount >= 20) return 75 + (correctCount - 20) * 5;
    return Math.max(5, correctCount * 3.5);
  }
};
