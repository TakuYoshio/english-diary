'use strict';

// ── 仲間たち（マスコットの登録簿）───────────────────────────────────────────
// 表情・首輪・成長段階の切り替えは style.css の .kotora-wrap[data-*] が
// kt-* クラスを display/animation で操作して実現している。
// つまり「同じ kt-* クラスを持つSVG」でさえあれば、どのキャラでも
// 8表情も首輪のティアもそのまま効く。ここはその契約を守るための場所。
//
// 表情の要になる部分（目・口・眉）は下の共通関数から生成する。
// キャラごとに手書きすると、新しい子を足したとき happy の目だけ作り忘れて
// 「笑わないキャラ」が静かに生まれるため。
// 毛色は .kotora-wrap[data-mascot="..."] で --mascot-* を上書きする。

// 目。open（既定）/ happy / sad / star の4種をまとめて作る。
function mascotEyes({ x = [108, 212], y = 205, r = 31 } = {}) {
  const eye = (cx) => `
      <g class="kt-eye">
        <circle cx="${cx}" cy="${y}" r="${r}" fill="#3A2417"/>
        <circle cx="${cx}" cy="${y}" r="${r - 4}" fill="var(--mascot-eye)"/>
        <circle class="kt-pupil" cx="${cx}" cy="${y + 3}" r="${Math.round(r * 0.52)}" fill="#2A1710"/>
        <circle cx="${cx - 9}" cy="${y - 9}" r="${Math.round(r * 0.28)}" fill="#FFFFFF"/>
        <circle cx="${cx + 9}" cy="${y + 10}" r="${Math.round(r * 0.13)}" fill="#FFFFFF" opacity="0.95"/>
        <circle cx="${cx + 5}" cy="${y - 13}" r="2.4" fill="#FFFFFF" opacity="0.8"/>
      </g>`;
  const [l, rr] = x;
  return `
  <g class="kt-eyes">
    <g class="kt-eyes-open">${eye(l)}${eye(rr)}</g>
    <g class="kt-eyes-happy" fill="none" stroke="#3A2417" stroke-width="10" stroke-linecap="round" display="none">
      <path d="M ${l - 24} ${y + 7} Q ${l} ${y - 19} ${l + 24} ${y + 7}"/>
      <path d="M ${rr - 24} ${y + 7} Q ${rr} ${y - 19} ${rr + 24} ${y + 7}"/>
    </g>
    <g class="kt-eyes-sad" display="none">
      <ellipse cx="${l}" cy="${y + 7}" rx="${r - 6}" ry="11" fill="#3A2417"/>
      <ellipse cx="${rr}" cy="${y + 7}" rx="${r - 6}" ry="11" fill="#3A2417"/>
      <circle cx="${l - 8}" cy="${y + 4}" r="3.5" fill="#FFFFFF" opacity="0.85"/>
      <circle cx="${rr - 8}" cy="${y + 4}" r="3.5" fill="#FFFFFF" opacity="0.85"/>
    </g>
    <g class="kt-eyes-star" fill="var(--gold)" display="none">
      <path transform="translate(${l} ${y + 1})" d="M 0 -20 Q 4 -4 20 0 Q 4 4 0 20 Q -4 4 -20 0 Q -4 -4 0 -20 Z"/>
      <path transform="translate(${rr} ${y + 1})" d="M 0 -20 Q 4 -4 20 0 Q 4 4 0 20 Q -4 4 -20 0 Q -4 -4 0 -20 Z"/>
    </g>
  </g>`;
}

// 眉。sad / angry のときだけCSSが表示する。
function mascotBrows({ x = [108, 212], y = 160 } = {}) {
  const [l, r] = x;
  return `
  <path class="kt-brow kt-brow-l" d="M ${l - 24} ${y} Q ${l} ${y - 8} ${l + 24} ${y - 2}"
        fill="none" stroke="var(--mascot-fur-dark)" stroke-width="8" stroke-linecap="round" display="none"/>
  <path class="kt-brow kt-brow-r" d="M ${r + 24} ${y} Q ${r} ${y - 8} ${r - 24} ${y - 2}"
        fill="none" stroke="var(--mascot-fur-dark)" stroke-width="8" stroke-linecap="round" display="none"/>`;
}

