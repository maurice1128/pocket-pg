// 情境題庫：擋拆閱讀 + 新手的切入分球
// 座標：x = 橫向（右側邊線 +7.5），z = 距離底線（籃框中心 z = 1.575），單位公尺，FIBA 半場。
// 擋拆情境以「掩護在控衛右側、控衛往右繞掩護」撰寫；執行時隨機鏡像到左側。
// 每個角色的動作 = 一串關鍵影格 [t(秒), x, z]，t 以「關鍵防守反應起點 onset」為 0 往前後計。
// answer: 正確動作（2 分）；partial: 可接受（1 分）；其餘 0 分（計分沿用 Pagé et al., 2019）。
// 動作代碼：'shoot'（自己出手）、'drive'（自己運球攻擊：切過撲防、從中間切穿、單打錯位）、
//   'reset'（不攻擊：轉移、回傳、反向運球、退出來重新組織）、'pass:<O2|O3|O4|O5>'（為了攻擊而傳給那位隊友）。
//   reset 和 pass 分開算，才能統計「沒優勢硬打率」與「優勢浪費率」（docs/scenario_bank_v2.md 0.3、3.2 節）。
// resetTargets：答案是 'reset'（不攻擊）時，傳給陣列裡的外圍安全接應者算正確（例 ['O4']）。
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
// 掩護要真的擋到人（使用者：「高位擋拆沒有擋成功」；ASEP p.85、p.86、p.146）：
// 掩護者先在 X1 身側站定（雙腳急停、不移動），控衛等掩護站好才運球，肩擦肩繞過；
// X1 想從上方跟過去，被掩護者身體卡住（中心距約 0.58 m＝身體接觸），控衛過了掩護才順下。
// 所有擋拆題 onset 前共用同一段：控衛 PG_PRE、掩護者 SCREEN_SET、X1 X1_HIT（繞下例外，見 UNDER_X1）
const SCREEN_SET = [[-0.9, 0.6, 8.8], [-0.1, 0.6, 8.8]];            // 掩護者站定到 onset 前 0.1 秒
const PG_PRE = [[-0.9, -0.2, 9.4], [-0.55, 0.3, 9.5], [-0.25, 0.95, 9.4]]; // 離掩護者約 0.64 m 擦過
const X1_HIT = [[-0.9, 0.0, 8.7], [-0.55, 0.05, 9.0], [-0.25, 0.1, 9.25], [0.0, 0.6, 9.6]]; // 撞上掩護、等你過去才從上方追
// 正面下切（Drop、Switch、High drop 用）：貼著掩護者肩膀繞過
const PG_PATH = [...PG_PRE, [0.0, 1.6, 8.9], [0.6, 2.6, 7.6], [1.2, 3.0, 6.7]];
// 被延誤逼平、後撤運球（Hedge、Commit、Stunt 用；Under 改用 UNDER_PG）
const PG_PATH_HEDGE = [...PG_PRE, [0.0, 1.6, 9.0], [0.4, 2.3, 8.9], [0.8, 2.7, 9.2], [1.2, 2.9, 9.3]];
// 被包夾、往外運兩步（NBA Coaches Playbook p.59–60）
const PG_PATH_BLITZ = [...PG_PRE, [0.0, 1.6, 9.0], [0.3, 2.1, 9.1], [0.7, 2.4, 9.6], [1.2, 2.5, 10.1]];
const ROLL_PATH = [...SCREEN_SET, [0.3, 0.55, 7.0], [1.2, 0.3, 3.0]];
// 短順下停在罰球線上方約 0.5 m（ASEP p.148）
const SHORT_ROLL_PATH = [...SCREEN_SET, [0.4, 0.9, 6.9], [0.8, 0.8, 6.4], [1.2, 0.8, 6.3]];
// 底角射手站在 FIBA 三分線（底角 6.6 m）外
const CORNER_SPOT = [[-0.9, -6.95, 1.2], [1.2, -6.95, 1.2]];

// 延誤用的 X1／X5（Hedge、Commit、Stunt 共用）
const HEDGE_X1 = [...X1_HIT, [0.5, 1.7, 9.6], [1.0, 2.2, 9.4], [1.2, 2.4, 9.1]];
const HEDGE_X5 = [[-0.9, 1.3, 7.9], [-0.3, 1.4, 8.1], [0.0, 2.0, 8.3], [0.3, 2.6, 8.4], [0.8, 2.8, 8.5], [1.0, 2.5, 8.0], [1.2, 2.0, 7.3]];
const X3_HOME = [[-0.9, -5.4, 1.9], [1.2, -5.6, 1.8]];

// 繞下（Under）專用（2026-10-24，movement_and_options_check #20）：過掩護後馬上在掩護後方收步急停
// （NBA Coaches Playbook p.58 圖 4.22、p.60 圖 4.28；ASEP p.148）。離籃 7.4–7.5 m，FIBA 三分線外。
const UNDER_PG = [...PG_PRE, [0.0, 1.6, 9.0], [0.4, 2.1, 8.75], [0.8, 2.3, 8.65], [1.2, 2.35, 8.6]];
// X1 從掩護者和沉退大個子之間繞到下方，再追上來：0.4 秒時離你 1.3 m，1.2 秒到 0.8 m（窗口關閉）。路線與時機是推論
const UNDER_X1 = [[-0.9, 0.0, 8.6], [-0.5, 0.25, 7.95], [-0.2, 0.85, 7.55], [0.1, 1.5, 7.45], [0.45, 1.9, 7.5], [0.8, 2.15, 7.65], [1.2, 2.3, 7.8]];
// 掩護者等 X1 從下方繞過、你過了掩護才順下（舊版共用 ROLL_PATH，在 t≈0 和繞下的 X1 撞在一起）。推論
const UNDER_O5 = [[-0.9, 0.6, 8.8], [0.1, 0.6, 8.8], [0.5, 0.45, 6.9], [0.9, 0.1, 5.3], [1.4, -0.1, 3.6]];

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
// 2026-10-24 依 NBA Coaches Playbook p.167 圖 10.1 修正（docs/movement_and_options_check.md #1、#2）：
// 你推進到左罰球區角上方停下、保持運球；O2 跑寬（ASEP p.137），onset 後從側翼斜切籃下。只有這兩題用。
const FB_PG = [[-1.2, -1.6, 12.6], [-0.6, -2.0, 10.4], [0.0, -2.3, 8.2], [0.6, -2.45, 6.9], [1.2, -2.45, 6.6]]; // 3.7 → 0.5 m/s 收步停下
const FB_O2 = [[-1.2, 4.6, 12.4], [-0.6, 4.8, 10.2], [0.0, 4.7, 8.0], [0.6, 3.3, 6.0], [1.2, 2.2, 4.3]];        // 約 4 m/s；onset 時兩人相距 7 m
// X1：onset 前兩題完全相同（從罰球線往上迎、onset 時站在兩人中間），之後才選邊
const FB2_X1_PRE = [[-1.2, 0.3, 5.0], [-0.3, 0.0, 5.6], [0.0, 0.0, 5.6]];
const FB2_X1_COMMIT = [...FB2_X1_PRE, [0.5, -1.3, 5.95], [1.2, -1.9, 5.7]]; // 踏出去守你：1.0 秒後站在你和籃框的連線上（偏離 ≤ 0.25 m）、離你 1.05–1.2 m
const FB2_X1_STAY = [...FB2_X1_PRE, [0.5, 0.6, 4.6], [1.2, 1.3, 3.9]];        // 往後退、倒向 O2，守在他和籃框之間（離他 1.0 m）
const FB_TRAIL = (x, z) => [[-1.2, x, z], [1.2, x * 0.9, z - 3.5]];
const FB_OFFENSE = { PG: FB_PG, O2: FB_O2, O3: FB_TRAIL(-4.0, 18.5), O4: FB_TRAIL(-1.5, 20.0), O5: FB_TRAIL(1.5, 19.5) };
const FB_DEFENSE = { X2: FB_TRAIL(2.5, 17.5), X3: FB_TRAIL(-3.0, 17.0), X4: FB_TRAIL(-1.0, 18.5), X5: FB_TRAIL(1.0, 18.0) };
const FB_LABELS = { 'pass:O2': '傳給斜切的隊友', shoot: '自己出手（急停投）', drive: '運球攻籃（上籃）' };

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
  // 二傳距離：站到籃框到籃框的中線（split line）、在禁區裡，同時看得到球和 O3（WABC p.30；ASEP p.157 ball-you-man）。
  // 2026-10-24 從 (−3.3, 2.6) 移過來：舊位置離中線 3.3 m，低位被高側繞前時背後沒人補（movement_and_options_check #13）
  X3: [[-1.2, -0.9, 2.4], [1.5, -0.9, 2.4]],
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
// 在你中路側掩護 → 外彈。2026-10-24 改方向（movement_and_options_check #26）：你被逼往底線（往下），掩護者就往你的反方向、
// 往中路橫拉到罰球區角上方（比你高 1.0 m、離籃 6.2 m，三分線內的中距離），不再往下彈到肘區（NBA Coaches Playbook p.54 的原則；落點是推論）。
// 再往上（z > 8）會讓外彈者和下方的 X5 在你眼前相隔 100° 以上，橫拿手機（95°）也看不到兩人。
const ICE_O5 = [[-1.2, 3.4, 7.6], [-0.6, 4.05, 7.95], [0.0, 4.05, 7.95], [0.35, 3.45, 7.65], [0.65, 2.85, 7.2], [1.5, 2.7, 7.1]];
// 跳到掩護那一側、把你往底線逼；onset 後站在你的正上方（高側），傳給外彈的球從他身側約 0.7 m 經過（推論）
const ICE_X1 = [[-1.2, 4.75, 8.0], [-0.6, 4.6, 7.52], [0.0, 4.75, 7.25], [0.4, 5.0, 7.0], [0.8, 5.15, 6.95], [1.5, 5.2, 6.95]];
const ICE_X5 = [[-1.2, 3.4, 6.2], [-0.6, 3.8, 6.1], [0.0, 4.35, 5.3], [0.4, 4.55, 4.95], [1.5, 4.6, 4.9]];                        // 站在掩護者下方、擋住底線（Down）

