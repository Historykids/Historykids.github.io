(function(){
 'use strict';
 const $=id=>document.getElementById(id),M=window.HKAmounts;
 const rooms={
  silver:{number:'II',en:'THE LUNAR SALON',title:'月光を纏う、銀の宮殿。',name:'銀のルーレット',copy:'白銀の回廊。星を映す盤面。その一球が、静寂を変える。',required:2,feature:'37 POCKETS / SILVER EDITION',win:'MOONLIT VICTORY',seal:'月'},
  gold:{number:'V',en:'THE PHOENIX VAULT',title:'黄金が、目を覚ます。',name:'金のスロット',copy:'鳳凰の紋章、磨かれた金塊、きらめく宝石。八つのラインに、栄光を。',required:5,feature:'8 LINES / GOLDEN EDITION',win:'GOLDEN FORTUNE',seal:'鳳'},
  king:{number:'X',en:'THE SOVEREIGN’S CHAMBER',title:'王者の卓で、腕を競え。',name:'王者のポーカー',copy:'リボーン10回を越えた者たちが、王者の部屋に集う。五枚の手札で、王者を決める。',required:10,feature:'ROYAL ROOMS / 2–6 PLAYERS',win:'ROYAL TRIUMPH',seal:'王'},
  sovereign:{number:'XV',en:'THE IMPERIAL TREASURY',title:'その王冠に、さらなる黄金を。',name:'王者のスロット',copy:'深紅の宝石、王家の金塊、三つの7。通常台の1.2倍の配当を、王者の特等席で。',required:15,feature:'8 LINES / PAYOUT ×1.2',win:'IMPERIAL JACKPOT',seal:'帝'},
  emperor:{number:'XX',en:'THE GOLDEN PAVILION',title:'銀の玉が、黄金を呼ぶ。',name:'パチンコ',copy:'幾重もの釘をくぐり、玉は運命の入賞口へ。十球の軌跡と、三つの数字。二十の転生を越えた、黄金の一台。',required:20,feature:'10 BALLS / GOLDEN PACHINKO',win:'GOLDEN FEVER',seal:'極'}
 };
 let serial=0,current='',finaleTimer;
 function svg(body,theme='gold',view='0 0 100 100'){
  const id='vip-ink-'+(++serial),silver=theme==='silver',a=silver?'#ffffff':'#fff1be',b=silver?'#a6c5df':'#e6b650',c=silver?'#465f7a':'#7f4a16';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+view+'" aria-hidden="true" focusable="false"><defs><linearGradient id="'+id+'" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+a+'"/><stop offset=".35" stop-color="'+b+'"/><stop offset=".52" stop-color="'+a+'"/><stop offset="1" stop-color="'+c+'"/></linearGradient></defs><g fill="url(#'+id+')" stroke="'+b+'" stroke-width="1.2" stroke-linejoin="round">'+body+'</g></svg>';
 }
 const crown='<path d="M19 35 33 49 50 22 67 49 81 35 72 73H28Z"/><path d="M27 78H73V85H27Z"/><circle cx="18" cy="32" r="4"/><circle cx="50" cy="17" r="4"/><circle cx="82" cy="32" r="4"/><path d="m50 49 7 9-7 9-7-9Z" fill="#442149"/><path d="M31 69H69" fill="none" stroke="#fff4c7"/>';
 const phoenix='<path d="M50 38Q23 10 7 20 17 30 33 40 15 30 8 38 23 53 39 52 18 49 19 61 35 68 46 53L37 87 50 74 63 87 54 53Q69 69 81 61 80 49 61 52 81 49 92 38 85 31 67 40 86 28 93 20 77 10 50 38Z"/><path d="M46 43Q43 22 54 24L61 30 54 32 56 44Z"/><path d="M25 29 43 44M17 40 39 47M75 29 57 44M83 40 61 47M50 51V69" fill="none" stroke="#fff3c0"/>';
 function crest(theme){return svg(theme==='silver'?'<path d="M65 14A38 38 0 1 0 85 67A32 32 0 0 1 65 14Z"/><path d="m69 32 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z"/><circle cx="29" cy="67" r="3"/>':theme==='gold'?phoenix:crown,theme);}
 function symbol(id){
  const shapes={
   lemon:'<path d="M17 34 32 16H68L83 34 50 85Z" fill="#68c4e6"/><path d="m17 34 33 51-18-51 18-18 18 18-18 51 33-51ZM17 34H83M32 16V34M68 16V34" fill="none" stroke="#e3fbff" stroke-width="2"/>',
   bell:crown,
   bar:'<path d="m22 34 40-9 19 23-4 26-55 9-7-25Z"/><path d="m15 58 42-9 24-1M57 49l5-24M57 49l-1 29" fill="none" stroke="#fff0b6"/><text x="34" y="65" fill="#7e4718" stroke="none" font-size="14" font-weight="900" transform="rotate(-10 34 65)">BAR</text>',
   seven:'<path d="M20 18H81V34Q58 54 48 84H24Q39 48 59 34H20Z"/><path d="M26 23H73M30 78Q42 51 65 32" fill="none" stroke="#fff5d1" stroke-width="2"/>',
   bonus:phoenix,
   cherry:'<path d="M33 59Q36 34 58 19 54 44 65 57M57 20Q80 11 84 28 68 35 57 20Z" fill="#79976d" stroke="#a3bb7b"/><circle cx="31" cy="66" r="19" fill="#a91d3d" stroke="#e7997c"/><circle cx="67" cy="70" r="18" fill="#c63248" stroke="#f0a88b"/><path d="M20 60q1-7 9-8M57 64q2-7 9-7" fill="none" stroke="#ffd6ba" stroke-width="3"/>'
  };return svg(shapes[id]||crown);
 }
 function roomArt(theme){
  const spokes=Array.from({length:48},(_,i)=>'<path d="M160 36V45" transform="rotate('+(i*7.5)+' 160 160)"/>').join('');
  const inner=theme==='emperor'?'<path d="M88 245V104Q90 61 160 61T232 104V245Z" fill="#143139"/><ellipse cx="160" cy="161" rx="60" ry="81" fill="none"/><path d="M131 104H189V135H131Z" fill="#d2b97d"/><text x="160" y="127" text-anchor="middle" font-size="23" stroke="none" fill="#722d30">777</text>'+Array.from({length:25},(_,i)=>'<circle cx="'+(120+(i%5)*20)+'" cy="'+(152+Math.floor(i/5)*13)+'" r="2"/>').join('')+'<path d="M139 218H181V233H139Z"/><circle cx="219" cy="218" r="8" fill="#e9f3f6"/>':theme==='silver'?'<circle cx="160" cy="160" r="98" fill="#111d34"/><circle cx="160" cy="160" r="91" fill="none"/>'+Array.from({length:18},(_,i)=>'<path d="m160 73 8 78-8 82-8-82Z" fill="none" opacity=".3" transform="rotate('+(i*20)+' 160 160)"/>').join('')+'<circle cx="160" cy="160" r="48" fill="#152842"/><g transform="translate(110 110)">'+crown+'</g>':['gold','sovereign'].includes(theme)?'<path d="M92 242V105Q92 73 160 73T228 105V242Z" fill="#1d1411"/><path d="M106 117H214V204H106Z"/><path d="M112 123H208V198H112Z" fill="#30221b"/>'+[0,1,2].map(i=>'<text x="'+(125+i*35)+'" y="176" text-anchor="middle" stroke="none" fill="#fff0bf" font-size="48" font-family="serif" font-weight="900">7</text>').join('')+'<g transform="translate(129 60) scale(.62)">'+phoenix+'</g><path d="M106 216H214M115 228H205" fill="none"/>':'<path d="m70 126 39-33 82 107-39 33Z" fill="#c4a963"/><path d="m112 90 45-13 36 131-45 13Z" fill="#e3cca0"/><path d="M154 82H221V218H154Z" fill="#fff0cf"/><path d="M159 87H216V213H159Z" fill="none"/><text x="166" y="109" font-size="20" stroke="none" fill="#36233e">A</text><text x="187" y="169" text-anchor="middle" font-size="48" stroke="none" fill="#36233e">♠</text><g transform="translate(140 210) scale(.42)">'+crown+'</g>';
  return svg('<circle cx="160" cy="160" r="142" fill="none" opacity=".2"/><circle cx="160" cy="160" r="130" fill="none" stroke-width="2"/><circle cx="160" cy="160" r="117" fill="none" opacity=".45"/>'+spokes+inner,theme,'0 0 320 320');
 }
 function render({variant,rebirths,locked,busy,factor}){
  const room=rooms[variant],hero=$('vipRoom');if(!hero)return;const classicSlot=variant==='sovereign'&&!locked;hero.hidden=!room||classicSlot;document.body.classList.toggle('vip-active',!!room&&!classicSlot);document.body.dataset.vipLocked=String(!!room&&locked);
  if(!room||classicSlot){current='';$('vipFinale').hidden=true;clearTimeout(finaleTimer);return;}
  if(current!==variant){
   current=variant;$('vipRoomArt').innerHTML=roomArt(variant);$('vipRoomNumber').textContent=room.number;$('vipRoomEnglish').textContent=room.en;$('vipRoomTitle').textContent=room.title;$('vipRoomCopy').textContent=room.copy;$('vipRoomFeature').textContent=room.feature;
   $('vipLockArt').innerHTML=crest(variant);$('vipLockRoom').textContent=room.en;$('vipLockSeal').textContent=room.seal;$('vipFinale').hidden=true;$('tableArea').dataset.vipPhase='idle';clearTimeout(finaleTimer);
  }
  $('vipRoomAccess').textContent=locked?'リボーン '+room.required+'回で入場':'VIP ACCESS GRANTED';$('vipRoom').classList.toggle('vip-is-locked',locked);
  $('vipRoomRate').textContent='配当 ×'+factor;$('vipRoomStatus').textContent=locked?'LOCKED COLLECTION':'EXCLUSIVE COLLECTION';
  const remaining=Math.max(0,room.required-rebirths);$('vipLockRemaining').textContent='あと '+remaining+'回のリボーンで、この席へ。';$('vipLockProgress').max=room.required;$('vipLockProgress').value=Math.min(rebirths,room.required);$('vipLockCount').textContent=rebirths+' / '+room.required+' REBIRTHS';
  if(busy)$('tableArea').dataset.vipPhase='playing';else if($('tableArea').dataset.vipPhase==='playing')$('tableArea').dataset.vipPhase='idle';
 }
 function start(variant){if(!rooms[variant]||variant==='sovereign')return;clearTimeout(finaleTimer);$('vipFinale').hidden=true;$('tableArea').dataset.vipPhase='playing';}
 function present(round,{net,fast}){
  const room=rooms[round.variant];if(!room||round.variant==='sovereign'){$('vipFinale').hidden=true;return;}
  const win=M.cmp(net,0)>0,bonus=round.data?.bonusTriggered;$('tableArea').dataset.vipPhase=win||bonus?'victory':'idle';
  if(!win&&!bonus){$('vipFinale').hidden=true;return;}
  $('vipFinaleCrest').innerHTML=crest(round.variant);$('vipFinaleTitle').textContent=bonus?'PHOENIX AWAKENED':room.win;$('vipFinaleLabel').textContent=bonus?'無料スピン5回を獲得':'払い戻し';$('vipFinaleAmount').textContent=bonus?'BONUS × 5':M.format(round.creditedPayout??round.payout)+'両';
  const el=$('vipFinale');clearTimeout(finaleTimer);el.classList.remove('vip-finale-enter');el.hidden=false;if(!fast){void el.offsetWidth;el.classList.add('vip-finale-enter');}finaleTimer=setTimeout(()=>{el.hidden=true;},fast?1800:4200);
 }
 function cardFace(card){return card?svg('<path d="M50 8 82 20V55Q78 76 50 92 22 76 18 55V20Z" fill="none"/><g transform="translate(14 12) scale(.72)">'+crown+'</g><text x="50" y="79" text-anchor="middle" fill="currentColor" stroke="none" font-size="22" font-family="serif">'+({S:'♠',H:'♥',D:'♦',C:'♣'}[card[1]])+'</text>','gold'):crest('king');}
 window.HKCasinoVIP=Object.freeze({render,start,present,symbol,cardFace});
})();
