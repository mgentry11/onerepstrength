// One Rep Strength Web App
// Version 1.0.0

// ===== SUPABASE CONFIG =====
const SUPABASE_URL = 'https://xmiwutflnqwcvdztgnwm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtaXd1dGZsbnF3Y3ZkenRnbndtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTgwNDMsImV4cCI6MjA4MTY3NDA0M30.EZN99LIMDnveKkDW2Xi5icOfnaAMeT95gRLOWcVuzrc';

let supabaseClient = null;
let currentUser = null;

// Initialize Supabase client
function initSupabase() {
    try {
        if (window.supabase && window.supabase.createClient) {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            checkAuthState();
        } else {
            console.log('Supabase not loaded, showing auth screen');
            showAuthScreen();
        }
    } catch (e) {
        console.error('Supabase init error:', e);
        showAuthScreen();
    }
}

// ===== AUTH FUNCTIONS =====
async function checkAuthState() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            currentUser = session.user;
            showMainApp();
        } else {
            showAuthScreen();
        }

        // Listen for auth changes
        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
                currentUser = session.user;
                showMainApp();
            } else if (event === 'SIGNED_OUT') {
                currentUser = null;
                showAuthScreen();
            }
        });
    } catch (e) {
        console.error('Auth check error:', e);
        showAuthScreen();
    }
}

function showAuthScreen() {
    document.getElementById('authScreen').classList.add('active');
    document.getElementById('workoutListScreen').classList.remove('active');
}

function showMainApp() {
    document.getElementById('authScreen').classList.remove('active');
    document.getElementById('workoutListScreen').classList.add('active');
    loadState();
    renderExerciseList();
    updateProgressDisplay();
    updateAccountDisplay();

    // Load weights from cloud if logged in
    if (currentUser) {
        loadCloudWeights();
    }
}

function updateAccountDisplay() {
    const emailDisplay = document.getElementById('userEmailDisplay');
    const logoutBtn = document.getElementById('logoutBtn');

    if (currentUser) {
        emailDisplay.textContent = currentUser.email;
        logoutBtn.style.display = 'flex';
    } else {
        emailDisplay.textContent = 'Guest';
        logoutBtn.textContent = 'Sign In';
        logoutBtn.onclick = () => showAuthScreen();
    }
}

function showAuthTab(tab) {
    const loginTab = document.getElementById('loginTab');
    const signupTab = document.getElementById('signupTab');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');

    if (tab === 'login') {
        loginTab.classList.add('active');
        signupTab.classList.remove('active');
        loginForm.style.display = 'flex';
        signupForm.style.display = 'none';
    } else {
        loginTab.classList.remove('active');
        signupTab.classList.add('active');
        loginForm.style.display = 'none';
        signupForm.style.display = 'flex';
    }
}

async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    const submitBtn = event.target.querySelector('button[type="submit"]');

    if (!supabaseClient) {
        errorEl.textContent = 'Connection error. Try refreshing.';
        return;
    }

    submitBtn.disabled = true;
    errorEl.textContent = '';

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        submitBtn.disabled = false;
        if (error) {
            errorEl.textContent = error.message;
        }
    } catch (e) {
        submitBtn.disabled = false;
        errorEl.textContent = 'Login failed. Please try again.';
    }
}

async function handleSignup(event) {
    event.preventDefault();
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const confirm = document.getElementById('signupConfirm').value;
    const errorEl = document.getElementById('signupError');
    const submitBtn = event.target.querySelector('button[type="submit"]');

    if (!supabaseClient) {
        errorEl.textContent = 'Connection error. Try refreshing.';
        return;
    }

    if (password !== confirm) {
        errorEl.textContent = 'Passwords do not match';
        return;
    }

    submitBtn.disabled = true;
    errorEl.textContent = '';

    try {
        const { data, error } = await supabaseClient.auth.signUp({ email, password });
        submitBtn.disabled = false;

        if (error) {
            errorEl.textContent = error.message;
        } else if (data.user && !data.session) {
            errorEl.style.color = '#0369a1';
            errorEl.textContent = 'Check your email to confirm your account';
        }
    } catch (e) {
        submitBtn.disabled = false;
        errorEl.textContent = 'Signup failed. Please try again.';
    }
}

function continueAsGuest() {
    currentUser = null;
    showMainApp();
}

async function handleLogout() {
    if (supabaseClient && currentUser) {
        await supabaseClient.auth.signOut();
    }
    currentUser = null;
    showAuthScreen();
}

