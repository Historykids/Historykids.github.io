"""Build parchment-style modern country borders, keeping Japanese province IDs.
Source: Natural Earth 1:50m admin-0, public domain. Source raster is never shipped.
Usage: python3 scripts/build-modern-world.py /path/to/ne_50m_admin_0_countries.geojson
"""
import json,math,re,sys,hashlib,xml.etree.ElementTree as ET
from pathlib import Path
from collections import defaultdict
root=Path(__file__).resolve().parents[1];source=Path(sys.argv[1]);data=json.loads(source.read_text())
legacy={'RUS':'russia','CHN':'qing','KOR':'joseon','GBR':'britain','FRA':'france','ESP':'iberia','NOR':'scandinavia','DEU':'central_europe','ITA':'italy','TUR':'ottoman','KAZ':'kazakh','UZB':'bukhara','KGZ':'kokand','IRN':'persia','AFG':'afghanistan','IND':'india','BGD':'bengal','MMR':'burma','THA':'siam','VNM':'vietnam','SAU':'arabia','DZA':'north_africa','ZAF':'south_africa','MDG':'madagascar','IDN':'indonesia','PHL':'philippines','AUS':'oceania','NZL':'new_zealand','PNG':'pacific','CAN':'canada','USA':'united_states','BHS':'louisiana','MEX':'new_spain','CUB':'caribbean','COL':'new_granada','PER':'peru','ARG':'la_plata','BRA':'brazil','GRL':'greenland','ISL':'iceland'}
continents={'Asia':'asia','Europe':'europe','Africa':'africa','North America':'north_america','South America':'south_america','Oceania':'oceania','Antarctica':'antarctica','Seven seas (open ocean)':'oceania'}
overrides={'TWN':'台湾','CHN':'中国','KOR':'韓国','PRK':'北朝鮮','GBR':'イギリス','USA':'アメリカ合衆国','KOS':'コソボ','PSX':'パレスチナ'}
def project(lon,lat):return (((lon+32.5)%360)/360*1920,30+(90-lat)*5.4)
def dist(a,b):
 dx=min(abs(a[0]-b[0]),360-abs(a[0]-b[0]))*math.cos(math.radians((a[1]+b[1])/2));return dx*dx+(a[1]-b[1])**2
# Douglas–Peucker in degrees, retain small countries/islands as genuine outlines.
def simplify(points,tol=.12):
 if len(points)<=4:return points
 def run(p):
  if len(p)<=2:return p
  a,b=p[0],p[-1];dx=b[0]-a[0];dy=b[1]-a[1];d=dx*dx+dy*dy;best=-1;index=0
  for i,q in enumerate(p[1:-1],1):
   t=max(0,min(1,((q[0]-a[0])*dx+(q[1]-a[1])*dy)/d)) if d else 0
   v=(q[0]-a[0]-t*dx)**2+(q[1]-a[1]-t*dy)**2
   if v>best:best=v;index=i
  return run(p[:index+1])[:-1]+run(p[index:]) if best>tol*tol else [a,b]
 # Closed rings need two arcs so their endpoints do not collapse.
 k=max(range(1,len(points)-1),key=lambda i:dist(points[0],points[i]));out=run(points[:k+1])[:-1]+run(points[k:])
 return out if len(out)>=4 else points
countries=[];features={};vertices=defaultdict(set);geoms={}
for f in data['features']:
 p=f['properties'];code=p['ADM0_A3']
 if code=='JPN':continue
 id=legacy.get(code,'country_'+code.lower());lon=float(p['LABEL_X']);lat=float(p['LABEL_Y']);x,y=project(lon,lat)
 continent=continents[p['CONTINENT']];sub=p.get('SUBREGION','')
 zone='east_asia' if sub=='Eastern Asia' else 'southeast_asia' if sub=='South-Eastern Asia' else 'central_south_asia' if sub in ['Southern Asia','Central Asia'] else 'middle_east_africa' if continent=='africa' or sub=='Western Asia' else 'europe' if continent=='europe' else 'central_south_asia' if continent=='asia' else continent
 c={'id':id,'name':overrides.get(code,p['NAME_JA'] or p['NAME']),'code':code,'continent':continent,'rankingRegion':zone,'x':round(x,3),'y':round(y,3),'lon':lon,'lat':lat}
 countries.append(c);features[id]=f;geoms[id]=f['geometry']['coordinates'] if f['geometry']['type']=='MultiPolygon' else [f['geometry']['coordinates']]
 for polygon in geoms[id]:
  for ring in polygon:
   for a,b in ring:vertices[(round(a,5),round(b,5))].add(id)
ids={c['id']:c for c in countries};shared=defaultdict(int)
for group in vertices.values():
 for a in group:
  for b in group:
   if a<b:shared[(a,b)]+=1
links=[{'ends':[a,b],'sea':False} for (a,b),n in sorted(shared.items()) if n>=2]
# Connect island components with short sea routes; keep every region reachable.
components=[{id} for id in ids]
def merge(a,b):
 aa=next(g for g in components if a in g);bb=next(g for g in components if b in g)
 if aa is not bb:aa.update(bb);components.remove(bb)
for e in links:merge(*e['ends'])
while len(components)>1:
 largest=max(components,key=len);best=None
 for a in largest:
  for group in components:
   if group is largest:continue
   for b in group:
    d=dist((ids[a]['lon'],ids[a]['lat']),(ids[b]['lon'],ids[b]['lat']))
    if best is None or (d,a,b)<best:best=(d,a,b)
 _,a,b=best;links.append({'ends':[a,b],'sea':True});merge(a,b)
