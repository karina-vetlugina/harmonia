import './piano-styles.css';

const NOTE_ORDER = [
  'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3',
  'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4',
  'G#4', 'A4', 'A#4', 'B4', 'C5', 'C#5', 'D5', 'D#5', 'E5', 'F5'
];

const NOTE_TO_KEY = {
  E3: 'c', F3: 'v', G3: 'b', A3: 'n', B3: 'm',
  'F#3': 'g', 'G#3': 'h', 'A#3': 'j',
  C4: 'q', D4: 'w', E4: 'e', F4: 'r', G4: 't',
  A4: 'y', B4: 'u', C5: 'i', D5: 'o', E5: 'p', F5: '[',
  'C#4': '2', 'D#4': '3', 'F#4': '5', 'G#4': '6', 'A#4': '7',
  'C#5': '9', 'D#5': '0'
};

const WHITE_KEY_WIDTH = 54;
const WHITE_KEY_HEIGHT = 220;
const BLACK_KEY_WIDTH = 35;
const BLACK_KEY_HEIGHT = 140;

const KEYBOARD_TO_NOTE = Object.fromEntries(
  Object.entries(NOTE_TO_KEY).map(([note, key]) => [key, note])
);

function noteToMidi(note) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const pitch = note.slice(0, -1);
  const octave = Number(note.slice(-1));
  return (octave + 1) * 12 + names.indexOf(pitch);
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

export function mountPracticePiano(hostEl, { onNote } = {}) {
  hostEl.classList.add('piano-host');
  hostEl.innerHTML = '<div class="piano" id="practice-piano" aria-label="Playable piano keyboard"></div>';
  const pianoEl = hostEl.querySelector('#practice-piano');
  const pressedKeyboardKeys = new Set();

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
      setKeyActiveState(noteInfo.note, true);
      if (onNote) onNote({ pitch: noteInfo.note, midi: noteToMidi(noteInfo.note) });
    });
    keyEl.addEventListener('pointerup', () => setKeyActiveState(noteInfo.note, false));
    keyEl.addEventListener('pointercancel', () => setKeyActiveState(noteInfo.note, false));
    keyEl.addEventListener('pointerleave', () => setKeyActiveState(noteInfo.note, false));
    return keyEl;
  }

  buildKeyboardData().forEach((info) => pianoEl.appendChild(createKeyElement(info)));

  function onKeyDown(event) {
    const note = KEYBOARD_TO_NOTE[event.key.toLowerCase()];
    if (!note) return;
    event.preventDefault();
    if (pressedKeyboardKeys.has(event.key.toLowerCase())) return;
    pressedKeyboardKeys.add(event.key.toLowerCase());
    setKeyActiveState(note, true);
    if (onNote) onNote({ pitch: note, midi: noteToMidi(note) });
  }

  function onKeyUp(event) {
    const note = KEYBOARD_TO_NOTE[event.key.toLowerCase()];
    if (!note) return;
    event.preventDefault();
    pressedKeyboardKeys.delete(event.key.toLowerCase());
    setKeyActiveState(note, false);
  }

  function onBlur() {
    pressedKeyboardKeys.clear();
    pianoEl.querySelectorAll('.key.active').forEach((el) => el.classList.remove('active'));
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return {
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      hostEl.classList.remove('piano-host');
      hostEl.innerHTML = '';
    }
  };
}
