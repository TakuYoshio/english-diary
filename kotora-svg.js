'use strict';

// ── コトラSVG本体 ─────────────────────────────────────────────────────────────
// kotora.png と同じ 320x480 の viewBox でパーツ化したインラインSVGを返す。
// チビ頭身（頭が全高の6割強）・大きなうるうる目・小さな口の「かわいい」設計。
// 表情(mood)・首輪ティア(tier)・成長段階(stage)の見た目切替はすべて style.css の
// .kotora-wrap[data-*] セレクタ側で行うため、この関数は状態を受け取らない。
// 制約: 同一画面に複数インスタンスが並ぶため SVG 内で id は使わない（class のみ）。

function kotoraSvg() {
  return `
<svg class="kotora-img" viewBox="0 0 320 480" xmlns="http://www.w3.org/2000/svg"
     role="img" aria-label="コトラ" preserveAspectRatio="xMidYMax meet">

  <!-- しっぽ（胴体の後ろ） -->
  <g class="kt-tail">
    <path d="M 232 420 C 284 408, 294 348, 274 312"
          fill="none" stroke="var(--mascot-fur)" stroke-width="24" stroke-linecap="round"/>
    <path d="M 288 372 C 289 363, 288 355, 286 347"
          fill="none" stroke="var(--mascot-fur-dark)" stroke-width="24" stroke-linecap="butt" opacity="0.75"/>
    <path d="M 278 326 C 276 320, 275 316, 274 312"
          fill="none" stroke="var(--mascot-fur-dark)" stroke-width="24" stroke-linecap="round" opacity="0.8"/>
  </g>

  <!-- 胴体（小さめ・ずんぐり） -->
  <g class="kt-body">
    <path d="M 160 282 C 105 288, 78 340, 76 395 C 75 432, 105 448, 160 448
             C 215 448, 245 432, 244 395 C 242 340, 215 288, 160 282 Z"
          fill="var(--mascot-fur)"/>
    <ellipse cx="98"  cy="398" rx="24" ry="36" fill="var(--mascot-fur-dark)" opacity="0.10" transform="rotate(10 98 398)"/>
    <ellipse cx="222" cy="398" rx="24" ry="36" fill="var(--mascot-fur-dark)" opacity="0.10" transform="rotate(-10 222 398)"/>
  </g>

  <!-- 胴体の縞 -->
  <g class="kt-stripes" fill="none" stroke="var(--mascot-fur-dark)" stroke-width="9" stroke-linecap="round" opacity="0.65">
    <path d="M 82 350 Q 98 353 108 363"/>
    <path d="M 78 382 Q 96 386 106 396"/>
    <path d="M 80 412 Q 96 415 106 424"/>
    <path d="M 238 350 Q 222 353 212 363"/>
    <path d="M 242 382 Q 224 386 214 396"/>
    <path d="M 240 412 Q 224 415 214 424"/>
  </g>

  <!-- 胸元 -->
  <ellipse class="kt-chest" cx="160" cy="378" rx="50" ry="58" fill="var(--mascot-fur-light)"/>

  <!-- 前足 -->
  <g class="kt-paws">
    <ellipse cx="128" cy="438" rx="25" ry="14" fill="var(--mascot-fur-light)"/>
    <ellipse cx="192" cy="438" rx="25" ry="14" fill="var(--mascot-fur-light)"/>
    <g stroke="var(--mascot-fur-dark)" stroke-width="3.5" stroke-linecap="round" opacity="0.3">
      <path d="M 121 431 L 121 443"/><path d="M 135 431 L 135 443"/>
      <path d="M 185 431 L 185 443"/><path d="M 199 431 L 199 443"/>
    </g>
  </g>

  <!-- 耳（頭より先に描いて根元を頭で隠す） -->
  <g class="kt-ear kt-ear-l">
    <path d="M 52 128 Q 48 52 80 36 Q 120 50 142 82 Q 96 104 52 128 Z" fill="var(--mascot-fur)"/>
    <path d="M 68 112 Q 70 66 82 52 Q 106 66 122 86 Q 94 100 68 112 Z" fill="var(--mascot-ear-inner)"/>
  </g>
  <g class="kt-ear kt-ear-r">
    <path d="M 268 128 Q 272 52 240 36 Q 200 50 178 82 Q 224 104 268 128 Z" fill="var(--mascot-fur)"/>
    <path d="M 252 112 Q 250 66 238 52 Q 214 66 198 86 Q 226 100 252 112 Z" fill="var(--mascot-ear-inner)"/>
  </g>

  <!-- 頭（大きく＝チビ頭身） -->
  <ellipse class="kt-head" cx="160" cy="190" rx="118" ry="105" fill="var(--mascot-fur)"/>

  <!-- 頭の縞 -->
  <g class="kt-head-stripes" fill="none" stroke="var(--mascot-fur-dark)" stroke-width="11" stroke-linecap="round" opacity="0.7">
    <path d="M 140 94 Q 141 108 143 120"/>
    <path d="M 160 90 Q 160 106 160 122"/>
    <path d="M 180 94 Q 179 108 177 120"/>
  </g>
  <g class="kt-stripes-adult" fill="none" stroke="var(--mascot-fur-dark)" stroke-width="9" stroke-linecap="round" opacity="0.65" display="none">
    <path d="M 118 100 Q 120 111 123 121"/>
    <path d="M 202 100 Q 200 111 197 121"/>
  </g>
  <g class="kt-face-stripes" fill="none" stroke="var(--mascot-fur-dark)" stroke-width="8" stroke-linecap="round" opacity="0.55">
    <path d="M 46 192 Q 60 193 72 197"/>
    <path d="M 50 220 Q 63 220 74 223"/>
    <path d="M 274 192 Q 260 193 248 197"/>
    <path d="M 270 220 Q 257 220 246 223"/>
  </g>

  <!-- 口元の白いマズル -->
  <ellipse class="kt-muzzle" cx="160" cy="262" rx="44" ry="27" fill="var(--mascot-fur-light)"/>

  <!-- ほっぺ -->
  <ellipse class="kt-cheek kt-cheek-l" cx="84"  cy="242" rx="17" ry="10" fill="#F9A8A0" opacity="0.55"/>
  <ellipse class="kt-cheek kt-cheek-r" cx="236" cy="242" rx="17" ry="10" fill="#F9A8A0" opacity="0.55"/>

  <!-- 目（mood で変形/差し替え。open がデフォルト） -->
  <g class="kt-eyes">
    <g class="kt-eyes-open">
      <g class="kt-eye">
        <circle cx="108" cy="205" r="31" fill="#3A2417"/>
        <circle cx="108" cy="205" r="27" fill="var(--mascot-eye)"/>
        <circle class="kt-pupil" cx="108" cy="208" r="16" fill="#2A1710"/>
        <circle cx="99" cy="196" r="8.5" fill="#FFFFFF"/>
        <circle cx="117" cy="215" r="4" fill="#FFFFFF" opacity="0.95"/>
        <circle cx="113" cy="192" r="2.4" fill="#FFFFFF" opacity="0.8"/>
      </g>
      <g class="kt-eye">
        <circle cx="212" cy="205" r="31" fill="#3A2417"/>
        <circle cx="212" cy="205" r="27" fill="var(--mascot-eye)"/>
        <circle class="kt-pupil" cx="212" cy="208" r="16" fill="#2A1710"/>
        <circle cx="203" cy="196" r="8.5" fill="#FFFFFF"/>
        <circle cx="221" cy="215" r="4" fill="#FFFFFF" opacity="0.95"/>
        <circle cx="217" cy="192" r="2.4" fill="#FFFFFF" opacity="0.8"/>
      </g>
    </g>
    <g class="kt-eyes-happy" fill="none" stroke="#3A2417" stroke-width="10" stroke-linecap="round" display="none">
      <path d="M 84 212 Q 108 186 132 212"/>
      <path d="M 188 212 Q 212 186 236 212"/>
    </g>
    <g class="kt-eyes-sad" display="none">
      <ellipse cx="108" cy="212" rx="25" ry="11" fill="#3A2417"/>
      <ellipse cx="212" cy="212" rx="25" ry="11" fill="#3A2417"/>
      <circle cx="100" cy="209" r="3.5" fill="#FFFFFF" opacity="0.85"/>
      <circle cx="204" cy="209" r="3.5" fill="#FFFFFF" opacity="0.85"/>
    </g>
    <g class="kt-eyes-star" fill="var(--gold)" display="none">
      <path transform="translate(108 206)" d="M 0 -20 Q 4 -4 20 0 Q 4 4 0 20 Q -4 4 -20 0 Q -4 -4 0 -20 Z"/>
      <path transform="translate(212 206)" d="M 0 -20 Q 4 -4 20 0 Q 4 4 0 20 Q -4 4 -20 0 Q -4 -4 0 -20 Z"/>
    </g>
  </g>

  <!-- 眉（sad/angry のときだけ表示） -->
  <path class="kt-brow kt-brow-l" d="M 84 160 Q 108 152 132 158"
        fill="none" stroke="var(--mascot-fur-dark)" stroke-width="8" stroke-linecap="round" display="none"/>
  <path class="kt-brow kt-brow-r" d="M 236 160 Q 212 152 188 158"
        fill="none" stroke="var(--mascot-fur-dark)" stroke-width="8" stroke-linecap="round" display="none"/>

  <!-- 鼻（小さく） -->
  <path class="kt-nose" d="M 151 243 Q 160 238 169 243 Q 166 253 160 255 Q 154 253 151 243 Z"
        fill="var(--mascot-nose)"/>

  <!-- 口（smile / open / frown を display 切替。小さめが可愛い） -->
  <path class="kt-mouth-smile" d="M 160 255 C 160 262 154 265 148 262 M 160 255 C 160 262 166 265 172 262"
        fill="none" stroke="#8A5A3B" stroke-width="4.5" stroke-linecap="round"/>
  <g class="kt-mouth-open" display="none">
    <path d="M 147 259 Q 160 256 173 259 Q 171 278 160 280 Q 149 278 147 259 Z" fill="#9C4F42"/>
    <ellipse cx="160" cy="274" rx="8.5" ry="4.5" fill="#F4998C"/>
  </g>
  <path class="kt-mouth-frown" d="M 148 268 Q 160 259 172 268"
        fill="none" stroke="#8A5A3B" stroke-width="4.5" stroke-linecap="round" display="none"/>

  <!-- ヒゲ（短く控えめ） -->
  <g class="kt-whiskers" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" opacity="0.85">
    <path d="M 92 250 Q 68 246 52 238"/>
    <path d="M 94 262 Q 70 262 54 260"/>
    <path d="M 228 250 Q 252 246 268 238"/>
    <path d="M 226 262 Q 250 262 266 260"/>
  </g>

  <!-- 首輪（tier で色替え、diamond はチャーム発光） -->
  <g class="kt-collar-group">
    <path class="kt-collar" d="M 102 286 Q 160 316 218 286 L 224 304 Q 160 336 96 304 Z"
          fill="var(--mascot-collar)"/>
    <circle class="kt-collar-charm" cx="160" cy="328" r="9" fill="var(--mascot-collar-gold)" display="none"/>
  </g>
</svg>`;
}
