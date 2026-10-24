// 情境題庫：擋拆閱讀 + 新手的切入分球
// 座標：x = 橫向（右側邊線 +7.5），z = 距離底線（籃框中心 z = 1.575），單位公尺，FIBA 半場。
// 擋拆情境以「掩護在控衛右側、控衛往右繞掩護」撰寫；執行時隨機鏡像到左側。
// 每個角色的動作 = 一串關鍵影格 [t(秒), x, z]，t 以「關鍵防守反應起點 onset」為 0 往前後計。
// answer: 正確動作（2 分）；partial: 可接受（1 分）；其餘 0 分（計分沿用 Pagé et al., 2019）。
// 動作代碼：'shoot'（自己出手）、'drive'（自己運球攻擊：切過撲防、從中間切穿、單打錯位）、
//   'reset'（不攻擊：轉移、回傳、反向運球、退出來重新組織）、'pass:<O2|O3|O4|O5>'（為了攻擊而傳給那位隊友）。
//   reset 和 pass 分開算，才能統計「沒優勢硬打率」與「優勢浪費率」（docs/scenario_bank_v2.md 0.3、3.2 節）。
// resetTargets：答案是 'reset' 時，往陣列裡的隊友滑（例 ['O4']）也算 reset；往下滑一律算 reset。
// pressure：時間壓力，'loose'（寬鬆，外圍觀察，決策窗 ×2.2）、'medium'（×1.4）、'tight'（×1.0，預設）。倍數是假設（scenario_bank_v2 0.4 節）。
// labels：覆寫結果卡上的動作文字，例 { reset: '轉移球（Swing）', drive: '切過撲防' }；沒寫的用 ACTIONS 或引擎預設。
// look：第一人稱視線偏向某隊友（{ role, w }，w＝從籃框往該隊友插值的比例）；occludeAfter：遮蔽模式 onset 後幾秒隱藏防守者。
// sources 的 WABC 頁碼：新題照 scenario_bank_v2（頁尾印刷頁），舊題沿用 tactics_audit.md，兩者差 1 頁，待主對話統一。
// sources 裡的 '[推論，需教練確認]'：scenario_bank_v2 標明沒有單一原文依據、需要教練確認的設計。
// 新題的速度、距離、時機都是「假設」（依幾何合理性設定，未經影片校準），驗證數字見交接紀錄。
// 5v5 角色：PG＝你；O2 強側底角、O3 弱側底角、O4 弱側側翼、O5 掩護者／大個子；X1–X5 是各自的防守者。
// 題目沒寫到的角色用 DEFAULT_OFFENSE／DEFAULT_DEFENSE 的基本站位（不做關鍵動作，只維持正常防守）。
// 戰術依據與修正理由見 docs/tactics_audit.md（書目頁碼在該檔第 7 節）。
// 答案目前為「初版」：只經教科書核對，尚未經 3 位教練一致審核。

export const ACTIONS = {
  'pass:O5': '傳給順下（Roll）',
  'pass:O3': '分球弱側底角（Skip）',
  'pass:O2': '傳給強側底角',
  'pass:O4': '傳給弱側側翼',
  shoot: '急停跳投（Pull-up）',
};

// ---------- 共用路線（tactics_audit.md 第 4 節） ----------
// 正面下切（Drop、Switch、High drop 用）：貼著掩護者肩膀繞過
const PG_PATH = [[-0.9, -0.1, 9.3], [-0.3, 0.9, 9.25], [0.0, 1.6, 8.9], [0.6, 2.6, 7.6], [1.2, 3.0, 6.7]];
// 被延誤逼平、後撤運球（Hedge、Commit、Stunt、Under 用）
const PG_PATH_HEDGE = [[-0.9, -0.1, 9.3], [-0.3, 0.9, 9.25], [0.0, 1.6, 9.0], [0.4, 2.3, 8.9], [0.8, 2.7, 9.2], [1.2, 2.9, 9.3]];
// 被包夾、往外運兩步（NBA Coaches Playbook p.59–60）
const PG_PATH_BLITZ = [[-0.9, -0.1, 9.3], [-0.3, 0.9, 9.25], [0.0, 1.6, 9.0], [0.3, 2.1, 9.1], [0.7, 2.4, 9.6], [1.2, 2.5, 10.1]];
const ROLL_PATH = [[-0.9, 1.0, 8.6], [-0.3, 1.0, 8.5], [0.4, 0.6, 5.5], [1.2, 0.3, 3.0]];
// 短順下停在罰球線上方約 0.5 m（ASEP p.148）
const SHORT_ROLL_PATH = [[-0.9, 1.0, 8.6], [-0.3, 1.0, 8.5], [0.4, 0.9, 6.9], [0.8, 0.8, 6.4], [1.2, 0.8, 6.3]];
// 底角射手站在 FIBA 三分線（底角 6.6 m）外
const CORNER_SPOT = [[-0.9, -6.95, 1.2], [1.2, -6.95, 1.2]];

// 延誤用的 X1／X5（Hedge、Commit、Stunt 共用）
const HEDGE_X1 = [[-0.9, 0.0, 8.6], [-0.3, 0.5, 8.75], [0.0, 1.0, 9.3], [0.5, 1.7, 9.6], [1.0, 2.2, 9.4], [1.2, 2.4, 9.1]];
const HEDGE_X5 = [[-0.9, 1.3, 7.9], [-0.3, 1.4, 8.1], [0.0, 2.0, 8.3], [0.3, 2.6, 8.4], [0.8, 2.8, 8.5], [1.0, 2.5, 8.0], [1.2, 2.0, 7.3]];
const X3_HOME = [[-0.9, -5.4, 1.9], [1.2, -5.6, 1.8]];

// 新手切入分球（沒有掩護）：控衛從右側切入禁區，O5 是弱側籃下的大個子（dunker spot）
const PG_DRIVE = [[-1.2, 1.2, 9.0], [-0.6, 1.8, 7.4], [0.0, 2.0, 5.6], [0.6, 1.7, 4.2], [1.2, 1.4, 3.4]];
// X1 被甩開、跟在控衛內側（中路側）身後約 0.7 m。2026-10-24 修正：舊路線在 t≈-0.84 與控衛重疊（中心距 0.06 m）
const DRIVE_X1 = [[-1.2, 0.85, 8.25], [-0.9, 0.95, 7.75], [-0.6, 1.1, 7.1], [0.0, 1.3, 5.95], [0.6, 1.05, 4.65], [1.2, 0.85, 3.95]];
// 切入姊妹題（drive_help／drive_nohelp／drive_nail_help／noadv_drive_wall）共用視線：看得到籃框、弱側底角和弱側側翼
const DRIVE_LOOK = { role: 'O4', w: 0.35 };
const DUNKER = [[-1.2, -2.9, 0.9], [1.2, -2.9, 0.9]];
const DUNKER_X5 = [[-1.2, -2.2, 1.6], [1.2, -2.0, 1.7]];
const DRIVE_LABELS = { 'pass:O5': '傳給籃下大個子', 'pass:O3': '分球弱側底角', shoot: '自己上籃／拋投' };

// 2 打 1 快攻：你和 O2 兩線推進，只有 X1 一個人退防；其他人都還在後場（鏡頭後方）
const FB_PG = [[-1.2, -1.0, 12.5], [-0.6, -0.8, 10.4], [0.0, -0.6, 8.3], [0.6, -0.4, 6.2], [1.2, -0.3, 4.4]];
const FB_O2 = [[-1.2, 3.6, 12.2], [-0.6, 3.5, 10.0], [0.0, 3.3, 7.9], [0.6, 2.8, 5.6], [1.2, 2.2, 3.6]];
const FB_TRAIL = (x, z) => [[-1.2, x, z], [1.2, x * 0.9, z - 3.5]];
const FB_OFFENSE = { PG: FB_PG, O2: FB_O2, O3: FB_TRAIL(-4.0, 18.5), O4: FB_TRAIL(-1.5, 20.0), O5: FB_TRAIL(1.5, 19.5) };
const FB_DEFENSE = { X2: FB_TRAIL(2.5, 17.5), X3: FB_TRAIL(-3.0, 17.0), X4: FB_TRAIL(-1.0, 18.5), X5: FB_TRAIL(1.0, 18.0) };
const FB_LABELS = { 'pass:O2': '傳給隊友上籃', shoot: '自己上籃' };

