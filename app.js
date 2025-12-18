// HIT Coach Pro Web App - Matching iOS Native App
// Version 1.0.0

// ===== WORKOUT DATA =====
const WORKOUTS = {
    A: [
        { name: 'Leg Press', icon: 'leg-press' },
        { name: 'Pulldown', icon: 'pulldown' },
        { name: 'Chest Press', icon: 'chest-press' },
        { name: 'Overhead Press', icon: 'overhead-press' },
        { name: 'Leg Curl', icon: 'leg-curl' },
        { name: 'Bicep Curl', icon: 'bicep-curl' },
        { name: 'Tricep Extension', icon: 'tricep-extension' },
        { name: 'Calf Raise', icon: 'calf-raise' }
    ],
    B: [
        { name: 'Leg Extension', icon: 'leg-extension' },
        { name: 'Seated Row', icon: 'seated-row' },
        { name: 'Incline Press', icon: 'incline-press' },
        { name: 'Lateral Raise', icon: 'lateral-raise' },
        { name: 'Leg Curl', icon: 'leg-curl' },
        { name: 'Shrug', icon: 'shrug' },
        { name: 'Ab Crunch', icon: 'ab-crunch' },
        { name: 'Back Extension', icon: 'back-extension' }
    ]
};

// ===== PHASE CONFIGURATION =====
const DEFAULT_PHASE_SETTINGS = {
    prep: 10,
    positioning: 5,
    eccentric: 30,
    concentric: 20,
    finalEccentric: 40,
    rest: 90
};

const PHASES = ['prep', 'positioning', 'eccentric', 'concentric', 'finalEccentric', 'complete'];

const PHASE_LABELS = {
    prep: 'Get Ready',
    positioning: 'Get Into Position',
    eccentric: 'Eccentric',
    concentric: 'Concentric',
    finalEccentric: 'Final Eccentric',
    complete: 'Complete',
    rest: 'Rest'
};

// ===== STATE =====
let state = {
    currentProfile: 1,
    currentWorkoutType: 'A',
    currentExerciseIndex: 0,
    currentPhase: 'prep',
    timeRemaining: 10,
    isTimerRunning: false,
    isPaused: false,
    completedExercises: [],
    currentWeight: 0,
    reachedFailure: true,
    voiceStyle: 'commander',
    phaseSettings: { ...DEFAULT_PHASE_SETTINGS }
};

let timerInterval = null;
let restTimerInterval = null;
let synth = window.speechSynthesis;

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    loadState();
    loadPhaseSettings();
    loadVoiceSettings();
    renderExerciseList();
    updateProgressDisplay();
    updateStatusTime();
    setInterval(updateStatusTime, 60000);

    // Load voices when available
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = () => {
            speechSynthesis.getVoices();
        };
    }
});

// ===== PROFILE MANAGEMENT =====
function selectProfile(profile) {
    if (profile !== 1 && profile !== 2) return;

    // Save current profile state before switching
    saveState();

    state.currentProfile = profile;

    // Update UI
    document.getElementById('profile1Btn').classList.toggle('active', profile === 1);
    document.getElementById('profile2Btn').classList.toggle('active', profile === 2);

    // Load new profile state
    loadState();
    renderExerciseList();
    updateProgressDisplay();

    // Save profile selection
    localStorage.setItem('hitcoach_currentProfile', profile.toString());
}

function showProfileModal() {
    // For now, just toggle between profiles
    selectProfile(state.currentProfile === 1 ? 2 : 1);
}

// ===== WORKOUT TYPE SELECTION =====
function selectWorkoutType(type) {
    if (type !== 'A' && type !== 'B') return;

    state.currentWorkoutType = type;
    state.currentExerciseIndex = 0;

    // Update UI
    document.getElementById('workoutABtn').classList.toggle('active', type === 'A');
    document.getElementById('workoutBBtn').classList.toggle('active', type === 'B');

    // Load completion state for this workout
    loadCompletionState();
    renderExerciseList();
    updateProgressDisplay();

    // Save selection
    saveWorkoutTypeSelection();
}

