import { buildKeyboardZones } from '../utils/buildKeyboardZones.js';

const COLORS = {
  green: 'rgba(101, 255, 155, 0.85)',
  pink: 'rgba(255, 96, 190, 0.85)',
  orange: 'rgba(255, 166, 69, 0.85)'
};

function createCue(zone, color) {
  const cue = document.createElement('div');
  cue.className = 'target-cue';
  cue.style.left = `${zone.x}px`;
  cue.style.top = `${zone.y}px`;
  cue.style.width = `${zone.width}px`;
  cue.style.height = `${zone.height}px`;
  cue.style.background = `linear-gradient(180deg, ${color}, rgba(255,255,255,0.08))`;
  cue.style.boxShadow = `0 0 14px ${color}, inset 0 0 10px rgba(255,255,255,0.2)`;
  return cue;
}

export class KeyboardOverlay {
  constructor(container) {
    this.container = container;
    this.cueLayer = document.createElement('div');
    this.cueLayer.className = 'cue-layer';
    container.appendChild(this.cueLayer);
    this.zones = [];
  }

  setBounds(keyboardBounds) {
    this.keyboardBounds = keyboardBounds;
    this.zones = buildKeyboardZones(keyboardBounds, 32);
  }

  drawTargets(currentTarget, handMode) {
    this.cueLayer.innerHTML = '';
    if (!currentTarget || !this.zones.length) return;

    const showLeft = handMode === 'left' || handMode === 'both';
    const showRight = handMode === 'right' || handMode === 'both';

    if (showRight && currentTarget.greenKey) {
      const zone = this.zones[currentTarget.greenKey - 1];
      if (zone) this.cueLayer.appendChild(createCue(zone, COLORS.green));
    }
    if (showLeft && currentTarget.pinkKey) {
      const zone = this.zones[currentTarget.pinkKey - 1];
      if (zone) this.cueLayer.appendChild(createCue(zone, COLORS.pink));
    }
    if (showLeft && currentTarget.orangeKey) {
      const zone = this.zones[currentTarget.orangeKey - 1];
      if (zone) this.cueLayer.appendChild(createCue(zone, COLORS.orange));
    }
  }
}