// ---------- 延誤後兩人回位（D4）：onset 前和 pnr_hedge 完全相同 ----------
const REC_PG = [...PG_PATH_HEDGE.slice(0, 4), [0.4, 2.2, 9.3], [0.8, 2.6, 9.8], [1.2, 2.8, 10.1], [2.0, 2.8, 10.2]];               // 被延誤逼離籃框
const REC_X1 = [...HEDGE_X1.slice(0, 4), [0.35, 1.5, 8.6], [0.7, 2.1, 8.65], [1.1, 2.45, 9.0], [2.0, 2.5, 9.15]];                  // 從掩護上方追回，站到你和籃框之間
const REC_X5 = [...HEDGE_X5.slice(0, 3), [0.12, 2.2, 8.35], [0.5, 1.75, 7.1], [0.95, 1.05, 5.45], [1.4, 0.8, 4.9], [2.0, 0.75, 4.8]]; // 短延誤後馬上退回順下者前面
const REC_O5 = [...ROLL_PATH.slice(0, 2), [0.5, 0.7, 6.55], [1.0, 0.55, 5.95], [1.4, 0.4, 5.65], [2.0, 0.35, 5.55]]; // 順下被大個子擋住、推不深

// ---------- 後門切（E1） ----------
// 往上踩一步 → 後門切：2026-10-24 改成從踩步點直線切向籃框（ASEP p.140：路線要直、不要弧線；movement_and_options_check #17）。3.6–5.3 m/s
const BD_O2 = [[-1.2, 5.3, 6.6], [-0.4, 5.5, 7.6], [0.0, 5.45, 7.75], [0.35, 4.6, 6.8], [0.75, 3.2, 5.2], [1.15, 1.8, 3.6], [1.45, 0.9, 2.6]];
// 站在傳球路線上、頭轉向球，反應慢半拍。2026-10-24：直線後門切從他背後 0.7 m 經過，onset 前後三格往傳球路線上方再移 0.05–0.1 m
const BD_X2 = [[-1.2, 4.55, 6.85], [-0.4, 4.7, 7.9], [0.0, 4.6, 8.1], [0.3, 4.6, 8.05], [0.65, 4.35, 7.05], [1.0, 3.6, 5.65], [1.5, 2.7, 4.3]];

// ---------- 看腳步選方向（2026-10-27；docs/tactics_audit.md 13.7，D-43） ----------
// 隊友拉開（Clear-out）：兩個底角、兩個側翼都站在三分線外，其他防守者貼著自己的人，禁區沒有人提早協防。
// 距離、偏移、速度都是假設（鐵則 10）。
const DIR_OFFENSE = {
  O2: RIGHT_CORNER, O3: CORNER_SPOT,
  O4: [[-1.2, -5.0, 6.9], [1.5, -5.0, 6.9]],
  O5: [[-1.2, 5.0, 6.9], [1.5, 5.0, 6.9]],
};
const DIR_DEFENSE = {
  X2: [[-1.2, 6.2, 1.9], [1.5, 6.2, 1.9]],
  X3: [[-1.2, -6.2, 1.9], [1.5, -6.2, 1.9]],
  X4: [[-1.2, -4.4, 6.3], [1.5, -4.4, 6.3]],
  X5: [[-1.2, 4.4, 6.3], [1.5, 4.4, 6.3]],
};
// 視線正對籃框（w = 0），不偏向弱側：左右要和「往左／右切」一致，防守者在畫面正中間
const DIR_LOOK = { role: 'X1', w: 0 };
const DIR_LABELS = { drive_left: '往左切', drive_right: '往右切', shoot: '自己投', 'pass:O2': '傳給右邊底角', 'pass:O3': '傳給左邊底角', 'pass:O4': '傳給左邊側翼', 'pass:O5': '傳給右邊側翼' };
// 題 1：你在弧頂右手運球往右走，onset 時防守者跳到你右手那側封住（身體中心偏到你右邊約 0.5 m）
const DIR_OP_PG = [[-1.2, -0.8, 8.9], [-0.5, -0.1, 8.85], [0.0, 0.45, 8.8], [0.4, 0.7, 8.8], [1.5, 0.75, 8.8]];
const DIR_OP_X1 = [[-1.2, -0.8, 7.8], [-0.5, -0.1, 7.8], [0.0, 0.45, 7.8], [0.3, 0.95, 7.85], [1.5, 1.0, 7.85]];
// 題 2：你在弧頂接球（三重威脅），防守者上前、0 秒時站定，胸口正對你、離你 1.05 m
const DIR_SQ_PG = [[-1.2, 0.0, 8.9], [1.5, 0.0, 8.9]];
const DIR_SQ_X1 = [[-1.2, 0.0, 6.5], [-0.7, 0.0, 6.75], [-0.3, 0.0, 7.5], [0.0, 0.0, 7.82], [0.25, 0.0, 7.85], [1.5, 0.0, 7.85]];

// ---------- 手遞手（DHO，2026-10-25；docs/tactics_audit.md 第 12 節） ----------
// E3／E4／E6 三姊妹：你從右側翼往上跑，接大個子從弧頂運過來的手遞手；交球後大個子用身體擋你的防守者。
// onset（防守做選擇）前完全相同，之後只有 X1／X5 不同。交球在 t = −0.25（球的時間表 'hand'）。
// 讀法依擋拆：NBA Coaches Playbook p.58–59 圖 4.21–4.22、p.85–86（中路擋拆跳出）；手遞手後的選項 p.219–220；Basketball for Coaches［網］。
// 引用已過獨立查核：docs/citation_check.md 第 7 節。
// 走位、速度、交球位置都是假設（鐵則 10）。
const DHO_PG = [[-1.6, 5.6, 6.6], [-1.0, 5.0, 7.9], [-0.55, 4.2, 8.6], [-0.25, 3.6, 8.75], [0.0, 3.0, 8.85], [0.3, 2.55, 8.9], [0.6, 2.3, 8.9]]; // 2.0–2.4 m/s
const DHO_O5_PRE = [[-1.6, 1.2, 8.8], [-0.25, 3.5, 8.1]];                          // 運球 1.8 m/s 迎向你，交球時兩人相距 0.65 m
const DHO_X1_PRE = [[-1.6, 5.5, 5.75], [-1.0, 5.45, 7.0], [-0.55, 4.9, 8.1], [-0.25, 4.35, 8.5]]; // 從你下方（底線側）跟著你往上跑，一直在你身後
const DHO_X5_PRE = [[-1.6, 1.1, 7.9], [-0.25, 2.85, 7.35]];                          // 守在大個子的籃框側
// 從上方追（trail）：被大個子的身體卡住，在你身後 0.9 m 追（NBA-CP p.58–59 圖 4.21）
const DHO_X1_TRAIL = [...DHO_X1_PRE, [0.0, 3.95, 8.75], [0.3, 3.45, 8.95], [0.7, 3.15, 9.15], [1.2, 3.2, 8.6]];
// 從大個子下方（籃框側）繞過去：0.45 秒時在你前方 1.3 m，1.2 秒逼近到 0.8 m（比照 pnr_under 的 UNDER_X1）
const DHO_X1_UNDER = [...DHO_X1_PRE, [0.0, 4.05, 7.75], [0.25, 3.4, 7.45], [0.45, 2.75, 7.6], [0.8, 2.5, 7.85], [1.2, 2.45, 8.1]];
// 交球後順下：trail 題大個子先擋一下再順下（往你切入的反方向，NBA-CP p.58–59）；hedge 題交完就溜（p.85–86）
const DHO_O5_ROLL = [...DHO_O5_PRE, [0.2, 3.5, 8.2], [0.6, 3.6, 6.8], [1.2, 3.0, 4.8], [1.6, 2.3, 3.4]];
const DHO_O5_HOLD = [...DHO_O5_PRE, [0.45, 3.5, 8.2], [0.8, 3.2, 6.9], [1.3, 2.4, 5.1]];  // 繞下題：等 X1 從下方繞過才順下
const DHO_O5_SLIP = [...DHO_O5_PRE, [0.0, 3.5, 8.15], [0.5, 3.1, 6.6], [1.1, 2.1, 4.4], [1.4, 1.5, 3.4]];
// 沒有跳出來：貼著大個子、跟著他往強側順下，不站在你往籃框的路上（站在路上就是沉退，見 pnr_drop）
const DHO_X5_BACK = [...DHO_X5_PRE, [0.0, 3.2, 7.3], [0.6, 3.75, 6.1], [1.2, 3.25, 4.1], [1.6, 2.5, 2.75]];
// 跳出來擋在你面前（hedge／show），約 0.6 秒後才退回（NBA-CP p.85；退回時機是假設）
const DHO_X5_HEDGE = [...DHO_X5_PRE, [0.0, 2.6, 8.2], [0.3, 1.75, 8.55], [0.9, 1.7, 8.5], [1.4, 1.9, 7.0]];
const DHO_LOOK = { role: 'O5', w: 0.3 };   // 視線偏向交球的大個子：看得到他、繞下的 X1、跳出來的 X5（w 再大，貼近的大個子會佔掉半個畫面）
const DHO_LABELS = { drive: '拿球轉角切入（Turn the corner）', shoot: '拿球就投（在掩護者身後）', 'pass:O5': '傳給交球後順下的大個子', 'pass:O2': '傳給強側底角', 'pass:O3': '跳傳弱側底角', 'pass:O4': '傳給弱側側翼' };