// ===== EXERCISE LIST RENDERING =====
function renderExerciseList() {
    const exercises = WORKOUTS[state.currentWorkoutType];
    const container = document.getElementById('exerciseList');

    container.innerHTML = exercises.map((exercise, index) => {
        const isCompleted = state.completedExercises.includes(exercise.name);
        const lastWeight = getLastWeight(exercise.name);

        return `
            <div class="exercise-card ${isCompleted ? 'completed' : ''}" onclick="editExercise(${index})">
                <div class="exercise-icon">
                    ${getExerciseIcon(exercise.name)}
                </div>
                <div class="exercise-info">
                    <h3 class="exercise-name">${exercise.name}</h3>
                    <p class="exercise-weight">
                        ${lastWeight ? `${lastWeight} lbs` : 'Tap to log weight'}
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 18l6-6-6-6"/>
                        </svg>
                    </p>
                </div>
                ${isCompleted ? `
                    <div class="completed-check">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="#22c55e">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M7 12l3 3 7-7" stroke="#000" stroke-width="2" fill="none"/>
                        </svg>
                    </div>
                ` : ''}
                <button class="start-btn" onclick="event.stopPropagation(); startExercise(${index})">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                        <polygon points="5,3 19,12 5,21"/>
                    </svg>
                </button>
            </div>
        `;
    }).join('');
}

function getExerciseIcon(name) {
    // Simple dumbbell icon for all exercises
    return `
        <svg viewBox="0 0 48 48" width="48" height="48">
            <rect x="4" y="18" width="8" height="12" rx="2" fill="#FFD700"/>
            <rect x="36" y="18" width="8" height="12" rx="2" fill="#FFD700"/>
            <rect x="10" y="16" width="4" height="16" rx="1" fill="#FFD700"/>
            <rect x="34" y="16" width="4" height="16" rx="1" fill="#FFD700"/>
            <rect x="14" y="22" width="20" height="4" rx="1" fill="#FFD700"/>
        </svg>
    `;
}

// ===== EXERCISE MANAGEMENT =====
function startExercise(index) {
    const exercises = WORKOUTS[state.currentWorkoutType];
    state.currentExerciseIndex = index;
    const exercise = exercises[index];

    // Load last weight for this exercise
    const lastWeight = getLastWeight(exercise.name);
    state.currentWeight = lastWeight || 0;
    state.reachedFailure = true; // Default to checked like iOS

    // Initialize timer state
    state.currentPhase = 'prep';
    state.timeRemaining = state.phaseSettings.prep;
    state.isTimerRunning = false;
    state.isPaused = false;

    // Update UI
    document.getElementById('timerExerciseName').textContent = exercise.name;
    document.getElementById('timerDisplay').textContent = state.timeRemaining;
    document.getElementById('phaseLabel').textContent = PHASE_LABELS.prep;

    // Reset phase indicators
    updatePhaseIndicators();

    // Show timer screen
    showScreen('timerScreen');

    // Show timer controls, hide complete section
    document.getElementById('timerControls').style.display = 'flex';
    document.getElementById('completeSection').style.display = 'none';

    // Update play/pause icons
    document.getElementById('playIcon').style.display = 'block';
    document.getElementById('pauseIcon').style.display = 'none';

    // Speak exercise name
    speak(exercise.name);
}

function editExercise(index) {
    // Just start the exercise for now - could add a detail modal later
    startExercise(index);
}

// ===== TIMER FUNCTIONS =====
function toggleTimer() {
    if (state.isTimerRunning) {
        pauseTimer();
    } else {
        resumeTimer();
    }
}

function pauseTimer() {
    state.isTimerRunning = false;
    state.isPaused = true;
    clearInterval(timerInterval);

    document.getElementById('playIcon').style.display = 'block';
    document.getElementById('pauseIcon').style.display = 'none';
}

function resumeTimer() {
    state.isTimerRunning = true;
    state.isPaused = false;

    document.getElementById('playIcon').style.display = 'none';
    document.getElementById('pauseIcon').style.display = 'block';

    // Announce phase when starting
    if (state.currentPhase !== 'complete') {
        speak(PHASE_LABELS[state.currentPhase]);
    }

    runTimer();
}

function runTimer() {
    clearInterval(timerInterval);

    timerInterval = setInterval(() => {
        if (!state.isTimerRunning) return;

        state.timeRemaining--;
        document.getElementById('timerDisplay').textContent = Math.max(0, state.timeRemaining);

        // Countdown announcements
        if (state.timeRemaining <= 5 && state.timeRemaining > 0) {
            speak(state.timeRemaining.toString());
        }

        // Phase complete
        if (state.timeRemaining <= 0) {
            clearInterval(timerInterval);
            advancePhase();
        }
    }, 1000);
}

