import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import song from "../viva-la-vida.json";

const NOTE_ORDER = [
  "E3", "F3", "F#3", "G3", "G#3", "A3", "A#3", "B3",
  "C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4",
  "C5", "C#5", "D5", "D#5", "E5", "F5",
];

// Q–P: white keys A3→C5 (main range)
// Number row: sharps in main range
// Left overflow white → bottom row (z x c), black → middle row (d s)
// Right overflow white → bottom row (n m ,), black → middle row (l j)
const NOTE_TO_KEY = {
  A3: "q", B3: "w", C4: "e", D4: "r", E4: "t",
  F4: "y", G4: "u", A4: "i", B4: "o", C5: "p",
  "A#3": "2", "C#4": "4", "D#4": "5", "F#4": "7", "G#4": "8", "A#4": "9",
  E3: "z", F3: "x", G3: "c", "F#3": "d", "G#3": "s",
  D5: "n", E5: "m", F5: ",", "C#5": "l", "D#5": "j",
};

const KEYBOARD_TO_NOTE = Object.fromEntries(
  Object.entries(NOTE_TO_KEY).map(([note, key]) => [key, note]),
);

const WHITE_KEY_WIDTH = 32;
const WHITE_KEY_HEIGHT = 110;
const BLACK_KEY_WIDTH = 20;
const BLACK_KEY_HEIGHT = 68;

const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function noteToMidi(note) {
  const pitch = note.slice(0, -1);
  const octave = Number(note.slice(-1));
  return (octave + 1) * 12 + PITCH_NAMES.indexOf(pitch);
}

function buildKeyboardData() {
  let whitePosition = 0;
  return NOTE_ORDER.map((note) => {
    const isSharp = note.includes("#");
    const leftPx = isSharp
      ? whitePosition * WHITE_KEY_WIDTH - BLACK_KEY_WIDTH / 2
      : whitePosition * WHITE_KEY_WIDTH;
    if (!isSharp) whitePosition += 1;
    return {
      note,
      midi: noteToMidi(note),
      frequency: midiToFrequency(noteToMidi(note)),
      type: isSharp ? "black" : "white",
      leftPx,
    };
  });
}

function buildLeftHandGroups(notes) {
  const groups = new Map();
  notes
    .filter((n) => n.hand === "L")
    .sort((a, b) => a.t - b.t || a.midi - b.midi)
    .forEach((n) => {
      const key = n.t.toFixed(3);
      if (!groups.has(key)) groups.set(key, { t: n.t, notes: [] });
      groups.get(key).notes.push(n);
    });
  return Array.from(groups.values());
}

const HARMONICS = [
  { ratio: 1, gain: 0.5 }, { ratio: 2, gain: 0.25 }, { ratio: 3, gain: 0.12 },
  { ratio: 4, gain: 0.07 }, { ratio: 5, gain: 0.04 }, { ratio: 6, gain: 0.02 },
];

function noteDecayTime(midi) {
  return 2.5 * 2 ** (-(midi - 60) / 36) + 0.4;
}

