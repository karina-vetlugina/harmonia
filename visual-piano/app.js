const NOTE_ORDER = [
  "E3",
  "F3",
  "F#3",
  "G3",
  "G#3",
  "A3",
  "A#3",
  "B3",
  "C4",
  "C#4",
  "D4",
  "D#4",
  "E4",
  "F4",
  "F#4",
  "G4",
  "G#4",
  "A4",
  "A#4",
  "B4",
  "C5",
  "C#5",
  "D5",
  "D#5",
  "E5",
  "F5",
];

// Piano-style keyboard layout across two rows:
//
//  2  3     5  6  7     9  0        ← number row: black keys (C#4 D#4 | F#4 G#4 A#4 | C#5 D#5)
//  q  w  e  r  t  y  u  i  o  p [  ← top row:    white keys (C4 D4 E4 F4 G4 A4 B4 | C5 D5 E5 F5)
//
//        g  h  j                    ← home row:   black keys (F#3 G#3 A#3)
//  c  v  b  n  m                    ← bottom row: white keys (E3 F3 G3 A3 B3)
//
const NOTE_TO_KEY = {
  "E3": "c",  "F3": "v",  "G3": "b",  "A3": "n",  "B3": "m",
  "F#3": "g", "G#3": "h", "A#3": "j",
  "C4": "q",  "D4": "w",  "E4": "e",  "F4": "r",  "G4": "t",
  "A4": "y",  "B4": "u",  "C5": "i",  "D5": "o",  "E5": "p",  "F5": "[",
  "C#4": "2", "D#4": "3", "F#4": "5", "G#4": "6", "A#4": "7",
  "C#5": "9", "D#5": "0",
};

const WHITE_KEY_WIDTH = 54;
const WHITE_KEY_HEIGHT = 220;
const BLACK_KEY_WIDTH = 35;
const BLACK_KEY_HEIGHT = 140;

const pianoEl = document.getElementById("piano");
const statusEl = document.getElementById("status");

const notesByName = new Map();
const notesByKeyboardKey = new Map();
const keyboardByNote = new Map();
const activeVoices = new Map();
const pressedKeyboardKeys = new Set();

let audioContext;
let audioUnlockPromise;
let reverbNode = null;
let compressorNode = null;
const pendingNotes = new Set();

const KEYBOARD_TO_NOTE = Object.fromEntries(
  Object.entries(NOTE_TO_KEY).map(([note, key]) => [key, note])
);

function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function noteToMidi(note) {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const pitch = note.slice(0, -1);
  const octave = Number(note.slice(-1));
  return (octave + 1) * 12 + names.indexOf(pitch);
}

function buildKeyboardData() {
  let whitePosition = 0;
  return NOTE_ORDER.map((note) => {
    const isSharp = note.includes("#");
    let leftPx = 0;

    if (isSharp) {
      leftPx = whitePosition * WHITE_KEY_WIDTH - BLACK_KEY_WIDTH / 2;
    } else {
      leftPx = whitePosition * WHITE_KEY_WIDTH;
      whitePosition += 1;
    }

    return {
      note,
      frequency: midiToFrequency(noteToMidi(note)),
      type: isSharp ? "black" : "white",
      leftPx,
    };
  });
}

const KEYBOARD_LAYOUT = buildKeyboardData();

async function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new window.AudioContext();
    statusEl.textContent = "Initializing audio...";
  }

  if (audioContext.state !== "running") {
    if (!audioUnlockPromise) {
      audioUnlockPromise = audioContext.resume().catch((error) => {
        statusEl.textContent = `Audio blocked: ${error.message}`;
        throw error;
      });
    }
    await audioUnlockPromise;
    audioUnlockPromise = undefined;
  }

  if (!compressorNode) {
    setupAudioChain();
  }

  statusEl.textContent = "Audio ready. Play with click or keyboard.";
}

function setupAudioChain() {
  // Master compressor prevents clipping when multiple notes play simultaneously
  compressorNode = audioContext.createDynamicsCompressor();
  compressorNode.threshold.value = -12;
  compressorNode.knee.value = 6;
  compressorNode.ratio.value = 4;
  compressorNode.attack.value = 0.002;
  compressorNode.release.value = 0.15;
  compressorNode.connect(audioContext.destination);

  const rate = audioContext.sampleRate;
  const duration = 2.0;
  const length = Math.floor(rate * duration);
  const impulse = audioContext.createBuffer(2, length, rate);

  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.2);
    }
  }

  reverbNode = audioContext.createConvolver();
  reverbNode.buffer = impulse;

  const reverbReturn = audioContext.createGain();
  reverbReturn.gain.value = 0.25;
  reverbNode.connect(reverbReturn);
  reverbReturn.connect(compressorNode);
}

function noteDecayTime(midi) {
  // Lower notes decay slower (piano characteristic)
  return 2.5 * Math.pow(2, -(midi - 60) / 36) + 0.4;
}

const HARMONICS = [
  { ratio: 1.0, gain: 0.50 },
  { ratio: 2.0, gain: 0.25 },
  { ratio: 3.0, gain: 0.12 },
  { ratio: 4.0, gain: 0.07 },
  { ratio: 5.0, gain: 0.04 },
  { ratio: 6.0, gain: 0.02 },
];

function setKeyActiveState(note, isActive) {
  const keyEl = pianoEl.querySelector(`[data-note="${note}"]`);
  if (!keyEl) {
    return;
  }
  keyEl.classList.toggle("active", isActive);
}

