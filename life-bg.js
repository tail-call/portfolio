const CONFIG = {
  cellSize: 18,        // Размер одной клетки в пикселях (больше = крупнее сетка)
  stepInterval: 140,   // Скорость эволюции в мс (меньше = быстрее)
  initialDensity: 0.16,// Насколько плотно заселить экран при старте (0.1 - 0.3)
  maxOpacity: 0.42,    // Максимальная прозрачность клеток (чтобы не мешали тексту)
  mouseSpawn: true,    // Оставлять ли живые клетки за курсором мыши
};

const COLORS = {
  young: [255, 44, 130],   // --accent-primary (#ff2c82)
  mid:   [193, 77, 208],   // из .gradient-text (#c14dd0)
  old:   [138, 154, 233],  // из .gradient-text (#8a9ae9)
  trail: [255, 124, 222],  // --accent-secondary (#ff7cde)
};

const canvas = document.createElement('canvas');
Object.assign(canvas.style, {
  position: 'fixed',
  inset: '0',
  width: '100%',
  height: '100%',
  zIndex: '-2',
  pointerEvents: 'none',
});
document.body.prepend(canvas);

const ctx = canvas.getContext('2d');
let cols = 0;
let rows = 0;
let grid = new Uint8Array(0);
let nextGrid = new Uint8Array(0);
let heat = new Float32Array(0); // Плавная яркость (0..1)
let age = new Uint16Array(0);   // Возраст клетки

const idx = (x, y) => ((y + rows) % rows) * cols + ((x + cols) % cols);

function seedPattern(cx, cy) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (Math.random() < 0.55) {
        const i = idx(cx + dx, cy + dy);
        grid[i] = 1;
        heat[i] = 1;
      }
    }
  }
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  cols = Math.ceil(width / CONFIG.cellSize);
  rows = Math.ceil(height / CONFIG.cellSize);

  const total = cols * rows;
  grid = new Uint8Array(total);
  nextGrid = new Uint8Array(total);
  heat = new Float32Array(total);
  age = new Uint16Array(total);

  for (let i = 0; i < total; i++) {
    if (Math.random() < CONFIG.initialDensity) {
      grid[i] = 1;
      heat[i] = Math.random() * 0.8 + 0.2;
    }
  }
}

function stepLife() {
  let changes = 0;
  let aliveCount = 0;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          neighbors += grid[idx(x + dx, y + dy)];
        }
      }

      const i = y * cols + x;
      const alive = grid[i];
      const next = alive ? (neighbors === 2 || neighbors === 3 ? 1 : 0) : (neighbors === 3 ? 1 : 0);

      nextGrid[i] = next;
      if (next !== alive) changes++;
      if (next) {
        aliveCount++;
        age[i] = alive ? Math.min(age[i] + 1, 60) : 1;
      } else {
        age[i] = 0;
      }
    }
  }

  [grid, nextGrid] = [nextGrid, grid];

  if (changes < Math.max(4, (cols * rows) * 0.002) || aliveCount < 15) {
    seedPattern(
      Math.floor(Math.random() * cols),
      Math.floor(Math.random() * rows)
    );
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function getCellColor(cellAge, cellHeat, isAlive) {
  let c1, c2, t;
  if (!isAlive) {
    c1 = COLORS.trail;
    c2 = COLORS.old;
    t = 1 - cellHeat;
  } else if (cellAge < 6) {
    c1 = COLORS.young;
    c2 = COLORS.mid;
    t = cellAge / 6;
  } else {
    c1 = COLORS.mid;
    c2 = COLORS.old;
    t = Math.min((cellAge - 6) / 20, 1);
  }

  const r = Math.round(lerp(c1[0], c2[0], t));
  const g = Math.round(lerp(c1[1], c2[1], t));
  const b = Math.round(lerp(c1[2], c2[2], t));
  const alpha = cellHeat * CONFIG.maxOpacity;
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

let lastTime = performance.now();
let accumulator = 0;

function animate(now) {
  ctx.globalAlpha = 0.2;
  let dt = now - lastTime;
  lastTime = now;

  // Защита от скачка при переключении вкладок
  if (dt > 500) dt = 0;

  accumulator += dt;
  while (accumulator >= CONFIG.stepInterval) {
    stepLife();
    accumulator -= CONFIG.stepInterval;
  }

  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  const size = CONFIG.cellSize;
  const gap = Math.max(2, Math.floor(size * 0.2));
  const drawSize = size - gap;
  const radius = Math.min(4, drawSize * 0.25);

  // Плавная интерполяция прозрачности (60 FPS)
  const riseSpeed = 0.22;
  const fadeSpeed = 0.055;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const target = grid[i];

      if (target > heat[i]) {
        heat[i] = Math.min(1, heat[i] + riseSpeed);
      } else if (target < heat[i]) {
        heat[i] = Math.max(0, heat[i] - fadeSpeed);
      }

      if (heat[i] < 0.015) continue;

      ctx.fillStyle = getCellColor(age[i], heat[i], target === 1);
      const px = x * size + gap * 0.5;
      const py = y * size + gap * 0.5;

      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(px, py, drawSize, drawSize, radius);
      } else {
        ctx.rect(px, py, drawSize, drawSize);
      }
      ctx.fill();
    }
  }

  requestAnimationFrame(animate);
}

// Интерактив: лёгкое рисование клеток движением мыши
if (CONFIG.mouseSpawn) {
  let lastSpawn = 0;
  window.addEventListener('mousemove', (e) => {
    const now = performance.now();
    if (now - lastSpawn < 35) return;
    lastSpawn = now;

    const cx = Math.floor(e.clientX / CONFIG.cellSize);
    const cy = Math.floor(e.clientY / CONFIG.cellSize);

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (Math.random() < 0.45) {
          const i = idx(cx + dx, cy + dy);
          grid[i] = 1;
          heat[i] = Math.max(heat[i], 0.9);
        }
      }
    }
  }, { passive: true });
}

window.addEventListener('resize', resize);
resize();
requestAnimationFrame(animate);
