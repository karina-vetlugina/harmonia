import { mountPracticePiano } from './piano/mountPracticePiano.js';
import { mountDesignerPlayground } from './playground/mountDesignerPlayground.js';
import vivaLaVidaSongNotes from './data/vivaLaVidaSongNotes.js';

const app = document.getElementById('app');

let piano = null;
let playground = null;
let showIntroOverlay = true;
let showTutorialOverlay = false;
let visualizerEnabled = true;
const activeNotesByMidi = new Map();
const activeMidiOrder = [];
let activeHand = 'L';
let phase = 'idle';
let chordIndex = 0;
let evalTimer = null;
let idlePulseTimer = null;
const playbackStops = [];
const pressedAttemptMidis = new Set();

// 1-based target order. Edit these for spaced repetition.
const LEFT_HAND_SEQUENCE = [1, 2, 1, 2, 3, 2, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8];
const RIGHT_HAND_SEQUENCE = null; // null means natural song order.
const TARGET_CHORD_MS = 700;
const START_TARGET_DELAY_MS = 400;
const EVAL_DELAY_MS = 300;
const SUCCESS_ADVANCE_MS = 600;
const IDLE_PULSE_DELAY_MS = 5000;
const SOUND_PULSE_VISUAL_MS = 1100;

const leftHandNotes = vivaLaVidaSongNotes.notes
  .filter((n) => n.hand === 'L')
  .sort((a, b) => a.t - b.t);
const rightHandNotes = vivaLaVidaSongNotes.notes
  .filter((n) => n.hand === 'R')
  .sort((a, b) => a.t - b.t);
const firstLeftT = leftHandNotes[0]?.t ?? 0;
const firstLeftTarget = leftHandNotes
  .filter((n) => Math.abs(n.t - firstLeftT) <= 0.03)
  .sort((a, b) => a.midi - b.midi);
const firstRightTarget = rightHandNotes[0] ? [rightHandNotes[0]] : [];

function buildLeftHandGroups(notes) {
  const groups = new Map();
  notes
    .filter((n) => n.hand === 'L')
    .sort((a, b) => a.t - b.t || a.midi - b.midi)
    .forEach((n) => {
      const key = n.t.toFixed(3);
      if (!groups.has(key)) groups.set(key, { t: n.t, notes: [] });
      groups.get(key).notes.push(n);
    });
  return Array.from(groups.values());
}

function buildRightHandGroups(notes) {
  return notes
    .filter((n) => n.hand === 'R')
    .sort((a, b) => a.t - b.t || a.midi - b.midi)
    .map((n) => ({ t: n.t, notes: [n] }));
}

function buildPracticeGroups(groups, sequence) {
  if (!Array.isArray(sequence) || sequence.length === 0) return groups;
  return sequence.map((step) => groups[step - 1]).filter(Boolean);
}

const leftHandGroups = buildLeftHandGroups(vivaLaVidaSongNotes.notes);
const rightHandGroups = buildRightHandGroups(vivaLaVidaSongNotes.notes);
const leftPracticeGroups = buildPracticeGroups(leftHandGroups, LEFT_HAND_SEQUENCE);
const rightPracticeGroups = buildPracticeGroups(rightHandGroups, RIGHT_HAND_SEQUENCE);

function practiceGroupsForHand() {
  return activeHand === 'L' ? leftPracticeGroups : rightPracticeGroups;
}

function statusForDistance(distance) {
  if (distance === 0) return 'correct';
  return distance < 0 ? 'low' : 'high';
}

function scoreAssignment(targetSorted, playedA, playedB) {
  const d0 = playedA.midi - targetSorted[0].midi;
  const d1 = playedB.midi - targetSorted[1].midi;
  const exactMatches = (d0 === 0 ? 1 : 0) + (d1 === 0 ? 1 : 0);
  const totalAbsDistance = Math.abs(d0) + Math.abs(d1);
  return { d0, d1, exactMatches, totalAbsDistance };
}

