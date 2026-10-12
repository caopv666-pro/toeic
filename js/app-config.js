// ==========================================================================
// TOEIC MASTER — app-config.js
// API Endpoints, Score Conversion Scale, and Exam Constants
// ==========================================================================

const AppConfig = {
  // Self-hosted static database and media assets in toeic-web
  // Empty API_BASE_URL loads all data and assets locally from current origin (no port 3000 needed)
  API_BASE_URL: '',
  BOOK_NAME: 'EST 2022',
  
  // Endpoint to fetch compiled test database directly from local web data folder or remote CDN
  getDatabaseUrl() {
    return this.resolveAssetUrl(`data/database_compiled.json?v=${Date.now()}`);
  },
  
  // Resolve asset URLs (images, audio) locally or via configured base URL
  resolveAssetUrl(path) {
    if (!path || typeof path !== 'string') return '';
    const trimmed = path.trim();
    if (!trimmed) return '';

    // Pass through absolute URLs and special URI protocols
    if (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('data:') ||
      trimmed.startsWith('blob:')
    ) {
      return trimmed;
    }

    // Normalize backslashes (Windows paths) and remove leading slashes
    const cleanPath = trimmed.replace(/\\/g, '/').replace(/^\/+/, '');

    // Prepend API_BASE_URL if configured, stripping any trailing slash
    const baseUrl = (typeof this.API_BASE_URL === 'string' ? this.API_BASE_URL : '').trim().replace(/\/+$/, '');
    if (baseUrl) {
      return `${baseUrl}/${cleanPath}`;
    }
    return cleanPath;
  },

  // Full 45-minute continuous Listening audio for exam mode (Tests 1 to 10)
  getFullLcAudioUrl(testId) {
    let id = 1;
    if (typeof testId === 'number' && !isNaN(testId)) {
      id = Math.floor(testId);
    } else if (typeof testId === 'string') {
      const match = testId.match(/[+-]?\d+/);
      if (match) {
        id = parseInt(match[0], 10);
      }
    }

    // Clamp / fallback within ETS 2022 valid test bounds (1 to 10)
    if (isNaN(id) || id < 1 || id > 10) {
      id = 1;
    }

    let filename = `TEST_${id}.mp3`;
    if (id === 9) filename = 'Test09.mp3';
    if (id === 10) filename = 'Test10.mp3';

    const book = this.BOOK_NAME || 'EST 2022';
    return this.resolveAssetUrl(`uploads/${encodeURIComponent(book)}/LC/audio/${filename}`);
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
    const rawNum = Number(correctCount);
    if (isNaN(rawNum) || rawNum <= 0) return 5;
    const count = Math.min(100, Math.floor(rawNum));
    if (count >= 96) return 495;
    if (count >= 90) return 460 + (count - 90) * 5;
    if (count >= 80) return 410 + (count - 80) * 5;
    if (count >= 70) return 355 + (count - 70) * 5;
    if (count >= 60) return 305 + (count - 60) * 5;
    if (count >= 50) return 250 + (count - 50) * 5;
    if (count >= 40) return 195 + (count - 40) * 5;
    if (count >= 30) return 140 + (count - 30) * 5;
    if (count >= 20) return 90 + (count - 20) * 5;
    return Math.max(5, Math.round((count * 4.5) / 5) * 5);
  },

  calculateReadingScore(correctCount) {
    const rawNum = Number(correctCount);
    if (isNaN(rawNum) || rawNum <= 0) return 5;
    const count = Math.min(100, Math.floor(rawNum));
    if (count >= 97) return 495;
    if (count >= 90) return 455 + (count - 90) * 5;
    if (count >= 80) return 400 + (count - 80) * 5;
    if (count >= 70) return 345 + (count - 70) * 5;
    if (count >= 60) return 290 + (count - 60) * 5;
    if (count >= 50) return 235 + (count - 50) * 5;
    if (count >= 40) return 180 + (count - 40) * 5;
    if (count >= 30) return 125 + (count - 30) * 5;
    if (count >= 20) return 75 + (count - 20) * 5;
    return Math.max(5, Math.round((count * 3.5) / 5) * 5);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AppConfig;
}
