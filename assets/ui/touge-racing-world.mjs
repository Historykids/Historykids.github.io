// Geometric scenery used by both the WebGL and Canvas renderers.
export function worldScenery(track) {
  const shapes = [];
  const scale = track.layoutScale ?? 1;
  const mesh = (color, vertices, faces) => shapes.push({
    color, vertices: vertices.map(point => point.map(value => value * scale)), faces
  });
  const ring = (x, y, z, w, d, n, rotation) => Array.from({ length: n }, (_, i) => {
    const a = (i + .5) * Math.PI * 2 / n + rotation;
    return [x + Math.cos(a) * w / 2, y, z + Math.sin(a) * d / 2];
  });
  function tower(x, z, w, d, base, height, top, color, n = 4) {
    const lower = ring(x, base, z, w, d, n, 0);
    const upper = ring(x, base + height, z, w * top, d * top, n, 0);
    const faces = [Array.from({ length: n }, (_, i) => n * 2 - 1 - i)];
    for (let i = 0; i < n; i++) faces.push([i, n + i, n + (i + 1) % n, (i + 1) % n]);
    mesh(color, lower.concat(upper), faces);
  }
  const box = (x, z, w, d, y, h, color) => tower(x, z, w * Math.SQRT2, d * Math.SQRT2, y, h, 1, color);
  const peak = (x, z, w, d, h, color, n = 4) => tower(x, z, w, d, 0, h, 0, color, n);
  function beam(a, b, width, color) {
    const angle = Math.atan2(b[0] - a[0], b[2] - a[2]);
    const dx = Math.cos(angle) * width / 2, dz = -Math.sin(angle) * width / 2;
    const verts = [a, b].flatMap(([x,y,z]) =>
      [[x-dx,y-width/2,z-dz],[x+dx,y-width/2,z+dz],[x+dx,y+width/2,z+dz],[x-dx,y+width/2,z-dz]]);
    mesh(color, verts, [[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]]);
  }

  if(track.signature){
    // Place small structures in road coordinates so the driver passes them at close range.
    for(let i=0;i<42;i++){
      const road=track.sample((i+.36)*track.length/42),sign=i%2?1:-1;
      const offset=(track.halfWidth+10+i%4*3)*sign;
      const x=(road.x+road.rx*offset)/scale,z=(road.z+road.rz*offset)/scale;
      if(track.id==="firn"){
        if(i%5===0){
          box(x,z,5.4,3.8,0,2.6,"#927d69");
          mesh("#625c59",[[x-3,2.6,z-2.3],[x+3,2.6,z-2.3],[x+3,3.9,z],[x-3,3.9,z],[x-3,2.6,z+2.3],[x+3,2.6,z+2.3]],[[0,1,2,3],[3,2,5,4],[0,3,4],[1,5,2]]);
          for(const dx of [-1.65,0,1.65])box(x+dx,z-1.91,.8,.1,1.15,.8,"#344951");
        }else for(let k=0;k<3;k++){
          const tx=x+(k-1)*1.35,tz=z+k*1.9,h=3.4+(i+k)%4;
          tower(tx,tz,.37,.37,0,h*.4,.85,"#655d51",5);
          for(let layer=0;layer<3;layer++)tower(tx,tz,h*(.56-.11*layer),h*(.51-.1*layer),h*(.18+layer*.2),h*.46,.05,layer===2?"#4b6057":"#344d43",7);
        }
      }else if(track.id==="meridian"){
        box(x,z,.18,.2,0,4.8,"#6a6e72"); beam([x,4.8,z],[x+road.rx*1.3,5.1,z+road.rz*1.3],.13,"#818481");
        box(x+road.rx*1.3,z+road.rz*1.3,.58,.35,5,.1,"#ffdfb4");
        if(i%3===0){
          const tx=x+road.rx*sign*6,tz=z+road.rz*sign*6,h=5+i%12;
          box(tx,tz,6,5,0,h,"#455660");
          for(let y=1;y<h;y+=1.2)box(tx,tz,6.12,5.12,y,.16,"#aaa498");
        }
      }else{
        for(let k=0;k<4;k++){
          const r=1+(i+k)%3,tx=x+k*1.4,tz=z+Math.sin(k+i)*2;
          tower(tx,tz,r*1.8,r*1.3,0,r*.71,.55,k%2?"#494846":"#585452",7);
        }
        if(i%3===0){
          beam([x,0,z],[x+.6,4.6,z+.35],.28,"#776b54");
          for(let leaf=0;leaf<8;leaf++){
            const a=leaf*Math.PI/4+i,dx=Math.cos(a),dz=Math.sin(a);
            mesh(leaf%2?"#526f4f":"#395544",[[x+.6,4.7,z+.35],[x+1.6*dx-.44*dz,5.15,z+1.6*dz+.44*dx],[x+3.4*dx,3.9,z+3.4*dz],[x+1.6*dx+.44*dz,5.15,z+1.6*dz-.44*dx]],[[0,1,2],[0,2,3]]);
          }
        }
      }
    }
  }
  switch (track.id) {
    case "firn": {
      // Layer broken rock faces below a continuous, irregular snow line.
      for(let bank=0;bank<2;bank++){
        const side=bank?1:-1;
        let previous;
        for(let i=0;i<=48;i++){
          const x=-310+i*13, height=36+22*Math.sin(i*.52)**2+19*Math.cos(i*.29)+7*Math.sin(i*1.9);
          const z=side*(147+15*Math.sin(i*.37));
          const section=[[x,0,z],[x+3,height*.48,z+side*15],[x-2,height*.78,z+side*25],[x,height,z+side*37]];
          if(previous)for(let band=0;band<3;band++){
            const tones=[["#56655f","#68716b"],["#71818a","#879496"],["#d4dfe0","#edf1ec"]][band];
            const a=previous[band],b=section[band],c=section[band+1],d=previous[band+1];
            mesh(tones[i%2],[a,b,c],[[0,1,2]]);
            mesh(tones[(i+1)%2],[a,c,d],[[0,1,2]]);
          }
          previous=section;
        }
      }
      for(let i=0;i<10;i++){
        const x=-129+i*15,z=82+Math.sin(i*.55)*5;
        box(x,z,2.7,3.4,0,12,"#87877b"); box(x,z,15.5,4.2,12,1,"#6e736e");
        for(const side of [-1,1])box(x,z+side,15,.12,13,.18,"#454e50");
        if(i<6){box(x,z,9.8,3.1,13.3,2.9,"#a24738");box(x,z+.01,10.2,3.3,16.2,.35,"#535b5b");
          for(const gap of [-3,-1,1,3])box(x+gap,z-1.57,1.35,.1,14.6,1.05,"#94afbb");}
      }
      break;
    }
    case "meridian": {
      for(let i=0;i<32;i++){
        const x=-160+(i%16)*21,z=100+Math.floor(i/16)*25+(i%3)*3;
        const h=15+(i*19)%47+(i===8?42:0), w=8+i%5,d=8+i%3;
        const glass=["#435865","#526573","#66636b"][i%3];
        box(x,z,w,d,0,h,glass);
        for(let y=2;y<h-1;y+=3.3)box(x,z,w+.13,d+.13,y,.19,y%5>2?"#a49a89":"#777788");
        for(const col of [-.34,0,.34])box(x+w*col,z-d*.5,w*.026,.18,0,h,"#87959b");
        box(x,z,w*.76,d*.8,h,2.4,glass);
        if(i%4===0)beam([x,h+2.4,z],[x,h+9,z],.24,"#a6aaad");
      }
      for(let i=0;i<14;i++){
        const x=-117+(i%7)*14,z=-91-Math.floor(i/7)*8;
        box(x,z,12,4.2,0,4,"#8c6857");box(x,z,11.9,4.2,4.1,4,i%3?"#5c7779":"#925b45");
      }
      for(const x of [-108,-49,10]){
        for(const dx of [-4,4])box(x+dx,-105,1.1,5,0,20,"#b98356");
        beam([x-8,20,-105],[x+23,20,-105],1.2,"#cf9867");
        beam([x-4,20,-105],[x+3,28,-105],.55,"#bf885d");
        beam([x+3,28,-105],[x+23,20,-105],.55,"#bf885d");
      }
      break;
    }
    case "puna": {
      const coast=i=>109+7*Math.sin(i*.54)+4*Math.cos(i*1.1);
      for(let i=0;i<52;i++){
        const x=-260+10*i,z=coast(i),next=coast(i+1);
        for(const [offset,width,color] of [[0,5,"#252d31"],[5,2,"#d3e0d7"],[7,11,"#57999a"],[18,250,"#265e70"]]){
          mesh(color,[[x,1,z+offset],[x+10,1,next+offset],[x+10,1,next+offset+width],[x,1,z+offset+width]],[[0,1,2,3]]);
        }
      }
      for(let i=0;i<38;i++){
        const x=-168+9*i,z=-99-(i*17)%21;
        tower(x,z,19,15,0,9+(i*13)%17,.66,i%2?"#534c49":"#645a54",7);
      }
      for(let i=0;i<27;i++){
        const x=-145+11*i,z=coast(i)-6;
        beam([x,0,z],[x+1,6,z+.4],.48,"#796854");
        for(let j=0;j<7;j++){
          const a=j*.897+i,dx=Math.cos(a),dz=Math.sin(a);
          mesh(j%2?"#47634d":"#334e40",[[x+1,6,z+.4],[x+1+dx*2-dz*.5,6.8,z+dz*2+dx*.5],[x+1+dx*4.6,5,z+dz*4.6],[x+1+dx*2+dz*.5,6.8,z+dz*2-dx*.5]],[[0,1,2],[0,2,3]]);
        }
      }
      tower(98,98,4,4,0,11,.65,"#e1d6bd",12);
      tower(98,98,3.3,3.3,11,1.8,1,"#62473e",12);
      tower(98,98,2.8,2.8,12.8,2.1,1,"#ffe0a2",12);
      tower(98,98,4,4,14.9,1.7,.1,"#6c443c",12);
      break;
    }
    case "cloudpass":
      for(let i=0;i<9;i++){
        const x=150+i*19,z=100+(i*37)%120,h=45+(i*17)%60;
        tower(x,z,48,43,0,h,.17,"#718b9d",7);
        tower(x,z,11,10,h,13,0,"#eefaff",7);
      }
      for(let i=0;i<6;i++){box(-150+i*55,100,5,5,0,28,"#526b80");beam([-150+i*55,28,100],[-95+i*55,28,100],1.2,"#aecbd8");}
      break;
    case "dunefly":
      for(let i=0;i<16;i++){
        const x=160+(i%4)*18,z=100+Math.floor(i/4)*24,h=20+(i*19)%80;
        tower(x,z,10,11,0,h,.65,i%2?"#50788d":"#caaf81",6);
        tower(x,z,4,4,h,18,0,"#d5eef4",5);
      }
      for(let i=0;i<7;i++)tower(-175,95+i*20,65,42,0,10+i*2,.3,"#d8aa6c",8);
      break;
    case "lavacoast":
      tower(170,140,130,110,0,95,.19,"#613f46",10);
      tower(170,140,27,23,95,3,.88,"#ff873d",10);
      for(let i=0;i<9;i++){
        const x=133+i*13,z=90+(i*23)%115;
        tower(x,z,12,14,0,20+(i*7)%27,.2,"#403c4e",7);
        box(x,z,2,9,21,.4,"#ff7346");
      }
      break;
    case "fuji":
      tower(204, 115, 145, 118, 0, 58, .39, "#647d9a", 10);
      tower(204, 115, 57, 46, 58, 37, 0, "#eff9fc", 10);
      for (let i = 0; i < 12; i++) {
        const x = -60 + i * 14, z = 104 + (i % 3) * 4;
        box(x,z,.6,.6,0,4.2,"#6c413f");
        tower(x,z,5.5,5.5,3,4,.44, i % 2 ? "#ecb0cf" : "#d78fa9", 7);
      }
      break;
    case "amalfi":
      for (let row = 0; row < 5; row++) {
        const x = 146 + row * 16, y = row * 7;
        box(x,121,24,83,0,y+1.4,"#ac8f69");
        for (let col = 0; col < 6; col++) {
          const z = 90 + col * 12, color = ["#f4cb99","#e39065","#eeb5a0","#e7e0c9"][(row + col) % 4];
          box(x,z,9,9,y+1.3,6 + (row+col)%4,color);
          box(x,z,10.4,10.4,y+7.3+(row+col)%4,.9,"#a95144");
        }
      }
      break;
    case "paris":
      for (const dx of [-1,1]) for (const dz of [-1,1]) {
        beam([183+dx*17,0,118+dz*17],[183+dx*7,29,118+dz*7],2.4,"#dfae65");
        beam([183+dx*7,29,118+dz*7],[183,76,118],2.1,"#ffd184");
      }
      for (const [y,w] of [[18,25],[31,16],[53,8]]) box(183,118,w,w,y,1.4,"#efc478");
      box(183,118,.85,.85,76,9,"#ffdf9c");
      for(let i=0;i<9;i++) {
        const z=94+i*11, x=209+(i%3)*11;
        box(x,z,9,9,0,9+(i%4)*3,"#7b7185");
        box(x-4.6,z,.3,6,5,.42,"#fed596");
      }
      break;
    case "iceland":
      for(let i=0;i<13;i++) {
        const x=145+i*8,z=104+(i*19)%72,h=9+(i*11)%26;
        tower(x,z,7+(i%3)*2,7,0,h,.24,i%2?"#b9e6f8":"#78b7d7",5);
      }
      for(let i=0;i<6;i++) {
        const x=162+i*17,z=169+(i%2)*13;
        tower(x,z,42,32,0,38+(i*7)%24,.21,"#dfedf5",6);
      }
      break;
    case "giza":
      peak(172,113,63,63,39,"#daab6d");
      peak(219,135,77,77,54,"#e6bb7c");
      peak(258,161,48,48,31,"#c9945f");
      for(let i=0;i<7;i++) {
        box(131+i*12,101,1.5,1.5,0,7,"#987449");
        tower(131+i*12,101,7,6,6,3,.3,"#5f805c",6);
      }
      break;
    case "monument":
      for(let i=0;i<8;i++) {
        const x=172+i*13,z=103+(i*29)%82,w=14+(i%3)*9,h=14+(i*8)%29;
        tower(x,z,w,w*.85,0,h,.56,"#a65239",7);
        tower(x,z,w*.57,w*.49,h,4.8,.79,"#dc8861",7);
      }
      break;
    case "rio":
      tower(192,123,53,42,0,44,.39,"#47755d",9);
      box(192,123,2.9,2.4,44,12,"#f4e5d7");
      box(192,123,15,2,52,2.1,"#f4e5d7");
      tower(221,152,33,27,0,40,.42,"#557d63",8);
      for(let i=0;i<10;i++) {
        const x=151+i*9,z=108+(i%2)*7;
        box(x,z,1,1,0,6,"#866147");
        tower(x,z,8,6,5.5,3,.38,"#497b59",7);
      }
      break;
    case "singapore":
      for(let i=0;i<3;i++) {
        box(180,107+i*15,11,9,0,39,"#8ca7bf");
        for(const y of [8,15,22,29,36]) box(174.4,107+i*15,.25,7,y,.42,"#a5e7ed");
      }
      tower(180,122,22,59,38.5,5,.83,"#d3dfec",7);
      for(let i=0;i<11;i++) {
        const h=15+(i*13)%35;
        box(205+(i%3)*14,96+i*9,10,7,0,h,"#526995");
        box(199.9+(i%3)*14,96+i*9,.24,5,h*.64,.6,"#ffce85");
      }
      break;
    case "sydney":
      for(let i=0;i<7;i++) {
        const x=167+i*7, z=114+(i%2)*3, h=15+(i*5)%13;
        mesh(i%2?"#e5ecef":"#fff3db",[[x-5,1,z-6],[x+9,1,z+8],[x+4,h,z],[x-1,4,z+9]],[[0,1,2],[0,2,3],[1,3,2]]);
      }
      box(188,119,56,29,0,1.5,"#cbb49c");
      for(let i=0;i<10;i++) {
        const span=12, z0=141+i*span, z1=z0+span;
        const arc = t => 10+23*Math.sin(t*Math.PI/10);
        beam([208,arc(i),z0],[208,arc(i+1),z1],1.8,"#455965");
        beam([211,10,z0],[211,10,z1],2.8,"#506978");
        beam([208,10,z0],[208,arc(i),z0],.9,"#596d78");
      }
      break;
    case "alpine":
      for(let i=0;i<5;i++) {
        const x=155+i*24,z=129+(i*17)%62,h=33+(i*13)%35;
        tower(x,z,47,47,0,h,.25,"#687c76",5);
        tower(x,z,12,12,h,9,.08,"#e7ece6",5);
      }
      for(let i=0;i<4;i++) {
        box(155+i*12,106,8,7,0,4,"#a85b4e");
        tower(155+i*12,106,12,10,4,2.6,.26,"#533e3b");
      }
      break;
  }
  return shapes;
}
