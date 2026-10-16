const EXERCISES = [
    'Basic ATM Simulation.c',
    'Basic Structure and Printing.c',
    'Basic Structure.c',
    'Book Reservation.c',
    'C to F.c',
    
    'Circle Area Calculator.c',
    'Cube Volume Finder.c',
    'Declaring Constant.c',
    'Escape Characters.c',
    'Invoice Generation.c',
    'Name Input.c',
    
    'Personal Information Display.c',
    'Personal Information.c',
    'Print Triangle.c',
    'Product Discount Calculator.c',
    
    'Rainbow Arch.c',
    'Rectangle Perimeter.c',
    'Starry Ascension.c',
    'Student Grade Averager.c',
    'User Welcome Banner.c',
    'Using scanf.c',
    'Variable Declaration and Types.c',
    
    'Wage Calculator.c'
    
];

let studentDatabase = [];
let exerciseData = {}; 
let currentFile = "";
let currentUser = "";
let appMode = 'exam'; // 'practice' | 'exam'
let examMinutes = 30; // default minutes for exam mode
let timerSeconds = 0;
let timerInterval = null;
let timerEndsAt = null;
let scoreModalShown = false;
// Track whether we've already shown the full-course celebration
let totalCelebrated = false;
let scoreModalPausedItem = null;

const EXAM_STORAGE_PREFIX = 'bug-catcher:exam:';
const EXAM_STORAGE_VERSION = 4;

function createItemMetrics() {
    return {
        activeTimeMs: 0,
        visits: 0,
        answerChanges: 0,
        activeSinceMs: null
    };
}

function normalizeItemMetrics(metrics, savedVersion) {
    return {
        activeTimeMs: Number.isFinite(metrics?.activeTimeMs) ? Math.max(0, metrics.activeTimeMs) : 0,
        visits: Number.isInteger(metrics?.visits) ? Math.max(0, metrics.visits) : 0,
        // Versions 1–2 counted raw checkbox clicks. Version 3 already counted
        // deliberate revisions, so its value remains useful under this model.
        answerChanges: savedVersion >= 3 && Number.isInteger(metrics?.answerChanges)
            ? Math.max(0, metrics.answerChanges)
            : 0,
        activeSinceMs: null
    };
}

function pauseItemTimer(fileName = currentFile) {
    const metrics = exerciseData[fileName]?.metrics;
    if (!metrics || !Number.isFinite(metrics.activeSinceMs)) return;

    metrics.activeTimeMs += Math.max(0, Date.now() - metrics.activeSinceMs);
    metrics.activeSinceMs = null;
}

function resumeItemTimer(fileName = currentFile) {
    const data = exerciseData[fileName];
    if (!data || data.locked || document.hidden || scoreModalPausedItem === fileName) return;
    if (!Number.isFinite(data.metrics.activeSinceMs)) data.metrics.activeSinceMs = Date.now();
}

function getItemActiveTimeMs(data) {
    const runningTime = Number.isFinite(data?.metrics?.activeSinceMs) && !document.hidden
        ? Math.max(0, Date.now() - data.metrics.activeSinceMs)
        : 0;
    return Math.max(0, (data?.metrics?.activeTimeMs || 0) + runningTime);
}

function getExamStorageKey(email = currentUser) {
    return `${EXAM_STORAGE_PREFIX}${encodeURIComponent(email.trim().toLowerCase())}`;
}

