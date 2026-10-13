/* =========================================================
   Flip & Match - Memory Card Game
   Plain JavaScript, no libraries.
   ========================================================= */

/* ---------- 1. Settings ---------- */

// The three difficulty levels and how many pairs each one uses
const LEVELS = {
  easy:   { label: 'Easy',   pairs: 4 },
  medium: { label: 'Medium', pairs: 6 },
  hard:   { label: 'Hard',   pairs: 8 }
};

// The emoji used on the cards (8 symbols = enough for the Hard level)
const SYMBOLS = ['🍓', '🚀', '🐱', '🎮', '🌈', '🍕', '🎧', '⚽'];

const MISMATCH_DELAY = 900;   // ms before two wrong cards flip back
const FINISH_DELAY = 800;     // ms to wait after the last match before the results screen
const STORAGE_KEY = 'flipAndMatchBestScores';  // name used inside localStorage

/* ---------- 2. Page elements ---------- */

const screens = {
  welcome: document.getElementById('welcome-screen'),
  levels:  document.getElementById('levels-screen'),
  game:    document.getElementById('game-screen'),
  results: document.getElementById('results-screen')
};

const boardEl        = document.getElementById('board');
const levelTitleEl   = document.getElementById('level-title');
const movesEl        = document.getElementById('moves');
const timerEl        = document.getElementById('timer');
const pairsEl        = document.getElementById('pairs');
const progressEl     = document.getElementById('progress');
const progressFillEl = document.getElementById('progress-fill');
const bestLineEl     = document.getElementById('best-line');

const resultTimeEl    = document.getElementById('result-time');
const resultMovesEl   = document.getElementById('result-moves');
const resultMessageEl = document.getElementById('results-message');
const newBestEl       = document.getElementById('new-best');
const resultBestEl    = document.getElementById('result-best');
const confettiEl      = document.getElementById('confetti');

/* ---------- 3. Game state (values that change while playing) ---------- */

let currentLevel = 'easy';  // 'easy', 'medium' or 'hard'
let firstCard = null;       // the first card flipped in the current turn
let secondCard = null;      // the second card flipped in the current turn
let lockBoard = false;      // true = ignore clicks (two cards are being checked)
let moves = 0;
let matchedPairs = 0;
let totalPairs = 0;

let timerId = null;         // id of the running setInterval
let timerStarted = false;   // becomes true on the first flip
let startTime = 0;          // when the timer started (ms)
let elapsedSeconds = 0;     // seconds played so far

let mismatchTimeout = null; // pending "flip back" timer
let finishTimeout = null;   // pending "show results" timer
let confettiTimeout = null; // pending "remove confetti" timer

/* ---------- 4. Helper functions ---------- */

// Show one screen and hide the others
function showScreen(name) {
  Object.keys(screens).forEach(function (key) {
    screens[key].classList.remove('active');
  });
  screens[name].classList.add('active');
}

// Shuffle an array (Fisher-Yates) and return a new shuffled copy
function shuffle(list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}

// Turn 75 seconds into "1:15"
function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
}

/* ---------- 5. Best scores (saved in localStorage) ---------- */

// Read all saved best scores, e.g. { easy: { moves: 6, time: 20 } }
function loadBestScores() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (error) {
    return {};   // storage blocked or data broken: start fresh
  }
}

// Save a score if it beats the old one.
// Fewer moves wins. If moves are equal, the faster time wins.
// Returns true when a new best was set.
function saveBestScore(level, scoreMoves, scoreTime) {
  const scores = loadBestScores();
  const old = scores[level];

  const isBetter =
    !old ||
    scoreMoves < old.moves ||
    (scoreMoves === old.moves && scoreTime < old.time);

  if (isBetter) {
    scores[level] = { moves: scoreMoves, time: scoreTime };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
    } catch (error) {
      // If saving fails the game still works, the score just isn't kept
    }
  }
  return isBetter;
}

