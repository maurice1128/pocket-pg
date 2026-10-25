// 畫面美術（2026-10-25，使用者：「我想要畫面更美」；docs/任務設計書.md 7.2b、DECISIONS D-38）
// 一律用精緻（hi）：球館、木地板紋理、陰影、環境反光、觀眾。hi=false 的分支（關陰影、反光、觀眾）保留給之後需要時用，目前沒有開關。
// 判讀線索一律不動：藍＝進攻、紅＝防守、胸口朝向箭頭、重心投影點（在 main.js）、貼近半透明、防守者一手高一手低。
// 所有貼圖都在瀏覽器用 canvas 畫出來，沒有外部素材（沒有授權問題）。尺寸照 FIBA，單位公尺。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })(); // 固定亂數：每次載入長一樣

// ---------- 燈光與渲染 ----------
export function setupLook(renderer, scene, hi) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  scene.background = new THREE.Color(0x15181e);
  scene.fog = new THREE.Fog(0x15181e, 30, 70);
  if (hi) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x3a3028, hi ? 0.9 : 1.6));
  // 主燈從天花板斜照，影子短而柔（球館燈多，影子不會太黑）
  const sun = new THREE.DirectionalLight(0xffffff, hi ? 1.7 : 1.4);
  sun.position.set(3, 14, 9);
  sun.target.position.set(0, 0, 6);
  scene.add(sun, sun.target);
  if (hi) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 11, bottom: -11, near: 2, far: 35 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 3;
  }
  return sun;
}

// ---------- 木地板 ----------
function woodTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  const boards = 32, bw = c.width / boards;
  for (let i = 0; i < boards; i++) {
    // 一條條楓木板（沿著球場長邊），每段長度不同、顏色微差
    let y = -rnd() * 300;
    while (y < c.height) {
      const len = 220 + rnd() * 380;
      const l = 0.9 + rnd() * 0.14;
      g.fillStyle = `rgb(${Math.round(222 * l)},${Math.round(178 * l)},${Math.round(122 * l)})`;
      g.fillRect(i * bw, y, bw, len);
      // 木紋
      g.strokeStyle = 'rgba(120,70,30,0.10)';
      g.lineWidth = 1;
      for (let k = 0; k < 4; k++) {
        const x = i * bw + 2 + rnd() * (bw - 4);
        g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 3, y + len * 0.3, x - 3, y + len * 0.6, x + 1, y + len); g.stroke();
      }
      g.fillStyle = 'rgba(70,40,20,0.35)';
      g.fillRect(i * bw, y, bw, 1.5); // 板頭接縫
      y += len;
    }
    g.fillStyle = 'rgba(70,40,20,0.28)';
    g.fillRect(i * bw, 0, 1, c.height); // 板與板的縫
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export function floorMaterials(hi) {
  const wood = woodTexture();
  const tex = (rx, rz) => { const t = wood.clone(); t.needsUpdate = true; t.repeat.set(rx, rz); return t; };
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.42, metalness: 0, envMapIntensity: hi ? 0.55 : 0 }, o));
  return {
    court: std({ map: tex(2.3, 2.2) }),
    // 禁區用深色胡桃木染色（避開藍紅隊色）
    paint: std({ map: tex(0.75, 0.9), color: 0x8a7e74 }),
    apron: std({ color: 0x2a313c, roughness: 0.6 }),        // 界外的深色地板
  };
}