// 口。smile（既定）/ open / frown。
function mascotMouth({ x = 160, y = 255 } = {}) {
  return `
  <path class="kt-mouth-smile" d="M ${x} ${y} C ${x} ${y + 7} ${x - 6} ${y + 10} ${x - 12} ${y + 7} M ${x} ${y} C ${x} ${y + 7} ${x + 6} ${y + 10} ${x + 12} ${y + 7}"
        fill="none" stroke="#8A5A3B" stroke-width="4.5" stroke-linecap="round"/>
  <g class="kt-mouth-open" display="none">
    <path d="M ${x - 13} ${y + 4} Q ${x} ${y + 1} ${x + 13} ${y + 4} Q ${x + 11} ${y + 23} ${x} ${y + 25} Q ${x - 11} ${y + 23} ${x - 13} ${y + 4} Z" fill="#9C4F42"/>
    <ellipse cx="${x}" cy="${y + 19}" rx="8.5" ry="4.5" fill="#F4998C"/>
  </g>
  <path class="kt-mouth-frown" d="M ${x - 12} ${y + 13} Q ${x} ${y + 4} ${x + 12} ${y + 13}"
        fill="none" stroke="#8A5A3B" stroke-width="4.5" stroke-linecap="round" display="none"/>`;
}

// ほっぺ。happy のとき濃くなる。
function mascotCheeks({ x = [84, 236], y = 242, rx = 17, ry = 10 } = {}) {
  return `
  <ellipse class="kt-cheek kt-cheek-l" cx="${x[0]}" cy="${y}" rx="${rx}" ry="${ry}" fill="#F9A8A0" opacity="0.55"/>
  <ellipse class="kt-cheek kt-cheek-r" cx="${x[1]}" cy="${y}" rx="${rx}" ry="${ry}" fill="#F9A8A0" opacity="0.55"/>`;
}

// 首輪。tier で色が変わり、diamond だけチャームが光る。
function mascotCollar() {
  return `
  <g class="kt-collar-group">
    <path class="kt-collar" d="M 102 286 Q 160 316 218 286 L 224 304 Q 160 336 96 304 Z"
          fill="var(--mascot-collar)"/>
    <circle class="kt-collar-charm" cx="160" cy="328" r="9" fill="var(--mascot-collar-gold)" display="none"/>
  </g>`;
}

// ── Akita（秋田犬）───────────────────────────────────────────────────────────
// 柴犬寄り。垂れ気味の耳とくるんと巻いたしっぽで、猫との違いを出す。
function akitaSvg() {
  return `
<svg class="kotora-img" viewBox="0 0 320 480" xmlns="http://www.w3.org/2000/svg"
     role="img" aria-label="秋田犬" preserveAspectRatio="xMidYMax meet">

  <!-- しっぽ（くるんと巻く） -->
  <g class="kt-tail">
    <path d="M 238 410 C 292 400, 300 332, 258 322 C 232 316, 226 344, 248 350"
          fill="none" stroke="var(--mascot-fur)" stroke-width="26" stroke-linecap="round"/>
    <path d="M 252 348 C 238 344, 236 330, 248 326"
          fill="none" stroke="var(--mascot-fur-light)" stroke-width="14" stroke-linecap="round" opacity="0.9"/>
  </g>

  <g class="kt-body">
    <path d="M 160 284 C 103 290, 76 342, 74 396 C 73 433, 104 449, 160 449
             C 216 449, 247 433, 246 396 C 244 342, 217 290, 160 284 Z"
          fill="var(--mascot-fur)"/>
  </g>

  <ellipse class="kt-chest" cx="160" cy="382" rx="54" ry="60" fill="var(--mascot-fur-light)"/>

  <g class="kt-paws">
    <ellipse cx="126" cy="439" rx="26" ry="15" fill="var(--mascot-fur-light)"/>
    <ellipse cx="194" cy="439" rx="26" ry="15" fill="var(--mascot-fur-light)"/>
    <g stroke="var(--mascot-fur-dark)" stroke-width="3.5" stroke-linecap="round" opacity="0.28">
      <path d="M 119 432 L 119 444"/><path d="M 133 432 L 133 444"/>
      <path d="M 187 432 L 187 444"/><path d="M 201 432 L 201 444"/>
    </g>
  </g>

  <!-- 耳（やや垂れた三角） -->
  <g class="kt-ear kt-ear-l">
    <path d="M 48 132 Q 36 58 74 44 Q 112 62 134 96 Q 90 112 48 132 Z" fill="var(--mascot-fur)"/>
    <path d="M 66 116 Q 60 72 78 60 Q 100 76 116 98 Q 90 106 66 116 Z" fill="var(--mascot-ear-inner)"/>
  </g>
  <g class="kt-ear kt-ear-r">
    <path d="M 272 132 Q 284 58 246 44 Q 208 62 186 96 Q 230 112 272 132 Z" fill="var(--mascot-fur)"/>
    <path d="M 254 116 Q 260 72 242 60 Q 220 76 204 98 Q 230 106 254 116 Z" fill="var(--mascot-ear-inner)"/>
  </g>

  <ellipse class="kt-head" cx="160" cy="192" rx="120" ry="106" fill="var(--mascot-fur)"/>

  <!-- 眉の上の白い斑（柴犬らしさ） -->
  <g class="kt-face-stripes" fill="var(--mascot-fur-light)" opacity="0.75">
    <ellipse cx="112" cy="162" rx="15" ry="9"/>
    <ellipse cx="208" cy="162" rx="15" ry="9"/>
  </g>

  <!-- 口元（犬は広め） -->
  <ellipse class="kt-muzzle" cx="160" cy="258" rx="54" ry="32" fill="var(--mascot-fur-light)"/>

  ${mascotCheeks({ x: [80, 240], y: 238 })}
  ${mascotEyes({ y: 203 })}
  ${mascotBrows({ y: 158 })}

  <!-- 鼻（犬は大きめ） -->
  <path class="kt-nose" d="M 146 240 Q 160 233 174 240 Q 170 254 160 257 Q 150 254 146 240 Z"
        fill="#4A3228"/>

  ${mascotMouth({ y: 257 })}

  <g class="kt-whiskers" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" opacity="0.5">
    <path d="M 100 252 Q 78 250 64 244"/>
    <path d="M 220 252 Q 242 250 256 244"/>
  </g>

  ${mascotCollar()}
</svg>`;
}

