export type Lang = 'zh' | 'ja' | 'en';

const STORAGE_KEY = 'mysplatoon-lang';

/**
 * 文案词典。
 * controls1/controls2 含 <b> 标记，需用 data-i18n-html / innerHTML 应用。
 */
const STRINGS: Record<Lang, Record<string, string>> = {
  zh: {
    language: '语言',
    yourChar: '我的角色',
    enemyChar: '对手角色',
    char_chiikawa: '吉伊',
    char_hachiware: '小八',
    char_usagi: '乌萨奇',
    char_shisa: '狮萨',
    char_nikori: '妮可莉',
    char_onizaru: '小鬼猴',
    char_doro: '多萝',
    selectConfirm: '选定',
    selectBack: '返回',
    yourColor: '我的颜色',
    enemyColor: '对手颜色',
    difficulty: '对手难度',
    easy: '简单',
    normal: '普通',
    hard: '困难',
    clickToStart: '点击开始 · 进入战场',
    escHint: 'ESC 释放鼠标',
    controls1: '<b>WASD</b> 移动 &nbsp;|&nbsp; <b>鼠标</b> 瞄准 &nbsp;|&nbsp; <b>左键</b> 射击',
    controls2: '<b>Space</b> 跳跃 &nbsp;|&nbsp; <b>Shift(按住)</b> 乌贼形态 / 潜墨',
    controls3: '<b>1 / 2 / 3</b> 切换对手难度',
    controls4: '<b>M</b> 音效开关',
    restart: '再来一局',
    victory: '胜利！',
    defeat: '惜败…',
    draw: '平局！',
    score: '我方 {p}%  vs  对方 {e}%',
    human: '人形',
    squid: '乌贼',
    respawnMsg: '被击倒了！{s}s 后重生',
    online: '联机对战',
    soloMode: '单机模式',
    server: '服务器',
    connect: '连接',
    connecting: '连接中…',
    connected: '已连接',
    disconnected: '连接已断开',
    connectFailed: '无法连接服务器，请确认已运行 npm run server',
    createRoom: '创建房间',
    joinRoom: '加入',
    codePlaceholder: '房间码',
    roomCode: '房间码',
    shareCode: '把房间码发给对手加入',
    players: '玩家',
    you: '（我）',
    host: '房主',
    readyMark: '已准备',
    notReadyMark: '未准备',
    ready: '准备',
    cancelReady: '取消准备',
    leaveRoom: '离开房间',
    waitingPlayers: '等待对手加入…',
    waitingReady: '等待全员准备…',
    errRoomNotFound: '房间不存在',
    errRoomFull: '房间已满',
    errInMatch: '该房间正在对局中',
    errGeneric: '出错了：{code}',
    opponentLeft: '对手已离开，对局结束',
    startsIn: '{s} 秒后开始',
    clickToEnter: '点击进入战场',
    escHintOnline: 'ESC 释放鼠标（对局计时不会暂停）',
    backToRoom: '返回房间',
    waitingResult: '等待结算…',
    ping: '延迟',
    scoreOnline: '我方 {p}%  vs  对方 {e}%',
  },
  ja: {
    language: '言語',
    yourChar: '自分のキャラ',
    enemyChar: '敵のキャラ',
    char_chiikawa: 'ちいかわ',
    char_hachiware: 'ハチワレ',
    char_usagi: 'うさぎ',
    char_shisa: 'シーサー',
    char_nikori: 'ニコリ',
    char_onizaru: 'オニザル',
    char_doro: 'ドロ',
    selectConfirm: '決定',
    selectBack: 'もどる',
    yourColor: '自分の色',
    enemyColor: '敵の色',
    difficulty: '敵の強さ',
    easy: 'かんたん',
    normal: 'ふつう',
    hard: 'むずかしい',
    clickToStart: 'クリックしてスタート',
    escHint: 'ESC でマウス解放',
    controls1: '<b>WASD</b> 移動 &nbsp;|&nbsp; <b>マウス</b> エイム &nbsp;|&nbsp; <b>左クリック</b> 射撃',
    controls2: '<b>Space</b> ジャンプ &nbsp;|&nbsp; <b>Shift(長押し)</b> イカ形態 / 潜行',
    controls3: '<b>1 / 2 / 3</b> 敵の強さを変更',
    controls4: '<b>M</b> サウンド切替',
    restart: 'もう一回！',
    victory: 'WIN！',
    defeat: 'LOSE…',
    draw: '引き分け',
    score: '自分 {p}%  vs  敵 {e}%',
    human: 'ヒト',
    squid: 'イカ',
    respawnMsg: 'やられた！復活まで {s}s',
    online: 'オンライン対戦',
    soloMode: 'ひとりで',
    server: 'サーバー',
    connect: '接続',
    connecting: '接続中…',
    connected: '接続済み',
    disconnected: '切断されました',
    connectFailed: 'サーバーに接続できません（npm run server を確認）',
    createRoom: 'ルーム作成',
    joinRoom: '参加',
    codePlaceholder: 'ルームコード',
    roomCode: 'ルームコード',
    shareCode: 'コードを相手に伝えてください',
    players: 'プレイヤー',
    you: '（自分）',
    host: 'ホスト',
    readyMark: '準備OK',
    notReadyMark: '未準備',
    ready: '準備OK',
    cancelReady: '準備解除',
    leaveRoom: 'ルームを出る',
    waitingPlayers: '相手を待っています…',
    waitingReady: '全員の準備を待っています…',
    errRoomNotFound: 'ルームが見つかりません',
    errRoomFull: 'ルームは満員です',
    errInMatch: 'このルームは対戦中です',
    errGeneric: 'エラー：{code}',
    opponentLeft: '相手が退出しました',
    startsIn: '{s} 秒後に開始',
    clickToEnter: 'クリックして参戦',
    escHintOnline: 'ESC でマウス解放（タイマーは止まりません）',
    backToRoom: 'ルームへ戻る',
    waitingResult: '結果を集計中…',
    ping: 'Ping',
    scoreOnline: '自分 {p}%  vs  相手 {e}%',
  },
  en: {
    language: 'Language',
    yourChar: 'Your Fighter',
    enemyChar: 'Opponent',
    char_chiikawa: 'Chiikawa',
    char_hachiware: 'Hachiware',
    char_usagi: 'Usagi',
    char_shisa: 'Shisa',
    char_nikori: 'Nikori',
    char_onizaru: 'Onizaru',
    char_doro: 'Doro',
    selectConfirm: 'Select',
    selectBack: 'Back',
    yourColor: 'Your Ink',
    enemyColor: 'Enemy Ink',
    difficulty: 'Bot Difficulty',
    easy: 'Easy',
    normal: 'Normal',
    hard: 'Hard',
    clickToStart: 'Click to Start',
    escHint: 'Press ESC to release mouse',
    controls1: '<b>WASD</b> Move &nbsp;|&nbsp; <b>Mouse</b> Aim &nbsp;|&nbsp; <b>LMB</b> Shoot',
    controls2: '<b>Space</b> Jump &nbsp;|&nbsp; <b>Hold Shift</b> Squid Form / Swim',
    controls3: '<b>1 / 2 / 3</b> Change Bot Difficulty',
    controls4: '<b>M</b> Toggle Sound',
    restart: 'Rematch',
    victory: 'VICTORY!',
    defeat: 'DEFEAT...',
    draw: 'DRAW!',
    score: 'You {p}%  vs  Enemy {e}%',
    human: 'HUMAN',
    squid: 'SQUID',
    respawnMsg: 'Splatted! Respawn in {s}s',
    online: 'Online Match',
    soloMode: 'Solo',
    server: 'Server',
    connect: 'Connect',
    connecting: 'Connecting…',
    connected: 'Connected',
    disconnected: 'Disconnected',
    connectFailed: 'Cannot reach server (is npm run server running?)',
    createRoom: 'Create Room',
    joinRoom: 'Join',
    codePlaceholder: 'CODE',
    roomCode: 'Room Code',
    shareCode: 'Share this code with your opponent',
    players: 'Players',
    you: '(you)',
    host: 'Host',
    readyMark: 'Ready',
    notReadyMark: 'Not ready',
    ready: 'Ready',
    cancelReady: 'Cancel',
    leaveRoom: 'Leave Room',
    waitingPlayers: 'Waiting for an opponent…',
    waitingReady: 'Waiting for everyone to be ready…',
    errRoomNotFound: 'Room not found',
    errRoomFull: 'Room is full',
    errInMatch: 'That room is mid-match',
    errGeneric: 'Error: {code}',
    opponentLeft: 'Opponent left. Match over.',
    startsIn: 'Starting in {s}s',
    clickToEnter: 'Click to enter the battle',
    escHintOnline: 'ESC releases the mouse (the clock keeps running)',
    backToRoom: 'Back to Room',
    waitingResult: 'Tallying results…',
    ping: 'Ping',
    scoreOnline: 'You {p}%  vs  Them {e}%',
  },
};

let current: Lang = (() => {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'zh' || saved === 'ja' || saved === 'en' ? saved : 'zh';
})();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang) {
  current = lang;
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
  applyStatic();
}

/** 取当前语言文案 */
export function t(key: string): string {
  return STRINGS[current][key] ?? key;
}

/** 带 {var} 插值的文案 */
export function fmt(key: string, vars: Record<string, string | number>): string {
  let s = t(key);
  for (const [k, v] of Object.entries(vars)) {
    s = s.replace(`{${k}}`, String(v));
  }
  return s;
}

/** 把词典应用到所有带 data-i18n / data-i18n-html 的静态元素 */
export function applyStatic() {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n!);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml!);
  });
}
