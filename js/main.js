import * as THREE from 'three';
import { SCENARIOS, POSSESSIONS, ACTIONS, DEFAULT_OFFENSE, DEFAULT_DEFENSE } from './scenarios.js?v=0700';

// ---------- 設定 ----------
// levels：該難度會出的題目等級（初階 → 進階的分級課程）
const DIFF = {
  easy:   { label: '新手', window: 1.3, timeScale: 0.7, hintRing: true, levels: [1, 2] },
  normal: { label: '標準', window: 1.0, timeScale: 1.0, hintRing: false, levels: [1, 2, 3] },
  hard:   { label: '進階', window: 0.75, timeScale: 1.0, hintRing: false, levels: [2, 3, 4] },
};
const REPS_PER_SESSION = 10;
// 時間壓力：外圍觀察可以慢慢看（寬鬆），關鍵瞬間才緊迫。乘在難度的決策窗上
const PRESSURE = { loose: 2.2, medium: 1.4, tight: 1.0 };
const INTRO = 0.9;          // 每題開始前的停頓（秒）
const OCCLUDE_AFTER = 0.25; // 遮蔽模式：onset 後多久隱藏防守者（情境可用 occludeAfter 覆寫）
const BASE_LABELS = { drive: '切入攻擊（Drive）', reset: '不攻擊、重新組織（Reset）', backout: '運球退出來（Back out）' };
const actionLabel = (sc, a) => (sc.labels && sc.labels[a]) || ACTIONS[a] || BASE_LABELS[a] || a;
const BASKET = new THREE.Vector3(0, 3.05, 1.575);
const COLORS = { court: 0xd9b382, paint: 0xc99a66, line: 0xffffff, offense: 0x2f6fd6, pg: 0x1f4fa8, defense: 0xe5533d, ring: 0xffd23f, ball: 0xf07a22 };

// ---------- 儲存（可能被瀏覽器封鎖，全部 try/catch） ----------
const STORE_KEY = 'pocketpg.v1';
function load() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; } }
function save(data) { try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* 忽略 */ } }
const store = Object.assign({ baseline: null, difficulty: 'normal', occlusion: false, view: 'fp', history: [] }, load());

// ---------- Three.js 場景 ----------
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x23262c);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);

scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(4, 10, 8);
scene.add(sun);

const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true });

buildCourt();

function buildCourt() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(15, 14), mat(COLORS.court));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 7);
  scene.add(floor);
  // 場外
  // 場外地板用較深的木色，第一人稱時才看得出是地板而不是牆
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), mat(0x8c6a48));
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(0, -0.01, 7);
  scene.add(apron);
  // 禁區（FIBA 4.9 x 5.8）
  const paint = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 5.8), mat(COLORS.paint));
  paint.rotation.x = -Math.PI / 2;
  paint.position.set(0, 0.002, 2.9);
  scene.add(paint);

  const lineMat = new THREE.MeshBasicMaterial({ color: COLORS.line });
  const W = 0.05;
  const seg = (a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, len), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.atan2(dx, dz);
    m.position.set((a[0] + b[0]) / 2, 0.004, (a[1] + b[1]) / 2);
    scene.add(m);
  };
  const poly = (pts) => { for (let i = 0; i < pts.length - 1; i++) seg(pts[i], pts[i + 1]); };
  const arc = (cx, cz, r, a0, a1, n = 40) => {
    const pts = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cx + r * Math.sin(a), cz + r * Math.cos(a)]); }
    poly(pts);
  };
  poly([[-7.5, 0], [7.5, 0], [7.5, 14], [-7.5, 14], [-7.5, 0]]);  // 邊線、底線、中線
  poly([[-2.45, 0], [-2.45, 5.8], [2.45, 5.8], [2.45, 0]]);        // 禁區
  arc(0, 5.8, 1.8, -Math.PI / 2, Math.PI / 2);                     // 罰球圈
  arc(0, 14, 1.8, Math.PI / 2, Math.PI * 1.5);                     // 中圈
  // 三分線：底角 6.6，弧 6.75
  const cornerZ = 1.575 + Math.sqrt(6.75 ** 2 - 6.6 ** 2);
  seg([-6.6, 0], [-6.6, cornerZ]);
  seg([6.6, 0], [6.6, cornerZ]);
  const aMax = Math.asin(6.6 / 6.75);
  arc(0, 1.575, 6.75, -aMax, aMax, 60);
  arc(0, 1.575, 1.25, -Math.PI / 2, Math.PI / 2, 20);              // 合理衝撞區

  // 籃架
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.05, 0.05), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
  board.position.set(0, 3.35, 1.2);
  scene.add(board);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.02, 6, 16), mat(0xff5a1f));
  rim.rotation.x = Math.PI / 2;
  rim.position.copy(BASKET);
  scene.add(rim);
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.4, 0.15), mat(0x555a63));
  pole.position.set(0, 1.7, -0.6);
  scene.add(pole);
}

// ---------- 球員 ----------
function makePlayer(color, defender) {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  const yaw = new THREE.Group();
  root.add(tilt); tilt.add(yaw);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 1.05, 2, 6), mat(color));
  body.position.y = 0.27 + 0.525 + 0.08;
  yaw.add(body);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), mat(color));
  head.position.y = 1.72;
  yaw.add(head);
  // 胸口朝向箭頭（判斷髖部／身體朝向）
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.32, 4), mat(0xffffff));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.05, 0.3);
  yaw.add(nose);
  // 雙腳
  const footGeo = new THREE.BoxGeometry(0.12, 0.08, 0.26);
  const spread = defender ? 0.3 : 0.16;
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(footGeo, mat(0x22252b));
    f.position.set(s * spread, 0.04, 0.04);
    yaw.add(f);
  }
  // 重心投影點（不跟著傾斜，留在地上）
  const com = new THREE.Mesh(new THREE.CircleGeometry(0.13, 12), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.55 }));
  com.rotation.x = -Math.PI / 2;
  com.position.y = 0.006;
  root.add(com);
  // 提示圈
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 28), new THREE.MeshBasicMaterial({ color: COLORS.ring, transparent: true, opacity: 0.9 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.008;
  ring.visible = false;
  root.add(ring);
  // 瞄準圈：手指滑動時，即將接球的隊友腳下顯示白圈
  const aim = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }));
  aim.rotation.x = -Math.PI / 2;
  aim.position.y = 0.01;
  aim.visible = false;
  root.add(aim);
  scene.add(root);
  const fadeMats = [body.material, head.material, nose.material];
  for (const m of fadeMats) m.transparent = true;
  return { root, tilt, yaw, com, ring, aim, fadeMats, pos: new THREE.Vector3(), vel: new THREE.Vector3(), acc: new THREE.Vector3(), path: null, defender, faceMode: 'ball', heading: 0 };
}

