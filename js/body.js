// 口袋控衛：真人身體（公開版，D-20261025-39）
// 人物來自 Anny（NAVER LABS Europe）的預設 `anny` 拓樸：人體資產是 MakeHuman／MPFB2 的 CC0 1.0，程式 Apache 2.0，
// 可以放在公開網站。GLB 由 E:\basketball_data\anny_web\tools\convert_anny_to_glb.py 產生（22 骨、綁定時骨頭無旋轉、
// 面向 +Z、左 +X、原點在腳底中心），三種體型：後衛 1.88 m、側翼 1.98 m、長人 2.06 m（身高是假設）。
// 動作是程序化的，邏輯沿用本機 SMPL-X 版的 smplx_body.js；所有參數都是「假設」（鐵則 10）。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// 防守站姿與腳步的依據（docs/tactics_audit.md「防守腳步的畫法」）：
//   ASEP p.94：雙腳稍寬於肩、前後錯開，前腳（lead foot）在對手外側、後腳對準對手身體中線；膝蓋彎、背打直、頭在支撐面上方。
//   NBA Coaches Playbook p.232–233（Fratello）：雙腳不超過肩寬，後腳腳尖對齊前腳前腳掌；像要坐椅子；
//   「step and slide」：往哪邊就先用那一側的腳跨一步，另一腳滑過來，兩腳不併攏、不交叉；前腳那一側的手舉高，後手守傳球路線。
//   ASEP p.95–96：第一步要短而快，用後腳蹬地。數值（寬度、步長、時間）書上沒給，都是假設。
const P = {
  STANCE_HALF_WIDTH: 0.25,   // 假設：雙腳中心距 0.50 m（ASEP「稍寬於肩」與 Fratello「不超過肩寬」之間）
  STANCE_STAGGER: 0.08,      // 假設：前腳比後腳前 0.08 m（Fratello：後腳腳尖對齊前腳前腳掌，約等於前腳掌到腳尖的長度）
  TOE_OUT: 0.18,             // 假設：腳尖外開約 10°（rad）
  SWING_MIN: 0.11, SWING_MAX: 0.24, // 假設：一步騰空時間（秒）
  SLIDE_LIFT: 0.025,         // 假設：滑步時腳貼地（m）
  STEP_REACH: 0.5,           // 假設：落腳點離站姿位置最遠（m）
  IDLE_ADJUST: 0.09,         // 假設：站著時腳偏離站姿位置超過這個距離才補一步（m）
  MIN_FEET_GAP: 0.30,        // 假設：滑步時兩腳中心最近距離（不併腳）（m）
  DROP_IDLE: 0.17,           // 假設：防守站姿骨盆下降（m）
  DROP_IDLE_OFF: 0.06,       // 假設：進攻球員站著時骨盆下降（m）
  DROP_BACK: 0.14, DROP_SIDE: 0.18, DROP_RUN: 0.06, // 假設：後撤／滑步／往前衝的骨盆下降（m）
  HIP_BACK: 0.07,            // 假設：站姿臀部往後坐（m）
  LEAN_IDLE: 0.38, LEAN_IDLE_OFF: 0.15, LEAN_RUN: 0.22, // 假設：軀幹前傾（rad）
  LEAN_ACC: 0.035,           // 沿用 main.js 的加速度傾斜係數
  LEAN_MAX: 0.30,
  STEP_F0: 1.8, STEP_FK: 1.0, STEP_FMAX: 4.6, // 假設：步頻（步/秒）
  SIDE_CADENCE: 1.8, SIDE_FMAX: 7.0, // 假設：滑步步頻倍數與上限（步/秒）（ASEP p.95：短而快的步子）
  SIDE_WIDEN: 0.3,           // 假設：滑步時前導腳多跨、後腳少滑的比例（先跨寬再滑回站姿寬度）
  LIFT_WALK: 0.07, LIFT_RUN: 0.14,
  BOB: 0.018, SWAY: 0.012, SWAY_F: 0.7,
  KNEE_POLE_OUT: 0.0,        // 假設：膝蓋對準腳尖方向（舊值 1.0 會變 O 型腿）（rad）
  LEAN_BACK_DEF: 0.10,       // 假設：防守站姿減速時最多往後仰多少（ASEP p.94：背打直、頭在支撐面上方）（rad）
  LEAD_SHIFT: 1.0,           // 整個人往前腳那一側偏「半個站姿寬」，後腳剛好在站位中線上（ASEP p.94：後腳對準對手身體中線）；
                             // 只有題目寫了 lead 才偏，因為這是一個會被讀的線索，不能預設亂給
  // 撲防（closeout）碎步：WABC Coaches Manual p.19「快到時改小而快的步子」、NBA Coaches Playbook p.234（Fratello）
  // 「靠近時用短碎步、保持低」。步頻、騰空時間、抬腳、持續時間都是假設
  CHOP_F: 6.5, CHOP_SWING: 0.09, CHOP_LIFT: 0.03, CHOP_HOLD: 0.45, CHOP_DROP: 0.04,
  FLYBY_LEAN: 0.22,          // 假設：飛撲往前撲的額外前傾（rad）（Fratello p.234：站太直或失去平衡就會撲向射手）
  LEG_ALPHA: 0.8,            // 假設：第一人稱淡化時，膝蓋以下至少保持這個不透明度（腳步要看得到）
};
// 位置 → 體型（身高是假設）
const BUILD = { PG: 'guard', O2: 'guard', X1: 'guard', X2: 'guard', O3: 'wing', O4: 'wing', X3: 'wing', X4: 'wing', O5: 'big', X5: 'big' };
// 膚色輪流用（只是讓場上看起來像真的比賽，不代表任何位置）
const TONES = [0x8d5524, 0xc68642, 0x5c3a1e, 0xe0ac69, 0x6b4226, 0xf1c27d, 0x3d2614, 0xb07a4a, 0x7a4b2a, 0xd9a066];
let toneIdx = 0;

