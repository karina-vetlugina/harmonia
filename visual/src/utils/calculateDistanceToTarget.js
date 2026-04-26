function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function calculateDistanceToTarget({
  userX,
  keyboardBounds,
  currentTarget,
  handMode,
  tolerance = 0
}) {
  if (!keyboardBounds || keyboardBounds.width <= 0 || !currentTarget) {
    return {
      direction: 'center',
      distance: 0,
      intensity: 0,
      isCorrect: false,
      detectedKey: null,
      targetKey: null
    };
  }

  const raw = ((userX - keyboardBounds.x) / keyboardBounds.width) * 32;
  const detectedKey = Math.max(1, Math.min(32, Math.round(raw)));

  const candidates = [];
  if (handMode === 'left' || handMode === 'both') {
    if (typeof currentTarget.pinkKey === 'number') candidates.push(currentTarget.pinkKey);
    if (typeof currentTarget.orangeKey === 'number') candidates.push(currentTarget.orangeKey);
  }
  if (handMode === 'right' || handMode === 'both') {
    if (typeof currentTarget.greenKey === 'number') candidates.push(currentTarget.greenKey);
  }

  if (!candidates.length) {
    return {
      direction: 'center',
      distance: 0,
      intensity: 0,
      isCorrect: false,
      detectedKey,
      targetKey: null
    };
  }

  let targetKey = candidates[0];
  let delta = detectedKey - targetKey;
  for (let i = 1; i < candidates.length; i++) {
    const maybeDelta = detectedKey - candidates[i];
    if (Math.abs(maybeDelta) < Math.abs(delta)) {
      delta = maybeDelta;
      targetKey = candidates[i];
    }
  }

  const distance = Math.abs(delta);
  const isCorrect = distance <= tolerance;
  const direction = isCorrect ? 'center' : delta < 0 ? 'left' : 'right';
  const intensity = isCorrect ? 1 : clamp01(1 - distance / 12);

  return {
    direction,
    distance,
    intensity,
    isCorrect,
    detectedKey,
    targetKey
  };
}