function getExerciseSignature(data) {
    const source = data.answers
        .map(answer => `${answer.isWrong ? '1' : '0'}:${answer.token}`)
        .join('\u001f');
    let hash = 2166136261;

    for (let i = 0; i < source.length; i++) {
        hash ^= source.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    return `${data.answers.length}:${data.wrongCount}:${hash >>> 0}`;
}

function readExamState() {
    if (appMode !== 'exam' || !currentUser) return null;

    try {
        const saved = JSON.parse(localStorage.getItem(getExamStorageKey()) || 'null');
        if (!saved || ![1, 2, 3, EXAM_STORAGE_VERSION].includes(saved.version)) return null;
        if (saved.email.toLowerCase() !== currentUser.toLowerCase()) return null;
        return saved;
    } catch (error) {
        console.warn('Unable to read saved exam progress.', error);
        return null;
    }
}

function persistExamState() {
    if (appMode !== 'exam' || !currentUser) return;

    const exercises = {};
    for (const fileName of EXERCISES) {
        const data = exerciseData[fileName];
        if (!data) continue;

        exercises[fileName] = {
            signature: getExerciseSignature(data),
            userProgress: data.userProgress.map(Boolean),
            lastScore: data.lastScore || 0,
            locked: !!data.locked,
            lastVerifiedAt: data.lastVerifiedAt || null,
            metrics: {
                activeTimeMs: getItemActiveTimeMs(data),
                visits: data.metrics.visits,
                answerChanges: data.metrics.answerChanges
            }
        };
    }

    const state = {
        version: EXAM_STORAGE_VERSION,
        email: currentUser,
        examMinutes,
        timerEndsAt,
        savedAt: new Date().toISOString(),
        exercises
    };

    try {
        localStorage.setItem(getExamStorageKey(), JSON.stringify(state));
    } catch (error) {
        console.warn('Unable to save exam progress.', error);
    }
}

function restoreExamProgress(savedState) {
    if (!savedState || !savedState.exercises) return;

    for (const fileName of EXERCISES) {
        const data = exerciseData[fileName];
        const saved = savedState.exercises[fileName];
        if (!data || !saved || saved.signature !== getExerciseSignature(data)) continue;
        if (!Array.isArray(saved.userProgress) || saved.userProgress.length !== data.userProgress.length) continue;

        data.userProgress = saved.userProgress.map(Boolean);
        data.lastScore = Number.isInteger(saved.lastScore)
            ? Math.max(0, Math.min(saved.lastScore, data.wrongCount))
            : 0;
        data.locked = !!saved.locked;
        data.lastVerifiedAt = typeof saved.lastVerifiedAt === 'string' ? saved.lastVerifiedAt : null;
        data.metrics = normalizeItemMetrics(saved.metrics, savedState.version);
    }
}

window.onload = async function() {
    try {
        const res = await fetch('students.csv');
        const text = await res.text();
        const rows = text.split('\n').slice(1);
        studentDatabase = rows.map(row => {
            const [email, id] = row.split(',');
            return { email: email?.trim(), id: id?.trim() };
        });
    } catch (err) { console.error("Database failed to load."); }
};

    // SETTINGS & MODAL HANDLERS
    function openSettingsModal() {
        const m = document.getElementById('settingsModal');
        if (!m) return;
        // reflect current mode
        const radios = document.getElementsByName('appMode');
        radios.forEach(r => r.checked = (r.value === appMode));
        const examSettings = document.getElementById('examSettings');
        examSettings.style.display = (appMode === 'exam') ? 'block' : 'none';
        document.getElementById('examMinutesInput').value = examMinutes;
        m.style.display = 'flex';
    }

    function closeSettingsModal() {
        const m = document.getElementById('settingsModal'); if (m) m.style.display = 'none';
    }

    function saveSettings() {
        const radios = document.getElementsByName('appMode');
        let selected = 'practice';
        radios.forEach(r => { if (r.checked) selected = r.value; });
        const minutesInput = document.getElementById('examMinutesInput');
        const mins = parseInt(minutesInput.value, 10);
        if (selected === 'exam') {
            if (!Number.isInteger(mins) || mins < 1 || mins > 180) {
                minutesInput.classList.add('invalid');
                minutesInput.focus();
                return;
            }
            examMinutes = mins;
        }
        appMode = selected;
        // if user already logged in, apply timer visibility/behavior immediately
        if (currentUser) {
            if (appMode === 'exam') {
                startTimer(examMinutes);
            } else {
                stopTimer();
            }
        }
        closeSettingsModal();
    }

    // react to mode radio changes inside modal (delegated from HTML on change)
    document.addEventListener('change', (e) => {
        if (!e.target) return;
        if (e.target.name === 'appMode') {
            const examSettings = document.getElementById('examSettings');
            examSettings.style.display = (e.target.value === 'exam') ? 'block' : 'none';
        }
    });

    // TIMER
    function startTimer(minutes, savedEndTime = null) {
        stopTimer();
        timerEndsAt = Number.isFinite(savedEndTime)
            ? savedEndTime
            : Date.now() + Math.max(0, Math.floor(minutes) * 60 * 1000);

        const timerContainer = document.getElementById('timerContainer');
        if (timerContainer) timerContainer.style.display = 'flex';

        const tick = () => {
            timerSeconds = Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000));
            updateTimerUI();
            if (timerSeconds <= 0) {
                stopTimer();
                onTimerExpire();
                return false;
            }
            return true;
        };

        persistExamState();
        if (tick()) timerInterval = setInterval(tick, 1000);
    }

    function stopTimer() {
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        const timerContainer = document.getElementById('timerContainer');
        if (timerContainer) timerContainer.style.display = 'none';
    }

    function updateTimerUI() {
        const display = document.getElementById('timerDisplay');
        if (!display) return;
        const mm = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
        const ss = String(timerSeconds % 60).padStart(2, '0');
        display.textContent = `${mm}:${ss}`;
        display.classList.remove('warning', 'critical');
        if (timerSeconds <= 60) display.classList.add('critical');
        else if (timerSeconds <= 300) display.classList.add('warning');
    }

    function onTimerExpire() {
        pauseItemTimer();
        // Ensure no further resets are possible; keep inputs disabled
        for (const file in exerciseData) {
            const data = exerciseData[file];
            // lock everything not already verified
            if (!data.locked) data.locked = true;
        }
        persistExamState();

        if (currentFile) {
            const currentNav = document.getElementById(`nav-${currentFile.replace(/\./g, '-')}`);
            if (currentNav) switchExercise(currentFile, currentNav);
        }

        const fb = document.getElementById('feedback');
        if (fb) { fb.textContent = 'Time is up — exam finished.'; fb.style.color = 'var(--error)'; }
        updateTotalScore();
        showScoreModal('time');
    }