function advancePhase() {
    const currentIndex = PHASES.indexOf(state.currentPhase);

    if (currentIndex < PHASES.length - 1) {
        state.currentPhase = PHASES[currentIndex + 1];

        if (state.currentPhase === 'complete') {
            completeExerciseTimer();
        } else {
            // Get duration for next phase
            state.timeRemaining = state.phaseSettings[state.currentPhase];
            document.getElementById('timerDisplay').textContent = state.timeRemaining;
            document.getElementById('phaseLabel').textContent = PHASE_LABELS[state.currentPhase];
            updatePhaseIndicators();

            // Announce phase
            speak(PHASE_LABELS[state.currentPhase]);

            runTimer();
        }
    }
}

function skipPhase() {
    clearInterval(timerInterval);
    advancePhase();
}

function resetPhase() {
    pauseTimer();
    state.timeRemaining = state.phaseSettings[state.currentPhase] || 10;
    document.getElementById('timerDisplay').textContent = state.timeRemaining;
}

function stopTimer() {
    clearInterval(timerInterval);
    clearInterval(restTimerInterval);
    state.isTimerRunning = false;
    state.isPaused = false;

    showScreen('workoutListScreen');
}

function completeExerciseTimer() {
    state.isTimerRunning = false;
    clearInterval(timerInterval);

    // Speak completion
    speak('Complete! Great work!');

    // Update display
    document.getElementById('timerDisplay').textContent = '0';
    document.getElementById('phaseLabel').textContent = 'Complete';
    updatePhaseIndicators();

    // Load last weight
    const exercise = WORKOUTS[state.currentWorkoutType][state.currentExerciseIndex];
    const lastWeight = getLastWeight(exercise.name);
    state.currentWeight = lastWeight || 0;
    document.getElementById('weightValue').textContent = Math.floor(state.currentWeight);

    // Update failure toggle display
    updateFailureToggle();

    // Hide timer controls, show complete section
    document.getElementById('timerControls').style.display = 'none';
    document.getElementById('completeSection').style.display = 'block';
}

function updatePhaseIndicators() {
    const dotE = document.getElementById('phaseDotE');
    const dotC = document.getElementById('phaseDotC');
    const dotF = document.getElementById('phaseDotF');

    // Reset all
    [dotE, dotC, dotF].forEach(dot => {
        dot.classList.remove('active', 'past');
    });

    const phase = state.currentPhase;

    if (phase === 'eccentric') {
        dotE.classList.add('active');
    } else if (phase === 'concentric') {
        dotE.classList.add('past');
        dotC.classList.add('active');
    } else if (phase === 'finalEccentric') {
        dotE.classList.add('past');
        dotC.classList.add('past');
        dotF.classList.add('active');
    } else if (phase === 'complete') {
        dotE.classList.add('past');
        dotC.classList.add('past');
        dotF.classList.add('past');
    }

    // Update timer display color based on phase
    const timerDisplay = document.getElementById('timerDisplay');
    timerDisplay.className = 'timer-display';

    if (phase === 'eccentric') {
        timerDisplay.classList.add('phase-eccentric');
    } else if (phase === 'concentric') {
        timerDisplay.classList.add('phase-concentric');
    } else if (phase === 'finalEccentric') {
        timerDisplay.classList.add('phase-final');
    } else if (phase === 'complete') {
        timerDisplay.classList.add('phase-complete');
    }
}

// ===== WEIGHT TRACKING =====
function adjustWeight(amount) {
    state.currentWeight = Math.max(0, state.currentWeight + amount);
    document.getElementById('weightValue').textContent =
        state.currentWeight % 1 === 0 ? state.currentWeight : state.currentWeight.toFixed(1);
}

function toggleFailure() {
    state.reachedFailure = !state.reachedFailure;
    updateFailureToggle();
}

function updateFailureToggle() {
    const checked = document.getElementById('failureChecked');
    const unchecked = document.getElementById('failureUnchecked');

    if (state.reachedFailure) {
        checked.style.display = 'block';
        unchecked.style.display = 'none';
    } else {
        checked.style.display = 'none';
        unchecked.style.display = 'block';
    }
}

