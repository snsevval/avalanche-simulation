import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160/build/three.module.js";

const N = 128;
const SIZE = 200;
const dx = SIZE / (N - 1);
const dt = 0.016;
const g = 9.81;
const friction = 0.9;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const idx = (i, j) => i * N + j;

let Z  = new Float32Array(N * N);
let h  = new Float32Array(N * N);
let u  = new Float32Array(N * N);
let v  = new Float32Array(N * N);
let h2 = new Float32Array(N * N);

const statusEl = document.getElementById("status");
function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }

async function loadTerrainFromBackend(centerLat, centerLon) {
  resetSim();
  setStatus("Arazi (GeoTIFF) yükleniyor...");
  const url = `http://127.0.0.1:8010/terrain?lat=${centerLat}&lon=${centerLon}&n=${N}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Backend hata: ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  const elev2D = json.elevation;
  const n2 = json.n;
  Z.fill(0);
  const minE = json.min ?? 0;
  const maxE = json.max ?? 1;
  const range = Math.max(1e-6, maxE - minE);
  const verticalExaggeration = 1.2;
  const heightScale = 80;
  const offset = Math.floor((N - n2) / 2);
  for (let j = 0; j < n2; j++) {
    for (let i = 0; i < n2; i++) {
      const e = elev2D[j][i];
      const zScaled = ((e - minE) / range) * heightScale * verticalExaggeration;
      const ii = i + offset, jj = j + offset;
      if (ii >= 0 && ii < N && jj >= 0 && jj < N) Z[idx(ii, jj)] = zScaled;
    }
  }
  applyHeights(terrain, Z, null);
  applyHeights(snow, Z, h);
  setStatus(`Arazi yüklendi (GeoTIFF). min=${Math.round(minE)}m max=${Math.round(maxE)}m`);
}

function sampleBilinear(arr, x, y) {
  x = clamp(x, 0, N - 1); y = clamp(y, 0, N - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0+1, N-1), y1 = Math.min(y0+1, N-1);
  const sx = x-x0, sy = y-y0;
  const a = arr[idx(x0,y0)], b = arr[idx(x1,y0)];
  const c = arr[idx(x0,y1)], d = arr[idx(x1,y1)];
  return (a*(1-sx)+b*sx)*(1-sy) + (c*(1-sx)+d*sx)*sy;
}

function safe(val, fallback = 0) { return Number.isFinite(val) ? val : fallback; }

function resetSim() {
  h.fill(0);
  u.fill(0);
  v.fill(0);
}

Z.fill(0);

// THREE.JS
const scene = new THREE.Scene();

let camTheta  = Math.PI / 4;
let camPhi    = Math.PI / 4;
let camRadius = 380;
const camTarget = new THREE.Vector3(0, 20, 0);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2000);
function updateCamera() {
  camPhi = clamp(camPhi, 0.05, Math.PI / 2 - 0.01);
  camera.position.set(
    camTarget.x + camRadius * Math.sin(camPhi) * Math.sin(camTheta),
    camTarget.y + camRadius * Math.cos(camPhi),
    camTarget.z + camRadius * Math.sin(camPhi) * Math.cos(camTheta)
  );
  camera.lookAt(camTarget);
}
updateCamera();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.25));
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(200, 300, 100);
scene.add(dir);

const gridGeo = new THREE.PlaneGeometry(SIZE, SIZE, N - 1, N - 1);
gridGeo.rotateX(-Math.PI / 2);

const terrainMat = new THREE.MeshStandardMaterial({ color: 0x2b3a55, roughness: 1.0, metalness: 0.0 });
const terrain = new THREE.Mesh(gridGeo.clone(), terrainMat);
scene.add(terrain);

const snowMat = new THREE.MeshStandardMaterial({
  color: 0xdde6ff, roughness: 0.9, metalness: 0.0,
  transparent: true, opacity: 0.95, vertexColors: false
});
const snow = new THREE.Mesh(gridGeo.clone(), snowMat);
snow.position.y = 0.3;
scene.add(snow);

function applyHeights(mesh, baseArray, addArray = null) {
  const pos = mesh.geometry.attributes.position;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = idx(i, j);
      pos.setY(j * N + i, baseArray[k] + (addArray ? addArray[k] : 0));
    }
  }
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

applyHeights(terrain, Z, null);
applyHeights(snow, Z, h);

// -----------------------------
// HEATMAP
// -----------------------------
let heatmapMode = false;

function momentumToColor(m, maxM) {
  const t = clamp(m / maxM, 0, 1);
  let r, g, b;
  if (t < 0.5) {
    const s = t / 0.5;
    r = s; g = s; b = 1 - s * 0.5;
  } else {
    const s = (t - 0.5) / 0.5;
    r = 1; g = 1 - s; b = 0;
  }
  return { r, g, b };
}

function applyHeatmap() {
  const geo = snow.geometry;
  const count = N * N;
  if (!geo.attributes.color) {
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  }
  const colors = geo.attributes.color;
  let maxM = 0.001;
  for (let k = 0; k < count; k++) {
    const m = h[k] * Math.sqrt(u[k]*u[k] + v[k]*v[k]);
    if (m > maxM) maxM = m;
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = idx(i, j);
      const m = h[k] * Math.sqrt(u[k]*u[k] + v[k]*v[k]);
      const c = momentumToColor(m, maxM);
      colors.setXYZ(j * N + i, c.r, c.g, c.b);
    }
  }
  colors.needsUpdate = true;
}

function setHeatmapMode(on) {
  heatmapMode = on;
  snowMat.vertexColors = on;
  snowMat.color.set(on ? 0xffffff : 0xdde6ff);
  snowMat.needsUpdate = true;
  btnNormal.style.borderColor = on ? 'transparent' : '#7eb8ff';
  btnHeatmap.style.borderColor = on ? '#ff6b6b' : 'transparent';
}

// -----------------------------
// BARİYER SİSTEMİ
// -----------------------------
let barrierMode = false;
const barriers = []; // { mesh, cells: [{i,j}] }

function addBarrier(ci, cj, widthM, heightM, angleDeg) {
  const wCells = Math.max(1, Math.round(widthM / dx));
  const hCells = Math.max(1, Math.round(heightM / dx));
  const halfW  = Math.floor(wCells / 2);
  const halfH  = Math.floor(hCells / 2);
  const BARRIER_HEIGHT = 40;
  const angleRad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  const cells = [];

  for (let dj = -halfH; dj <= halfH; dj++) {
    for (let di = -halfW; di <= halfW; di++) {
      // açıya göre döndür
      const ri = Math.round(di * cos - dj * sin);
      const rj = Math.round(di * sin + dj * cos);
      const ii = clamp(ci + ri, 1, N - 2);
      const jj = clamp(cj + rj, 1, N - 2);
      const k  = idx(ii, jj);
      Z[k] += BARRIER_HEIGHT;
      cells.push({ i: ii, j: jj });
    }
  }

  // Görsel kutu
  const worldW = wCells * dx;
  const worldD = hCells * dx;
  const boxGeo = new THREE.BoxGeometry(worldW, BARRIER_HEIGHT, worldD);
  const boxMat = new THREE.MeshStandardMaterial({ color: 0xe8c87a, roughness: 0.7, metalness: 0.1 });
  const box    = new THREE.Mesh(boxGeo, boxMat);
  const wx = (ci / (N - 1)) * SIZE - SIZE / 2;
  const wz = (cj / (N - 1)) * SIZE - SIZE / 2;
  const wy = Z[idx(ci, cj)] - BARRIER_HEIGHT / 2;
  box.position.set(wx, wy, wz);
  box.rotation.y = -angleRad;
  scene.add(box);

  barriers.push({ mesh: box, cells });
  applyHeights(terrain, Z, null);
  applyHeights(snow, Z, h);
}

function setBarrierMode(on) {
  barrierMode = on;
  btnBarrier.style.borderColor = on ? '#f0a500' : 'transparent';
  btnBarrier.style.background   = on
    ? 'rgba(240,165,0,0.3)'
    : 'rgba(255,255,255,0.15)';
  renderer.domElement.style.cursor = on ? 'crosshair' : 'default';
}

// -----------------------------
// SOL PANEL (mod + bariyer)
// -----------------------------
const leftPanel = document.createElement('div');
leftPanel.style.cssText = `
  position:fixed; left:12px; bottom:16px;
  display:flex; flex-direction:column; gap:8px;
  user-select:none;
`;

const modBtnStyle = `
  padding:8px 14px; border-radius:10px; border:2px solid transparent;
  cursor:pointer; font-size:13px; font-weight:600;
  background:rgba(255,255,255,0.15); color:#fff;
`;

// Normal / Heatmap
const btnNormal = document.createElement('button');
btnNormal.textContent = ' Normal';
btnNormal.style.cssText = modBtnStyle;
btnNormal.style.borderColor = '#7eb8ff';
btnNormal.addEventListener('click', () => setHeatmapMode(false));

const btnHeatmap = document.createElement('button');
btnHeatmap.textContent = ' Heatmap';
btnHeatmap.style.cssText = modBtnStyle;
btnHeatmap.addEventListener('click', () => setHeatmapMode(true));

// Bariyer bölümü
const barrierSection = document.createElement('div');
barrierSection.style.cssText = `
  background:rgba(0,0,0,0.35); border-radius:10px;
  padding:8px 10px; display:flex; flex-direction:column; gap:6px;
`;

const barrierTitle = document.createElement('div');
barrierTitle.textContent = ' Bariyer';
barrierTitle.style.cssText = 'color:#fff; font-size:13px; font-weight:700;';

const inputStyle = `
  width:70px; padding:4px 6px; border-radius:6px; border:none; font-size:12px;
`;

const rowW = document.createElement('div');
rowW.style.cssText = 'display:flex; align-items:center; gap:6px; color:#ccc; font-size:12px;';
rowW.innerHTML = 'En (m)';
const inputW = document.createElement('input');
inputW.type = 'number'; inputW.value = '10'; inputW.min = '1';
inputW.style.cssText = inputStyle;
rowW.appendChild(inputW);

const rowH = document.createElement('div');
rowH.style.cssText = 'display:flex; align-items:center; gap:6px; color:#ccc; font-size:12px;';
rowH.innerHTML = 'Boy (m)';
const inputH = document.createElement('input');
inputH.type = 'number'; inputH.value = '5'; inputH.min = '1';
inputH.style.cssText = inputStyle;
rowH.appendChild(inputH);

// Açı seçici
let barrierAngle = 0;
const angleRow = document.createElement('div');
angleRow.style.cssText = 'display:flex; gap:4px; flex-wrap:wrap;';

const angles = [
  { label: '━', deg: 0,   title: 'Yatay' },
  { label: '┃', deg: 90,  title: 'Dikey' },
  { label: '╱', deg: 45,  title: 'Sağa yamuk' },
  { label: '╲', deg: 135, title: 'Sola yamuk' },
];
const angleBtns = [];
angles.forEach(a => {
  const b = document.createElement('button');
  b.textContent = a.label;
  b.title = a.title;
  b.style.cssText = `
    width:36px; height:36px; border-radius:8px; border:2px solid transparent;
    cursor:pointer; font-size:16px; font-weight:bold;
    background:rgba(255,255,255,0.15); color:#fff;
  `;
  b.addEventListener('click', () => {
    barrierAngle = a.deg;
    angleBtns.forEach(x => x.style.borderColor = 'transparent');
    b.style.borderColor = '#f0a500';
  });
  angleBtns.push(b);
  angleRow.appendChild(b);
});
angleBtns[0].style.borderColor = '#f0a500'; // başlangıçta yatay seçili

const btnBarrier = document.createElement('button');
btnBarrier.textContent = 'Bariyer Ekle';
btnBarrier.style.cssText = modBtnStyle;
btnBarrier.addEventListener('click', () => setBarrierMode(!barrierMode));

barrierSection.appendChild(barrierTitle);
barrierSection.appendChild(rowW);
barrierSection.appendChild(rowH);
barrierSection.appendChild(angleRow);
barrierSection.appendChild(btnBarrier);

leftPanel.appendChild(btnNormal);
leftPanel.appendChild(btnHeatmap);
leftPanel.appendChild(barrierSection);
document.body.appendChild(leftPanel);

// -----------------------------
// KAMERA KONTROL PANELİ
// -----------------------------
const btnStyle = `
  width:40px; height:40px; border-radius:8px; border:none; cursor:pointer;
  background:rgba(255,255,255,0.15); color:#fff; font-size:16px; font-weight:bold;
`;
const camPanel = document.createElement('div');
camPanel.style.cssText = `
  position:fixed; right:14px; top:50%; transform:translateY(-50%);
  display:flex; flex-direction:column; align-items:center; gap:5px; user-select:none;
`;
function camBtn(label, action) {
  const b = document.createElement('button');
  b.innerHTML = label; b.style.cssText = btnStyle;
  b.addEventListener('mouseenter', () => b.style.background = 'rgba(255,255,255,0.28)');
  b.addEventListener('mouseleave', () => b.style.background = 'rgba(255,255,255,0.15)');
  let iv = null;
  b.addEventListener('pointerdown', (e) => { e.stopPropagation(); action(); iv = setInterval(action, 80); });
  b.addEventListener('pointerup',    () => clearInterval(iv));
  b.addEventListener('pointerleave', () => clearInterval(iv));
  return b;
}
function camBtnOnce(label, action) {
  const b = document.createElement('button');
  b.innerHTML = label; b.style.cssText = btnStyle;
  b.addEventListener('mouseenter', () => b.style.background = 'rgba(255,255,255,0.28)');
  b.addEventListener('mouseleave', () => b.style.background = 'rgba(255,255,255,0.15)');
  b.addEventListener('pointerdown', (e) => { e.stopPropagation(); action(); });
  return b;
}
const row1 = document.createElement('div'); row1.style.cssText = 'display:flex; gap:5px;';
row1.appendChild(camBtn('←', () => { camTheta -= 0.08; updateCamera(); }));
row1.appendChild(camBtn('↑', () => { camPhi   -= 0.08; updateCamera(); }));
row1.appendChild(camBtn('→', () => { camTheta += 0.08; updateCamera(); }));
const row2 = document.createElement('div'); row2.style.cssText = 'display:flex; gap:5px;';
row2.appendChild(camBtn('↓', () => { camPhi   += 0.08; updateCamera(); }));
const row3 = document.createElement('div'); row3.style.cssText = 'display:flex; gap:5px;';
row3.appendChild(camBtn('+', () => { camRadius = clamp(camRadius - 20, 80, 800); updateCamera(); }));
row3.appendChild(camBtn('−', () => { camRadius = clamp(camRadius + 20, 80, 800); updateCamera(); }));
const row4 = document.createElement('div'); row4.style.cssText = 'display:flex; gap:5px;';
row4.appendChild(camBtnOnce('⊙', () => { camPhi = 0.05; updateCamera(); }));
camPanel.appendChild(row1); camPanel.appendChild(row2);
camPanel.appendChild(row3); camPanel.appendChild(row4);
document.body.appendChild(camPanel);

// -----------------------------
// TIKLAMA — kar veya bariyer
// -----------------------------
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let snowAmount = 1.0;
document.querySelectorAll(".load-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".load-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    snowAmount = parseFloat(btn.dataset.amount);
  });
});

function addSnowAt(i0, j0, amount) {
  const r = 5;
  for (let dj = -r; dj <= r; dj++) {
    for (let di = -r; di <= r; di++) {
      const i = i0 + di, j = j0 + dj;
      if (i < 1 || i > N - 2 || j < 1 || j > N - 2) continue;
      const d2 = di * di + dj * dj;
      const w = Math.exp(-d2 / (2 * (r * 0.6) * (r * 0.6)));
      h[idx(i, j)] += amount * w;
    }
  }
}

function onClick(e) {
  if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(terrain, false);
  if (!hits.length) return;
  const p = hits[0].point;
  const ci = clamp(Math.round((p.x + SIZE / 2) / dx), 1, N - 2);
  const cj = clamp(Math.round((p.z + SIZE / 2) / dx), 1, N - 2);

  if (barrierMode) {
    const wM = parseFloat(inputW.value) || 10;
    const hM = parseFloat(inputH.value) || 5;
    addBarrier(ci, cj, wM, hM, barrierAngle);
    setBarrierMode(false); // bir tıklamada bir bariyer, sonra kapan
  } else {
    addSnowAt(ci, cj, snowAmount);
  }
}

window.addEventListener("pointerdown", onClick);

window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "r") { u.fill(0); v.fill(0); }
  if (e.key === 'Escape') setBarrierMode(false);
});

const loadBtn = document.getElementById("load");
if (loadBtn) {
  loadBtn.addEventListener("click", async () => {
    try {
      const lat = parseFloat(document.getElementById("lat").value);
      const lon = parseFloat(document.getElementById("lon").value);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) { setStatus("Lat/Lon değeri hatalı."); return; }
      await loadTerrainFromBackend(lat, lon);
    } catch (e) {
      console.error(e);
      setStatus("Arazi yüklenemedi. Console'a bak (CORS/backend çalışmıyor olabilir).");
    }
  });
}

// -----------------------------
// SİMÜLASYON
// -----------------------------
function step() {
  const maxVel = 30;
  for (let i = 1; i < N - 1; i++) {
    for (let j = 1; j < N - 1; j++) {
      const k = idx(i, j);
      const zx = (Z[idx(i+1,j)] - Z[idx(i-1,j)]) / (2*dx);
      const zy = (Z[idx(i,j+1)] - Z[idx(i,j-1)]) / (2*dx);
      u[k] += dt * (-g*zx - friction*u[k]);
      v[k] += dt * (-g*zy - friction*v[k]);
      u[k] = clamp(u[k], -maxVel, maxVel);
      v[k] = clamp(v[k], -maxVel, maxVel);
    }
  }
  for (let i = 1; i < N - 1; i++) {
    for (let j = 1; j < N - 1; j++) {
      const k = idx(i, j);
      const backX = i - (safe(u[k])*dt)/dx;
      const backY = j - (safe(v[k])*dt)/dx;
      let hn = sampleBilinear(h, backX, backY) * 0.999;
      if (!Number.isFinite(hn) || hn < 0) hn = 0;
      if (hn > 50) hn = 50;
      h2[k] = hn;
    }
  }
  for (let i = 0; i < N; i++) {
    h2[idx(i,0)] = 0; h2[idx(i,N-1)] = 0;
    h2[idx(0,i)] = 0; h2[idx(N-1,i)] = 0;
  }
  const tmp = h; h = h2; h2 = tmp;
}

function animate() {
  requestAnimationFrame(animate);
  step();
  applyHeights(snow, Z, h);
  if (heatmapMode) applyHeatmap();
  renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});