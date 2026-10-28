/* A continuous SVG camera. Gestures change the view, never the shared world. */
(function(root){
 'use strict';
 function create({svg,host,bounds,japanBounds,selectedRegion=null,onChange=()=>{}}){
  const win=host.ownerDocument.defaultView,doc=host.ownerDocument,points=new Map(),cleanups=[];
  const reduced=()=>win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const clock=()=>win.performance.now(),copy=v=>({...v});
  const labels=[...svg.querySelectorAll('text[data-label]')].map(el=>({el,id:el.dataset.label,japan:el.dataset.area==='japan',major:el.dataset.major==='true',x:Number(el.getAttribute('x')),y:Number(el.getAttribute('y')),length:[...el.textContent].length}));let labelUnit='';
  let view,target,frame=0,lastFrame=0,animation=false,inertia=null,gesture=null,suppressUntil=0,lastTap=null,preset='japan',destroyed=false;
  function rect(){const r=host.getBoundingClientRect();return{left:r.left||0,top:r.top||0,width:r.width||700,height:r.height||600};}
  function limits(){const r=rect();return{aspect:r.width/r.height,min:bounds.width/64,max:Math.max(bounds.width,bounds.height*r.width/r.height)};}
  function constrain(v){const {aspect,min,max}=limits(),width=Math.max(min,Math.min(max,v.width)),height=width/aspect,cx=v.x+v.width/2,cy=v.y+v.height/2;return{width,height,x:width>=bounds.width?(bounds.width-width)/2:Math.max(0,Math.min(bounds.width-width,cx-width/2)),y:height>=bounds.height?(bounds.height-height)/2:Math.max(0,Math.min(bounds.height-height,cy-height/2))};}
  function layoutLabels(){const r=rect(),unit=view.width/r.width,value=unit.toFixed(8);if(value!==labelUnit){labelUnit=value;svg.style.setProperty('--map-japan-label',(unit*8).toFixed(6)+'px');svg.style.setProperty('--map-world-label',(unit*9).toFixed(6)+'px');svg.style.setProperty('--map-label-stroke',(unit*1.2).toFixed(6)+'px');}
   const occupied=[],visible=new Set(),detail=svg.dataset.detail,candidates=labels.filter(label=>label.id===selectedRegion||(label.japan?detail==='province':detail!=='world'||label.major)).sort((a,b)=>(a.id===selectedRegion?-10:a.japan?0:a.major?1:2)-(b.id===selectedRegion?-10:b.japan?0:b.major?1:2));
   for(const label of candidates){const size=label.japan?8:9,x=(label.x-view.x)/unit,y=(label.y-view.y)/unit,width=label.length*size,box={left:x-width/2-2,right:x+width/2+2,top:y-size/2-2,bottom:y+size/2+2};if(box.right<0||box.left>r.width||box.bottom<0||box.top>r.height)continue;if(occupied.some(other=>box.left<other.right&&box.right>other.left&&box.top<other.bottom&&box.bottom>other.top))continue;visible.add(label.id);occupied.push(box);}
   for(const label of labels){const visibility=visible.has(label.id)?'visible':'hidden';if(label.el.style.visibility!==visibility)label.el.style.visibility=visibility;label.el.classList.toggle('is-map-selected',label.id===selectedRegion);}
  }
  function emit(){svg.setAttribute('viewBox',[view.x,view.y,view.width,view.height].map(n=>Number(n.toFixed(6))).join(' '));svg.dataset.detail=view.width<=360?'province':view.width<=1000?'regional':'world';layoutLabels();onChange({zoom:bounds.width/view.width,minimum:view.width>=limits().max-.001,maximum:view.width<=limits().min+.001});}
  function schedule(){if(!frame&&!destroyed)frame=win.requestAnimationFrame(tick);}
  function tick(time){frame=0;const dt=Math.min(40,Math.max(1,lastFrame?time-lastFrame:16));lastFrame=time;
   if(inertia){const previous=target;target=constrain({...target,x:target.x+inertia.x*dt,y:target.y+inertia.y*dt});if(Math.abs(target.x-previous.x)<.00001)inertia.x=0;if(Math.abs(target.y-previous.y)<.00001)inertia.y=0;const decay=Math.exp(-dt/150);inertia.x*=decay;inertia.y*=decay;if(Math.hypot(inertia.x,inertia.y)<.0005||time-inertia.at>650)inertia=null;}
   if(animation&&!reduced()){const step=1-Math.exp(-dt/55);for(const key of ['x','y','width','height'])view[key]+=(target[key]-view[key])*step;if(Math.max(...Object.keys(view).map(k=>Math.abs(target[k]-view[k])))<.0005){view=copy(target);animation=false;}}
   else{view=copy(target);animation=false;}emit();if(animation||inertia)schedule();else lastFrame=0;
  }
  function move(v,smooth=true){target=constrain(v);animation=smooth&&!reduced();if(!animation){view=copy(target);emit();}schedule();}
  function freeze(){if(frame)win.cancelAnimationFrame(frame);frame=0;lastFrame=0;inertia=null;animation=false;target=copy(view);}
  function fit(box,smooth=true,kind=null){preset=kind;inertia=null;const {aspect}=limits(),width=Math.max(box.width,box.height*aspect),height=width/aspect;move({x:box.x+box.width/2-width/2,y:box.y+box.height/2-height/2,width,height},smooth);}
  function japan(smooth=true){fit({x:japanBounds.x-japanBounds.width*.07,y:japanBounds.y-japanBounds.height*.06,width:japanBounds.width*1.14,height:japanBounds.height*1.12},smooth,'japan');}
  function world(smooth=true){fit({x:0,y:0,...bounds},smooth,'world');}
  function zoomAt(factor,anchor,smooth=true){preset=null;inertia=null;const r=rect(),u=anchor?(anchor.x-r.left)/r.width:.5,v=anchor?(anchor.y-r.top)/r.height:.5,{min,max,aspect}=limits(),width=Math.max(min,Math.min(max,target.width/factor)),height=width/aspect,px=target.x+u*target.width,py=target.y+v*target.height;move({x:px-u*width,y:py-v*height,width,height},smooth);}
  function focus(point,zoom=16,smooth=true){preset=null;inertia=null;const width=bounds.width/zoom,height=width/limits().aspect;move({x:point.x-width/2,y:point.y-height/2,width,height},smooth);}
  function listen(node,name,fn,options){node.addEventListener(name,fn,options);cleanups.push(()=>node.removeEventListener(name,fn,options));}
  function centroid(){const list=[...points.values()].slice(0,2);return{x:list.reduce((n,p)=>n+p.x,0)/list.length,y:list.reduce((n,p)=>n+p.y,0)/list.length,distance:list.length===2?Math.hypot(list[0].x-list[1].x,list[0].y-list[1].y):0};}
  function rebase(){if(!points.size){gesture=null;return;}const center=centroid(),r=rect();gesture={base:copy(target),center,anchor:{x:target.x+(center.x-r.left)/r.width*target.width,y:target.y+(center.y-r.top)/r.height*target.height},moved:false,wasPinch:points.size>1,previous:center,at:clock(),vx:0,vy:0};}
  function down(e){if(e.pointerType==='mouse'&&e.button!==0&&e.button!==1||e.target.closest?.('input,select,button,a'))return;freeze();preset=null;points.set(e.pointerId,{x:e.clientX,y:e.clientY,type:e.pointerType});rebase();if(points.size>1){gesture.moved=true;suppressUntil=clock()+400;}}
  function drag(e){if(!points.has(e.pointerId)||!gesture)return;const p=points.get(e.pointerId);p.x=e.clientX;p.y=e.clientY;const center=centroid(),r=rect(),g=gesture,dx=center.x-g.center.x,dy=center.y-g.center.y,pinch=points.size>1;
   if(!g.moved&&!pinch&&Math.hypot(dx,dy)<(e.pointerType==='touch'?6:3))return;g.moved=true;g.wasPinch||=pinch;try{if(!host.hasPointerCapture?.(e.pointerId))host.setPointerCapture(e.pointerId);}catch{}host.classList.add('is-dragging');e.preventDefault();const width=pinch?g.base.width*Math.max(1,g.center.distance)/Math.max(1,center.distance):g.base.width,height=width/limits().aspect;
   const candidate=pinch?{x:g.anchor.x-(center.x-r.left)/r.width*width,y:g.anchor.y-(center.y-r.top)/r.height*height,width,height}:{x:g.base.x-dx/r.width*width,y:g.base.y-dy/r.height*height,width,height};
   const time=clock(),dt=Math.max(8,time-g.at),vx=-(center.x-g.previous.x)/r.width*width/dt,vy=-(center.y-g.previous.y)/r.height*height/dt;g.vx=g.vx*.3+vx*.7;g.vy=g.vy*.3+vy*.7;g.at=time;g.previous=center;target=constrain(candidate);animation=false;schedule();
  }
  function up(e,cancelled=false){if(!points.has(e.pointerId))return;const p=points.get(e.pointerId),g=gesture;points.delete(e.pointerId);try{host.releasePointerCapture(e.pointerId);}catch{}if(g?.moved){suppressUntil=clock()+400;lastTap=null;}
   if(points.size){view=copy(target);emit();rebase();gesture.moved=true;gesture.wasPinch=true;return;}
   host.classList.remove('is-dragging');gesture=null;if(cancelled){lastTap=null;return;}
   if(g?.moved&&!g.wasPinch&&clock()-g.at<90&&!reduced()){inertia={x:g.vx,y:g.vy,at:clock()};schedule();}
   else if(!g?.moved&&p.type==='touch'){const time=clock();if(lastTap&&time-lastTap.at<300&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<24){zoomAt(2,{x:e.clientX,y:e.clientY});suppressUntil=time+400;lastTap=null;}else lastTap={at:time,x:e.clientX,y:e.clientY};}
  }
  listen(host,'pointerdown',down);listen(win,'pointermove',drag);listen(win,'pointerup',e=>up(e));listen(win,'pointercancel',e=>up(e,true));listen(host,'lostpointercapture',e=>{if(e.target===host&&points.has(e.pointerId))up(e,true);});
  listen(host,'click',e=>{if(points.size||clock()<suppressUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
  listen(host,'wheel',e=>{e.preventDefault();if(points.size)return;const units=e.deltaMode===1?16:e.deltaMode===2?rect().height:1,delta=Math.max(-240,Math.min(240,e.deltaY*units));if(delta)zoomAt(Math.exp(-delta*.0025),{x:e.clientX,y:e.clientY});},{passive:false});
  listen(host,'dblclick',e=>{e.preventDefault();zoomAt(2,{x:e.clientX,y:e.clientY});});
  listen(host,'keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||e.target.closest?.('input,select,button,a'))return;const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(directions[e.key]){e.preventDefault();preset=null;inertia=null;const [x,y]=directions[e.key];move({...target,x:target.x+x*target.width*.2,y:target.y+y*target.height*.2});}else if(['+','=','-','Home','End'].includes(e.key)){e.preventDefault();if(e.key==='Home')japan();else if(e.key==='End')world();else zoomAt(e.key==='-'?1/1.5:1.5);}});
  function cancel(){points.clear();gesture=null;host.classList.remove('is-dragging');freeze();}
  listen(win,'blur',cancel);listen(doc,'visibilitychange',()=>{if(doc.hidden)cancel();});
  function resize(){const r=host.getBoundingClientRect();if(!r.width||!r.height)return;if(preset==='japan')japan(false);else if(preset==='world')world(false);else{freeze();const height=view.width/limits().aspect;move({...view,y:view.y+view.height/2-height/2,height},false);}}
  const observer=win.ResizeObserver?new win.ResizeObserver(resize):null;observer?.observe(host);listen(win,'resize',resize);
  host.tabIndex=0;host.setAttribute('aria-label','地図。ドラッグで移動、ホイールやピンチで拡大縮小。矢印キーで移動、プラス・マイナスで拡大縮小、Homeで日本へ戻る。');
  view={x:0,y:0,...bounds};target=copy(view);japan(false);
  return Object.freeze({japan,world,focus,setSelected(id){if(selectedRegion!==id){selectedRegion=id;layoutLabels();}},zoomBy(factor){zoomAt(factor);},getView(){return{...view,zoom:bounds.width/view.width};},destroy(){destroyed=true;cancel();observer?.disconnect();for(const remove of cleanups)remove();}});
 }
 root.HKSengokuMapView=Object.freeze({create});
})(typeof window!=='undefined'?window:globalThis);
