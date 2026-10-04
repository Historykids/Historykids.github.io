import * as THREE from "three";
import { createFarmer, animateFarmer } from "./farmer-3d.js?v=missions-20261005";

export function createTownEventView(scene) {
  const group=new THREE.Group();group.name="town-event-scenery";scene.add(group);
  let event=null,layout=null,signature="",flames=[],lanterns=[],people=[];
  const materials=new Map();
  const material=(color,opacity=1)=>{
    const key=color+":"+opacity;
    if(!materials.has(key))materials.set(key,new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:opacity===1}));
    return materials.get(key);
  };
  function mesh(parent,geometry,color,x=0,y=0,z=0,opacity=1) {
    const m=new THREE.Mesh(geometry,material(color,opacity));m.position.set(x,y,z);parent.add(m);return m;
  }
  function box(parent,w,h,d,color,x=0,y=0,z=0) {return mesh(parent,new THREE.BoxGeometry(w,h,d),color,x,y,z);}
  function clear() {
    const disposed=new Set();group.traverse(o=>{if(o.isMesh){o.geometry.dispose();const list=Array.isArray(o.material)?o.material:[o.material];for(const m of list)disposed.add(m);}});
    for(const m of disposed)m.dispose();materials.clear();group.clear();flames=[];lanterns=[];people=[];
  }
  function person(parent,id,type,x,y,scale=1) {
    const p=createFarmer(id,type);p.scale.setScalar(scale);parent.add(p);
    people.push({mesh:p,x,y,index:people.length});return p;
  }
  function fire() {
    for(const [index,p] of layout.fires.entries()) {
      const patch=new THREE.Group();patch.name="fire-patch";patch.position.set(p.x-layout.width/2,p.height+.04,p.y-layout.depth/2);group.add(patch);
      const ash=mesh(patch,new THREE.CircleGeometry(.75,12),0x3d3128,0,.015,0,.7);ash.rotation.x=-Math.PI/2;
      if(!event.resolved) {
        for(let i=0;i<3;i++) {
          const flame=new THREE.Group();patch.add(flame);flame.position.set((i-1)*.4,0,Math.sin(i*2)*.25);
          mesh(flame,new THREE.ConeGeometry(.44,1.75,7),0xe94718,0,.86,0);
          mesh(flame,new THREE.ConeGeometry(.32,1.28,7),0xff9224,0,.62,.055);
          mesh(flame,new THREE.ConeGeometry(.19,.8,7),0xffe889,0,.4,.12);
          flames.push({mesh:flame,index:index*3+i});
        }
        for(let i=0;i<2;i++) {
          const smoke=mesh(patch,new THREE.SphereGeometry(.34,6,4),0x625d53,0,2.1+i*.7,0,.34);
          flames.push({mesh:smoke,index:index*2+i,smoke:true});
        }
      } else {
        for(let i=0;i<2;i++) {
          const steam=mesh(patch,new THREE.SphereGeometry(.28,6,4),0xa8cbc9,(i-.5)*.45,.6+i*.5,0,.25);
          flames.push({mesh:steam,index:index*2+i,smoke:true});
        }
      }
      const bucket=new THREE.Group();bucket.position.set(.95,.05,.55);patch.add(bucket);
      mesh(bucket,new THREE.CylinderGeometry(.2,.15,.32,8),0x8b663d,0,.16);
      mesh(bucket,new THREE.CylinderGeometry(.16,.16,.015,8),0x72bccc,0,.32);
    }
  }
  function festival() {
    const p=layout.festival;if(!p)return;
    const venue=new THREE.Group();venue.name="festival-venue";
    venue.position.set(p.x+p.width/2-layout.width/2,.03,p.y+p.depth/2-layout.depth/2);
    const scale=Math.min(p.width/10,p.depth/8);venue.scale.setScalar(scale);group.add(venue);
    box(venue,9.6,.05,7.6,0xc99d64,0,0,0);
    const stage=new THREE.Group();venue.add(stage);stage.name="festival-yagura";
    box(stage,2.4,.65,2.4,0x783b2d,0,.35);
    box(stage,2.65,.12,2.65,0xc89862,0,.74);
    for(const x of [-1,1])for(const z of [-1,1])box(stage,.12,1.6,.12,0x8c5036,x,1.48,z);
    for(const z of [-1.12,1.12])box(stage,2.4,.12,.12,0xd06943,0,1.34,z);
    box(stage,2.8,.14,2.8,0xc94834,0,2.35);
    const drum=mesh(stage,new THREE.CylinderGeometry(.48,.48,.65,12),0xd9b479,0,1.14);drum.rotation.z=Math.PI/2;
    for(const x of [-.34,.34]){const skin=mesh(stage,new THREE.CircleGeometry(.46,12),0xf3e5c4,x,1.14);skin.rotation.y=Math.PI/2*(x>0?1:-1);}
    for(const [index,[x,z]] of [[-3.7,-2.3],[3.7,-2.3],[-3.7,2.3],[3.7,2.3]].entries()) {
      const stall=new THREE.Group();stall.name="festival-stall";stall.position.set(x,0,z);venue.add(stall);
      box(stall,1.7,.75,1.05,index%2 ? 0x927b45 : 0xab664d,0,.45);
      box(stall,1.95,.12,1.25,0xd5b784,0,.9);
      for(const xx of [-.8,.8])box(stall,.09,1.85,.09,0x704e31,xx,1.04,-.4);
      for(let stripe=0;stripe<6;stripe++)box(stall,.34,.11,1.5,stripe%2 ? 0xffeed2 : index%2 ? 0x3f8582 : 0xd7503e,(stripe-2.5)*.34,1.94);
      for(let i=0;i<3;i++)mesh(stall,new THREE.SphereGeometry(.12,6,4),[0xe9b237,0xe17244,0xa8bb6a][i],(i-1)*.4,1.04,.15);
    }
    for(const z of [-3.2,3.2]) {
      for(const x of [-4.5,4.5])box(venue,.1,2.6,.1,0x795639,x,1.3,z);
      box(venue,9,.035,.035,0x614938,0,2.53,z);
      for(let i=0;i<9;i++) {
        const lamp=new THREE.Group();lamp.position.set(i-4,2.32,z);venue.add(lamp);lamp.name="festival-lantern";
        const globe=mesh(lamp,new THREE.SphereGeometry(.19,8,6),i%2 ? 0xffd777 : 0xf26743);globe.scale.y=1.2;
        for(const y of [-.2,.2])mesh(lamp,new THREE.CylinderGeometry(.1,.1,.045,8),0x6a4632,0,y);
        lanterns.push({mesh:lamp,index:i});
      }
    }
    for(let i=0;i<6;i++) {
      const angle=i*Math.PI/3,p=person(venue,`festival-${event.id}-${i}`,i%2 ? "merchant" : "farmer",0,0,.85);
      p.userData.dance={angle};
    }
  }
  function shogun() {
    for(let i=0;i<9;i++) {
      const lord=i===3,p=person(group,`parade-${event.id}-${i}`,lord ? "merchant" : "samurai",0,0,lord ? 1.5 : 1.1);p.name=lord ? "visiting-shogun" : "shogun-guard";
      if(lord) {
        for(const o of p.userData.rig.body.children)if(o.isMesh)o.material=o.material.clone(),o.material.color.set(0x623b89);
        box(p.userData.rig.head,.09,.22,.09,0x171f2a,0,.15,-.03);
        box(p.userData.rig.body,.23,.025,.035,0xe1ba49,0,.05,.14);
        const fan=mesh(p.userData.rig.rightArm,new THREE.CircleGeometry(.14,8,0,Math.PI),0xdfbc58,0,-.28,.08);fan.rotation.z=-.3;
      }
      if(i===0 || i===8) {
        const flag=new THREE.Group();p.userData.rig.body.add(flag);
        mesh(flag,new THREE.CylinderGeometry(.012,.012,1.3,5),0x635036,.2,.35,-.1);
        box(flag,.32,.48,.025,0xffefd3,.03,.73,-.1);
        const crest=mesh(flag,new THREE.CircleGeometry(.075,8),0x404251,.03,.73,-.08);
        crest.rotation.z=Math.PI/3;
      }
    }
  }
  function update(next,city=[]) {
    const C=globalThis.HKCore;
    const nextSignature=JSON.stringify([next?.id,next?.resolved,city,C.town.width,C.town.height]);
    if(signature===nextSignature)return;
    signature=nextSignature;clear();event=next;layout=null;
    group.visible=!!event;if(!event)return;
    layout=globalThis.HKEventLayout.layout(event,city);
    if(event.type==="fire")fire();
    else if(event.type==="festival")festival();
    else if(event.type==="shogun")shogun();
  }
  function animate(now=Date.now()) {
    if(!event)return false;
    group.visible=now<event.end;if(!group.visible)return false;
    const t=(now-event.start)/1000;
    for(const f of flames) {
      if(f.smoke){f.mesh.position.y=.8+((t*.55+f.index*.43)%2.5);f.mesh.scale.setScalar(.8+((t*.55+f.index*.43)%2.5)*.25);}
      else {const pulse=Math.sin(t*7+f.index*1.7);f.mesh.scale.set(1+pulse*.12,.86+pulse*.18,1-pulse*.08);f.mesh.rotation.z=Math.sin(t*4+f.index)*.12;}
    }
    for(const l of lanterns)l.mesh.rotation.z=Math.sin(t*1.8+l.index)*.08;
    for(const p of people) {
      if(event.type==="shogun") {
        const pose=globalThis.HKEventLayout.pose(layout,t,p.index);
        p.mesh.visible=!!pose;if(pose)animateFarmer(p.mesh,{...pose,type:p.mesh.userData.type,elapsed:t,phase:"walk",action:"walk"});
      } else {
        // These dancers use local venue coordinates rather than town coordinates.
        const angle=p.mesh.userData.dance.angle+t*.22;
        animateFarmer(p.mesh,{x:0,y:0,heading:-angle,elapsed:t,phase:"walk",action:"walk",type:p.mesh.userData.type});
        p.mesh.position.set(Math.sin(angle)*2.15,.05+Math.abs(Math.sin(t*3+p.index))*.04,Math.cos(angle)*1.85);
        p.mesh.userData.rig.leftArm.rotation.x=-1.8+Math.sin(t*3+p.index)*.35;
        p.mesh.userData.rig.rightArm.rotation.x=-1.8-Math.sin(t*3+p.index)*.35;
      }
    }
    return true;
  }
  function dispose(){clear();scene.remove(group);event=null;}
  return {group,update,animate,dispose,get layout(){return layout;}};
}