// ── Kuma（くま）───────────────────────────────────────────────────────────
// 丸い小さな耳と短いマズル。角を徹底して丸くし、どっしり優しい印象にする。
function kumaSvg() {
  return `
<svg class="kotora-img" viewBox="0 0 320 480" xmlns="http://www.w3.org/2000/svg"
     role="img" aria-label="くま" preserveAspectRatio="xMidYMax meet">

  <!-- しっぽ（小さく丸い） -->
  <g class="kt-tail">
    <circle cx="252" cy="404" r="20" fill="var(--mascot-fur)"/>
  </g>

  <g class="kt-body">
    <path d="M 160 280 C 96 288, 66 342, 66 398 C 66 436, 100 452, 160 452
             C 220 452, 254 436, 254 398 C 254 342, 224 288, 160 280 Z"
          fill="var(--mascot-fur)"/>
  </g>

  <ellipse class="kt-chest" cx="160" cy="384" rx="58" ry="62" fill="var(--mascot-fur-light)"/>

  <g class="kt-paws">
    <ellipse cx="122" cy="441" rx="28" ry="16" fill="var(--mascot-fur-light)"/>
    <ellipse cx="198" cy="441" rx="28" ry="16" fill="var(--mascot-fur-light)"/>
    <g fill="var(--mascot-fur-dark)" opacity="0.22">
      <circle cx="112" cy="436" r="3.5"/><circle cx="122" cy="433" r="3.5"/><circle cx="132" cy="436" r="3.5"/>
      <circle cx="188" cy="436" r="3.5"/><circle cx="198" cy="433" r="3.5"/><circle cx="208" cy="436" r="3.5"/>
    </g>
  </g>

  <!-- 耳（丸く小さく、頭の上に） -->
  <g class="kt-ear kt-ear-l">
    <circle cx="70" cy="118" r="42" fill="var(--mascot-fur)"/>
    <circle cx="74" cy="122" r="23" fill="var(--mascot-ear-inner)"/>
  </g>
  <g class="kt-ear kt-ear-r">
    <circle cx="250" cy="118" r="42" fill="var(--mascot-fur)"/>
    <circle cx="246" cy="122" r="23" fill="var(--mascot-ear-inner)"/>
  </g>

  <ellipse class="kt-head" cx="160" cy="196" rx="126" ry="108" fill="var(--mascot-fur)"/>

  <!-- 口元（くまは短く丸い） -->
  <ellipse class="kt-muzzle" cx="160" cy="256" rx="50" ry="36" fill="var(--mascot-fur-light)"/>

  ${mascotCheeks({ x: [76, 244], y: 232, rx: 19, ry: 11 })}
  ${mascotEyes({ x: [112, 208], y: 198, r: 28 })}
  ${mascotBrows({ x: [112, 208], y: 156 })}

  <path class="kt-nose" d="M 146 238 Q 160 231 174 238 Q 170 252 160 255 Q 150 252 146 238 Z"
        fill="#4A3228"/>

  ${mascotMouth({ y: 255 })}

  ${mascotCollar()}
</svg>`;
}