function getTwoNoteComparison(targetNotesInput, playedNotes) {
  const targetSorted = [...targetNotesInput].sort((a, b) => a.midi - b.midi);
  const playedDistinct = [...playedNotes].slice(-2);
  const played0 = playedDistinct[0];
  const played1 = playedDistinct[1];

  let lowerPlayed = null;
  let higherPlayed = null;

  if (played0 && played1) {
    const optionA = scoreAssignment(targetSorted, played0, played1);
    const optionB = scoreAssignment(targetSorted, played1, played0);
    if (optionA.exactMatches > optionB.exactMatches) {
      lowerPlayed = played0;
      higherPlayed = played1;
    } else if (optionB.exactMatches > optionA.exactMatches) {
      lowerPlayed = played1;
      higherPlayed = played0;
    } else if (optionA.totalAbsDistance < optionB.totalAbsDistance) {
      lowerPlayed = played0;
      higherPlayed = played1;
    } else if (optionB.totalAbsDistance < optionA.totalAbsDistance) {
      lowerPlayed = played1;
      higherPlayed = played0;
    } else {
      lowerPlayed = played0;
      higherPlayed = played1;
    }
  } else if (played0) {
    const dLower = played0.midi - targetSorted[0].midi;
    const dHigher = played0.midi - targetSorted[1].midi;
    if (Math.abs(dLower) <= Math.abs(dHigher)) {
      lowerPlayed = played0;
    } else {
      higherPlayed = played0;
    }
  }

  const lowerDistance = lowerPlayed ? lowerPlayed.midi - targetSorted[0].midi : 0;
  const higherDistance = higherPlayed ? higherPlayed.midi - targetSorted[1].midi : 0;

  return [
    {
      role: 'lower',
      color: 'pink',
      targetMidi: targetSorted[0].midi,
      targetPitch: targetSorted[0].pitch,
      playedMidi: lowerPlayed?.midi ?? null,
      playedPitch: lowerPlayed?.pitch ?? null,
      distance: lowerDistance,
      status: statusForDistance(lowerDistance)
    },
    {
      role: 'higher',
      color: 'orange',
      targetMidi: targetSorted[1].midi,
      targetPitch: targetSorted[1].pitch,
      playedMidi: higherPlayed?.midi ?? null,
      playedPitch: higherPlayed?.pitch ?? null,
      distance: higherDistance,
      status: statusForDistance(higherDistance)
    }
  ];
}