// ===== SUPABASE DATA SYNC =====
let currentSessionId = null;

async function startWorkoutSession(workoutType) {
    if (!supabaseClient || !currentUser) return null;

    const { data, error } = await supabase
        .from('workout_sessions')
        .insert({
            user_id: currentUser.id,
            workout_type: workoutType,
            started_at: new Date().toISOString()
        })
        .select()
        .single();

    if (!error && data) {
        currentSessionId = data.id;
        return data.id;
    }
    return null;
}

async function syncExerciseLog(entry) {
    if (!supabaseClient || !currentUser) return;

    // Start session if not started
    if (!currentSessionId) {
        await startWorkoutSession(entry.workoutType);
    }

    if (!currentSessionId) return;

    await supabaseClient.from('exercise_logs').insert({
        session_id: currentSessionId,
        exercise_name: entry.exerciseName,
        exercise_order: WORKOUTS[entry.workoutType].findIndex(e => e.name === entry.exerciseName) + 1,
        weight_lbs: entry.weight,
        reached_failure: entry.reachedFailure,
        logged_at: entry.date
    });
}

async function syncExerciseWeight(exerciseName, weight, reachedFailure) {
    if (!supabaseClient || !currentUser) return;

    await supabaseClient.from('exercise_weights').upsert({
        user_id: currentUser.id,
        exercise_name: exerciseName,
        last_weight_lbs: weight,
        last_reached_failure: reachedFailure,
        personal_best_lbs: weight,
        updated_at: new Date().toISOString()
    }, {
        onConflict: 'user_id,exercise_name'
    });
}

async function loadCloudWeights() {
    if (!supabaseClient || !currentUser) return;

    const { data, error } = await supabase
        .from('exercise_weights')
        .select('*')
        .eq('user_id', currentUser.id);

    if (!error && data) {
        data.forEach(record => {
            const key = `hitcoach_weight_${state.currentProfile}_${record.exercise_name}`;
            localStorage.setItem(key, JSON.stringify({
                weight: record.last_weight_lbs,
                reachedFailure: record.last_reached_failure
            }));
        });
    }
}

async function completeWorkoutSession() {
    if (!supabaseClient || !currentUser || !currentSessionId) return;

    await supabase
        .from('workout_sessions')
        .update({
            completed_at: new Date().toISOString(),
            exercises_completed: state.completedExercises.length
        })
        .eq('id', currentSessionId);

    currentSessionId = null;
}

// ===== WORKOUT DATA =====
const WORKOUTS = {
    A: [
        { name: 'Leg Press', icon: 'leg-press' },
        { name: 'Chest Press', icon: 'chest-press' },
        { name: 'Lat Pulldown', icon: 'pulldown' },
        { name: 'Shoulder Press', icon: 'overhead-press' },
        { name: 'Leg Curl', icon: 'leg-curl' },
        { name: 'Calf Raise', icon: 'calf-raise' },
        { name: 'Ab Crunch', icon: 'ab-crunch' },
        { name: 'Back Extension', icon: 'back-extension' },
        { name: 'Hip Abduction', icon: 'hip-abduction' },
        { name: 'Hip Adduction', icon: 'hip-adduction' }
    ],
    B: [
        { name: 'Leg Extension', icon: 'leg-extension' },
        { name: 'Seated Row', icon: 'seated-row' },
        { name: 'Chest Fly', icon: 'chest-fly' },
        { name: 'Bicep Curl', icon: 'bicep-curl' },
        { name: 'Tricep Extension', icon: 'tricep-extension' },
        { name: 'Lateral Raise', icon: 'lateral-raise' },
        { name: 'Leg Press', icon: 'leg-press' },
        { name: 'Overhead Press', icon: 'overhead-press' },
        { name: 'Preacher Curl', icon: 'preacher-curl' },
        { name: 'Cable Pushdown', icon: 'cable-pushdown' }
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
    // Initialize Supabase auth first
    initSupabase();

    // Load settings (these work for guests too)
    loadPhaseSettings();
    loadVoiceSettings();
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
    // Complete the session in Supabase
    completeWorkoutSession();

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

    // Sync to Supabase if logged in
    syncExerciseLog(entry);
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
        showStatsScreen();
    } else if (tab === 'log') {
        document.getElementById('tabLog').classList.add('active');
        showLogScreen();
    }
}