function usePianoAudio(keyboardLayout) {
  const audioContextRef = useRef(null);
  const audioUnlockPromiseRef = useRef(null);
  const compressorRef = useRef(null);
  const reverbRef = useRef(null);
  const activeVoicesRef = useRef(new Map());
  const pendingNotesRef = useRef(new Set());
  const notesByName = useMemo(
    () => new Map(keyboardLayout.map((info) => [info.note, info])),
    [keyboardLayout],
  );

  const setupAudioChain = useCallback(() => {
    const ctx = audioContextRef.current;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 6;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.15;
    compressor.connect(ctx.destination);

    const length = Math.floor(ctx.sampleRate * 2);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.2;
      }
    }
    const reverb = ctx.createConvolver();
    reverb.buffer = impulse;
    const reverbReturn = ctx.createGain();
    reverbReturn.gain.value = 0.25;
    reverb.connect(reverbReturn);
    reverbReturn.connect(compressor);
    compressorRef.current = compressor;
    reverbRef.current = reverb;
  }, []);

  // Must be called synchronously within a user gesture to unlock AudioContext
  const unlockAudio = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new window.AudioContext();
    }
    const ctx = audioContextRef.current;
    if (ctx.state !== "running") {
      ctx.resume().catch(() => {});
    }
    if (!compressorRef.current) setupAudioChain();
  }, [setupAudioChain]);

  const ensureAudioContext = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new window.AudioContext();
    }
    const ctx = audioContextRef.current;
    if (ctx.state !== "running") {
      if (!audioUnlockPromiseRef.current) {
        audioUnlockPromiseRef.current = ctx.resume().catch(() => {});
      }
      await audioUnlockPromiseRef.current;
      audioUnlockPromiseRef.current = null;
    }
    if (!compressorRef.current) setupAudioChain();
  }, [setupAudioChain]);

  const stopNote = useCallback((note) => {
    const ctx = audioContextRef.current;
    const voice = activeVoicesRef.current.get(note);
    if (!voice || !ctx) return;
    const now = ctx.currentTime;
    voice.masterGain.gain.cancelScheduledValues(now);
    voice.masterGain.gain.setValueAtTime(Math.max(voice.masterGain.gain.value, 0.0001), now);
    voice.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    voice.oscillators.forEach((osc) => { try { osc.stop(now + 0.16); } catch {} });
    pendingNotesRef.current.delete(note);
    activeVoicesRef.current.delete(note);
  }, []);

  const playNote = useCallback(
    async (note) => {
      const info = notesByName.get(note);
      if (!info || pendingNotesRef.current.has(note)) return false;
      const existing = activeVoicesRef.current.get(note);
      const ctx = audioContextRef.current;
      if (existing && ctx && ctx.currentTime < existing.decayEndTime - 0.1) return false;

      pendingNotesRef.current.add(note);
      try { await ensureAudioContext(); } catch {
        pendingNotesRef.current.delete(note);
        return false;
      }
      pendingNotesRef.current.delete(note);

      const ac = audioContextRef.current;
      const now = ac.currentTime;
      const decayTime = noteDecayTime(info.midi);
      const masterGain = ac.createGain();
      masterGain.gain.setValueAtTime(0, now);
      masterGain.gain.linearRampToValueAtTime(0.8, now + 0.003);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + decayTime);
      masterGain.connect(compressorRef.current);
      masterGain.connect(reverbRef.current);

      const oscillators = HARMONICS.map(({ ratio, gain }) => {
        const osc = ac.createOscillator();
        const oscGain = ac.createGain();
        osc.type = "sine";
        osc.frequency.value = info.frequency * ratio;
        oscGain.gain.value = gain;
        osc.connect(oscGain);
        oscGain.connect(masterGain);
        osc.start(now);
        osc.stop(now + decayTime + 0.5);
        return osc;
      });

      const strikeDur = 0.06;
      const strikeLen = Math.floor(ac.sampleRate * strikeDur);
      const strikeBuf = ac.createBuffer(1, strikeLen, ac.sampleRate);
      const strikeData = strikeBuf.getChannelData(0);
      for (let i = 0; i < strikeLen; i += 1) strikeData[i] = Math.random() * 2 - 1;
      const strikeSource = ac.createBufferSource();
      const strikeFilter = ac.createBiquadFilter();
      const strikeGain = ac.createGain();
      strikeSource.buffer = strikeBuf;
      strikeFilter.type = "bandpass";
      strikeFilter.frequency.value = Math.min(info.frequency * 3, 8000);
      strikeFilter.Q.value = 1;
      strikeGain.gain.setValueAtTime(0.06, now);
      strikeGain.gain.exponentialRampToValueAtTime(0.0001, now + strikeDur);
      strikeSource.connect(strikeFilter);
      strikeFilter.connect(strikeGain);
      strikeGain.connect(masterGain);
      strikeSource.start(now);

      activeVoicesRef.current.set(note, { oscillators, masterGain, decayEndTime: now + decayTime });
      return true;
    },
    [ensureAudioContext, notesByName],
  );

  const stopAll = useCallback(() => {
    Array.from(activeVoicesRef.current.keys()).forEach((note) => stopNote(note));
  }, [stopNote]);

  return { playNote, stopNote, stopAll, unlockAudio };
}

