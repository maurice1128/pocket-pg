// 口袋控衛：真人身體（公開版，D-20261025-39）
// 人物來自 Anny（NAVER LABS Europe）的預設 `anny` 拓樸：人體資產是 MakeHuman／MPFB2 的 CC0 1.0，程式 Apache 2.0，
// 可以放在公開網站。GLB 由 E:\basketball_data\anny_web\tools\convert_anny_to_glb.py 產生（22 骨、綁定時骨頭無旋轉、
// 面向 +Z、左 +X、原點在腳底中心），三種體型：後衛 1.88 m、側翼 1.98 m、長人 2.06 m（身高是假設）。
// 動作是程序化的，邏輯沿用本機 SMPL-X 版的 smplx_body.js；所有參數都是「假設」（鐵則 10）。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const P = {
  STANCE_HALF_WIDTH: 0.30,   // 假設：防守站姿雙腳中心距 0.60 m
  STANCE_STAGGER: 0.06,      // 假設：左腳略前（m）
  TOE_OUT: 0.18,             // 假設：腳尖外開約 10°（rad）
  DROP_IDLE: 0.17,           // 假設：防守站姿骨盆下降（m）
  DROP_IDLE_OFF: 0.06,       // 假設：進攻球員站著時骨盆下降（m）
  DROP_BACK: 0.14, DROP_SIDE: 0.18, DROP_RUN: 0.06, // 假設：後撤／滑步／往前衝的骨盆下降（m）
  HIP_BACK: 0.07,            // 假設：站姿臀部往後坐（m）
  LEAN_IDLE: 0.38, LEAN_IDLE_OFF: 0.15, LEAN_RUN: 0.22, // 假設：軀幹前傾（rad）
  LEAN_ACC: 0.035,           // 沿用 main.js 的加速度傾斜係數
  LEAN_MAX: 0.30,
  STEP_F0: 1.8, STEP_FK: 1.0, STEP_FMAX: 4.6, // 假設：步頻（步/秒）
  SIDE_CADENCE: 1.3,         // 假設：滑步步頻倍數
  DUTY_WALK: 0.56, DUTY_RUN: 0.40,
  LIFT_WALK: 0.07, LIFT_RUN: 0.14,
  BOB: 0.018, SWAY: 0.012, SWAY_F: 0.7,
  KNEE_POLE_OUT: 1.0,
};
// 位置 → 體型（身高是假設）
const BUILD = { PG: 'guard', O2: 'guard', X1: 'guard', X2: 'guard', O3: 'wing', O4: 'wing', X3: 'wing', X4: 'wing', O5: 'big', X5: 'big' };
// 膚色輪流用（只是讓場上看起來像真的比賽，不代表任何位置）
const TONES = [0x8d5524, 0xc68642, 0x5c3a1e, 0xe0ac69, 0x6b4226, 0xf1c27d, 0x3d2614, 0xb07a4a, 0x7a4b2a, 0xd9a066];
let toneIdx = 0;