// E5：你運向右翼要手遞手，側翼的防守者站到隊友上方擋住手遞路線（top-lock）→ 隊友往上踩一步後走後門（NBA-CP p.131、p.116–117）
const TL_PG = [[-1.4, 0.3, 9.3], [-0.7, 1.6, 8.95], [0.0, 3.0, 8.4], [0.3, 3.3, 8.25], [0.8, 3.45, 8.2]];  // 從弧頂斜運向右翼，1.9–2.1 m/s
// 隊友從翼往上迎接手遞，onset 後從踩步點直線後門切（2.6–4.7 m/s）
const TL_O2 = [[-1.4, 5.6, 5.6], [-0.3, 4.85, 7.1], [0.0, 4.7, 7.3], [0.35, 4.1, 6.6], [0.75, 3.05, 5.2], [1.15, 1.9, 3.7], [1.45, 1.05, 2.75]];
const TL_X2 = [[-1.4, 5.0, 5.9], [-0.3, 4.3, 7.6], [0.0, 4.15, 7.85], [0.4, 4.05, 7.6], [0.8, 3.55, 6.4], [1.3, 2.6, 4.6]]; // 站在你和隊友之間（隊友上方），反應慢半拍
const TL_X1 = [[-1.4, 0.25, 8.45], [-0.7, 1.4, 8.15], [0.0, 2.6, 7.75], [0.3, 2.85, 7.65], [1.4, 3.0, 7.6]];       // 守在你和籃框之間
const TL_LABELS = { 'pass:O2': '擊地傳給後門切（Backdoor）', drive: '假手遞、自己切', shoot: '自己投', 'pass:O5': '傳給弱側低位', 'pass:O3': '傳給弱側底角', 'pass:O4': '傳給弱側側翼' };

