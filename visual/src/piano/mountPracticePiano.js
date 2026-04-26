import './piano-styles.css';

const NOTE_ORDER = [
  'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3',
  'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4',
  'G#4', 'A4', 'A#4', 'B4', 'C5', 'C#5', 'D5', 'D#5', 'E5', 'F5'
];

const NOTE_TO_KEY = {
  A3: 'q', B3: 'w', C4: 'e', D4: 'r', E4: 't',
  F4: 'y', G4: 'u', A4: 'i', B4: 'o', C5: 'p',
  'A#3': '2', 'C#4': '4', 'D#4': '5', 'F#4': '7', 'G#4': '8', 'A#4': '9',
  E3: 'z', F3: 'x', G3: 'c', 'F#3': 'd', 'G#3': 's',
  D5: 'n', E5: 'm', F5: ',', 'C#5': 'l', 'D#5': 'j'
};

const WHITE_KEY_WIDTH = 54;
const WHITE_KEY_HEIGHT = 220;
const BLACK_KEY_WIDTH = 35;
const BLACK_KEY_HEIGHT = 140;

const KEYBOARD_TO_NOTE = Object.fromEntries(
  Object.entries(NOTE_TO_KEY).map(([note, key]) => [key, note])
);
const HARMONICS = [
  { ratio: 1.0, gain: 0.50 },
  { ratio: 2.0, gain: 0.25 },
  { ratio: 3.0, gain: 0.12 },
  { ratio: 4.0, gain: 0.07 },
  { ratio: 5.0, gain: 0.04 },
  { ratio: 6.0, gain: 0.02 }
];

let sharedAudioContext;
let sharedAudioUnlockPromise;
let sharedReverbNode = null;
let sharedCompressorNode = null;

function noteToMidi(note) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const pitch = note.slice(0, -1);
  const octave = Number(note.slice(-1));
  return (octave + 1) * 12 + names.indexOf(pitch);
}

function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function noteDecayTime(midi) {
  return 2.5 * Math.pow(2, -(midi - 60) / 36) + 0.4;
}

function buildKeyboardData() {
  let whitePosition = 0;
  return NOTE_ORDER.map((note) => {
    const isSharp = note.includes('#');
    let leftPx = 0;
    if (isSharp) {
      leftPx = whitePosition * WHITE_KEY_WIDTH - BLACK_KEY_WIDTH / 2;
    } else {
      leftPx = whitePosition * WHITE_KEY_WIDTH;
      whitePosition += 1;
    }
    return {
      note,
      type: isSharp ? 'black' : 'white',
      leftPx
    };
  });
}

