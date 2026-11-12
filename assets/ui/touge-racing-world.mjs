// Geometric scenery used by both the WebGL and Canvas renderers.
export function worldScenery(track) {
  const shapes = [];
  const mesh = (color, vertices, faces) => shapes.push({ color, vertices, faces });
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

  switch (track.id) {
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
