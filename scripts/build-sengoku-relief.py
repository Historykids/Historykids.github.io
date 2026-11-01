"""Build deterministic game relief from the existing territory coastline.
The heights are an artistic model, not measured elevation. No game state changes.
Requires numpy, scipy and Pillow. Run from the repository root.
"""
from pathlib import Path
import json,re,math,base64,struct,xml.etree.ElementTree as ET
import numpy as np
from scipy.ndimage import distance_transform_edt,gaussian_filter,binary_closing
from PIL import Image,ImageDraw,ImageChops
root=Path(__file__).resolve().parents[1]
svg=ET.parse(root/'assets/maps/sengoku-world.svg').getroot()
paths=[]
for p in svg.findall('{http://www.w3.org/2000/svg}path'):
 rings=[]
 for raw in re.findall(r'M([^M]+)',p.get('d','')):
  nums=list(map(float,re.findall(r'-?\d+(?:\.\d+)?',raw)));ring=list(zip(nums[::2],nums[1::2]))
  if len(ring)>=3:rings.append(ring)
 paths.append((p.get('data-code'),p.get('data-area'),rings))
def project(lon,lat):return (((lon+32.5)%360)/360*1920,30+(90-lat)*5.4)
def noise(x,y):
 a=np.floor(x);b=np.floor(y);u=x-a;v=y-b;u=u*u*(3-2*u);v=v*v*(3-2*v)
 def h(x,y):return np.mod(np.sin(x*127.1+y*311.7)*43758.5453123,1)
 return (h(a,b)*(1-u)+h(a+1,b)*u)*(1-v)+(h(a,b+1)*(1-u)+h(a+1,b+1)*u)*v
# Approximate scenic ridge belts; these are deliberately game-scale expressions.
belts=[([(-150,61),(-126,53),(-114,43),(-106,34),(-100,21)],4.5,1.7),([(-73,9),(-77,-4),(-73,-19),(-70,-34),(-72,-50)],3.5,2.6),([(3,44),(9,46),(16,47),(23,48)],2.2,1.7),([(67,35),(78,35),(87,29),(96,28)],4.2,3.2),([(36,37),(44,39),(54,33),(62,30)],2.8,1.3),([(97,29),(100,22),(105,13)],2.5,1.1),([(37,12),(36,3),(31,-7),(28,-16)],2.8,1.1),([(145,-17),(151,-30),(146,-39)],2.4,.8),([(7,32),(1,33),(-7,31)],2.1,1.0)]
def ridge_distance(X,Y,line):
 result=np.full_like(X,1e10)
 for (ax,ay),(bx,by) in zip(line,line[1:]):
  dx=bx-ax;dy=by-ay;t=np.clip(((X-ax)*dx+(Y-ay)*dy)/(dx*dx+dy*dy),0,1);result=np.minimum(result,(X-ax-t*dx)**2+(Y-ay-t*dy)**2)
 return result

def make(name,bounds,size,only_japan=False):
 ox,oy,bw,bh=bounds;w,h=size;mask=Image.new('1',(w,h));
 for _,area,rings in paths:
  if only_japan and area!='japan':continue
  country=Image.new('1',(w,h))
  for ring in rings:
   if max(p[0] for p in ring)<ox or min(p[0] for p in ring)>ox+bw or max(p[1] for p in ring)<oy or min(p[1] for p in ring)>oy+bh:continue
   part=Image.new('1',(w,h));ImageDraw.Draw(part).polygon([((x-ox)/bw*(w-1),(y-oy)/bh*(h-1)) for x,y in ring],fill=1);country=ImageChops.logical_xor(country,part)
  mask=ImageChops.logical_or(mask,country)
 land=binary_closing(np.asarray(mask).astype(bool),iterations=2 if only_japan else 1);distance=distance_transform_edt(land)*(bw/(w-1));xx=np.linspace(ox,ox+bw,w);yy=np.linspace(oy,oy+bh,h);X,Y=np.meshgrid(xx,yy);lat=90-(Y-30)/5.4;lon=X/1920*360-32.5;lon=np.where(lon>180,lon-360,lon)
 n=noise(X*.035,Y*.035)*.55+noise(X*.11+33,Y*.11)*.27+noise(X*.3,Y*.3+20)*.12+noise(X*.9,Y*.9)*.06
 ridges=np.zeros_like(X)
 for line,width,height in belts:
  line=[project(*p) for p in line];ridges=np.maximum(ridges,np.exp(-ridge_distance(X,Y,line)/(width*5.4)**2)*height)
 japanline=[project(*p) for p in [(130.5,31.8),(133.4,33.8),(135.8,35.1),(138.2,36.3),(139.8,38.2),(140.7,40.4),(142.6,43.5)]]
 ridges=np.maximum(ridges,np.exp(-ridge_distance(X,Y,japanline)/4.2**2)*1.1)
 fx,fy=project(138.73,35.36);fuji=np.exp(-((X-fx)**2+(Y-fy)**2)/1.2**2)*1.2
 detail=(1-np.abs(noise(X*.23+9,Y*.23+18)*2-1))**4
 raw=.055+n*.15+ridges*(.48+n*.6+detail*.25)+fuji
 elevation=gaussian_filter(raw,.7 if only_japan else .45)*np.clip((distance-bw/(w-1)*1.05)/(.7 if only_japan else 3.2),0,1)
 if only_japan:elevation*=.6
 elevation=np.where(land,np.maximum(.012,elevation),0);elevation=np.clip(elevation,0,4)
 values=np.rint(elevation/4*255).astype(np.uint8).ravel();buf=bytearray();start=0
 for i in range(1,len(values)+1):
  if i<len(values) and values[i]==values[start] and i-start<65535:continue
  buf.extend(struct.pack('<HB',i-start,int(values[start])));start=i
 return {'name':name,'bounds':bounds,'width':w,'height':h,'maxHeight':4,'rle':base64.b64encode(buf).decode()}
output={'version':'scenic-relief-20261102-v1','description':'Procedural scenic relief; not measured topography. Existing territory geometry and game rules are unchanged.','fields':[make('world',[0,0,1920,1080],[960,540]),make('japan',[848.2,267.7,96.5,101.5],[386,406],True)]}
p=root/'assets/maps/sengoku-relief.json';p.write_text(json.dumps(output,separators=(',',':'))+'\n');print('Relief data:',p.stat().st_size,'bytes; coast mask and continuous world/Japan elevation')
