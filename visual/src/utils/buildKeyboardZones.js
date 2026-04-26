export function buildKeyboardZones(keyboardBounds, totalKeys = 32) {
  if (!keyboardBounds || keyboardBounds.width <= 0 || keyboardBounds.height <= 0) {
    return [];
  }

  const keyWidth = keyboardBounds.width / totalKeys;

  return Array.from({ length: totalKeys }, (_, index) => {
    const x = keyboardBounds.x + index * keyWidth;
    return {
      keyId: index + 1,
      x,
      y: keyboardBounds.y,
      width: keyWidth,
      height: keyboardBounds.height,
      centerX: x + keyWidth / 2,
      centerY: keyboardBounds.y + keyboardBounds.height / 2
    };
  });
}
