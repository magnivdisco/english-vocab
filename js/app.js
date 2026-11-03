const PROGRESS_KEY = 'englishTeacher.progress.v1';
const CUSTOM_KEY = 'englishTeacher.customLists.v1';
const MASTERY_THRESHOLD = 2;

const CARD = 'rounded-3xl bg-white p-5 shadow-lg ring-1 ring-slate-200';
const BTN_BASE = 'w-full rounded-2xl px-4 py-3 font-bold shadow-md transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40';
const BTN_PRIMARY = `${BTN_BASE} bg-indigo-600 text-white hover:bg-indigo-700`;
const BTN_ACCENT = `${BTN_BASE} bg-amber-400 text-slate-900 hover:bg-amber-500`;
const BTN_GHOST = 'rounded-xl px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100';
const SPEAKER_ICON = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>';

const app = document.getElementById('app');
const unitTitle = document.getElementById('unit-title');

const state = {
  lists: [],
  customLists: [],
  hideKnown: false,
  enter: null,
  view: 'home',
  listId: null,
  index: 0,
  quiz: [],
  options: [],
  answered: false,
  wrongPicks: [],
  score: 0,
  match: null,
};

let progress = loadProgress();

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveProgress() {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

function loadCustomLists() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_KEY)) || [];
  } catch {
    return [];
  }
}

function saveCustomLists() {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(state.customLists));
}

function getRecord(word) {
  return progress[word] || { correct: 0, wrong: 0 };
}

function isMastered(word) {
  return getRecord(word).correct >= MASTERY_THRESHOLD;
}

function allLists() {
  return [...state.customLists, ...state.lists];
}

function currentList() {
  return allLists().find((list) => list.id === state.listId);
}

function allWords() {
  return allLists().flatMap((list) => list.words);
}

function isKnown(word) {
  return Boolean(getRecord(word).known);
}

function visibleWords(list) {
  return state.hideKnown ? list.words.filter((w) => !isKnown(w.word)) : list.words;
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlight(sentence, word) {
  const pattern = new RegExp(`\\b(${escapeRegExp(word)})\\b`, 'gi');
  return esc(sentence).replace(pattern, '<mark class="rounded bg-amber-200 px-1">$1</mark>');
}

const HEBREW_CHARS = /[\u0590-\u05FF]/;
const HEADER_WORDS = /^(english|word|hebrew|translation|אנגלית|עברית|מילה|תרגום)$/i;

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  rows.push(row);
  return rows.filter((cells) => cells.some(Boolean));
}

function orderPair(a, b) {
  return HEBREW_CHARS.test(a) && !HEBREW_CHARS.test(b) ? [b, a] : [a, b];
}

function buildWordsFromCsv(text) {
  const seen = new Set();
  const words = [];
  for (const cells of parseCsvRows(text)) {
    const [first = '', second = ''] = cells;
    if (HEADER_WORDS.test(first) || HEADER_WORDS.test(second)) continue;
    const [english, hebrew] = orderPair(first, second);
    if (!english || !hebrew || HEBREW_CHARS.test(english) || seen.has(english.toLowerCase())) continue;
    seen.add(english.toLowerCase());
    const examples = [];
    const examplesHe = [];
    for (let i = 2; i + 1 < cells.length; i += 2) {
      const [sentence, sentenceHe] = orderPair(cells[i], cells[i + 1]);
      if (sentence && sentenceHe) {
        examples.push(sentence);
        examplesHe.push(sentenceHe);
      }
    }
    words.push({ word: english, hebrew, partOfSpeech: '', phonetic: '', examples, examplesHe });
  }
  return words;
}

let voices = [];
let hebrewWarned = false;

const HEBREW_VOICE_HELP = 'לא נמצא קול בעברית במחשב, ולכן אי אפשר להשמיע עברית.\nלהתקנה: הגדרות > שעה ושפה > שפה ואזור > הוספת שפה > עברית, ובחרו באפשרות דיבור (Text-to-speech).\nאחרי ההתקנה רעננו את הדף.';