// ==================== 2026-10-24 新增 15 題用的路線（docs/scenario_bank_v2.md 第 4 節） ====================
// 所有數值都是「假設」：依 FIBA 半場幾何設定，用 Python 檢查過不重疊、速度 < 7 m/s、射手在三分線外。

// ---------- 3 打 2 快攻（A1、A2）：兩題只有 X1 不同 ----------
// 你從中路推進到罰球線上緣；兩翼沿邊線跑寬再切向籃下；兩名防守者一前一後（tandem）；其他人都在後場（z > 13）
const FB3_PG = [[-1.2, 0.3, 13.2], [-0.5, 0.15, 10.5], [0.0, 0.0, 8.4], [0.4, 0.0, 7.7], [0.7, 0.0, 7.5]];
const FB3_O2 = [[-1.2, 4.8, 10.8], [-0.55, 5.2, 7.3], [0.0, 4.95, 4.0], [0.35, 4.6, 3.0], [0.85, 3.1, 1.9], [1.3, 1.9, 1.6]];
const FB3_O3 = FB3_O2.map(([t, x, z]) => [t, -x, z]);
// 下方防守者留在籃下、稍微偏向 O3 那側（0.9 m）→ O2 是「離他較遠的那一翼」
const FB3_X3 = [[-1.2, -1.2, 6.0], [-0.2, -0.9, 2.6], [0.4, -0.9, 2.3], [1.3, -0.9, 2.3]];
const FB3_X1_PRE = [[-1.2, 0.3, 9.6], [-0.4, 0.1, 7.4], [0.0, 0.0, 6.2]]; // 上方防守者退防到罰球線（onset 前兩題相同）
const FB3_X1_STOP = [...FB3_X1_PRE, [0.3, 0.0, 6.65], [1.3, 0.0, 6.65]];          // 跨出來擋在你正前方 0.85 m
const FB3_X1_SAG = [...FB3_X1_PRE, [0.4, 0.0, 5.3], [0.8, 0.0, 4.9], [1.3, 0.0, 4.9]]; // 往後退到罰球線下，讓出急停空間
const FB3_OFFENSE = { PG: FB3_PG, O2: FB3_O2, O3: FB3_O3, O4: FB_TRAIL(-1.5, 20.0), O5: FB_TRAIL(1.5, 19.5) };
const FB3_DEFENSE = { X3: FB3_X3, X2: FB_TRAIL(2.5, 17.5), X4: FB_TRAIL(-1.0, 18.5), X5: FB_TRAIL(1.0, 18.0) };
const FB3_LABELS = { 'pass:O2': '傳給遠側翼（離籃下防守者較遠）', 'pass:O3': '傳給近側翼（籃下防守者那一側）', shoot: '急停跳投／自己攻' };

// ---------- 側翼持球（撲防閱讀 C1–C3、沒有優勢 H1–H3 共用） ----------
const WING_PG = [[-1.2, 5.0, 6.9], [1.5, 5.0, 6.9]];      // 你在右側翼持球（離籃框 7.3 m，三分線外）；接球動作省略
const TOP_O4 = [[-1.2, -0.4, 8.75], [1.5, -0.4, 8.75]];   // 弧頂隊友（離籃框 7.2 m）：轉移球／再傳一次的對象
const RIGHT_CORNER = [[-1.2, 6.95, 1.2], [1.5, 6.95, 1.2]]; // 強側底角射手
const WING_LOOK = { role: 'O4', w: 0.5 };                 // 視線在籃框與弧頂之間：看得到撲防者、弧頂和弱側底角

// H1–H3「轉移球閱讀」三姊妹：開場完全相同，只有 X1 的撲防不同
const NOADV_OFFENSE = { PG: WING_PG, O4: TOP_O4, O2: RIGHT_CORNER, O5: [[-1.2, 2.9, 2.3], [1.5, 2.9, 2.3]], O3: CORNER_SPOT };
const NOADV_DEFENSE = {
  X2: [[-1.2, 6.3, 2.0], [1.5, 6.3, 2.0]],     // 阻絕底角傳球路線（腳沒越線），離 O2 1.0 m
  X5: [[-1.2, 3.25, 3.15], [1.5, 3.25, 3.15]], // 高側 3/4 繞前，站在餵低位的傳球路線上
  X4: [[-1.2, 0.35, 7.6], [1.5, 0.35, 7.55]],  // 弧頂一傳距離：站在空隙（gap），離傳球路線 0.9 m
  X3: [[-1.2, -3.3, 2.6], [1.5, -3.3, 2.6]],   // 二傳距離：禁區邊 ball-you-man
};
const NOADV_X1_START = [[-1.2, 3.0, 4.6]];     // 球剛轉到你手上，你的防守者在你和籃框之間 2.8 m
const NOADV_X1_SET = [...NOADV_X1_START, [-0.9, 3.0, 4.6], [-0.45, 3.85, 5.55], [0.0, 4.4, 6.2], [0.4, 4.45, 6.25], [1.5, 4.45, 6.25]];   // 早早到位、站好
const NOADV_X1_LATE = [...NOADV_X1_START, [-0.3, 3.0, 4.6], [0.0, 3.35, 5.0], [0.25, 3.95, 5.7], [0.45, 4.35, 6.15], [0.7, 4.5, 6.3], [1.5, 4.5, 6.3]]; // 反應慢、onset 時還在 2.5 m 外加速衝
const NOADV_X1_ONTIME = [...NOADV_X1_START, [-0.6, 3.0, 4.6], [-0.25, 3.85, 5.55], [0.0, 4.2, 5.95], [0.35, 4.42, 6.22], [1.5, 4.45, 6.25]]; // 衝刺後 onset 開始碎步煞車
const NOADV_LABELS = { reset: '轉移球（Swing）', drive: '切過撲防（Attack）', shoot: '接球投籃', 'pass:O4': '傳回弧頂', 'pass:O2': '傳給強側底角', 'pass:O5': '餵低位', 'pass:O3': '跳傳弱側底角' };

// C1–C3「接球對撲防」三姊妹：切入分球後球回到你手上，X1、X4 開場都在禁區（剛才去協防），只有 X1／X4 的動作不同
const CO_OFFENSE = { PG: WING_PG, O4: TOP_O4, O2: RIGHT_CORNER, O5: DUNKER, O3: CORNER_SPOT };
const CO_DEFENSE = { X2: [[-1.2, 6.25, 1.9], [1.5, 6.25, 1.9]], X3: [[-1.2, -5.5, 1.85], [1.5, -5.6, 1.8]], X5: DUNKER_X5 };
const CO_X1_START = [[-1.2, 2.2, 3.6]];
const CO_X1_LATE = [...CO_X1_START, [-0.5, 2.2, 3.6], [0.0, 3.1, 4.7], [0.5, 3.75, 5.45], [1.0, 4.1, 5.85], [1.5, 4.2, 5.95]];  // 慢跑出來（約 2.8 m/s）、手放低
const CO_X1_FLY = [...CO_X1_START, [-0.5, 2.2, 3.6], [-0.2, 3.04, 5.02], [0.1, 3.88, 6.45], [0.3, 4.36, 7.3], [0.55, 4.66, 7.95], [0.9, 4.75, 8.15], [1.5, 4.75, 8.15]]; // 全速衝刺 5.5 m/s、不煞車，從你高側 0.75 m 衝過頭
const CO_X1_ONTIME = [...CO_X1_START, [-0.9, 2.2, 3.6], [-0.5, 3.45, 5.05], [-0.1, 4.2, 5.95], [0.2, 4.4, 6.2], [1.5, 4.42, 6.22]]; // 提早出發，碎步到一臂距離
const CO_X4_BACK = [[-1.2, 0.6, 5.0], [-0.6, 0.6, 5.0], [0.1, 0.05, 7.2], [0.4, -0.2, 7.85], [1.5, -0.2, 7.85]]; // 回到弧頂隊友身邊（0.9 m）
const CO_X4_STAY = [[-1.2, 0.6, 5.0], [-0.6, 0.6, 5.0], [0.5, 0.45, 5.25], [0.9, 0.35, 5.6], [1.5, 0.15, 6.6]];  // 還在罰球線附近面向禁區（離 O4 3.3 m 以上）
const CO_LABELS = { shoot: '接球就投', drive: '切過撲防（Attack）', 'pass:O4': '再傳一次給弧頂（Extra pass）', 'pass:O2': '傳給強側底角', 'pass:O5': '傳給籃下大個子', 'pass:O3': '跳傳弱側底角', reset: '轉移球' };

