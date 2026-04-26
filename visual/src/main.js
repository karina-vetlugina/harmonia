import { mountPracticePiano } from './piano/mountPracticePiano.js';

const app = document.getElementById('app');

let piano = null;

function render() {
  if (piano) {
    piano.destroy();
    piano = null;
  }
  app.innerHTML = `
    <main class="practice-screen">
      <section class="keyboard-section">
        <div id="piano-host"></div>
      </section>
      <section class="feedback-section">
        <div class="feedback-playground">
          <div class="center-line"></div>
          <div class="heat-orb" id="pink-orb"></div>
          <div class="heat-orb" id="orange-orb"></div>
        </div>
      </section>
    </main>
  `;
  piano = mountPracticePiano(document.getElementById('piano-host'));
  document.getElementById('pink-orb').style.left = '48%';
  document.getElementById('pink-orb').style.top = '53%';
  document.getElementById('pink-orb').style.background = 'radial-gradient(circle, rgba(255,96,190,0.9) 0%, rgba(95,126,255,0.25) 48%, rgba(19,16,35,0) 78%)';
  document.getElementById('orange-orb').style.left = '52%';
  document.getElementById('orange-orb').style.top = '56%';
  document.getElementById('orange-orb').style.background = 'radial-gradient(circle, rgba(255,166,69,0.9) 0%, rgba(95,126,255,0.25) 48%, rgba(19,16,35,0) 78%)';
}

window.addEventListener('beforeunload', () => {
  if (piano) piano.destroy();
});
render();
