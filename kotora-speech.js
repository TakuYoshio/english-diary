'use strict';

// ── コトラの吹き出し（話しかけ）システム ──────────────────────────────────────
// kotoraSay(slotId, lineKey, opts) でマスコットスロットの上に吹き出しを表示する。
// mascotSetMood 系は slot.innerHTML を丸ごと置換するため、吹き出しは slot の
// 「兄弟要素」として生成し data-kt-bubble-for で管理する（innerHTML置換に耐える）。
// 口パク用の .kt-talking も wrap ではなく slot 側に付ける（同じ理由）。
// セリフは TRANSLATIONS と混ぜず専用辞書（1キー複数バリエーションのランダム再生）。

const KOTORA_LINES = {
  ja: {
    'greet-morning': [
      'おはよう！今日も一緒にがんばるにゃ🐾',
      'おはよう！朝の日記は気持ちいいよ☀️',
      'おはよう〜！今日も英語で書いてみよう！',
    ],
    'greet-afternoon': [
      'こんにちは！ひと息ついたら日記タイム🐾',
      'おかえり！今日はどんな一日だった？',
      'こんにちは！単語の復習も忘れずにね〜',
    ],
    'greet-evening': [
      'こんばんは！今日の出来事を聞かせてにゃ🌙',
      'おつかれさま！寝る前に3行だけでも書こう',
      'こんばんは〜今日も来てくれてうれしい！',
    ],
    'greet-streak': [
      '{n}日連続！すごいにゃ🔥',
      'ストリーク{n}日目！その調子！🔥',
    ],
    'step1-guide': [
      'まずは日本語でOK！今日のことを自由に書こう',
      '今日あったこと、なんでも書いてにゃ📝',
    ],
    'step2-guide': [
      '辞書なしで挑戦！わからない単語はメモでOK',
      '完璧じゃなくていいんだにゃ。まずは自力で！',
    ],
    'step3-guide': [
      'わからなかった単語を調べよう🔍',
      '新しい単語はぜんぶ宝物にゃ✨',
    ],
    'step4-guide': [
      '単語ヒントを使ってもう一度英訳してみよう！',
      'さっきよりきっと上手く書けるにゃ💪',
    ],
    'step5-done': [
      '添削が届いたよ！じっくり読んでみて📮',
      'ナイスチャレンジ！フィードバックを見てみよう',
    ],
    'shadow-goal': [
      'シャドーイング達成！発音もチェックしてみよう🎤',
      'たくさん声に出せたにゃ〜！えらい！',
    ],
    'quiz-ok': ['正解！さすがにゃ✨', 'いいね、その調子！', '完璧〜！🎉'],
    'quiz-ng': ['おしい！次はいけるにゃ', '間違いは覚えるチャンス！', 'ドンマイ！もう一度見てみよう'],
    'save-done': ['日記を保存したよ！今日もえらいにゃ🎉', '今日の記録、ばっちり保存！'],
    'save-streak': ['ストリーク更新🔥この調子で続けよう！'],
    'save-levelup': ['レベルアップ🎉どんどん成長してるにゃ！'],
    'save-badge': ['新しいバッジをゲット🏅おめでとう！'],
    'solo-intro': [
      '英語だけの時間、つくってみようにゃ🎙',
      '今日はどれくらい話す？無理のない長さでいいよ😺',
    ],
    'solo-start': ['はじめよう！まちがえてもぜんぜんOK🐾', 'いってみよう！聞いてるにゃ👂'],
    'solo-prompt-next': ['次のお題だにゃ！', 'つぎはこれ、どう？'],
    'solo-milestone': ['{n}分経過！いい調子にゃ🔥', 'もう{n}分も話してる！すごい✨'],
    'solo-silence': [
      '止まっちゃった？お題を変えてもいいよ🐾',
      'なんでもいいから声に出してみよう😺',
      'ゆっくりでいいにゃ。思いついたことから！',
    ],
    'weak-graduate': [
      '「{word}」ついに覚えたにゃ🎉',
      '苦手だった「{word}」を克服！えらい✨',
    ],
    'weekly-ready': [
      '先週のレポートができたよ📮 見てみる？',
      '先週のがんばり、まとめておいたにゃ📮',
    ],
    'weekly-great': [
      '先週は最高だったにゃ🔥 この調子！',
      'よくがんばったにゃ！自分をほめていいよ✨',
    ],
    'weekly-good': [
      'いい感じだったにゃ😊 今週も少しずつ！',
      '着実に進んでるにゃ🌱',
    ],
    'weekly-comeback': [
      '今週はまた書いてみようにゃ🐾 1日1行でもOK！',
      'ゆっくりでいいよ。また一緒にやろうにゃ😺',
    ],
  },
  en: {
    'greet-morning': [
      "Good morning! Let's do this together 🐾",
      'Morning! A fresh page is waiting ☀️',
      "Good morning! Let's write in English today!",
    ],
    'greet-afternoon': [
      'Hi there! Time for your diary 🐾',
      'Welcome back! How is your day going?',
      "Hello! Don't forget your word reviews~",
    ],
    'greet-evening': [
      'Good evening! Tell me about your day 🌙',
      'Nice to see you! Even 3 lines count',
      'Evening~ happy you came back!',
    ],
    'greet-streak': ['{n} days in a row! Amazing 🔥', 'Streak day {n}! Keep it up! 🔥'],
    'step1-guide': [
      'Start in Japanese — write anything about today!',
      'Anything that happened today works 📝',
    ],
    'step2-guide': [
      'Try it without a dictionary! Just note unknown words',
      "It doesn't have to be perfect. Give it a go!",
    ],
    'step3-guide': ['Look up the words you didn\'t know 🔍', 'Every new word is a treasure ✨'],
    'step4-guide': ['Translate again with your word hints!', "You'll do even better this time 💪"],
    'step5-done': ['Your corrections are here! Take a look 📮', 'Nice try! Check out the feedback'],
    'shadow-goal': ['Shadowing complete! Try the pronunciation check 🎤', 'You spoke so much — great job!'],
    'quiz-ok': ['Correct! Nice one ✨', "That's the spirit!", 'Perfect~! 🎉'],
    'quiz-ng': ['So close! Next time!', 'Mistakes help you remember!', 'No worries, take another look'],
    'save-done': ['Diary saved! Well done today 🎉', "Today's entry is safe and sound!"],
    'save-streak': ['Streak extended 🔥 Keep it going!'],
    'save-levelup': ["Level up 🎉 You're growing fast!"],
    'save-badge': ['New badge earned 🏅 Congrats!'],
    'solo-intro': [
      "Let's make some English-only time 🎙",
      'How long shall we go today? Any length is fine 😺',
    ],
    'solo-start': ["Here we go! Mistakes are totally fine 🐾", "I'm listening! 👂"],
    'solo-prompt-next': ['Next prompt!', 'How about this one?'],
    'solo-milestone': ['{n} minutes in! Going strong 🔥', "You've been talking for {n} minutes! ✨"],
    'solo-silence': [
      'Stuck? You can switch the prompt 🐾',
      'Just say anything out loud 😺',
      'Take your time. Start with whatever comes to mind!',
    ],
    'weak-graduate': [
      'You finally got "{word}"! 🎉',
      '"{word}" used to trip you up — not anymore ✨',
    ],
    'weekly-ready': [
      'Last week\'s report is ready 📮 Want to see it?',
      'I wrapped up last week for you 📮',
    ],
    'weekly-great': [
      'Last week was brilliant 🔥 Keep it going!',
      'You did great — give yourself credit ✨',
    ],
    'weekly-good': [
      'Solid week 😊 Let\'s keep chipping away!',
      'Steady progress 🌱',
    ],
    'weekly-comeback': [
      'Let\'s write again this week 🐾 Even one line counts!',
      'No rush. I\'m here whenever you\'re ready 😺',
    ],
  },
};