function createKeyElement(noteInfo) {
  const keyEl = document.createElement("button");
  keyEl.type = "button";
  keyEl.className = `key ${noteInfo.type}`;
  keyEl.dataset.note = noteInfo.note;
  keyEl.style.left = `${noteInfo.leftPx}px`;
  keyEl.style.width = `${noteInfo.type === "white" ? WHITE_KEY_WIDTH : BLACK_KEY_WIDTH}px`;
  keyEl.style.height = `${noteInfo.type === "white" ? WHITE_KEY_HEIGHT : BLACK_KEY_HEIGHT}px`;

  const keyboardKey = keyboardByNote.get(noteInfo.note);
  keyEl.ariaLabel = keyboardKey
    ? `${noteInfo.note} key mapped to ${keyboardKey.toUpperCase()}`
    : `${noteInfo.note} key`;
  keyEl.textContent = keyboardKey ? keyboardKey.toUpperCase() : "";

  if (noteInfo.type === "white") {
    const noteLabel = document.createElement("span");
    noteLabel.className = "key-note";
    noteLabel.textContent = noteInfo.note;
    keyEl.appendChild(noteLabel);
  }

  const onPress = () => {
    void playNote(noteInfo.note);
  };
  const onRelease = () => {
    stopNote(noteInfo.note);
  };

  if ("PointerEvent" in window) {
    keyEl.addEventListener("pointerdown", onPress);
    keyEl.addEventListener("pointerup", onRelease);
    keyEl.addEventListener("pointercancel", onRelease);
    keyEl.addEventListener("pointerleave", onRelease);
  } else {
    // Fallback for browsers with incomplete pointer event behavior.
    keyEl.addEventListener("mousedown", onPress);
    keyEl.addEventListener("mouseup", onRelease);
    keyEl.addEventListener("mouseleave", onRelease);
    keyEl.addEventListener("touchstart", onPress, { passive: true });
    keyEl.addEventListener("touchend", onRelease);
    keyEl.addEventListener("touchcancel", onRelease);
  }

  return keyEl;
}

function renderPiano() {
  KEYBOARD_LAYOUT.forEach((info) => {
    notesByName.set(info.note, info);
  });

  Object.entries(KEYBOARD_TO_NOTE).forEach(([keyboardKey, note]) => {
    notesByKeyboardKey.set(keyboardKey, note);
    keyboardByNote.set(note, keyboardKey);
  });

  KEYBOARD_LAYOUT.forEach((info) => {
    pianoEl.appendChild(createKeyElement(info));
  });
}

async function playNote(note) {
  const info = notesByName.get(note);
  if (!info) return;

  // Guard before the async gap: prevents same note being double-started
  // when two keydown events arrive before either resolves ensureAudioContext
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
  try {
    await ensureAudioContext();
  } catch {
    pendingNotes.delete(note);
    return;
  }
  pendingNotes.delete(note);

  const now = audioContext.currentTime;
  const midi = noteToMidi(note);
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
    osc.type = "sine";
    osc.frequency.value = info.frequency * ratio;
    oscGain.gain.value = gain;
    osc.connect(oscGain);
    oscGain.connect(masterGain);
    osc.start(now);
    osc.stop(now + decayTime + 0.5);
    oscillators.push(osc);
  });

  // Hammer strike transient
  const strikeDur = 0.06;
  const strikeLen = Math.floor(audioContext.sampleRate * strikeDur);
  const strikeBuf = audioContext.createBuffer(1, strikeLen, audioContext.sampleRate);
  const strikeData = strikeBuf.getChannelData(0);
  for (let i = 0; i < strikeLen; i++) strikeData[i] = Math.random() * 2 - 1;

  const strikeSource = audioContext.createBufferSource();
  strikeSource.buffer = strikeBuf;

  const strikeFilter = audioContext.createBiquadFilter();
  strikeFilter.type = "bandpass";
  strikeFilter.frequency.value = Math.min(info.frequency * 3, 8000);
  strikeFilter.Q.value = 1.0;

  const strikeGain = audioContext.createGain();
  strikeGain.gain.setValueAtTime(0.06, now);
  strikeGain.gain.exponentialRampToValueAtTime(0.0001, now + strikeDur);

  strikeSource.connect(strikeFilter);
  strikeFilter.connect(strikeGain);
  strikeGain.connect(masterGain);
  strikeSource.start(now);

  activeVoices.set(note, { oscillators, masterGain, decayEndTime: now + decayTime });
  setKeyActiveState(note, true);
}

function stopNote(note) {
  const voice = activeVoices.get(note);
  if (!voice || !audioContext) return;

  const now = audioContext.currentTime;
  // Damper pedal: accelerate decay
  voice.masterGain.gain.cancelScheduledValues(now);
  voice.masterGain.gain.setValueAtTime(Math.max(voice.masterGain.gain.value, 0.0001), now);
  voice.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
  voice.oscillators.forEach((osc) => {
    try { osc.stop(now + 0.16); } catch { /* already stopped */ }
  });

  pendingNotes.delete(note);
  activeVoices.delete(note);
  setKeyActiveState(note, false);
}

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  const note = notesByKeyboardKey.get(key);
  if (!note) {
    return;
  }

  event.preventDefault();
  if (pressedKeyboardKeys.has(key)) {
    return;
  }
  pressedKeyboardKeys.add(key);
  void playNote(note);
});

document.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  const note = notesByKeyboardKey.get(key);
  if (!note) {
    return;
  }

  event.preventDefault();
  pressedKeyboardKeys.delete(key);
  stopNote(note);
});

window.addEventListener("blur", () => {
  pressedKeyboardKeys.clear();
  Array.from(activeVoices.keys()).forEach((note) => stopNote(note));
});

renderPiano();