async function handleLogin() {
    const email = document.getElementById('emailInput').value.trim();
    const id = document.getElementById('studentNumInput').value.trim();
    const user = studentDatabase.find(s => s.email === email && s.id === id);
    
    if (user) {
        currentUser = email;
        scoreModalShown = false;
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('appContainer').style.display = 'flex';
        document.getElementById('userDisplay').textContent = email;
        const savedExamState = readExamState();
        await loadAllExercises(savedExamState);

        // Resume the saved exam deadline, or start a new timer for this student.
        if (appMode === 'exam') {
            if (Number.isInteger(savedExamState?.examMinutes)) {
                examMinutes = savedExamState.examMinutes;
            }
            const savedEndTime = Number.isFinite(savedExamState?.timerEndsAt)
                ? savedExamState.timerEndsAt
                : null;
            startTimer(examMinutes, savedEndTime);
        } else {
            stopTimer();
        }
    } else {
        document.getElementById('loginError').textContent = "Invalid credentials.";
    }
}

async function loadAllExercises(savedExamState = null) {
    const list = document.getElementById('fileList');
    list.innerHTML = ""; 
    exerciseData = {};
    currentFile = "";
    document.getElementById('loader').style.display = 'block';

    for (const fileName of EXERCISES) {
        try {
            const res = await fetch('./exercises/' + fileName);
            const code = await res.text();
            exerciseData[fileName] = parseExerciseCode(code);

            const li = document.createElement('li');
            const safeId = fileName.replace(/\./g, '-');
            li.id = `nav-${safeId}`;
            
            li.innerHTML = `
                <span>${fileName.replace('.java', '')}</span>
                <span class="nav-score" id="score-${safeId}">0/${exerciseData[fileName].wrongCount}</span>
            `;
            
            li.onclick = () => switchExercise(fileName, li);
            list.appendChild(li);
        } catch (e) { console.warn("Missing: " + fileName); }
    }
    document.getElementById('loader').style.display = 'none';

    restoreExamProgress(savedExamState);
    for (const fileName of EXERCISES) {
        updateSidebarScore(fileName);
    }

    if (list.firstChild) list.firstChild.click();
    // Set total max score and accumulated score
    updateTotalScore();
    // Ensure timer visibility on the activity page according to mode
    const timerContainer = document.getElementById('timerContainer');
    if (timerContainer) {
        timerContainer.style.display = appMode === 'exam' ? 'flex' : 'none';
    }
}

function updateSidebarScore(fileName) {
    const data = exerciseData[fileName];
    if (!data) return;

    const safeId = fileName.replace(/\./g, '-');
    const scoreSpan = document.getElementById(`score-${safeId}`);
    if (!scoreSpan) return;

    scoreSpan.textContent = `${data.lastScore}/${data.wrongCount}`;
    scoreSpan.classList.remove('completed-score', 'partial-score');
    if (data.wrongCount > 0 && data.lastScore === data.wrongCount) {
        scoreSpan.classList.add('completed-score');
    } else if (data.lastScore > 0) {
        scoreSpan.classList.add('partial-score');
    }
}

function handleVerifyReset() {
    if (!currentFile) return;
    const data = exerciseData[currentFile];
    if (!data) return;
    if (data.locked) {
        resetCurrentExercise();
    } else {
        checkAnswers();
    }
}

function resetCurrentExercise() {
    if (!currentFile) return;
    const data = exerciseData[currentFile];
    if (!data) return;
    // In exam mode, resetting is disabled once an activity has been verified
    if (appMode === 'exam' && data.locked) {
        const fb = document.getElementById('feedback');
        fb.textContent = 'Reset is disabled in Exam Mode.';
        fb.style.color = 'var(--error)';
        setTimeout(() => { fb.textContent = ''; }, 2500);
        return;
    }
    // clear selections
    data.userProgress = data.userProgress.map(() => false);
    data.lastScore = 0;
    data.locked = false;
    data.lastVerifiedAt = null;
    data.metrics = createItemMetrics();
    data.metrics.visits = 1;

    const inputs = document.querySelectorAll('.token-option input[type="checkbox"]');
    inputs.forEach((input, idx) => {
        input.checked = false;
        input.disabled = false;
        const label = input.parentElement;
        label.classList.remove('selected','wrong','correct','disabled');
    });

    updateSidebarScore(currentFile);

    // reset UI
    const verifyBtn = document.getElementById('verifyBtn');
    if (verifyBtn) verifyBtn.textContent = 'Verify Code';
    document.getElementById('feedback').textContent = '';
    const selectedEl = document.getElementById('selectedCount');
    if (selectedEl) selectedEl.textContent = '0';

    // restore enable/disable according to selection rules
    switchExercise(currentFile, document.getElementById(`nav-${currentFile.replace(/\./g,'-')}`));
    resumeItemTimer(currentFile);

    // update total accumulated score
    updateTotalScore();
    persistExamState();
}