const _ktSaidOnce = new Set();
const _ktTimers = {};

function ktLine(key, vars) {
  const lang = (typeof getLang === 'function') ? getLang() : 'ja';
  const dict = KOTORA_LINES[lang] || KOTORA_LINES.ja;
  const v = dict[key] || KOTORA_LINES.ja[key];
  if (!v) return null;
  let text = Array.isArray(v) ? v[Math.floor(Math.random() * v.length)] : v;
  if (vars) for (const k of Object.keys(vars)) text = text.replaceAll('{' + k + '}', vars[k]);
  return text;
}

function kotoraSay(slotId, lineKey, opts = {}) {
  const slot = document.getElementById(slotId);
  if (!slot) return;
  // 非表示タブ/スロットには出さない（fixed要素はoffsetParentが常にnullなので除外）
  const slotFixed = getComputedStyle(slot).position === 'fixed';
  if (!slotFixed && slot.offsetParent === null) return;
  const text = ktLine(lineKey, opts.vars);
  if (!text) return;
  if (opts.once) {
    const onceKey = slotId + ':' + lineKey;
    if (_ktSaidOnce.has(onceKey)) return;
    _ktSaidOnce.add(onceKey);
  }

  let bubble = slot.parentElement.querySelector('[data-kt-bubble-for="' + slotId + '"]');
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.className = 'kt-bubble';
    bubble.setAttribute('data-kt-bubble-for', slotId);
    slot.insertAdjacentElement('afterend', bubble);
  }

  if (_ktTimers[slotId]) {
    clearInterval(_ktTimers[slotId].type);
    clearTimeout(_ktTimers[slotId].hide);
  }
  _ktTimers[slotId] = {};

  const reduced = (typeof fxReducedMotion === 'function') && fxReducedMotion();
  const useTypewriter = opts.typewriter !== false && !reduced;

  // 位置の判定に吹き出しの高さが要るので、先に本文を入れて測る。
  // タイプライター中に高さが縮まないよう、その高さを確保しておく
  // （1文字ごとに高さが跳ねるのも防げる）。minHeightは次に喋るときに外す。
  bubble.style.minHeight = '';
  bubble.textContent = text;
  _ktPositionBubble(slot, bubble);
  if (useTypewriter) {
    bubble.style.minHeight = bubble.offsetHeight + 'px';
    bubble.textContent = '';
  }
  bubble.classList.add('kt-bubble-in');

  const finish = () => {
    slot.classList.remove('kt-talking');
    const dur = opts.duration || Math.max(3200, 1800 + text.length * 60);
    _ktTimers[slotId].hide = setTimeout(() => kotoraDismiss(slotId), dur);
  };

  if (useTypewriter) {
    slot.classList.add('kt-talking');
    // 絵文字（サロゲートペア）を途中で切らないようコードポイント単位で刻む
    const chars = Array.from(text);
    let i = 0;
    _ktTimers[slotId].type = setInterval(() => {
      i++;
      bubble.textContent = chars.slice(0, i).join('');
      if (i >= chars.length) {
        clearInterval(_ktTimers[slotId].type);
        finish();
      }
    }, 34);
  } else {
    bubble.textContent = text;
    finish();
  }
}