function runComparisonSelfTest() {
  const availableNotes = [
    { pitch: 'E3', midi: 52 },
    { pitch: 'F3', midi: 53 },
    { pitch: 'G3', midi: 55 },
    { pitch: 'A3', midi: 57 },
    { pitch: 'B3', midi: 59 },
    { pitch: 'C4', midi: 60 },
    { pitch: 'D4', midi: 62 },
    { pitch: 'E4', midi: 64 },
    { pitch: 'F4', midi: 65 },
    { pitch: 'G4', midi: 67 },
    { pitch: 'A4', midi: 69 },
    { pitch: 'B4', midi: 71 },
    { pitch: 'C5', midi: 72 },
    { pitch: 'D5', midi: 74 },
    { pitch: 'E5', midi: 76 },
    { pitch: 'F5', midi: 77 }
  ];

  const fails = [];
  let total = 0;
  let passed = 0;

  function check(condition, label, details) {
    total += 1;
    if (condition) {
      passed += 1;
    } else {
      fails.push({ label, details });
    }
  }

  function runCase(label, played, expected) {
    const result = getTwoNoteComparison(firstLeftTarget, played);
    check(result[0].targetPitch === 'G3', `${label} pink target`, { result });
    check(result[1].targetPitch === 'C4', `${label} orange target`, { result });
    if (typeof expected.pinkDistance === 'number') {
      check(result[0].distance === expected.pinkDistance, `${label} pink distance`, { result, expected });
    }
    if (typeof expected.orangeDistance === 'number') {
      check(result[1].distance === expected.orangeDistance, `${label} orange distance`, { result, expected });
    }
    if (expected.pinkPositive) {
      check(result[0].distance > 0, `${label} pink positive`, { result });
    }
    if (expected.orangePositive) {
      check(result[1].distance > 0, `${label} orange positive`, { result });
    }
    if (expected.pinkNegative) {
      check(result[0].distance < 0, `${label} pink negative`, { result });
    }
    if (expected.orangeNegative) {
      check(result[1].distance < 0, `${label} orange negative`, { result });
    }
  }

  runCase('G3 + C4', [{ pitch: 'G3', midi: 55 }, { pitch: 'C4', midi: 60 }], { pinkDistance: 0, orangeDistance: 0 });
  runCase('C4 + G3', [{ pitch: 'C4', midi: 60 }, { pitch: 'G3', midi: 55 }], { pinkDistance: 0, orangeDistance: 0 });
  runCase('E3 + G3', [{ pitch: 'E3', midi: 52 }, { pitch: 'G3', midi: 55 }], { pinkDistance: 0, orangeDistance: -8 });
  runCase('F3 + C4', [{ pitch: 'F3', midi: 53 }, { pitch: 'C4', midi: 60 }], { pinkDistance: -2, orangeDistance: 0 });
  runCase('G3 + D4', [{ pitch: 'G3', midi: 55 }, { pitch: 'D4', midi: 62 }], { pinkDistance: 0, orangeDistance: 2 });
  runCase('A3 + C4', [{ pitch: 'A3', midi: 57 }, { pitch: 'C4', midi: 60 }], { pinkDistance: 2, orangeDistance: 0 });
  runCase('E4 + B4', [{ pitch: 'E4', midi: 64 }, { pitch: 'B4', midi: 71 }], { pinkPositive: true, orangePositive: true });
  runCase('E3 + F3', [{ pitch: 'E3', midi: 52 }, { pitch: 'F3', midi: 53 }], { pinkNegative: true, orangeNegative: true });

  for (const a of availableNotes) {
    for (const b of availableNotes) {
      const result = getTwoNoteComparison(firstLeftTarget, [a, b]);
      check(result[0].color === 'pink', `generated ${a.pitch}+${b.pitch} pink color`, { result });
      check(result[1].color === 'orange', `generated ${a.pitch}+${b.pitch} orange color`, { result });
      check(result[0].targetPitch === 'G3', `generated ${a.pitch}+${b.pitch} pink target`, { result });
      check(result[1].targetPitch === 'C4', `generated ${a.pitch}+${b.pitch} orange target`, { result });
      if (a.pitch === 'G3' || b.pitch === 'G3') {
        check(result[0].distance === 0, `generated ${a.pitch}+${b.pitch} pink exact`, { result });
      }
      if (a.pitch === 'C4' || b.pitch === 'C4') {
        check(result[1].distance === 0, `generated ${a.pitch}+${b.pitch} orange exact`, { result });
      }
      if ((a.pitch === 'G3' && b.pitch === 'C4') || (a.pitch === 'C4' && b.pitch === 'G3')) {
        check(result[0].distance === 0 && result[1].distance === 0, `generated ${a.pitch}+${b.pitch} both exact`, { result });
      }
      if (result[0].playedMidi != null) {
        check(result[0].distance === result[0].playedMidi - result[0].targetMidi, `generated ${a.pitch}+${b.pitch} pink formula`, { result });
      }
      if (result[1].playedMidi != null) {
        check(result[1].distance === result[1].playedMidi - result[1].targetMidi, `generated ${a.pitch}+${b.pitch} orange formula`, { result });
      }
    }
  }

  const summary = {
    casesChecked: total,
    passed,
    failed: fails.length,
    generatedPairs: availableNotes.length * availableNotes.length,
    explicitCases: 8
  };
  console.log('[Harmonia comparison self-test]', summary);
  if (fails.length) {
    fails.slice(0, 20).forEach((f) => {
      console.error('[Harmonia comparison self-test fail]', f.label, f.details);
    });
  }
}

function getSelectedActiveNotes(limit) {
  const activeMidis = activeMidiOrder.filter((midi) => activeNotesByMidi.has(midi));
  return activeMidis.slice(-limit).map((midi) => activeNotesByMidi.get(midi));
}

function getMaxActiveNotesForHand() {
  return activeHand === 'L' ? 2 : 1;
}

function getFeedbackNotesForHand() {
  return getSelectedActiveNotes(getMaxActiveNotesForHand());
}

function currentTarget() {
  const fallback = activeHand === 'L' ? firstLeftTarget : firstRightTarget;
  return practiceGroupsForHand()[chordIndex]?.notes ?? fallback;
}

function currentTargetMidis() {
  return currentTarget().map((n) => n.midi);
}

function currentTargetNotes() {
  return currentTarget().map((n) => n.pitch);
}

function activeDebugString() {
  const active = getFeedbackNotesForHand();
  return active.length ? active.map((n) => n.pitch).join(' + ') : '-';
}

function notesMatchTarget(target, notes) {
  if (target.length !== notes.length) return false;
  const played = new Set(notes.map((n) => n.midi));
  return target.every((n) => played.has(n.midi));
}

