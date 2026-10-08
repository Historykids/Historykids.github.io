(function () {
  'use strict';
  const W = window.HKWallet, R = window.HKCasinoRules, $ = id => document.getElementById(id);
  const names = { janken:'じゃんけん', roulette:'ルーレット', slots:'スロット', bitcoin:'ビットコイン予想', sicbo:'大小' };
  const hands = ['✊','✌️','🖐️'], handNames = ['グー','チョキ','パー'];
  const money = n => n.toLocaleString('ja-JP')+'両';
  const esc = v => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let game='janken', hand=0, chips=[], active=null, starting=false, settling=false, rotation=0, audio=null, sound=false;
  let sicboChips=[];
  const B = window.HKBitcoinRules;
  let btcRange = 60;
  let direction = 'up', btcFeed = null, btcState = {quote:null,points:[],live:false}, btcTimer = null;
  const usd = n => '$' + n.toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2});
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const fast = () => reduced || $('quickToggle').checked;
  const stake = () => Number($('stake').value);
  const bonus = () => W.snapshot().slotBonus?.remaining>0 ? W.snapshot().slotBonus : null;
  const total = () => game==='roulette' ? chips.reduce((n,b)=>n+b.stake,0) : game==='sicbo' ? sicboChips.reduce((n,b)=>n+b.stake,0) : game==='slots'&&bonus() ? bonus().stake : stake();
  const validStake = n => Number.isSafeInteger(n) && n>=1 && n<=1000;
  const status = (text,error=false) => { $('casinoStatus').textContent=text; $('casinoStatus').classList.toggle('error',error); };
  function tone(kind) {
    if (!sound) return;
    try {
      audio ||= new (window.AudioContext||window.webkitAudioContext)(); audio.resume();
      const sequence=kind==='win'?[523,659,784,1047]:kind==='big'?[523,659,784,1047,1319,1568]:kind==='lose'?[220,165]:kind==='tick'?[650]:[330,440];
      sequence.forEach((hz,i)=>{const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime+i*.10;o.type=kind==='tick'?'triangle':'sine';o.frequency.value=hz;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.07,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+.13);o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+.15);});
    } catch { sound=false; $('soundToggle').textContent='音 OFF'; $('soundToggle').setAttribute('aria-pressed','false'); }
  }
  function rulesHTML() {
    if(game==='sicbo')return '<p>盤面を押すたび、選んだ両を置きます。複数の場所に賭けられ、合計1,000両まで。各サイコロは1〜6から独立に同じ確率で抽選します。</p><table><tr><th>小・大（ゾロ目は負け）</th><td>2倍</td></tr><tr><th>指定のダブル（同じ目が2個以上）</th><td>12倍</td></tr><tr><th>指定のゾロ目</th><td>181倍</td></tr><tr><th>いずれかのゾロ目</th><td>31倍</td></tr><tr><th>異なる2つの目</th><td>7倍</td></tr><tr><th>指定の目が1・2・3個</th><td>2・3・4倍</td></tr><tr><th>合計4・17／5・16／6・15</th><td>61／21／19倍</td></tr><tr><th>合計7・14／8・13／9〜12</th><td>13／9／7倍</td></tr></table><p>表の倍率は掛け金を含む払い戻しです。盤面の「1:11」は利益11倍＋掛け金返却＝12倍。10両なら120両が戻ります。ゾロ目でも合計・ダブル・単独の目への賭けは通常どおり判定します。途中で閉じても同じ結果を復元し、二重に引いたり払ったりしません。</p>';
    if(game==='bitcoin')return '<p>Coinbase ExchangeのBTC/USDの実際の価格を使います。「上がる」「下がる」と掛ける両を選ぶと、開始価格を記録して10秒後に判定します。</p><table><tr><th>予想的中</th><td>2倍</td></tr><tr><th>予想が外れる</th><td>0両</td></tr><tr><th>同じ価格</th><td>掛け金を返す</td></tr></table><p>10秒後、最初に取得できた約定価格（5秒以内）で判定します。判定価格を取得できなかった場合は全額返金。途中でページを閉じても掛け金は二重に引かれず、戻ると勝負を復元します。判定時刻を過ぎて5秒以上経った場合は返金します。チャートは直近1分を拡大表示します。15秒・5分・30分にも切り替えられます。最近の約定価格を使い、長い期間の古い部分は1分足の終値を使います。縦軸は表示期間の値動きに合わせて自動調整します。</p><p>ゲーム内の両を使った価格予想です。ビットコインの購入・売却・換金はできません。</p>';
    if(game==='janken')return '<p>NPCの手は毎回、グー・チョキ・パーから同じ確率で決まります。</p><table><tr><th>勝ち</th><td>掛け金の2倍</td></tr><tr><th>負け</th><td>0両</td></tr><tr><th>あいこ</th><td>掛け金を返す（1倍）</td></tr></table><p>例：10両を賭けて勝つと20両が戻り、差し引きは＋10両です。</p>';
    if(game==='roulette')return '<p>0〜36の37ポケットを使う欧州式。各数字は毎回1/37の確率です。複数の場所に置けます。1回の合計は1,000両まで。</p><table><tr><th>数字1点（0も可）</th><td>36倍</td></tr><tr><th>赤・黒・奇数・偶数</th><td>2倍</td></tr><tr><th>1〜18・19〜36</th><td>2倍</td></tr><tr><th>12個の組・列</th><td>3倍</td></tr></table><p>0は赤黒・奇偶・大小・12個の組・列のいずれにも入りません。外れた場所の両は戻りません。倍率は掛け金を含む払い戻しです。</p><p>過去の数字で次の確率は変わりません。<a href="https://help.danskespil.dk/en/casino-help/roulette/playtechclassicroulette" target="_blank" rel="noopener">欧州式のルールを確認 ↗</a></p>';
    return '<p>3×3の絵柄を、横3本・縦3本・斜め2本の計8ラインで判定。どのラインも同じ絵柄が3つそろうと的中し、複数の当たりはすべて合算します。</p><table>'+R.symbols.filter(s=>s.multiplier).map(s=>'<tr><th>'+s.name+'が3つ（1ライン）</th><td>'+s.multiplier+'倍</td></tr>').join('')+'<tr><th>「両」ボーナス絵柄が画面内に3つ以上</th><td>無料スピン5回</td></tr></table><p>掛け金は8ライン全部を含む1回分の両です。「両」は並び方に関係なく数えます。ボーナス中は発動時の掛け金を基準に配当が2倍になり、両を引かずに5回回せます。無料スピン中はボーナスの追加抽選をしません。</p><p>9つの絵柄はそれぞれ独立して抽選します。各マスの内訳：チェリー7、レモン5、ベル4、BAR3、7が1、ボーナス1（計21）。2つだけでは配当はありません。</p>';

  }
  function renderHistory(wallet) {
    const history=wallet.history.filter(r=>r&&names[r.game]&&Number.isSafeInteger(r.stake)&&Number.isSafeInteger(r.payout)).slice(0,8);
    $('roundHistory').innerHTML=history.length?history.map(r=>{const net=r.payout-r.stake;return '<li class="'+(net>0?'history-win':'')+'"><small>'+names[r.game]+'</small><strong>'+(net>0?'＋':'')+money(net)+'</strong><span>掛け金 '+money(r.stake)+'<br>払い戻し '+money(r.payout)+'</span></li>';}).join(''):'<li class="history-empty">まだ記録はありません。最初の一勝負へ。</li>';
    $('rouletteRecent').innerHTML=history.filter(r=>r.game==='roulette'&&Number.isInteger(r.data?.number)).slice(0,5).map(r=>'<span class="'+R.color(r.data.number)+'">'+r.data.number+'</span>').join('');
  }
  function refresh() {
    const wallet=W.snapshot(), busy=!!(active||starting||wallet.pending), free=game==='slots'&&wallet.slotBonus?.remaining>0;
    $('casinoBalance').textContent=wallet.balance.toLocaleString('ja-JP');
    $('emptyWallet').hidden=wallet.balance>0 || !!wallet.pending || free;
    const amount=total(), legal=validStake(amount)&&(free||amount<=wallet.balance);
    $('betTotal').textContent=free?'0両（無料）':validStake(amount)?money(amount):'—';
    $('rouletteTotal').textContent=money(chips.reduce((n,c)=>n+c.stake,0));
    $('playLabel').textContent=game==='bitcoin' ? busy ? '価格を判定中…' : money(validStake(amount)?amount:0)+'で'+(direction==='up'?'値上がり':'値下がり')+'を予想' : busy?'勝負の途中…':free?'無料スピン · 残り'+wallet.slotBonus.remaining+'回':game==='roulette'?money(validStake(amount)?amount:0)+'で回す':game==='slots'?money(validStake(amount)?amount:0)+'でスピン':money(validStake(amount)?amount:0)+'で勝負する';
    $('playRound').disabled=busy||!legal||wallet.unavailable||(game==='bitcoin'&&!B?.quoteValid(btcState.quote));
    $('mobilePlayRound').disabled=$('playRound').disabled;$('mobilePlayRound').textContent=$('playLabel').textContent+' →';$('mobileBetTotal').textContent=$('betTotal').textContent;$('mobileStake').value=$('stake').value;
    document.querySelectorAll('[data-game],[data-hand],[data-direction],[data-sicbo],[data-stake],#stake,#mobileStake,#rouletteBoard button,#undoBet,#clearBets,[data-remove-bet],#sicboUndo,#sicboClear,[data-remove-sicbo]').forEach(e=>{e.disabled=busy||(free&&(e.matches('[data-stake],#stake,#mobileStake')));});
    if(game==='sicbo')$('playLabel').textContent=busy?'サイコロを振っています…':money(validStake(amount)?amount:0)+'でサイコロを振る';
    $('mobilePlayRound').textContent=$('playLabel').textContent+' →';
    $('undoBet').disabled=busy||!chips.length;$('clearBets').disabled=busy||!chips.length;
    $('sicboUndo').disabled=busy||!sicboChips.length;$('sicboClear').disabled=busy||!sicboChips.length;
    document.querySelectorAll('[data-stake]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.stake)===stake())));
    renderHistory(wallet);
    const lastFree=wallet.pending?.game==='slots'&&wallet.pending.freeSpin&&!wallet.slotBonus?.remaining;
    $('slotBonus').classList.toggle('active',!!wallet.slotBonus?.remaining||lastFree);
    $('slotBonusTitle').textContent=lastFree?'ボーナス中！最後の無料スピン':wallet.slotBonus?.remaining?'ボーナス中！残り '+wallet.slotBonus.remaining+' 回':'ボーナスチャンス';
    $('slotBonusDetail').textContent=wallet.slotBonus?.remaining||lastFree?'掛け金0両 · '+money(wallet.slotBonus.stake)+'を基準に配当2倍':'「両」が画面内に3つ以上で、無料スピン5回＋配当2倍';
    if(wallet.unavailable)status('両の記録を読み込めません。ブラウザの保存設定を確認してね。',true);
    else if(wallet.pending&&!active&&!starting)status('前の勝負を確認しています…');
    else if(!busy&&!free&&validStake(amount)&&amount>wallet.balance)status('両が足りません。掛け金を小さくするか、クイズで両を集めよう。',true);
  }
  function selectGame(next,updateURL=true) {
    if(!names[next])next='janken';
    game=next;
  document.querySelectorAll('[data-game]').forEach(b=>{const selected=b.dataset.game===game;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});
    for(const id of Object.keys(names))$('panel-'+id).hidden=id!==game;
    $('rouletteSlip').hidden=game!=='roulette';
    $('sicboSlip').hidden=game!=='sicbo';
    document.querySelector('.game-shell').classList.toggle('sicbo-layout',game==='sicbo');
    $('stakeLabel').textContent=game==='roulette'||game==='sicbo'?'1回押すごとに置く両':'1回に賭ける両';
    $('stageLabel').textContent={janken:'JANKEN / 一対一の勝負',roulette:'EUROPEAN ROULETTE / 37 POCKETS',slots:'GOLDEN SLOTS / 3 × 3 · 8 LINES',bitcoin:'BITCOIN / LIVE PRICE · 10 SECONDS',sicbo:'SIC BO / 三つのサイコロ'}[game];
    $('betGameName').textContent=names[game];$('gameRules').innerHTML=rulesHTML();
    $('resultKicker').textContent='PLACE YOUR BET';$('resultHeadline').textContent=game==='bitcoin'?'10秒後、価格は上がる？下がる？':game==='roulette'?'盤面に両を置こう。':game==='slots'?'縦・横・斜め、8ラインに期待を。':'両を決めて、準備しよう。';$('resultDetail').textContent='倍率は、掛け金を含む払い戻しです。';$('resultNumbers').hidden=true;$('roundResult').className='round-result';
    status(game==='bitcoin'?'上がる・下がるを選び、両を決めて予想しよう。':game==='roulette'?'盤面を押すと、選んだ両を置けます。':game==='slots'?(bonus()?'無料スピンを押すと、両を使わずに回せます。':'スピンを押すと、8ラインすべてを抽選します。'):'グー・チョキ・パーを選んでね。');
    if(game==='sicbo'){$('resultHeadline').textContent='好きなマスに、両を置こう。';status('盤面を押して両を置こう。複数の場所に賭けられます。');}
    if(updateURL){const url=new URL(location.href);url.searchParams.set('game',game);history.replaceState(null,'',url);}
    if(game==='bitcoin')startBitcoinFeed();
    else if(!active && !W.snapshot().pending){btcFeed?.stop();clearInterval(btcTimer);btcTimer=null;}
    refresh();
  }
  function makeWheel() {
    const step=Math.PI*2/37, point=(angle,r)=>[200+Math.sin(angle)*r,200-Math.cos(angle)*r];
    const arcs=R.wheel.map((n,i)=>{const a=i*step-step/2,b=a+step,p=point(a,192),q=point(b,192),innerA=point(a,117),innerB=point(b,117),txt=point(i*step,154);return '<path d="M '+p+' A 192 192 0 0 1 '+q+' L '+innerB+' A 117 117 0 0 0 '+innerA+' Z" fill="'+({red:'#a6373b',black:'#1b2927',green:'#277254'}[R.color(n)])+'" stroke="#c6b486" stroke-width=".8"/><text x="'+txt[0]+'" y="'+txt[1]+'" transform="rotate('+(i*360/37)+' '+txt[0]+' '+txt[1]+')" text-anchor="middle" dominant-baseline="middle" fill="#fff2d0" font-family="sans-serif" font-size="13" font-weight="700">'+n+'</text>';}).join('');
    $('rouletteWheel').innerHTML='<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg"><circle cx="200" cy="200" r="198" fill="#9e8552"/>'+arcs+'<circle cx="200" cy="200" r="116" fill="#345338" stroke="#b9a169" stroke-width="4"/><circle cx="200" cy="200" r="88" fill="#193422" stroke="#5f7350" stroke-width="1"/></svg>';
  }
  function makeBoard() {
    let html='<button class="zero green" data-position="n0" aria-label="数字0に両を置く">0</button>';
    for(let n=1;n<=36;n++)html+='<button class="number '+R.color(n)+'" style="--row:'+(n%3===0?2:n%3===2?3:4)+';--col:'+Math.ceil(n/3)+'" data-position="n'+n+'" aria-label="数字'+n+'に両を置く">'+n+'</button>';
    for(const id of ['d1','d2','d3','c1','c2','c3','low','even','red','black','odd','high']){const b=R.bet(id);html+='<button class="outside '+(b.multiplier===2?'even-money ':'')+(id==='red'||id==='black'?id:'')+'" data-position="'+id+'" aria-label="'+b.label+'に両を置く">'+b.label+' <small>'+b.multiplier+'倍</small></button>';}
    $('rouletteBoard').innerHTML=html;
    $('rouletteBoard').onclick=e=>{const b=e.target.closest('[data-position]');if(!b||b.disabled)return;const amount=stake(),sum=chips.reduce((n,c)=>n+c.stake,0)+amount;if(!validStake(amount)||sum>1000){status('置く両は整数で1両以上。1回の合計は1,000両までです。',true);return;}if(sum>W.snapshot().balance){status('置く両の合計が残高を超えています。',true);return;}chips.push({id:b.dataset.position,stake:amount});renderBets();tone('tick');};
  }
  function renderBets() {
    document.querySelectorAll('[data-position]').forEach(b=>{b.querySelector('.board-chip')?.remove();const amount=chips.filter(c=>c.id===b.dataset.position).reduce((n,c)=>n+c.stake,0);b.classList.toggle('has-chip',amount>0);if(amount){const marker=document.createElement('span');marker.className='board-chip';marker.textContent=amount;marker.setAttribute('aria-hidden','true');b.append(marker);}const rule=R.bet(b.dataset.position);b.setAttribute('aria-label',rule.label+'に両を置く'+(amount?' · '+money(amount)+'を置いています':''));});
    const groups=[...new Set(chips.map(c=>c.id))].map(id=>({id,amount:chips.filter(c=>c.id===id).reduce((n,c)=>n+c.stake,0)}));
    $('betSlip').innerHTML=groups.length?groups.map(b=>'<li><span>'+esc(R.bet(b.id).label)+' · '+money(b.amount)+'</span><button data-remove-bet="'+b.id+'" aria-label="'+esc(R.bet(b.id).label)+'の両を外す">×</button></li>').join(''):'<li>盤面から賭ける場所を選ぼう。</li>';
    refresh();
  }
  function symbolHTML(id, row=null) {const s=R.symbols.find(s=>s.id===id);return '<div class="reel-item"'+(row===null?'':' data-row="'+row+'"')+'><div class="reel-symbol symbol-'+s.id+'">'+s.icon+'</div></div>';}
  function idleReels() {const cols=[['lemon','seven','bell'],['cherry','bell','bar'],['bar','cherry','lemon']];for(let i=0;i<3;i++){$('reel'+i).innerHTML=cols[i].map((id,row)=>symbolHTML(id,row)).join('');$('reel'+i).style.transform='translateY(0px)';}}
  function slotWins(round) {
    const wins=round.data.wins||[], grid=round.data.grid;
    $('slotLineWins').replaceChildren();
    for(let col=0;col<3;col++)$('reel'+col).querySelectorAll('.is-winning').forEach(e=>e.classList.remove('is-winning'));
    if(!grid)return;
    $('slotLineWins').innerHTML=wins.map(w=>'<span>'+w.name+' · '+R.symbols.find(s=>s.id===w.symbol).name+' <b>'+money(round.slotStake*w.multiplier)+'</b></span>').join('');
    for(const cell of new Set(wins.flatMap(w=>w.cells)))$('reel'+(cell%3)).querySelector('[data-row="'+Math.floor(cell/3)+'"]')?.classList.add('is-winning');
  }
  function outcome(amount, context={}) {
    if(game==='janken'){const opponent=R.randomIndex(3),multiplier=R.janken(hand,opponent);return {payout:amount*multiplier,data:{player:hand,opponent,multiplier}};}
    if(game==='roulette'){const number=R.randomIndex(37),bets=chips.map(c=>({...c}));return {payout:R.roulette(bets,number),data:{number,bets}};}
    if(game==='sicbo'){const data=R.sicboRound(sicboChips.map(c=>({...c})),Array.from({length:3},()=>R.randomIndex(6)+1));return {payout:data.payout,data};}
    const grid=Array.from({length:9},()=>R.strip[R.randomIndex(R.strip.length)]), win=R.slots(grid,context.freeSpin);
    return {payout:(context.stake||amount)*win.multiplier,data:win};
  }
  function later(round,fn,ms){setTimeout(()=>{if(active?.id===round.id)fn();},ms);}
  const dicePips={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
  const diceTurns={1:'rotateX(0deg)',2:'rotateX(-90deg)',3:'rotateY(-90deg)',4:'rotateY(90deg)',5:'rotateX(90deg)',6:'rotateY(180deg)'};
  function makeDice(){
    for(let i=0;i<3;i++)$('sicboDie'+i).innerHTML=[1,2,3,4,5,6].map(n=>'<span class="dice-face face-'+n+'" aria-hidden="true">'+Array.from({length:9},(_,cell)=>'<i class="'+(dicePips[n].includes(cell)?'pip':'')+'"></i>').join('')+'</span>').join('');
  }
  function revealDie(i,n){const die=$('sicboDie'+i);die.classList.remove('rolling');die.style.transform='rotateX(-12deg) rotateY(-16deg) '+diceTurns[n];die.setAttribute('aria-label',['左','中央','右'][i]+'のサイコロ：'+n);}
  function boardDice(n){return '<span class="board-die" aria-hidden="true">'+Array.from({length:9},(_,i)=>'<i'+(dicePips[n].includes(i)?' class="pip"':'')+'></i>').join('')+'</span>';}
  function makeSicboBoard(){
    const button=(id,body,cls='')=>{const b=R.sicboBet(id);return '<button class="sicbo-cell '+cls+'" data-sicbo="'+id+'" aria-pressed="false" aria-label="'+esc(b.label)+'に両を置く">'+body+'</button>';};
    const doubles=faces=>'<div class="sicbo-group"><b class="sicbo-group-label">ダブル 1:11</b><div class="sicbo-doubles">'+faces.map(n=>button('double-'+n,boardDice(n)+boardDice(n))).join('')+'</div></div>';
    const triples=faces=>'<div class="sicbo-group"><b class="sicbo-group-label">各ゾロ目 1:180</b><div class="sicbo-triples">'+faces.map(n=>button('triple-'+n,boardDice(n).repeat(3))).join('')+'</div></div>';
    const side=id=>button(id,'<strong>'+(id==='small'?'小':'大')+'</strong><b>'+(id==='small'?'SMALL':'BIG')+'</b><span>合計 '+(id==='small'?'4〜10':'11〜17')+'</span><small>1:1<br>ゾロ目は負け</small>','sicbo-side');
    let html='<div class="sicbo-board-top">'+side('small')+doubles([1,2,3])+triples([1,2,3])+button('any-triple','<small>どのゾロ目も</small><b>1:30</b><div class="sicbo-any-dice">'+[1,2,3,4,5,6].map(n=>'<span>'+boardDice(n).repeat(3)+'</span>').join('')+'</div>','sicbo-any')+triples([4,5,6])+doubles([4,5,6])+side('big')+'</div>';
    html+='<div class="sicbo-sums">'+R.sicboTotals.map((odds,i)=>button('sum-'+(i+4),'<strong>'+(i+4)+'</strong><small>1:'+odds+'</small>')).join('')+'</div>';
    html+='<div class="sicbo-pairs"><div class="sicbo-pair-label">2つの目<br><b>1:6</b></div>';
    for(let a=1;a<=5;a++)for(let b=a+1;b<=6;b++)html+=button('pair-'+a+'-'+b,boardDice(a)+'<small>'+a+' と '+b+'</small>'+boardDice(b));
    html+='</div><div class="sicbo-singles">'+[1,2,3,4,5,6].map(n=>button('single-'+n,'<strong>'+['ONE','TWO','THREE','FOUR','FIVE','SIX'][n-1]+'</strong>'+boardDice(n))).join('')+'</div><div class="sicbo-single-odds"><b>1個出る 1:1</b><b>2個出る 2:1</b><b>3個出る 3:1</b></div>';
    $('sicboBoard').innerHTML=html;
    $('sicboBoard').onclick=e=>{const b=e.target.closest('[data-sicbo]');if(!b||b.disabled)return;const amount=stake(),sum=sicboChips.reduce((n,c)=>n+c.stake,0)+amount;if(!validStake(amount)||sum>1000){status('1回の合計は1〜1,000両です。',true);return;}if(sum>W.snapshot().balance){status('置く両の合計が残高を超えています。',true);return;}sicboChips.push({id:b.dataset.sicbo,stake:amount});renderSicboBets();tone('tick');status(R.sicboBet(b.dataset.sicbo).label+'に'+money(amount)+'を置きました。');};
  }
  function renderSicboBets(){
    document.querySelectorAll('[data-sicbo]').forEach(b=>{b.querySelector('.board-chip')?.remove();const amount=sicboChips.filter(c=>c.id===b.dataset.sicbo).reduce((n,c)=>n+c.stake,0);b.classList.toggle('has-chip',amount>0);b.setAttribute('aria-pressed',String(amount>0));b.setAttribute('aria-label',R.sicboBet(b.dataset.sicbo).label+'に両を置く'+(amount?' · '+money(amount)+'を置いています':''));if(amount){const marker=document.createElement('span');marker.className='board-chip';marker.textContent=amount;marker.setAttribute('aria-hidden','true');b.append(marker);}});
    const groups=[...new Set(sicboChips.map(c=>c.id))].map(id=>({id,amount:sicboChips.filter(c=>c.id===id).reduce((n,c)=>n+c.stake,0)}));
    $('sicboBetSlip').innerHTML=groups.length?groups.map(b=>'<li><span>'+esc(R.sicboBet(b.id).label)+' · '+money(b.amount)+'</span><button data-remove-sicbo="'+b.id+'" aria-label="'+esc(R.sicboBet(b.id).label)+'の両を外す">×</button></li>').join(''):'<li>盤面を押して両を置こう。</li>';
    $('sicboTotal').textContent=money(sicboChips.reduce((n,c)=>n+c.stake,0));refresh();
  }
  function showSicbo(round){
    if(round.data.bets){sicboChips=round.data.bets.map(b=>({id:b.id,stake:b.stake}));}else{sicboChips=[{id:round.data.choice,stake:round.stake}];}
    renderSicboBets();
    document.querySelectorAll('[data-sicbo]').forEach(b=>b.classList.toggle('landed',R.sicboMultiplier(b.dataset.sicbo,round.data.dice)>0));
    $('sicboStage').classList.remove('shaking');$('sicboStage').classList.add('revealed');
    round.data.dice.forEach((n,i)=>revealDie(i,n));$('sicboSum').textContent=round.data.sum;
    $('sicboCall').textContent=round.data.triple?'ゾロ目！':round.data.side==='small'?'小':'大';
    $('sicboStage').classList.toggle('triple',round.data.triple);$('sicboStage').classList.toggle('won',round.payout>0);
  }
  function animateSicbo(round){
    const quick=fast(),stage=$('sicboStage');stage.className='sicbo-stage shaking';$('sicboSum').textContent='？';$('sicboCall').textContent='抽選中…';
    document.querySelectorAll('[data-sicbo]').forEach(b=>b.classList.remove('landed'));
    for(let i=0;i<3;i++){const die=$('sicboDie'+i);die.setAttribute('aria-label',['左','中央','右'][i]+'のサイコロ：抽選中');die.classList.add('rolling');}
    tone('start');later(round,()=>{stage.classList.remove('shaking');stage.classList.add('revealed');},quick?130:950);
    round.data.dice.forEach((n,i)=>later(round,()=>{revealDie(i,n);tone('tick');if(i===2){showSicbo(round);settle(round);}},quick?220+i*55:1250+i*240));
  }
  function animateJanken(round) {
    const duration=fast()?220:1850;
    $('jankenStage').classList.remove('revealed');$('jankenStage').classList.add('shaking');$('playerHand').textContent='✊';$('opponentHand').textContent='✊';$('duelCall').textContent='じゃん';tone('start');
    if(!fast()){later(round,()=>{$('duelCall').textContent='けん';tone('tick');},650);later(round,()=>{$('duelCall').textContent='ぽん！';tone('tick');},1300);}
    later(round,()=>{$('jankenStage').classList.remove('shaking');$('jankenStage').classList.add('revealed');$('playerHand').textContent=hands[round.data.player];$('opponentHand').textContent=hands[round.data.opponent];$('duelCall').textContent=round.data.multiplier===2?'勝ち':round.data.multiplier===1?'あいこ':'負け';settle(round);},duration);
  }
  function animateRoulette(round) {
    const duration=fast()?240:5100,step=360/37,target=-R.wheel.indexOf(round.data.number)*step;
    document.querySelectorAll('.landed').forEach(e=>e.classList.remove('landed'));$('wheelNumber').textContent='…';
    const modulo=((rotation%360)+360)%360,desired=((target%360)+360)%360;
    rotation+=360*6+((desired-modulo+360)%360);
    $('rouletteWheel').style.transition='transform '+duration+'ms cubic-bezier(.13,.66,.05,1)';$('rouletteWheel').style.transform='rotate('+rotation+'deg)';
    $('ballOrbit').style.transition='none';$('ballOrbit').style.transform='rotate(0deg)';
    void $('ballOrbit').offsetWidth;
    $('ballOrbit').style.transition='transform '+duration+'ms cubic-bezier(.18,.65,.09,1)';$('ballOrbit').style.transform='rotate(-2160deg)';tone('start');
    if(!fast())for(let t=200;t<duration-200;t+=320)later(round,()=>tone('tick'),t);
    later(round,()=>{$('wheelNumber').textContent=round.data.number;$('rouletteBoard').querySelector('[data-position="n'+round.data.number+'"]').classList.add('landed');settle(round);},duration);
  }
  function animateSlots(round) {
    $('slotMachine').classList.add('spinning');$('slotLineWins').replaceChildren();tone('start');
    for(let i=0;i<3;i++){
      const track=$('reel'+i), index=24+i*8, final=[0,1,2].map(row=>round.data.grid[row*3+i]);
      const display=Array.from({length:index},(_,j)=>symbolHTML(R.strip[(j*7+i*5)%R.strip.length])).join('')+final.map((id,row)=>symbolHTML(id,row)).join('');
      track.parentElement.classList.remove('stopped');track.style.transition='none';track.innerHTML=display;track.style.transform='translateY(0px)';
      void track.offsetWidth;
      const duration=fast()?160+i*55:1700+i*650;
      track.style.transition='transform '+duration+'ms cubic-bezier(.14,.6,.06,1)';track.style.transform='translateY('+(-index*90)+'px)';
      later(round,()=>{track.parentElement.classList.add('stopped');track.parentElement.setAttribute('aria-label',['左','中央','右'][i]+'リール：'+final.map(id=>R.symbols.find(s=>s.id===id).name).join('、'));tone('tick');if(i===2){$('slotMachine').classList.remove('spinning');showStatic(round);settle(round);}},duration);
    }
  }
  function showStatic(round) {
    if(round.game==='sicbo')showSicbo(round);
    if(round.game==='janken'){$('playerHand').textContent=hands[round.data.player];$('opponentHand').textContent=hands[round.data.opponent];$('duelCall').textContent=round.data.multiplier===2?'勝ち':round.data.multiplier===1?'あいこ':'負け';}
    if(round.game==='roulette'){$('wheelNumber').textContent=round.data.number;rotation=-R.wheel.indexOf(round.data.number)*360/37;$('rouletteWheel').style.transition='none';$('rouletteWheel').style.transform='rotate('+rotation+'deg)';$('ballOrbit').style.transition='none';$('ballOrbit').style.transform='rotate(0deg)';$('rouletteBoard').querySelector('[data-position="n'+round.data.number+'"]')?.classList.add('landed');}
    if(round.game==='slots'){
      for(let i=0;i<3;i++){
        const t=$('reel'+i), grid=round.data.grid;
        const col=grid?[0,1,2].map(row=>grid[row*3+i]):[R.strip[(round.data.stops[i]+19)%20],round.data.reels[i],R.strip[(round.data.stops[i]+1)%20]];
        t.style.transition='none';t.innerHTML=col.map((id,row)=>symbolHTML(id,row)).join('');t.style.transform='translateY(0px)';
        t.parentElement.setAttribute('aria-label',['左','中央','右'][i]+'リール：'+col.map(id=>R.symbols.find(s=>s.id===id).name).join('、'));
      }
      slotWins(round);
    }
  }
  function confetti(big) {
    if(fast())return;
    const count=big?42:20;$('celebration').innerHTML=Array.from({length:count},()=>'<i style="--x:'+(Math.random()*100)+'%;--delay:'+(Math.random()*.7)+'s"></i>').join('');
    setTimeout(()=>$('celebration').replaceChildren(),3000);
  }
  function showResult(round,recovered=false) {
    const net=round.payout-round.stake,win=net>0,big=round.game==='slots'&&(round.data.multiplier>=50||round.data.bonusTriggered);
    $('roundResult').className='round-result '+(win||round.data.bonusTriggered?'win':net<0?'loss':'draw');$('resultKicker').textContent=recovered?'RESULT RESTORED':round.data.bonusTriggered?'BONUS START':round.freeSpin?'FREE SPIN':big?'GOLDEN WIN':win?'YOU WIN':net===0?'STAKE RETURNED':'ROUND COMPLETE';
    let title=round.game==='janken'?(round.data.multiplier===2?'あなたの勝ち！':round.data.multiplier===1?'あいこ。掛け金が戻りました。':'NPCの勝ち。'):round.game==='roulette'?'玉は '+round.data.number+'！':round.data.title;
    $('resultHeadline').textContent=title+(round.data.bonusTriggered&&title!=='ボーナス発動！'?' ボーナスも発動！':'');
    $('resultDetail').textContent=round.game==='sicbo'?'サイコロ '+round.data.dice.join('・')+' ／ 合計 '+round.data.sum+(round.data.triple?' ／ ゾロ目':'')+'。'+(round.data.bets?round.data.bets.filter(b=>b.payout>0).map(b=>R.sicboBet(b.id).label+' '+money(b.payout)).join(' ／ ')||'的中した場所はありません。':'予想：'+(round.data.choice==='small'?'小':'大')):round.game==='bitcoin'?(round.data.refunded?'判定に使える価格が取得できなかったため、掛け金を全額返しました。':usd(round.data.startPrice)+' → '+usd(round.data.endPrice)+' · '+(round.data.direction==='up'?'値上がり':'値下がり')+'を予想'):round.game==='janken'?'あなた：'+handNames[round.data.player]+' ／ NPC：'+handNames[round.data.opponent]:round.game==='roulette'?'払い戻し '+money(round.payout)+'。的中した場所の両だけが倍率に応じて戻ります。':round.data.grid?(round.freeSpin?'ボーナス配当2倍 · ':'')+(round.data.wins.length?'的中 '+round.data.wins.length+'ライン · 合計 '+money(round.payout):'ラインの的中なし')+(round.data.bonusTriggered?'。無料スピン5回を獲得！':''):'中央ライン：'+round.data.reels.map(id=>R.symbols.find(s=>s.id===id).name).join(' · ');
    $('resultNumbers').hidden=false;$('resultBet').textContent=money(round.stake);$('resultPayout').textContent=money(round.payout);$('resultNet').textContent=(net>0?'＋':'')+money(net);
    $('tableArea').classList.toggle('big-win',big);
    if(win||round.data.bonusTriggered){tone(big?'big':'win');confetti(big);}else if(net<0)tone('lose');
    status(!recovered&&round.data.bonusTriggered?'ボーナス発動！無料スピン5回、配当は2倍です。':!recovered&&round.freeSpin?'無料スピンの配当を反映しました。'+(bonus()?'残り'+bonus().remaining+'回。':'ボーナス終了！'):recovered?'途中だった勝負を復元し、払い戻しを確認しました。':win?'払い戻しを両へ反映しました。次の勝負も好きなタイミングで。':net===0?'掛け金が戻りました。次の一手を選ぼう。':'勝負が終了しました。両の残高を確認して次へ。');
  }
  function errorText(error){return {'insufficient':'両が足りません。掛け金を小さくするか、クイズで集めよう。','pending-round':'ほかの画面で勝負が進んでいます。終了を待ってね。','invalid-bet':'掛け金は整数で1〜1,000両にしてください。','price-unavailable':'新しい価格を取得できません。接続が戻るまで待ってね。','round-gone':'記録が読み込まれたか、リセットされました。この勝負は終了しました。'}[error.message]||'両の更新に失敗しました。保存設定を確認し、ページを読み直すと途中の勝負を復元できます。';}
  function settle(round,recovered=false) {
    if(settling)return;settling=true;
    W.finish(round.id,result=>{settling=false;active=null;starting=false;if(round.game==='roulette'){chips=[];renderBets();}if(round.game==='sicbo'){sicboChips=[];renderSicboBets();}refresh();showResult(result,recovered);},error=>{settling=false;active=null;starting=false;refresh();status(errorText(error),true);});
  }
  function play() {
    if(active||starting)return;
    const amount=total();if(!validStake(amount)){status('掛け金は整数で1〜1,000両。ルーレット・大小は先に盤面へ両を置こう。',true);return;}
    if(game==='bitcoin'){playBitcoin(amount);return;}
    starting=true;$('tableArea').classList.remove('big-win');$('celebration').replaceChildren();$('resultNumbers').hidden=true;$('resultKicker').textContent='GOOD LUCK';$('resultHeadline').textContent='勝負の準備…';$('resultDetail').textContent='';refresh();
    W.begin(game,amount,context=>outcome(amount,context),round=>{starting=false;active=round;refresh();status(round.freeSpin?'無料スピン！配当2倍で抽選中。':'掛け金 '+money(amount)+'。結果が決まるまで待ってね。');$('resultHeadline').textContent=game==='janken'?'じゃん、けん…':game==='roulette'?'玉の行方は、どこへ。':game==='sicbo'?'三つのサイコロ、いざ勝負。':'リールが止まる、その瞬間まで。';({janken:animateJanken,roulette:animateRoulette,slots:animateSlots,sicbo:animateSicbo}[game])(round);},error=>{starting=false;refresh();$('resultHeadline').textContent='勝負を始められませんでした。';status(errorText(error),true);});
  }
  function startBitcoinFeed() {
    if (!window.HKBitcoin) { status('価格データを読み込めません。ページを読み直してね。', true); return; }
    btcFeed ||= window.HKBitcoin.createFeed(state => { btcState = state; updateBitcoin(); if(game==='bitcoin')refresh(); });
    btcFeed.start(); if(!btcTimer)btcTimer=setInterval(updateBitcoin, 500); updateBitcoin();
  }
  function updateBitcoin() {
    if(game!=='bitcoin')return;
    const wallet=W.snapshot(), pending=wallet.pending?.game==='bitcoin'?wallet.pending:null, q=btcState.quote, live=B.quoteValid(q);
    $('btcConnection').textContent=live?'● LIVE':'価格の再接続を待機中';$('btcConnection').classList.toggle('live',live);
    $('btcPrice').textContent=q?usd(q.price):'—';$('btcUpdated').textContent=q?'更新 '+new Date(q.time).toLocaleTimeString('ja-JP'):'更新時刻 —';
    $('btcChartEmpty').hidden=btcState.points.length>0;$('btcChartEmpty').textContent='価格を取得できません。接続が戻るまでお待ちください。';
    const first=window.HKBitcoin?.view?.(btcState.points,btcRange).points[0]||btcState.points[0], change=q&&first?(q.price-first.price)/first.price*100:null;
    $('btcChange').textContent=change===null?'価格の更新を待っています':(change>=0?'＋':'')+change.toFixed(4)+'% · '+(q.price-first.price>=0?'＋':'−')+usd(Math.abs(q.price-first.price));
    $('btcChange').classList.toggle('negative',change<0);
    $('btcStartPrice').textContent=pending?usd(pending.data.startPrice):'—';
    $('btcPrediction').textContent=(pending?pending.data.direction:direction)==='up'?'値上がり ↑':'値下がり ↓';
    document.querySelectorAll('[data-direction]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.direction===(pending?pending.data.direction:direction))));
    const remaining=pending?Math.max(0,Math.ceil((pending.data.deadline-Date.now())/1000)):B.duration/1000;
    $('btcCountdown').textContent=pending&&!remaining?'判定中…':remaining+'秒';
    $('btcRoundProgress').hidden=!pending;$('btcRoundProgress').max=pending?(pending.data.deadline-pending.data.startedAt)/1000:10;$('btcRoundProgress').value=pending?Math.max(0,(Date.now()-pending.data.startedAt)/1000):0;
    window.HKBitcoin?.draw($('btcChart'),btcState.points,pending,btcRange);
    if(pending){
      if(!active){active=pending;refresh();}
      if(Date.now()>=pending.data.deadline&&!settling){
        settling=true;
        W.finishBitcoin(pending.id,q,result=>{settling=false;active=null;refresh();showResult(result);updateBitcoin();},error=>{settling=false;if(!['bitcoin-waiting','bitcoin-open'].includes(error.message)){active=null;refresh();status(errorText(error),true);}});
      }
    } else if(active?.game==='bitcoin'&&!starting&&!settling){
      const result=wallet.history.find(r=>r.id===active.id);active=null;refresh();if(result)showResult(result,true);
    }
  }
  function playBitcoin(amount) {
    starting=true;refresh();
    W.beginBitcoin(amount,direction,()=>btcState.quote,round=>{starting=false;active=round;refresh();$('resultNumbers').hidden=true;$('roundResult').className='round-result';$('resultKicker').textContent='10 SECOND PREDICTION';$('resultHeadline').textContent='10秒後の価格を待とう。';$('resultDetail').textContent=usd(round.data.startPrice)+'から'+(direction==='up'?'値上がり':'値下がり')+'を予想';status('掛け金 '+money(amount)+'。予想を受け付けました。');updateBitcoin();},error=>{starting=false;refresh();status(errorText(error),true);});
  }
  document.querySelectorAll('[data-direction]').forEach(b=>b.onclick=()=>{if(b.disabled)return;direction=b.dataset.direction;document.querySelectorAll('[data-direction]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));updateBitcoin();refresh();});
  document.querySelectorAll('[data-btc-range]').forEach(b=>b.onclick=()=>{btcRange=Number(b.dataset.btcRange);document.querySelectorAll('[data-btc-range]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));$('btcChart').setAttribute('aria-label','ビットコイン対米ドルの直近'+b.textContent+'の価格チャート');updateBitcoin();});
  window.addEventListener('resize',()=>{if(game==='bitcoin')updateBitcoin();});
  document.querySelectorAll('[data-game]').forEach(b=>{b.onclick=()=>{if(!active&&!starting&&!W.snapshot().pending)selectGame(b.dataset.game);};b.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)||active||starting||W.snapshot().pending)return;e.preventDefault();const list=Object.keys(names),index=list.indexOf(game),next=e.key==='Home'?0:e.key==='End'?list.length-1:(index+(e.key==='ArrowRight'?1:list.length-1))%list.length;selectGame(list[next]);document.querySelector('[data-game="'+list[next]+'"]').focus();};});
  document.querySelectorAll('[data-hand]').forEach(b=>b.onclick=()=>{if(b.disabled)return;hand=Number(b.dataset.hand);document.querySelectorAll('[data-hand]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));$('playerHand').textContent=hands[hand];$('opponentHand').textContent='？';$('duelCall').textContent='VS';$('jankenStage').classList.remove('revealed');tone('tick');});
  document.querySelectorAll('[data-stake]').forEach(b=>b.onclick=()=>{if(b.disabled)return;$('stake').value=b.dataset.stake;status(game==='roulette'?'盤面を押して両を置こう。':'掛け金を選びました。');refresh();});
  $('stake').oninput=()=>{status(validStake(stake())?'掛け金を変更しました。':'掛け金は整数で1〜1,000両にしてください。',!validStake(stake()));refresh();};
  $('mobileStake').oninput=()=>{$('stake').value=$('mobileStake').value;$('stake').oninput();};
  $('undoBet').onclick=()=>{chips.pop();renderBets();};$('clearBets').onclick=()=>{chips=[];renderBets();};
  $('betSlip').onclick=e=>{const b=e.target.closest('[data-remove-bet]');if(!b||b.disabled)return;chips=chips.filter(c=>c.id!==b.dataset.removeBet);renderBets();};
  $('sicboUndo').onclick=()=>{sicboChips.pop();renderSicboBets();};$('sicboClear').onclick=()=>{sicboChips=[];renderSicboBets();};
  $('sicboBetSlip').onclick=e=>{const b=e.target.closest('[data-remove-sicbo]');if(!b||b.disabled)return;sicboChips=sicboChips.filter(c=>c.id!==b.dataset.removeSicbo);renderSicboBets();};
  $('soundToggle').onclick=()=>{sound=!sound;$('soundToggle').textContent='音 '+(sound?'ON':'OFF');$('soundToggle').setAttribute('aria-pressed',String(sound));if(sound)tone('start');};
  $('playRound').onclick=play;
  $('mobilePlayRound').onclick=play;
  window.addEventListener('hk-wallet-change',refresh);
  makeWheel();makeBoard();idleReels();makeDice();makeSicboBoard();
  const wallet=W.snapshot();if(wallet.pending?.game==='bitcoin')direction=wallet.pending.data.direction;$('stake').value=wallet.balance>0?Math.min(10,wallet.balance):10;
  selectGame(wallet.pending?.game||new URLSearchParams(location.search).get('game'),false);renderBets();renderSicboBets();
  if(wallet.pending){const round=wallet.pending;active=round;if(round.game==='bitcoin'){startBitcoinFeed();status('途中の予想を復元しました。判定時刻まで待ってね。');updateBitcoin();}else{showStatic(round);settle(round,true);}}
})();