// ---------- 切入姊妹題（B2、H4 和 drive_help 同開場：onset 前完全相同） ----------
const DRIVE5_LABELS = Object.assign({}, DRIVE_LABELS, { 'pass:O4': '分球弱側側翼', 'pass:O2': '分球強側底角', reset: '退出來、重新組織（Back out）' });
const DRIVE_X2_HOME = [[-1.2, 5.9, 1.9], [0.0, 5.85, 1.95], [0.5, 6.2, 1.75], [1.6, 6.2, 1.75]];  // onset 前同預設，之後貼回底角射手
const DRIVE_X3_HOME = [[-1.2, -5.4, 1.9], [0.0, -5.5, 1.9], [0.5, -6.1, 1.6], [1.6, -6.1, 1.6]];  // onset 前同 drive_nohelp，之後留在射手身邊
const DRIVE_X4_PRE = [[-1.2, -3.4, 5.6], [0.0, -3.18, 5.38]];                                      // onset 前同預設 X4

// ---------- 底線突破（B1） ----------
const BL_PG = [[-1.2, 5.0, 6.9], [-0.6, 4.6, 5.4], [0.0, 4.1, 3.9], [0.5, 3.5, 2.6], [1.0, 3.05, 2.0], [1.4, 2.9, 1.85]];
const BL_X1 = [[-1.2, 4.4, 6.25], [-0.6, 3.95, 5.0], [0.0, 3.45, 4.45], [0.5, 2.85, 3.3], [1.0, 2.45, 2.7], [1.4, 2.35, 2.55]];   // 被甩開、跟在內側身後
const BL_X2 = [[-1.2, 6.15, 1.95], [0.0, 6.1, 1.95], [0.3, 4.95, 2.35], [0.6, 4.3, 2.45], [1.0, 4.0, 2.35], [1.4, 3.95, 2.3]];   // 離開底角、兩腳踏進三分線擋底線

// ---------- 側翼擋拆 vs 封底線（D1） ----------
const ICE_PG = [[-1.2, 5.3, 7.4], [-0.6, 5.15, 7.1], [0.0, 5.15, 6.65], [0.4, 5.25, 6.2], [0.8, 5.25, 6.1], [1.5, 5.25, 6.1]];   // 被逼往底線運一兩步就被擋住
const ICE_O5 = [[-1.2, 3.4, 7.6], [-0.6, 4.05, 7.95], [0.0, 4.05, 7.95], [0.35, 3.25, 7.0], [0.65, 2.7, 6.6], [1.5, 2.6, 6.55]]; // 在你中路側掩護 → 外彈到罰球區角
const ICE_X1 = [[-1.2, 4.75, 8.0], [-0.6, 4.6, 7.52], [0.0, 4.75, 7.25], [0.4, 4.9, 6.95], [0.8, 4.95, 6.9], [1.5, 4.95, 6.9]];   // 跳到掩護那一側、把你往底線逼
const ICE_X5 = [[-1.2, 3.4, 6.2], [-0.6, 3.8, 6.1], [0.0, 4.35, 5.3], [0.4, 4.55, 4.95], [1.5, 4.6, 4.9]];                        // 站在掩護者下方、擋住底線（Down）

// ---------- 延誤後兩人回位（D4）：onset 前和 pnr_hedge 完全相同 ----------
const REC_PG = [...PG_PATH_HEDGE.slice(0, 3), [0.4, 2.2, 9.3], [0.8, 2.6, 9.8], [1.2, 2.8, 10.1], [2.0, 2.8, 10.2]];               // 被延誤逼離籃框
const REC_X1 = [...HEDGE_X1.slice(0, 3), [0.35, 1.5, 8.6], [0.7, 2.1, 8.65], [1.1, 2.45, 9.0], [2.0, 2.5, 9.15]];                  // 從掩護上方追回，站到你和籃框之間
const REC_X5 = [...HEDGE_X5.slice(0, 3), [0.12, 2.2, 8.35], [0.5, 1.75, 7.1], [0.95, 1.05, 5.45], [1.4, 0.8, 4.9], [2.0, 0.75, 4.8]]; // 短延誤後馬上退回順下者前面
const REC_O5 = [...ROLL_PATH.slice(0, 2), [0.0, 0.83, 7.21], [0.5, 0.7, 6.55], [1.0, 0.55, 5.95], [1.4, 0.4, 5.65], [2.0, 0.35, 5.55]]; // 順下被大個子擋住、推不深

// ---------- 後門切（E1） ----------
const BD_O2 = [[-1.2, 5.3, 6.6], [-0.4, 5.5, 7.6], [0.0, 5.45, 7.75], [0.35, 4.5, 5.75], [0.75, 3.1, 3.85], [1.15, 1.6, 2.3], [1.45, 0.9, 1.9]]; // 往上踩一步 → 後門切
const BD_X2 = [[-1.2, 4.55, 6.85], [-0.4, 4.75, 7.85], [0.0, 4.7, 8.0], [0.3, 4.7, 7.95], [0.65, 4.35, 7.05], [1.0, 3.6, 5.65], [1.5, 2.7, 4.3]]; // 站在傳球路線上、頭轉向球，反應慢半拍

