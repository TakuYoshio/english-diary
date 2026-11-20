# キャラクターイラストの元データ

`character/<key>/*.webp` を作る元になったPNG。やり直せるように残している。

```
# WebPへの変換（この環境では ImageMagick を使った）
convert Task/art-source/neko/normal.png -quality 85 \
  -define webp:alpha-quality=100 character/neko/normal.webp
```

`scripts/check-mascot-art.mjs` はこちらのPNGを見て、
**本体から切り離された塊**（背景を抜いたときの消し残し）を検出する。
WebPは自前でデコードできないので、検査は変換前のPNGに対して行う。

## 手を入れた記録

### neko（2026-11-08 受領ぶん）

納品された9枚のうち4枚に、本体から切り離されたかけらが浮いていた。
いずれも体の反対側に完全なしっぽ・耳が別途あり、明らかな消し残し。
目視で確認したうえで、`scripts/strip-stray-blobs.mjs` で該当する
連結成分だけを透明化した（矩形で塗ると本体を削るため）。

| ファイル | 消した塊 | 正体 |
|---|---|---|
| sparkle  | 576px  (x425-434, y406-485) | しっぽ |
| thinking | 1394px (x417-434, y393-500) | しっぽ |
| troubled | 2500px (x407-434, y383-506) | しっぽ |
| sleepy   | 4333px (x394-434, y377-516) | しっぽ |
| sleepy   | 783px  (x423-434, y141-229) | 耳の先 |

頭の上の塊（happy の `!!`、sparkle の `✨`、thinking の `?`、
sleepy の `zZ`、wave の `!!`）は意図した効果線なので残してある。
位置だけで機械的に切ると効果線まで消えるので、検査も
「下半分にある離れた塊」だけをエラーにしている。

**次に素材を依頼するときは、背景の抜き残しが無いことを条件に加えること。**