const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
const _a = V(), _b = V(), _c = V(), _d = V(), _h = V(), _k = V(), _q = Q(), _q2 = Q(), _e = new THREE.Euler();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
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
  diffuseColor.rgb *= c;`);
  };
  m.customProgramCacheKey = () => 'pp-body-zones';
  return m;
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
    this.phase = Math.random(); this.vLocal = V(); this.accLocal = V();
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
    const stepF = Math.min(P.STEP_FMAX, P.STEP_F0 + P.STEP_FK * speed) * (1 + (P.SIDE_CADENCE - 1) * wSide);
    const cycF = stepF / 2;
    this.phase = (this.phase + dt * cycF * moving) % 1;
    const duty = lerp(P.DUTY_WALK, P.DUTY_RUN, wRun);
    const lift = lerp(P.LIFT_WALK, P.LIFT_RUN, wRun) * moving;
    const strideX = v.x / cycF * duty, strideZ = v.z / cycF * duty;
    const t = performance.now() / 1000;
    const idleDrop = this.defender ? P.DROP_IDLE : P.DROP_IDLE_OFF;
    const drop = idleDrop * wIdle + P.DROP_BACK * wBack + P.DROP_SIDE * wSide + lerp(P.DROP_BACK, P.DROP_RUN, sstep(1.2, 3.0, speed)) * wFwd;
    const bob = -P.BOB * moving * Math.cos(this.phase * 4 * Math.PI);
    const sway = P.SWAY * wIdle * Math.sin(t * 2 * Math.PI * P.SWAY_F);
    B.pelvis.position.set(this.pelvisRest.x + sway, this.pelvisRest.y - drop + bob, this.pelvisRest.z - P.HIP_BACK * (1 - wRun) * (this.defender ? 1 : 0.4));
    let lean = lerp(this.defender ? P.LEAN_IDLE : P.LEAN_IDLE_OFF, P.LEAN_RUN, wRun);
    const accPitch = clamp(this.accLocal.z * P.LEAN_ACC, -P.LEAN_MAX, P.LEAN_MAX);
    const accRoll = clamp(this.accLocal.x * P.LEAN_ACC, -P.LEAN_MAX, P.LEAN_MAX);
    lean += accPitch;
    B.pelvis.quaternion.setFromEuler(_e.set(lean * 0.35, 0, 0));
    for (const n of ['spine1', 'spine2', 'spine3']) B[n].quaternion.setFromEuler(_e.set(lean * 0.22, 0, -accRoll * 0.33));
    B.neck.quaternion.setFromEuler(_e.set(-lean * 0.4, 0, accRoll * 0.4));
    B.head.quaternion.setFromEuler(_e.set(-lean * 0.6, 0, accRoll * 0.4));
    H.updateMatrixWorld(true);
    const hq = H.getWorldQuaternion(_q).clone();
    for (const L of this.legs) {
      const p = (this.phase + L.phaseOff) % 1;
      let ox, oz, oy = 0, pitch = 0;
      if (p < duty) { const u = 0.5 - p / duty; ox = strideX * u; oz = strideZ * u; }
      else { const q = (p - duty) / (1 - duty), u = -0.5 + sstep(0, 1, q); ox = strideX * u; oz = strideZ * u; oy = lift * Math.sin(Math.PI * q); pitch = 0.3 * Math.sin(Math.PI * q) * (wBack - wRun * 0.5); }
      const lim = P.STANCE_HALF_WIDTH - 0.13; ox = clamp(ox, -lim - 0.6 * wFwd, lim + 0.6 * wFwd);
      const hw = lerp(this.defender ? P.STANCE_HALF_WIDTH : 0.17, 0.13, wRun);
      const target = _c.set(L.side * hw + ox, this.ankleH + oy, (L.side > 0 ? P.STANCE_STAGGER : 0) * (1 - wRun) + oz).applyMatrix4(H.matrixWorld);
      const pole = _d.set(L.side * P.KNEE_POLE_OUT * (1 - wRun), 0, 1).normalize().applyQuaternion(hq);
      this.solveLeg(L, target, pole);
      const footQ = _q2.copy(hq).multiply(new THREE.Quaternion().setFromEuler(_e.set(pitch, L.side * P.TOE_OUT * (1 - wRun), 0)));
      const kq = L.knee.getWorldQuaternion(new THREE.Quaternion());
      L.ankle.quaternion.copy(kq.invert().multiply(footQ));
    }
    // 手臂：防守者一手高一手低（假設）；進攻球員手自然垂下；跑步時擺臂
    const swing = Math.sin(this.phase * 2 * Math.PI);
    for (const A of this.arms) {
      const sd = A.side;
      let up, fo;
      if (this.defender) {
        up = sd > 0 ? _a.set(0.80, -0.30, 0.50) : _a.set(-0.80, -0.50, 0.40);
        fo = sd > 0 ? _b.set(0.25, 0.75, 0.55) : _b.set(-0.35, -0.05, 0.95);
      } else {
        up = _a.set(sd * 0.25, -0.95, 0.15);
        fo = _b.set(sd * 0.1, -0.6, 0.8);
      }
      const upRun = _h.set(sd * 0.15, -0.95, 0.45 * swing * sd).normalize(), foRun = _k.set(sd * 0.05, -0.15 + 0.5 * swing * sd, 0.9).normalize();
      up.normalize().lerp(upRun, wRun).normalize(); fo.normalize().lerp(foRun, wRun).normalize();
      this.aimBone(A.sh, A.rUpper, up.applyQuaternion(hq));
      this.aimBone(A.el, A.rFore, fo.applyQuaternion(hq));
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
