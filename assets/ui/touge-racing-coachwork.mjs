// Each station gives the longitudinal position, half width and top of the panel.
const profiles = {
  firn: { body:[[-2,.92,.85],[-1.65,1.04,1.04],[-.88,1.09,1.09],[.85,1.06,1],[1.65,1,.91],[2,.86,.74]],
    cabin:[[-1.53,.84,1.09],[-1.24,.79,1.58],[.12,.76,1.61],[.91,.85,1.02]],wheel:.43 },
  meridian: { body:[[-2.28,.97,.71],[-1.86,1.09,.87],[-1.13,1.14,.92],[-.18,.99,.72],[1.17,1.1,.8],[1.85,1,.62],[2.27,.72,.48]],
    cabin:[[-1.38,.8,.82],[-.66,.7,1.15],[.02,.67,1.23],[1.18,.82,.76]],wheel:.38 },
  puna: { body:[[-2.27,.89,.88],[-1.92,1.02,1],[-.98,1.05,1.08],[.72,1.01,1.06],[1.82,1,.99],[2.22,.9,.82]],
    cabin:[[-1.47,.8,1],[-.73,.74,1.42],[.15,.73,1.47],[.83,.85,1.04]],wheel:.41 }
};
export function coachwork(id) {
  const {body,cabin,wheel}=profiles[id];
  const panels=[];
  function skin(stations,base,finish,cockpit=false) {
    const rings=stations.map(([z,w,h])=>[[-w*.91,base,z],[-w,base+(h-base)*.57,z],[-w*.91,h-.045,z],[-w*.62,h,z],[w*.62,h,z],[w*.91,h-.045,z],[w,base+(h-base)*.57,z],[w*.91,base,z]]);
    for(let i=1;i<rings.length;i++)for(let j=0;j<8;j++){
      const k=(j+1)%8;
      const roof=cockpit && i===2 && j>=2 && j<=4;
      panels.push({finish:roof?'paint':finish,vertices:[rings[i-1][j],rings[i][j],rings[i][k],rings[i-1][k]]});
    }
    for(const ring of [rings[0],rings.at(-1)])panels.push({finish,vertices:ring});
  }
  skin(body,.33,'paint'); skin(cabin,Math.min(...cabin.map(s=>s[2]))-.025,'glass',true);
  function slab(x,y,z,w,h,d,finish){
    const ring=(v)=>[[x-w/2,y-h/2,v],[x-w/2,y+h/2,v],[x+w/2,y+h/2,v],[x+w/2,y-h/2,v]];
    const a=ring(z-d/2),b=ring(z+d/2);
    panels.push({finish,vertices:a},{finish,vertices:b});
    for(let j=0;j<4;j++){const k=(j+1)%4;panels.push({finish,vertices:[a[j],a[k],b[k],b[j]]});}
  }
  const tail=body[0][0],nose=body.at(-1)[0];
  slab(0,.33,0,2.04,.13,nose-tail,'trim');
  slab(0,.54,tail-.014,1.27,.13,.045,'trim');
  slab(0,.58,nose+.015,1.05,.12,.05,'trim');
  for(const side of [-1,1]){
    slab(side*.76,body[0][2]-.14,tail-.035,id==='puna'?.23:.38,.09,.08,'red');
    slab(side*.66,body.at(-1)[2]-.09,nose+.025,.34,.065,.06,'lamp');
    slab(side*.94,cabin[2][2]-.24,.47,.22,.12,.23,'paint');
    if(id==='firn')slab(side*.58,1.67,-.5,.065,.055,1.45,'trim');
    if(id==='meridian')slab(side*.97,.53,-.5,.12,.2,.78,'trim');
    if(id==='puna')slab(side*.27,1.061,1.22,.16,.021,.65,'trim');
  }
  if(id==='firn')for(const z of [-.95,.05])slab(0,1.72,z,1.37,.06,.09,'metal');
  if(id==='meridian'){slab(0,.97,-1.95,2.05,.065,.28,'trim');for(const x of [-.62,.62])slab(x,.86,-1.94,.06,.19,.13,'metal');}
  return {panels,wheel,axles:[tail*.64,nose*.64]};
}