// ===== LOG SET FUNCTIONS =====
function logSetAndDone() {
    logSet();
    stopTimer();
}

function logAndStartRest() {
    logSet();
    startRest();
}

function logAndAnotherSet() {
    logSet();
    // Restart same exercise
    startExercise(state.currentExerciseIndex);
}

function logSet() {
    const exercise = WORKOUTS[state.currentWorkoutType][state.currentExerciseIndex];

    // Save weight
    saveExerciseWeight(exercise.name, state.currentWeight, state.reachedFailure);

    // Mark as completed
    if (!state.completedExercises.includes(exercise.name)) {
        state.completedExercises.push(exercise.name);
    }

    // Save to history
    addToHistory({
        exerciseName: exercise.name,
        workoutType: state.currentWorkoutType,
        weight: state.currentWeight,
        reachedFailure: state.reachedFailure,
        profile: state.currentProfile,
        date: new Date().toISOString()
    });

    // Save completion state
    saveCompletionState();

    // Update UI
    updateProgressDisplay();
    renderExerciseList();
}

// ===== REST TIMER =====
function startRest() {
    const exercises = WORKOUTS[state.currentWorkoutType];
    const nextIndex = state.currentExerciseIndex + 1;

    if (nextIndex >= exercises.length) {
        // Workout complete
        stopTimer();
        return;
    }

    // Show next exercise name
    document.getElementById('nextExerciseName').textContent = exercises[nextIndex].name;

    // Initialize rest timer
    let restTime = state.phaseSettings.rest;
    document.getElementById('restTimerDisplay').textContent = restTime;

    showScreen('restScreen');

    speak(`Rest. Next exercise: ${exercises[nextIndex].name}`);

    clearInterval(restTimerInterval);
    restTimerInterval = setInterval(() => {
        restTime--;
        document.getElementById('restTimerDisplay').textContent = restTime;

        if (restTime === 5) {
            speak('5 seconds');
        }

        if (restTime <= 0) {
            clearInterval(restTimerInterval);
            startExercise(nextIndex);
        }
    }, 1000);
}

function skipRest() {
    clearInterval(restTimerInterval);
    const nextIndex = state.currentExerciseIndex + 1;
    const exercises = WORKOUTS[state.currentWorkoutType];

    if (nextIndex < exercises.length) {
        startExercise(nextIndex);
    } else {
        stopTimer();
    }
}

// ===== WORKOUT MANAGEMENT =====
function finishWorkout() {
    // Clear completion checkmarks but keep weights
    state.completedExercises = [];
    saveCompletionState();
    updateProgressDisplay();
    renderExerciseList();

    speak('Workout complete!');
}

function resetWorkout() {
    if (!confirm('Reset all weights and completion status for this workout?')) {
        return;
    }

    const exercises = WORKOUTS[state.currentWorkoutType];

    // Clear weights for this workout
    exercises.forEach(exercise => {
        const key = `hitcoach_weight_${state.currentProfile}_${exercise.name}`;
        localStorage.removeItem(key);
    });

    // Clear completion state
    state.completedExercises = [];
    saveCompletionState();

    updateProgressDisplay();
    renderExerciseList();
}

function updateProgressDisplay() {
    const exercises = WORKOUTS[state.currentWorkoutType];
    const completed = state.completedExercises.length;
    const total = exercises.length;

    document.getElementById('completedCount').textContent = `${completed}/${total} Completed`;

    // Show/hide finish button
    const finishBtn = document.getElementById('finishWorkoutBtn');
    if (completed > 0) {
        finishBtn.style.display = 'flex';
    } else {
        finishBtn.style.display = 'none';
    }
}

// ===== HISTORY =====
function addToHistory(entry) {
    const key = `hitcoach_history_${state.currentProfile}`;
    const history = JSON.parse(localStorage.getItem(key) || '[]');
    history.unshift(entry);
    localStorage.setItem(key, JSON.stringify(history));
}

function getHistory() {
    const key = `hitcoach_history_${state.currentProfile}`;
    return JSON.parse(localStorage.getItem(key) || '[]');
}

function showHistoryScreen() {
    loadHistoryDisplay();
    showScreen('historyScreen');
}