function clearActiveAttempt() {
  activeNotesByMidi.clear();
  activeMidiOrder.length = 0;
  pressedAttemptMidis.clear();
}

function stopPlaybackTimers() {
  while (playbackStops.length) {
    const stop = playbackStops.pop();
    if (stop) stop();
  }
}

function clearIdlePulse() {
  window.clearTimeout(idlePulseTimer);
  idlePulseTimer = null;
}

function setPhase(nextPhase) {
  phase = nextPhase;
  updateProgressUi();
}

function pulseTargetChord(index = chordIndex) {
  if (!piano) return;
  const group = practiceGroupsForHand()[index];
  if (!group) return;
  const feedbackPlayground = document.querySelector('.feedback-playground');
  const progress = document.querySelector('.practice-progress');
  const soundIndicator = document.getElementById('sound-indicator');
  feedbackPlayground?.classList.add('feedback-playground--sounding');
  progress?.classList.add('practice-progress--sounding');
  soundIndicator?.classList.add('sound-indicator--visible');
  const stop = piano.playNotes(group.notes.map((n) => n.pitch), TARGET_CHORD_MS);
  playbackStops.push(stop);
  const visualPulseTimer = window.setTimeout(() => {
    feedbackPlayground?.classList.remove('feedback-playground--sounding');
    progress?.classList.remove('practice-progress--sounding');
    soundIndicator?.classList.remove('sound-indicator--visible');
  }, SOUND_PULSE_VISUAL_MS);
  playbackStops.push(() => {
    window.clearTimeout(visualPulseTimer);
    feedbackPlayground?.classList.remove('feedback-playground--sounding');
    progress?.classList.remove('practice-progress--sounding');
    soundIndicator?.classList.remove('sound-indicator--visible');
  });
}

function scheduleIdlePulse(index = chordIndex) {
  clearIdlePulse();
  idlePulseTimer = window.setTimeout(() => {
    if (phase !== 'waiting') return;
    if (activeNotesByMidi.size > 0) {
      scheduleIdlePulse(index);
      return;
    }
    pulseTargetChord(index);
    scheduleIdlePulse(index);
  }, IDLE_PULSE_DELAY_MS);
}

function playTargetChord(index = chordIndex) {
  const group = practiceGroupsForHand()[index];
  if (!group) return;

  stopPlaybackTimers();
  window.clearTimeout(evalTimer);
  clearIdlePulse();
  clearActiveAttempt();
  setPhase('target');
  updateFeedback();

  pulseTargetChord(index);
  const t = window.setTimeout(() => {
    setPhase('waiting');
    updateFeedback();
    scheduleIdlePulse(index);
  }, TARGET_CHORD_MS);
  playbackStops.push(() => window.clearTimeout(t));
}

function startPracticeIfNeeded() {
  if (phase !== 'idle') return false;
  setPhase('target');
  const t = window.setTimeout(() => playTargetChord(chordIndex), START_TARGET_DELAY_MS);
  playbackStops.push(() => window.clearTimeout(t));
  return true;
}

function evaluateAttempt() {
  if (phase !== 'waiting') return;
  const groups = practiceGroupsForHand();
  const group = groups[chordIndex];
  if (!group) return;
  const correct = group.notes.every((n) => pressedAttemptMidis.has(n.midi));

  if (correct) {
    clearIdlePulse();
    setPhase('success');
    updateFeedback();
    const isLast = chordIndex === groups.length - 1;
    const t = window.setTimeout(() => {
      if (isLast) {
        setPhase('complete');
        updateFeedback();
        return;
      }
      chordIndex += 1;
      playTargetChord(chordIndex);
    }, SUCCESS_ADVANCE_MS);
    playbackStops.push(() => window.clearTimeout(t));
    return;
  }

  pressedAttemptMidis.clear();
  pulseTargetChord(chordIndex);
  scheduleIdlePulse(chordIndex);
}

function handleNoteDown(note) {
  if (phase === 'complete') return;
  if (startPracticeIfNeeded()) return;
  if (phase !== 'waiting') return;
  clearIdlePulse();
  pressedAttemptMidis.add(note.midi);
  activeNotesByMidi.set(note.midi, note);
  const idx = activeMidiOrder.indexOf(note.midi);
  if (idx >= 0) activeMidiOrder.splice(idx, 1);
  activeMidiOrder.push(note.midi);
  updateFeedback();
}