// 5v5：PG＝持球的你；O2 強側、O3 弱側底角、O4 弱側側翼、O5 掩護者／大個子；X 是各自的防守者
const OFFENSE = ['PG', 'O2', 'O3', 'O4', 'O5'];
const DEFENSE = ['X1', 'X2', 'X3', 'X4', 'X5'];
const EXTRA_ROLES = ['O2', 'O4', 'X2', 'X4']; // 3v3 教學模式時隱藏
const players = {};
for (const r of OFFENSE) players[r] = makePlayer(r === 'PG' ? COLORS.pg : COLORS.offense, false);
for (const r of DEFENSE) players[r] = makePlayer(COLORS.defense, true);
const inPlay = (r) => store.players5 !== false || !EXTRA_ROLES.includes(r);
// 除錯用：__pp.play('題目id') 直接播放某一題
window.__pp = {
  players, camera, get rep() { return rep; }, get state() { return state; },
  play(id) { session = { started: new Date().toISOString(), order: [id], results: [], u: 0, s: 0 }; nextRep(); },
  // 穿模檢查用：產生一題的路徑（含鏡像與微擾）
  buildRep: (id) => buildRep(SCENARIOS.find((s) => s.id === id)),
  MIN_SEP: () => MIN_SEP,
  classify: (sx, sy, ex, ey) => classifySwipe(sx, sy, ex, ey),
  // 除錯：把目前這題用引擎推進到 onset 之後 dt 秒，並把鏡頭放到位，回傳每位隊友在畫面上的位置
  probe(id, dt = 0.3) {
    this.play(id);
    for (let t = rep.tStart; t <= rep.onset + dt; t += 1 / 60) updatePlayers(1 / 60, t);
    snapCamera = true; updateCamera(1 / 60); camera.updateMatrixWorld();
    const out = {};
    for (const k of OFFENSE) if (k !== 'PG' && inPlay(k)) { const s = toScreen(players[k].pos, 1.0); out[k] = s.behind ? 'behind-' + (s.side > 0 ? 'right' : 'left') : [Math.round(s.x), Math.round(s.y)]; }
    state = 'home';
    return out;
  },
  // 用真正的引擎把一題從頭跑到尾，回傳任兩名球員的最近距離（穿模檢查）
  simulate(id) {
    this.play(id);
    const roles = Object.keys(players).filter(inPlay);
    let worst = { d: 99 };
    for (let t = rep.tStart; t <= rep.tEnd + 0.4; t += 1 / 60) {
      updatePlayers(1 / 60, t);
      for (let i = 0; i < roles.length; i++) for (let j = i + 1; j < roles.length; j++) {
        const d = players[roles[i]].pos.distanceTo(players[roles[j]].pos);
        if (d < worst.d) worst = { d, a: roles[i], b: roles[j], t: +(t - rep.onset).toFixed(2) };
      }
    }
    state = 'home';
    return worst;
  },
};

// 第一人稱的雙手（前臂 + 手掌），每幀依鏡頭位置擺放
const SKIN = 0xc98b62;
function makeArm() {
  const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1, 6), mat(SKIN));
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.12), mat(SKIN));
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 6), mat(COLORS.pg));
  scene.add(forearm, hand, sleeve);
  return { forearm, hand, sleeve };
}
const arms = { right: makeArm(), left: makeArm() };
const UP = new THREE.Vector3(0, 1, 0);
function placeArm(arm, elbow, wrist) {
  const dir = wrist.clone().sub(elbow);
  const len = dir.length();
  arm.forearm.scale.set(1, len, 1);
  arm.forearm.position.copy(elbow).addScaledVector(dir, 0.5);
  arm.forearm.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
  arm.sleeve.position.copy(elbow);
  arm.sleeve.quaternion.copy(arm.forearm.quaternion);
  arm.hand.position.copy(wrist).addScaledVector(dir.normalize(), 0.05);
  arm.hand.quaternion.copy(arm.forearm.quaternion);
}
function setArmsVisible(v) { for (const a of Object.values(arms)) for (const m of Object.values(a)) m.visible = v; }
setArmsVisible(false);
const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), mat(COLORS.ball));
scene.add(ball);

function samplePath(path, t, out) {
  if (t <= path[0][0]) return out.set(path[0][1], 0, path[0][2]);
  for (let i = 0; i < path.length - 1; i++) {
    const [t0, x0, z0] = path[i], [t1, x1, z1] = path[i + 1];
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0);
      return out.set(x0 + (x1 - x0) * u, 0, z0 + (z1 - z0) * u);
    }
  }
  const last = path[path.length - 1];
  return out.set(last[1], 0, last[2]);
}

// ---------- 題目產生（鏡像 + 時間與位置微擾，避免背題） ----------
const rand = (a, b) => a + Math.random() * (b - a);
function buildRep(sc) {
  const mirror = Math.random() < 0.5 ? -1 : 1;
  const dJitter = rand(-0.15, 0.15);     // 防守反應時間差
  const posJ = () => [rand(-0.25, 0.25), rand(-0.25, 0.25)];
  const tf = (path, jitterT = 0, pj = [0, 0]) => path.map(([t, x, z]) => [t + jitterT, (x + pj[0]) * mirror, z + pj[1]]);
  const off = Object.assign({}, DEFAULT_OFFENSE, sc.offense);
  const def = Object.assign({}, DEFAULT_DEFENSE, sc.defense);
  // X3 開場位置在協防點與底角之間隨機（避免看站位就猜題），位移隨時間淡出，終點維持原設計
  const x3Shift = sc.fixedX3 ? 0 : rand(-0.2, 1.6);
  const x3Path = def.X3.map(([t, x, z]) => [t, x + x3Shift * Math.min(1, Math.max(0, (1.2 - t) / 1.2)), z]);
  const small = () => [rand(-0.15, 0.15), rand(-0.15, 0.15)];
  const paths = {
    PG: tf(off.PG),
    O5: tf(off.O5),
    O3: tf(off.O3, 0, sc.fixedX3 ? [0, 0] : [rand(-0.2, 0.05), rand(-0.15, 0.25)]), // 底角射手只往外抖，永遠在三分線外
    O2: tf(off.O2, 0, small()),
    O4: tf(off.O4, 0, small()),
    X1: tf(def.X1, dJitter),
    X5: tf(def.X5, dJitter, posJ()),
    X3: tf(x3Path, dJitter, [0, rand(-0.2, 0.2)]),
    X2: tf(def.X2, dJitter, small()),
    X4: tf(def.X4, dJitter, small()),
  };
  const tStart = Math.min(...Object.values(paths).map((p) => p[0][0]));
  const tEnd = Math.max(...Object.values(paths).map((p) => p[p.length - 1][0]));
  return { sc, mirror, onset: dJitter, paths, tStart, tEnd };
}

