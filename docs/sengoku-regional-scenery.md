# Regional 3D scenery

`assets/ui/sengoku-scenery.js` adds original, procedural miniature architecture to the regular 311-territory atlas and the private Japan atlas. It does not fetch third-party models, change game state, or turn decorative landmarks into constructed castle entitlements. These are regional design motifs, not surveyed replicas or a reconstruction of one historical date.

Styles include Japanese keeps, temple towns, shrine grounds, northern timber villages, Ryukyu red roofs, East Asian towers, South Asian palaces, desert domes, Egyptian pyramids, European castles, Mediterranean columns, Andean stepped monuments, tropical harbors and polar stations. Vegetation, field plots, roads and coastal piers accompany the towns.

Placements are deterministic and constrained by the original land polygons, including holes. The terrain retains its original height fields and ownership colors. Shared geometries, materials and instanced meshes hold about 127,000 decorative parts in the full world. Camera-distance visibility reduces distant towns, roads and vegetation. The default **最高** setting uses up to 2x device resolution and tree shadows; **標準** reduces resolution, shadow workload and distant detail. Rendering remains driven by map interactions and state updates; no background animation loop is added. Hidden 3D views do not render.

If WebGL is unavailable, the existing Canvas terrain renderer also paints regional buildings, forests, fields, paths and sailboats. It is a simplified projection rather than a claim of full GPU fidelity. Both modes retain the original territory selection and 2D switch.

Validation: `node tests/sengoku-imperial.cjs` checks regional styles, stable placement, polygon holes, finite meshes and upward roof normals, the part budget, quality switching, ownership colors, safe 2D fallback, account clearing and unchanged game actions. The preview browser used for visual QA had WebGL disabled, so screenshots show the Canvas path. GPU scene construction was checked with the bundled Three.js geometries and a renderer test double.
