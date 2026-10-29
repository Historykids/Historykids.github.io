# Online Sengoku old-country outlines

`japan-old-provinces.svg` follows the project owner's supplied reference image
`old-provincial-name-3000pixel-scaled.png` (1955 × 2048 pixels). The reference
raster itself is not included in the site repository. This is a visual update;
it does not change saved territory IDs, ownership, routes or battle rules.

The SVG contains one named path per game territory: the 68 pre-1868 provinces,
plus Ezo and Ryukyu. Province interiors were traced from the supplied image,
font-separated pieces and offshore islands were associated with their province,
and outlines were simplified to approximately one source pixel. Lake interiors
remain water. Ryukyu retains the reference image's inset layout.

Each path has `data-code` for the stable game ID and `data-label-x` /
`data-label-y` for its map label. Labels may intentionally sit off the coast for
small islands and are also clickable. The client copies only geometry and label
coordinates into its own interactive SVG. Routes and server ownership remain
those in `assets/ui/sengoku-kuni-map.js`.

These outlines are for game navigation, not surveying or exact reconstruction
of borders at a particular historical date.

## 世界版（2026-10-28）

`sengoku-world.svg` combines the existing 70 Japanese outlines with 40 overseas game areas derived from the second owner-supplied reference, 「18世紀後半の世界地図（投稿用）-1.jpeg」. Coastlines are simplified; obstructing caption boxes are removed and unclear outlines are redrawn. All original raster files remain outside the repository. Overseas ownership begins neutral regardless of the reference's imperial colors. Japanese province paths are transformed into the atlas projection; Ryukyu moves from its old inset to the island-chain area. The composite deliberately combines different eras and uses simplified game borders/routes, rather than reproducing one historical political map. It does not assert current boundaries or sovereignty.


## 現代の海外区分（2026-10-29、現行仕様）

海外はNatural Earth 1:50m admin-0の241国・地域へ更新し、日本は同じ70旧国を保持。古地図風のCSS・色・書体を保持し、海外の国境と呼称だけを現在の区分へ変更した。日本の領域は同じ元輪郭をアトラスの緯度方向へ変換して配置。自然地理の輪郭を簡略化し、小国や島もセレクトで選択できる。

Source: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_0_countries.geojson
Terms (public domain): https://www.naturalearthdata.com/about/terms-of-use/

`modern-country-assignments.json` に元データのSHA-256と旧40領地への割り当てを記録。再生成は `python3 scripts/build-modern-world.py /path/to/ne_50m_admin_0_countries.geojson`。提供された参考画像自体は公開ファイルに含めない。