for a,b in [('tsushima','joseon'),('ezo','russia'),('ryukyu','country_twn'),('hizen','qing')]:links.append({'ends':[a,b],'sea':True})
meta={'version':'modern-20261029-v1','source':'Natural Earth 1:50m admin-0 countries','sourceUrl':'https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_0_countries.geojson','sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'legacyAssignments':{v:v for v in legacy.values()},'countries':sorted(countries,key=lambda c:c['id']),'links':links}
# Keep the existing parchment style and the Japanese outlines, adjusting latitude
# to the atlas projection. The reference modern map supplies the political model.
old=ET.parse(root/'assets/maps/sengoku-world.svg');ns={'s':'http://www.w3.org/2000/svg'};paths=[];already_modern=(old.find('s:desc',ns).text or '').startswith('Natural Earth')
for p in old.findall('s:path',ns):
 if p.get('data-area')!='japan':continue
 d=p.get('d');values=list(map(float,re.findall(r'-?\d+(?:\.\d+)?',d)));coords=iter([(v if i%2==0 or already_modern else (v-435.16)*.7105263158+325.92) for i,v in enumerate(values)])
 d=re.sub(r'-?\d+(?:\.\d+)?',lambda m:f'{next(coords):.3f}',d)
 paths.append(f'<path data-code="{p.get("data-code")}" data-area="japan" data-label-x="{p.get("data-label-x")}" data-label-y="{(float(p.get("data-label-y")) if already_modern else (float(p.get("data-label-y"))-435.16)*.7105263158+325.92):.3f}" d="{d}"/>')
for c in meta['countries']:
 segments=[]
 for polygon in geoms[c['id']]:
  for ring in polygon:
   points=simplify(ring);unwrapped=[(lon+32.5,lat) for lon,lat in points]
   def clip(poly,bound,greater):
    if not poly:return []
    out=[];a=poly[-1];inside=lambda p:p[0]>=bound if greater else p[0]<=bound
    for b in poly:
     if inside(a)!=inside(b):out.append((bound,a[1]+(b[1]-a[1])*(bound-a[0])/(b[0]-a[0])))
     if inside(b):out.append(b)
     a=b
    return out
   for shift in [-720,-360,0,360,720]:
    poly=clip(clip([(x+shift,y) for x,y in unwrapped],0,True),360,False)
    if len(poly)<3:continue
    projected=[(x/360*1920,30+(90-y)*5.4) for x,y in poly]
    segments.append('M'+'L'.join(f'{x:.2f},{y:.2f}' for x,y in projected)+'Z')
 if not segments:
  x,y=c['x'],c['y'];segments=[f'M{x-.5:.2f},{y-.5:.2f}L{x+.5:.2f},{y-.5:.2f}L{x+.5:.2f},{y+.5:.2f}L{x-.5:.2f},{y+.5:.2f}Z']
 paths.append(f'<path data-code="{c["id"]}" data-area="overseas" data-label-x="{c["x"]}" data-label-y="{c["y"]}" d="{"".join(segments)}"/>')
svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><title>日本の旧国70地域と現在の世界の国・地域</title><desc>Natural Earthの現在の国別区分を、歴史キッズの古地図風デザインで表示するゲーム地図。</desc>'+''.join(paths)+'</svg>\n'
(root/'assets/maps/sengoku-world.svg').write_text(svg)
p=root/'assets/ui/sengoku-kuni-map.js';s=p.read_text();start=s.index(' const modernData=') if ' const modernData=' in s else s.index(' const overseas=');end=s.index(' const regionById=',start)
s=s[:start]+' const modernData='+json.dumps(meta,ensure_ascii=False,separators=(',',':'))+';\n for(const c of modernData.countries)regions.push(Object.freeze({...c,short:c.name,reading:c.name,province:c.name,supplemental:true,overseas:true,modern:"現在の国・地域",castle:c.name+"の拠点",tier:2,unit:"infantry",legacyPrefecture:null,legacyPrefectures:Object.freeze([])}));\n'+s[end:]
a=s.index(' const globalLand=') if ' const globalLand=' in s else s.index(' const routes=');b=s.index(' const legacy=',a)
s=s[:a]+" const routes=Object.freeze([[land,false],[sea,true]].flatMap(([text,water])=>text.trim().split(/\\s+/).map(pair=>({ends:pair.split('-'),sea:water}))).concat(modernData.links).map(e=>Object.freeze({...e,ends:Object.freeze(e.ends)})));\n"+s[b:]
s=s.replace('version:2,mapVersion:"world-18c-v1"','version:3,mapVersion:"world-modern-v1",modernData')
s=s.replace('modern:legacyPrefectures.map','continent:"asia",rankingRegion:"japan",modern:legacyPrefectures.map')
s=re.sub(r'(continent:"asia",rankingRegion:"japan",)+','continent:"asia",rankingRegion:"japan",',s)
p.write_text(s)
(root/'assets/maps/modern-country-assignments.json').write_text(json.dumps({'version':meta['version'],'source':meta['sourceUrl'],'sha256':meta['sourceSha256'],'legacyAssignments':[{'oldId':v,'newId':v,'name':ids[v]['name'],'countryCode':k} for k,v in legacy.items()]},ensure_ascii=False,indent=2)+'\n')
print({'japan':70,'overseas':len(countries),'total':70+len(countries),'links':len(links),'svgBytes':len(svg.encode())})