const FEMALE_VOICE = /female|aria|ava|jenny|zira|samantha|libby|sonia|emma|michelle|natasha|hila|sara/i;
const MALE_VOICE = /david|mark|guy|ryan|george|asaf|tomer/i;
const NATURAL_VOICE = /natural|online/i;

function refreshVoices() {
  voices = speechSynthesis.getVoices();
}

function scoreVoice(voice, lang) {
  const voiceLang = voice.lang.replace('_', '-').toLowerCase();
  if (!voiceLang.startsWith(lang.slice(0, 2).toLowerCase())) return -Infinity;
  let score = voiceLang === lang.toLowerCase() ? 4 : 0;
  if (NATURAL_VOICE.test(voice.name)) score += 3;
  if (FEMALE_VOICE.test(voice.name)) score += 2;
  if (MALE_VOICE.test(voice.name)) score -= 3;
  return score;
}

function pickVoice(lang) {
  let best = null;
  let bestScore = -Infinity;
  for (const voice of voices) {
    const score = scoreVoice(voice, lang);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}

function speak(text, lang = 'en-US') {
  if (!('speechSynthesis' in window)) {
    alert('הדפדפן לא תומך בהשמעה קולית');
    return;
  }
  if (!voices.length) refreshVoices();
  const isHebrew = lang.startsWith('he');
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.voice = pickVoice(lang);
  if (isHebrew && !utterance.voice && !hebrewWarned) {
    hebrewWarned = true;
    alert(HEBREW_VOICE_HELP);
  }
  utterance.rate = isHebrew ? 0.9 : 0.95;
  utterance.pitch = isHebrew ? 1.1 : 1.2;
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}

if ('speechSynthesis' in window) {
  refreshVoices();
  speechSynthesis.addEventListener('voiceschanged', refreshVoices);
}

const CHEER_COLORS = ['#f59e0b', '#ec4899', '#22c55e', '#6366f1'];
let audioCtx = null;

function playCheer() {
  if (!('AudioContext' in window)) return;
  audioCtx ??= new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const now = audioCtx.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
    const t = now + i * 0.1;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.32);
  });
}

