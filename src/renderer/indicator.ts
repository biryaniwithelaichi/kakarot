import './styles/indicator.css';

const canvas = document.getElementById('waveform') as HTMLCanvasElement | null;
const ctx = canvas?.getContext('2d');
const pill = document.querySelector('.glass-pill') as HTMLDivElement | null;

let audioLevel = 0;
let phase = 0;
let width = 0;
let height = 0;

const resizeCanvas = () => {
  if (!canvas || !ctx) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  width = rect.width;
  height = rect.height;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
};

const drawSineWave = (amplitude: number, phaseOffset: number, alpha: number, lineWidth: number) => {
  if (!ctx) return;
  const centerY = height / 2;
  const frequency = (Math.PI * 2 * 1.2) / width;

  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, `rgba(74, 144, 226, ${0.2 * alpha})`);
  gradient.addColorStop(0.5, `rgba(74, 144, 226, ${0.9 * alpha})`);
  gradient.addColorStop(1, `rgba(74, 144, 226, ${0.3 * alpha})`);

  ctx.beginPath();
  for (let x = 0; x <= width; x += 1) {
    const y = centerY + Math.sin(x * frequency + phase + phaseOffset) * amplitude;
    if (x === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.strokeStyle = gradient;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.stroke();
};

const drawWave = () => {
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, width, height);

  const maxAmplitude = Math.max(0, height / 2 - 4);
  const minAmplitude = maxAmplitude * 0.16;
  const boosted = Math.pow(Math.min(1, audioLevel), 0.65) * 1.5;
  const amplitude = Math.min(maxAmplitude, Math.max(minAmplitude, boosted * maxAmplitude));

  drawSineWave(amplitude * 0.9, 0, 0.9, 2.4);
  drawSineWave(amplitude * 0.6, Math.PI / 3, 0.6, 1.8);
  drawSineWave(amplitude * 0.4, Math.PI / 1.7, 0.4, 1.4);

  phase += 0.12;
  requestAnimationFrame(drawWave);
};

const kakarot = (window as any).kakarot;
if (kakarot?.indicator?.onAudioAmplitude) {
  kakarot.indicator.onAudioAmplitude((level: number) => {
    audioLevel = Math.max(0, Math.min(1, level));
  });
}

let dragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragMoved = false;

const onMouseMove = (event: MouseEvent) => {
  if (!dragging) return;
  const dx = event.screenX - dragStartX;
  const dy = event.screenY - dragStartY;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
    dragMoved = true;
  }
  kakarot?.indicator?.dragMove?.(event.screenX, event.screenY);
};

const onMouseUp = (event: MouseEvent) => {
  if (!dragging) return;
  dragging = false;
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
  kakarot?.indicator?.dragEnd?.();
  if (!dragMoved) {
    kakarot?.indicator?.clicked?.();
  }
  dragMoved = false;
};

pill?.addEventListener('mousedown', (event: MouseEvent) => {
  dragging = true;
  dragMoved = false;
  dragStartX = event.screenX;
  dragStartY = event.screenY;
  kakarot?.indicator?.dragStart?.(event.screenX, event.screenY);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
});

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
requestAnimationFrame(drawWave);