function updateTotalScore() {
    let totalCorrect = 0;
    let totalMax = 0;
    let allAnswered = true;
    for (const file in exerciseData) {
        const d = exerciseData[file];
        totalCorrect += d.lastScore || 0;
        totalMax += d.wrongCount || 0;
        if (!d.locked) allAnswered = false;
    }
    const acc = document.getElementById('accScore');
    const max = document.getElementById('maxScore');
    const totalBox = document.getElementById('totalScore');
    if (acc) acc.textContent = totalCorrect;
    if (max) max.textContent = totalMax;
    if (totalBox) {
        if (totalCorrect === totalMax && totalMax > 0) {
            totalBox.classList.add('completed');
            // trigger a single 'all exercises complete' celebration once (only for perfect score)
            if (!totalCelebrated) {
                totalCelebrated = true;
                triggerConfetti({ type: 'all' });
            }
        } else {
            totalBox.classList.remove('completed');
            totalCelebrated = false;
        }
        // Show final score summary when all exercises are answered (regardless of score)
        if (allAnswered && totalMax > 0 && !scoreModalShown) {
            showScoreModal('complete');
        }
    }
}

function tokenizeCode(code) {
    /**
     * Tokenize code into meaningful tokens:
     * - Keywords/identifiers (sequences of word characters: a-z, A-Z, 0-9, _)
     * - Numbers (including decimals and scientific notation)
     * - String literals (single or double quoted)
     * - Operators and punctuation
     * - Whitespace is preserved but NOT included in tokens array
     * 
     * Returns: array of { text, type } where type is 'code' (selectable) or 'whitespace' (not selectable)
     */
    const tokens = [];
    let i = 0;
    const len = code.length;

    while (i < len) {
        const char = code[i];
        
        // Whitespace (spaces, tabs, newlines) - preserved but not selectable
        if (/\s/.test(char)) {
            let whitespace = '';
            while (i < len && /\s/.test(code[i])) {
                whitespace += code[i];
                i++;
            }
            tokens.push({ text: whitespace, type: 'whitespace' });
            continue;
        }
        
        // String literals (double quotes)
        if (char === '"') {
            let str = '"';
            i++;
            while (i < len && code[i] !== '"') {
                if (code[i] === '\\') {
                    str += code[i] + (i + 1 < len ? code[i + 1] : '');
                    i += 2;
                } else {
                    str += code[i];
                    i++;
                }
            }
            if (i < len) str += code[i++];
            tokens.push({ text: str, type: 'code' });
            continue;
        }
        
        // String literals (single quotes / character literals)
        if (char === "'") {
            let str = "'";
            i++;
            while (i < len && code[i] !== "'") {
                if (code[i] === '\\') {
                    str += code[i] + (i + 1 < len ? code[i + 1] : '');
                    i += 2;
                } else {
                    str += code[i];
                    i++;
                }
            }
            if (i < len) str += code[i++];
            tokens.push({ text: str, type: 'code' });
            continue;
        }
        
        // Numbers (including decimals)
        if (/\d/.test(char)) {
            let num = '';
            while (i < len && /[\d.]/.test(code[i])) {
                num += code[i];
                i++;
            }
            // Handle scientific notation (e.g., 1e-5)
            if (i < len && /[eE]/.test(code[i])) {
                num += code[i++];
                if (i < len && /[+-]/.test(code[i])) {
                    num += code[i++];
                }
                while (i < len && /\d/.test(code[i])) {
                    num += code[i++];
                }
            }
            tokens.push({ text: num, type: 'code' });
            continue;
        }
        
        // Identifiers and keywords (word characters)
        if (/[a-zA-Z_$]/.test(char)) {
            let ident = '';
            while (i < len && /[a-zA-Z0-9_$]/.test(code[i])) {
                ident += code[i];
                i++;
            }
            tokens.push({ text: ident, type: 'code' });
            continue;
        }
        
        // Multi-character operators
        if (i + 1 < len) {
            const twoChar = code.substr(i, 2);
            if (['==', '!=', '<=', '>=', '&&', '||', '++', '--', '<<', '>>', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>='].includes(twoChar)) {
                tokens.push({ text: twoChar, type: 'code' });
                i += 2;
                continue;
            }
        }
        
        // Single character operators and punctuation
        tokens.push({ text: char, type: 'code' });
        i++;
    }

    return tokens;
}

function tokenizeExerciseCode(raw) {
    /**
     * Replace each [[...]] span with a private-use placeholder before normal
     * tokenization. This keeps the surrounding lexical context intact (including
     * markers inside string literals), while allowing every marked span to be
     * restored as one authoritative selectable bug token afterward.
     */
    const markerByPlaceholder = new Map();
    let placeholderCode = 0xE000;
    let cursor = 0;
    let preparedCode = '';

    while (cursor < raw.length) {
        const markerStart = raw.indexOf('[[', cursor);
        const unexpectedEnd = raw.indexOf(']]', cursor);

        if (unexpectedEnd !== -1 && (markerStart === -1 || unexpectedEnd < markerStart)) {
            throw new Error(`Unexpected bug marker closing delimiter at character ${unexpectedEnd}.`);
        }

        if (markerStart === -1) {
            preparedCode += raw.slice(cursor);
            break;
        }

        preparedCode += raw.slice(cursor, markerStart);
        const markerEnd = raw.indexOf(']]', markerStart + 2);
        if (markerEnd === -1) {
            throw new Error(`Unclosed bug marker at character ${markerStart}.`);
        }

        const markerText = raw.slice(markerStart + 2, markerEnd);
        if (markerText.length === 0) {
            throw new Error(`Empty bug marker at character ${markerStart}.`);
        }

        while (placeholderCode <= 0xF8FF && raw.includes(String.fromCharCode(placeholderCode))) {
            placeholderCode++;
        }
        if (placeholderCode > 0xF8FF) {
            throw new Error('Exercise contains too many reserved marker characters.');
        }

        const placeholder = String.fromCharCode(placeholderCode++);
        markerByPlaceholder.set(placeholder, markerText);
        preparedCode += placeholder;
        cursor = markerEnd + 2;
    }

    const preparedTokens = tokenizeCode(preparedCode);
    const tokens = [];

    preparedTokens.forEach(token => {
        let fragmentStart = 0;

        for (let i = 0; i < token.text.length; i++) {
            const markerText = markerByPlaceholder.get(token.text[i]);
            if (markerText === undefined) continue;

            if (i > fragmentStart) {
                tokens.push({
                    text: token.text.slice(fragmentStart, i),
                    type: token.type,
                    isWrong: false
                });
            }

            tokens.push({ text: markerText, type: 'code', isWrong: true });
            fragmentStart = i + 1;
        }

        if (fragmentStart < token.text.length) {
            tokens.push({
                text: token.text.slice(fragmentStart),
                type: token.type,
                isWrong: false
            });
        }
    });

    return tokens;
}

function parseExerciseCode(raw) {
    /**
     * Parse exercise code with bugs marked as [[...]]. Marker positions are
     * preserved, so repeated or composite token text cannot shift the key.
     */
    const tokens = tokenizeExerciseCode(raw);
    const answers = [];
    const userProgress = [];

    tokens.forEach(token => {
        if (token.type !== 'code') return;
        answers.push({ token: token.text, isWrong: token.isWrong });
        userProgress.push(false);
    });

    // Build HTML with all tokens selectable and whitespace preserved
    let html = '';
    let tokenIdx = 0;
    
    tokens.forEach(tok => {
        if (tok.type === 'whitespace') {
            // Preserve whitespace but escape HTML
            const escaped = tok.text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
            html += escaped;
        } else {
            // Code token - make it selectable
            const escaped = tok.text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
            html += `<label class="token-option" data-idx="${tokenIdx}"><input type="checkbox" data-idx="${tokenIdx}" onchange="toggleToken(${tokenIdx}, this)">${escaped}</label>`;
            tokenIdx++;
        }
    });

    const wrongCount = answers.filter(answer => answer.isWrong).length;
    return {
        html,
        answers,
        userProgress,
        wrongCount,
        lastScore: 0,
        locked: false,
        lastVerifiedAt: null,
        metrics: createItemMetrics()
    };
}  

// Toggle a checkbox; enforce maximum selections equal to wrongCount and update selected counter
function toggleToken(index, checkbox) {
    if (!exerciseData[currentFile]) return;
    const data = exerciseData[currentFile];
    // Do not allow changing answers when exercise is locked (verified)
    if (data.locked) {
        const fb = document.getElementById('feedback');
        fb.textContent = 'This exercise is locked — click Reset Code to try again.';
        fb.style.color = 'var(--error)';
        setTimeout(() => { fb.textContent = ''; }, 2200);
        checkbox.checked = !!data.userProgress[index];
        return;
    }
    const max = data.wrongCount || 0;
    const currentlySelected = data.userProgress.reduce((s, v) => s + (v ? 1 : 0), 0);

    if (checkbox.checked) {
        if (currentlySelected >= max) {
            // prevent selecting more than allowed
            checkbox.checked = false;
            const fb = document.getElementById('feedback');
            fb.textContent = `Select up to ${max} token${max === 1 ? '' : 's'}.`;
            fb.style.color = 'var(--error)';
            setTimeout(() => { fb.textContent = ''; }, 2200);
            return;
        }
        data.userProgress[index] = true;
        checkbox.parentElement.classList.add('selected');
    } else {
        data.userProgress[index] = false;
        checkbox.parentElement.classList.remove('selected');
        // A retraction is the useful confidence signal. It counts even if the
        // student later selects the same token again.
        data.metrics.answerChanges++;
    }

    // update selected count UI
    const selectedCount = data.userProgress.reduce((s, v) => s + (v ? 1 : 0), 0);
    const selectedEl = document.getElementById('selectedCount');
    if (selectedEl) selectedEl.textContent = selectedCount;

    // disable unchecked boxes when selection limit reached
    const checks = document.querySelectorAll('.token-option input[type="checkbox"]');
    checks.forEach(cb => {
        if (!cb.checked) {
            cb.disabled = (selectedCount >= max);
            cb.parentElement.classList.toggle('disabled', cb.disabled);
        } else {
            cb.disabled = false;
            cb.parentElement.classList.remove('disabled');
        }
    });

    persistExamState();
}

function switchExercise(name, el) {
    const previousFile = currentFile;
    if (previousFile && previousFile !== name) pauseItemTimer(previousFile);
    currentFile = name;
    const data = exerciseData[name];
    if (!data.locked && previousFile !== name) data.metrics.visits++;
    resumeItemTimer(name);
    document.querySelectorAll('.sidebar li').forEach(l => l.classList.remove('active'));
    el.classList.add('active');
    
    document.getElementById('currentFileName').textContent = name;
    const display = document.getElementById('codeDisplay');
    display.innerHTML = exerciseData[name].html;

    // Show max tokens in header
    const max = exerciseData[name].wrongCount || 0;
    const maxEl = document.getElementById('maxTokens');
    const maxLabel = document.getElementById('maxTokensLabel');
    if (maxEl) maxEl.textContent = max;
    if (maxLabel) maxLabel.textContent = max;

    // Restore previous checkbox selections
    const checks = display.querySelectorAll('.token-option input[type="checkbox"]');
    checks.forEach((input, idx) => {
        const data = exerciseData[name];
        const label = input.parentElement;
        input.checked = !!data.userProgress[idx];
        label.classList.toggle('selected', input.checked);
        const showResult = data.locked && !!data.lastVerifiedAt && input.checked;
        label.classList.toggle('correct', showResult && data.answers[idx].isWrong);
        label.classList.toggle('wrong', showResult && !data.answers[idx].isWrong);
    });

    // update selected counter UI
    const selectedCount = exerciseData[name].userProgress.reduce((s, v) => s + (v ? 1 : 0), 0);
    const selectedEl = document.getElementById('selectedCount');
    if (selectedEl) selectedEl.textContent = selectedCount;

    // Enforce disabling if max reached (or lock if exercise is verified)
    checks.forEach(cb => {
        if (!cb.checked) cb.disabled = (selectedCount >= max) || !!exerciseData[name].locked;
        cb.parentElement.classList.toggle('disabled', cb.disabled);
        // If exercise is locked, ensure label looks non-interactive
        if (exerciseData[name].locked) cb.parentElement.classList.add('disabled');
    });

    // Update Verify/Reset button based on lock state
    const verifyBtn = document.getElementById('verifyBtn');
    if (exerciseData[name].locked) {
        if (appMode === 'exam') {
            verifyBtn.textContent = 'Locked';
            verifyBtn.disabled = true;
        } else {
            verifyBtn.textContent = 'Reset Code';
            verifyBtn.disabled = false;
        }
    } else {
        verifyBtn.textContent = 'Verify Code';
        verifyBtn.disabled = false;
    }

    document.getElementById('feedback').textContent = "";
} 

function checkAnswers() {
    const data = exerciseData[currentFile];
    const answers = data.answers;
    let score = 0;

    const inputs = document.querySelectorAll('.token-option input[type="checkbox"]');
    inputs.forEach((input, idx) => {
        const label = input.parentElement;
        // clear previous indicators (wrong/correct)
        label.classList.remove('wrong', 'correct');
        const selected = input.checked;
        const isWrong = answers[idx].isWrong;

        // mark incorrectly selected tokens (selected but not actually wrong)
        if (selected && !isWrong) label.classList.add('wrong');
        // mark selected tokens that are correctly identified as wrong with a strong visual
        if (selected && isWrong) {
            label.classList.add('correct');
            score++;
        }
    });

    // Freeze the hidden engagement metrics at the moment of submission.
    pauseItemTimer(currentFile);

    // store last score and lock
    data.lastScore = score;
    data.locked = true;
    data.lastVerifiedAt = new Date().toISOString();
    updateSidebarScore(currentFile);
    persistExamState();

    // disable all inputs for this exercise
    const checks = document.querySelectorAll('.token-option input[type="checkbox"]');
    checks.forEach(cb => {
        cb.disabled = true;
        cb.parentElement.classList.add('disabled');
    });

    // switch Verify -> Reset
    const verifyBtn = document.getElementById('verifyBtn');
    if (verifyBtn) {
        if (appMode === 'exam') {
            verifyBtn.textContent = 'Locked';
            verifyBtn.disabled = true;
        } else {
            verifyBtn.textContent = 'Reset Code';
            verifyBtn.disabled = false;
        }
    }

    // Update total accumulated score
    updateTotalScore();

    const msg = document.getElementById('feedback');
    if (score === data.wrongCount) {
        msg.textContent = "✨ Perfect! Activity Complete! ✨";
        msg.style.color = "var(--secondary)";
        // smaller celebratory burst for a single exercise
        triggerConfetti({ type: 'exercise' });
    } else {
        msg.textContent = `Progress: ${score}/${data.wrongCount} correct.`;
        msg.style.color = "var(--text-main)";
    }
} 

function triggerConfetti(options = {}) {
    // options: { type: 'exercise' | 'all', colors?: [], particleCount?: number }
    const type = options.type || 'exercise';

    if (type === 'exercise') {
        confetti({
            particleCount: options.particleCount || 80,
            spread: options.spread || 60,
            origin: options.origin || { y: 0.6 },
            colors: options.colors || ['#03dac6', '#ffca28']
        });
        // small follow-up burst
        setTimeout(() => {
            confetti({
                particleCount: 40,
                spread: 40,
                origin: { y: 0.7 },
                colors: ['#6200ee']
            });
        }, 250);
    } else if (type === 'all') {
        // Big multi-burst celebration for completing all exercises
        const bigBurst = (pCount, spread, delay, col) => setTimeout(() => confetti({ particleCount: pCount, spread, origin: { y: 0.6 }, colors: col }), delay);
        bigBurst(options.particleCount || 500, options.spread || 140, 0, options.colors || ['#6200ee', '#03dac6', '#ffca28']);
        bigBurst(300, 120, 400, ['#ffca28', '#03dac6']);
        bigBurst(200, 100, 800, ['#6200ee']);
    } else {
        // fallback to default small burst
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
}

function exportProgress() {
    let csv = "Student,Exercise,Max Score,Score,Verified At\n";
    for (const file in exerciseData) {
        const d = exerciseData[file];
        const tmax = d.wrongCount || 0;
        const score = d.lastScore || 0; // lastScore is set on verify, 0 if not verified
        const when = d.lastVerifiedAt || '';
        csv += `${currentUser},${file},${tmax},${score},${when}\n`;
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentUser}_results.csv`;
    a.click();
}

// Unified score summary and encrypted QR sharing, adapted from CodeScope-v2.
const QR_SHARED_PASSPHRASE = 'AA-9002341ds2sd14-dsfs12sd-54231hg';
const QR_SALT_STRING = 'java-activity-qr-salt-v1';
const QR_RESULTS_VIEWER_URL = 'https://mratamayo-tsatinc.github.io/qr/it5b-w4.html';

let scoreModalClockInterval = null;
let scoreSummaryDownloadInProgress = false;
let scoreQrGeneration = 0;

function computeSessionScore() {
    return Object.values(exerciseData).reduce((score, data) => {
        score.earned += data.lastScore || 0;
        score.maximum += data.wrongCount || 0;
        return score;
    }, { earned: 0, maximum: 0 });
}

function formatScoreTimestamp(date) {
    const dayDate = date.toLocaleDateString(undefined, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const time = date.toLocaleTimeString(undefined, {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    return `${dayDate}  ·  ${time}`;
}

function formatMetricDuration(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function tickScoreModalClock() {
    const clock = document.getElementById('scoreSummaryClock');
    if (clock) clock.textContent = formatScoreTimestamp(new Date());
}

function renderScoreSummaryContent() {
    const score = computeSessionScore();
    const earned = document.getElementById('scoreSummaryEarned');
    const maximum = document.getElementById('scoreSummaryMaximum');
    const total = document.getElementById('scoreSummaryTotal');
    const user = document.getElementById('scoreSummaryUser');
    const breakdown = document.getElementById('scoreBreakdown');

    if (earned) earned.textContent = score.earned;
    if (maximum) maximum.textContent = score.maximum;
    if (total) total.setAttribute('aria-label', `${score.earned} out of ${score.maximum} points`);
    if (user) user.textContent = currentUser || '—';
    tickScoreModalClock();

    if (!breakdown) return;
    breakdown.textContent = '';

    for (const fileName of EXERCISES) {
        const data = exerciseData[fileName];
        if (!data) continue;

        const row = document.createElement('div');
        row.className = 'score-summary-exercise-row';

        const name = document.createElement('span');
        name.className = 'sse-name';
        name.textContent = fileName.replace(/\.c$/i, '');

        const value = document.createElement('span');
        value.className = 'sse-value';
        const selectedCount = data.userProgress.filter(Boolean).length;
        if (data.lastVerifiedAt) {
            const percent = data.wrongCount > 0 ? Math.round((data.lastScore / data.wrongCount) * 100) : 0;
            value.textContent = `${data.lastScore} / ${data.wrongCount} · ${percent}%`;
        } else if (data.locked) {
            value.textContent = `0 / ${data.wrongCount} · Not submitted`;
        } else if (selectedCount > 0) {
            value.textContent = `0 / ${data.wrongCount} · In progress`;
        } else {
            value.textContent = `0 / ${data.wrongCount} · Not started`;
        }

        const details = document.createElement('span');
        details.className = 'sse-metrics';
        details.textContent = `Time ${formatMetricDuration(getItemActiveTimeMs(data))} · Answer changes ${data.metrics.answerChanges} · Visits ${data.metrics.visits}`;

        const result = document.createElement('span');
        result.className = 'sse-result';
        result.append(value, details);

        row.append(name, result);
        breakdown.appendChild(row);
    }
}

function openScoreModal() {
    showScoreModal('manual');
}

// reason: 'manual' | 'complete' | 'time'
function showScoreModal(reason = 'manual') {
    const automatic = reason === 'complete' || reason === 'time';
    if (automatic && scoreModalShown) return;
    if (automatic) scoreModalShown = true;

    const modal = document.getElementById('scoreModal');
    if (!modal) return;
    scoreModalPausedItem = !exerciseData[currentFile]?.locked ? currentFile : null;
    pauseItemTimer(scoreModalPausedItem);
    persistExamState();
    modal.classList.toggle('score-summary-exam', appMode === 'exam');
    modal.style.display = 'flex';

    const status = document.getElementById('scoreSummaryDownloadStatus');
    if (status) status.textContent = '';
    renderScoreSummaryContent();

    if (scoreModalClockInterval !== null) clearInterval(scoreModalClockInterval);
    scoreModalClockInterval = setInterval(tickScoreModalClock, 1000);
    renderScoreSummaryQr();
}

function closeScoreModal() {
    if (scoreSummaryDownloadInProgress) return;
    const modal = document.getElementById('scoreModal');
    if (modal) modal.style.display = 'none';
    if (scoreModalClockInterval !== null) {
        clearInterval(scoreModalClockInterval);
        scoreModalClockInterval = null;
    }
    const pausedItem = scoreModalPausedItem;
    scoreModalPausedItem = null;
    if (pausedItem === currentFile) resumeItemTimer(currentFile);
}

function handleScoreModalBackdrop(event) {
    if (event.target === event.currentTarget) closeScoreModal();
}

async function deriveQrKey() {
    if (!window.crypto?.subtle) throw new Error('Secure QR encryption is unavailable in this browser.');
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw', encoder.encode(QR_SHARED_PASSPHRASE), { name: 'PBKDF2' }, false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: encoder.encode(QR_SALT_STRING), iterations: 100000, hash: 'SHA-256' },
        keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
    );
}

function bufferToBase64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function encryptQrPayload(payload) {
    const key = await deriveQrKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return bufferToBase64Url(combined);
}

function getCleanSourceUrl() {
    return window.location.href.split(/[?#]/)[0].replace(/^https?:\/\//i, '');
}

async function buildResultsShareUrl(score, maximum) {
    const token = await encryptQrPayload({
        e: currentUser,
        t: Math.floor(Date.now() / 1000),
        s: score,
        m: maximum
    });
    const url = new URL(QR_RESULTS_VIEWER_URL);
    url.searchParams.set('d', token);
    url.searchParams.set('a', getCleanSourceUrl());
    url.searchParams.set('n', document.title);
    return url.toString();
}

function renderQrInto(box, shareUrl, size) {
    box.innerHTML = '';
    new QRCode(box, {
        text: shareUrl,
        width: size,
        height: size,
        colorDark: '#1a1a1a',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.L
    });
}

async function renderScoreSummaryQr() {
    const box = document.getElementById('scoreQrCodeBox');
    if (!box || !currentUser) return;
    const generation = ++scoreQrGeneration;
    box.innerHTML = '<span class="qr-loading">Preparing QR…</span>';

    try {
        if (typeof QRCode === 'undefined') throw new Error('The QR code component is unavailable.');
        const score = computeSessionScore();
        const shareUrl = await buildResultsShareUrl(score.earned, score.maximum);
        if (generation !== scoreQrGeneration) return;
        renderQrInto(box, shareUrl, 190);
    } catch (error) {
        console.error('Score QR generation failed:', error);
        if (generation === scoreQrGeneration) {
            box.innerHTML = '<span class="qr-loading">QR code unavailable</span>';
        }
    }
}

function scoreSummaryPngFilename(date) {
    const pad = value => String(value).padStart(2, '0');
    const timestamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
    return `bug-catcher-session-${timestamp}.png`;
}

function scoreSummaryCanvasBlob(canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG creation returned no image data.')), 'image/png');
    });
}

async function downloadScoreSummaryPng() {
    if (scoreSummaryDownloadInProgress) return;
    const modal = document.getElementById('scoreModal');
    const capture = modal?.querySelector('.score-card');
    const button = document.getElementById('scoreSummaryDownloadBtn');
    const buttonLabel = button?.querySelector('span');
    const status = document.getElementById('scoreSummaryDownloadStatus');
    if (!capture) return;

    scoreSummaryDownloadInProgress = true;
    if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
    if (buttonLabel) buttonLabel.textContent = 'Preparing…';
    if (status) status.textContent = 'Preparing PNG…';

    try {
        if (typeof html2canvas !== 'function') throw new Error('The PNG export component is unavailable.');
        renderScoreSummaryContent();
        await renderScoreSummaryQr();
        if (document.fonts?.ready) await document.fonts.ready;

        const canvas = await html2canvas(capture, {
            backgroundColor: appMode === 'exam' ? '#103d6b' : '#ffffff',
            scale: 2,
            useCORS: true,
            logging: false,
            onclone: clonedDocument => {
                clonedDocument.querySelector('#scoreModal .score-card')?.classList.add('score-summary-exporting');
            }
        });
        const blob = await scoreSummaryCanvasBlob(canvas);
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = scoreSummaryPngFilename(new Date());
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
        if (status) status.textContent = 'PNG downloaded.';
    } catch (error) {
        console.error('Score summary PNG export failed:', error);
        if (status) status.textContent = 'Could not download PNG. Please try again.';
    } finally {
        scoreSummaryDownloadInProgress = false;
        if (button) { button.disabled = false; button.removeAttribute('aria-busy'); }
        if (buttonLabel) buttonLabel.textContent = 'Download PNG';
    }
}

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.getElementById('scoreModal')?.style.display === 'flex') {
        closeScoreModal();
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        pauseItemTimer();
        persistExamState();
    } else {
        resumeItemTimer();
    }
});

window.addEventListener('pagehide', () => {
    pauseItemTimer();
    persistExamState();
});