function celebrate(anchor) {
  if (!anchor) return;
  playCheer();
  anchor.animate([
    { transform: 'scale(1)' },
    { transform: 'scale(1.12)' },
    { transform: 'scale(0.97)' },
    { transform: 'scale(1)' },
  ], { duration: 500, easing: 'ease-out' });

  const rect = anchor.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  for (let i = 0; i < 14; i++) {
    const angle = (Math.PI * 2 * i) / 14;
    const distance = 70 + Math.random() * 50;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    const star = document.createElement('span');
    star.textContent = ['★', '✦', '✶'][i % 3];
    star.style.cssText = `position:fixed;left:${x}px;top:${y}px;color:${CHEER_COLORS[i % 4]};font-size:1.5rem;pointer-events:none;z-index:50;`;
    document.body.append(star);
    star.animate([
      { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.3)`, opacity: 0 },
    ], { duration: 900, easing: 'cubic-bezier(.2,.7,.3,1)' }).finished.then(() => star.remove());
  }
}

function speakButton(text, label, lang = 'en-US', small = false) {
  const size = small ? 'h-9 w-9' : 'h-12 w-12';
  const color = lang.startsWith('he') ? 'bg-indigo-500 hover:bg-indigo-600' : 'bg-emerald-500 hover:bg-emerald-600';
  return `<button type="button" data-action="speak" data-text="${esc(text)}" data-lang="${lang}" aria-label="${esc(label)}" class="grid ${size} shrink-0 place-items-center rounded-full ${color} text-white shadow-md transition active:scale-95">${SPEAKER_ICON}</button>`;
}

function topBar(counter) {
  return `
    <div class="mb-4 flex items-center justify-between gap-2">
      <button type="button" data-action="home" class="${BTN_GHOST} inline-flex items-center gap-1"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>חזרה לרשימות</button>
      <span class="text-sm font-semibold text-slate-500" dir="ltr">${esc(counter)}</span>
    </div>`;
}

const LIST_EMOJIS = ['📘', '📗', '📙', '📕', '📓'];

function importPanel() {
  return `
    <section class="${CARD} mb-4 text-center">
      <p class="text-4xl">📥</p>
      <h2 class="mt-1 text-lg font-bold">הוספת רשימה משלי</h2>
      <p class="mt-1 text-sm text-slate-500" dir="ltr">CSV: English, עברית (שתי עמודות)</p>
      <label class="mt-3 inline-block cursor-pointer rounded-2xl bg-indigo-600 px-6 py-3 font-bold text-white shadow-md transition hover:bg-indigo-700 active:scale-95">
        בחירת קובץ CSV
        <input id="csv-input" type="file" accept=".csv,text/csv" class="hidden" />
      </label>
    </section>`;
}

function listCard(list, emoji) {
  const mastered = list.words.filter((w) => isMastered(w.word)).length;
  const percent = Math.round((mastered / list.words.length) * 100);
  return `
    <section class="${CARD} mb-4">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-xl font-bold" dir="ltr">${emoji} ${esc(list.name)}</h2>
        <span class="text-sm text-slate-500">${list.words.length} מילים</span>
      </div>
      <div class="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
        <div class="progress-fill h-full rounded-full bg-emerald-500" style="width: ${percent}%; transform-origin: right"></div>
      </div>
      <p class="mt-1 text-sm text-slate-500">${percent === 100 ? '🎉 כל הכבוד, נשלטו כל המילים!' : `נשלטו: ${mastered} מתוך ${list.words.length}`}</p>
      <div class="mt-4 grid grid-cols-3 gap-2">
        <button type="button" data-action="open-cards" data-list="${esc(list.id)}" class="${BTN_TILE} bg-indigo-600 text-white hover:bg-indigo-700">🃏 כרטיסיות</button>
        <button type="button" data-action="start-practice" data-list="${esc(list.id)}" class="${BTN_TILE} bg-amber-400 text-slate-900 hover:bg-amber-500">✏️ תרגול</button>
        <button type="button" data-action="start-match" data-list="${esc(list.id)}" class="${BTN_TILE} bg-emerald-500 text-white hover:bg-emerald-600">🔗 חיבור</button>
      </div>
      ${list.custom ? `<button type="button" data-action="delete-custom" data-list="${esc(list.id)}" class="mt-3 w-full text-sm font-semibold text-red-600 hover:underline">🗑️ מחיקת הרשימה</button>` : ''}
    </section>`;
}

function homeView() {
  const custom = state.customLists.map((list) => listCard(list, '📄')).join('');
  const builtIn = state.lists.map((list, i) => listCard(list, LIST_EMOJIS[i % LIST_EMOJIS.length])).join('');
  return importPanel() + custom + builtIn;
}

function cardsView() {
  const list = currentList();
  const words = visibleWords(list);
  const hiddenCount = list.words.length - words.length;
  const filterBar = `
    <div class="mb-4 flex items-center justify-between gap-2 rounded-2xl bg-white px-4 py-2 shadow ring-1 ring-slate-200">
      <button type="button" data-action="toggle-hide-known" class="${BTN_GHOST}">${state.hideKnown ? '👀 הצגת כל המילים' : '🙈 הסתרת מילים שאני יודע/ת'}</button>
      <span class="text-sm text-slate-500">${hiddenCount ? `מוסתרות: ${hiddenCount}` : ''}</span>
    </div>`;

  if (!words.length) {
    return `
      ${topBar('0 / 0')}
      ${filterBar}
      <article class="${CARD} text-center">
        <p class="text-5xl">🎉</p>
        <h2 class="mt-3 text-xl font-bold">כל המילים ברשימה מסומנות כידועות!</h2>
        <p class="mt-2 text-slate-500">אפשר להציג אותן שוב בכפתור למעלה.</p>
      </article>`;
  }

  state.index = Math.min(state.index, words.length - 1);
  const total = words.length;
  const word = words[state.index];
  const known = isKnown(word.word);
  return `
    ${topBar(`${state.index + 1} / ${total}`)}
    ${filterBar}
    <article class="${CARD}">
      <div class="flex items-center justify-center gap-3" dir="ltr">
        <h2 class="text-4xl font-extrabold tracking-tight">${esc(word.word)}</h2>
        ${speakButton(word.word, 'השמעת המילה')}
      </div>
      ${word.partOfSpeech ? `<p class="mt-2 text-center text-sm font-semibold uppercase text-indigo-600" dir="ltr">${esc(word.partOfSpeech)}</p>` : ''}
      ${word.phonetic ? `<p class="mt-1 text-center text-lg text-slate-500" dir="ltr">${esc(word.phonetic)}</p>` : ''}
      <div class="mt-4 flex items-center justify-center gap-3">
        <p class="text-2xl font-bold">${esc(word.hebrew)}</p>
        ${speakButton(word.hebrew, 'השמעת התרגום בעברית', 'he-IL', true)}
      </div>
      <button type="button" data-action="toggle-known" data-word="${esc(word.word)}" class="mt-5 w-full rounded-2xl px-4 py-3 font-bold transition active:scale-95 ${known ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}">
        ${known ? '✅ מסומנת כידועה (לחצו לביטול)' : '⬜ סמנו כמילה שאני יודע/ת'}
      </button>
    </article>
    ${word.examples.length ? `
    <section class="${CARD} mt-4">
      <h3 class="mb-3 font-bold">📝 משפטים לדוגמה</h3>
      <div class="space-y-3">
        ${word.examples.map((example, i) => `
          <div class="rounded-2xl bg-sky-50 p-3">
            <div class="grid grid-cols-2 items-center gap-3" dir="ltr">
              <div class="flex min-w-0 items-center gap-2">
                <p class="min-w-0 flex-1 text-base leading-snug" dir="ltr">${highlight(example, word.word)}</p>
                ${speakButton(example, 'השמעת המשפט באנגלית', 'en-US', true)}
              </div>
              <div class="flex min-w-0 items-center gap-2" dir="rtl">
                <p class="min-w-0 flex-1 text-base leading-snug">${esc(word.examplesHe[i])}</p>
                ${speakButton(word.examplesHe[i], 'השמעת המשפט בעברית', 'he-IL', true)}
              </div>
            </div>
          </div>`).join('')}
      </div>
    </section>` : ''}
    <div class="mt-6 grid grid-cols-2 gap-3">
      <button type="button" data-action="card-move" data-delta="-1" class="${BTN_ACCENT}" ${state.index === 0 ? 'disabled' : ''}>הקודמת</button>
      <button type="button" data-action="card-move" data-delta="1" class="${BTN_PRIMARY}" ${state.index === total - 1 ? 'disabled' : ''}>הבאה</button>
    </div>`;
}

function optionButton(option, target) {
  const wrong = state.wrongPicks.includes(option.hebrew);
  const correct = state.answered && option.hebrew === target.hebrew;
  let style = 'border-slate-200 bg-white hover:border-indigo-400';
  if (correct) style = 'border-green-600 bg-green-100';
  else if (wrong) style = 'border-red-500 bg-red-100';
  const disabled = state.answered || wrong;
  return `
    <button type="button" data-action="answer" data-hebrew="${esc(option.hebrew)}" ${disabled ? 'disabled' : ''}
      class="w-full rounded-2xl border-2 px-4 py-4 text-lg font-semibold transition active:scale-95 disabled:cursor-default ${style}">
      ${esc(option.hebrew)}
    </button>`;
}

function feedback() {
  const text = state.answered ? '🎉 כל הכבוד!' : '🤔 לא בדיוק, נסו שוב.';
  return `<p class="mt-5 text-center text-lg font-bold ${state.answered ? 'text-green-700' : 'text-red-600'}">${esc(text)}</p>`;
}

function practiceView() {
  const total = state.quiz.length;
  const target = state.quiz[state.index];
  const isLast = state.index === total - 1;
  return `
    ${topBar(`${state.index + 1} / ${total}`)}
    <div class="mb-4 h-3 overflow-hidden rounded-full bg-slate-200">
      <div class="h-full rounded-full bg-amber-400" style="width: ${(state.index / total) * 100}%"></div>
    </div>
    <article class="${CARD}">
      <p class="text-center text-slate-500">🤔 מה התרגום של המילה?</p>
      <div class="mt-3 flex items-center justify-center gap-3" dir="ltr">
        <h2 class="text-4xl font-extrabold tracking-tight">${esc(target.word)}</h2>
        ${speakButton(target.word, 'השמעת המילה')}
      </div>
      <div class="mt-6 grid gap-3">
        ${state.options.map((option) => optionButton(option, target)).join('')}
      </div>
      ${state.wrongPicks.length || state.answered ? feedback() : ''}
    </article>
    ${state.answered ? `<button type="button" data-action="quiz-next" class="${BTN_PRIMARY} mt-6">${isLast ? '🏁 לסיכום' : '🚀 לשאלה הבאה'}</button>` : ''}`;
}

function resultsView() {
  const total = state.quiz.length;
  return `
    ${topBar('')}
    <article class="${CARD} text-center">
      <p class="text-6xl">${state.score === total ? '🏆' : '🎉'}</p>
      <h2 class="mt-2 text-2xl font-bold">סיימתם את התרגול</h2>
      <p class="mt-3 text-5xl font-extrabold text-indigo-600" dir="ltr">${state.score} / ${total}</p>
      <p class="mt-2 text-slate-500">עניתם נכון על ${state.score} מתוך ${total} מילים.</p>
    </article>
    <div class="mt-6 grid grid-cols-2 gap-3">
      <button type="button" data-action="start-practice" data-list="${esc(state.listId)}" class="${BTN_ACCENT}">תרגלו שוב</button>
      <button type="button" data-action="home" class="${BTN_PRIMARY}">לרשימות</button>
    </div>`;
}

const BTN_TILE = 'w-full rounded-2xl px-2 py-3 text-sm font-bold shadow-md transition active:scale-95';

function matchButton(side, key, text) {
  const { done, selected, wrong } = state.match;
  const isDone = done.has(key);
  const isWrong = wrong !== null && wrong.side === side && wrong.key === key;
  const isSelected = selected !== null && selected.side === side && selected.key === key;
  let style = 'border-slate-200 bg-white hover:border-indigo-400';
  if (isDone) style = 'border-green-600 bg-green-100 text-green-800';
  else if (isWrong) style = 'border-red-500 bg-red-100';
  else if (isSelected) style = 'border-indigo-600 bg-indigo-100';
  return `
    <button type="button" data-action="match-pick" data-side="${side}" data-key="${esc(key)}" dir="${side === 'he' ? 'rtl' : 'ltr'}" ${isDone ? 'disabled' : ''}
      class="w-full rounded-2xl border-2 px-3 py-3 text-base font-semibold transition active:scale-95 disabled:cursor-default ${style}">
      ${esc(text)}
    </button>`;
}

function matchView() {
  const list = currentList();
  const { done, right } = state.match;
  const total = list.words.length;
  const solved = done.size === total;
  return `
    ${topBar(`${done.size} / ${total}`)}
    <article class="${CARD}">
      <p class="mb-4 text-center text-slate-500">חברו כל מילה באנגלית לתרגום שלה</p>
      <div id="match-board" class="relative grid grid-cols-2 gap-x-8 gap-y-3" dir="ltr">
        <svg id="match-lines" class="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true"></svg>
        <div class="grid content-start gap-3">
          ${list.words.map((word) => matchButton('en', word.word, word.word)).join('')}
        </div>
        <div class="grid content-start gap-3">
          ${right.map((word) => matchButton('he', word.word, word.hebrew)).join('')}
        </div>
      </div>
      ${solved ? '<p class="mt-6 text-center text-lg font-bold text-green-700">🎉 מעולה! חיברתם את כל המילים.</p>' : ''}
    </article>
    ${solved ? `
    <div class="mt-6 grid grid-cols-2 gap-3">
      <button type="button" data-action="start-match" data-list="${esc(list.id)}" class="${BTN_ACCENT}">חברו שוב</button>
      <button type="button" data-action="home" class="${BTN_PRIMARY}">לרשימות</button>
    </div>` : ''}`;
}

const VIEWS = {
  home: homeView,
  cards: cardsView,
  practice: practiceView,
  results: resultsView,
  match: matchView,
};

function render() {
  app.innerHTML = VIEWS[state.view]();
  if (state.view === 'match') requestAnimationFrame(drawMatchLines);
  animateEntrance();
}

function animateEntrance() {
  const direction = state.enter;
  state.enter = null;
  if (direction === 'home') {
    app.querySelectorAll('.progress-fill').forEach((bar) => bar.animate(
      [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
      { duration: 800, easing: 'ease-out' },
    ));
    return;
  }
  const card = app.querySelector('article');
  if (!direction || !card) return;
  const offset = direction === 'prev' ? -40 : 40;
  card.animate(
    [{ transform: `translateX(${offset}px)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }],
    { duration: 350, easing: 'ease-out' },
  );
}