// ---------- 球館：看台、觀眾、廣告看板、牆與天花板 ----------
function textTexture(text, w, h, bg, fg, font) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, w, 0);
  grd.addColorStop(0, bg[0]); grd.addColorStop(1, bg[1]);
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let x = w / 6; x < w; x += w / 3) g.fillText(text, x, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildArena(scene, hi) {
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c2029, roughness: 0.9 });
  // 外圈地板
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), dark);
  outer.rotation.x = -Math.PI / 2; outer.position.set(0, -0.02, 8);
  scene.add(outer);
  // 牆與天花板（內面）
  const hall = new THREE.Mesh(new THREE.BoxGeometry(46, 20, 50), new THREE.MeshStandardMaterial({ color: 0x191c23, roughness: 1, side: THREE.BackSide }));
  hall.position.set(0, 9.95, 9); // 底面落在地板下 5 cm，避免和球場地板搶畫面（z-fighting）
  scene.add(hall);
  // 天花板燈條（自發光，不另外打燈）
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0 });
  for (let i = -2; i <= 2; i++) for (let j = 0; j < 4; j++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.5), lampMat);
    l.position.set(i * 4.5, 15.5, -1 + j * 6);
    scene.add(l);
  }
  // 廣告看板（場邊 LED）：底線後方與兩側邊線外
  const adTex = textTexture('POCKET PG', 2048, 96, ['#0f3d5c', '#16607a'], '#e9f6ff', 'bold 54px sans-serif');
  adTex.wrapS = THREE.RepeatWrapping;
  const adMat = new THREE.MeshBasicMaterial({ map: adTex });
  const board = (w, x, z, ry) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.85, 0.12), [dark, dark, dark, dark, adMat, dark]);
    m.position.set(x, 0.43, z); m.rotation.y = ry;
    scene.add(m);
  };
  board(16, 0, -2.9, 0);
  board(15, -9.3, 7.5, Math.PI / 2);
  board(15, 9.3, 7.5, -Math.PI / 2);
  // 看台：一排排往後往上，座椅深藍；精緻模式坐滿觀眾（一次畫完的 InstancedMesh）
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x263247, roughness: 0.8 });
  const rows = 9, rise = 0.42, depth = 0.8;
  const stands = [
    { x0: -10.6, z0: -1, len: 17, dir: [-1, 0], ry: Math.PI / 2 },   // 左邊線外
    { x0: 10.6, z0: -1, len: 17, dir: [1, 0], ry: -Math.PI / 2 },    // 右邊線外
    { x0: -9, z0: -4.2, len: 18, dir: [0, -1], ry: 0 },             // 底線後方
  ];
  const crowd = [];
  for (const s of stands) {
    for (let r = 0; r < rows; r++) {
      const off = r * depth, y = 0.6 + r * rise;
      const step = new THREE.Mesh(new THREE.BoxGeometry(s.dir[0] ? depth : s.len, y, s.dir[0] ? s.len : depth), seatMat);
      const cx = s.dir[0] ? s.x0 + s.dir[0] * off : s.x0 + s.len / 2;
      const cz = s.dir[0] ? s.z0 + s.len / 2 : s.z0 + s.dir[1] * off;
      step.position.set(cx, y / 2, cz);
      scene.add(step);
      if (!hi) continue;
      for (let k = 0.3; k < s.len; k += 0.55) {
        if (rnd() < 0.12) continue; // 有幾個空位
        const px = s.dir[0] ? cx : s.x0 + k, pz = s.dir[0] ? s.z0 + k : cz;
        crowd.push([px, y, pz, s.ry]);
      }
    }
  }
  if (crowd.length) {
    const geo = new THREE.BoxGeometry(0.38, 0.62, 0.3);
    geo.translate(0, 0.31, 0);
    const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), crowd.length);
    const palette = [0x3b4a66, 0x6b3b3b, 0x4f5a3a, 0x7a6a55, 0x2f2f38, 0x8a8a90, 0x5a4470, 0x9c7a3c];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    crowd.forEach(([x, y, z, ry], i) => {
      const h = 0.85 + rnd() * 0.3;
      m4.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, h, 1));
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, col.setHex(palette[Math.floor(rnd() * palette.length)]).multiplyScalar(0.6 + rnd() * 0.5));
    });
    scene.add(inst);
  }
}

