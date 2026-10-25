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
