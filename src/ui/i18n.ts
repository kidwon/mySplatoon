export type Lang = 'zh' | 'ja' | 'en';

const STORAGE_KEY = 'mysplatoon-lang';

/**
 * 文案词典。
 * controls1/controls2 含 <b> 标记，需用 data-i18n-html / innerHTML 应用。
 */
const STRINGS: Record<Lang, Record<string, string>> = {
  zh: {
    language: '语言',
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
  },
  ja: {
    language: '言語',
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
  },
  en: {
    language: 'Language',
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