const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
const _a = V(), _b = V(), _c = V(), _d = V(), _h = V(), _k = V(), _q = Q(), _q2 = Q(), _e = new THREE.Euler(), _eY = new THREE.Euler(0, 0, 0, 'YXZ');
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = THREE.MathUtils.lerp;

// 一個材質畫整個人：shader 用「綁定姿勢座標」（vBind）逐像素分出球衣、球褲、皮膚、頭髮、襪子、鞋，邊界是直線。
// _zone 是轉檔時存的每頂點資訊：x＝手臂權重、y＝頭頸權重、z＝眼睛。分區高度在 GLB 的 extras.zones（公尺）
function bodyMaterial(team, tone, shoe, Z) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.62, transparent: true });
  const u = {
    uTeam: { value: new THREE.Color(team) }, uSkin: { value: new THREE.Color(tone) }, uShoe: { value: new THREE.Color(shoe) },
    uHair: { value: new THREE.Color(0x15110e) },
    uKnee: { value: Z.knee }, uAnkle: { value: Z.ankle }, uNeck: { value: Z.neck }, uWaist: { value: Z.waist },
    uEye: { value: Z.eye }, uHeadZ: { value: Z.headZ }, uChestZ: { value: Z.chestZ }, uArmpit: { value: Z.armpit }, uShX: { value: Z.shoulderX },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = `attribute vec3 _zone;
varying vec3 vZone;
varying vec3 vBind;
` + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  vBind = position; vZone = _zone;`);
    sh.fragmentShader = `uniform vec3 uTeam, uSkin, uShoe, uHair;
uniform float uKnee, uAnkle, uNeck, uWaist, uEye, uHeadZ, uChestZ, uArmpit, uShX;
varying vec3 vZone;
varying vec3 vBind;
` + sh.fragmentShader.replace('#include <color_fragment>', `
  float y = vBind.y, ax = abs(vBind.x), z = vBind.z;
  bool arm = vZone.x > 0.5, head = vZone.y > 0.5;
  bool torso = !arm && !head && vZone.z < 0.5;
  bool shorts = torso && y > uKnee + 0.07 && y < uWaist;
  bool jersey = torso && y >= uWaist && y < uNeck - 0.03;
  if (y > uArmpit && ax > uShX - 0.04) jersey = false;                      // 無袖：肩膀外側露出
  if (ax < 0.085 && y > uNeck - (z > uChestZ ? 0.12 : 0.06)) jersey = false; // 領口：前低後高
  vec3 c = uSkin;
  if (shorts) c = uTeam * (y > uWaist - 0.035 ? 0.62 : 0.88);               // 褲頭較深
  else if (jersey) c = uTeam;
  if (vZone.z > 0.5) c = vec3(0.012);
  else if (head && (y > uEye + 0.045 || (z < uHeadZ - 0.035 && y > uEye - 0.035))) c = uHair;
  if (y < uAnkle + 0.13) c = vec3(0.82);                                    // 白襪
  if (y < uAnkle + 0.035) c = uShoe;
  diffuseColor.rgb *= c;
  diffuseColor.a = max(diffuseColor.a, ${P.LEG_ALPHA.toFixed(2)} * (1.0 - smoothstep(uKnee - 0.12, uKnee + 0.04, y))); // 膝蓋以下不淡化`);
  };
  m.customProgramCacheKey = () => 'pp-body-zones';
  return m;
}