// Text such as "Best: 8 moves in 0:42" (or a message if there is none yet)
function bestText(level) {
  const best = loadBestScores()[level];
  if (!best) {
    return 'No best score yet';
  }
  return 'Best: ' + best.moves + ' moves in ' + formatTime(best.time);
}

// Write the best score under each button on the level screen
function updateLevelBestLabels() {
  document.querySelectorAll('.level-btn').forEach(function (button) {
    button.querySelector('.level-best').textContent = bestText(button.dataset.level);
  });
}

/* ---------- 6. Timer ---------- */

function startTimer() {
  timerStarted = true;
  startTime = Date.now();
  timerId = setInterval(function () {
    elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    timerEl.textContent = formatTime(elapsedSeconds);
  }, 250);
}

function stopTimer() {
  if (timerId !== null) {
    // Take one last reading so the final time is exact
    elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    timerEl.textContent = formatTime(elapsedSeconds);
  }
  clearInterval(timerId);
  timerId = null;
}

/* ---------- 7. Setting up a game ---------- */

// Begin a game at the chosen level
function startGame(level) {
  currentLevel = level;
  levelTitleEl.textContent = LEVELS[level].label;
  showScreen('game');
  resetGame();
}

// Put everything back to the starting position with freshly shuffled cards.
// Used for starting a game AND for the Restart button.
function resetGame() {
  // Stop anything still running from the last round
  clearInterval(timerId);
  clearTimeout(mismatchTimeout);
  clearTimeout(finishTimeout);
  clearConfetti();

  // Reset the numbers
  timerId = null;
  timerStarted = false;
  elapsedSeconds = 0;
  firstCard = null;
  secondCard = null;
  lockBoard = false;
  moves = 0;
  matchedPairs = 0;
  totalPairs = LEVELS[currentLevel].pairs;

  // Reset what the player sees
  movesEl.textContent = '0';
  timerEl.textContent = '0:00';
  bestLineEl.textContent = bestText(currentLevel);
  updateProgress();

  buildBoard();
}

// Create the card buttons and add them to the page
function buildBoard() {
  boardEl.innerHTML = '';

  // Pick random symbols for this round, then double them to make pairs
  const chosen = shuffle(SYMBOLS).slice(0, totalPairs);
  const deck = shuffle(chosen.concat(chosen));

  deck.forEach(function (symbol) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.dataset.symbol = symbol;  // used later to compare two cards
    card.setAttribute('aria-label', 'Hidden card');

    // Two faces: the "?" cover and the emoji
    card.innerHTML =
      '<div class="card-inner">' +
        '<div class="card-face card-cover">?</div>' +
        '<div class="card-face card-symbol">' + symbol + '</div>' +
      '</div>';

    boardEl.appendChild(card);
  });
}

/* ---------- 8. Playing: flipping and matching ---------- */

// One click listener for the whole board (works for every card)
boardEl.addEventListener('click', function (event) {
  const card = event.target.closest('.card');
  if (card) {
    flipCard(card);
  }
});

function flipCard(card) {
  // Ignore the click if...
  if (lockBoard) return;                              // two cards are being checked
  if (card.classList.contains('matched')) return;     // already matched
  if (card.classList.contains('flipped')) return;     // same card clicked twice

  // The timer starts on the very first flip
  if (!timerStarted) {
    startTimer();
  }

  card.classList.add('flipped');
  card.setAttribute('aria-label', 'Card ' + card.dataset.symbol);

  // First card of the turn: just remember it
  if (firstCard === null) {
    firstCard = card;
    return;
  }

  // Second card of the turn: count a move and check for a match
  secondCard = card;
  lockBoard = true;   // block clicks until the check is finished
  moves++;
  movesEl.textContent = moves;

  if (firstCard.dataset.symbol === secondCard.dataset.symbol) {
    handleMatch();
  } else {
    handleMismatch();
  }
}

