function scoreAssignment(targetSorted, playedA, playedB) {
  const d0 = playedA.midi - targetSorted[0].midi;
  const d1 = playedB.midi - targetSorted[1].midi;
  const exactMatches = (d0 === 0 ? 1 : 0) + (d1 === 0 ? 1 : 0);
  const totalAbsDistance = Math.abs(d0) + Math.abs(d1);
  return { d0, d1, exactMatches, totalAbsDistance };
}

/**
 * Compare a dyad attempt against a dyad target.
 *
 * - Targets are sorted (low->high) by midi.
 * - Played notes are taken from the last two currently-active notes (in order).
 * - Assignment prefers more exact matches, else smaller total |distance|.
 *
 * @param {{midi:number}[]} targetNotes
 * @param {{midi:number}[]} activeNotesOrdered
 */
export function compareDyadAttempt(targetNotes, activeNotesOrdered) {
  const targetSorted = [...targetNotes].sort((a, b) => a.midi - b.midi);
  if (targetSorted.length < 2) {
    return {
      lower: { targetMidi: targetSorted[0]?.midi ?? null, playedMidi: null, distance: 0, show: false },
      higher: { targetMidi: targetSorted[1]?.midi ?? null, playedMidi: null, distance: 0, show: false },
    };
  }

  const playedDistinct = [...activeNotesOrdered].slice(-2);
  const played0 = playedDistinct[0] ?? null;
  const played1 = playedDistinct[1] ?? null;

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
    if (Math.abs(dLower) <= Math.abs(dHigher)) lowerPlayed = played0;
    else higherPlayed = played0;
  }

  const lowerDistance = lowerPlayed ? lowerPlayed.midi - targetSorted[0].midi : 0;
  const higherDistance = higherPlayed ? higherPlayed.midi - targetSorted[1].midi : 0;

  return {
    lower: {
      targetMidi: targetSorted[0].midi,
      playedMidi: lowerPlayed?.midi ?? null,
      distance: lowerDistance,
      show: lowerPlayed != null,
    },
    higher: {
      targetMidi: targetSorted[1].midi,
      playedMidi: higherPlayed?.midi ?? null,
      distance: higherDistance,
      show: higherPlayed != null,
    },
  };
}

