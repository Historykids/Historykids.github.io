"""Build a reviewable one-file learning preview from the actual app sources."""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
out=root.parent/'deliverables'
out.mkdir(exist_ok=True)
s=(root/'index.html').read_text()
s=re.sub(r'<link\b[^>]*href="\./assets/ui/app.css(?:\?[^"]*)?"[^>]*>',lambda _: '<style>\n'+(root/'assets/ui/app.css').read_text()+'\n</style>',s)
s=re.sub(r'<script\b[^>]*\bsrc="[^"]+"[^>]*>\s*</script>','',s)
s=s.replace('./assets/vendor/three.module.js','https://unpkg.com/three@0.160.0/build/three.module.js')
# Source-derived local logic; no initial network access is required for learning.
logic=[]
for p in ['data/dataset.js','data/ancient.js','data/meiji.js','data/modern.js','assets/ui/core.js','assets/ui/residents.js','assets/ui/app.js']:
 text=(root/p).read_text().replace('</script','<\\/script')
 logic.append('<script>\n'+text+'\n</script>')
town=(root/'assets/ui/town.js').read_text()
town=town.replace('../vendor/OrbitControls.js','https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js').replace('../vendor/GLTFLoader.js','https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js')
town=town.replace('new URL("../_m/" + urls[type], import.meta.url)','new URL("https://historykids.github.io/assets/_m/" + urls[type])')
geometry=(root/'assets/ui/town-geometry.js').read_text().replace('import * as THREE from "three";', '').replace('export ', '')
town=town.replace('import { fitModel, createBuilding, createGround, syncBuildings } from "./town-geometry.js";', geometry)
farmer=(root/'assets/ui/farmer-3d.js').read_text().replace('import * as THREE from "three";', '').replace('export ', '')
town=town.replace('import { createFarmerView } from "./farmer-3d.js";', farmer)
logic.append('<script type="module">\n'+town+'\n</script>')
s=s.replace('</body>','\n'+'\n'.join(logic)+'\n</body>')
# Only unchanged public-page links and images leave the preview.
for file in ['buzzer.html','ranking.html','edogames.html','arcade.html','figures.html','howto.html','Credits.html','favicon.ico','favicon-180x180.png','manifest.webmanifest','かわいい青いクジラ.png']:
 s=s.replace('./'+file,'https://historykids.github.io/'+file)
s=s.replace('href="./"','href="#learn"')
# The file:// storage API differs by browser; the actual app handles denied storage.
p=out/'historykids-preview.html'
p.write_text(s)
print(p,len(s.encode()))