// ---------- 遊戲狀態 ----------
const $ = (id) => document.getElementById(id);
let state = 'home';
let rep = null;          // 目前題目
let session = null;      // 本次訓練
let simT = 0;            // 情境時間
let repStartPerf = 0;
let decision = null;
let passAnim = null;
let overhead = false;
let snapCamera = true;
const tmp = new THREE.Vector3();

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
  $('hud').classList.toggle('hidden', !(id === 'play' || id === 'result'));
  resize();
}

function cfg() { return DIFF[store.difficulty]; }

function startSession() {
  if (!store.baseline) { startCalibration(true); return; }
  // 出題單位＝單題或「回合」（多個決策點串起來）。依難度挑等級；每個單位至少出現一次，其餘隨機
  // 3v3 教學模式沒有 O2／O4，用到他們的題目先不出
  const needsExtra = (s) => [s.answer, ...(s.partial || []), ...(s.resetTargets || []).map((r) => 'pass:' + r)]
    .some((a) => a === 'pass:O2' || a === 'pass:O4');
  const ids = [...SCENARIOS, ...POSSESSIONS]
    // 書面依據弱的題目不進一般訓練，等教練確認（evidence 改成 medium 以上，或 status 改成 approved）
    .filter((s) => s.evidence !== 'weak' || s.status === 'approved')
    .filter((s) => !s.chainOnly && cfg().levels.includes(s.level) && (store.players5 !== false || !needsExtra(s)))
    .map((s) => s.id);
  const order = [...ids].sort(() => Math.random() - 0.5).slice(0, REPS_PER_SESSION);
  while (order.length < REPS_PER_SESSION) order.push(ids[Math.floor(Math.random() * ids.length)]);
  order.sort(() => Math.random() - 0.5);
  session = {
    started: new Date().toISOString(), difficulty: store.difficulty, occlusion: store.occlusion, baseline: store.baseline,
    view: store.view, gyro: gyro.enabled, players: store.players5 !== false ? 5 : 3, order, results: [], u: 0, s: 0,
  };
  nextRep();
}

const currentPossession = () => POSSESSIONS.find((p) => p.id === session.order[session.u]);
function advanceUnit() { session.u++; session.s = 0; nextRep(); }

function nextRep() {
  if (session.u >= session.order.length) { finishSession(); return; }
  const poss = currentPossession();
  const sc = SCENARIOS.find((s) => s.id === (poss ? poss.steps[session.s] : session.order[session.u]));
  rep = buildRep(sc);
  decision = null; passAnim = null; overhead = false; snapCamera = true;
  simT = rep.tStart - INTRO;
  repStartPerf = performance.now();
  for (const [k, p] of Object.entries(players)) {
    p.path = rep.paths[k];
    samplePath(p.path, rep.tStart, p.pos);
    p.vel.set(0, 0, 0); p.acc.set(0, 0, 0);
    p.root.visible = inPlay(k);
    p.ring.visible = false;
    p.heading = Math.atan2(BASKET.x - p.pos.x, BASKET.z - p.pos.z);
    if (p.defender) p.heading = Math.atan2(players.PG.pos.x - p.pos.x, players.PG.pos.z - p.pos.z);
  }
  separateNow();
  // 假撲的防守者要一直面向持球者（髖部不轉），真內縮會轉向跑動方向
  players.X3.faceMode = rep.sc.stunt ? 'ball' : 'move';
  $('hud-rep').textContent = `第 ${session.u + 1} / ${session.order.length} 題` + (poss ? `（判斷 ${session.s + 1}/${poss.steps.length}）` : '');
  $('hud-play').textContent = poss ? poss.name : sc.play;
  if (gyro.enabled) gyro.zero = null; // 每題重新以當下手機方向為正前方
  $('hud-score').textContent = `正確 ${session.results.filter((r) => r.grade === 'correct').length}`;
  $('timer').classList.remove('live', 'late');
  state = 'play';
  show('play');
}

// 情境時間 → 實際時間（ms）。決策時間用 performance.now 同一個時鐘計算。
function simToPerf(t) { return repStartPerf + (t - (rep.tStart - INTRO)) / cfg().timeScale * 1000; }

function decide(rawAction, eventTime) {
  if (state !== 'play' || decision) return;
  // 答案是「轉移球」的題目：往指定的安全接應者傳，也算轉移球
  const sc0 = rep.sc;
  // 「不攻擊」有兩種做法：運球退出來（往下滑），或傳給題目指定的外圍安全接應者。兩者都算 reset
  const safePass = rawAction.startsWith('pass:') && (sc0.resetTargets || []).includes(rawAction.slice(5));
  const action = rawAction === 'backout' || (sc0.answer === 'reset' && safePass) ? 'reset' : rawAction;
  const onsetPerf = simToPerf(rep.onset);
  const rt = eventTime - onsetPerf;
  let grade;
  // 時間到之後才出手：照樣做動作，但算太慢（用時間直接判斷，不靠畫面更新）
  const winMs = cfg().window * (PRESSURE[rep.sc.pressure] || 1) / cfg().timeScale * 1000;
  if (rt > winMs) rep.late = true;
  if (action === 'timeout' || rep.late) grade = 'late';
  else if (rt < 0) grade = 'early';
  // 書上常並列多個最佳選項：answer 加上 alsoBest 都給 2 分
  else if (action === rep.sc.answer || (rep.sc.alsoBest || []).includes(action)) grade = 'correct';
  else if (rep.sc.partial.includes(action)) grade = 'partial';
  else grade = 'wrong';
  const decisionMs = action === 'timeout' || rt < 0 ? null : Math.max(0, Math.round((rt - store.baseline) / 10) * 10);
  const poss = currentPossession();
  decision = {
    scenario: rep.sc.id, possession: poss ? poss.id : null, step: poss ? session.s : null, pressure: rep.sc.pressure || 'tight',
    action, rawAction, grade, rtMs: action === 'timeout' ? null : Math.round(rt), decisionMs, mirror: rep.mirror, at: new Date().toISOString(),
  };
  session.results.push(decision);
  $('timer').classList.remove('live');
  for (const k of DEFENSE) players[k].root.visible = inPlay(k); // 遮蔽模式作答後恢復畫面
  // 傳球動畫
  if (rawAction.startsWith('pass:')) {
    const target = players[rawAction.slice(5)];
    // 太晚傳：球被最靠近接球者的防守者抄走
    const thief = rep.late ? DEFENSE.filter(inPlay).map((k) => players[k]).sort((a, b) => a.pos.distanceTo(target.pos) - b.pos.distanceTo(target.pos))[0] : null;
    passAnim = { from: ball.position.clone(), target: thief || target, t: 0 };
  } else if (action === 'shoot') {
    passAnim = { from: ball.position.clone(), target: null, t: 0, miss: !!rep.late };
  } else if (rawAction === 'drive' || rawAction === 'backout') {
    // 切入：帶球往籃框衝 2.5 m；退出來：運球往後撤 1.5 m。球留在手上，鏡頭跟著人走
    const pg = players.PG.pos.clone();
    const dir = new THREE.Vector3(BASKET.x - pg.x, 0, BASKET.z - pg.z).normalize();
    const end = pg.clone().addScaledVector(dir, rawAction === 'drive' ? 2.5 : -1.5);
    const t0 = simT;
    players.PG.path = [[t0, pg.x, pg.z], [t0 + (rawAction === 'drive' ? 0.7 : 0.6), end.x, end.z]];
    rep.tEnd = Math.max(rep.tEnd, t0 + 0.8);
  }
  state = 'resolve';
  // 回合中判斷正確：簡短提示後直接進下一個決策點；錯了或回合最後一步才顯示結果卡
  if (poss && (grade === 'correct' || grade === 'partial') && session.s < poss.steps.length - 1) {
    toast(grade === 'correct' ? '好判斷，繼續看' : '可以，繼續看');
    setTimeout(() => { session.s++; nextRep(); }, 900);
  } else setTimeout(showResult, 650);
}

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add('hidden'), 900);
}

