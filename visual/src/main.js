import { mountPracticePiano } from './piano/mountPracticePiano.js';
import { mountDesignerPlayground } from './playground/mountDesignerPlayground.js';
import vivaLaVidaSongNotes from './data/vivaLaVidaSongNotes.js';

const app = document.getElementById('app');

let piano = null;
let playground = null;
const activeNotesByMidi = new Map();
const activeMidiOrder = [];
const leftHandNotes = vivaLaVidaSongNotes.notes
  .filter((n) => n.hand === 'L')
  .sort((a, b) => a.t - b.t);
const firstLeftT = leftHandNotes[0]?.t ?? 0;
const firstLeftTarget = leftHandNotes
  .filter((n) => Math.abs(n.t - firstLeftT) <= 0.03)
  .sort((a, b) => a.midi - b.midi);
const targetMidis = firstLeftTarget.map((n) => n.midi);
const targetNotes = firstLeftTarget.map((n) => n.pitch);

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

function activeDebugString() {
  const active = getSelectedActiveNotes(targetMidis.length);
  return active.length ? active.map((n) => n.pitch).join(' + ') : '-';
}

function handleNoteDown(note) {
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
  updateFeedback();
}

function updateFeedback() {
  if (!playground) return;
  const debug = document.getElementById('debug');
  const selectedActiveNotes = getSelectedActiveNotes(targetMidis.length);
  if (selectedActiveNotes.length < targetMidis.length) {
    playground.updateDistances(0, 0, false, targetMidis[0], targetMidis[1], false);
    if (debug) {
      debug.textContent = `target: ${targetNotes.join(' + ')} | active: ${activeDebugString()} | hold ${targetMidis.length} notes`;
    }
    return;
  }
  const comparison = getTwoNoteComparison(firstLeftTarget, selectedActiveNotes);
  playground.updateDistances(
    comparison[0].distance,
    comparison[1].distance,
    selectedActiveNotes.length > 1,
    comparison[0].targetMidi,
    comparison[1].targetMidi,
    true
  );
  if (debug) {
    const p = comparison[0].distance > 0 ? `+${comparison[0].distance}` : `${comparison[0].distance}`;
    const o = comparison[1].distance > 0 ? `+${comparison[1].distance}` : `${comparison[1].distance}`;
    debug.textContent = `target: ${targetNotes.join(' + ')} | active: ${activeDebugString()} | pink: ${comparison[0].playedPitch ?? '-'}→${comparison[0].targetPitch} = ${p} | orange: ${comparison[1].playedPitch ?? '-'}→${comparison[1].targetPitch} = ${o}`;
  }
}

function render() {
  if (piano) {
    piano.destroy();
    piano = null;
  }
  if (playground) {
    playground.destroy();
    playground = null;
  }
  app.innerHTML = `
    <main class="practice-screen">
      <section class="keyboard-section">
        <div id="piano-host"></div>
      </section>
      <section class="feedback-section">
        <p class="small" id="debug"></p>
        <div class="feedback-playground">
          <div class="center-line"></div>
          <div id="designer-stage" class="designer-stage"></div>
        </div>
      </section>
    </main>
  `;
  piano = mountPracticePiano(document.getElementById('piano-host'), {
    onNoteDown: handleNoteDown,
    onNoteUp: handleNoteUp
  });
  playground = mountDesignerPlayground(document.getElementById('designer-stage'));
  updateFeedback();
}

window.addEventListener('beforeunload', () => {
  if (piano) piano.destroy();
  if (playground) playground.destroy();
});
render();

if (import.meta.env.DEV) {
  runComparisonSelfTest();
}