export const SCENARIOS = [
  // ---------- Level 1：2 打 1 快攻（tactics_audit.md 第 5 節 N1、N2） ----------
  {
    id: 'fb_2v1_commit',
    cue: '防守者撲向你', // 結果卡一行重點：看什麼
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['NBA Coaches Playbook p.166–167（圖 10.1 站位）', 'ASEP p.137（跑寬）', 'WABC Coaches Manual p.21（Driving Lane）'],
    level: 1,
    play: '快攻',
    name: '2 打 1：防守者撲向你',
    coverage: '快攻 2 打 1，你推進到罰球區角附近停下、保持運球，隊友跑寬後往籃下斜切。唯一的防守者踏出來擋在你和籃框之間，離開了你的隊友。',
    cueRoles: ['X1'],
    answer: 'pass:O2',
    partial: [],
    labels: FB_LABELS,
    look: { role: 'O2', w: 0.5 },
    fixedX3: true,
    explain: '你停在罰球區角、隊友拉開距離往籃下斜切，唯一的防守者只能選一個人守。他踏出來擋在你前面，就沒人管你的隊友了。等他確定選邊再傳，隊友就是空檔上籃。最佳選擇：傳給隊友。',
    mistake: '防守者還沒選邊就太早傳，讓他一個人守兩個人；或硬切進擋在你前面的防守者身上。',
    offense: FB_OFFENSE,
    defense: Object.assign({}, FB_DEFENSE, { X1: FB2_X1_COMMIT }),
  },
  {
    id: 'fb_2v1_stay',
    cue: '防守者退守隊友', // 結果卡一行重點：看什麼
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['NBA Coaches Playbook p.166–167（圖 10.1 站位）', 'ASEP p.137（跑寬）', 'WABC Coaches Manual p.27'],
    level: 1,
    play: '快攻',
    name: '2 打 1：防守者退守隊友',
    coverage: '快攻 2 打 1，你推進到罰球區角附近停下、保持運球，隊友往籃下斜切。防守者往後退、倒向你的隊友，守在他和籃框之間的傳球路線附近。',
    cueRoles: ['X1'],
    answer: 'shoot',
    partial: [],
    alsoBest: ['drive'],
    labels: FB_LABELS,
    look: { role: 'O2', w: 0.5 },
    fixedX3: true,
    explain: '防守者往後退、倒向你的隊友，等於把你前面的空間讓出來。你可以在罰球區角直接出手，也可以繼續運到籃下、在沒人干擾的位置上籃，兩個都對；他如果出來擋你，再分給隊友。最佳選擇：自己攻（投或切都可以）。',
    mistake: '硬把球傳給被看住的隊友：防守者就在他和籃框之間、靠近傳球路線，球會被抄。',
    offense: FB_OFFENSE,
    defense: Object.assign({}, FB_DEFENSE, { X1: FB2_X1_STAY }),
  },
  // ---------- 快攻：3 打 2 與人數到齊（scenario_bank_v2 A1、A2、A6） ----------
  // A1／A2 是姊妹題：開場完全相同，只有上方防守者 X1 的動作不同
  {
    id: 'fb_3v2_top_stop',
    cue: '上方防守者擋你', // 結果卡一行重點：看什麼
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
    cue: '上方防守者後退', // 結果卡一行重點：看什麼
    evidence: 'weak', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['NBA Coaches Playbook p.166–167', 'WABC Coaches Manual p.21、p.27', '[由 2 打 1 原則推論，需教練確認]'],
    level: 1,
    play: '快攻',
    name: '3 打 2：上方防守者後退',
    coverage: '3 打 2 快攻，上面的防守者不上來擋你，往後退到罰球線下、張開雙手守兩翼。',
    pose: { X1: [[0, 'spread']] }, // 退守時張開雙手（假設，書上沒寫手）
    cueRoles: ['X1'],
    answer: 'shoot',
    partial: ['drive'],
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
    cue: '防守人數到齊', // 結果卡一行重點：看什麼
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
    resetTargets: ['O2', 'O3', 'O4', 'O5'],
    labels: { reset: '回傳給跟上的隊友（Pull out）', shoot: '一個人硬攻', drive: '一個人硬切' },
    fixedX3: true,
    occludeAfter: 0.5,
    explain: '快攻只在有人數優勢時打。現在前面有三個防守者站好，只有你一個人到位：沒有優勢，就不要一個人衝進三個人裡。停下來、把球拉回，等隊友跟上再進入早期進攻。最佳選擇：不要硬攻，把球回傳給後面跟上的隊友，等大家到位再進攻（往後面的隊友滑）。要快，但不要急。',
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
    cue: '底角防守者來協防', // 結果卡一行重點：看什麼
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
    cue: '沒有人協防', // 結果卡一行重點：看什麼
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
    alsoBest: ['drive'],
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
    cue: '強側底角防守者協防', // 結果卡一行重點：看什麼
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
    cue: '中路（Nail）協防', // 結果卡一行重點：看什麼
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
    cue: '撲防來不及', // 結果卡一行重點：看什麼
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['ASEP p.133', 'NBA Coaches Playbook p.21', 'WABC Coaches Manual p.19'],
    level: 2,
    play: '接球對撲防',
    name: '撲防太慢（Late closeout）',
    coverage: '切入分球後球回到你手上，你的防守者從禁區慢慢撲出來，接球時還在兩公尺外、手放低。',
    pose: { X1: [[-0.5, 'closeout_low']] }, // 慢慢出來、手放低（tactics_audit 13.6）
    cueRoles: ['X1', 'X4'],
    answer: 'shoot',
    partial: ['drive'],
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
    cue: '撲防衝過頭', // 結果卡一行重點：看什麼
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['NBA Coaches Playbook p.165、p.234', 'ASEP p.133', 'WABC Coaches Manual p.19'],
    level: 2,
    play: '接球對撲防',
    name: '撲防過頭（Fly-by closeout）',
    coverage: '球回到你手上，你的防守者從禁區全速衝刺撲過來，最後沒有碎步、身體往前衝、伸單手封投。',
    pose: { X1: [[-0.2, 'flyby']] }, // 不煞車、往前撲、伸單手（WABC p.19；NBA-CP p.234）
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
    cue: '撲防到位、下一個人空', // 結果卡一行重點：看什麼
    evidence: 'medium', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['ASEP p.133', 'NBA Coaches Playbook p.68、p.79、p.87', 'hooperuniversity.com/breakdowns/understanding-how-to-play-with-the-advantage'],
    level: 3,
    play: '接球對撲防',
    name: '撲防到位＋下一個人空（Extra pass）',
    coverage: '球回到你手上，你的防守者及時撲到；弧頂隊友的防守者剛才去補禁區，還在罰球線附近面向禁區。',
    pose: { X1: [[-0.9, 'closeout_high']] }, // 及時撲到：碎步、雙手舉高（WABC p.19；NBA-CP p.234）
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
    cue: '五個人都站好', // 結果卡一行重點：看什麼
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['NBA Coaches Playbook p.77、p.79', 'ASEP p.157', 'WABC Coaches Manual p.30'],
    level: 1,
    play: '側翼持球',
    name: '側翼：五個防守者都站好',
    coverage: '你在右側翼接球，你的防守者早早到位、壓低姿勢；底角被阻絕、低位被繞前，弱側底角的防守者站在籃框到籃框的中線（split line）協防。沒有人失位。',
    cueRoles: ['X1'],
    answer: 'reset',
    partial: [],
    pressure: 'loose',
    resetTargets: ['O4'],
    labels: NOADV_LABELS,
    look: WING_LOOK,
    fixedX3: true,
    occludeAfter: 0.4,
    explain: '五個防守者都在正確位置：你的防守者在一臂距離，底角被阻絕，低位被 3/4 繞前，弱側的人站在中線（split line）、同時看球和自己的人（ball-you-man），吊給低位也有人補。沒有優勢就不要硬打：把球回傳弧頂、轉到另一側，讓防守再移動一次，空檔通常在轉移之後出現。最佳選擇：轉移球（往外圍的隊友滑）。',
    mistake: '對著到位的防守者硬切，或急停投出被干擾的球；運球太多，讓隊友站著看。',
    offense: NOADV_OFFENSE,
    defense: Object.assign({}, NOADV_DEFENSE, { X1: NOADV_X1_SET }),
  },
  {
    id: 'noadv_swing_late_closeout',
    cue: '轉移後撲防太慢', // 結果卡一行重點：看什麼
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['ASEP p.133（偏向投）', 'NBA Coaches Playbook p.21、p.79、p.85（偏向切）、p.229', 'WABC Coaches Manual p.19', 'WABC Coaches Manual p.30、ASEP p.157（弱側站位）'],
    level: 2,
    play: '側翼持球',
    name: '轉移後撲防太慢',
    coverage: '球從另一側經弧頂轉到你手上；你的防守者原本在協防，你接球時他才從禁區邊衝出來、還在兩公尺多外，最後幾步才煞車。其他人都站在位置上。',
    pose: { X1: [[-0.3, 'closeout_high']] }, // 撲得晚，但最後幾步還是碎步、舉手（WABC p.19）
    cueRoles: ['X1'],
    answer: 'shoot',
    partial: [],
    alsoBest: ['drive'],
    pressure: 'tight',
    labels: NOADV_LABELS,
    look: WING_LOOK,
    fixedX3: true,
    occludeAfter: 0.3,
    explain: '轉移球的目的就是逼防守輪轉：你接球時，你的防守者剛從協防位置衝出來、還在兩公尺多外。他晚到了，優勢在你身上，投和切都對：趁他還沒到、手還沒舉起來，接球就投（ASEP p.133 偏向這個）；或趁他還在往前衝，接球馬上攻過去（NBA Coaches Playbook p.85：轉到你手上就要攻，不能拿著球）。最佳選擇：接球就投或馬上切，兩個都是 2 分。',
    mistake: '接球後拿著球看、或再轉一次，等他站好，把轉移創造出來的優勢送回去。',
    offense: NOADV_OFFENSE,
    defense: Object.assign({}, NOADV_DEFENSE, { X1: NOADV_X1_LATE }),
  },
  {
    id: 'noadv_swing_again',
    cue: '轉移後防守到位', // 結果卡一行重點：看什麼
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['NBA Coaches Playbook p.77、p.79、p.83', 'WABC Coaches Manual p.30、ASEP p.157（弱側站位）'],
    level: 2,
    play: '側翼持球',
    name: '轉移後防守到位',
    coverage: '球轉到你手上，你的防守者及時撲到：你接球時他已經在一公尺多內，最後幾步碎步、雙手舉高；其他人都已經站到位置上，弱側的人站在中線（split line）。',
    pose: { X1: [[-0.6, 'closeout_high']] }, // 碎步、雙手舉高（WABC p.19；NBA-CP p.234）
    cueRoles: ['X1'],
    answer: 'reset',
    partial: [],
    pressure: 'loose',
    resetTargets: ['O4'],
    labels: NOADV_LABELS,
    look: WING_LOOK,
    fixedX3: true,
    occludeAfter: 0.4,
    explain: '撲防到位：你接球時他已經到了一臂附近，最後幾步碎步煞車、重心穩、手舉高，其他防守者也都站好。這時硬打沒有優勢，再把球轉走，讓防守繼續移動；但不能拿著球站著等。最佳選擇：再轉移一次。和「轉移後撲防太慢」比一比：看你接球的那一刻他離你多遠，是已經到了，還是還在兩公尺外衝過來。',
    mistake: '「既然轉過來了就要打」，對著到位的撲防硬切或硬投。',
    offense: NOADV_OFFENSE,
    defense: Object.assign({}, NOADV_DEFENSE, { X1: NOADV_X1_ONTIME }),
  },
  // H4：和 drive_help／drive_nohelp／drive_nail_help 同開場（onset 前只有 X5 先站到籃框前）
  {
    id: 'noadv_drive_wall',
    cue: '切入被牆擋住', // 結果卡一行重點：看什麼
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
    resetTargets: ['O4', 'O2'],
    labels: DRIVE5_LABELS,
    look: DRIVE_LOOK,
    occludeAfter: 0.5,
    explain: '這次切入沒有逼出任何人離開位置：你的防守者追回到你前面，大個子站在籃框前、擋在你和籃下隊友之間，外線三個人都貼著自己的人。分球路線都有人，硬切會撞人或被抄。收運球前退出來，把球轉到另一側重新組織。最佳選擇：退出來（往外圍的隊友滑）。和「切入 vs 底角協防」「Nail 協防」比一比：看有沒有人離開自己的人。',
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
    cue: '隊友被過度阻絕', // 結果卡一行重點：看什麼
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['ASEP p.82、p.114、p.140–142', 'NBA Coaches Playbook p.113、p.117', 'WABC Coaches Manual p.17'],
    level: 2,
    play: '弧頂持球',
    name: '側翼被過度阻絕：走後門（Backdoor）',
    coverage: '你在弧頂持球，側翼隊友的防守者一手一腳伸進傳球路線、頭轉向球；隊友往上踩一步後，從他身後直線切向籃框。弱側沒有人內縮。',
    pose: { X2: [[-9, 'deny'], [0.35, 'stance']] }, // 隊友切走前：前手伸進傳球路線（ASEP p.82、p.104）
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
  // ---------- Level 1–2：看腳步選方向（tactics_audit.md 13.7；D-43；UR-35） ----------
  // 兩題一起練：防守者整個人偏過去 → 走他讓出來的那邊；正對你 → 攻他的前腳
  // answer 的左右是未鏡像的；題目鏡像時 main.js 會對調
  {
    id: 'dir_overplay_cross',
    cue: '防守者整個人偏到你運球手那側',
    evidence: 'strong',
    status: 'draft',
    sources: ['ASEP p.37、p.40、p.96', 'NBA Coaches Playbook p.21'],
    level: 1,
    play: '一打一（隊友拉開）',
    name: '封住運球手：換手走另一邊（Overplay）',
    coverage: '隊友拉開，其他防守者都貼著自己的人；你在弧頂右手運球往右走，你的防守者整個人跳到你右手那一側，擋住往右的路。左邊沒有協防在等。',
    driveDir: true,
    lead: { X1: 'left' },          // 他的左腳（在你右手邊）在前，身體也偏到那側（ASEP p.94 的偏站，再加上跳過去）
    cueRoles: ['X1'],
    answer: 'drive_left',
    partial: [],
    pressure: 'tight',
    labels: DIR_LABELS,
    look: DIR_LOOK,
    occludeAfter: 0.5,
    explain: '他整個人跳到你運球手那一側，右邊被封死，左邊讓出一條直線，而且其他防守者都貼著自己的人。換手（轉身運球或交叉運球）往左切，走直線。最佳選擇：往防守者偏過去的反方向切。（如果讓出來的那邊有協防在等，答案可能不同）',
    mistake: '硬往他封住的那側切，撞進他身體。',
    offense: Object.assign({ PG: DIR_OP_PG }, DIR_OFFENSE),
    defense: Object.assign({ X1: DIR_OP_X1 }, DIR_DEFENSE),
  },
  {
    id: 'dir_square_lead_foot',
    cue: '防守者正對你、一腳在前',
    evidence: 'medium', // 查核：Fratello p.232–233 的意圖相反，待教練（research_notes/direction_read_citation_check.md）
    status: 'draft',
    sources: ['NBA Coaches Playbook p.22–23（Van Gundy）、p.233（Fratello）', 'ASEP p.95、p.96'],
    level: 2,
    play: '一打一（隊友拉開）',
    name: '正對你、一腳在前：攻前腳（Attack the lead foot）',
    coverage: '隊友拉開讓你在弧頂一打一。你接球面對防守者、球在你右側；他上前站好、胸口正對你，右腳在前（在你的左手邊），右手舉高。',
    driveDir: true,
    lead: { X1: 'right' },         // 他的右腳在前（在你左手邊）
    square: ['X1'],                // 胸口正對你、不偏站（NBA-CP p.233 Fratello）
    cueRoles: ['X1'],
    answer: 'drive_left',
    partial: [],
    pressure: 'tight',
    labels: DIR_LABELS,
    look: DIR_LOOK,
    occludeAfter: 0.5,
    explain: '他正對你、擋住直線，沒有路可以直接走。這時攻他的前腳：把球從右側掃到左側，用交叉步跨過他在前面的那隻腳，往那一側切。他的前腳和舉高的手都在你左邊，就往左切。和「封住運球手」比一比：整個人偏過去＝走另一邊；正對你＝攻前腳。最佳選擇：往他前腳那側切。（有教練認為前腳是防守故意放的，這題待教練確認）',
    mistake: '往他後腳那側切；或對著正前方的人硬切。',
    offense: Object.assign({ PG: DIR_SQ_PG }, DIR_OFFENSE),
    defense: Object.assign({ X1: DIR_SQ_X1 }, DIR_DEFENSE),
  },
  // ---------- 手遞手（DHO，tactics_audit.md 第 12 節；scenario_bank_v2 E3–E6） ----------
  {
    id: 'dho_trail_drive',
    cue: '防守者被卡在身後追', // 結果卡一行重點：看什麼
    evidence: 'medium', // 擋拆讀法類推到手遞手（citation_check.md 第 7 節）
    status: 'draft',
    sources: ['NBA Coaches Playbook p.58–59 圖 4.21、p.219–220 圖 13.13–13.14', 'basketballforcoaches.com/dho-basketball［網］'],
    level: 2,
    play: '側翼手遞手',
    name: '手遞手：防守者從上方追（Trail）',
    coverage: '你從側翼往上接大個子的手遞手，你的防守者被大個子的身體卡住，只能在你身後追；大個子的防守者留在下面跟著順下。',
    cueRoles: ['X1'],
    answer: 'drive',
    partial: ['pass:O5'],
    labels: DHO_LABELS,
    look: DHO_LOOK,
    ballStart: 'O5',
    ball: [[-0.25, 'PG', 'hand']],
    explain: '手遞手就像擋拆：交球的大個子變成掩護者。你的防守者從上方追（Trail），被卡在你身後，你和籃框之間沒有人。拿到球馬上轉角往籃框攻，大個子往你的反方向順下。最佳選擇：切入。',
    mistake: '拿到球停下來看、或往外帶：等於讓身後的防守者追回來。傳順下也可以，但大個子的防守者跟著他，所以只算可接受。',
    offense: { PG: DHO_PG, O5: DHO_O5_ROLL },
    defense: { X1: DHO_X1_TRAIL, X5: DHO_X5_BACK, X3: X3_HOME },
  },
  {
    id: 'dho_under_shoot',
    cue: '防守者從下方繞過', // 結果卡一行重點：看什麼
    evidence: 'medium', // 擋拆讀法類推到手遞手（citation_check.md 第 7 節）
    status: 'draft',
    sources: ['NBA Coaches Playbook p.58–59 圖 4.22、p.221', 'basketballforcoaches.com/dho-basketball［網］', '[繞下路線與時機為推論，需教練確認]'],
    level: 2,
    play: '側翼手遞手',
    name: '手遞手：防守者繞下（Under）',
    coverage: '你從側翼往上接大個子的手遞手，你的防守者從大個子的下方（籃框那一側）繞過去，在你前面等你；你人在三分線外，是投得進的距離。',
    cueRoles: ['X1'],
    answer: 'shoot',
    partial: [],
    labels: DHO_LABELS,
    look: DHO_LOOK,
    ballStart: 'O5',
    ball: [[-0.25, 'PG', 'hand']],
    explain: '你的防守者從交球的大個子下方繞過（Go under），大個子的身體就替你擋出一塊投籃空間。拿到球就在他身後投，不要再往前走。最佳選擇：拿球就投。',
    mistake: '往籃框切：繞下的防守者正好在前面等你。教練如果知道你不是射手，可能會要大個子再擋一次（Re-screen）。',
    offense: { PG: DHO_PG, O5: DHO_O5_HOLD },
    defense: { X1: DHO_X1_UNDER, X5: DHO_X5_BACK, X3: X3_HOME },
  },
  {
    id: 'dho_hedge_roll',
    cue: '大個子的防守者跳出來', // 結果卡一行重點：看什麼
    evidence: 'medium', // 四題裡最弱：沒有來源直接講手遞手被跳出（citation_check.md 第 7 節）
    status: 'draft',
    sources: ['NBA Coaches Playbook p.85–86（中路擋拆，掩護者的防守者跳出）、p.219–220', 'NBA Coaches Playbook p.54 圖 4.4、p.63 圖 4.37（無球掩護，原則類推）', 'basketballforcoaches.com/dho-basketball［網］', '[手遞手被跳出沒有直接來源，需教練確認]'],
    level: 3,
    play: '側翼手遞手',
    name: '手遞手：大個子的防守者跳出（Hedge）',
    coverage: '你接到手遞手的瞬間，大個子的防守者跳出來擋在你面前；大個子交完球馬上往籃下溜，底角防守者沒有內縮。',
    cueRoles: ['X5'],
    answer: 'pass:O5',
    partial: [],
    labels: DHO_LABELS,
    look: DHO_LOOK,
    ballStart: 'O5',
    ball: [[-0.25, 'PG', 'hand']],
    explain: '大個子的防守者跳出來（Hedge／Show）擋你，交球的大個子就沒人管了。他交完球往籃下溜（Slip），在跳出來的人身側擊地或高吊給他。要快：跳出來一下就會退回去。最佳選擇：傳給順下的大個子。',
    mistake: '急停投：跳出來的人就在你面前不到一公尺。拿著球等他退回，空檔就沒了（往外運一兩步拉出傳球角度可以，NBA-CP p.59、ASEP p.146）。',
    offense: { PG: DHO_PG, O5: DHO_O5_SLIP },
    defense: { X1: DHO_X1_TRAIL, X5: DHO_X5_HEDGE, X3: X3_HOME },
  },
  {
    id: 'dho_toplock_backdoor',
    cue: '手遞路線被擋住', // 結果卡一行重點：看什麼
    evidence: 'strong', // NBA-CP p.131 直接講手遞手被阻絕走後門（citation_check.md 第 7 節）
    status: 'draft',
    sources: ['NBA Coaches Playbook p.131、p.113、p.116–117 圖 7.6、7.10–7.11', 'ASEP p.140–141', 'basketballforcoaches.com/dho-basketball［網］', '[假手遞自己切給 1 分是推論，需教練確認]'],
    level: 3,
    play: '運球手遞手',
    name: '手遞手被搶前：走後門（Top-lock → Backdoor）',
    coverage: '你運球往右翼，要把球手遞給側翼隊友；他的防守者站到他上方、擋住手遞的路線，隊友往上踩一步後往籃下切。弱側沒有人內縮。',
    cueRoles: ['X2'],
    answer: 'pass:O2',
    partial: ['drive'],
    pressure: 'medium',
    labels: TL_LABELS,
    look: { role: 'O2', w: 0.75 }, // 視線偏向側翼：看得到隊友、他上方的防守者和籃框
    fixedX3: true,
    explain: '手遞手被搶前（Top-lock）：防守者站在你和隊友之間，硬遞會被抄。他擋住上面，下面就空了：隊友往後門切，在防守者轉頭的瞬間單手擊地傳給他。最佳選擇：傳給後門切。',
    mistake: '照樣把球遞過去，被防守者抄走；或等隊友切到籃下才傳，太晚。假手遞自己切也可以，但你的防守者還在你和籃框之間，只算可接受。',
    offense: {
      PG: TL_PG,
      O2: TL_O2,
      O5: [[-1.4, -2.8, 2.4], [1.5, -2.8, 2.4]],
    },
    defense: {
      X1: TL_X1,
      X2: TL_X2,
      X5: [[-1.4, -2.1, 1.75], [1.5, -2.1, 1.75]],   // 留在弱側低位身邊，沒有內縮到後門切的路線
      X3: [[-1.4, -5.85, 1.65], [1.5, -5.85, 1.65]],
      X4: [[-1.4, -4.0, 6.4], [1.5, -4.0, 6.4]],
    },
  },
  // ---------- Level 2：擋拆基礎 ----------
  {
    id: 'pnr_drop',
    cue: '大個子沉退', // 結果卡一行重點：看什麼
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
      X1: [...X1_HIT, [0.6, 1.75, 8.85], [0.95, 2.65, 8.65], [1.3, 2.75, 7.75]], // 被掩護卡住，從你身後繞回來
      // 沉退要看得出來（使用者：「大個子沉退也不夠明顯」）：開場和延誤題同一個站位（掩護者下方約 1 m），
      // onset 才往後退 2.5 m 到強側罰球區（NBA-CP p.256 soft help／cover the turn）；退的速度是假設
      X5: [[-0.9, 1.3, 7.9], [-0.3, 1.4, 8.1], [0.0, 1.3, 7.6], [0.4, 1.15, 6.3], [0.8, 1.05, 5.5], [1.2, 1.0, 5.2]],
      X3: X3_HOME,
    },
  },
  {
    id: 'pnr_high_drop',
    cue: '大個子站太高', // 結果卡一行重點：看什麼
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
      X1: [...X1_HIT, [0.6, 1.75, 8.85], [0.95, 2.65, 8.65], [1.3, 2.75, 7.75]], // 被掩護卡住，從你身後繞回來
      // 開場和沉退、延誤同一個站位；onset 後只退一小步，停在罰球線上方（和 pnr_drop 的差別要看退多深）
      X5: [[-0.9, 1.3, 7.9], [-0.3, 1.4, 8.1], [0.0, 1.35, 7.6], [0.6, 1.5, 7.0], [1.2, 1.4, 6.6]],
      X3: X3_HOME,
    },
  },
  {
    id: 'pnr_under',
    cue: '防守者從掩護下方繞', // 結果卡一行重點：看什麼
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft', // draft → coach_1 → approved（3 位教練一致）
    sources: ['NBA Coaches Playbook p.58 圖 4.22、p.60 圖 4.28、p.256–257', 'ASEP p.148', '[X1 繞下路線與順下時機為推論，需教練確認]'],
    level: 2,
    play: '高位擋拆',
    name: '擋拆 vs 繞下（Under）',
    coverage: '你的防守者從掩護者的下方繞過，大個子守在禁區。',
    cueRoles: ['X1'],
    answer: 'shoot',
    partial: [],
    explain: '你的防守者從掩護下方繞過（Go under），掩護者身後留給你一塊空間。一過掩護就收步急停，不要再往外退；FIBA 三分線比較近，你在線外就能直接投。最佳選擇：在掩護後方急停跳投。',
    mistake: '繼續往禁區衝：防守者剛好在下面等你，讓防守輕鬆歸位；或越運越遠、往後退，等他追上來。',
    offense: { PG: UNDER_PG, O5: UNDER_O5 },
    defense: {
      X1: UNDER_X1,
      X5: [[-0.9, 1.2, 7.2], [0.0, 1.1, 6.4], [1.2, 1.0, 5.0]],
      X3: X3_HOME,
    },
  },
  // ---------- Level 3：擋拆進階 ----------
  {
    id: 'pnr_hedge',
    cue: '大個子延誤、弱側沒補', // 結果卡一行重點：看什麼
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
    cue: '延誤後兩人都回位', // 結果卡一行重點：看什麼
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
    cue: '兩人包夾你', // 結果卡一行重點：看什麼
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft', // draft → coach_1 → approved（3 位教練一致）
    sources: ['ASEP p.148、p.126、p.184', 'NBA Coaches Playbook p.59–60 圖 4.25、p.257 圖 16.1、p.80–81、p.83 圖 5.20（接應者）', '[接應者 O4 與 X4 的位置為推論，需教練確認]'],
    level: 3,
    play: '高位擋拆',
    name: '擋拆 vs 包夾（Blitz／Trap）',
    coverage: '兩個防守者同時包夾你，掩護者停在罰球線附近；弱側側翼的隊友拉到弧頂左側當安全接應者，他的防守者往籃下退、守在禁區和底角之間。',
    cueRoles: ['X5'],
    answer: 'pass:O5',
    partial: ['pass:O4'],
    labels: { 'pass:O5': '傳給短順下（Short roll）', 'pass:O4': '傳給拉出來的接應者（安全球）', 'pass:O3': '跳傳弱側底角' },
    explain: '包夾（Blitz）時有兩個人在你身上，後面就少一個防守者，變成 4 打 3（3v3 教學模式是 2 打 1）。掩護者不順到底，停在罰球線附近當短順下（Short roll）。往外運兩步拉開角度，馬上把球交給他，讓他去打以多打少。最佳選擇：傳給短順下。弱側側翼的隊友拉到弧頂當接應者（Pressure release），傳給他是安全球、可以再重組（1 分），但沒有利用到 4 打 3。',
    mistake: '在包夾裡停球、把球舉高，或硬投硬切，都容易失誤。從兩個人頭上跳傳到對面底角，球在空中太久，輪轉的人會抄截。',
    // O4：onset 前和其他擋拆題相同，看到包夾才拉到弧頂左側、比你高的位置接應（NBA Coaches Playbook p.80、p.83 的原則；座標是推論）
    offense: { PG: PG_PATH_BLITZ, O5: SHORT_ROLL_PATH, O4: [[-1.2, -5.0, 6.9], [0.0, -5.05, 6.85], [0.5, -4.0, 8.4], [1.0, -2.9, 9.7], [1.4, -2.4, 10.1]] },
    defense: {
      X1: [...X1_HIT, [0.3, 1.6, 9.7], [0.7, 1.9, 10.1], [1.2, 2.0, 10.5]],
      X5: [[-0.9, 1.3, 7.9], [-0.3, 1.5, 8.3], [0.0, 2.1, 8.6], [0.3, 2.6, 8.7], [0.7, 2.9, 9.2], [1.2, 3.0, 9.6]],
      X3: [[-0.9, -5.4, 1.9], [0.2, -5.2, 2.0], [0.7, -2.8, 3.3], [1.2, -1.4, 4.4]],
      // X4：不跟出去，往籃下退到弱側 gap，同時看接應者和空出來的底角（ASEP p.184：包夾時其他人往籃下輪轉）；離接應者 3.5 m 以上、不在傳球路線上
      X4: [[-1.2, -3.4, 5.6], [0.0, -3.18, 5.38], [0.6, -3.3, 6.1], [1.4, -3.3, 6.6]],
    },
  },
  {
    id: 'pnr_tag_commit',
    cue: '弱側真內縮', // 結果卡一行重點：看什麼
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft', // draft → coach_1 → approved（3 位教練一致）
    sources: ['ASEP p.126、p.134', '[卡位落點（順下者正前方）與順下被擋慢為推論，需教練確認]'],
    level: 3,
    play: '高位擋拆',
    name: '弱側內縮（Tag）真補位',
    coverage: '大個子延誤，底角防守者轉身全速衝進禁區，橫移到順下者正前方、擋在他和籃框之間。',
    cueRoles: ['X5', 'X3'],
    answer: 'pass:O3',
    partial: [],
    explain: '底角防守者（Low man）轉身、頭也轉向球，全速衝進禁區、站到順下者正前方卡住他：這是真的內縮補位（Commit／Tag）。協防從哪裡來，空檔就在哪裡，底角射手沒人。在他離開底角的那一刻就出手，跳傳要高、要快。最佳選擇：跳傳底角。',
    mistake: '照原計畫傳順下：補防者已經卡在他和籃框之間的路線上。',
    occludeAfter: 0.5,
    // 2026-10-24（movement_and_options_check #24）：舊版 1.2 秒時 X3 在順下者「後面」（順下已越過他）。
    // 改成 X3 在 0.8–1.2 秒橫移到順下者正前方（他和籃框之間）卡住，順下被擋慢、推不深（推論）。
    // 前三格和 pnr_tag_stunt 相同；onset+0.25 秒兩題 X3 相差 0.64 m。順下 0.4 秒前和預設 ROLL_PATH 相同。
    offense: { PG: PG_PATH_HEDGE, O5: [...ROLL_PATH.slice(0, 3), [0.8, 0.45, 4.3], [1.2, 0.4, 3.75]] },
    defense: {
      X1: HEDGE_X1,
      X5: HEDGE_X5,
      X3: [[-0.9, -5.4, 1.9], [-0.2, -5.3, 1.95], [0.0, -4.9, 2.1], [0.4, -3.05, 2.5], [0.8, -1.3, 2.85], [1.2, 0.2, 2.9]],
    },
  },
  {
    id: 'pnr_switch',
    cue: '大個子換防到你', // 結果卡一行重點：看什麼
    evidence: 'strong', // 依 docs/citation_check.md 第 3 節
    status: 'draft', // draft → coach_1 → approved（3 位教練一致）
    sources: ['ASEP p.147–148、p.200–201', 'NBA Coaches Playbook p.257'],
    level: 3,
    play: '高位擋拆',
    name: '擋拆 vs 換防（Switch）',
    coverage: '大個子換防到你身上，小個子去追順下。',
    cueRoles: ['X5'],
    answer: 'pass:O5',
    partial: ['shoot', 'drive'],
    explain: '換防（Switch）後，小個子變成在防你的中鋒（錯位 Mismatch）。中鋒順下時用身體把小個子擋在身後（Seal），趁換防還沒站穩就把球送進去。對換過來的大個子急停跳投也可以，但他離你不到一公尺，不是最佳選擇。',
    mistake: '傳底角：底角防守者沒有離開，等於把球傳給被看住的人。',
    offense: { PG: PG_PATH },
    defense: {
      X1: [...X1_HIT.slice(0, 3), [0.0, 0.05, 8.3], [0.5, 0.3, 6.3], [1.2, -0.4, 3.9]],
      X5: [[-0.9, 1.3, 7.9], [-0.3, 1.4, 8.1], [0.0, 1.8, 8.1], [0.6, 2.4, 6.9], [1.2, 2.7, 5.8]],
      X3: X3_HOME,
    },
  },
  // ---------- Level 3：側翼擋拆 vs 封底線（scenario_bank_v2 D1） ----------
  {
    id: 'pnr_ice_pop',
    cue: '封底線（Ice）', // 結果卡一行重點：看什麼
    evidence: 'medium', // 依 docs/citation_check.md 第 3 節
    status: 'draft',
    sources: ['NBA Coaches Playbook p.258 圖 16.4、16.6–16.7', 'NBA Coaches Playbook p.54（掩護者往持球者的反方向）', 'thehoopsgeek.com/basketball-plays/pick-roll-against-ice-defense', '[外彈落點（罰球區角上方）與外彈跳投為推論，需教練確認]'],
    level: 3,
    play: '側翼擋拆',
    name: '側翼擋拆 vs 封底線（Ice）：掩護者外彈',
    coverage: '大個子到側翼替你掩護；你的防守者跳到掩護那一側、把你往底線逼，大個子的防守者站在下方擋住底線。你被逼往底線，掩護者就往你的反方向、往中路的高處外彈到罰球區角上方，沒人跟。',
    cueRoles: ['X1', 'X5'],
    answer: 'pass:O5',
    partial: [],
    pressure: 'medium',
    labels: { 'pass:O5': '傳給外彈的掩護者（Pop）', shoot: '急停跳投', drive: '硬切底線', 'pass:O2': '傳給強側底角', 'pass:O4': '跳傳弱側側翼', 'pass:O3': '跳傳弱側底角' },
    look: { role: 'O5', w: 0.57 }, // 視線在籃框與外彈的掩護者之間：橫拿手機時外彈者（左緣）和下方擋底線的大個子（右緣）都在畫面內
    fixedX3: true,
    occludeAfter: 0.5,
    explain: '封底線（Ice／Down）：你的防守者站在掩護那一側不讓你用掩護，大個子的防守者在下方兩三步擋住底線。兩個人都在對付你，掩護者往你的反方向、往高處外彈，就沒人管。不要硬擠中路或硬切底線，快速把球交給外彈的掩護者跳投。最佳選擇：傳給外彈的掩護者。',
    mistake: '被你的防守者擋住時還硬往中路擠，撞上他；或往底線硬切，撞上大個子的防守者。',
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
    cue: '弱側假撲', // 結果卡一行重點：看什麼
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
  // ==================== 連續回合專用（chainOnly：不單獨出題；教練回饋 #1-5；scenario_bank_v2 第 3 節 R1、R2、R6） ====================
  // 座標仍以「主要動作在右側」撰寫，整個回合共用同一個鏡像。每一步的開場站位＝上一步的結束站位（引擎用 0.6 秒接續）。
  // 驗證（Python 重現 main.js 的 buildRep／updatePlayers／decide，3 種難度 × 左右鏡像 × 5 種作答時機 × 隨機微擾，每回合 90 次）：
  // 影格本身任兩人 ≥ 0.55 m（本區新題，含隨機微擾）；接續位移最大 3.2 m／0.6 秒；影格速度進攻 ≤ 4.6 m/s、防守 ≤ 4.4 m/s。路線與時機都是「假設」。
  // ---------- R1 seq_swing_drive_kick：轉移 → 撲防慢 → 切入 → 底角協防（第 1 步 noadv_wing_reverse 用既有單題） ----------
  {
    id: 'seq_swing_cut_fill',
    auto: true, chainOnly: true, pgStop: 99,
    autoText: '傳弧頂、切過禁區到另一翼…',
    ballStart: 'O4', ball: [[2.55, 'PG']], // 你一到側翼，弧頂隊友就把球轉給你（0.45 秒傳球飛行）
    evidence: 'medium', status: 'draft',
    sources: ['NBA Coaches Playbook p.79、p.229（轉移逼防守輪轉、弱側要撲防）', 'WABC Coaches Manual p.30、ASEP p.157（弱側站在 split line、ball-you-man）', 'ASEP p.135–136（傳切：防守者跳向球就從他背後切）', '[你切過禁區到另一翼的路線、X1 跟切後留在禁區為推論，需教練確認]'],
    level: 2, play: '轉移球', name: '轉移後切過禁區、到另一翼接球',
    coverage: '你把球回傳弧頂後切過禁區、到另一側翼補位；你的防守者跟著你的切入留在禁區；原本在 split line 的底角防守者回到底角；另一邊的底角防守者下沉到中線。',
    cueRoles: [], answer: 'none', partial: [],
    explain: '轉移後防守要跟著球重新站位（NBA Coaches Playbook p.79）。', mistake: '',
    look: { role: 'O4', w: 0.55 },
    fixedX3: true,
    offense: {
      PG: [[0, 4.4, 6], [0.5, 2.9, 4.75], [1, 1, 3.75], [1.45, -1, 3.75], [1.9, -2.9, 4.55], [2.35, -4.4, 5.9], [2.7, -4.95, 6.75], [3, -5, 6.9]], // 傳切（give-and-go）路線：從防守者背後切過禁區，再到另一翼（約 4.5 m/s）
      O4: [[0, -0.4, 8.75], [3, -0.4, 8.75]],
      O2: [[0, 6.95, 1.2], [3, 6.95, 1.2]],
      O5: [[0, 2.9, 2.3], [3, 2.9, 2.3]],
      O3: [[0, -6.95, 1.2], [3, -6.95, 1.2]],
    },
    defense: {
      X1: [[0, 3.85, 6.65], [0.5, 3, 5.85], [1, 1.3, 5], [1.45, -0.3, 4.75], [1.9, -1.2, 4.6], [2.55, -1.6, 4.6], [2.8, -1.75, 4.72], [3, -2.05, 4.95]], // 先往球的方向跳一步，跟著切入者過禁區，你出去補位時他留在禁區（推論）
      X4: [[0, 0.25, 7.65], [0.4, -0.15, 7.85], [2.55, -0.15, 7.85], [3, -1.05, 7.7]],
      X3: [[0, -0.9, 2.4], [1.9, -1.1, 2.35], [2.55, -3.2, 2.15], [3, -4.6, 2.05]], // 球要轉到他這一側：從 split line 回到底角射手
      X2: [[0, 6.3, 2], [1.2, 6.2, 2.05], [2.6, 4.4, 2.9], [3, 4.4, 2.9]], // 球離開他這側：從底角下沉
      X5: [[0, 3.25, 3.15], [0.3, 3.2, 3.2], [0.8, 2.45, 3.25], [1.6, 1.8, 2.35], [3, 1.8, 2.35]], // 從低位前側繞到球側、籃框側（繞高側，不穿過低位隊友）
    },
  },
  {
    id: 'seq_swing_attack',
    chainOnly: true,
    cue: '轉移後撲防太慢',
    evidence: 'strong', status: 'draft',
    sources: ['NBA Coaches Playbook p.21、p.79、p.85（偏向切）、p.229', 'ASEP p.133（偏向投）', 'WABC Coaches Manual p.19'],
    level: 2, play: '轉移球', name: '轉移後撲防太慢：攻過去',
    coverage: '球轉到你手上，你的防守者從禁區撲出來，你接球時他還在兩公尺多外、還在衝。',
    cueRoles: ['X1'],
    answer: 'drive', alsoBest: ['shoot'], partial: [],
    pressure: 'tight',
    labels: { reset: '再轉移一次', drive: '切過撲防（Attack）', shoot: '接球投籃', 'pass:O4': '傳回弧頂', 'pass:O3': '傳同側底角', 'pass:O2': '跳傳弱側底角', 'pass:O5': '跳傳弱側低位' },
    look: { role: 'O4', w: 0.5 },
    fixedX3: true,
    occludeAfter: 0.3,
    explain: '轉移創造出優勢：你接球時防守者還在兩公尺外衝過來。趁他還在衝，接球馬上攻過去（NBA Coaches Playbook p.85）；接球就投也對（ASEP p.133）。這個回合選「切」才會繼續。',
    mistake: '接球後拿著球看，或再轉一次，把優勢送回去。',
    offense: {
      PG: [[0, -5, 6.9], [1.5, -5, 6.9]],
      O4: [[0, -0.4, 8.75], [1.5, -0.4, 8.75]],
      O2: [[0, 6.95, 1.2], [1.5, 6.95, 1.2]],
      O5: [[0, 2.9, 2.3], [1.5, 2.9, 2.3]],
      O3: [[0, -6.95, 1.2], [1.5, -6.95, 1.2]],
    },
    defense: {
      X1: [[0, -3, 5.7], [0.3, -3.6, 6.3], [0.55, -3.9, 6.65], [0.8, -4, 6.8], [1.5, -4, 6.8]], // 從禁區撲出：onset 時離你 2.3 m，0.8 秒後才到你中路側 1.0 m（留出往籃框的切入路線）
      X3: [[0, -6.15, 1.95], [1.5, -6.15, 1.95]],
      X4: [[0, -1.15, 7.7], [1.5, -1.2, 7.7]],
      X2: [[0, 4.4, 2.9], [1.5, 4.4, 2.9]],
      X5: [[0, 1.8, 2.35], [1.5, 1.8, 2.35]],
    },
  },
  {
    id: 'seq_swing_drive_corner',
    chainOnly: true,
    cue: '底角防守者上來擋',
    evidence: 'strong', status: 'draft',
    sources: ['NBA Coaches Playbook p.81 圖 5.14', 'ASEP p.134', '[分歧：很多體系規定不從強側底角協防，見 scenario_bank_v2 B1]'],
    level: 2, play: '持球切入', name: '切入 vs 強側底角協防',
    coverage: '你切過撲防、往籃下靠底線側切入，同側底角的防守者離開射手，踏進三分線內擋你。',
    cueRoles: ['X3'],
    answer: 'pass:O3', partial: [],
    pressure: 'tight',
    labels: { 'pass:O3': '回傳同側底角', 'pass:O5': '傳給弱側低位', 'pass:O2': '跳傳弱側底角', 'pass:O4': '回傳弧頂', shoot: '自己上籃／拋投' },
    look: { role: 'O3', w: 0.6 },
    fixedX3: true,
    occludeAfter: 0.4,
    explain: '同側底角的防守者離開射手來擋你：協防從哪裡來，空檔就在哪裡。在他離開的那一刻，把球回傳給身旁的底角射手。',
    mistake: '看到協防就停球，或起跳後才找人。這一球傳弱側不對，因為那邊的防守者都在傳球路線上；如果底角被封住，弱側才是答案（NBA Coaches Playbook p.81 圖 5.15）。',
    offense: {
      PG: [[-0.6, -3.35, 5.15], [-0.3, -3.2, 4.3], [0, -3.05, 3.35], [0.3, -2.95, 2.4], [1.4, -2.95, 2.4]], // 接續切入（約 3 m/s），onset+0.3 秒停在禁區邊、離籃 3.1 m
      O4: [[-0.6, -0.4, 8.75], [1.4, -0.4, 8.75]],
      O2: [[-0.6, 6.95, 1.2], [1.4, 6.95, 1.2]],
      O5: [[-0.6, 2.9, 2.3], [1.4, 2.9, 2.3]],
      O3: [[-0.6, -6.95, 1.2], [1.4, -6.95, 1.2]],
    },
    defense: {
      X1: [[-0.6, -3.8, 6.1], [-0.3, -3.6, 5.3], [0, -3.4, 4.45], [0.3, -3.2, 3.6], [0.7, -3.05, 3.3], [1.4, -3, 3.25]], // 被甩開、跟在你身後 0.9–1.2 m
      X3: [[-0.6, -6.15, 1.95], [0, -6.1, 1.95], [0.3, -5, 2.35], [0.6, -4.35, 2.7], [1, -4.05, 2.9], [1.4, -4, 2.9]], // 0.3 秒內踏進三分線（離籃 5.1 m）、最後在你前方 1.2 m，離傳底角的路線 0.8 m
      X4: [[-0.6, -1.2, 7.7], [0.5, -1.1, 7.3], [1.4, -1.05, 7.2]],
      X2: [[-0.6, 4.4, 2.9], [1.4, 4.3, 2.9]],
      X5: [[-0.6, 1.8, 2.35], [0.5, 1.6, 2.3], [1.4, 1.5, 2.3]],
    },
  },
  // ---------- R2 seq_pnr_reset_rescreen：擋拆沒優勢 → 轉移 → 再擋一次讀沉退（第 1 步 pnr_hedge_recovered、第 3 步 pnr_drop 用既有單題） ----------
  {
    id: 'seq_reset_rescreen',
    auto: true, chainOnly: true, pgStop: 99,
    autoText: '球轉回你手上，大個子再擋一次…',
    ballStart: 'O4', ball: [[1.0, 'PG']],
    evidence: 'medium', status: 'draft',
    sources: ['NBA Coaches Playbook p.53、p.77、p.79', '[scenario_bank_v2 D4 分歧欄：有教練要求立刻再擋一次；回傳與再擋（Re-screen）的路線、第二次改沉退為推論，需教練確認]'],
    level: 3, play: '高位擋拆', name: '轉移後球回來、再擋一次',
    coverage: '你把球轉給側翼後回到弧頂，側翼把球傳回給你；掩護者從禁區回到弧頂再替你掩護一次，他的防守者跟上來。',
    cueRoles: [], answer: 'none', partial: [],
    explain: '用完掩護被接住，你就變成傳球者（NBA Coaches Playbook p.53）；沒有優勢就把球轉出去（p.77）。球回來後掩護者再擋一次［推論，需教練確認］。', mistake: '',
    look: { role: 'O4', w: 0.5 },
    fixedX3: true,
    // 結束站位＝pnr_drop 的開場（PG_PRE、SCREEN_SET、X1_HIT 的第一格；X5 在掩護者下方 1 m）
    offense: {
      PG: [[0, 1.7, 9.35], [0.5, 0.8, 9.45], [1, 0, 9.45], [1.4, -0.2, 9.4], [1.9, -0.2, 9.4]], // 回到弧頂當接應者，1.45 秒接到回傳
      O4: [[0, -5.1, 6.8], [1.9, -5, 6.9]],
      O5: [[0, 0.4, 5.85], [0.5, 0.75, 6.6], [1.1, 1.1, 7.8], [1.7, 0.6, 8.8], [1.9, 0.6, 8.8]], // 從禁區繞到 X1 右側回到 SCREEN_SET 的站位（不從 X1 身上穿過）
      O2: [[0, 6.95, 1.2], [1.9, 6.95, 1.2]],
      O3: [[0, -6.95, 1.2], [1.9, -6.95, 1.2]],
    },
    defense: {
      X1: [[0, 2, 8.75], [0.5, 1.2, 8.55], [1, 0.45, 8.35], [1.4, 0.15, 8.4], [1.9, 0, 8.7]], // 球在側翼時退半步到傳球路線外（離回傳路線 ≥ 1.1 m），你接球再貼上
      X5: [[0, 0.85, 5], [0.5, 1.3, 5.7], [1.1, 1.6, 6.75], [1.9, 1.3, 7.9]], // 跟著掩護者上來，停在他下方約 1 m（和延誤題同站位）
      X4: [[0, -3.6, 5.75], [0.5, -4.35, 6.25], [1, -4.35, 6.25], [1.9, -3.4, 5.6]], // 撲到側翼，球傳回後退回 split line
      X2: [[0, 5.8, 2], [1.9, 5.9, 1.9]],
      X3: [[0, -5.6, 1.8], [1.9, -5.4, 1.9]],
    },
  },
  // ---------- R6 seq_tag_xout：擋拆 → 跳傳底角 → X-out → 球回到你（第 1 步 pnr_tag_commit 用既有單題） ----------
  {
    id: 'seq_xout_rotation',
    auto: true, chainOnly: true, pgStop: 99,
    autoText: '防守 X 型輪轉，球轉回來…',
    ballStart: 'O3', ball: [[0.7, 'O4'], [1.6, 'PG']],
    evidence: 'medium', status: 'draft',
    sources: ['lowmanhelp.substack.com/p/the-blueprint-pick-and-roll-101［網］（X-out：弱側上方的人撲底角、內縮的人撲向側翼）', 'NBA Coaches Playbook p.79、p.87（快速轉移讓防守一直輪轉）', 'WABC Coaches Manual p.28（Receivers：球後方的接應者）', '[X1 沉到罰球線參與 i 字輪轉、因此撲防慢為推論，需教練確認（scenario_bank_v2 R6）]'],
    level: 4, play: '高位擋拆', name: 'X 型輪轉（X-out）後球回到你',
    coverage: '底角接到跳傳，弱側側翼的防守者衝去撲底角，剛才內縮的底角防守者衝向側翼；底角轉給側翼，側翼被撲到位，再回傳給移到弧頂的你。你的防守者剛才沉到罰球線幫忙看順下。',
    cueRoles: [], answer: 'none', partial: [],
    explain: '跳傳到底角後，防守用 X 型輪轉補兩個空位（Low Man Help［網］）；快速轉移讓防守一直輪轉（NBA Coaches Playbook p.79、p.87）。最後一個要撲的人來不及［推論，需教練確認］。', mistake: '',
    look: { role: 'O4', w: 0.45 },
    fixedX3: true,
    offense: {
      PG: [[0, 1.6, 9.05], [0.6, 0.6, 9.35], [1.2, -0.5, 9.4], [1.6, -0.85, 9.3], [2, -0.95, 9.25], [2.1, -0.95, 9.25]], // 傳完往左側弧頂移動當接應者（約 2 m/s），2.05 秒接球
      O3: [[0, -6.95, 1.2], [2.1, -6.95, 1.2]],
      O4: [[0, -5.1, 6.8], [2.1, -5.1, 6.8]],
      O5: [[0, 0.35, 3.65], [0.6, 0.3, 3.45], [2.1, 0.3, 3.45]],
      O2: [[0, 6.95, 1.2], [2.1, 6.95, 1.2]],
    },
    defense: {
      X4: [[0, -3.55, 5.15], [0.4, -4.6, 3.85], [0.8, -5.6, 2.55], [1.1, -6.05, 2.05], [1.4, -6.15, 1.95], [2.1, -6.15, 1.95]], // 撲底角（約 4.2 m/s）
      X3: [[0, -0.3, 3.2], [0.4, -1.55, 4.1], [0.8, -3, 5.1], [1.1, -3.95, 5.75], [1.35, -4.35, 6.15], [2.1, -4.4, 6.2]], // 內縮後衝向側翼（X 型，和 X4 交叉時相隔 2.5 m 以上），側翼接球後 0.2 秒到一臂距離
      X5: [[0, 1.85, 6.75], [0.5, 1.35, 5.1], [1, 1.2, 3.7], [1.5, 1.05, 2.85], [2.1, 1.05, 2.85]], // 延誤後退回順下者身邊
      X1: [[0, 2.3, 9.45], [0.5, 2, 8.4], [1, 1.2, 6.8], [1.5, 0.75, 5.75], [1.7, 0.7, 5.7], [2.1, 0.45, 6.1]], // 先從你身後繞開，沉到罰球線（i 字上方），球傳回你時才開始出來（推論）
      X2: [[0, 5.75, 2.05], [0.4, 5.7, 2.1], [1.3, 2.7, 2.9], [2.1, 2.7, 2.9]], // 球在另一側：從底角下沉到中線
    },
  },
  {
    id: 'seq_xout_late_closeout',
    chainOnly: true,
    cue: '撲防來不及',
    evidence: 'strong', status: 'draft',
    sources: ['ASEP p.133', 'NBA Coaches Playbook p.21', 'WABC Coaches Manual p.19'],
    level: 4, play: '接球對撲防', name: 'X 型輪轉後撲防太慢',
    coverage: '球轉回你手上，你的防守者從罰球線慢慢出來，你接球時他還在兩公尺多外、手放低。',
    pose: { X1: 'closeout_low' }, // 慢慢出來、手放低（tactics_audit 13.6）
    cueRoles: ['X1'],
    answer: 'shoot', partial: ['drive'],
    pressure: 'tight',
    labels: { shoot: '接球就投', drive: '切過撲防（Attack）', 'pass:O4': '回傳側翼', 'pass:O3': '傳底角', 'pass:O5': '傳給籃下大個子', 'pass:O2': '跳傳另一側底角', reset: '再轉移' },
    fixedX3: true,
    occludeAfter: 0.4,
    explain: '防守為了補跳傳轉了一圈，你的防守者是最後一個要撲的人：你接球時他還在兩公尺多外、慢慢出來、手放低。你在射程內（這裡離籃 7.7 m，假設你投得到），接球就投（ASEP p.133、NBA Coaches Playbook p.21）。',
    mistake: '多運一下或再轉一次，讓他到位；側翼和底角都已經被撲到。',
    offense: {
      PG: [[0, -0.95, 9.25], [1.5, -0.95, 9.25]], // 左側弧頂（離籃 7.7 m，三分線外）
      O4: [[0, -5.1, 6.8], [1.5, -5.1, 6.8]],
      O3: [[0, -6.95, 1.2], [1.5, -6.95, 1.2]],
      O5: [[0, 0.3, 3.45], [1.5, 0.3, 3.45]],
      O2: [[0, 6.95, 1.2], [1.5, 6.95, 1.2]],
    },
    defense: {
      X1: [[0, -0.03, 6.61], [0.5, -0.52, 7.66], [1, -0.71, 8.07], [1.5, -0.73, 8.17]], // onset 時離你 2.8 m、0.5 秒 1.65 m、1.0 秒 1.2 m（closeout_late_shoot 是 2.9／1.9／1.4 m）
      X3: [[0, -4.4, 6.2], [1.5, -4.45, 6.25]],
      X4: [[0, -6.15, 1.95], [1.5, -6.15, 1.95]],
      X5: [[0, 1.05, 2.85], [1.5, 1, 2.8]],
      X2: [[0, 2.7, 2.9], [0.8, 3.8, 2.55], [1.5, 4.2, 2.4]],
    },
  },
];

