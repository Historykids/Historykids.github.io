import * as THREE from "three";

// Perspective, interpolated lighting and a depth buffer keep the same terrain
// and picking geometry available when a device cannot create WebGL contexts.
const srgb = value => Math.round((value <= .0031308 ? value * 12.92 : 1.055 * Math.max(0,value) ** (1 / 2.4) - .055) * 255);
const clamp = v => Math.max(0,Math.min(1,v));
export class SoftwareTownRenderer {
  constructor() {
    this.domElement=document.createElement("canvas");this.context=this.domElement.getContext("2d",{alpha:false});
    if(!this.context)throw new Error("Canvas is unavailable");
    this.shadowMap={};this.isSoftwareRenderer=true;this.previous="";this.last=0;this.retry=0;this.disposed=false;
    this.matrix=new THREE.Matrix4();this.instance=new THREE.Matrix4();this.world=new THREE.Matrix4();
    this.instanceColor=new THREE.Color();this.point=new THREE.Vector3();this.clip=new THREE.Vector4();this.textures=new WeakMap();
    this.srgb=new Uint8Array(4097);for(let i=0;i<=4096;i++)this.srgb[i]=srgb(i/4096);
  }
  setPixelRatio() {}
  setSize(width,height) {
    const ratio=Math.min(1,1000/width);this.width=Math.round(width*ratio);this.height=Math.round(height*ratio);
    this.domElement.width=this.width;this.domElement.height=this.height;
    this.image=this.context.createImageData(this.width,this.height);this.depth=new Float32Array(this.width*this.height);this.previous="";
  }
  dispose() {this.disposed=true;clearTimeout(this.retry);this.domElement.width=this.domElement.height=0;this.image=null;this.depth=null;}
  texture(map) {
    if(!map?.image)return null;
    if(this.textures.has(map))return this.textures.get(map);
    let result=null;const image=map.image;
    if(image.data && image.width && image.height)result={bytes:image.data,width:image.width,height:image.height,srgb:map.colorSpace===THREE.SRGBColorSpace};
    else try {const size=map.userData.forestCanopy?512:128,canvas=document.createElement("canvas");canvas.width=canvas.height=size;const ctx=canvas.getContext("2d");ctx.drawImage(image,0,0,size,size);result={bytes:ctx.getImageData(0,0,size,size).data,width:size,height:size,srgb:map.colorSpace===THREE.SRGBColorSpace};}catch{}
    this.textures.set(map,result);return result;
  }
  render(scene,camera) {
    if(this.disposed || !this.image)return;
    scene.updateMatrixWorld();camera.updateMatrixWorld();
    const meshes=[];let signature=camera.matrixWorld.elements.join(",")+camera.projectionMatrix.elements.join(",");
    scene.traverseVisible(o=>{if(o.isMesh){meshes.push(o);signature+=o.uuid+o.geometry.uuid+o.matrixWorld.elements.join(",")+o.material.color?.getHex()+o.material.opacity+o.material.map?.uuid;}});
    if(signature===this.previous)return;
    const now=performance.now();
    if(now-this.last<65 && this.previous){if(!this.retry)this.retry=setTimeout(()=>{this.retry=0;this.render(scene,camera)},65-(now-this.last));return;}
    clearTimeout(this.retry);this.retry=0;this.last=now;this.previous=signature;
    this.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    const w=this.width,h=this.height,bytes=this.image.data,zbuffer=this.depth,fog=scene.fog,canopies=[];
    zbuffer.fill(Infinity);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=(y*w+x)*4,t=y/h;bytes[i]=159+26*t;bytes[i+1]=190+16*t;bytes[i+2]=203+8*t;bytes[i+3]=255;
    }
    const project=(x,y,z,world)=>{
      this.point.set(x,y,z).applyMatrix4(world);const view=camera.matrixWorldInverse.elements;
      const distance=-(view[2]*this.point.x+view[6]*this.point.y+view[10]*this.point.z+view[14]);
      this.clip.set(this.point.x,this.point.y,this.point.z,1).applyMatrix4(this.matrix);
      const iw=1/this.clip.w;
      return{x:(this.clip.x*iw+1)*w/2,y:(1-this.clip.y*iw)*h/2,z:this.clip.z*iw,iw,distance};
    };
    const light=new THREE.Vector3(-.46,.79,.4);
    const pixel=(offset,r,g,b,alpha)=>{
      const i=offset*4;const cr=this.srgb[Math.round(clamp(r)*4096)],cg=this.srgb[Math.round(clamp(g)*4096)],cb=this.srgb[Math.round(clamp(b)*4096)];
      bytes[i]=bytes[i]*(1-alpha)+cr*alpha;bytes[i+1]=bytes[i+1]*(1-alpha)+cg*alpha;bytes[i+2]=bytes[i+2]*(1-alpha)+cb*alpha;
    };
    meshes.sort((a,b)=>(a.material.transparent?1:0)-(b.material.transparent?1:0));
    for(const mesh of meshes){
      const geometry=mesh.userData.softwareGeometry||mesh.geometry,material=mesh.material;
      if(Array.isArray(material)||material.opacity===0)continue;
      const pos=geometry.attributes.position,colors=geometry.attributes.color,uv=geometry.attributes.uv,index=geometry.index,normals=geometry.attributes.normal;
      const texture=this.texture(material.map),count=index?index.count:pos.count,instances=mesh.isInstancedMesh?mesh.count:1;
      for(let instance=0;instance<instances;instance++){
        this.world.copy(mesh.matrixWorld);this.instanceColor.copy(material.color||new THREE.Color(0xffffff));
        if(mesh.isInstancedMesh){mesh.getMatrixAt(instance,this.instance);this.world.multiply(this.instance);if(mesh.instanceColor){const c=new THREE.Color();mesh.getColorAt(instance,c);this.instanceColor.multiply(c);}}
        if(mesh.userData.canopy){const p=project(0,0,0,this.world),q=project(1,0,0,this.world);canopies.push({p,radius:Math.hypot(q.x-p.x,q.y-p.y),color:this.instanceColor.clone()});continue;}
        const vertices=new Array(pos.count);
        for(let i=0;i<pos.count;i++){
          const p=project(pos.getX(i),pos.getY(i),pos.getZ(i),this.world),c=this.instanceColor.clone();
          if(colors){c.r*=colors.getX(i);c.g*=colors.getY(i);c.b*=colors.getZ(i);}
          else if(normals&&!material.isMeshBasicMaterial){const n=new THREE.Vector3().fromBufferAttribute(normals,i).transformDirection(this.world);c.multiplyScalar(.56+.62*Math.max(0,n.dot(light)));}
          p.mist=(fog?clamp((p.distance-fog.near)/(fog.far-fog.near)):0)*p.iw;
          p.r=c.r*p.iw;p.g=c.g*p.iw;p.b=c.b*p.iw;p.u=uv?uv.getX(i)*p.iw:0;p.v=uv?uv.getY(i)*p.iw:0;vertices[i]=p;
        }
        for(let i=0;i<count;i+=3){
          const a=vertices[index?index.getX(i):i],b=vertices[index?index.getX(i+1):i+1],c=vertices[index?index.getX(i+2):i+2];
          if(!a||!b||!c||Math.min(a.iw,b.iw,c.iw)<=0||Math.min(a.z,b.z,c.z)<-1||Math.max(a.z,b.z,c.z)>1)continue;
          const area=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
          if(material.side!==THREE.DoubleSide&&area>=0||Math.abs(area)<.01)continue;
          const x0=Math.max(0,Math.floor(Math.min(a.x,b.x,c.x))),x1=Math.min(w-1,Math.ceil(Math.max(a.x,b.x,c.x)));
          const y0=Math.max(0,Math.floor(Math.min(a.y,b.y,c.y))),y1=Math.min(h-1,Math.ceil(Math.max(a.y,b.y,c.y)));
          for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
            const wa=((b.x-x-.5)*(c.y-y-.5)-(b.y-y-.5)*(c.x-x-.5))/area;
            const wb=((c.x-x-.5)*(a.y-y-.5)-(c.y-y-.5)*(a.x-x-.5))/area,wc=1-wa-wb;
            if(wa<-.00001||wb<-.00001||wc<-.00001)continue;
            const depth=wa*a.z+wb*b.z+wc*c.z,offset=y*w+x;if(depth>=zbuffer[offset])continue;
            const iw=wa*a.iw+wb*b.iw+wc*c.iw;
            let r=(wa*a.r+wb*b.r+wc*c.r)/iw,g=(wa*a.g+wb*b.g+wc*c.g)/iw,blue=(wa*a.b+wb*b.b+wc*c.b)/iw;
            if(texture&&uv){const u=(wa*a.u+wb*b.u+wc*c.u)/iw,v=(wa*a.v+wb*b.v+wc*c.v)/iw;const tx=Math.floor(((u%1+1)%1)*texture.width),ty=Math.floor(((v%1+1)%1)*texture.height),j=(ty*texture.width+tx)*4,t=texture.bytes;let tr=t[j]/255,tg=t[j+1]/255,tb=t[j+2]/255;if(texture.srgb){tr=tr**2.2;tg=tg**2.2;tb=tb**2.2;}r*=tr;g*=tg;blue*=tb;}
            const mist=(wa*a.mist+wb*b.mist+wc*c.mist)/iw;
            if(fog){r=r*(1-mist)+fog.color.r*mist;g=g*(1-mist)+fog.color.g*mist;blue=blue*(1-mist)+fog.color.b*mist;}
            pixel(offset,r,g,blue,material.opacity??1);zbuffer[offset]=depth;
          }
        }
      }
    }
    for(const {p,radius,color}of canopies){
      if(p.iw<=0||p.z<-1||p.z>1||radius<.2)continue;
      const mist=fog?clamp((p.distance-fog.near)/(fog.far-fog.near)):0;if(mist)color.lerp(fog.color,mist);
      const rx=Math.max(.5,radius),ry=rx*.85;
      for(let y=Math.max(0,Math.floor(p.y-ry));y<=Math.min(h-1,Math.ceil(p.y+ry));y++)for(let x=Math.max(0,Math.floor(p.x-rx));x<=Math.min(w-1,Math.ceil(p.x+rx));x++){
        const nx=(x+.5-p.x)/rx,ny=(y+.5-p.y)/ry,d=nx*nx+ny*ny,offset=y*w+x;
        if(d>1||p.z>=zbuffer[offset])continue;const shade=.68+.32*Math.sqrt(1-d)-nx*.12;
        pixel(offset,color.r*shade,color.g*shade,color.b*shade,.95);zbuffer[offset]=p.z;
      }
    }
    this.context.putImageData(this.image,0,0);
  }
}