const KT_GAP = 8;    // 吹き出しとマスコットの隙間（style.cssのtranslateと対応）
const KT_EDGE = 4;   // 覆ってはいけない要素・画面端との余白

// 吹き出しより上にある「覆ってはいけないもの」の下端を返す。
// stickyなヘッダーと、index.html で data-kt-keepout を付けた要素を見る。
// スロットごとの特例をJSに散らさないため、避ける場所はHTML側で宣言する。
function _ktTopLimit(slotTop, left, right) {
  let limit = 0;
  const header = document.querySelector('.header');
  if (header && getComputedStyle(header).position === 'sticky') {
    limit = Math.max(limit, header.getBoundingClientRect().bottom);
  }
  document.querySelectorAll('[data-kt-keepout]').forEach(el => {
    if (!el.getClientRects().length) return;          // 非表示タブのものは無視
    const k = el.getBoundingClientRect();
    if (k.bottom > slotTop) return;                   // スロットより下のものは無関係
    if (k.right <= left || k.left >= right) return;   // 吹き出しの横幅にかからない
    limit = Math.max(limit, k.bottom);
  });
  return limit + KT_EDGE;
}

// 位置: 基本はスロット上端の中央。上に収まらなければ下に回す（kt-bubble-below）。
// 判定は画面座標で行い、設置はスロットと同じ座標系で行う
// （position:fixed なスロット＝保存ポップアップは fixed、それ以外は
//  吹き出しがスロットの兄弟なので offsetParent が一致する）。
function _ktPositionBubble(slot, bubble) {
  const fixed = getComputedStyle(slot).position === 'fixed';
  const r = slot.getBoundingClientRect();
  const h = bubble.offsetHeight;
  // translateX(-50%)で中央寄せされるため、幅の半分+余白ぶん内側にクランプする
  const half = Math.min(bubble.offsetWidth, 280) / 2 + KT_GAP;
  const centerX = r.left + r.width / 2;
  const x = Math.min(Math.max(centerX, half), window.innerWidth - half);

  // 上端（スロット上端 + KT_EDGE からCSSで -100% - KT_GAP 持ち上がる）が
  // 上限ラインより下に収まるなら上、収まらないなら下に出す。
  const fitsAbove = (r.top - h - KT_EDGE) >= _ktTopLimit(r.top, x - half, x + half);
  bubble.classList.toggle('kt-bubble-below', !fitsAbove);

  if (fixed) {
    bubble.style.position = 'fixed';
    bubble.style.left = x + 'px';
    bubble.style.top = (fitsAbove ? r.top + KT_EDGE : r.bottom - KT_EDGE) + 'px';
  } else {
    bubble.style.position = 'absolute';
    bubble.style.left = (slot.offsetLeft + slot.offsetWidth / 2 + (x - centerX)) + 'px';
    bubble.style.top = (slot.offsetTop + (fitsAbove ? KT_EDGE : slot.offsetHeight - KT_EDGE)) + 'px';
  }
}