// 回合：多個決策點串起來（教練回饋 #1-5：直到出手、被抄或判斷錯誤才結束）。
// steps：題目 id，或 { sc, continueOn }（玩家的動作在 continueOn 裡才進下一步；沒寫＝答對或可接受就繼續）。
// 自動段落（auto: true）由隊友處理球、防守輪轉，播完自動進下一步。依據見 docs/scenario_bank_v2.md 第 3 節。
// needs5：回合用到 O2／O4，3v3 教學模式不出（main.js startSession 的 needsExtra）。
export const POSSESSIONS = [
  {
    id: 'seq_swing_drive_kick',
    name: '轉移 → 撲防慢 → 切入 → 底角協防',
    topic: 'noadv', level: 2, needs5: true,
    evidence: 'medium', // 三個決策點都是書面強依據；中間轉移與輪轉的路線有推論
    status: 'draft',
    sources: ['NBA Coaches Playbook p.77、p.79、p.85、p.81 圖 5.14', 'ASEP p.133、p.134', 'WABC Coaches Manual p.19、p.30', '[自動段落的切入路線與 X1 撲防慢的原因為推論，需教練確認]'],
    steps: [
      { sc: 'noadv_wing_reverse', continueOn: ['pass:O4'] }, // 回傳弧頂才接得下去（運球退出來也算對，但回合在這裡結束）
      'seq_swing_cut_fill',
      { sc: 'seq_swing_attack', continueOn: ['drive'] },     // 接球就投也是 2 分，但出手就結束
      'seq_swing_drive_corner',
    ],
  },
  {
    id: 'seq_pnr_reset_rescreen',
    name: '擋拆沒優勢 → 轉移 → 再擋一次讀沉退',
    topic: 'pnr', level: 3, needs5: true,
    evidence: 'medium',
    status: 'draft',
    sources: ['NBA Coaches Playbook p.53、p.77、p.79、p.256', 'FIBA OBRI 2024 26-3（p.51）', '[第二次掩護的方向與防守改沉退為推論，需教練確認]'],
    steps: [
      { sc: 'pnr_hedge_recovered', continueOn: ['pass:O4'] },
      'seq_reset_rescreen',
      'pnr_drop',
    ],
  },
  {
    id: 'seq_tag_xout',
    name: '擋拆內縮 → 跳傳底角 → X 型輪轉 → 球回到你',
    topic: 'pnr', level: 4, needs5: true,
    evidence: 'medium',
    status: 'draft',
    sources: ['ASEP p.126、p.133、p.134', 'NBA Coaches Playbook p.21、p.79、p.87', 'lowmanhelp.substack.com/p/the-blueprint-pick-and-roll-101［網］', '[X1 會不會參與輪轉為推論，需教練確認]'],
    steps: [
      { sc: 'pnr_tag_commit', continueOn: ['pass:O3'] },
      'seq_xout_rotation',
      'seq_xout_late_closeout',
    ],
  },
];

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
