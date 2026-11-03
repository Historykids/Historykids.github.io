/* Mobile joystick: independent touch pointers for steering and boost, with no mouse steering. */
(function(root){
 'use strict';
 function enabledForDevice(){const requested=new URLSearchParams(root.location.search).get('controls');if(requested==='touch')return true;if(requested==='keyboard')return false;return !!root.matchMedia?.('(pointer: coarse)').matches||((root.navigator.maxTouchPoints||0)>0&&root.innerWidth<=1024);}
 function create({stick,knob,boost,isEnabled,onChange}){
  const state={x:0,y:0,boost:false},listeners=[];let movePointer=null,boostPointer=null,knobX=0,knobY=0;
  const listen=(el,type,fn)=>{el.addEventListener(type,fn,{passive:false});listeners.push([el,type,fn]);};
  const touch=e=>e.pointerType==='touch'||e.pointerType==='pen';
  const emit=()=>onChange?.({...state,source:'stick'});
  const paint=(x=knobX,y=knobY)=>{knobX=x;knobY=y;knob.style.transform='translate('+x+'px,'+y+'px)';stick.classList.toggle('engaged',movePointer!==null);boost.classList.toggle('engaged',state.boost);boost.setAttribute('aria-pressed',String(state.boost));};
  const capture=(el,id)=>{try{el.setPointerCapture?.(id);}catch{}};
  const release=(el,id)=>{try{if(id!==null)el.releasePointerCapture?.(id);}catch{}};
  function steer(e){const box=stick.getBoundingClientRect(),radius=Math.max(1,Math.min(box.width,box.height)*.34),dx=e.clientX-(box.left+box.width/2),dy=e.clientY-(box.top+box.height/2),length=Math.hypot(dx,dy),scale=length>radius?radius/length:1;const x=dx*scale,y=dy*scale;if(length<radius*.15){state.x=state.y=0;paint(0,0);}else{state.x=Math.round(x/radius*1000)/1000;state.y=Math.round(y/radius*1000)/1000;paint(x,y);}emit();}
  function finishMove(e){if(e.pointerId!==movePointer)return;e.preventDefault();const id=movePointer;movePointer=null;state.x=state.y=0;release(stick,id);paint(0,0);emit();}
  function finishBoost(e){if(e.pointerId!==boostPointer)return;e.preventDefault();const id=boostPointer;boostPointer=null;state.boost=false;release(boost,id);paint();emit();}
  listen(stick,'pointerdown',e=>{if(!touch(e)||!isEnabled()||movePointer!==null)return;e.preventDefault();movePointer=e.pointerId;capture(stick,e.pointerId);steer(e);});
  listen(stick,'pointermove',e=>{if(e.pointerId!==movePointer||!isEnabled())return;e.preventDefault();steer(e);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(stick,type,finishMove);
  listen(boost,'pointerdown',e=>{if(!touch(e)||!isEnabled()||boostPointer!==null)return;e.preventDefault();boostPointer=e.pointerId;state.boost=true;capture(boost,e.pointerId);paint();emit();});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(boost,type,finishBoost);
  for(const type of ['pointerup','pointercancel']){listen(root,type,finishMove);listen(root,type,finishBoost);}
  function reset(){const move=movePointer,speed=boostPointer;movePointer=boostPointer=null;state.x=state.y=0;state.boost=false;release(stick,move);release(boost,speed);paint(0,0);emit();}
  paint();return Object.freeze({get:()=>({...state,source:'stick'}),reset,destroy(){reset();for(const [el,type,fn]of listeners)el.removeEventListener(type,fn);}});
 }
 root.HKNeonSnakeTouch=Object.freeze({enabledForDevice,create});
})(typeof window!=='undefined'?window:globalThis);