export const SCENARIOS = [
  // ---------- Level 1：2 打 1 快攻（tactics_audit.md 第 5 節 N1、N2） ----------
  {
    id: 'fb_2v1_commit',
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['NBA Coaches Playbook p.166–167', 'WABC Coaches Manual p.21（Driving Lane）'],
    level: 1,
    play: '快攻',
    name: '2 打 1：防守者撲向你',
    coverage: '快攻 2 打 1，唯一的防守者踏出來擋你的上籃路線，離開了你的隊友。',
    cueRoles: ['X1'],
    answer: 'pass:O2',
    partial: [],
    labels: FB_LABELS,
    look: { role: 'O2', w: 0.5 },
    fixedX3: true,
    explain: '唯一的防守者選擇來擋你，就沒人管你的隊友了。等他踏進你的路線、確定選邊再傳，隊友就是空檔上籃。最佳選擇：傳給隊友。',
    mistake: '防守者還沒選邊就太早傳，讓他一個人守兩個人；或硬切進他身上。',
    offense: FB_OFFENSE,
    defense: Object.assign({}, FB_DEFENSE, {
      X1: [[-1.2, 0.8, 5.0], [-0.2, 0.6, 5.4], [0.0, 0.3, 5.9], [0.5, -0.2, 6.3], [1.2, -0.3, 5.6]],
    }),
  },
  {
    id: 'fb_2v1_stay',
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['NBA Coaches Playbook p.166–167', 'WABC Coaches Manual p.27'],
    level: 1,
    play: '快攻',
    name: '2 打 1：防守者退守隊友',
    coverage: '快攻 2 打 1，防守者往後退、站在你和隊友之間的傳球路線上。',
    cueRoles: ['X1'],
    answer: 'shoot',
    partial: [],
    labels: FB_LABELS,
    look: { role: 'O2', w: 0.5 },
    fixedX3: true,
    explain: '防守者往後退、守在傳球路線上，等於把上籃路線讓給你。直接攻籃，逼他出來，他一出來再分給隊友。最佳選擇：自己上籃。',
    mistake: '硬把球傳給被看住的隊友：防守者就在傳球路線上，球會被抄。',
    offense: FB_OFFENSE,
    defense: Object.assign({}, FB_DEFENSE, {
      X1: [[-1.2, 0.8, 5.0], [0.0, 1.2, 4.6], [0.5, 1.8, 3.9], [1.2, 2.0, 3.0]],
    }),
  },
  // ---------- 快攻：3 打 2 與人數到齊（scenario_bank_v2 A1、A2、A6） ----------
  // A1／A2 是姊妹題：開場完全相同，只有上方防守者 X1 的動作不同
  {
    id: 'fb_3v2_top_stop',
    evidence: 'medium', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['WABC Coaches Manual p.21', 'NBA Coaches Playbook p.166–167', '[由 2 打 1 原則推論，需教練確認]'],
    level: 1,
    play: '快攻',
    name: '3 打 2：上方防守者擋球',
    coverage: '3 打 2 快攻，兩名防守者一前一後（tandem）：上面的防守者跨出來擋在你正前方，下面的人留在籃下、稍微偏向一側。',
    cueRoles: ['X1'],
    answer: 'pass:O2',
    partial: [],
    pressure: 'medium',
    labels: FB3_LABELS,
    look: { role: 'O2', w: 0 }, // 視線正對籃框，兩翼都在畫面邊緣（橫拿手機才看得到）
    fixedX3: true,
    occludeAfter: 0.3,
    explain: '上面的防守者跨出來擋你：兩個防守者已經有一個在你身上，兩翼只剩籃下一個人。等他確定上來再傳，傳給離籃下防守者較遠的那一翼，接球的人和籃下防守者打 2 打 1。最佳選擇：傳給遠側翼。',
    mistake: '繼續運進禁區，把兩個防守者都帶到自己身上卻不出球；或上方防守者還沒出來就太早傳，讓兩人有時間各守一翼。',
    offense: FB3_OFFENSE,
    defense: Object.assign({}, FB3_DEFENSE, { X1: FB3_X1_STOP }),
  },
  {
    id: 'fb_3v2_top_sag',
    evidence: 'weak', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['NBA Coaches Playbook p.166–167', 'WABC Coaches Manual p.21、p.27', '[由 2 打 1 原則推論，需教練確認]'],
    level: 1,
    play: '快攻',
    name: '3 打 2：上方防守者後退',
    coverage: '3 打 2 快攻，上面的防守者不上來擋你，往後退到罰球線下、張開雙手守兩翼。',
    cueRoles: ['X1'],
    answer: 'shoot',
    partial: [],
    pressure: 'medium',
    labels: FB3_LABELS,
    look: { role: 'O2', w: 0 },
    fixedX3: true,
    occludeAfter: 0.4,
    explain: '上面的防守者往後退、守在兩翼的傳球路線附近，等於把罰球線附近的空間讓給你。在罰球線上緣急停跳投，或再運一兩步到沒人干擾的位置出手。最佳選擇：急停跳投。和「上方防守者擋球」比一比：他上來就傳，他後退就自己攻。',
    mistake: '照習慣傳翼：防守者就在傳球路線附近，球容易被抄。',
    offense: FB3_OFFENSE,
    defense: Object.assign({}, FB3_DEFENSE, { X1: FB3_X1_SAG }),
  },
  {
    id: 'fb_even_pullout',
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['ASEP p.138–139', 'NBA Coaches Playbook p.136、p.180', 'Canada Basketball LTAD PDF p.58（背景）'],
    level: 2,
    play: '快攻',
    name: '防守人數到齊：拉出來組織',
    coverage: '你抄球後推進，但三名防守者已經比你先回到三分線內站好；隊友都還在你身後。',
    cueRoles: ['X1', 'X2', 'X3'],
    answer: 'reset',
    partial: [],
    pressure: 'loose',
    resetTargets: [],
    labels: { reset: '拉出來、等隊友（Pull out）', shoot: '一個人硬攻', drive: '一個人硬切' },
    fixedX3: true,
    occludeAfter: 0.5,
    explain: '快攻只在有人數優勢時打。現在前面有三個防守者站好，只有你一個人到位：沒有優勢，就不要一個人衝進三個人裡。停下來、把球拉回，等隊友跟上再進入早期進攻。最佳選擇：拉出來（往下滑）。要快，但不要急。',
    mistake: '一個人衝進三人防守裡硬上籃。',
    offense: {
      PG: [[-1.2, 0.6, 14.6], [-0.4, 0.4, 11.8], [0.1, 0.3, 10.4], [0.5, 0.4, 9.9], [1.2, 0.9, 10.6], [2.0, 1.2, 11.0]],
      O2: FB_TRAIL(3.6, 19.0), O3: FB_TRAIL(-3.8, 19.5), O4: FB_TRAIL(-1.5, 21.0), O5: FB_TRAIL(1.5, 20.5),
    },
    defense: {
      X1: [[-1.2, 0.2, 10.4], [-0.3, 0.3, 9.0], [0.2, 0.35, 8.6], [2.0, 0.4, 8.7]],   // onset：在三分線上站定迎你
      X2: [[-1.2, 3.8, 9.0], [0.0, 3.2, 6.6], [0.8, 3.0, 6.1], [2.0, 3.0, 6.1]],
      X3: [[-1.2, -3.4, 8.6], [0.0, -2.8, 6.2], [0.8, -2.5, 5.5], [2.0, -2.5, 5.5]],
      X4: FB_TRAIL(-2.5, 16.0), X5: FB_TRAIL(2.0, 16.5),
    },
  },
  // ---------- Level 1–2：切入分球 ----------
  {
    id: 'drive_help',
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft', // draft → coach_1 → approved（3 位教練一致）
    sources: ['ASEP p.132–134', 'NBA Coaches Playbook p.81 圖 5.14（強側協防，原理相同）'],
    level: 1,
    play: '持球切入',
    name: '切入 vs 底角協防（Help）',
    coverage: '你切進禁區，弱側底角的防守者離開射手，站進你的切入路線。',
    cueRoles: ['X3'],
    answer: 'pass:O3',
    partial: [],
    labels: DRIVE_LABELS,
    look: DRIVE_LOOK,
    explain: '底角防守者（Low man）離開射手來協防你：協防從哪裡來，空檔就在哪裡。在他離開的那一刻把球分到底角。最佳選擇：分球底角。',
    mistake: '看到協防就停球或硬上，失去切入的優勢；傳給籃下大個子也不對，他的防守者沒有離開。',
    offense: { PG: PG_DRIVE, O5: DUNKER },
    defense: {
      X1: DRIVE_X1,
      X5: DUNKER_X5,
      X3: [[-1.2, -5.4, 1.9], [-0.2, -5.2, 2.0], [0.0, -4.8, 2.2], [0.4, -2.8, 2.9], [0.8, -0.6, 3.2], [1.2, 0.6, 3.4]],
    },
  },
  {
    id: 'drive_nohelp',
    evidence: 'medium', // 依 docs/citation_check.md 第 3 節
    status: 'draft', // draft → coach_1 → approved（3 位教練一致）
    sources: ['NBA Coaches Playbook p.21（Direct Drive）', 'ASEP p.133'],
    level: 1,
    play: '持球切入',
    name: '切入 vs 沒有協防',
    coverage: '你切進禁區，底角防守者只往前踏一步，就留在射手身邊。',
    cueRoles: ['X3'],
    answer: 'shoot',
    partial: [],
    labels: DRIVE_LABELS,
    look: DRIVE_LOOK,
    explain: '底角防守者沒有離開射手，代表沒有人來擋你：路線是空的，自己完成上籃或拋投。最佳選擇：自己攻擊。',
    mistake: '對著被看住的射手硬傳：防守者就在他旁邊，球容易被抄。',
    offense: { PG: PG_DRIVE, O5: DUNKER },
    defense: {
      X1: DRIVE_X1,
      X5: DUNKER_X5,
      X3: [[-1.2, -5.4, 1.9], [0.0, -5.5, 1.9], [0.3, -5.0, 2.1], [0.7, -5.6, 1.8], [1.2, -5.8, 1.7]],
    },
  },
  // ---------- Level 2：切入分球進階（scenario_bank_v2 B1、B2） ----------
  {
    id: 'drive_baseline_corner',
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['NBA Coaches Playbook p.81 圖 5.14', 'ASEP p.134'],
    level: 2,
    play: '持球切入',
    name: '底線突破 vs 強側底角協防',
    coverage: '你從右側翼往底線突破，強側底角的防守者離開射手，往你的切入路線跨步、踏進三分線內。',
    cueRoles: ['X2'],
    answer: 'pass:O2',
    partial: [],
    pressure: 'tight',
    labels: { 'pass:O2': '回傳強側底角', 'pass:O5': '傳給弱側低位', 'pass:O3': '跳傳弱側底角', 'pass:O4': '跳傳弱側側翼', shoot: '自己上籃／拋投' },
    look: { role: 'O2', w: 0.7 }, // 底線突破時視線沿底線看向強側底角（籃框在畫面外側）
    fixedX3: true,
    explain: '強側底角的防守者離開射手來擋你的底線突破：協防從哪裡來，空檔就在哪裡。在他離開的那一刻，把球回傳給你身旁的底角射手，不要等跳起來才找人。最佳選擇：回傳底角。',
    mistake: '看到協防就停球，或起跳後才在空中找人；傳弱側也不對，那邊的防守者都沒動。',
    offense: { PG: BL_PG, O2: RIGHT_CORNER, O5: [[-1.2, -2.8, 2.2], [1.4, -2.8, 2.2]] },
    defense: {
      X1: BL_X1,
      X2: BL_X2,
      X5: [[-1.2, -1.85, 1.8], [0.5, -1.7, 1.85], [1.4, -1.6, 1.9]],
      X3: [[-1.2, -5.9, 1.65], [1.4, -5.95, 1.6]],
      X4: [[-1.2, -4.15, 6.25], [1.4, -4.1, 6.2]],
    },
  },
  {
    id: 'drive_nail_help',
    evidence: 'medium', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['ASEP p.134', 'coachingtoolbox.net/defense/defending-nba-pick-roll.html（擋拆情境類推）'],
    level: 2,
    play: '持球切入',
    name: '中路切入 vs Nail 協防',
    coverage: '你從右側往禁區切入，弱側側翼的防守者從罰球線中段（Nail）一帶跨進你的切入路線。',
    cueRoles: ['X4'],
    answer: 'pass:O4',
    partial: [],
    pressure: 'tight',
    labels: DRIVE5_LABELS,
    look: DRIVE_LOOK,
    occludeAfter: 0.4,
    explain: '弱側側翼的防守者離開自己的人，經過罰球線中段（Nail）跨進你的切入路線：他剛離開的人就是空檔。在他跨出、轉向你的那一刻，把球分到弱側側翼。最佳選擇：分球弱側側翼。',
    mistake: '被 Nail 協防擋下才停球，或硬切進他身上；傳底角也不對，底角防守者都留在射手身邊。',
    offense: { PG: [...PG_DRIVE.slice(0, 3), [0.5, 1.9, 4.85], [1.0, 1.8, 4.55], [1.6, 1.75, 4.45]], O5: DUNKER },
    defense: {
      X1: [...DRIVE_X1.slice(0, 4), [0.5, 1.3, 5.3], [1.0, 1.3, 5.0], [1.6, 1.3, 5.0]],
      X5: DUNKER_X5,
      X4: [...DRIVE_X4_PRE, [0.4, -1.6, 5.35], [0.8, 0.0, 5.0], [1.1, 0.5, 4.7], [1.6, 0.55, 4.6]], // 跑動協防（約 4 m/s）
      X3: DRIVE_X3_HOME,
      X2: DRIVE_X2_HOME,
    },
  },
  // ---------- Level 2–3：撲防閱讀（scenario_bank_v2 C1–C3）：你在側翼接球，三題開場相同 ----------
  {
    id: 'closeout_late_shoot',
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['ASEP p.133', 'NBA Coaches Playbook p.21', 'WABC Coaches Manual p.19'],
    level: 2,
    play: '接球對撲防',
    name: '撲防太慢（Late closeout）',
    coverage: '切入分球後球回到你手上，你的防守者從禁區慢慢撲出來，接球時還在兩公尺外、手放低。',
    cueRoles: ['X1', 'X4'],
    answer: 'shoot',
    partial: [],
    pressure: 'tight',
    labels: CO_LABELS,
    look: WING_LOOK,
    fixedX3: true,
    occludeAfter: 0.4,
    explain: '撲防的人回得慢：你接球時他還在兩公尺外、手放低，而且是慢跑過來，不是全速衝。你在射程內、他來不及干擾，接球就投，不要多運一下讓他到位。最佳選擇：接球投籃。',
    mistake: '多運一下或先做假動作，讓撲防到位。',
    offense: CO_OFFENSE,
    defense: Object.assign({}, CO_DEFENSE, { X1: CO_X1_LATE, X4: CO_X4_BACK }),
  },
  {
    id: 'closeout_flyby_drive',
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['NBA Coaches Playbook p.165、p.234', 'ASEP p.133', 'WABC Coaches Manual p.19'],
    level: 2,
    play: '接球對撲防',
    name: '撲防過頭（Fly-by closeout）',
    coverage: '球回到你手上，你的防守者從禁區全速衝刺撲過來，最後沒有碎步、身體往前衝、伸單手封投。',
    cueRoles: ['X1', 'X4'],
    answer: 'drive',
    partial: [],
    pressure: 'tight',
    labels: CO_LABELS,
    look: WING_LOOK,
    fixedX3: true,
    occludeAfter: 0.3,
    explain: '撲防者全速衝刺、最後一步沒有碎步煞車，重心往前，一定會衝過頭。對著飛過來的手投籃命中率低；假投或直接從他身側切過，他轉不回來。最佳選擇：切過撲防。和「撲防太慢」比一比：慢跑過來＝接球投；全速衝過來＝切。',
    mistake: '對著飛過來的手硬投。',
    offense: CO_OFFENSE,
    defense: Object.assign({}, CO_DEFENSE, { X1: CO_X1_FLY, X4: CO_X4_BACK }),
  },
  {
    id: 'closeout_extra_pass',
    evidence: 'medium', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['ASEP p.133', 'NBA Coaches Playbook p.68、p.79、p.87', 'hooperuniversity.com/breakdowns/understanding-how-to-play-with-the-advantage'],
    level: 3,
    play: '接球對撲防',
    name: '撲防到位＋下一個人空（Extra pass）',
    coverage: '球回到你手上，你的防守者及時撲到；弧頂隊友的防守者剛才去補禁區，還在罰球線附近面向禁區。',
    cueRoles: ['X1', 'X4'],
    answer: 'pass:O4',
    partial: [],
    pressure: 'tight',
    labels: CO_LABELS,
    look: WING_LOOK,
    fixedX3: true,
    occludeAfter: 0.3,
    explain: '你的防守者撲到位、雙手舉高，自己投或切都沒有優勢；但弧頂隊友的防守者剛才去補禁區，現在還在罰球線附近、離他三公尺以上。多傳一次，空檔就在下一個人身上。最佳選擇：再傳一次給弧頂。',
    mistake: '對著到位的撲防硬投或硬切；只看自己的防守者，沒看下一個人。',
    offense: CO_OFFENSE,
    defense: Object.assign({}, CO_DEFENSE, { X1: CO_X1_ONTIME, X4: CO_X4_STAY }),
  },
  // ---------- Level 1–2：沒有優勢 → 不硬打（scenario_bank_v2 H1–H4；UR-17） ----------
  // H1／H2／H3 是三姊妹：開場完全相同，只有 X1 的撲防不同（早到站好／太慢還在衝／準時碎步）
  {
    id: 'noadv_wing_reverse',
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['NBA Coaches Playbook p.77、p.79', 'ASEP p.157', 'WABC Coaches Manual p.30'],
    level: 1,
    play: '側翼持球',
    name: '側翼：五個防守者都站好',
    coverage: '你在右側翼接球，你的防守者早早到位、壓低姿勢；底角被阻絕、低位被繞前、弱側站在協防位置。沒有人失位。',
    cueRoles: ['X1'],
    answer: 'reset',
    partial: [],
    pressure: 'loose',
    resetTargets: ['O4'],
    labels: NOADV_LABELS,
    look: WING_LOOK,
    fixedX3: true,
    occludeAfter: 0.4,
    explain: '五個防守者都在正確位置：你的防守者在一臂距離，底角被阻絕，低位被 3/4 繞前，弱側站在協防位置（ball-you-man）。沒有優勢就不要硬打：把球回傳弧頂、轉到另一側，讓防守再移動一次，空檔通常在轉移之後出現。最佳選擇：轉移球（往弧頂滑或往下滑）。',
    mistake: '對著到位的防守者硬切，或急停投出被干擾的球；運球太多，讓隊友站著看。',
    offense: NOADV_OFFENSE,
    defense: Object.assign({}, NOADV_DEFENSE, { X1: NOADV_X1_SET }),
  },
  {
    id: 'noadv_swing_late_closeout',
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['NBA Coaches Playbook p.79、p.85、p.229', 'ASEP p.133', 'WABC Coaches Manual p.19'],
    level: 2,
    play: '側翼持球',
    name: '轉移後撲防太慢',
    coverage: '球從另一側經弧頂轉到你手上；你的防守者原本在協防，現在才從禁區邊衝出來，還在兩公尺外加速。',
    cueRoles: ['X1'],
    answer: 'drive',
    partial: ['shoot'],
    pressure: 'tight',
    labels: NOADV_LABELS,
    look: WING_LOOK,
    fixedX3: true,
    occludeAfter: 0.3,
    explain: '轉移球的目的就是逼防守輪轉：你的防守者剛才在協防，現在還在兩公尺外、身體還在加速衝。趁他衝過來、重心停不住時直接攻過去，不要再轉一次。最佳選擇：切過撲防。他如果停下、手放低，接球就投也可以（1 分）。',
    mistake: '接球後再轉一次，把轉移創造出來的優勢送回去。',
    offense: NOADV_OFFENSE,
    defense: Object.assign({}, NOADV_DEFENSE, { X1: NOADV_X1_LATE }),
  },
  {
    id: 'noadv_swing_again',
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['NBA Coaches Playbook p.77、p.79、p.83'],
    level: 2,
    play: '側翼持球',
    name: '轉移後防守到位',
    coverage: '球轉到你手上，你的防守者及時撲到：最後幾步碎步、雙手舉高；其他人都跟著球移動到位。',
    cueRoles: ['X1'],
    answer: 'reset',
    partial: [],
    pressure: 'loose',
    resetTargets: ['O4'],
    labels: NOADV_LABELS,
    look: WING_LOOK,
    fixedX3: true,
    occludeAfter: 0.4,
    explain: '撲防到位：最後幾步碎步煞車、重心穩、手舉高，其他防守者也跟著球移動。這時硬打沒有優勢，再把球轉走，讓防守繼續移動；但不能拿著球站著等。最佳選擇：再轉移一次。和「轉移後撲防太慢」比一比：看撲防者最後兩步有沒有煞車。',
    mistake: '「既然轉過來了就要打」，對著到位的撲防硬切或硬投。',
    offense: NOADV_OFFENSE,
    defense: Object.assign({}, NOADV_DEFENSE, { X1: NOADV_X1_ONTIME }),
  },
  // H4：和 drive_help／drive_nohelp／drive_nail_help 同開場（onset 前只有 X5 先站到籃框前）
  {
    id: 'noadv_drive_wall',
    evidence: 'medium', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['hooperuniversity.com/breakdowns/understanding-how-to-play-with-the-advantage', 'NBA Coaches Playbook p.81–82（部分支持）', 'ASEP p.115（書建議改傳球）'],
    level: 2,
    play: '持球切入',
    name: '切入撞牆：協防早已站好',
    coverage: '你從右側切入，你的防守者只被甩開半步就追回到你前面；大個子站在籃框前、擋住吊給籃下的路線；外線三個人都留在自己人身邊。',
    cueRoles: ['X5', 'X1'],
    answer: 'reset',
    partial: [],
    pressure: 'medium',
    resetTargets: [],
    labels: DRIVE5_LABELS,
    look: DRIVE_LOOK,
    occludeAfter: 0.5,
    explain: '這次切入沒有逼出任何人離開位置：你的防守者追回到你前面，大個子站在籃框前、擋在你和籃下隊友之間，外線三個人都貼著自己的人。分球路線都有人，硬切會撞人或被抄。收運球前退出來，把球轉到另一側重新組織。最佳選擇：退出來（往下滑）。和「切入 vs 底角協防」「Nail 協防」比一比：看有沒有人離開自己的人。',
    mistake: '硬切撞人、起跳後才在空中找人，或把球塞給有人看住的隊友。',
    offense: { PG: [...PG_DRIVE.slice(0, 3), [0.4, 1.95, 5.2], [0.9, 2.15, 5.55], [1.6, 2.55, 6.4]], O5: DUNKER },
    defense: {
      X1: [...DRIVE_X1.slice(0, 4), [0.35, 1.15, 5.2], [0.7, 1.35, 4.45], [1.0, 1.6, 4.6], [1.6, 2.0, 5.4]], // 從身後追回到你前面
      X5: [[-1.2, -2.2, 1.6], [-0.4, -2.13, 1.63], [0.0, -1.3, 2.05], [0.4, -1.15, 2.1], [1.6, -1.2, 2.0]],   // 站到籃框前，卡在你和籃下大個子的傳球路線上
      X4: [...DRIVE_X4_PRE, [0.45, -4.15, 6.25], [1.6, -4.2, 6.3]],                                           // 回到弱側側翼身邊
      X3: [[-1.2, -5.4, 1.9], [0.0, -5.5, 1.9], [0.5, -6.1, 1.55], [1.6, -6.1, 1.55]],
      X2: DRIVE_X2_HOME,
    },
  },
  // ---------- Level 2：無球隊友閱讀：後門切（scenario_bank_v2 E1） ----------
  {
    id: 'backdoor_overplay',
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['ASEP p.82、p.114、p.140–142', 'NBA Coaches Playbook p.113、p.117', 'WABC Coaches Manual p.17'],
    level: 2,
    play: '弧頂持球',
    name: '側翼被過度阻絕：走後門（Backdoor）',
    coverage: '你在弧頂持球，側翼隊友的防守者一手一腳伸進傳球路線、頭轉向球；隊友往上踩一步後往籃下切。弱側沒有人內縮。',
    cueRoles: ['X2'],
    answer: 'pass:O2',
    partial: [],
    pressure: 'medium',
    labels: { 'pass:O2': '擊地傳給後門切（Backdoor）', 'pass:O5': '傳給弱側低位', 'pass:O3': '傳給弱側底角', 'pass:O4': '傳給弱側側翼', shoot: '自己投', drive: '自己切' },
    look: { role: 'O2', w: 0.65 }, // 視線跟著側翼隊友（後門切時會一路轉向籃框）
    fixedX3: true,
    occludeAfter: 0.4,
    explain: '側翼的防守者過度阻絕（Overplay）：站進傳球路線、頭轉向球，就看不到隊友往籃下切。隊友一往後門切，就在防守者轉頭的瞬間用單手擊地傳給他；弱側沒有人內縮，籃下是空的。最佳選擇：擊地傳給後門切。',
    mistake: '硬傳給被阻絕的人，被抄走；或等隊友切到籃下才傳，太晚。',
    offense: {
      PG: [[-1.2, 0.5, 9.0], [0.4, 0.9, 8.9], [1.5, 1.1, 8.8]],
      O2: BD_O2,
      O5: [[-1.2, -2.8, 2.4], [1.5, -2.8, 2.4]],
    },
    defense: {
      X1: [[-1.2, 0.45, 8.05], [0.4, 0.8, 7.95], [1.5, 1.0, 7.85]],
      X2: BD_X2,
      X5: [[-1.2, -2.1, 1.75], [1.5, -2.1, 1.75]],   // 留在弱側低位身邊，沒有內縮到後門切的路線
      X3: [[-1.2, -5.85, 1.65], [1.5, -5.85, 1.65]],
      X4: [[-1.2, -4.0, 6.4], [1.5, -4.0, 6.4]],
    },
  },
  // ---------- Level 2：擋拆基礎 ----------
  {
    id: 'pnr_drop',
    evidence: 'medium', // 依 docs/citation_check.md 第 3 節
    status: 'draft', // draft → coach_1 → approved（3 位教練一致）
    sources: ['NBA Coaches Playbook p.256', 'FIBA OBRI 2024 26-3（p.51）'],
    level: 2,
    play: '高位擋拆',
    name: '擋拆 vs 沉退（Drop）',
    coverage: '大個子退到罰球線下方護框（Drop），你的防守者被掩護卡在身後追；弱側不動。',
    cueRoles: ['X5'],
    answer: 'shoot',
    partial: [],
    explain: '大個子沉退（Drop），站在你和順下之間，順下傳不過去；你的防守者被掩護卡在身後。FIBA 沒有防守三秒，大個子可以一直站在禁區等你，所以空檔在罰球線附近的中距離。最佳選擇：急停跳投。',
    mistake: '傳給順下：沉退的大個子就站在傳球路線上，球會被攔下。',
    offense: { PG: PG_PATH },
    defense: {
      X1: [[-0.9, 0.0, 8.6], [-0.3, 0.5, 8.75], [0.0, 1.2, 9.1], [0.6, 2.2, 8.3], [1.2, 2.7, 7.5]],
      X5: [[-0.9, 1.2, 7.2], [0.0, 1.1, 6.6], [0.6, 1.2, 5.3], [1.2, 1.2, 4.6]],
      X3: X3_HOME,
    },
  },
  {
    id: 'pnr_high_drop',
    evidence: 'medium', // 依 docs/citation_check.md 第 3 節
    status: 'draft', // draft → coach_1 → approved（3 位教練一致）
    sources: ['thehoopsgeek.com/pick-and-roll-defense［網］', '[沒有書面依據，需教練確認]'],
    level: 2,
    play: '高位擋拆',
    name: '擋拆 vs 沉退太高（High drop）',
    coverage: '大個子守在罰球線上方擋你的跳投，順下從他身後往籃下跑，弱側沒有人補。',
    cueRoles: ['X5', 'X3'],
    answer: 'pass:O5',
    partial: [],
    explain: '大個子站得太高（High drop），擋住了你的跳投，但順下已經從他身後切進去；底角防守者也沒有內縮去卡順下。最佳選擇：傳給順下。和「沉退」那題比一比：關鍵是大個子站多深。',
    mistake: '習慣性急停跳投：大個子就在你面前，投籃會被干擾。',
    offense: { PG: PG_PATH },
    defense: {
      X1: [[-0.9, 0.0, 8.6], [-0.3, 0.5, 8.75], [0.0, 1.2, 9.1], [0.6, 2.2, 8.3], [1.2, 2.7, 7.5]],
      X5: [[-0.9, 1.2, 7.6], [0.0, 1.3, 7.2], [0.6, 1.5, 6.8], [1.2, 1.4, 6.4]],
      X3: X3_HOME,
    },
  },
  {
    id: 'pnr_under',
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft', // draft → coach_1 → approved（3 位教練一致）
    sources: ['NBA Coaches Playbook p.58 圖 4.22、p.60 圖 4.28、p.256–257', 'ASEP p.148'],
    level: 2,
    play: '高位擋拆',
    name: '擋拆 vs 繞下（Under）',
    coverage: '你的防守者從掩護者的下方繞過，大個子守在禁區。',
    cueRoles: ['X1'],
    answer: 'shoot',
    partial: [],
    explain: '你的防守者從掩護下方繞過（Go under），掩護者身後留給你一塊空間；FIBA 三分線比較近，你在線外就能直接投。最佳選擇：在掩護後方急停跳投。',
    mistake: '繼續往禁區衝：防守者剛好在下面等你，讓防守輕鬆歸位。',
    offense: { PG: PG_PATH_HEDGE },
    defense: {
      X1: [[-0.9, 0.0, 8.6], [-0.3, 0.3, 8.1], [0.0, 0.9, 7.4], [0.4, 1.8, 7.4], [0.8, 2.4, 7.9], [1.2, 2.7, 8.2]],
      X5: [[-0.9, 1.2, 7.2], [0.0, 1.1, 6.4], [1.2, 1.0, 5.0]],
      X3: X3_HOME,
    },
  },
  // ---------- Level 3：擋拆進階 ----------
  {
    id: 'pnr_hedge',
    evidence: 'medium', // 依 docs/citation_check.md 第 3 節
    status: 'draft', // draft → coach_1 → approved（3 位教練一致）
    sources: ['ASEP p.146、p.203', 'NBA Coaches Playbook p.85、p.255–256', 'thehoopsgeek.com/pick-and-roll-defense'],
    level: 3,
    play: '高位擋拆',
    name: '擋拆 vs 延誤、弱側沒補（Hedge, no tag）',
    coverage: '大個子跳出來擋在你的運球路線上（Hedge），底角防守者留在原地沒有內縮。',
    cueRoles: ['X5', 'X3'],
    answer: 'pass:O5',
    partial: [],
    explain: '大個子延誤（Hedge）時，順下的人暫時沒人管；底角防守者也沒有內縮去卡順下（No tag）。先多運一步拉出角度，從延誤者身側擊地或高吊給順下。要快：延誤一兩步大個子就會回防。最佳選擇：傳給順下。',
    mistake: '急停跳投：延誤的大個子就擋在你面前不到一公尺，投籃會被封。傳底角也不對：底角防守者根本沒離開。',
    offense: { PG: PG_PATH_HEDGE },
    defense: { X1: HEDGE_X1, X5: HEDGE_X5, X3: X3_HOME },
  },
  // pnr_hedge 的姊妹題（scenario_bank_v2 D4）：onset 前完全相同，之後大個子馬上退回、你的防守者追回
  {
    id: 'pnr_hedge_recovered',
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['NBA Coaches Playbook p.53、p.77、p.79'],
    level: 3,
    play: '高位擋拆',
    name: '延誤成功、兩人都回位（Hedge recovered）',
    coverage: '大個子延誤（Hedge）把你逼離籃框，你的防守者從掩護上方追回；大個子馬上退回順下者前面；弱側都在位置上。',
    cueRoles: ['X5', 'X1'],
    answer: 'reset',
    partial: [],
    pressure: 'loose',
    resetTargets: ['O4'],
    labels: { reset: '拉開、轉移或再擋一次（Reset）', 'pass:O4': '轉移到弱側側翼', 'pass:O5': '傳給順下（Roll）', shoot: '急停跳投', drive: '硬切' },
    occludeAfter: 0.8,
    explain: '延誤成功：大個子把你逼離籃框，你的防守者已經追回到你和籃框之間，大個子也及時退回順下者前面，弱側沒有人落後。用完掩護被兩個人接住，就沒有空檔投籃或切入，你變成傳球者：拉開、把球轉到弱側，或叫大個子再擋一次。最佳選擇：轉移球。和「延誤、弱側沒補」比一比：看大個子回不回得來。',
    mistake: '硬切撞進兩個回位的防守者；急停投出被封的球；硬塞給前面有人的順下。',
    offense: { PG: REC_PG, O5: REC_O5 },
    defense: { X1: REC_X1, X5: REC_X5, X3: X3_HOME },
  },
  {
    id: 'pnr_blitz',
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft', // draft → coach_1 → approved（3 位教練一致）
    sources: ['ASEP p.148、p.126、p.184', 'NBA Coaches Playbook p.59–60 圖 4.25、p.257 圖 16.1、p.80–81'],
    level: 3,
    play: '高位擋拆',
    name: '擋拆 vs 包夾（Blitz／Trap）',
    coverage: '兩個防守者同時包夾你，掩護者停在罰球線附近。',
    cueRoles: ['X5'],
    answer: 'pass:O5',
    partial: [],
    explain: '包夾（Blitz）時有兩個人在你身上，後面就少一個防守者，變成 4 打 3（3v3 教學模式是 2 打 1）。掩護者不順到底，停在罰球線附近當短順下（Short roll）。往外運兩步拉開角度，馬上把球交給他，讓他去打以多打少。最佳選擇：傳給短順下。也有教練主張先傳安全球再重組。',
    mistake: '在包夾裡停球、把球舉高，或硬投硬切，都容易失誤。從兩個人頭上跳傳到對面底角，球在空中太久，輪轉的人會抄截。',
    offense: { PG: PG_PATH_BLITZ, O5: SHORT_ROLL_PATH },
    defense: {
      X1: [[-0.9, 0.0, 8.6], [-0.3, 0.5, 8.8], [0.0, 1.1, 9.4], [0.3, 1.6, 9.7], [0.7, 1.9, 10.1], [1.2, 2.0, 10.5]],
      X5: [[-0.9, 1.3, 7.9], [-0.3, 1.5, 8.3], [0.0, 2.1, 8.6], [0.3, 2.6, 8.7], [0.7, 2.9, 9.2], [1.2, 3.0, 9.6]],
      X3: [[-0.9, -5.4, 1.9], [0.2, -5.2, 2.0], [0.7, -2.8, 3.3], [1.2, -1.4, 4.4]],
    },
  },
  {
    id: 'pnr_tag_commit',
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft', // draft → coach_1 → approved（3 位教練一致）
    sources: ['ASEP p.126、p.134'],
    level: 3,
    play: '高位擋拆',
    name: '弱側內縮（Tag）真補位',
    coverage: '大個子延誤，底角防守者轉身全速衝進禁區卡順下。',
    cueRoles: ['X5', 'X3'],
    answer: 'pass:O3',
    partial: [],
    explain: '底角防守者（Low man）轉身、頭也轉向球，全速衝進禁區去卡順下：這是真的內縮補位（Commit／Tag）。協防從哪裡來，空檔就在哪裡，底角射手沒人。在他離開底角的那一刻就出手，跳傳要高、要快。最佳選擇：跳傳底角。',
    mistake: '照原計畫傳順下：補防者已經卡在路線上。',
    occludeAfter: 0.5,
    offense: { PG: PG_PATH_HEDGE },
    defense: {
      X1: HEDGE_X1,
      X5: HEDGE_X5,
      X3: [[-0.9, -5.4, 1.9], [-0.2, -5.3, 1.95], [0.0, -4.9, 2.1], [0.4, -3.1, 2.7], [0.8, -1.3, 3.3], [1.2, -0.2, 3.5]],
    },
  },
  {
    id: 'pnr_switch',
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft', // draft → coach_1 → approved（3 位教練一致）
    sources: ['ASEP p.147–148、p.200–201', 'NBA Coaches Playbook p.257'],
    level: 3,
    play: '高位擋拆',
    name: '擋拆 vs 換防（Switch）',
    coverage: '大個子換防到你身上，小個子去追順下。',
    cueRoles: ['X5'],
    answer: 'pass:O5',
    partial: ['shoot'],
    explain: '換防（Switch）後，小個子變成在防你的中鋒（錯位 Mismatch）。中鋒順下時用身體把小個子擋在身後（Seal），趁換防還沒站穩就把球送進去。對換過來的大個子急停跳投也可以，但他離你不到一公尺，不是最佳選擇。',
    mistake: '傳底角：底角防守者沒有離開，等於把球傳給被看住的人。',
    offense: { PG: PG_PATH },
    defense: {
      X1: [[-0.9, 0.0, 8.6], [-0.3, 0.5, 8.75], [0.0, 0.6, 8.3], [0.5, 0.3, 6.3], [1.2, -0.4, 3.9]],
      X5: [[-0.9, 1.3, 7.9], [-0.3, 1.4, 8.1], [0.0, 1.8, 8.1], [0.6, 2.4, 6.9], [1.2, 2.7, 5.8]],
      X3: X3_HOME,
    },
  },
  // ---------- Level 3：側翼擋拆 vs 封底線（scenario_bank_v2 D1） ----------
  {
    id: 'pnr_ice_pop',
    evidence: 'medium', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['NBA Coaches Playbook p.258 圖 16.4、16.6–16.7', 'thehoopsgeek.com/basketball-plays/pick-roll-against-ice-defense', '[外彈跳投為推論]'],
    level: 3,
    play: '側翼擋拆',
    name: '側翼擋拆 vs 封底線（Ice）：掩護者外彈',
    coverage: '大個子到側翼替你掩護；你的防守者跳到掩護那一側、把你往底線逼，大個子的防守者站在下方擋住底線。掩護者外彈到罰球區角，沒人跟。',
    cueRoles: ['X1', 'X5'],
    answer: 'pass:O5',
    partial: [],
    pressure: 'medium',
    labels: { 'pass:O5': '傳給外彈的掩護者（Pop）', shoot: '急停跳投', drive: '硬切底線', 'pass:O2': '傳給強側底角', 'pass:O4': '跳傳弱側側翼', 'pass:O3': '跳傳弱側底角' },
    look: { role: 'O5', w: 0.55 }, // 視線在籃框與外彈的掩護者之間：看得到下方擋底線的大個子
    fixedX3: true,
    occludeAfter: 0.5,
    explain: '封底線（Ice／Down）：你的防守者站在掩護那一側不讓你用掩護，大個子的防守者在下方兩三步擋住底線。兩個人都在對付你，掩護者往外彈就沒人管。不要硬繞掩護或硬切底線，快速把球交給外彈的掩護者跳投。最佳選擇：傳給外彈的掩護者。',
    mistake: '硬往中路繞掩護，撞上你的防守者；或往底線硬切，撞上大個子的防守者。',
    offense: { PG: ICE_PG, O5: ICE_O5, O2: RIGHT_CORNER },
    defense: {
      X1: ICE_X1,
      X5: ICE_X5,
      X2: [[-1.2, 6.2, 1.9], [1.5, 6.2, 1.9]],
      X3: [[-1.2, -5.0, 2.0], [1.5, -5.1, 2.0]],
    },
  },
  // ---------- Level 4：假動作辨識 ----------
  {
    id: 'pnr_tag_stunt',
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft', // draft → coach_1 → approved（3 位教練一致）
    sources: ['ASEP p.126、p.132'],
    level: 4,
    play: '高位擋拆',
    name: '弱側假撲（Stunt）',
    coverage: '大個子延誤，底角防守者往禁區衝一兩步就煞車，又退回底角。',
    cueRoles: ['X5', 'X3'],
    answer: 'pass:O5',
    partial: [],
    explain: '底角防守者只是假撲（Stunt）：衝一兩步就煞車，身體一直面向你，然後退回底角。假撲是要讓你猶豫，替大個子爭取回防時間，他根本沒去卡順下。不要停，趁大個子還沒回來直接傳順下。最佳選擇：傳給順下。',
    mistake: '被假動作騙去跳傳底角：防守者已經退回來，球在空中時他就到了。',
    occludeAfter: 0.5,
    stunt: true,
    offense: { PG: PG_PATH_HEDGE },
    defense: {
      X1: HEDGE_X1,
      X5: HEDGE_X5,
      X3: [[-0.9, -5.4, 1.9], [-0.2, -5.3, 1.95], [0.0, -4.9, 2.1], [0.2, -4.4, 2.3], [0.4, -4.3, 2.3], [0.7, -5.3, 1.9], [1.2, -5.7, 1.7]],
    },
  },
];

// 回合：多個決策點串起來（答對才進下一步）。steps 內的題目若只在回合裡用，設 chainOnly: true。
// 內容等 docs/scenario_bank_v2.md 的有依據清單再加入。
export const POSSESSIONS = [];

// 5v5 基本站位（掩護在右側）：O2 強側底角、O4 弱側側翼（三分線外）；X2 稍微內縮、X4 站在籃框到籃框的中線（split line）協防位置
export const DEFAULT_OFFENSE = {
  PG: PG_PATH, O5: ROLL_PATH, O3: CORNER_SPOT,
  O2: [[-1.2, 6.95, 1.2], [1.2, 6.95, 1.2]],
  O4: [[-1.2, -5.0, 6.9], [1.2, -5.1, 6.8]],
};
export const DEFAULT_DEFENSE = {
  X2: [[-1.2, 5.9, 1.9], [1.2, 5.8, 2.0]],
  X4: [[-1.2, -3.4, 5.6], [0.4, -3.1, 5.3], [1.2, -3.3, 5.5]],
};