// 吹き出しは pointer-events: none なので、どこに出ても下のボタンは押せる。
// 「触れば消える」挙動だけをdocumentで受ける（スクロール開始でも消える）。
document.addEventListener('pointerdown', () => {
  const shown = document.querySelectorAll('.kt-bubble.kt-bubble-in');
  if (!shown.length) return;
  shown.forEach(b => kotoraDismiss(b.getAttribute('data-kt-bubble-for')));
}, { passive: true });

// 表示中の吹き出しはリサイズ時に追従させる（表示直後のレイアウト変動対策も兼ねる）。
// _ktPositionBubble は getComputedStyle / getBoundingClientRect を読むため
// レイアウトを強制する。モバイルではURLバーの出し入れでresizeが連続発火するので
// requestAnimationFrame で1フレーム1回にまとめる。
let _ktResizeFrame = null;
window.addEventListener('resize', () => {
  if (_ktResizeFrame) return;
  _ktResizeFrame = requestAnimationFrame(() => {
    _ktResizeFrame = null;
    document.querySelectorAll('.kt-bubble.kt-bubble-in').forEach(bubble => {
      const slot = document.getElementById(bubble.getAttribute('data-kt-bubble-for'));
      if (slot) _ktPositionBubble(slot, bubble);
    });
  });
});

function kotoraDismiss(slotId) {
  const slot = document.getElementById(slotId);
  if (slot) slot.classList.remove('kt-talking');
  if (_ktTimers[slotId]) {
    clearInterval(_ktTimers[slotId].type);
    clearTimeout(_ktTimers[slotId].hide);
  }
  const bubble = document.querySelector('[data-kt-bubble-for="' + slotId + '"]');
  if (bubble) bubble.classList.remove('kt-bubble-in');
}