function showStatsScreen() {
    showScreen('statsScreen');
    updateStatsDisplay();
}

function showLogScreen() {
    showScreen('logScreen');
    updateLogDisplay();
}

function updateStatsDisplay() {
    const history = JSON.parse(localStorage.getItem(`hitcoach_history_${state.currentProfile}`) || '[]');

    // Calculate stats
    const totalSets = history.length;
    const uniqueDays = new Set(history.map(h => new Date(h.date).toDateString())).size;
    const thisWeek = history.filter(h => {
        const d = new Date(h.date);
        const now = new Date();
        const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        return d > weekAgo;
    }).length;

    // Calculate streak
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 30; i++) {
        const checkDate = new Date(today - i * 24 * 60 * 60 * 1000).toDateString();
        const hasWorkout = history.some(h => new Date(h.date).toDateString() === checkDate);
        if (hasWorkout) streak++;
        else if (i > 0) break;
    }

    // Update display
    document.getElementById('statTotalWorkouts').textContent = uniqueDays;
    document.getElementById('statTotalSets').textContent = totalSets;
    document.getElementById('statCurrentStreak').textContent = streak;
    document.getElementById('statThisWeek').textContent = thisWeek;

    // Update weekly chart
    updateWeeklyChart(history);

    // Update personal records
    updatePersonalRecords(history);
}

function updateWeeklyChart(history) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    const chartBars = document.querySelectorAll('.chart-bar');

    chartBars.forEach((bar, index) => {
        const dayIndex = (today.getDay() - 6 + index + 7) % 7;
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() - (6 - index));

        const dayWorkouts = history.filter(h =>
            new Date(h.date).toDateString() === checkDate.toDateString()
        ).length;

        bar.classList.toggle('active', dayWorkouts > 0);
        const fill = bar.querySelector('.bar-fill');
        fill.style.height = dayWorkouts > 0 ? `${Math.min(dayWorkouts * 20, 80)}px` : '4px';
    });
}

function updatePersonalRecords(history) {
    const records = {};
    history.forEach(h => {
        if (!records[h.exerciseName] || h.weight > records[h.exerciseName]) {
            records[h.exerciseName] = h.weight;
        }
    });

    const container = document.getElementById('personalRecords');
    if (Object.keys(records).length === 0) {
        container.innerHTML = '<div class="empty-state small"><p>Complete workouts to see your PRs</p></div>';
        return;
    }

    container.innerHTML = Object.entries(records)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, weight]) => `
            <div class="record-item">
                <span class="record-name">${name}</span>
                <span class="record-value">${weight} lbs</span>
            </div>
        `).join('');
}

function updateLogDisplay(filter = 'all') {
    const history = JSON.parse(localStorage.getItem(`hitcoach_history_${state.currentProfile}`) || '[]');

    let filtered = history;
    const now = new Date();

    if (filter === 'week') {
        const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        filtered = history.filter(h => new Date(h.date) > weekAgo);
    } else if (filter === 'month') {
        const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
        filtered = history.filter(h => new Date(h.date) > monthAgo);
    }

    const container = document.getElementById('logList');
    const emptyLog = document.getElementById('emptyLog');

    if (filtered.length === 0) {
        emptyLog.style.display = 'block';
        container.innerHTML = '';
        container.appendChild(emptyLog);
        return;
    }

    emptyLog.style.display = 'none';

    // Group by date
    const grouped = {};
    filtered.forEach(h => {
        const dateKey = new Date(h.date).toDateString();
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(h);
    });

    container.innerHTML = Object.entries(grouped)
        .sort((a, b) => new Date(b[0]) - new Date(a[0]))
        .map(([date, exercises]) => `
            <div class="log-entry">
                <div class="log-entry-header">
                    <span class="log-entry-date">${formatDate(new Date(date))}</span>
                    <span class="log-entry-type">${exercises[0]?.workoutType || 'Workout'}</span>
                </div>
                <div class="log-entry-exercises">
                    ${exercises.map(e => `<span class="log-exercise-tag">${e.exerciseName} - ${e.weight}lbs</span>`).join('')}
                </div>
            </div>
        `).join('');
}

function filterLog(filter) {
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    updateLogDisplay(filter);
}

function formatDate(date) {
    const options = { weekday: 'short', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
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

    // Sync to Supabase if logged in
    syncExerciseWeight(exerciseName, weight, reachedFailure);
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