// The two cards match: keep them open for good
function handleMatch() {
  [firstCard, secondCard].forEach(function (card) {
    card.classList.add('matched');
    card.disabled = true;   // a matched card can't be clicked again
  });

  matchedPairs++;
  updateProgress();
  resetTurn();

  // All pairs found? Stop the clock and show the results shortly after
  if (matchedPairs === totalPairs) {
    stopTimer();
    lockBoard = true;
    finishTimeout = setTimeout(endGame, FINISH_DELAY);
  }
}

// The two cards differ: shake, then flip both back after a short delay
function handleMismatch() {
  const a = firstCard;
  const b = secondCard;

  a.classList.add('wrong');
  b.classList.add('wrong');

  mismatchTimeout = setTimeout(function () {
    [a, b].forEach(function (card) {
      card.classList.remove('flipped', 'wrong');
      card.setAttribute('aria-label', 'Hidden card');
    });
    resetTurn();
  }, MISMATCH_DELAY);
}

// Get ready for the next turn
function resetTurn() {
  firstCard = null;
  secondCard = null;
  lockBoard = false;
}

// Update the "Pairs" box and the progress bar
function updateProgress() {
  const percent = totalPairs === 0 ? 0 : Math.round((matchedPairs / totalPairs) * 100);
  pairsEl.textContent = matchedPairs + ' / ' + totalPairs;
  progressFillEl.style.width = percent + '%';
  progressEl.setAttribute('aria-valuenow', percent);
}

/* ---------- 9. Ending the game ---------- */

function endGame() {
  const isNewBest = saveBestScore(currentLevel, moves, elapsedSeconds);

  resultTimeEl.textContent = formatTime(elapsedSeconds);
  resultMovesEl.textContent = moves;
  resultMessageEl.textContent =
    'You matched all ' + totalPairs + ' pairs on ' + LEVELS[currentLevel].label + '.';
  newBestEl.hidden = !isNewBest;
  resultBestEl.textContent = bestText(currentLevel);

  showScreen('results');
  launchConfetti();
}

// Small celebration: coloured pieces fall from the top of the screen
function launchConfetti() {
  clearConfetti();
  const colors = ['#ffd23f', '#3ddc97', '#ff6b6b', '#4cc9f0', '#7b5cff', '#ff5fa2'];

  for (let i = 0; i < 60; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.setProperty('--x', Math.random() * 100 + '%');
    piece.style.setProperty('--drift', (Math.random() * 160 - 80) + 'px');
    piece.style.setProperty('--delay', (Math.random() * 0.8) + 's');
    piece.style.setProperty('--color', colors[i % colors.length]);
    confettiEl.appendChild(piece);
  }

  // Clean up after the animation is over
  confettiTimeout = setTimeout(clearConfetti, 4500);
}

function clearConfetti() {
  clearTimeout(confettiTimeout);
  confettiEl.innerHTML = '';
}

/* ---------- 10. Navigation between screens ---------- */

// Go to the level screen (stops any game in progress)
function goToLevels() {
  clearInterval(timerId);
  clearTimeout(mismatchTimeout);
  clearTimeout(finishTimeout);
  clearConfetti();
  updateLevelBestLabels();
  showScreen('levels');
}

// Welcome screen: Start Game
document.getElementById('start-btn').addEventListener('click', goToLevels);

// Level screen: Back
document.getElementById('back-btn').addEventListener('click', function () {
  showScreen('welcome');
});

// Level screen: pick a difficulty
document.querySelectorAll('.level-btn').forEach(function (button) {
  button.addEventListener('click', function () {
    startGame(button.dataset.level);
  });
});

// Game screen: Restart Game (same level, new shuffle, everything reset)
document.getElementById('restart-btn').addEventListener('click', resetGame);

// Game screen: New Game (back to difficulty selection)
document.getElementById('new-game-btn').addEventListener('click', goToLevels);

// Results screen: Play Again (same level) and New Game
document.getElementById('play-again-btn').addEventListener('click', function () {
  startGame(currentLevel);
});
document.getElementById('results-new-game-btn').addEventListener('click', goToLevels);