export function mountPracticePiano(hostEl, { canActivateNote, onNoteDown, onNoteUp } = {}) {
  hostEl.classList.add('piano-host');
  hostEl.innerHTML = '<div class="piano" id="practice-piano" aria-label="Playable piano keyboard"></div>';
  const pianoEl = hostEl.querySelector('#practice-piano');
  const pressedKeyboardKeys = new Set();
  const activeVoices = new Map();
  const pendingNotes = new Set();
  let removeGestureUnlockListeners = null;

  async function ensureAudioChain() {
    if (!sharedAudioContext) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) throw new Error('Web Audio not supported');
      sharedAudioContext = new Ctor();
    }
    if (sharedAudioContext.state !== 'running') {
      if (!sharedAudioUnlockPromise) {
        sharedAudioUnlockPromise = sharedAudioContext.resume().catch((error) => {
          sharedAudioUnlockPromise = undefined;
          throw error;
        });
      }
      try {
        await sharedAudioUnlockPromise;
      } finally {
        sharedAudioUnlockPromise = undefined;
      }
    }
    if (!sharedCompressorNode) {
      sharedCompressorNode = sharedAudioContext.createDynamicsCompressor();
      sharedCompressorNode.threshold.value = -12;
      sharedCompressorNode.knee.value = 6;
      sharedCompressorNode.ratio.value = 4;
      sharedCompressorNode.attack.value = 0.002;
      sharedCompressorNode.release.value = 0.15;
      sharedCompressorNode.connect(sharedAudioContext.destination);

      const rate = sharedAudioContext.sampleRate;
      const duration = 2.0;
      const length = Math.floor(rate * duration);
      const impulse = sharedAudioContext.createBuffer(2, length, rate);
      for (let ch = 0; ch < 2; ch++) {
        const data = impulse.getChannelData(ch);
        for (let i = 0; i < length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.2);
        }
      }
      sharedReverbNode = sharedAudioContext.createConvolver();
      sharedReverbNode.buffer = impulse;
      const reverbReturn = sharedAudioContext.createGain();
      reverbReturn.gain.value = 0.25;
      sharedReverbNode.connect(reverbReturn);
      reverbReturn.connect(sharedCompressorNode);
    }
    return {
      audioContext: sharedAudioContext,
      compressorNode: sharedCompressorNode,
      reverbNode: sharedReverbNode
    };
  }

  async function playNote(note) {
    if (pendingNotes.has(note)) return;
    const existing = activeVoices.get(note);
    if (existing) {
      if (!audioContext || audioContext.currentTime < existing.decayEndTime - 0.1) {
        return;
      }
      activeVoices.delete(note);
      setKeyActiveState(note, false);
    }

    pendingNotes.add(note);
    let chain;
    try {
      chain = await ensureAudioChain();
    } catch {
      pendingNotes.delete(note);
      return;
    }
    pendingNotes.delete(note);

    const { audioContext, compressorNode, reverbNode } = chain;
    const now = audioContext.currentTime;
    const midi = noteToMidi(note);
    const frequency = midiToFrequency(midi);
    const decayTime = noteDecayTime(midi);

    const masterGain = audioContext.createGain();
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(0.8, now + 0.003);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + decayTime);
    masterGain.connect(compressorNode);
    masterGain.connect(reverbNode);

    const oscillators = [];
    HARMONICS.forEach(({ ratio, gain }) => {
      const osc = audioContext.createOscillator();
      const oscGain = audioContext.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency * ratio;
      oscGain.gain.value = gain;
      osc.connect(oscGain);
      oscGain.connect(masterGain);
      osc.start(now);
      osc.stop(now + decayTime + 0.5);
      oscillators.push(osc);
    });

    const strikeDur = 0.06;
    const strikeLen = Math.floor(audioContext.sampleRate * strikeDur);
    const strikeBuf = audioContext.createBuffer(1, strikeLen, audioContext.sampleRate);
    const strikeData = strikeBuf.getChannelData(0);
    for (let i = 0; i < strikeLen; i++) strikeData[i] = Math.random() * 2 - 1;

    const strikeSource = audioContext.createBufferSource();
    strikeSource.buffer = strikeBuf;
    const strikeFilter = audioContext.createBiquadFilter();
    strikeFilter.type = 'bandpass';
    strikeFilter.frequency.value = Math.min(frequency * 3, 8000);
    strikeFilter.Q.value = 1.0;
    const strikeGain = audioContext.createGain();
    strikeGain.gain.setValueAtTime(0.06, now);
    strikeGain.gain.exponentialRampToValueAtTime(0.0001, now + strikeDur);
    strikeSource.connect(strikeFilter);
    strikeFilter.connect(strikeGain);
    strikeGain.connect(masterGain);
    strikeSource.start(now);

    activeVoices.set(note, { oscillators, masterGain, decayEndTime: now + decayTime });
  }

  function primeAudioFromGesture() {
    void ensureAudioChain().catch(() => {});
  }

  function setupGestureUnlock() {
    const unlock = () => {
      primeAudioFromGesture();
      removeGestureUnlockListeners?.();
      removeGestureUnlockListeners = null;
    };
    const opts = { passive: true };
    window.addEventListener('pointerdown', unlock, opts);
    window.addEventListener('touchstart', unlock, opts);
    window.addEventListener('keydown', unlock, opts);
    return () => {
      window.removeEventListener('pointerdown', unlock, opts);
      window.removeEventListener('touchstart', unlock, opts);
      window.removeEventListener('keydown', unlock, opts);
    };
  }

  function stopNote(note) {
    const voice = activeVoices.get(note);
    if (!voice || !sharedAudioContext) return;
    const now = sharedAudioContext.currentTime;
    voice.masterGain.gain.cancelScheduledValues(now);
    voice.masterGain.gain.setValueAtTime(Math.max(voice.masterGain.gain.value, 0.0001), now);
    voice.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    voice.oscillators.forEach((osc) => {
      try { osc.stop(now + 0.16); } catch {}
    });
    pendingNotes.delete(note);
    activeVoices.delete(note);
  }

  function setKeyActiveState(note, isActive) {
    const keyEl = pianoEl.querySelector(`[data-note="${note}"]`);
    if (!keyEl) return;
    keyEl.classList.toggle('active', isActive);
  }

  function createKeyElement(noteInfo) {
    const keyEl = document.createElement('button');
    keyEl.type = 'button';
    keyEl.className = `key ${noteInfo.type}`;
    keyEl.dataset.note = noteInfo.note;
    keyEl.style.left = `${noteInfo.leftPx}px`;
    keyEl.style.width = `${noteInfo.type === 'white' ? WHITE_KEY_WIDTH : BLACK_KEY_WIDTH}px`;
    keyEl.style.height = `${noteInfo.type === 'white' ? WHITE_KEY_HEIGHT : BLACK_KEY_HEIGHT}px`;
    const keyboardKey = NOTE_TO_KEY[noteInfo.note];
    keyEl.ariaLabel = keyboardKey
      ? `${noteInfo.note} key mapped to ${keyboardKey.toUpperCase()}`
      : `${noteInfo.note} key`;
    keyEl.textContent = keyboardKey ? keyboardKey.toUpperCase() : '';
    if (noteInfo.type === 'white') {
      const noteLabel = document.createElement('span');
      noteLabel.className = 'key-note';
      noteLabel.textContent = noteInfo.note;
      keyEl.appendChild(noteLabel);
    }
    keyEl.addEventListener('pointerdown', () => {
      primeAudioFromGesture();
      const notePayload = { pitch: noteInfo.note, midi: noteToMidi(noteInfo.note) };
      if (canActivateNote && !canActivateNote(notePayload)) return;
      setKeyActiveState(noteInfo.note, true);
      void playNote(noteInfo.note);
      if (onNoteDown) onNoteDown(notePayload);
    });
    keyEl.addEventListener('pointerup', () => {
      setKeyActiveState(noteInfo.note, false);
      stopNote(noteInfo.note);
      if (onNoteUp) onNoteUp({ pitch: noteInfo.note, midi: noteToMidi(noteInfo.note) });
    });
    keyEl.addEventListener('pointercancel', () => {
      setKeyActiveState(noteInfo.note, false);
      stopNote(noteInfo.note);
      if (onNoteUp) onNoteUp({ pitch: noteInfo.note, midi: noteToMidi(noteInfo.note) });
    });
    keyEl.addEventListener('pointerleave', () => {
      setKeyActiveState(noteInfo.note, false);
      stopNote(noteInfo.note);
      if (onNoteUp) onNoteUp({ pitch: noteInfo.note, midi: noteToMidi(noteInfo.note) });
    });
    return keyEl;
  }

  buildKeyboardData().forEach((info) => pianoEl.appendChild(createKeyElement(info)));

  function onKeyDown(event) {
    if (event.repeat) return;
    const note = KEYBOARD_TO_NOTE[event.key.toLowerCase()];
    if (!note) return;
    event.preventDefault();
    if (pressedKeyboardKeys.has(event.key.toLowerCase())) return;
    primeAudioFromGesture();
    const notePayload = { pitch: note, midi: noteToMidi(note) };
    if (canActivateNote && !canActivateNote(notePayload)) return;
    pressedKeyboardKeys.add(event.key.toLowerCase());
    setKeyActiveState(note, true);
    void playNote(note);
    if (onNoteDown) onNoteDown(notePayload);
  }

  function onKeyUp(event) {
    const note = KEYBOARD_TO_NOTE[event.key.toLowerCase()];
    if (!note) return;
    event.preventDefault();
    pressedKeyboardKeys.delete(event.key.toLowerCase());
    setKeyActiveState(note, false);
    stopNote(note);
    if (onNoteUp) onNoteUp({ pitch: note, midi: noteToMidi(note) });
  }

  function onBlur() {
    const releasedNotes = Array.from(activeVoices.keys());
    pressedKeyboardKeys.clear();
    pianoEl.querySelectorAll('.key.active').forEach((el) => el.classList.remove('active'));
    Array.from(activeVoices.keys()).forEach((note) => stopNote(note));
    if (onNoteUp) {
      releasedNotes.forEach((note) => onNoteUp({ pitch: note, midi: noteToMidi(note) }));
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  removeGestureUnlockListeners = setupGestureUnlock();

  return {
    playNotes(notes, durationMs = 700) {
      notes.forEach((note) => void playNote(note));
      const t = window.setTimeout(() => {
        notes.forEach((note) => stopNote(note));
      }, durationMs);
      return () => {
        window.clearTimeout(t);
        notes.forEach((note) => stopNote(note));
      };
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      removeGestureUnlockListeners?.();
      removeGestureUnlockListeners = null;
      Array.from(activeVoices.keys()).forEach((note) => stopNote(note));
      hostEl.classList.remove('piano-host');
      hostEl.innerHTML = '';
    }
  };
}