function startMatch(listId) {
  state.view = 'match';
  state.listId = listId;
  state.match = {
    right: shuffle(currentList().words),
    done: new Set(),
    selected: null,
    wrong: null,
  };
  render();
}

function matchPick(side, key) {
  const match = state.match;
  if (match.done.has(key)) return;
  if (match.selected === null || match.selected.side === side) {
    match.selected = { side, key };
    render();
    return;
  }
  const enKey = side === 'en' ? key : match.selected.key;
  const heKey = side === 'he' ? key : match.selected.key;
  const record = getRecord(enKey);

  if (enKey === heKey) {
    match.selected = null;
    match.done.add(enKey);
    progress[enKey] = { ...record, correct: record.correct + 1 };
    saveProgress();
    render();
    celebrate(document.querySelector(`[data-side="he"][data-key="${CSS.escape(enKey)}"]`));
    setTimeout(() => speak(enKey), 450);
    return;
  }

  progress[enKey] = { ...record, wrong: record.wrong + 1 };
  saveProgress();
  const flash = { side, key };
  match.wrong = flash;
  render();
  setTimeout(() => {
    if (state.match !== match || match.wrong !== flash) return;
    match.wrong = null;
    render();
  }, 700);
}

function drawMatchLines() {
  const board = document.getElementById('match-board');
  const svg = document.getElementById('match-lines');
  if (!board || !svg) return;
  const origin = board.getBoundingClientRect();
  const anchor = (side, key) => {
    const rect = board.querySelector(`[data-side="${side}"][data-key="${CSS.escape(key)}"]`).getBoundingClientRect();
    return {
      x: (side === 'en' ? rect.right : rect.left) - origin.left,
      y: rect.top + rect.height / 2 - origin.top,
    };
  };
  svg.setAttribute('viewBox', `0 0 ${origin.width} ${origin.height}`);
  svg.innerHTML = [...state.match.done].map((key) => {
    const a = anchor('en', key);
    const b = anchor('he', key);
    return `
      <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#16a34a" stroke-width="3" stroke-linecap="round" />
      <circle cx="${a.x}" cy="${a.y}" r="5" fill="#16a34a" />
      <circle cx="${b.x}" cy="${b.y}" r="5" fill="#16a34a" />`;
  }).join('');
}

