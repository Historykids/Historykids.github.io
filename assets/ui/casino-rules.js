(function (root) {
  'use strict';
  const wheel = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
  const red = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  const symbols = [
    { id:'cherry', icon:'🍒', name:'チェリー', weight:7, multiplier:5 },
    { id:'lemon', icon:'🍋', name:'レモン', weight:5, multiplier:10 },
    { id:'bell', icon:'🔔', name:'ベル', weight:4, multiplier:20 },
    { id:'bar', icon:'BAR', name:'BAR', weight:3, multiplier:50 },
    { id:'seven', icon:'7', name:'7', weight:1, multiplier:250 },
  ];
  const strip = symbols.flatMap(s => Array(s.weight).fill(s.id));
  function randomIndex(length) {
    if (!Number.isInteger(length) || length < 1 || length > 100000) throw Error('random-range');
    const max = Math.floor(4294967296 / length) * length, bytes = new Uint32Array(1);
    do { root.crypto.getRandomValues(bytes); } while (bytes[0] >= max);
    return bytes[0] % length;
  }
  function janken(player, opponent) {
    if (![0,1,2].includes(player) || ![0,1,2].includes(opponent)) throw Error('invalid-hand');
    return player === opponent ? 1 : (player + 1) % 3 === opponent ? 2 : 0;
  }
  function color(number) { return number === 0 ? 'green' : red.has(number) ? 'red' : 'black'; }
  function bet(id) {
    if (/^n(?:[0-9]|[12][0-9]|3[0-6])$/.test(id)) return { id, label: id.slice(1), numbers: [Number(id.slice(1))], multiplier: 36 };
    const all = Array.from({ length: 36 }, (_, i) => i + 1);
    const outside = {
      red:['赤',n=>red.has(n),2], black:['黒',n=>!red.has(n),2],
      odd:['奇数',n=>n%2===1,2], even:['偶数',n=>n%2===0,2],
      low:['1〜18',n=>n<=18,2], high:['19〜36',n=>n>=19,2],
      d1:['1〜12',n=>n<=12,3],d2:['13〜24',n=>n>=13&&n<=24,3],d3:['25〜36',n=>n>=25,3],
      c1:['縦列1',n=>(n-1)%3===0,3],c2:['縦列2',n=>(n-2)%3===0,3],c3:['縦列3',n=>n%3===0,3],
    };
    const b = outside[id];
    if (!b) throw Error('invalid-position');
    return { id, label:b[0], numbers:all.filter(b[1]), multiplier:b[2] };
  }
  function roulette(bets, number) {
    if (!Number.isInteger(number) || number < 0 || number > 36 || !Array.isArray(bets) || !bets.length) throw Error('invalid-round');
    return bets.reduce((sum, chip) => { if (!Number.isSafeInteger(chip.stake) || chip.stake <= 0) throw Error('invalid-bet'); const b=bet(chip.id); return sum + (b.numbers.includes(number) ? chip.stake*b.multiplier : 0); }, 0);
  }
  function slots(reels) {
    if (!Array.isArray(reels) || reels.length !== 3 || reels.some(id=>!symbols.some(s=>s.id===id))) throw Error('invalid-reels');
    if (reels.every(id=>id===reels[0])) return { multiplier:symbols.find(s=>s.id===reels[0]).multiplier, title:symbols.find(s=>s.id===reels[0]).name+'が3つ！' };
    return reels.filter(id=>id==='cherry').length===2 ? { multiplier:1, title:'チェリー2つ · 掛け金返還' } : { multiplier:0, title:'今回はそろわず' };
  }
  const rules = { wheel, symbols, strip, randomIndex, janken, color, bet, roulette, slots };
  root.HKCasinoRules = rules;
  if (typeof module !== 'undefined' && module.exports) module.exports = rules;
})(typeof window !== 'undefined' ? window : globalThis);