function showResult() {
  const d = decision, sc = rep.sc;
  const titles = {
    correct: ['正確判斷！', 'good'], partial: ['可以接受', 'ok'], wrong: ['判斷錯誤', 'bad'],
    early: ['太早了：防守還沒動你就決定了', 'bad'],
    late: [d.action === 'timeout' ? '太慢了：沒有出手' : (d.rawAction || d.action).startsWith('pass:') ? '太慢了：傳球被抄走' : d.action === 'shoot' ? '太慢了：投籃被干擾，沒進' : '太慢了：防守已經補到位', 'bad'],
  };
  const [title, cls] = titles[d.grade];
  $('res-title').textContent = title;
  $('res-title').className = cls;
  // 顯示玩家實際做的動作；傳給安全接應者時加註「轉移球」
  const raw = d.rawAction || d.action;
  const yours = d.action === 'timeout' ? '沒有出手' : actionLabel(sc, raw) + (raw.startsWith('pass:') && d.action === 'reset' ? '（轉移球）' : '');
  $('res-time').textContent = d.decisionMs != null ? `你的選擇：${yours}　決策時間 ${d.decisionMs} ms` : `你的選擇：${yours}`;
  // 「不攻擊」的正解寫成具體做法：傳給哪個安全接應者，或運球退出來
  const resetText = () => '不攻擊：' + [...(sc.resetTargets || []).map((r) => (ACTIONS['pass:' + r] || r) + '（轉移球）'), '運球退出來'].join('或');
  const bests = [sc.answer, ...(sc.alsoBest || [])].map((a) => (a === 'reset' ? resetText() : actionLabel(sc, a))).join('、');
  const oks = (sc.partial || []).map((a) => actionLabel(sc, a)).join('、');
  $('res-coverage').textContent = `${sc.name} → 最佳：${bests}` + (oks ? `；可接受：${oks}` : '');
  $('res-explain').textContent = sc.explain;
  const strength = { strong: '強', medium: '中', weak: '弱，需教練確認' }[sc.evidence] || '未評';
  const review = (sc.status === 'approved' ? '已通過教練審核' : '答案初版，待教練審核') + `；書面依據強度：${strength}`;
  $('res-mistake').textContent = (d.grade === 'correct' ? '' : `常見錯誤：${sc.mistake}　`) + `（${review}；依據：${sc.sources.join('；')}）`;
  for (const [k, p] of Object.entries(players)) { p.root.visible = inPlay(k); p.ring.visible = false; }
  for (const r of sc.cueRoles) players[r].ring.visible = true;
  $('btn-overhead').textContent = '俯視回放';
  $('result').classList.remove('peek');
  state = 'result';
  show('result');
}

function finishSession() {
  const rs = session.results;
  const correct = rs.filter((r) => r.grade === 'correct').length;
  const partial = rs.filter((r) => r.grade === 'partial').length;
  const times = rs.filter((r) => r.grade === 'correct' && r.decisionMs != null).map((r) => r.decisionMs);
  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
  session.finished = new Date().toISOString();
  store.history.push(session);
  if (store.history.length > 50) store.history.shift();
  save(store);
  $('sum-stats').innerHTML =
    `<div><b>${Math.round((correct + partial * 0.5) / rs.length * 100)}%</b><span>判斷分數</span></div>` +
    `<div><b>${correct}/${rs.length}</b><span>完全正確</span></div>` +
    `<div><b>${avg != null ? avg + 'ms' : '—'}</b><span>平均決策時間</span></div>`;
  // 太急 vs 太保守：沒有優勢卻硬打的比例、有優勢卻轉移掉的比例（scenario_bank_v2 第 4 節）
  const answerOf = (r) => (SCENARIOS.find((s) => s.id === r.scenario) || {}).answer;
  const noAdv = rs.filter((r) => answerOf(r) === 'reset');
  const adv = rs.filter((r) => answerOf(r) && answerOf(r) !== 'reset');
  const pct = (a, b) => (b.length ? Math.round(a.length / b.length * 100) + '%' : '—');
  if (noAdv.length || adv.length) {
    $('sum-stats').innerHTML +=
      `<div><b>${pct(noAdv.filter((r) => ['shoot', 'drive'].includes(r.action) || (r.action || '').startsWith('pass:')), noAdv)}</b><span>沒優勢硬打率</span></div>` +
      `<div><b>${pct(adv.filter((r) => r.action === 'reset'), adv)}</b><span>優勢浪費率</span></div>`;
  }
  let rows = '<tr><th>情境</th><th>結果</th><th>決策時間</th></tr>';
  for (const sc of SCENARIOS) {
    const list = rs.filter((r) => r.scenario === sc.id);
    if (!list.length) continue;
    const ok = list.filter((r) => r.grade === 'correct').length;
    const ts = list.filter((r) => r.decisionMs != null && r.grade === 'correct').map((r) => r.decisionMs);
    rows += `<tr><td>${sc.name}</td><td>${ok}/${list.length}</td><td>${ts.length ? Math.round(ts.reduce((a, b) => a + b, 0) / ts.length) + ' ms' : '—'}</td></tr>`;
  }
  $('sum-table').innerHTML = rows;
  $('export-box').classList.add('hidden');
  state = 'summary';
  show('summary');
}