window.addEventListener('resize', () => {
  if (state.view === 'match') drawMatchLines();
});

function openCards(listId) {
  state.view = 'cards';
  state.listId = listId;
  state.index = 0;
  render();
}

function prepareQuestion() {
  const target = state.quiz[state.index];
  const distractors = shuffle(allWords().filter((w) => w.hebrew !== target.hebrew)).slice(0, 3);
  state.options = shuffle([target, ...distractors]);
  state.answered = false;
  state.wrongPicks = [];
}

function startPractice(listId) {
  state.view = 'practice';
  state.listId = listId;
  state.quiz = shuffle(currentList().words);
  state.index = 0;
  state.score = 0;
  prepareQuestion();
  render();
}

function answerButton(hebrew) {
  return [...document.querySelectorAll('[data-action="answer"]')].find((b) => b.dataset.hebrew === hebrew);
}

function shake(el) {
  el?.animate(
    [0, -8, 8, -6, 6, 0].map((x) => ({ transform: `translateX(${x}px)` })),
    { duration: 400, easing: 'ease-in-out' },
  );
}

function answer(hebrew) {
  const target = state.quiz[state.index];
  if (state.answered || state.wrongPicks.includes(hebrew)) return;
  const record = getRecord(target.word);

  if (hebrew !== target.hebrew) {
    state.wrongPicks.push(hebrew);
    progress[target.word] = { ...record, wrong: record.wrong + 1 };
    saveProgress();
    render();
    shake(answerButton(hebrew));
    return;
  }

  state.answered = true;
  if (state.wrongPicks.length === 0) state.score++;
  progress[target.word] = { ...record, correct: record.correct + 1 };
  saveProgress();
  render();
  celebrate([...document.querySelectorAll('[data-action="answer"]')].find((b) => b.dataset.hebrew === hebrew));
  setTimeout(() => speak(target.word), 450);
}