function loadHistoryDisplay() {
    const history = getHistory();
    const container = document.getElementById('historyList');
    const emptyState = document.getElementById('emptyHistory');

    // Calculate stats
    const today = new Date().toDateString();
    const todaySets = history.filter(h => new Date(h.date).toDateString() === today).length;
    const totalSets = history.length;

    document.getElementById('todaySets').textContent = todaySets;
    document.getElementById('totalSets').textContent = totalSets;

    if (history.length === 0) {
        emptyState.style.display = 'flex';
        return;
    }

    emptyState.style.display = 'none';

    // Group by date
    const grouped = {};
    history.forEach(entry => {
        const dateKey = new Date(entry.date).toDateString();
        if (!grouped[dateKey]) {
            grouped[dateKey] = [];
        }
        grouped[dateKey].push(entry);
    });

    // Render
    let html = '';
    Object.keys(grouped).forEach(dateKey => {
        const entries = grouped[dateKey];
        const isToday = dateKey === today;
        const isYesterday = dateKey === new Date(Date.now() - 86400000).toDateString();

        let dateLabel = dateKey;
        if (isToday) dateLabel = 'Today';
        else if (isYesterday) dateLabel = 'Yesterday';

        html += `<div class="history-section">
            <h4 class="history-date">${dateLabel}</h4>
            ${entries.map(entry => `
                <div class="history-entry">
                    <div class="history-left">
                        <span class="history-name">${entry.exerciseName}</span>
                        <span class="history-type">(${entry.workoutType})</span>
                        <span class="history-time">${formatTime(entry.date)}</span>
                    </div>
                    <div class="history-right">
                        <span class="history-weight">${entry.weight} lbs</span>
                        ${entry.reachedFailure ? '<span class="history-failure">Failure</span>' : ''}
                    </div>
                </div>
            `).join('')}
        </div>`;
    });

    container.innerHTML = html;
}

function formatTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ===== SETTINGS =====
function showSettingsScreen() {
    loadPhaseSettingsDisplay();
    loadVoiceSettingsDisplay();
    showScreen('settingsScreen');
}

function loadPhaseSettingsDisplay() {
    document.getElementById('prepValue').textContent = state.phaseSettings.prep;
    document.getElementById('positioningValue').textContent = state.phaseSettings.positioning;
    document.getElementById('eccentricValue').textContent = state.phaseSettings.eccentric;
    document.getElementById('concentricValue').textContent = state.phaseSettings.concentric;
    document.getElementById('finalEccentricValue').textContent = state.phaseSettings.finalEccentric;
    document.getElementById('restValue').textContent = state.phaseSettings.rest;
}

function adjustPhaseSetting(phase, amount) {
    const limits = {
        prep: { min: 0, max: 30 },
        positioning: { min: 0, max: 15 },
        eccentric: { min: 10, max: 60 },
        concentric: { min: 10, max: 60 },
        finalEccentric: { min: 20, max: 90 },
        rest: { min: 30, max: 180 }
    };

    const limit = limits[phase];
    state.phaseSettings[phase] = Math.max(limit.min, Math.min(limit.max, state.phaseSettings[phase] + amount));

    document.getElementById(`${phase}Value`).textContent = state.phaseSettings[phase];
    savePhaseSettings();
}

function setVoice(style) {
    state.voiceStyle = style;

    // Update UI
    ['Male', 'Female', 'Digital', 'Commander'].forEach(v => {
        const el = document.getElementById(`voice${v}`);
        if (el) {
            el.classList.toggle('active', v.toLowerCase() === style);
        }
    });

    saveVoiceSettings();
}

function loadVoiceSettingsDisplay() {
    ['Male', 'Female', 'Digital', 'Commander'].forEach(v => {
        const el = document.getElementById(`voice${v}`);
        if (el) {
            el.classList.toggle('active', v.toLowerCase() === state.voiceStyle);
        }
    });
}

// ===== VOICE / SPEECH =====
function speak(text) {
    if (!synth) return;

    try {
        synth.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Set voice based on style
        const voices = synth.getVoices();
        if (voices.length > 0) {
            let preferredVoice = null;

            if (state.voiceStyle === 'female') {
                preferredVoice = voices.find(v => v.name.toLowerCase().includes('samantha') ||
                                                  v.name.toLowerCase().includes('female'));
            } else if (state.voiceStyle === 'male') {
                preferredVoice = voices.find(v => v.name.toLowerCase().includes('daniel') ||
                                                  v.name.toLowerCase().includes('male'));
            }

            if (preferredVoice) {
                utterance.voice = preferredVoice;
            }
        }

        synth.speak(utterance);
    } catch (e) {
        console.warn('Speech synthesis error:', e);
    }
}