// ---------- 校準：簡單反應時間（含這支手機的觸控＋螢幕延遲） ----------
let calib = null;
function startCalibration(thenStart = false) {
  calib = { trials: [], thenStart, shownAt: 0, timer: null };
  state = 'calib';
  show('calib');
  $('calib-msg').innerHTML = '看到圓圈出現就盡快點螢幕<br><small>共 5 次</small>';
  scheduleDot();
}
function scheduleDot() {
  $('calib-dot').classList.add('hidden');
  calib.shownAt = 0;
  calib.timer = setTimeout(() => {
    $('calib-dot').classList.remove('hidden');
    requestAnimationFrame(() => { calib.shownAt = performance.now(); });
  }, rand(900, 2200));
}
$('calib-pad').addEventListener('pointerdown', (e) => {
  if (state !== 'calib') return;
  if (!calib.shownAt) {  // 太早
    clearTimeout(calib.timer);
    $('calib-msg').innerHTML = '太早了，等圓圈出現再點<br><small>' + `${calib.trials.length} / 5</small>`;
    scheduleDot();
    return;
  }
  calib.trials.push(e.timeStamp - calib.shownAt);
  $('calib-msg').innerHTML = `${Math.round(e.timeStamp - calib.shownAt)} ms<br><small>${calib.trials.length} / 5</small>`;
  if (calib.trials.length >= 5) {
    const sorted = [...calib.trials].sort((a, b) => a - b);
    store.baseline = Math.round(sorted[2]);
    save(store);
    refreshHome();
    setTimeout(() => { if (calib.thenStart) startSession(); else show('home'); state = calib.thenStart ? state : 'home'; }, 700);
  } else scheduleDot();
});

// ---------- 輸入：滑向隊友 = 傳球，點一下 / 下滑 = 急停跳投 ----------
let gesture = null;
const SWIPE_MIN = 14;   // 滑動超過幾像素才算滑（越小越敏感）
const HOLD_MS = 350;   // 按住不動超過這個時間＝長按切入（決策時間仍以按下那一刻計算）
const HOLD_SLOP = 26;  // 長按時手指自然晃動的容許範圍（像素）
// 手機長按時，瀏覽器會想跳出選單／選取文字並取消觸控，要先擋掉
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('touchstart', (e) => { if (state === 'play') e.preventDefault(); }, { passive: false });
canvas.addEventListener('touchmove', (e) => { if (state === 'play') e.preventDefault(); }, { passive: false });
canvas.addEventListener('pointerdown', (e) => {
  if (state !== 'play') { gesture = null; return; }
  const g = gesture = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId, rep, moved: false };
  g.yaw0 = gyro.yaw; // 記下按下那一刻的視線方向，放開時校正轉動造成的偏移
  g.timer = setTimeout(() => {
    if (gesture !== g || g.held || state !== 'play' || g.rep !== rep) return;
    if (Math.hypot(g.lastX - g.x, g.lastY - g.y) > HOLD_SLOP) return; // 手指已經在滑，不算長按
    gesture = null;
    toast('切入！');
    decide('drive', g.t);
  }, HOLD_MS);
  g.lastX = e.clientX; g.lastY = e.clientY;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* 忽略 */ }
});
canvas.addEventListener('pointermove', (e) => {
  if (!gesture || e.pointerId !== gesture.id) return;
  gesture.lastX = e.clientX; gesture.lastY = e.clientY;
  // 即時預覽：照目前的滑動方向，誰會接到球
  const a = state === 'play' ? classifySwipe(compensateStartX(gesture.x, gesture), gesture.y, e.clientX, e.clientY) : '';
  showAim(a.startsWith('pass:') ? a.slice(5) : null);
});
function showAim(role) { for (const [k, p] of Object.entries(players)) p.aim.visible = k === role; }
// 被瀏覽器取消時：如果手指幾乎沒動，計時器照樣可以判長按；只清掉「放開」要用的資料
canvas.addEventListener('pointercancel', () => { showAim(null); if (gesture) gesture.cancelled = true; });
canvas.addEventListener('pointerup', (e) => {
  showAim(null);
  if (gesture) clearTimeout(gesture.timer);
  if (state !== 'play' || !gesture || e.pointerId !== gesture.id || gesture.rep !== rep || gesture.cancelled) { gesture = null; return; }
  const action = classifySwipe(compensateStartX(gesture.x, gesture), gesture.y, e.clientX, e.clientY);
  const t0 = gesture.t;  // 以手指按下的時間計算反應時間
  gesture = null;
  decide(action, t0);
});
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// 轉頭模式下，手指按著時手機可能在轉：把按下那一刻的起點，換算到目前畫面上的位置（同一個看出去的方向）
function compensateStartX(sx, g) {
  if (!gyro.enabled || g.yaw0 == null) return sx;
  const dYaw = gyro.yaw - g.yaw0;                       // 正值＝視線往左轉
  const tanHalfH = Math.tan(camera.fov * Math.PI / 360) * camera.aspect;
  const half = innerWidth / 2;
  const ang = Math.atan((sx - half) / half * tanHalfH);  // 起點對應的水平視角
  const ang2 = Math.max(-1.5, Math.min(1.5, ang + dYaw)); // 視線左轉，同一個方向在畫面上往右移
  return half + Math.tan(ang2) / tanHalfH * half;
}

