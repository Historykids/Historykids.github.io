/* Shared, deterministic placements for the 3D town and the placement map. */
(function(root) {
  "use strict";
  const C=root.HKCore || (typeof require==="function" ? require("./core.js") : null);
  function randomFor(id) {
    let seed=2166136261;
    for(const c of id) seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;
    return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  }
  function layout(event,city=[],width=C.town.width,depth=C.town.height) {
    const random=randomFor(event.id), blocked=new Set(), key=(x,y)=>y*width+x;
    for(const b of city) if(b.type!=="road" && b.type!=="bridge") for(const p of C.occupiedCells(b)) blocked.add(key(p.x,p.y));
    const free=(x,y)=>Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<width&&y<depth&&!blocked.has(key(x,y));
    const cells=[];
    for(let y=0;y<depth;y++)for(let x=0;x<width;x++)if(free(x,y))cells.push({x,y});
    const result={id:event.id,type:event.type,width,depth,fires:[],festival:null,route:[],routeLength:0};
    if(event.type==="fire") {
      const buildings=city.filter(b=>C.items.find(i=>i.id===b.type)?.cat==="building");
      for(const b of buildings.slice(0,4)) {const f=C.footprint(b);result.fires.push({x:b.x+f.width/2,y:b.y+f.depth/2,height:C.items.find(i=>i.id===b.type).height});}
      const pool=cells.slice();
      while(result.fires.length<8 && pool.length) {
        const index=Math.floor(random()*pool.length),p=pool.splice(index,1)[0];
        if(result.fires.every(f=>Math.hypot(f.x-p.x,f.y-p.y)>3))result.fires.push({x:p.x+.5,y:p.y+.5,height:0});
      }
    } else if(event.type==="festival") {
      const preferred={x:width*(.35+random()*.3),y:depth*(.35+random()*.3)};
      for(const [w,d] of [[10,8],[6,6],[4,4],[2,2],[1,1]]) {
        let best=null,bestDistance=Infinity;
        for(let y=0;y<=depth-d;y++)for(let x=0;x<=width-w;x++) {
          const distance=(x+w/2-preferred.x)**2+(y+d/2-preferred.y)**2;
          if(distance>=bestDistance)continue;
          let fits=true;for(let yy=y;yy<y+d&&fits;yy++)for(let xx=x;xx<x+w;xx++)if(!free(xx,yy)){fits=false;break;}
          if(fits){best={x,y,width:w,depth:d};bestDistance=distance;}
        }
        if(best){result.festival=best;break;}
      }
    } else if(event.type==="shogun" && cells.length) {
      // Restrict the procession to one connected area, so it never cuts through a building.
      const start=cells.reduce((best,p)=>Math.hypot(p.x-width/2,p.y-depth/2)<Math.hypot(best.x-width/2,best.y-depth/2)?p:best,cells[0]);
      const reached=new Set([key(start.x,start.y)]), connected=[start];
      for(let i=0;i<connected.length;i++) {
        const p=connected[i];for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]){const x=p.x+dx,y=p.y+dy,k=key(x,y);if(free(x,y)&&!reached.has(k)){reached.add(k);connected.push({x,y});}}
      }
      const targets=[[.2,.25],[.75,.25],[.75,.75],[.2,.75]].map(([x,y])=>connected.reduce((best,p)=>(p.x-width*x)**2+(p.y-depth*y)**2<(best.x-width*x)**2+(best.y-depth*y)**2?p:best,connected[0]));
      function path(from,to) {
        const queue=[from],parents=new Map([[key(from.x,from.y),null]]);
        for(let i=0;i<queue.length;i++) {
          const p=queue[i];if(p.x===to.x&&p.y===to.y)break;
          for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]){const x=p.x+dx,y=p.y+dy,k=key(x,y);if(free(x,y)&&!parents.has(k)){parents.set(k,p);queue.push({x,y});}}
        }
        const route=[];for(let p=to;p;p=parents.get(key(p.x,p.y)))route.push(p);return route.reverse();
      }
      let previous=start;result.route=[start];
      for(const target of [...targets,start]){result.route.push(...path(previous,target).slice(1));previous=target;}
      result.routeLength=Math.max(0,result.route.length-1);
    }
    return result;
  }
  function pose(layout,seconds,index=0) {
    const route=layout.route;
    if(!route.length)return null;
    const length=layout.routeLength;
    if(!length)return {...route[0],heading:0};
    const distance=((seconds*1.65-index*1.25)%length+length)%length,i=Math.floor(distance),t=distance-i,a=route[i],b=route[i+1];
    return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,heading:Math.atan2(b.x-a.x,b.y-a.y)};
  }
  const api={layout,pose};root.HKEventLayout=api;
  if(typeof module!=="undefined")module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
