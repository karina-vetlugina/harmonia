import { mountPracticePiano } from './piano/mountPracticePiano.js';
import { mountDesignerPlayground } from './playground/mountDesignerPlayground.js';
import vivaLaVidaSongNotes from './data/vivaLaVidaSongNotes.js';

const app = document.getElementById('app');

let piano = null;
let playground = null;
let played = [];
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
  const playedSorted = [...playedNotes].sort((a, b) => a.midi - b.midi);
  const played0 = playedSorted[0];
  const played1 = playedSorted[1];

  let best = null;
  if (played0 && played1) {
    const optionA = scoreAssignment(targetSorted, played0, played1);
    const optionB = scoreAssignment(targetSorted, played1, played0);
    if (optionA.exactMatches > optionB.exactMatches) {
      best = { left: played0, right: played1, ...optionA };
    } else if (optionB.exactMatches > optionA.exactMatches) {
      best = { left: played1, right: played0, ...optionB };
    } else if (optionA.totalAbsDistance < optionB.totalAbsDistance) {
      best = { left: played0, right: played1, ...optionA };
    } else if (optionB.totalAbsDistance < optionA.totalAbsDistance) {
      best = { left: played1, right: played0, ...optionB };
    } else {
      best = { left: played0, right: played1, ...optionA };
    }
  }

  const lowerPlayed = best ? best.left : played0 ?? null;
  const higherPlayed = best ? best.right : played1 ?? null;
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

function updateFeedback() {
  if (!playground) return;
  const comparison = getTwoNoteComparison(firstLeftTarget, played);
  playground.updateDistances(comparison[0].distance, comparison[1].distance, true);
  const debug = document.getElementById('debug');
  if (debug) {
    debug.textContent = `target: ${targetNotes.join(' + ')} | played: ${played.map((n) => n.pitch).join(' + ') || '-'} | pink: ${comparison[0].playedPitch ?? '-'}→${comparison[0].targetPitch} = ${comparison[0].distance} | orange: ${comparison[1].playedPitch ?? '-'}→${comparison[1].targetPitch} = ${comparison[1].distance}`;
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
    onNote(note) {
      played = [...played, note].slice(-targetMidis.length);
      updateFeedback();
    }
  });
  playground = mountDesignerPlayground(document.getElementById('designer-stage'));
  updateFeedback();
}

window.addEventListener('beforeunload', () => {
  if (piano) piano.destroy();
  if (playground) playground.destroy();
});
render();
