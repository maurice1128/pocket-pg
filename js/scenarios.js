// 情境題庫：擋拆閱讀 + 新手的切入分球
// 座標：x = 橫向（右側邊線 +7.5），z = 距離底線（籃框中心 z = 1.575），單位公尺，FIBA 半場。
// 擋拆情境以「掩護在控衛右側、控衛往右繞掩護」撰寫；執行時隨機鏡像到左側。
// 每個角色的動作 = 一串關鍵影格 [t(秒), x, z]，t 以「關鍵防守反應起點 onset」為 0 往前後計。
// answer: 正確動作（2 分）；partial: 可接受（1 分）；其餘 0 分（計分沿用 Pagé et al., 2019）。
// 動作代碼：'shoot'（自己出手）或 'pass:<角色>'（傳給那位隊友）；labels 可依情境改顯示文字。
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
const DRIVE_X1 = [[-1.2, 1.2, 8.2], [-0.6, 1.9, 7.9], [0.0, 2.3, 6.4], [0.6, 2.1, 5.0], [1.2, 1.8, 4.2]];
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

export const SCENARIOS = [
  // ---------- Level 1：2 打 1 快攻（tactics_audit.md 第 5 節 N1、N2） ----------
  {
    id: 'fb_2v1_commit',
    status: 'draft',
    sources: ['NBA Coaches Playbook p.156', 'WABC Coaches Manual p.26', 'Canada Basketball LTAD p.56'],
    level: 1,
    play: '2 打 1 快攻',
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
    status: 'draft',
    sources: ['NBA Coaches Playbook p.156', 'WABC Coaches Manual p.26'],
    level: 1,
    play: '2 打 1 快攻',
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
  // ---------- Level 1–2：切入分球 ----------
  {
    id: 'drive_help',
    status: 'draft', // draft → coach_1 → approved（3 位教練一致）
    sources: ['ASEP p.132–134', 'NBA Coaches Playbook p.81 圖 5.14'],
    level: 1,
    play: '切入分球',
    name: '切入 vs 底角協防（Help）',
    coverage: '你切進禁區，弱側底角的防守者離開射手，站進你的切入路線。',
    cueRoles: ['X3'],
    answer: 'pass:O3',
    partial: [],
    labels: DRIVE_LABELS,
    explain: '底角防守者（Low man）離開射手來協防你：協防從哪裡來，空檔就在哪裡。在他離開的那一刻把球分到底角。最佳選擇：分球底角。',
    mistake: '看到協防就停球或硬上，失去切入的優勢；傳給籃下大個子也不對，他的防守者沒有離開。',
    offense: { PG: PG_DRIVE, O5: DUNKER },
    defense: {
      X1: DRIVE_X1,
      X5: DUNKER_X5,
      X3: [[-1.2, -5.4, 1.9], [-0.2, -5.2, 2.0], [0.0, -4.8, 2.2], [0.4, -2.8, 2.9], [0.8, 0.0, 3.3], [1.2, 1.0, 3.4]],
    },
  },
  {
    id: 'drive_nohelp',
    status: 'draft', // draft → coach_1 → approved（3 位教練一致）
    sources: ['ASEP p.133', 'NBA Coaches Playbook p.81'],
    level: 1,
    play: '切入分球',
    name: '切入 vs 沒有協防',
    coverage: '你切進禁區，底角防守者只往前踏一步，就留在射手身邊。',
    cueRoles: ['X3'],
    answer: 'shoot',
    partial: [],
    labels: DRIVE_LABELS,
    explain: '底角防守者沒有離開射手，代表沒有人來擋你：路線是空的，自己完成上籃或拋投。最佳選擇：自己攻擊。',
    mistake: '對著被看住的射手硬傳：防守者就在他旁邊，球容易被抄。',
    offense: { PG: PG_DRIVE, O5: DUNKER },
    defense: {
      X1: DRIVE_X1,
      X5: DUNKER_X5,
      X3: [[-1.2, -5.4, 1.9], [0.0, -5.5, 1.9], [0.3, -5.0, 2.1], [0.7, -5.6, 1.8], [1.2, -5.8, 1.7]],
    },
  },
  // ---------- Level 2：擋拆基礎 ----------
  {
    id: 'pnr_drop',
    status: 'draft', // draft → coach_1 → approved（3 位教練一致）
    sources: ['NBA Coaches Playbook p.256', 'ASEP p.148', 'FIBA OBRI 26-3'],
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
    status: 'draft', // draft → coach_1 → approved（3 位教練一致）
    sources: ['ASEP p.148', 'thehoopsgeek.com/pick-and-roll-defense'],
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
    status: 'draft', // draft → coach_1 → approved（3 位教練一致）
    sources: ['NBA Coaches Playbook p.54 圖 4.4、p.63–64、p.255–256', 'ASEP p.146、p.203'],
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
  {
    id: 'pnr_blitz',
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
    status: 'draft', // draft → coach_1 → approved（3 位教練一致）
    sources: ['ASEP p.126、p.134', 'NBA Coaches Playbook p.257、p.81 圖 5.14'],
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
  // ---------- Level 4：假動作辨識 ----------
  {
    id: 'pnr_tag_stunt',
    status: 'draft', // draft → coach_1 → approved（3 位教練一致）
    sources: ['ASEP p.126、p.132', 'NBA Coaches Playbook p.256'],
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