function nextQuestion() {
  if (state.index + 1 >= state.quiz.length) {
    state.view = 'results';
    state.enter = 'next';
    if (state.score === state.quiz.length) playCheer();
  } else {
    state.enter = 'next';
    state.index++;
    prepareQuestion();
  }
  render();
}

function moveCard(delta) {
  state.enter = delta > 0 ? 'next' : 'prev';
  state.index += delta;
  render();
}

const ACTIONS = {
  home: () => { state.view = 'home'; state.enter = 'home'; render(); },
  'open-cards': (el) => openCards(el.dataset.list),
  'card-move': (el) => moveCard(Number(el.dataset.delta)),
  'start-practice': (el) => startPractice(el.dataset.list),
  answer: (el) => answer(el.dataset.hebrew),
  'quiz-next': nextQuestion,
  speak: (el) => speak(el.dataset.text, el.dataset.lang),
  'start-match': (el) => startMatch(el.dataset.list),
  'match-pick': (el) => matchPick(el.dataset.side, el.dataset.key),
  'toggle-hide-known': () => toggleHideKnown(),
  'toggle-known': (el) => toggleKnown(el.dataset.word, el),
  'delete-custom': (el) => deleteCustomList(el.dataset.list),
};

function toggleKnown(word, button) {
  const record = getRecord(word);
  const nowKnown = !record.known;
  progress[word] = { ...record, known: nowKnown };
  saveProgress();
  if (nowKnown) celebrate(button);
  render();
}