function Piano({ activeNotes, onNoteDown, onNoteUp, keyboardLayout }) {
  return (
    <div className="piano" aria-label="Playable piano keyboard">
      {keyboardLayout.map((info) => {
        const keyboardKey = NOTE_TO_KEY[info.note];
        return (
          <button
            type="button"
            key={info.note}
            className={`key ${info.type} ${activeNotes.has(info.note) ? "active" : ""}`}
            style={{
              left: `${info.leftPx}px`,
              width: `${info.type === "white" ? WHITE_KEY_WIDTH : BLACK_KEY_WIDTH}px`,
              height: `${info.type === "white" ? WHITE_KEY_HEIGHT : BLACK_KEY_HEIGHT}px`,
            }}
            aria-label={info.note}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onNoteDown(info.note); }}
            onPointerUp={() => onNoteUp(info.note)}
            onPointerCancel={() => onNoteUp(info.note)}
            onPointerLeave={() => onNoteUp(info.note)}
          />
        );
      })}
    </div>
  );
}

// Phase state machine:
// 'idle'    → waiting for first key press (audio unlock)
// 'target'  → app playing the target chord
// 'waiting' → user's turn to play
// 'success' → correct! countdown before next chord
// 'complete'→ all chords done

export default function App() {
  const keyboardLayout = useMemo(buildKeyboardData, []);
  const leftHandGroups = useMemo(() => buildLeftHandGroups(song.notes), []);

  const [activeNotes, setActiveNotes] = useState(() => new Set());
  const [phase, setPhase] = useState("idle");
  const [chordIndex, setChordIndex] = useState(0);

  const phaseRef = useRef("idle");
  const chordIndexRef = useRef(0);
  const pressedNotesRef = useRef(new Set()); // midi numbers pressed this attempt
  const evalTimerRef = useRef(null);
  const replayTimerRef = useRef(null);
  const playbackTimersRef = useRef([]);
  const hasStartedRef = useRef(false);
  const pressedKeyboardKeysRef = useRef(new Set());

  const { playNote, stopNote, stopAll, unlockAudio } = usePianoAudio(keyboardLayout);

  useEffect(() => { chordIndexRef.current = chordIndex; }, [chordIndex]);

  // Play the target chord, then enter 'waiting'
  const playTargetChord = useCallback((index) => {
    const group = leftHandGroups[index];
    if (!group) return;

    playbackTimersRef.current.forEach(clearTimeout);
    playbackTimersRef.current = [];
    clearTimeout(evalTimerRef.current);
    clearTimeout(replayTimerRef.current);
    pressedNotesRef.current = new Set();

    phaseRef.current = "target";
    setPhase("target");

    const notes = group.notes.map((n) => n.pitch);
    notes.forEach((note) => void playNote(note));

    const t = setTimeout(() => {
      notes.forEach((note) => stopNote(note));
      phaseRef.current = "waiting";
      setPhase("waiting");
    }, 700);

    playbackTimersRef.current = [t];
  }, [leftHandGroups, playNote, stopNote]);

  // Auto-play whenever chordIndex changes (after first interaction)
  useEffect(() => {
    if (!hasStartedRef.current) return;
    playTargetChord(chordIndex);
    return () => {
      playbackTimersRef.current.forEach(clearTimeout);
      playbackTimersRef.current = [];
    };
  }, [chordIndex, playTargetChord]);

  // Evaluate pressed notes against expected chord
  const evaluateAttempt = useCallback(() => {
    if (phaseRef.current !== "waiting") return;

    const index = chordIndexRef.current;
    const group = leftHandGroups[index];
    if (!group) return;

    const pressed = pressedNotesRef.current;
    const correct = group.notes.every((n) => pressed.has(n.midi));

    if (correct) {
      phaseRef.current = "success";
      setPhase("success");

      // Play the chord so user hears confirmation
      const notes = group.notes.map((n) => n.pitch);
      notes.forEach((note) => void playNote(note));

      const isLast = index === leftHandGroups.length - 1;
      const t = setTimeout(() => {
        if (isLast) {
          phaseRef.current = "complete";
          setPhase("complete");
        } else {
          chordIndexRef.current = index + 1;
          setChordIndex(index + 1);
        }
      }, 600);
      playbackTimersRef.current.push(t);
    } else {
      // Wrong: schedule replay only after user pauses
      pressedNotesRef.current = new Set();
      replayTimerRef.current = setTimeout(() => playTargetChord(index), 1200);
    }
  }, [leftHandGroups, playNote, playTargetChord]);

  const handleNoteDown = useCallback(
    (note) => {
      const current = phaseRef.current;
      if (current === "complete") return;

      unlockAudio(); // sync — must happen in gesture handler

      if (current === "idle") {
        // First interaction: unlock audio, then play target
        setActiveNotes((prev) => new Set(prev).add(note));
        void playNote(note);
        hasStartedRef.current = true;
        phaseRef.current = "target";
        const t = setTimeout(() => playTargetChord(chordIndexRef.current), 400);
        playbackTimersRef.current.push(t);
        return;
      }

      if (current === "waiting") {
        // Cancel any pending replay — user is still trying
        clearTimeout(replayTimerRef.current);
        pressedNotesRef.current.add(noteToMidi(note));
        setActiveNotes((prev) => new Set(prev).add(note));
        void playNote(note);
      }
    },
    [unlockAudio, playNote, evaluateAttempt, playTargetChord],
  );

  const handleNoteUp = useCallback(
    (note) => {
      setActiveNotes((prev) => {
        const next = new Set(prev);
        next.delete(note);
        return next;
      });

      stopNote(note);

      if (phaseRef.current === "waiting") {
        // Debounce eval on release — commit when hands lift
        clearTimeout(evalTimerRef.current);
        evalTimerRef.current = setTimeout(evaluateAttempt, 300);
      }
    },
    [stopNote, evaluateAttempt],
  );

  useEffect(() => {
    const onKeyDown = (event) => {
      const key = event.key.toLowerCase();
      const note = KEYBOARD_TO_NOTE[key];
      if (!note) return;
      event.preventDefault();
      if (pressedKeyboardKeysRef.current.has(key)) return;
      pressedKeyboardKeysRef.current.add(key);
      handleNoteDown(note);
    };
    const onKeyUp = (event) => {
      const key = event.key.toLowerCase();
      const note = KEYBOARD_TO_NOTE[key];
      if (!note) return;
      event.preventDefault();
      pressedKeyboardKeysRef.current.delete(key);
      handleNoteUp(note);
    };
    const onBlur = () => {
      pressedKeyboardKeysRef.current.clear();
      setActiveNotes(new Set());
      stopAll();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [handleNoteDown, handleNoteUp, stopAll]);

  // Cleanup all timers on unmount
  useEffect(() => () => {
    playbackTimersRef.current.forEach(clearTimeout);
    clearTimeout(evalTimerRef.current);
    clearTimeout(replayTimerRef.current);
  }, []);

  const currentGroup = leftHandGroups[chordIndex] ?? leftHandGroups.at(-1);
  const progress = chordIndex + (phase === "complete" ? 1 : 0);

  const statusText = {
    idle: "Press any key to start",
    target: "Listen\u2026",
    waiting: "Your turn",
    success: "Nice \u2014 next up",
    complete: "Complete",
  }[phase] ?? "";

  return (
    <main className="app-shell">
      <section className="practice-card">
        <div>
          <p className="eyebrow">Left hand MVP</p>
          <h1>{song.title}</h1>
          <p className="subtitle">
            {song.key} · {song.bpm} BPM · {song.leftHandPattern}
          </p>
        </div>
        <div className="target-card">
          <small>{progress}/{leftHandGroups.length}</small>
        </div>
      </section>

      <section className="workspace">
        <p className={`status ${phase === "success" ? "status--success" : ""}`}>{statusText}</p>
        {phase === "success" && <div className="countdown-bar" key={chordIndex} />}
        <div className="chord-steps">
          {leftHandGroups.map((_, i) => (
            <span
              key={i}
              className={[
                "chord-step",
                i < progress ? "done" : "",
                i === chordIndex && phase !== "complete" ? "current" : "",
                i === chordIndex && phase === "success" ? "success" : "",
              ].filter(Boolean).join(" ")}
            />
          ))}
        </div>
      </section>

      <div className="piano-dock">
        <Piano
          activeNotes={activeNotes}
          onNoteDown={handleNoteDown}
          onNoteUp={handleNoteUp}
          keyboardLayout={keyboardLayout}
        />
      </div>
    </main>
  );
}