// ---------- 籃架：玻璃籃板、框、籃網、護墊底座 ----------
export function buildHoop(scene, BASKET, hi) {
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xdfefff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, envMapIntensity: 1 });
  const g = new THREE.Group();
  // 籃板 1.80 × 1.05 m，下緣離地 2.90 m，板面離底線 1.20 m（FIBA）
  const boardC = new THREE.Vector3(0, 2.9 + 0.525, 1.2);
  const pane = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.05, 0.03), glass);
  pane.position.copy(boardC);
  g.add(pane);
  const bar = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), white); m.position.set(x, y, boardC.z); g.add(m); };
  bar(1.8, 0.05, 0, boardC.y + 0.5); bar(1.8, 0.05, 0, boardC.y - 0.5); bar(0.05, 1.05, -0.88, boardC.y); bar(0.05, 1.05, 0.88, boardC.y);
  // 框上方的小方框 0.59 × 0.45
  const ty = 2.9 + 0.15 + 0.225;
  bar(0.59, 0.05, 0, ty + 0.2); bar(0.59, 0.05, 0, ty - 0.2); bar(0.05, 0.45, -0.27, ty); bar(0.05, 0.45, 0.27, ty);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.35, metalness: 0.5 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.018, 8, 28), rimMat);
  rim.rotation.x = Math.PI / 2; rim.position.copy(BASKET);
  g.add(rim);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.16), rimMat);
  neck.position.set(0, BASKET.y, 1.27); g.add(neck);
  const net = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.14, 0.42, 12, 3, true), new THREE.MeshBasicMaterial({ color: 0xf4f4f4, wireframe: true, transparent: true, opacity: 0.85 }));
  net.position.set(BASKET.x, BASKET.y - 0.22, BASKET.z); g.add(net);
  // 底座（底線後方）：護墊 + 立柱 + 伸臂
  const pad = new THREE.MeshStandardMaterial({ color: 0x1d3f6e, roughness: 0.7 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.6), pad);
  base.position.set(0, 0.55, -2.0); g.add(base);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.6, 0.28), pad);
  post.position.set(0, 2.2, -1.5); g.add(post);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 2.65), new THREE.MeshStandardMaterial({ color: 0x8a919c, roughness: 0.4, metalness: 0.6 }));
  arm.position.set(0, 3.4, -0.18); g.add(arm);
  if (hi) g.traverse((m) => { if (m.isMesh && m !== net) m.castShadow = true; });
  scene.add(g);
}

// ---------- 籃球（有黑色溝紋） ----------
export function makeBall(hi) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#e8742a'; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(90,30,0,${rnd() * 0.12})`; g.fillRect(rnd() * 256, rnd() * 128, 2, 2); } // 顆粒
  g.strokeStyle = '#1b1410'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 64); g.lineTo(256, 64); g.stroke();                       // 赤道
  for (const x of [64, 192]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); } // 經線
  for (const x of [0, 128]) { g.beginPath(); g.ellipse(x + 64, 64, 34, 64, 0, 0, Math.PI * 2); g.stroke(); } // 兩條彎溝
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.SphereGeometry(0.12, hi ? 24 : 14, hi ? 16 : 10), new THREE.MeshStandardMaterial({ map: t, roughness: 0.75 }));
}