// 手勢判定：點一下＝自己出手；滑（任何方向）＝傳球（長按切入在 pointerdown 的計時器處理）
function classifySwipe(sx, sy, ex, ey) {
  const dx = ex - sx, dy = ey - sy;
  if (Math.hypot(dx, dy) < SWIPE_MIN) return 'shoot';
  // 方向從手指按下的位置算起：手指從哪裡開始、往哪個隊友滑，就傳給他。方向跟著畫面；
  // 不在畫面裡的隊友，往他那一側的螢幕邊緣滑
  const sw = Math.atan2(dy, dx);
  let best = null, bestDiff = Infinity, onTarget = null, onDist = Math.max(60, innerWidth * 0.08);
  for (const key of OFFENSE) {
    if (key === 'PG' || !inPlay(key)) continue;
    const to = toScreen(players[key].pos, 1.0);
    const diff = Math.abs(angDiff(Math.atan2(to.y - sy, to.x - sx), sw));
    if (diff < bestDiff) { bestDiff = diff; best = 'pass:' + key; }
    // 手指放開的位置落在隊友身上（含上半身）＝明確要傳給他
    const body = toScreen(players[key].pos, 1.2);
    const dEnd = Math.hypot(ex - body.x, ey - body.y);
    if (dEnd < onDist) { onDist = dEnd; onTarget = 'pass:' + key; }
  }
  return onTarget || best || 'shoot';
}
function toScreen(p, h) {
  // 鏡頭後方的隊友投影會翻轉；改用鏡頭座標判斷他在左邊還是右邊，放到該側螢幕外面
  const cs = tmp.set(p.x, h, p.z).applyMatrix4(camera.matrixWorldInverse);
  if (cs.z > -0.05) {
    const side = cs.x >= 0 ? 1 : -1;
    return { x: innerWidth / 2 + side * innerWidth * 2, y: innerHeight * 0.5, behind: true, side };
  }
  tmp.set(p.x, h, p.z).project(camera);
  return { x: (tmp.x + 1) / 2 * innerWidth, y: (1 - tmp.y) / 2 * innerHeight, behind: false };
}

// ---------- 每幀更新 ----------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
const desiredPos = new THREE.Vector3(), desiredLook = new THREE.Vector3();
let lastFrame = performance.now();

// 身體不能互相穿過：兩人中心距離至少 MIN_SEP（膠囊半徑 0.27 m ×2，加一點衣服厚度）。
// 掩護、包夾時是肩碰肩，不是重疊。
const MIN_SEP = 0.58;
function separate(list) {
  for (let iter = 0; iter < 4; iter++) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const A = list[i].next, B = list[j].next;
      let dx = B.x - A.x, dz = B.z - A.z;
      let d = Math.hypot(dx, dz);
      if (d >= MIN_SEP) continue;
      if (d < 1e-4) { dx = 1; dz = 0; d = 1e-4; } // 完全重疊時隨便選一個方向推開
      const push = (MIN_SEP - d) / 2;
      A.x -= dx / d * push; A.z -= dz / d * push;
      B.x += dx / d * push; B.z += dz / d * push;
    }
  }
}

// 開場或重播的起始站位也要先分開
function separateNow() {
  const active = Object.entries(players).filter(([r]) => inPlay(r)).map(([, p]) => p);
  for (const p of active) p.next = p.pos.clone();
  separate(active);
  for (const p of active) { p.pos.copy(p.next); p.root.position.copy(p.pos); }
}

function updatePlayers(dt, t) {
  const active = [];
  for (const [r, p] of Object.entries(players)) {
    samplePath(p.path, t, tmp);
    // 跟隨目標點的彈簧：產生自然的加速延遲（防守者稍慢）
    const k = p.defender ? 7 : 10;
    p.next = p.pos.clone().lerp(tmp, 1 - Math.exp(-k * dt));
    if (inPlay(r)) active.push(p);
  }
  separate(active);
  for (const p of Object.values(players)) {
    const prevVel = p.vel.clone();
    const next = p.next;
    if (dt > 0) { p.vel.copy(next).sub(p.pos).divideScalar(dt); p.acc.copy(p.vel).sub(prevVel).divideScalar(dt); }
    p.pos.copy(next);
    p.root.position.copy(p.pos);
    // 朝向
    let target;
    const speed = p.vel.length();
    if (p.defender && (p.faceMode === 'ball' || speed < 2.2)) target = Math.atan2(players.PG.pos.x - p.pos.x, players.PG.pos.z - p.pos.z);
    else if (speed > 0.4) target = Math.atan2(p.vel.x, p.vel.z);
    else target = p !== players.PG ? Math.atan2(players.PG.pos.x - p.pos.x, players.PG.pos.z - p.pos.z) : p.heading; // 站定的隊友面向球
    p.heading += angDiff(target, p.heading) * (1 - Math.exp(-8 * dt));
    p.yaw.rotation.y = p.heading;
    // 傾斜：重心往加速方向偏
    const lean = p.acc.clone().multiplyScalar(0.035).add(p.vel.clone().multiplyScalar(0.03));
    lean.y = 0;
    const ang = Math.min(lean.length(), 0.38);
    if (ang > 0.001) {
      const axis = new THREE.Vector3(lean.z, 0, -lean.x).normalize();
      p.tilt.quaternion.slerp(new THREE.Quaternion().setFromAxisAngle(axis, ang), 1 - Math.exp(-10 * dt));
    } else p.tilt.quaternion.slerp(new THREE.Quaternion(), 1 - Math.exp(-10 * dt));
    const lv = new THREE.Vector3(0, 1, 0).applyQuaternion(p.tilt.quaternion);
    p.com.position.set(lv.x * 1.0, 0.006, lv.z * 1.0);
  }
}

function updateBall(dt, t) {
  const pg = players.PG;
  if (passAnim) {
    setArmsVisible(firstPerson());
    passAnim.t = Math.min(1, passAnim.t + dt / 0.45);
    const u = passAnim.t;
    // 太晚投：打在籃框前緣彈出（不進）
    const to = passAnim.target ? passAnim.target.pos.clone().setY(1.2) : passAnim.miss ? BASKET.clone().add(new THREE.Vector3(0.18, 0.05, 0.25)) : BASKET.clone();
    ball.position.lerpVectors(passAnim.from, to, u);
    ball.position.y += Math.sin(u * Math.PI) * (passAnim.target ? 0.6 : 1.6);
    return;
  }
  const bounce = Math.abs(Math.sin(t * 7.5));
  if (firstPerson()) {
    // 右手在視線右下方運球，左手往前護球
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const eye = camera.position;
    ball.position.copy(eye).addScaledVector(fwd, 0.62).addScaledVector(right, 0.3);
    ball.position.y = 0.12 + bounce * 0.8;
    const rElbow = eye.clone().addScaledVector(fwd, 0.2).addScaledVector(right, 0.3).setY(1.18);
    const rWrist = eye.clone().addScaledVector(fwd, 0.58).addScaledVector(right, 0.3).setY(Math.max(0.98, ball.position.y + 0.14));
    placeArm(arms.right, rElbow, rWrist);
    const lElbow = eye.clone().addScaledVector(fwd, 0.22).addScaledVector(right, -0.3).setY(1.15);
    const lWrist = eye.clone().addScaledVector(fwd, 0.55).addScaledVector(right, -0.22).setY(1.22);
    placeArm(arms.left, lElbow, lWrist);
    setArmsVisible(true);
    return;
  }
  setArmsVisible(false);
  const fwd = new THREE.Vector3(Math.sin(pg.heading), 0, Math.cos(pg.heading));
  const right = new THREE.Vector3(fwd.z, 0, -fwd.x).multiplyScalar(-1);
  ball.position.copy(pg.pos).addScaledVector(fwd, 0.35).addScaledVector(right, 0.3);
  ball.position.y = 0.15 + bounce * 0.75;
}