function toggleHideKnown() {
  state.hideKnown = !state.hideKnown;
  state.index = 0;
  render();
}

async function importCsv(file) {
  const words = buildWordsFromCsv(await file.text());
  if (!words.length) {
    alert('לא נמצאו מילים בקובץ.\nודאו ששורה בקובץ מכילה שתי עמודות: אנגלית ועברית, ושהקובץ נשמר בקידוד UTF-8.');
    return;
  }
  state.customLists.push({
    id: `custom-${Date.now()}`,
    name: file.name.replace(/\.csv$/i, ''),
    custom: true,
    words,
  });
  saveCustomLists();
  state.enter = 'home';
  render();
}

function deleteCustomList(id) {
  const list = state.customLists.find((item) => item.id === id);
  if (!list || !confirm(`למחוק את הרשימה "${list.name}"?`)) return;
  state.customLists = state.customLists.filter((item) => item.id !== id);
  saveCustomLists();
  render();
}

app.addEventListener('change', (event) => {
  if (event.target.id !== 'csv-input') return;
  const file = event.target.files[0];
  event.target.value = '';
  if (file) importCsv(file);
});

app.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el || el.disabled) return;
  ACTIONS[el.dataset.action]?.(el);
});

async function init() {
  state.customLists = loadCustomLists();
  state.enter = 'home';
  try {
    const response = await fetch('data/vocabulary.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.lists = data.lists;
    unitTitle.textContent = data.unit;
    render();
  } catch (error) {
    console.error(error);
    app.innerHTML = `<p class="${CARD} text-center text-red-600">לא ניתן לטעון את רשימות המילים. יש לפתוח את האתר דרך שרת אינטרנט ולא ישירות מקובץ.</p>`;
  }
}

init();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
}