// ---------- 球員：低多邊形人形 ----------
const SKINS = [0x8d5524, 0xc68642, 0xe0ac69, 0x6b4226, 0xf1c27d, 0x4a2c1a];
let skinIdx = 0;
function numberTexture(n, dark) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = 'bold 92px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = dark; g.strokeText(String(n), 64, 70);
  g.fillStyle = '#ffffff'; g.fillText(String(n), 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 在 yaw 群組裡長出身體；回傳要淡出的材質、零件（真人外掛會整個藏起來）與骨架（腳步擺動用）
export function makeBody(yaw, color, defender, number, hi) {
  const std = (c, r = 0.75) => new THREE.MeshStandardMaterial({ color: c, roughness: r, transparent: true });
  const jersey = std(color, 0.6);
  const shorts = std(new THREE.Color(color).multiplyScalar(0.78), 0.6);
  const skin = std(SKINS[skinIdx++ % SKINS.length], 0.7);
  const shoe = std(defender ? 0x1c1c22 : 0xf2f2f2, 0.5);
  const hair = std(0x16120f, 0.9);
  const parts = [];
  const add = (parent, geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); parent.add(mesh); parts.push(mesh); return mesh; };
  // 防守者重心低、兩腳開；進攻球員站直（身高約 1.95 m）
  const hipY = defender ? 0.86 : 0.95;
  const splay = defender ? 0.2 : 0.05;
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.11, hipY, 0);
    hip.rotation.z = s * splay;
    yaw.add(hip);
    const legLen = hipY / Math.cos(splay);
    add(hip, new THREE.CapsuleGeometry(0.078, legLen * 0.42, 2, 7), skin, 0, -legLen * 0.27, 0);
    add(hip, new THREE.CapsuleGeometry(0.062, legLen * 0.4, 2, 7), skin, 0, -legLen * 0.7, 0.01);
    const sh = add(hip, new THREE.BoxGeometry(0.12, 0.09, 0.28), shoe, 0, -legLen + 0.045, 0.05);
    sh.rotation.z = -s * splay; // 鞋底貼地
    legs.push(hip);
  }
  add(yaw, new THREE.CylinderGeometry(0.21, 0.23, 0.3, 10), shorts, 0, hipY - 0.04, 0).scale.z = 0.72;
  const torso = add(yaw, new THREE.CylinderGeometry(0.24, 0.2, 0.56, 10), jersey, 0, hipY + 0.36, 0);
  torso.scale.z = 0.62;
  // 號碼（前後各一）
  const numMat = new THREE.MeshBasicMaterial({ map: numberTexture(number, defender ? '#7a1d12' : '#0d2a5c'), transparent: true });
  for (const back of [0, 1]) {
    const pl = add(yaw, new THREE.PlaneGeometry(0.2, 0.2), numMat, 0, hipY + 0.38, back ? -0.152 : 0.152);
    pl.rotation.y = back ? Math.PI : 0;
  }
  add(yaw, new THREE.CylinderGeometry(0.055, 0.06, 0.1, 8), skin, 0, hipY + 0.68, 0);
  const head = add(yaw, new THREE.SphereGeometry(0.118, 12, 10), skin, 0, hipY + 0.82, 0);
  head.scale.set(0.92, 1.05, 1);
  add(yaw, new THREE.SphereGeometry(0.122, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), hair, 0, hipY + 0.845, -0.01);
  // 手臂：防守者一手高（封傳球）一手低（D-36 的站姿）；進攻球員自然垂下
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(s * 0.29, hipY + 0.58, 0);
    yaw.add(sh);
    add(sh, new THREE.CapsuleGeometry(0.056, 0.24, 2, 6), skin, 0, -0.17, 0);
    add(sh, new THREE.CapsuleGeometry(0.05, 0.24, 2, 6), skin, 0, -0.44, 0.02);
    if (defender) { sh.rotation.z = s > 0 ? 2.5 : -0.75; sh.rotation.x = s > 0 ? -0.3 : -0.5; }
    else sh.rotation.z = s * 0.14;
    arms.push(sh);
  }
  if (hi) for (const m of parts) if (m.material !== numMat) m.castShadow = true;
  return { parts, fadeMats: [jersey, shorts, skin, shoe, hair, numMat], rig: { legs, arms, splay, phase: rnd() * 6, defender } };
}

// 腳步：往前跑時前後擺、側滑時左右開合；擺幅隨速度（參數是假設，鐵則 10）
export function animateRig(p, dt) {
  const r = p.rig;
  if (!r || dt <= 0) return;
  const sp = Math.hypot(p.vel.x, p.vel.z);
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  const fwd = (p.vel.x * fx + p.vel.z * fz) / (sp || 1);
  const side = Math.sqrt(Math.max(0, 1 - fwd * fwd));
  r.phase += sp * dt * (r.defender ? 6.5 : 4.6);
  const a = Math.min(0.6, sp * 0.17);
  const sw = Math.sin(r.phase) * a;
  r.legs.forEach((hip, i) => {
    const s = i ? 1 : -1;
    hip.rotation.x = s * sw * fwd;
    hip.rotation.z = s * (r.splay + Math.abs(sw) * 0.45 * side);
  });
  if (!r.defender) r.arms.forEach((sh, i) => { sh.rotation.x = (i ? 1 : -1) * -sw * 0.8 * fwd; });
}