// 球鞋：Anny 的腳是赤腳，近看看得到腳趾，所以套一雙簡單的鞋（鞋身＋顏色不同的鞋底），大小照每個體型的腳量。
// 鞋子不跟著第一人稱淡化，貼身時也看得清楚腳步。形狀是美術上的假設
const shoeGeo = new Map();
function shoeGeometry(w, L, hHeel) {
  const key = [w, L, hHeel].map((v) => v.toFixed(3)).join();
  if (shoeGeo.has(key)) return shoeGeo.get(key);
  const upper = new RoundedBoxGeometry(w, hHeel, L, 3, 0.03);
  const p = upper.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getZ(i) + L / 2) / L;                                    // 0＝腳跟，1＝腳尖
    const y = p.getY(i) + hHeel / 2;                                       // 鞋底在 y＝0
    p.setY(i, y * lerp(1, 0.42, sstep(0.25, 0.85, t)));                    // 鞋頭比鞋口低
    p.setX(i, p.getX(i) * lerp(0.86, 1, sstep(0, 0.3, t)) * lerp(1, 0.78, sstep(0.7, 1, t)));
  }
  upper.computeVertexNormals();
  const sole = new RoundedBoxGeometry(w + 0.01, 0.026, L + 0.012, 2, 0.012);
  sole.translate(0, 0.013, 0.002);
  const g = { upper, sole };
  shoeGeo.set(key, g);
  return g;
}

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