function handleNoteUp(note) {
  activeNotesByMidi.delete(note.midi);
  const idx = activeMidiOrder.indexOf(note.midi);
  if (idx >= 0) activeMidiOrder.splice(idx, 1);
  if (phase === 'waiting') {
    if (activeNotesByMidi.size === 0) {
      scheduleIdlePulse(chordIndex);
      window.clearTimeout(evalTimer);
      evalTimer = window.setTimeout(evaluateAttempt, EVAL_DELAY_MS);
    } else {
      window.clearTimeout(evalTimer);
    }
  }
  updateFeedback();
}

function canActivateNote(note) {
  if (phase === 'target' || phase === 'success' || phase === 'complete') return false;
  if (activeNotesByMidi.has(note.midi)) return true;
  return activeNotesByMidi.size < getMaxActiveNotesForHand();
}

function setTargetLineState(selector, state) {
  const line = document.querySelector(selector);
  if (!line) return;
  line.classList.remove('target-line--correct', 'target-line--incorrect');
  if (state === 'correct') line.classList.add('target-line--correct');
  if (state === 'incorrect') line.classList.add('target-line--incorrect');
}

function updateFeedback() {
  if (!playground) return;
  const feedbackPlayground = document.querySelector('.feedback-playground');
  const target = currentTarget();
  const targetMidis = currentTargetMidis();
  const feedbackNotes = getFeedbackNotesForHand();
  const wholeTargetCorrect = phase === 'success' || notesMatchTarget(target, feedbackNotes);
  if (feedbackPlayground) {
    feedbackPlayground.classList.toggle('feedback-playground--correct', wholeTargetCorrect);
    feedbackPlayground.classList.toggle('feedback-playground--visualizer-off', !visualizerEnabled);
  }
  if (feedbackNotes.length === 0) {
    setTargetLineState('.target-line--pink', 'neutral');
    setTargetLineState('.target-line--orange', 'neutral');
    setTargetLineState('.target-line--green', 'neutral');
    if (activeHand === 'L') {
      playground.updateState({
        mode: 'left',
        pinkDistance: 0,
        orangeDistance: 0,
        showPink: false,
        showOrange: false,
        showGreen: false,
        pinkTargetMidi: targetMidis[0],
        orangeTargetMidi: targetMidis[1]
      });
    } else {
      playground.updateState({
        mode: 'right',
        greenDistance: 0,
        showPink: false,
        showOrange: false,
        showGreen: false,
        greenTargetMidi: targetMidis[0]
      });
    }
    return;
  }
  if (activeHand === 'L') {
    const comparison = getTwoNoteComparison(target, feedbackNotes);
    const showPink = comparison[0].playedMidi != null;
    const showOrange = comparison[1].playedMidi != null;
    setTargetLineState('.target-line--pink', showPink ? (comparison[0].distance === 0 ? 'correct' : 'incorrect') : 'neutral');
    setTargetLineState('.target-line--orange', showOrange ? (comparison[1].distance === 0 ? 'correct' : 'incorrect') : 'neutral');
    playground.updateState({
      mode: 'left',
      pinkDistance: comparison[0].distance,
      orangeDistance: comparison[1].distance,
      showPink,
      showOrange,
      showGreen: false,
      pinkTargetMidi: comparison[0].targetMidi,
      orangeTargetMidi: comparison[1].targetMidi
    });
    return;
  }
  const played = feedbackNotes[feedbackNotes.length - 1];
  const distance = played.midi - target[0].midi;
  setTargetLineState('.target-line--green', distance === 0 ? 'correct' : 'incorrect');
  playground.updateState({
    mode: 'right',
    greenDistance: distance,
    showPink: false,
    showOrange: false,
    showGreen: true,
    greenTargetMidi: target[0].midi
  });
}

function setActiveHand(nextHand) {
  if (nextHand === activeHand) return;
  stopPlaybackTimers();
  window.clearTimeout(evalTimer);
  clearIdlePulse();
  activeHand = nextHand;
  phase = 'idle';
  chordIndex = 0;
  clearActiveAttempt();
  render();
}