// ===== SCREEN NAVIGATION =====
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function showWorkoutList() {
    showScreen('workoutListScreen');
}

function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));

    if (tab === 'workouts') {
        document.getElementById('tabWorkouts').classList.add('active');
        showScreen('workoutListScreen');
    } else if (tab === 'stats') {
        document.getElementById('tabStats').classList.add('active');
        showHistoryScreen();
    } else if (tab === 'log') {
        document.getElementById('tabLog').classList.add('active');
        showHistoryScreen();
    }
}

// ===== PERSISTENCE =====
function saveState() {
    const key = `hitcoach_state_${state.currentProfile}`;
    localStorage.setItem(key, JSON.stringify({
        currentWorkoutType: state.currentWorkoutType,
        completedExercises: state.completedExercises
    }));
}

function loadState() {
    // Load profile
    const savedProfile = localStorage.getItem('hitcoach_currentProfile');
    if (savedProfile) {
        state.currentProfile = parseInt(savedProfile);
    }

    // Update profile buttons
    document.getElementById('profile1Btn').classList.toggle('active', state.currentProfile === 1);
    document.getElementById('profile2Btn').classList.toggle('active', state.currentProfile === 2);

    // Load workout type
    const savedType = localStorage.getItem(`hitcoach_workoutType_${state.currentProfile}`);
    if (savedType) {
        state.currentWorkoutType = savedType;
    }

    // Update workout buttons
    document.getElementById('workoutABtn').classList.toggle('active', state.currentWorkoutType === 'A');
    document.getElementById('workoutBBtn').classList.toggle('active', state.currentWorkoutType === 'B');

    // Load completion state
    loadCompletionState();
}

function saveWorkoutTypeSelection() {
    localStorage.setItem(`hitcoach_workoutType_${state.currentProfile}`, state.currentWorkoutType);
}

function saveCompletionState() {
    const key = `hitcoach_completed_${state.currentProfile}_${state.currentWorkoutType}`;
    localStorage.setItem(key, JSON.stringify(state.completedExercises));
}

function loadCompletionState() {
    const key = `hitcoach_completed_${state.currentProfile}_${state.currentWorkoutType}`;
    const saved = localStorage.getItem(key);
    state.completedExercises = saved ? JSON.parse(saved) : [];
}

function saveExerciseWeight(exerciseName, weight, reachedFailure) {
    const key = `hitcoach_weight_${state.currentProfile}_${exerciseName}`;
    localStorage.setItem(key, JSON.stringify({ weight, reachedFailure }));
}

function getLastWeight(exerciseName) {
    const key = `hitcoach_weight_${state.currentProfile}_${exerciseName}`;
    const saved = localStorage.getItem(key);
    if (saved) {
        const data = JSON.parse(saved);
        return data.weight;
    }
    return null;
}

function savePhaseSettings() {
    localStorage.setItem('hitcoach_phaseSettings', JSON.stringify(state.phaseSettings));
}

function loadPhaseSettings() {
    const saved = localStorage.getItem('hitcoach_phaseSettings');
    if (saved) {
        state.phaseSettings = { ...DEFAULT_PHASE_SETTINGS, ...JSON.parse(saved) };
    }
}

function saveVoiceSettings() {
    localStorage.setItem('hitcoach_voiceStyle', state.voiceStyle);
}

function loadVoiceSettings() {
    const saved = localStorage.getItem('hitcoach_voiceStyle');
    if (saved) {
        state.voiceStyle = saved;
    }
}

// ===== UTILITIES =====
function updateStatusTime() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    document.getElementById('statusTime').textContent = `${displayHours}:${minutes}`;
}

// Prevent screen sleep during workout
if ('wakeLock' in navigator) {
    let wakeLock = null;

    async function requestWakeLock() {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
        } catch (e) {
            console.log('Wake lock error:', e);
        }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && state.isTimerRunning) {
            requestWakeLock();
        }
    });
}