// ── 登録簿 ────────────────────────────────────────────────────────────────
// unlock はレベル。XPは L2:100 から ×1.35 で増えるので、既存の節目
// （Lv4 シルバー/young、Lv7 ゴールド、Lv8 adult、Lv10 ダイヤ）と
// ぶつからない 5 と 9 に置いて、続けるご褒美が途切れないようにする。
// art: 採用したイラスト（character/<key>/*.webp）が揃っているか。
// 素材を置いたらここを true にする。scripts/check-mascot-art.mjs が
// フラグと実ファイルの食い違いを検出するので、片方だけ直すと落ちる。
// 素材が無い／読み込めないあいだはSVGで描く（無表情で固まらせない）。
const MASCOTS = {
  neko:  { key: 'neko',  unlock: 1, art: true , svg: () => kotoraSvg() },
  akita: { key: 'akita', unlock: 5, art: false, svg: () => akitaSvg() },
  kuma:  { key: 'kuma',  unlock: 9, art: false, svg: () => kumaSvg() },
};
const MASCOT_ORDER = ['neko', 'akita', 'kuma'];
const MASCOT_DEFAULT = 'neko';

// 表情の画像。idle のまばたき用に blink も持つ。
const MASCOT_FACES_ART = [
  'normal', 'blink', 'smile', 'happy', 'sparkle',
  'thinking', 'troubled', 'sleepy', 'wave',
];

// 既存の mood（CSSが使う8種）を「どの表情画像で、どう動かすか」に対応させる。
// 呼び出し側（mascotApply('quiz-mascot','delighted') など6箇所）は変更不要。
const MASCOT_MOODS = {
  idle:      { face: 'normal',   motion: 'breathe', blink: true },
  excited:   { face: 'happy',    motion: 'bounce' },
  delighted: { face: 'sparkle',  motion: 'jump'   },
  happy:     { face: 'smile',    motion: 'bounce' },
  sad:       { face: 'troubled', motion: 'tilt'   },
  angry:     { face: 'troubled', motion: 'shake'  },
  levelup:   { face: 'sparkle',  motion: 'jump'   },
  badge:     { face: 'happy',    motion: 'jump'   },
  thinking:  { face: 'thinking', motion: 'tilt'   },
  sleeping:  { face: 'sleepy',   motion: 'breathe-slow' },
  wave:      { face: 'wave',     motion: 'sway'   },
};

function mascotFaceSrc(key, face) {
  return `character/${key}/${face}.webp`;
}

function mascotUnlocked(key, level) {
  const m = MASCOTS[key];
  return !!m && level >= m.unlock;
}

// 相棒は端末ごとの設定としてlocalStorageに持つ。
// profilesに列を足すと手動マイグレーションが必要になるため（vocabImagesと同じ理由）。
// デザインシートの正式名に合わせてキーを変えたので、前の名前も読み替える。
// 読み替えないと、選んでいた相棒が黙って既定に戻る。
const MASCOT_RENAMED = { kotora: 'neko', hachi: 'akita', moko: 'kuma' };

function currentMascotKey(level) {
  const raw = (typeof LS !== 'undefined' && LS.get) ? LS.get('mascot') : null;
  const saved = MASCOT_RENAMED[raw] || raw;
  // 保存されていても、まだ解放されていなければ既定に戻す
  if (saved && MASCOTS[saved] && mascotUnlocked(saved, level)) return saved;
  return MASCOT_DEFAULT;
}

function setMascotKey(key) {
  if (MASCOTS[key] && typeof LS !== 'undefined' && LS.set) LS.set('mascot', key);
}

function mascotSvgFor(key) {
  const m = MASCOTS[key] || MASCOTS[MASCOT_DEFAULT];
  return m.svg();
}

// 採用イラストで描く。表情は画像、動きはCSS（.kt-art[data-motion]）。
function mascotArtHtml(key, mood) {
  const conf = MASCOT_MOODS[mood] || MASCOT_MOODS.idle;
  const blink = conf.blink ? ` data-blink="${mascotFaceSrc(key, 'blink')}"` : '';
  return `<div class="kt-art" data-motion="${conf.motion}"${blink}>`
    + `<img class="kt-art-img" src="${mascotFaceSrc(key, conf.face)}" alt=""`
    + ` draggable="false" onerror="mascotArtFailed(this)" /></div>`;
}

// 素材が揃っていればイラスト、無ければSVG。
function mascotBodyHtml(key, mood) {
  const m = MASCOTS[key] || MASCOTS[MASCOT_DEFAULT];
  return m.art ? mascotArtHtml(m.key, mood) : m.svg();
}

// 画像が読めなかったときの逃げ道。1枚でも落ちたらそのキャラはSVGに戻す
// （一部だけ欠けた見た目にしない）。
function mascotArtFailed(img) {
  const art = img.closest('.kt-art');
  const wrap = art && art.closest('.kotora-wrap');
  if (!wrap) return;
  const key = wrap.dataset.mascot;
  if (MASCOTS[key]) MASCOTS[key].art = false;
  wrap.innerHTML = mascotSvgFor(key);
}