const firstPerson = () => store.view === 'fp' && !overhead;

function updateCamera(dt) {
  const pg = players.PG.pos;
  players.PG.root.visible = !firstPerson();
  if (overhead) {
    desiredPos.set(0, 15.5, 6.2);
    desiredLook.set(0, 0, 5.2);
  } else if (firstPerson()) {
    // 第一人稱：控衛眼睛高度，視線落在籃框與弱側底角之間（控衛該掃描的範圍）
    const weak = new THREE.Vector3(-6.4 * (rep ? rep.mirror : 1), 0.9, 1.3);
    // 眼睛略往後 0.3 m（頭部中心），視線微微往下，讓雙手和球進入畫面下緣
    const back = new THREE.Vector3(pg.x - BASKET.x, 0, pg.z - BASKET.z).normalize();
    desiredPos.set(pg.x, 1.82, pg.z).addScaledVector(back, 0.3);
    // 題目可指定視線偏向哪個隊友（例：快攻時看籃框與跑邊線的隊友之間）
    const look = rep && rep.sc.look;
    if (look) desiredLook.copy(BASKET).setY(0.1).lerp(tmp.copy(players[look.role].pos).setY(0.9), look.w);
    else desiredLook.copy(BASKET).setY(0.1).lerp(weak, 0.3);
  } else {
    // 越肩視角：控衛後上方，看向籃框方向
    const toBasket = new THREE.Vector3(BASKET.x - pg.x, 0, BASKET.z - pg.z).normalize();
    const side = new THREE.Vector3(-toBasket.z, 0, toBasket.x).multiplyScalar(rep ? rep.mirror * 0.5 : 0.5);
    // 直向畫面垂直視角很大，鏡頭往下俯一點，讓球場佔滿畫面而不是天花板
    const portrait = innerWidth < innerHeight;
    desiredPos.copy(pg).addScaledVector(toBasket, -2.2).add(side).setY(portrait ? 3.0 : 2.7);
    desiredLook.copy(pg).addScaledVector(toBasket, portrait ? 4.0 : 4.5).setY(portrait ? 0.4 : 0.6);
  }
  const a = snapCamera ? 1 : overhead ? 1 - Math.exp(-6 * dt) : 1 - Math.exp(-5 * dt);
  snapCamera = false;
  camPos.lerp(desiredPos, a);
  camLook.lerp(desiredLook, a);
  camera.position.copy(camPos);
  if (firstPerson() && gyro.enabled) {
    // 轉頭模式：手機轉多少，視線就轉多少（不經平滑，避免頭暈）
    const dir = camLook.clone().sub(camPos).applyAxisAngle(UP, gyro.yaw);
    camera.lookAt(camPos.clone().add(dir));
  } else camera.lookAt(camLook);
}

// ---------- 轉頭模式（陀螺儀）：像 VR 一樣轉動手機找資訊（Pagé et al., 2019） ----------
const gyro = { enabled: false, zero: null, yaw: 0, seen: false };
const GYRO_GAIN = 1.5;
addEventListener('deviceorientation', (e) => {
  if (e.alpha == null) return;
  gyro.seen = true;
  if (gyro.zero == null) gyro.zero = e.alpha;
  // 放大 1.5 倍：手機轉 40°，視線轉 60°，不用大幅轉身（上限 ±110°）
  gyro.yaw = Math.max(-1.92, Math.min(1.92, GYRO_GAIN * angDiff(e.alpha * Math.PI / 180, gyro.zero * Math.PI / 180)));
});
async function enableGyro() {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      if (await DeviceOrientationEvent.requestPermission() !== 'granted') return false;
    }
  } catch { return false; }
  gyro.enabled = true;
  gyro.zero = null;
  return true;
}

// 第一人稱時，貼在面前的球員改成半透明，才看得到後面的防守變化（真實比賽可以從旁邊看過去）
function fadeNearPlayers() {
  const fp = firstPerson();
  for (const p of Object.values(players)) {
    const d = fp ? camera.position.distanceTo(tmp.copy(p.pos).setY(1.2)) : 99;
    const op = Math.min(1, Math.max(0.28, (d - 0.7) / 0.9));
    for (const m of p.fadeMats) { m.opacity = op; m.depthWrite = op > 0.99; }
  }
}