function updateProgressUi() {
  const progressWrap = document.querySelector('.practice-progress');
  const status = document.getElementById('status');
  const progressText = document.getElementById('progress-text');
  const progressFill = document.getElementById('progress-fill');
  const progress = chordIndex + (phase === 'complete' ? 1 : 0);
  const total = practiceGroupsForHand().length;
  const pct = total ? (progress / total) * 100 : 0;
  const statusText = {
    idle: 'Press any key to start',
    target: 'Listen...',
    waiting: 'Your turn',
    success: 'Nice - next up',
    complete: 'Complete'
  }[phase] ?? '';

  progressWrap?.classList.toggle('practice-progress--correct', phase === 'success' || phase === 'complete');
  if (status) status.textContent = statusText;
  if (progressText) progressText.textContent = `${progress}/${total}`;
  if (progressFill) progressFill.style.width = `${pct}%`;
}

function clearInteractiveState() {
  if (piano) {
    piano.destroy();
    piano = null;
  }
  if (playground) {
    playground.destroy();
    playground = null;
  }
}

function renderPractice() {
  clearInteractiveState();
  app.innerHTML = `
    <main class="practice-screen">
      <img class="app-logo" src="/logo.svg" alt="Harmonia logo" />
      <section class="keyboard-section">
        <label class="music-picker">
          <span>Song</span>
          <select aria-label="Choose song">
            <option selected>Viva la Vida</option>
          </select>
        </label>
        <label class="visualizer-toggle">
          <input id="visualizer-toggle" type="checkbox" ${visualizerEnabled ? 'checked' : ''} />
          <span>Visualizer</span>
        </label>
        <div class="hand-selector">
          <button class="hand-button ${activeHand === 'L' ? 'active' : ''}" data-hand="L">Left hand</button>
          <button class="hand-button ${activeHand === 'R' ? 'active' : ''}" data-hand="R">Right hand</button>
        </div>
        <div id="piano-host"></div>
      </section>
      <section class="feedback-section">
        <div class="practice-progress">
          <p class="small" id="status"></p>
          <p class="small" id="progress-text"></p>
          <p id="sound-indicator" class="sound-indicator">Target sound is playing</p>
          <div class="progress"><span id="progress-fill"></span></div>
        </div>
        <div class="feedback-playground">
          ${
            activeHand === 'L'
              ? `
          <div class="target-line target-line--pink"></div>
          <div class="target-line target-line--orange"></div>
          `
              : `
          <div class="target-line target-line--green"></div>
          `
          }
          <div id="designer-stage" class="designer-stage"></div>
        </div>
      </section>
      ${
        showIntroOverlay
          ? `
      <div class="intro-overlay">
        <section class="landing-card">
          <img class="landing-hero" src="/nav.svg" alt="Harmonia landing" />
          <div class="landing-actions">
            <button id="continue-intro" class="landing-start" type="button">Continue</button>
          </div>
        </section>
      </div>
      `
          : ''
      }
      ${
        showTutorialOverlay
          ? `
      <div class="intro-overlay">
        <section class="landing-card">
          <img class="landing-hero" src="/tutorial.svg" alt="Match the sound of the chord with the notes on the keyboard" />
          <div class="landing-actions">
            <button id="start-practice" class="landing-start" type="button">Start</button>
          </div>
        </section>
      </div>
      `
          : ''
      }
    </main>
  `;
  app.querySelectorAll('.hand-button').forEach((button) => {
    button.addEventListener('click', () => setActiveHand(button.dataset.hand));
  });
  const continueBtn = document.getElementById('continue-intro');
  continueBtn?.addEventListener('click', () => {
    showIntroOverlay = false;
    showTutorialOverlay = true;
    render();
  });
  const startBtn = document.getElementById('start-practice');
  startBtn?.addEventListener('click', () => {
    showTutorialOverlay = false;
    render();
  });
  const visualizerToggle = document.getElementById('visualizer-toggle');
  visualizerToggle?.addEventListener('change', (event) => {
    visualizerEnabled = event.currentTarget.checked;
    updateFeedback();
  });
  piano = mountPracticePiano(document.getElementById('piano-host'), {
    canActivateNote,
    onNoteDown: handleNoteDown,
    onNoteUp: handleNoteUp
  });
  playground = mountDesignerPlayground(document.getElementById('designer-stage'));
  updateProgressUi();
  updateFeedback();
}

function render() {
  renderPractice();
}

window.addEventListener('beforeunload', () => {
  stopPlaybackTimers();
  window.clearTimeout(evalTimer);
  clearIdlePulse();
  if (piano) piano.destroy();
  if (playground) playground.destroy();
});
render();

if (import.meta.env.DEV) {
  runComparisonSelfTest();
}