class BodyAnimator {
  constructor(model, extras, color, defender, number, shadows) {
    this.holder = new THREE.Group(); this.holder.add(model);
    this.defender = defender;
    const b = (n) => { const o = model.getObjectByName(n); if (!o) throw new Error('missing bone ' + n); return o; };
    this.bones = {};
    for (const n of ['pelvis', 'spine1', 'spine2', 'spine3', 'neck', 'head', 'left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle', 'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist']) this.bones[n] = b(n);
    this.material = bodyMaterial(color, TONES[toneIdx++ % TONES.length], defender ? 0x1c1c22 : 0xf2f2f2, extras.zones);
    model.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      o.frustumCulled = false;
      o.castShadow = shadows;
      o.material = this.material;
    });
    // 球衣號碼（前後各一），黏在 spine3 上，跟著上身前傾
    this.numMat = new THREE.MeshBasicMaterial({ map: numberTexture(number, defender ? '#7a1d12' : '#0d2a5c'), transparent: true });
    model.updateMatrixWorld(true);
    const s3 = this.bones.spine3, s3w = s3.getWorldPosition(V());
    for (const [pt, back] of [[extras.chest, 0], [extras.back, 1]]) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.19), this.numMat);
      pl.position.set(pt[0] - s3w.x, pt[1] - s3w.y - 0.03, pt[2] - s3w.z + (back ? -0.012 : 0.012));
      pl.rotation.y = back ? Math.PI : 0;
      s3.add(pl);
    }
    this.pelvisRest = this.bones.pelvis.position.clone();
    const B = this.bones;
    this.legs = [['left', 1], ['right', -1]].map(([s, side]) => ({
      side, hip: B[s + '_hip'], knee: B[s + '_knee'], ankle: B[s + '_ankle'],
      l1: B[s + '_knee'].position.length(), l2: B[s + '_ankle'].position.length(),
      rThigh: B[s + '_knee'].position.clone().normalize(), rShank: B[s + '_ankle'].position.clone().normalize(),
      phaseOff: side > 0 ? 0 : 0.5,
    }));
    this.arms = [['left', 1], ['right', -1]].map(([s, side]) => ({
      side, sh: B[s + '_shoulder'], el: B[s + '_elbow'],
      rUpper: B[s + '_elbow'].position.clone().normalize(), rFore: B[s + '_wrist'].position.clone().normalize(),
    }));
    this.holder.updateMatrixWorld(true);
    this.ankleH = this.bones.left_ankle.getWorldPosition(V()).y; // 綁定姿勢的踝關節高度
    // 鞋子：量綁定姿勢裡腳的頂點範圍（腳踝以下），鞋子比腳大一點把腳趾包住，黏在踝骨上
    let skin = null;
    model.traverse((o) => { if (o.isSkinnedMesh && !skin) skin = o; });
    const pos = skin.geometry.attributes.position;
    const shoeMat = new THREE.MeshStandardMaterial({ color: defender ? 0x1c1c22 : 0xf2f2f2, roughness: 0.5 });
    const soleMat = new THREE.MeshStandardMaterial({ color: defender ? 0xeeeeee : 0x2a2a2e, roughness: 0.8 });
    for (const L of this.legs) {
      const mn = [9, 9], mx = [-9, -9];
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) * L.side, y = pos.getY(i), z = pos.getZ(i);
        if (x < 0.02 || y > this.ankleH + 0.03) continue;
        mn[0] = Math.min(mn[0], x); mx[0] = Math.max(mx[0], x); mn[1] = Math.min(mn[1], z); mx[1] = Math.max(mx[1], z);
      }
      const w = mx[0] - mn[0] + 0.02, len = mx[1] - mn[1] + 0.025;
      const g = shoeGeometry(w, len, this.ankleH + 0.06); // 中筒籃球鞋：鞋口高過踝骨
      const aw = L.ankle.getWorldPosition(V());
      const shoe = new THREE.Group();
      for (const [geo, m] of [[g.upper, shoeMat], [g.sole, soleMat]]) {
        const mesh = new THREE.Mesh(geo, m);
        mesh.castShadow = shadows;
        shoe.add(mesh);
      }
      shoe.position.set(L.side * (mn[0] + mx[0]) / 2 - aw.x, -aw.y, (mn[1] + mx[1]) / 2 + 0.004 - aw.z);
      L.ankle.add(shoe);
    }
    this.phase = Math.random(); this.vLocal = V(); this.accLocal = V(); this.vWorld = V();
    this.lead = 1;      // 防守前腳：1＝左腳（+X）在前，-1＝右腳在前（main.js 依題目與鏡像設定）
    this.leadSet = false; // 題目有沒有指定前腳；有才把身體偏向前腳那一側
    // 防守姿勢（main.js 依題目的 pose 每格設定）：'stance' 一般站姿、'closeout_high' 及時撲防（碎步、雙手舉高）、
    // 'closeout_low' 慢慢出來（手放低）、'flyby' 飛撲（不煞車、伸單手）、'deny' 阻絕（前手伸進傳球路線）、'spread' 張開雙手（假設）
    this.pose = 'stance'; this.chopT = 0; this.armCur = null;
    this.shift = null;  // 身體往前腳那一側偏多少（m，holder +X）
    this.shiftW = V();  // 同一個偏移的世界座標（main.js 穿模檢查用身體真正的中心）
    this.feet = null;   // 每隻腳踩在地上的世界座標；第一次 update 時放到站姿位置
    this.stepClock = 9; this.lastFoot = 1;
  }

  // 瞬間移位（新題開場）後，腳直接放回站姿位置；身體偏移依開場朝向先算好（穿模檢查第一幀就要用）
  reset(heading = 0) {
    this.feet = null; this.stepClock = 9; this.vLocal.set(0, 0, 0); this.vWorld.set(0, 0, 0); this.chopT = 0;
    this.shift = this.defender && this.leadSet ? this.lead * P.STANCE_HALF_WIDTH * P.LEAD_SHIFT : 0;
    this.shiftW.set(Math.cos(heading), 0, -Math.sin(heading)).multiplyScalar(this.shift);
  }

  // 站姿時這隻腳該在的位置（holder 座標）
  footHome(L, hw, stagger, out) {
    return out.set(L.side * hw, this.ankleH, (L.side === this.lead ? 0.5 : -0.5) * stagger);
  }

  // 位置由 main.js 的 root 決定（holder 是 root 的子物件）；這裡只轉向與擺姿勢
  update(dt, vel, acc, heading) {
    const H = this.holder, B = this.bones;
    H.rotation.y = heading;
    const c = Math.cos(-heading), s = Math.sin(-heading);
    const lv = _a.set(vel.x * c + vel.z * s, 0, -vel.x * s + vel.z * c);
    const la = _b.set(acc.x * c + acc.z * s, 0, -acc.x * s + acc.z * c);
    this.vLocal.lerp(lv, 1 - Math.exp(-12 * dt)); this.accLocal.lerp(la, 1 - Math.exp(-8 * dt));
    const v = this.vLocal, speed = v.length();
    const moving = sstep(0.15, 0.7, speed);
    const dirF = speed > 1e-3 ? v.z / speed : 0, dirL = speed > 1e-3 ? v.x / speed : 0;
    const wFwd = moving * Math.max(0, dirF) ** 2, wBack = moving * Math.max(0, -dirF) ** 2, wSide = moving * dirL * dirL;
    const wIdle = 1 - moving, wRun = wFwd * sstep(1.2, 3.0, speed);
    const pose = this.defender ? this.pose || 'stance' : 'off';
    // 碎步：及時撲防時，跑過來（> 1 m/s）之後收成碎步，停下來後再碎步 CHOP_HOLD 秒；全速衝刺（> 3.5 m/s）時不碎步
    if (pose === 'closeout_high' && speed > 1.0) this.chopT = P.CHOP_HOLD; else this.chopT = Math.max(0, this.chopT - dt);
    const chop = pose === 'closeout_high' && this.chopT > 0 && speed < 3.5;
    const baseF = Math.min(P.STEP_FMAX, P.STEP_F0 + P.STEP_FK * speed);
    let stepF = lerp(baseF, Math.min(P.SIDE_FMAX, baseF * P.SIDE_CADENCE), wSide);
    if (chop) stepF = Math.max(stepF, P.CHOP_F);
    const cycF = stepF / 2;
    this.phase = (this.phase + dt * cycF * moving) % 1; // 只給跑步擺臂用
    const Ts = 1 / stepF;                                // 兩次落地之間的時間
    const swingT = chop ? P.CHOP_SWING : clamp(Ts * lerp(0.85, 1.2, wRun), P.SWING_MIN, P.SWING_MAX);
    const stanceT = Math.max(0.05, 2 * Ts - swingT);
    const lift = chop ? P.CHOP_LIFT : lerp(lerp(P.LIFT_WALK, P.SLIDE_LIFT, wSide), P.LIFT_RUN, wRun);
    const t = performance.now() / 1000;
    const idleDrop = this.defender ? P.DROP_IDLE : P.DROP_IDLE_OFF;
    let drop = idleDrop * wIdle + P.DROP_BACK * wBack + P.DROP_SIDE * wSide + lerp(P.DROP_BACK, P.DROP_RUN, sstep(1.2, 3.0, speed)) * wFwd;
    if (chop) drop += P.CHOP_DROP;                 // 碎步時保持低（Fratello p.234）
    const bob = -P.BOB * moving * Math.cos(2 * Math.PI * Math.min(1, this.stepClock / Ts));
    const sway = P.SWAY * wIdle * Math.sin(t * 2 * Math.PI * P.SWAY_F);
    B.pelvis.position.set(this.pelvisRest.x + sway, this.pelvisRest.y - drop + bob, this.pelvisRest.z - P.HIP_BACK * (1 - wRun) * (this.defender ? 1 : 0.4));
    let lean = lerp(this.defender ? P.LEAN_IDLE : P.LEAN_IDLE_OFF, P.LEAN_RUN, wRun);
    if (pose === 'flyby') lean += P.FLYBY_LEAN;
    const accPitch = clamp(this.accLocal.z * P.LEAN_ACC, this.defender ? -P.LEAN_BACK_DEF : -P.LEAN_MAX, P.LEAN_MAX);
    const accRoll = clamp(this.accLocal.x * P.LEAN_ACC, -P.LEAN_MAX, P.LEAN_MAX);
    lean += accPitch;
    B.pelvis.quaternion.setFromEuler(_e.set(lean * 0.35, 0, 0));
    for (const n of ['spine1', 'spine2', 'spine3']) B[n].quaternion.setFromEuler(_e.set(lean * 0.22, 0, -accRoll * 0.33));
    B.neck.quaternion.setFromEuler(_e.set(-lean * 0.4, 0, accRoll * 0.4));
    B.head.quaternion.setFromEuler(_e.set(-lean * 0.6, 0, accRoll * 0.4));
    const hw = lerp(this.defender ? P.STANCE_HALF_WIDTH : 0.17, 0.13, wRun);
    const lat = _h.set(Math.cos(heading), 0, -Math.sin(heading)); // 身體左方（holder +X）
    // 整個人偏向前腳那一側：前腳在對手外側、後腳對準對手中線（ASEP p.94）。跑起來就回到中間
    const shiftT = this.defender && this.leadSet ? this.lead * hw * P.LEAD_SHIFT * (1 - wRun) : 0;
    this.shift = this.shift == null ? shiftT : lerp(this.shift, shiftT, 1 - Math.exp(-6 * dt));
    H.position.copy(lat).multiplyScalar(this.shift);
    this.shiftW.copy(H.position);
    H.updateMatrixWorld(true);
    const hq = H.getWorldQuaternion(_q).clone();
    // 腳：踩住地面不滑動，該換位置時才跨一步。側移是 step and slide：先動移動方向那一側的腳，
    // 另一腳再滑過來，兩腳不併攏、不交叉（Fratello p.233；ASEP p.95–96）
    this.vWorld.lerp(_c.set(vel.x, 0, vel.z), 1 - Math.exp(-12 * dt));
    const stagger = (this.defender ? P.STANCE_STAGGER : 0.03) * (1 - wRun);
    const homes = this.legs.map((L) => this.footHome(L, hw, stagger, V()).applyMatrix4(H.matrixWorld));
    const toeYaw = (L) => heading + L.side * P.TOE_OUT * (1 - wRun);
    if (!this.feet) this.feet = this.legs.map((L, i) => ({ pos: homes[i].clone(), from: V(), yaw: toeYaw(L), yaw0: 0, t: -1 }));
    const F = this.feet;
    // 落腳點＝站姿位置＋落地前身體會移動的距離＋半個支撐期（腳落在身體前方、支撐期中間剛好在身體下面）
    const landAt = (i, rem, out) => {
      const o = out.copy(this.vWorld).multiplyScalar(rem + stanceT * 0.5);
      // 滑步：往移動方向那隻腳多跨一點、後腳少滑一點，兩腳間距在「站姿寬」和「跨寬」之間變化，不會併在一起
      o.addScaledVector(lat, v.x * Ts * P.SIDE_WIDEN * (this.legs[i].side * v.x > 0 ? 1 : -1));
      if (o.length() > P.STEP_REACH) o.setLength(P.STEP_REACH);
      return o.add(homes[i]);
    };
    this.stepClock += dt;
    const err = F.map((f, i) => (f.t >= 0 ? 0 : Math.hypot(f.pos.x - homes[i].x, f.pos.z - homes[i].z) + 0.25 * Math.abs(angDiff(toeYaw(this.legs[i]), f.yaw))));
    const sw = F.findIndex((f) => f.t >= 0);
    const busy = sw >= 0 && !(wRun > 0.5 && F[sw].t > 0.45); // 跑步時有騰空期，前一步過半就能出下一步
    const want = moving > 0.3 || chop ? this.stepClock >= Ts : Math.max(err[0], err[1]) > P.IDLE_ADJUST;
    if (!busy && want) {
      let i;
      if (this.stepClock > 2.5 * Ts) {
        // 從靜止起步：側移先動移動方向那一側的腳，其他方向先動離站姿最遠的腳
        i = wSide > 0.5 ? this.legs.findIndex((L) => L.side * v.x > 0) : (err[0] >= err[1] ? 0 : 1);
        if (i < 0) i = 0;
      } else i = 1 - this.lastFoot;
      if (F[i].t < 0) { F[i].t = 0; F[i].from.copy(F[i].pos); F[i].yaw0 = F[i].yaw; this.lastFoot = i; this.stepClock = 0; }
    }
    for (let i = 0; i < 2; i++) {
      const f = F[i], L = this.legs[i];
      let oy = 0, pitch = 0;
      if (f.t >= 0) {
        f.t = Math.min(1, f.t + dt / swingT);
        const to = landAt(i, (1 - f.t) * swingT, _k);
        // 不併腳：落點和另一腳在身體左右方向至少隔 MIN_FEET_GAP
        const o = F[1 - i].pos, gap = P.MIN_FEET_GAP * (1 - wRun);
        const sep = ((to.x - o.x) * lat.x + (to.z - o.z) * lat.z) * L.side;
        if (sep < gap) to.addScaledVector(lat, (gap - sep) * L.side);
        const u = sstep(0, 1, f.t);
        f.pos.lerpVectors(f.from, to, u);
        f.yaw = f.yaw0 + angDiff(toeYaw(L), f.yaw0) * u;
        oy = lift * Math.sin(Math.PI * f.t);
        pitch = 0.3 * Math.sin(Math.PI * f.t) * (wBack - wRun * 0.5);
        if (f.t >= 1) f.t = -1;
      }
      const target = _c.set(f.pos.x, this.ankleH + oy, f.pos.z);
      const py = f.yaw + L.side * P.KNEE_POLE_OUT * (1 - wRun); // 膝蓋跟著腳尖方向
      this.solveLeg(L, target, _d.set(Math.sin(py), 0, Math.cos(py)));
      const footQ = _q2.setFromEuler(_eY.set(pitch, f.yaw, 0));
      const kq = L.knee.getWorldQuaternion(new THREE.Quaternion());
      L.ankle.quaternion.copy(kq.invert().multiply(footQ));
    }
    // 手臂：防守者前腳那一側的手舉高、另一手在側邊守傳球路線（Fratello p.233；ASEP p.95）；
    // 進攻球員手自然垂下；跑步時擺臂。題目可用 pose 改手（依據見 tactics_audit 13.6）。角度都是假設
    const swing = Math.sin(this.phase * 2 * Math.PI);
    // 這幾種邊跑邊維持手的位置；及時撲防在碎步時就把手舉起來（WABC p.19：撲防最後雙手舉高）
    const keepArms = pose === 'flyby' || pose === 'deny' || pose === 'spread' || chop;
    if (!this.armCur) this.armCur = this.arms.map(() => ({ up: V(), fo: V(), init: false }));
    const kArm = 1 - Math.exp(-10 * dt);
    for (let ai = 0; ai < this.arms.length; ai++) {
      const A = this.arms[ai], sd = A.side, hi = sd === this.lead, C = this.armCur[ai];
      const up = _a, fo = _b;
      if (pose === 'closeout_high') {          // 撲到時雙手舉高，保持平衡、準備橫移（WABC p.19）
        up.set(sd * 0.45, 0.35, 0.6); fo.set(sd * 0.15, 0.95, 0.3);
      } else if (pose === 'closeout_low') {    // 手放低（題目設定的撲防太慢；只改手，不改上身，避免多出「站太直＝該切」的線索，Fratello p.234）
        up.set(sd * 0.22, -0.95, 0.2); fo.set(sd * 0.1, -0.75, 0.65);
      } else if (pose === 'flyby') {           // 衝過來伸單手封投（WABC p.19：單手往前伸，之後很難橫移）
        if (hi) { up.set(sd * 0.2, 0.75, 0.65); fo.set(sd * 0.05, 0.6, 0.8); } else { up.set(sd * 0.5, -0.7, -0.2); fo.set(sd * 0.3, -0.8, 0.3); }
      } else if (pose === 'deny') {            // 阻絕：前手往前伸進傳球路線（ASEP p.82、p.104），另一手低
        if (hi) { up.set(sd * 0.35, -0.05, 0.95); fo.set(sd * 0.25, 0.05, 1.0); } else { up.set(sd * 0.6, -0.6, 0.3); fo.set(sd * 0.4, -0.5, 0.75); }
      } else if (pose === 'spread') {          // 張開雙手（書上沒有這個細節，假設）
        up.set(sd * 0.95, 0.0, 0.3); fo.set(sd * 0.9, 0.15, 0.35);
      } else if (this.defender) {
        if (hi) { up.set(sd * 0.6, -0.25, 0.75); fo.set(sd * 0.15, 0.8, 0.55); } else { up.set(sd * 0.8, -0.5, 0.35); fo.set(sd * 0.45, -0.05, 0.9); }
      } else {
        up.set(sd * 0.25, -0.95, 0.15); fo.set(sd * 0.1, -0.6, 0.8);
      }
      const wArm = keepArms ? 0 : wRun;
      const upRun = _h.set(sd * 0.15, -0.95, 0.45 * swing * sd).normalize(), foRun = _k.set(sd * 0.05, -0.15 + 0.5 * swing * sd, 0.9).normalize();
      up.normalize().lerp(upRun, wArm).normalize(); fo.normalize().lerp(foRun, wArm).normalize();
      // 換姿勢時手慢慢移過去（約 0.1 秒），不會瞬間跳
      if (!C.init) { C.up.copy(up); C.fo.copy(fo); C.init = true; } else { C.up.lerp(up, kArm).normalize(); C.fo.lerp(fo, kArm).normalize(); }
      this.aimBone(A.sh, A.rUpper, up.copy(C.up).applyQuaternion(hq));
      this.aimBone(A.el, A.rFore, fo.copy(C.fo).applyQuaternion(hq));
    }
  }

  aimBone(bone, restDir, dirW) {
    bone.parent.getWorldQuaternion(_q2);
    bone.quaternion.setFromUnitVectors(restDir, dirW.applyQuaternion(_q2.invert()));
    bone.updateMatrixWorld(true);
  }

  solveLeg(L, T, pole) {
    const l1 = L.l1, l2 = L.l2;
    const Hp = L.hip.getWorldPosition(V());
    const D = V().subVectors(T, Hp); let d = D.length(); const u = D.divideScalar(d);
    d = clamp(d, 0.1, (l1 + l2) * 0.999);
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), b = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const w = pole.clone().addScaledVector(u, -pole.dot(u)).normalize();
    const K = Hp.clone().addScaledVector(u, a).addScaledVector(w, b);
    const A = Hp.clone().addScaledVector(u, d);
    this.aimBone(L.hip, L.rThigh, K.clone().sub(Hp).normalize());
    this.aimBone(L.knee, L.rShank, A.sub(K).normalize());
  }
}

// shadows：要不要投影子（main.js 的 HI）
export async function init(shadows) {
  const loader = new GLTFLoader();
  const kinds = ['guard', 'wing', 'big'];
  const glbs = await Promise.all(kinds.map((k) => loader.loadAsync(new URL(`../assets/body_${k}.glb`, import.meta.url).href)));
  const tpl = {};
  kinds.forEach((k, i) => { tpl[k] = { scene: glbs[i].scene, extras: glbs[i].asset.extras || {} }; });
  return {
    // player：main.js 的球員物件（root、fadeMats、defender）；color：0xRRGGBB；number：球衣號碼
    attach(player, role, color, number) {
      const t = tpl[BUILD[role] || 'wing'];
      const anim = new BodyAnimator(SkeletonUtils.clone(t.scene), t.extras, color, player.defender, number, shadows);
      player.root.add(anim.holder);
      player.fadeMats.push(anim.material, anim.numMat);
      return anim;
    },
  };
}