function resize() {
  const w = innerWidth, h = innerHeight;
  const portrait = w < h;
  renderer.setSize(w, h, false);
  const playing = state === 'play' || state === 'result';
  $('fp-rotate').textContent = gyro.enabled ? '轉動手機看弱側底角' : '橫向拿手機，才看得到弱側底角';
  $('fp-rotate').classList.toggle('hidden', !(firstPerson() && playing && (portrait || gyro.enabled)));
  if (firstPerson()) {
    // 第一人稱要看到順下和弱側底角：水平視角約 95°（橫向）；直向畫面太窄，只能 80° 並提示橫拿
    // 轉頭模式下視野收窄到接近人眼的有效視野，弱側要自己轉過去看
    camera.clearViewOffset();
    camera.aspect = w / h;
    const hFov = (gyro.enabled ? (portrait ? 60 : 75) : (portrait ? 80 : 95)) * Math.PI / 180;
    camera.fov = Math.min(2 * Math.atan(Math.tan(hFov / 2) / camera.aspect) * 180 / Math.PI, 125);
    camera.updateProjectionMatrix();
    return;
  }
  // 直向：用較高的虛擬畫面再裁掉上方 30%（天花板），等於把視野往下移，球場才能佔滿螢幕
  const fullH = portrait ? h * 1.3 : h;
  camera.aspect = w / fullH;
  // 直向時維持約 78° 水平視角，橫向用 55° 垂直視角
  const hFov = 78 * Math.PI / 180;
  const vFov = portrait ? 2 * Math.atan(Math.tan(hFov / 2) / camera.aspect) * 180 / Math.PI : 55;
  camera.fov = Math.min(vFov, 120);
  if (portrait) camera.setViewOffset(w, fullH, 0, fullH - h, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (rep && (state === 'play' || state === 'resolve' || state === 'result')) {
    if (state === 'play') {
      simT = rep.tStart - INTRO + (now - repStartPerf) / 1000 * cfg().timeScale;
      const t = Math.max(simT, rep.tStart);
      updatePlayers(dt * cfg().timeScale, t);
      // 時間條與逾時
      const win = cfg().window * (PRESSURE[rep.sc.pressure] || 1);
      const since = simT - rep.onset;
      if (since >= 0) {
        $('timer').classList.add('live');
        $('timer-fill').style.transform = `scaleX(${Math.max(0, 1 - since / win)})`;
        if (cfg().hintRing) for (const r of rep.sc.cueRoles) players[r].ring.visible = since < 0.6;
        if (store.occlusion && since > (rep.sc.occludeAfter ?? OCCLUDE_AFTER)) for (const k of DEFENSE) players[k].root.visible = false;
        // 手指已在時間內按下（例如正在長按）就不判逾時
        // 時間到：不結束，等玩家做決定（UR：一定要等我做出決策）；之後的出手照樣做動作，但算太慢
        if (since > win && !rep.late) { rep.late = true; $('timer').classList.add('late'); toast('太慢了！還是要做決定'); }
      }
      updateBall(dt, t);
    } else {
      // 作答後繼續播放未遮蔽的後續動作（文獻的標準回饋：切黑 → 作答 → 看完整後續；Müller et al., 2024）
      const tEnd = rep.tEnd + 0.4;
      if (simT < tEnd) {
        const step = Math.min(tEnd - simT, dt * cfg().timeScale);
        simT += step;
        updatePlayers(step, simT);
      }
      updateBall(dt, simT);
    }
    updateCamera(dt);
    fadeNearPlayers();
    // 動態瞄準：手指按著時，每一格都用最新的隊友位置與手機轉動重算誰會接球（不只在手指移動時）
    if (state === 'play' && gesture && gesture.lastX != null && Math.hypot(gesture.lastX - gesture.x, gesture.lastY - gesture.y) >= SWIPE_MIN) {
      const a = classifySwipe(compensateStartX(gesture.x, gesture), gesture.y, gesture.lastX, gesture.lastY);
      showAim(a.startsWith('pass:') ? a.slice(5) : null);
    }
  } else {
    // 首頁背景：慢慢環繞球場
    setArmsVisible(false);
    players.PG.root.visible = true;
    const a = now / 9000;
    camera.position.set(Math.sin(a) * 11, 6, 6 + Math.cos(a) * 9);
    camera.lookAt(0, 0, 4);
    camPos.copy(camera.position);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// 首頁背景擺位
const preview = buildRep(SCENARIOS[1]);
for (const [k, p] of Object.entries(players)) { samplePath(preview.paths[k], 0.3, p.pos); p.root.position.copy(p.pos); }
ball.position.set(players.PG.pos.x, 1, players.PG.pos.z);
requestAnimationFrame(frame);

// ---------- 介面 ----------
function refreshHome() {
  for (const b of $('diff').children) b.classList.toggle('on', b.dataset.v === store.difficulty);
  for (const b of $('viewmode').children) b.classList.toggle('on', b.dataset.v === store.view);
  $('occl').checked = !!store.occlusion;
  $('gyro').checked = !!store.gyro;
  for (const b of $('teamsize').children) b.classList.toggle('on', b.dataset.v === (store.players5 !== false ? '5' : '3'));
  $('base-label').textContent = store.baseline ? `${store.baseline} ms（這支手機）` : '尚未校準（第一次開始會先校準）';
}
$('diff').addEventListener('click', (e) => {
  const v = e.target.dataset && e.target.dataset.v;
  if (!v) return;
  store.difficulty = v; save(store); refreshHome();
});
$('teamsize').addEventListener('click', (e) => {
  const v = e.target.dataset && e.target.dataset.v;
  if (!v) return;
  store.players5 = v === '5'; save(store); refreshHome();
});
$('viewmode').addEventListener('click', (e) => {
  const v = e.target.dataset && e.target.dataset.v;
  if (!v) return;
  store.view = v; save(store); refreshHome(); resize();
});
$('occl').addEventListener('change', (e) => { store.occlusion = e.target.checked; save(store); });
$('gyro').addEventListener('change', async (e) => {
  // iPhone 要在點擊當下請求權限
  if (e.target.checked && !(await enableGyro())) {
    e.target.checked = false;
    $('gyro-note').textContent = '沒有取得陀螺儀權限';
  } else {
    gyro.enabled = e.target.checked;
    $('gyro-note').textContent = gyro.enabled ? '開始後轉動手機就能轉頭（建議關掉手機的自動旋轉）' : '拿手機轉動，畫面跟著轉';
    setTimeout(() => { if (gyro.enabled && !gyro.seen) $('gyro-note').textContent = '這台裝置沒有偵測到陀螺儀'; }, 1200);
  }
  store.gyro = gyro.enabled; save(store);
});
$('btn-start').addEventListener('click', async () => {
  if (store.gyro && !gyro.enabled) await enableGyro();
  startSession();
});
$('btn-calib').addEventListener('click', () => startCalibration(false));
$('btn-help').addEventListener('click', () => show('help'));
$('btn-next').addEventListener('click', advanceUnit);
$('btn-again').addEventListener('click', startSession);
$('btn-replay').addEventListener('click', () => {
  // 從頭重播整段（不含傳球），配合俯視視角看清楚防守怎麼動
  simT = rep.tStart;
  passAnim = null;
  for (const p of Object.values(players)) { samplePath(p.path, rep.tStart, p.pos); p.vel.set(0, 0, 0); p.acc.set(0, 0, 0); }
  separateNow();
});
$('btn-overhead').addEventListener('click', () => {
  overhead = !overhead;
  snapCamera = true;
  $('result').classList.toggle('peek', overhead);
  resize();
  $('btn-overhead').textContent = overhead ? '回到控衛視角' : '俯視回放';
});
$('btn-export').addEventListener('click', () => {
  const box = $('export-box');
  box.value = JSON.stringify({ baseline: store.baseline, history: store.history }, null, 1);
  box.classList.remove('hidden');
  box.select();
  try { navigator.clipboard?.writeText(box.value).catch(() => {}); } catch { /* 忽略 */ }
});
for (const b of document.querySelectorAll('[data-go]')) b.addEventListener('click', () => { state = b.dataset.go; show(b.dataset.go); });
refreshHome();
show('home');
