(function () {
  'use strict';
  const W = window.HKWallet, R = window.HKCasinoRules, M = window.HKAmounts, P=M.rebirth, $ = id => document.getElementById(id);
  const names = { janken:'じゃんけん', roulette:'ルーレット', slots:'スロット', bitcoin:'ビットコイン予想', sicbo:'大小',poker:'王者のポーカー' };
  const hands = ['✊','✌️','🖐️'], handNames = ['グー','チョキ','パー'];
  const money = n => M.format(n)+'両';
  const esc = v => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let game='janken', hand=0, chips=[], active=null, starting=false, settling=false, rotation=0, audio=null, sound=false;
  let sicboChips=[],variant='standard',royalHolds=new Set(),royalSeenId=null,royalResult=null;
  const K=window.HKRoyalPoker;
  const required=()=>({silver:2,gold:5,king:10}[variant]||0);
  const count=()=>W.snapshot().rebirths??0;
  const rate=n=>P.factor(count(),n);
  const locked=()=>!P.unlocked(game,variant,count());
  const symbolName=id=>variant==='gold'?{cherry:'チェリー',lemon:'金剛石（レモン）',bell:'王冠（ベル）',bar:'金塊（BAR）',seven:'7',bonus:'鳳（ボーナス）'}[id]:R.symbols.find(s=>s.id===id).name;
  const displayName=r=>r.variant==='silver'?'銀のルーレット':r.variant==='gold'?'金のスロット':names[r.game];
  const B = window.HKBitcoinRules;
  let btcRange = 60;
  let direction = 'up', btcFeed = null, btcState = {quote:null,points:[],live:false}, btcTimer = null;
  const usd = n => '$' + n.toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2});
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const fast = () => reduced || $('quickToggle').checked;
  const stake = () => M.input($('stake').value);
  const bonus = () => W.snapshot().slotBonus?.remaining>0 ? W.snapshot().slotBonus : null;
  const total = () => game==='poker'&&W.snapshot().pending?.game==='poker'?W.snapshot().pending.stake:game==='roulette' ? M.sum(chips.map(b=>b.stake)) : game==='sicbo' ? M.sum(sicboChips.map(b=>b.stake)) : game==='slots'&&bonus() ? bonus().stake : stake();
  const validStake = n => M.valid(n) && M.cmp(n,1)>=0;
  const status = (text,error=false) => { $('casinoStatus').textContent=text; $('casinoStatus').classList.toggle('error',error); };
  function tone(kind) {
    if (!sound) return;
    try {
      audio ||= new (window.AudioContext||window.webkitAudioContext)(); audio.resume();
      const sequence=kind==='win'?[523,659,784,1047]:kind==='big'?[523,659,784,1047,1319,1568]:kind==='lose'?[220,165]:kind==='tick'?[650]:[330,440];
      sequence.forEach((hz,i)=>{const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime+i*.10;o.type=kind==='tick'?'triangle':'sine';o.frequency.value=hz;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.07,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+.13);o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+.15);});
    } catch { sound=false; $('soundToggle').textContent='音 OFF'; $('soundToggle').setAttribute('aria-pressed','false'); }
  }
  function baseRulesHTML() {
    if(game==='poker')return '<p>52枚から5枚を配ります。残すカードを押して選び、残りを一度だけ交換します。5枚すべて残して確定することもできます。J・Q・K・Aのワンペア以上で配当。倍率は掛け金を含みます。</p><table>'+(K?.paytable||[]).map(([name,m])=>'<tr><th>'+name+'</th><td>'+m+'倍</td></tr>').join('')+'</table><p>リボーン10回以上で解放。掛け金は最初の配布時に一度だけ引かれます。途中で閉じても同じ5枚と交換用のカードを復元できます。配当は開始時のリボーン倍率で計算し、1両未満を切り捨てます。</p>';
    if(game==='sicbo')return '<p>盤面を押すたび、選んだ両を置きます。複数の場所に賭けられ、合計は所持金の範囲内です。各サイコロは1〜6から独立に同じ確率で抽選します。</p><table><tr><th>小・大（ゾロ目は負け）</th><td>2倍</td></tr><tr><th>指定のダブル（同じ目が2個以上）</th><td>12倍</td></tr><tr><th>指定のゾロ目</th><td>181倍</td></tr><tr><th>いずれかのゾロ目</th><td>31倍</td></tr><tr><th>異なる2つの目</th><td>7倍</td></tr><tr><th>指定の目が1・2・3個</th><td>2・3・4倍</td></tr><tr><th>合計4・17／5・16／6・15</th><td>61／21／19倍</td></tr><tr><th>合計7・14／8・13／9〜12</th><td>13／9／7倍</td></tr></table><p>表示は掛け金を含む払い戻し倍率です。ダブルの12倍に10両を賭けて的中すると、120両が戻ります。ゾロ目でも合計・ダブル・単独の目への賭けは通常どおり判定します。途中で閉じても同じ結果を復元し、二重に引いたり払ったりしません。</p>';
    if(game==='bitcoin')return '<p>Coinbase ExchangeのBTC/USDの実際の価格を使います。「上がる」「下がる」と掛ける両を選ぶと、開始価格を記録して10秒後に判定します。</p><table><tr><th>予想的中</th><td>2倍</td></tr><tr><th>予想が外れる</th><td>0両</td></tr><tr><th>同じ価格</th><td>掛け金を返す</td></tr></table><p>10秒後、最初に取得できた約定価格（5秒以内）で判定します。判定価格を取得できなかった場合は全額返金。途中でページを閉じても掛け金は二重に引かれず、戻ると勝負を復元します。判定時刻を過ぎて5秒以上経った場合は返金します。チャートは直近1分を拡大表示します。15秒・5分・30分にも切り替えられます。最近の約定価格を使い、長い期間の古い部分は1分足の終値を使います。縦軸は表示期間の値動きに合わせて自動調整します。</p><p>ゲーム内の両を使った価格予想です。ビットコインの購入・売却・換金はできません。</p>';
    if(game==='janken')return '<p>NPCの手は毎回、グー・チョキ・パーから同じ確率で決まります。</p><table><tr><th>勝ち</th><td>掛け金の2倍</td></tr><tr><th>負け</th><td>0両</td></tr><tr><th>あいこ</th><td>掛け金を返す（1倍）</td></tr></table><p>例：10両を賭けて勝つと20両が戻り、差し引きは＋10両です。</p>';
    if(game==='roulette')return '<p>0〜36の37ポケットを使う欧州式。各数字は毎回1/37の確率です。複数の場所に置けます。合計は所持金の範囲内です。</p><table><tr><th>数字1点（0も可）</th><td>36倍</td></tr><tr><th>赤・黒・奇数・偶数</th><td>2倍</td></tr><tr><th>1〜18・19〜36</th><td>2倍</td></tr><tr><th>12個の組・列</th><td>3倍</td></tr></table><p>0は赤黒・奇偶・大小・12個の組・列のいずれにも入りません。外れた場所の両は戻りません。倍率は掛け金を含む払い戻しです。</p><p>過去の数字で次の確率は変わりません。<a href="https://help.danskespil.dk/en/casino-help/roulette/playtechclassicroulette" target="_blank" rel="noopener">欧州式のルールを確認 ↗</a></p>';
    return '<p>3×3の絵柄を、横3本・縦3本・斜め2本の計8ラインで判定。どのラインも同じ絵柄が3つそろうと的中し、複数の当たりはすべて合算します。</p><table>'+R.symbols.filter(s=>s.multiplier).map(s=>'<tr><th>'+s.name+'が3つ（1ライン）</th><td>'+s.multiplier+'倍</td></tr>').join('')+'<tr><th>「両」ボーナス絵柄が画面内に3つ以上</th><td>無料スピン5回</td></tr></table><p>掛け金は8ライン全部を含む1回分の両です。「両」は並び方に関係なく数えます。ボーナス中は発動時の掛け金を基準に配当が2倍になり、両を引かずに5回回せます。無料スピン中はボーナスの追加抽選をしません。</p><p>9つの絵柄はそれぞれ独立して抽選します。各マスの内訳：チェリー7、レモン5、ベル4、BAR3、7が1、ボーナス1（計21）。2つだけでは配当はありません。</p>';

  }
  function rulesHTML(){
    const box=document.createElement('div');box.innerHTML=baseRulesHTML();
    box.querySelectorAll('tr').forEach(row=>{const cell=row.querySelector('td');if(!cell||!/倍/.test(cell.textContent)||/あいこ|同じ価格/.test(row.querySelector('th')?.textContent))return;cell.textContent=cell.textContent.replace(/\d+/g,n=>rate(Number(n)));});
    box.querySelectorAll('p').forEach(p=>{if(p.textContent.startsWith('例：'))p.remove();});
    if(variant==='gold')box.querySelectorAll('th,p').forEach(th=>{th.textContent=th.textContent.replace('レモン','金剛石（レモン）').replace('ベル','王冠（ベル）').replace('BAR','金塊（BAR）').replace('「両」','「鳳」');});
    return '<p class="payout-boost">リボーン '+count()+'回 · 本来の配当 ×'+P.factor(count())+'。倍率表は適用後です。1両未満は切り捨て、あいこ・返金は掛け金のみ戻ります。</p>'+box.innerHTML;
  }
  function renderHistory(wallet) {
    const history=wallet.history.filter(r=>r&&names[r.game]&&M.valid(r.stake)&&M.integer(r.payout)).slice(0,8);
    $('roundHistory').innerHTML=history.length?history.map(r=>{const net=M.sub(r.creditedPayout??r.payout,r.stake);return '<li class="'+(net>0?'history-win':'')+'"><small>'+displayName(r)+'</small><strong>'+(net>0?'＋':'')+money(net)+'</strong><span>掛け金 '+money(r.stake)+'<br>払い戻し '+money(r.creditedPayout??r.payout)+'</span></li>';}).join(''):'<li class="history-empty">まだ記録はありません。最初の一勝負へ。</li>';
    $('rouletteRecent').innerHTML=history.filter(r=>r.game==='roulette'&&Number.isInteger(r.data?.number)).slice(0,5).map(r=>'<span class="'+R.color(r.data.number)+'">'+r.data.number+'</span>').join('');
  }
  function renderRoyal(wallet){
    const pending=wallet.pending?.game==='poker'?wallet.pending:null,focused=document.activeElement?.dataset?.royalCard;
    if(pending&&pending.id!==royalSeenId){royalSeenId=pending.id;royalHolds.clear();royalResult=null;}
    const round=pending||royalResult||wallet.history.find(r=>r.game==='poker'),cards=round?.data?.hand||[];
    const selectable=!!pending&&game==='poker'&&!locked()&&!starting&&!settling;
    const suits={S:'♠',H:'♥',D:'♦',C:'♣'},labels={S:'スペード',H:'ハート',D:'ダイヤ',C:'クラブ'};
    $('royalCards').innerHTML=Array.from({length:5},(_,i)=>{const c=cards[i],held=royalHolds.has(i),rank=c?(c[0]==='T'?'10':c[0]):'',suit=c?suits[c[1]]:'';return '<button type="button" data-royal-card="'+i+'" class="royal-card '+(!c?'card-back ':c[1]==='H'||c[1]==='D'?'card-red ':'')+(held&&pending?'card-held':'')+'" aria-label="'+(c?labels[c[1]]+'の'+rank+(held?' · 残す':' · 交換する'):'未配布のカード')+'" aria-pressed="'+String(held&&!!pending)+'"'+(!selectable?' disabled':'')+'><span class="card-corner">'+rank+'<i>'+suit+'</i></span><span class="card-suit" aria-hidden="true">'+(c?suit:'♔')+'</span><span class="card-hold">'+(pending?(held?'HOLD':'交換'):'')+'</span></button>';}).join('');
    if(focused!==undefined&&selectable)$('royalCards').querySelector('[data-royal-card="'+focused+'"]')?.focus();
    $('royalHandName').textContent=cards.length&&K?K.evaluate(cards).handName:'5枚のカードで、王者の役を。';
    $('royalHoldHint').textContent=pending?'残すカード '+royalHolds.size+'枚 · 残りを1回だけ交換します。':round?'ハンド終了。次の5枚は、あなたのタイミングで。':'掛け金を決めて、カードを配ろう。';
    $('royalHoldTools').hidden=!pending;$('royalHoldAll').disabled=$('royalHoldNone').disabled=!selectable;
  }
  function updateRates(){
    const captions={janken:'勝ちで'+rate(2)+'倍、負けは0。あいこは掛け金を返します。',roulette:'数字は'+rate(36)+'倍、赤黒・奇偶・大小は'+rate(2)+'倍、12個の組は'+rate(3)+'倍。',bitcoin:'的中で'+rate(2)+'倍、外れは0。同じ価格なら返金。'};
    for(const [id,text] of Object.entries(captions))$('panel-'+id).querySelector('.stage-caption').textContent=text;
    document.querySelector('[data-game="janken"] small').textContent='勝てば'+rate(2)+'倍';
    if(K)$('royalPaytable').innerHTML=K.paytable.map(([name,m])=>'<div><span>'+name+'</span><b>'+rate(m)+'倍</b></div>').join('');
    $('slotJackpotRate').textContent=rate(200)+'倍';$('slotJackpotNote').textContent='1ライン777 = '+rate(200)+'倍';
    document.querySelector('.slot-mini-paytable').innerHTML=R.symbols.filter(s=>s.multiplier).map(s=>'<span>'+(variant==='gold'?{cherry:'🍒',lemon:'💎',bell:'👑',bar:'金塊',seven:'7'}[s.id]:s.icon)+'×3 <b>'+rate(s.multiplier)+'倍</b></span>').join('');
    document.querySelectorAll('[data-position] small').forEach(e=>e.textContent=rate(R.bet(e.parentElement.dataset.position).multiplier)+'倍');
    document.querySelectorAll('[data-sicbo] .sicbo-odds b').forEach(e=>{const b=R.sicboBet(e.closest('[data-sicbo]').dataset.sicbo);if(b.odds!==null)e.textContent=rate(b.odds+1);});
  }
  function refresh() {
    const wallet=W.snapshot(), isLocked=locked(), busy=!!(active||starting||wallet.pending), free=game==='slots'&&wallet.slotBonus?.remaining>0,pokerPending=game==='poker'&&wallet.pending?.game==='poker';
    $('casinoRebirths').textContent='リボーン '+count().toLocaleString('ja-JP')+'回';$('casinoBoost').textContent='本来の配当 ×'+P.factor(count());
    for(const [v,n] of [['silver',2],['gold',5],['king',10]]){const b=document.querySelector('button[data-casino-variant="'+v+'"]');b.disabled=busy;b.classList.toggle('room-locked',count()<n);b.setAttribute('aria-selected',String(variant===v));$(v+'RoomStatus').textContent=count()>=n?'解放済み · 遊ぶ →':'🔒 '+n+'回で解放';}
    $('casinoLock').hidden=!isLocked;$('roundResult').hidden=isLocked;for(const id of Object.keys(names))$('panel-'+id).hidden=id!==game||isLocked;
    $('casinoLockTitle').textContent=displayName({game,variant});$('casinoLockMessage').textContent='リボーン'+required()+'回で解放 · あなたは'+count()+'回';
    $('gameRules').innerHTML=rulesHTML();
    updateRates();renderRoyal(wallet);
    $('casinoBalance').textContent=M.format(wallet.balance);$('casinoBalance').title=M.full(wallet.balance)+'両';
    $('emptyWallet').hidden=wallet.balance>0 || !!wallet.pending || free;
    const amount=total(), legal=validStake(amount)&&(free||M.cmp(amount,wallet.balance)<=0);
    $('betTotal').textContent=free?'0両（無料）':validStake(amount)?money(amount):'—';
    $('rouletteTotal').textContent=money(M.sum(chips.map(c=>c.stake)));
    $('playLabel').textContent=game==='bitcoin' ? busy ? '価格を判定中…' : money(validStake(amount)?amount:0)+'で'+(direction==='up'?'値上がり':'値下がり')+'を予想' : busy?'勝負の途中…':free?'無料スピン · 残り'+wallet.slotBonus.remaining+'回':game==='roulette'?money(validStake(amount)?amount:0)+'で回す':game==='slots'?money(validStake(amount)?amount:0)+'でスピン':money(validStake(amount)?amount:0)+'で勝負する';
    if(game==='poker')$('playLabel').textContent=pokerPending?(royalHolds.size===5?'5枚を残して確定する':(5-royalHolds.size)+'枚を交換して勝負'):(busy?'カードを確認中…':money(validStake(amount)?amount:0)+'でカードを配る');
    $('playRound').disabled=busy||isLocked||!legal||wallet.unavailable||(game==='bitcoin'&&!B?.quoteValid(btcState.quote));
    if(pokerPending&&!starting&&!settling&&!wallet.unavailable&&!isLocked)$('playRound').disabled=false;
    $('mobilePlayRound').disabled=$('playRound').disabled;$('mobilePlayRound').textContent=$('playLabel').textContent+' →';$('mobileBetTotal').textContent=$('betTotal').textContent;$('mobileStake').value=$('stake').value;
    document.querySelectorAll('[data-game],[data-hand],[data-direction],[data-sicbo],[data-stake],[data-all-in],#stake,#mobileStake,#rouletteBoard button,#undoBet,#clearBets,[data-remove-bet],#sicboUndo,#sicboClear,[data-remove-sicbo]').forEach(e=>{e.disabled=busy||(!e.matches('[data-game]')&&isLocked)||(free&&(e.matches('[data-stake],[data-all-in],#stake,#mobileStake')));});
    if(isLocked)$('playLabel').textContent='🔒 リボーン'+required()+'回で解放';
    if(game==='sicbo')$('playLabel').textContent=busy?'サイコロを振っています…':money(validStake(amount)?amount:0)+'でサイコロを振る';
    $('mobilePlayRound').textContent=$('playLabel').textContent+' →';
    $('undoBet').disabled=busy||!chips.length;$('clearBets').disabled=busy||!chips.length;
    $('sicboUndo').disabled=busy||!sicboChips.length;$('sicboClear').disabled=busy||!sicboChips.length;
    document.querySelectorAll('[data-stake]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.stake)===stake())));
    renderHistory(wallet);
    const lastFree=wallet.pending?.game==='slots'&&wallet.pending.freeSpin&&!wallet.slotBonus?.remaining;
    $('slotBonus').classList.toggle('active',!!wallet.slotBonus?.remaining||lastFree);
    $('slotBonusTitle').textContent=lastFree?'ボーナス中！最後の無料スピン':wallet.slotBonus?.remaining?'ボーナス中！残り '+wallet.slotBonus.remaining+' 回':'ボーナスチャンス';
    $('slotBonusDetail').textContent=wallet.slotBonus?.remaining||lastFree?'掛け金0両 · '+money(wallet.slotBonus.stake)+'を基準に配当2倍 × リボーン'+P.factor(count())+'倍':'「'+(variant==='gold'?'鳳':'両')+'」が画面内に3つ以上で、無料スピン5回＋配当2倍';
    if(isLocked)status('🔒 リボーン'+required()+'回で解放されます。ほかのカジノは上の選択バーから遊べます。');
    else if(wallet.unavailable)status('両の記録を読み込めません。ブラウザの保存設定を確認してね。',true);
    else if(wallet.pending&&!active&&!starting)status(wallet.pending.game==='poker'?'別の画面でポーカーが始まっています。ページを読み直すと手札を復元できます。':'前の勝負を確認しています…');
    else if(!busy&&!free&&validStake(amount)&&M.cmp(amount,wallet.balance)>0)status('両が足りません。掛け金を小さくするか、クイズで両を集めよう。',true);
  }
  function selectGame(next,updateURL=true,nextVariant='standard') {
    if(!names[next]||next==='poker'&&nextVariant!=='king')next='janken';
    game=next;variant=['silver','gold','king'].includes(nextVariant)?nextVariant:'standard';if(variant==='silver'&&game!=='roulette'||variant==='gold'&&game!=='slots'||variant==='king'&&game!=='poker')variant='standard';
    document.body.dataset.casinoVariant=variant;makeWheel();idleReels();
    $('slotTitle').innerHTML=variant==='gold'?'金の<em>スロット</em>':'江戸の<em>スロット</em>';
    document.querySelector('.wheel-hub small').textContent=variant==='silver'?'SILVER':'EUROPEAN';
  document.querySelectorAll('.casino-tabs [role=tab]').forEach(b=>{const selected=b.dataset.casinoVariant?b.dataset.casinoVariant===variant:variant==='standard'&&b.dataset.game===game;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;if(selected)$('panel-'+game).setAttribute('aria-labelledby',b.id);});
    for(const id of Object.keys(names))$('panel-'+id).hidden=id!==game;
    $('rouletteSlip').hidden=game!=='roulette';
    $('sicboSlip').hidden=game!=='sicbo';
    document.querySelector('.game-shell').classList.toggle('sicbo-layout',game==='sicbo');
    $('stakeLabel').textContent=game==='roulette'||game==='sicbo'?'1回押すごとに置く両':'1回に賭ける両';
    $('stageLabel').textContent={janken:'JANKEN / 一対一の勝負',roulette:'EUROPEAN ROULETTE / 37 POCKETS',slots:'EDO SLOTS / 3 × 3 · 8 LINES',bitcoin:'BITCOIN / LIVE PRICE · 10 SECONDS',sicbo:'SIC BO / 三つのサイコロ',poker:'ROYAL DRAW POKER / REBIRTH 10'}[game];
    if(variant!=='standard')$('stageLabel').textContent=variant==='silver'?'SILVER ROULETTE / REBIRTH 02':variant==='gold'?'GOLDEN SLOTS / REBIRTH 05':'ROYAL DRAW POKER / REBIRTH 10';
    $('betGameName').textContent=displayName({game,variant});$('gameRules').innerHTML=rulesHTML();
    $('resultKicker').textContent='PLACE YOUR BET';$('resultHeadline').textContent=game==='bitcoin'?'10秒後、価格は上がる？下がる？':game==='roulette'?'盤面に両を置こう。':game==='slots'?'縦・横・斜め、8ラインに期待を。':'両を決めて、準備しよう。';$('resultDetail').textContent='倍率は、掛け金を含む払い戻しです。';$('resultNumbers').hidden=true;$('roundResult').className='round-result';
    status(game==='bitcoin'?'上がる・下がるを選び、両を決めて予想しよう。':game==='roulette'?'盤面を押すと、選んだ両を置けます。':game==='slots'?(bonus()?'無料スピンを押すと、両を使わずに回せます。':'スピンを押すと、8ラインすべてを抽選します。'):'グー・チョキ・パーを選んでね。');
    if(game==='poker'){$('resultHeadline').textContent='残す5枚を、見極めよう。';status('カードを配り、残すカードを押して選ぼう。');}
    if(game==='sicbo'){$('resultHeadline').textContent='好きなマスに、両を置こう。';status('盤面を押して両を置こう。複数の場所に賭けられます。');}
    if(updateURL){const url=new URL(location.href);url.searchParams.set('game',game==='poker'?'janken':game);url.searchParams.delete('variant');history.replaceState(null,'',url);}
    if(game==='bitcoin')startBitcoinFeed();
    else if(!active && !W.snapshot().pending){btcFeed?.stop();clearInterval(btcTimer);btcTimer=null;}
    refresh();
  }
  function makeWheel() {
    const step=Math.PI*2/37, point=(angle,r)=>[200+Math.sin(angle)*r,200-Math.cos(angle)*r];
    const arcs=R.wheel.map((n,i)=>{const a=i*step-step/2,b=a+step,p=point(a,192),q=point(b,192),innerA=point(a,117),innerB=point(b,117),txt=point(i*step,154);return '<path d="M '+p+' A 192 192 0 0 1 '+q+' L '+innerB+' A 117 117 0 0 0 '+innerA+' Z" fill="'+(variant==='silver'?{red:'#724769',black:'#202f4a',green:'#385b70'}:{red:'#a6373b',black:'#1b2927',green:'#277254'})[R.color(n)]+'" stroke="#c6b486" stroke-width=".8"/><text x="'+txt[0]+'" y="'+txt[1]+'" transform="rotate('+(i*360/37)+' '+txt[0]+' '+txt[1]+')" text-anchor="middle" dominant-baseline="middle" fill="#fff2d0" font-family="sans-serif" font-size="13" font-weight="700">'+n+'</text>';}).join('');
    $('rouletteWheel').innerHTML='<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg"><circle cx="200" cy="200" r="198" fill="'+(variant==='silver'?'#c0d7e5':'#9e8552')+'"/>'+arcs+'<circle cx="200" cy="200" r="116" fill="'+(variant==='silver'?'#40546e':'#345338')+'" stroke="'+(variant==='silver'?'#d2e7f7':'#b9a169')+'" stroke-width="4"/><circle cx="200" cy="200" r="88" fill="#193422" stroke="#5f7350" stroke-width="1"/></svg>';
  }
  function makeBoard() {
    let html='<button class="zero green" data-position="n0" aria-label="数字0に両を置く">0</button>';
    for(let n=1;n<=36;n++)html+='<button class="number '+R.color(n)+'" style="--row:'+(n%3===0?2:n%3===2?3:4)+';--col:'+Math.ceil(n/3)+'" data-position="n'+n+'" aria-label="数字'+n+'に両を置く">'+n+'</button>';
    for(const id of ['d1','d2','d3','c1','c2','c3','low','even','red','black','odd','high']){const b=R.bet(id);html+='<button class="outside '+(b.multiplier===2?'even-money ':'')+(id==='red'||id==='black'?id:'')+'" data-position="'+id+'" aria-label="'+b.label+'に両を置く">'+b.label+' <small>'+rate(b.multiplier)+'倍</small></button>';}
    $('rouletteBoard').innerHTML=html;
    $('rouletteBoard').onclick=e=>{const b=e.target.closest('[data-position]');if(!b||b.disabled)return;const amount=stake(),sum=M.add(M.sum(chips.map(c=>c.stake)),amount);if(!validStake(amount)||!validStake(sum)){status('置く両は1両以上の整数にしてください。',true);return;}if(M.cmp(sum,W.snapshot().balance)>0){status('置く両の合計が残高を超えています。',true);return;}chips.push({id:b.dataset.position,stake:amount});renderBets();tone('tick');};
  }
  function renderBets() {
    document.querySelectorAll('[data-position]').forEach(b=>{b.querySelector('.board-chip')?.remove();const amount=M.sum(chips.filter(c=>c.id===b.dataset.position).map(c=>c.stake));b.classList.toggle('has-chip',amount>0);if(amount){const marker=document.createElement('span');marker.className='board-chip';marker.textContent=M.format(amount);marker.title=M.full(amount);marker.setAttribute('aria-hidden','true');b.append(marker);}const rule=R.bet(b.dataset.position);b.setAttribute('aria-label',rule.label+'に両を置く'+(amount?' · '+money(amount)+'を置いています':''));});
    const groups=[...new Set(chips.map(c=>c.id))].map(id=>({id,amount:M.sum(chips.filter(c=>c.id===id).map(c=>c.stake))}));
    $('betSlip').innerHTML=groups.length?groups.map(b=>'<li><span>'+esc(R.bet(b.id).label)+' · '+money(b.amount)+'</span><button data-remove-bet="'+b.id+'" aria-label="'+esc(R.bet(b.id).label)+'の両を外す">×</button></li>').join(''):'<li>盤面から賭ける場所を選ぼう。</li>';
    refresh();
  }
  function symbolHTML(id, row=null) {const s=R.symbols.find(s=>s.id===id),icon=variant==='gold'?{cherry:'🍒',lemon:'💎',bell:'👑',bar:'金塊',seven:'7',bonus:'鳳'}[id]:s.icon;return '<div class="reel-item"'+(row===null?'':' data-row="'+row+'"')+'><div class="reel-symbol symbol-'+s.id+'">'+icon+'</div></div>';}
  function idleReels() {const cols=[['lemon','seven','bell'],['cherry','bell','bar'],['bar','cherry','lemon']];for(let i=0;i<3;i++){$('reel'+i).innerHTML=cols[i].map((id,row)=>symbolHTML(id,row)).join('');$('reel'+i).style.transform='translateY(0px)';}}
  function slotWins(round) {
    const wins=round.data.wins||[], grid=round.data.grid;
    $('slotLineWins').replaceChildren();
    for(let col=0;col<3;col++)$('reel'+col).querySelectorAll('.is-winning').forEach(e=>e.classList.remove('is-winning'));
    if(!grid)return;
    $('slotLineWins').innerHTML=wins.map(w=>'<span>'+w.name+' · '+symbolName(w.symbol)+' · 基本配当 <b>'+money(M.mul(round.slotStake,w.multiplier))+'</b></span>').join('');
    for(const cell of new Set(wins.flatMap(w=>w.cells)))$('reel'+(cell%3)).querySelector('[data-row="'+Math.floor(cell/3)+'"]')?.classList.add('is-winning');
  }
  function outcome(amount, context={}) {
    if(game==='janken'){const opponent=R.randomIndex(3),multiplier=R.janken(hand,opponent);return {payout:M.mul(amount,multiplier),data:{player:hand,opponent,multiplier}};}
    if(game==='roulette'){const number=R.randomIndex(37),bets=chips.map(c=>({...c}));return {payout:R.roulette(bets,number),data:{number,bets}};}
    if(game==='sicbo'){const data=R.sicboRound(sicboChips.map(c=>({...c})),Array.from({length:3},()=>R.randomIndex(6)+1));return {payout:data.payout,data};}
    const grid=Array.from({length:9},()=>R.strip[R.randomIndex(R.strip.length)]), win=R.slots(grid,context.freeSpin);
    return {payout:M.mul(context.stake||amount,win.multiplier),data:win};
  }
  function later(round,fn,ms){setTimeout(()=>{if(active?.id===round.id)fn();},ms);}
  const dicePips={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
  const diceTurns={1:'rotateX(0deg)',2:'rotateX(-90deg)',3:'rotateY(-90deg)',4:'rotateY(90deg)',5:'rotateX(90deg)',6:'rotateY(180deg)'};
  function makeDice(){
    for(let i=0;i<3;i++)$('sicboDie'+i).innerHTML=[1,2,3,4,5,6].map(n=>'<span class="dice-face face-'+n+'" aria-hidden="true">'+Array.from({length:9},(_,cell)=>'<i class="'+(dicePips[n].includes(cell)?'pip':'')+'"></i>').join('')+'</span>').join('');
  }
  function revealDie(i,n){const die=$('sicboDie'+i);die.classList.remove('rolling');die.style.transform='rotateX(-12deg) rotateY(-16deg) '+diceTurns[n];die.setAttribute('aria-label',['左','中央','右'][i]+'のサイコロ：'+n);}
  function boardDice(n){return '<span class="board-die die-mark-'+n+'" aria-hidden="true">'+Array.from({length:9},(_,i)=>'<i'+(dicePips[n].includes(i)?' class="pip"':'')+'></i>').join('')+'</span>';}
  function makeSicboBoard(){
    const button=(id,body,cls='')=>{const b=R.sicboBet(id);return '<button class="sicbo-cell '+cls+'" data-sicbo="'+id+'" aria-pressed="false" aria-label="'+esc(b.label)+'に両を置く">'+body+'</button>';};
    const faces=[1,2,3,4,5,6];
    const odds=n=>'<span class="sicbo-odds"><b>'+rate(n)+'</b>倍</span>';
    const section=(number,title,note,body,cls)=>'<section class="sicbo-bet-section"><div class="sicbo-section-head"><h4><span>'+number+'</span>'+title+'</h4><p>'+note+'</p></div><div class="'+cls+'">'+body+'</div></section>';
    const side=id=>button(id,'<span class="sicbo-side-seal" aria-hidden="true">'+(id==='small'?'小':'大')+'</span><span class="sicbo-side-copy"><strong>'+(id==='small'?'小さい目':'大きい目')+'</strong><span class="sicbo-range">'+(id==='small'?'4 <em>〜</em> 10':'11 <em>〜</em> 17')+'</span><small>ゾロ目は対象外</small></span>'+odds(2),'sicbo-side side-'+id);
    let html='<div class="sicbo-board-heading"><span class="sicbo-brand-dice" aria-hidden="true">'+boardDice(3)+'</span><div><p>両で遊ぶ、運だめしの一座</p><h3>さいころ座</h3></div><span class="sicbo-board-caption">的中した場所を<br>まとめて払い戻し</span></div>';
    html+=section('壱','小か、大か','ゾロ目以外の合計で勝負。',side('small')+side('big'),'sicbo-sides');
    const any=button('any-triple','<span class="sicbo-any-seal" aria-hidden="true">三</span><strong>どのゾロ目でも</strong><small>3個とも同じ目</small>'+odds(31),'sicbo-any');
    const triples=faces.map(n=>button('triple-'+n,'<span class="sicbo-die-group">'+boardDice(n).repeat(3)+'</span><span class="sicbo-cell-label">'+n+'のゾロ目</span>'+odds(181),'sicbo-triple-cell')).join('');
    html+=section('弐','三つそろい','3個とも同じ目を狙おう。',any+'<div class="sicbo-triples">'+triples+'</div>','sicbo-triple-choice');
    html+=section('参','二つそろい','選んだ目が2個以上で的中。',faces.map(n=>button('double-'+n,'<span class="sicbo-die-group">'+boardDice(n).repeat(2)+'</span><span class="sicbo-cell-label">'+n+'のダブル</span>'+odds(12),'sicbo-double-cell')).join(''),'sicbo-doubles');
    html+=section('四','合計を狙う','三つの目を足した数は？',R.sicboTotals.map((n,i)=>button('sum-'+(i+4),'<strong class="sicbo-sum-number">'+(i+4)+'</strong>'+odds(n+1),'sicbo-sum-cell')).join(''),'sicbo-sums');
    let pairs='';for(let a=1;a<=5;a++)for(let b=a+1;b<=6;b++)pairs+=button('pair-'+a+'-'+b,'<span class="sicbo-die-group">'+boardDice(a)+'<i class="sicbo-pair-plus" aria-hidden="true">＋</i>'+boardDice(b)+'</span><span class="sicbo-cell-label">'+a+'と'+b+'</span>'+odds(7),'sicbo-pair-cell');
    html+=section('五','二つの目を組み合わせる','3個の中に、両方の目が出れば的中。',pairs,'sicbo-pairs');
    html+=section('六','ひとつの目にかける','1個で2倍、2個で3倍、3個で4倍。',faces.map(n=>button('single-'+n,boardDice(n)+'<strong>'+n+'の目</strong><small>2・3・4倍</small>','sicbo-single-cell')).join(''),'sicbo-singles');
    html+='<p class="sicbo-payout-note">表示は掛け金を含む払い戻し倍率です。</p>';
    $('sicboBoard').innerHTML=html;
    $('sicboBoard').onclick=e=>{const b=e.target.closest('[data-sicbo]');if(!b||b.disabled)return;const amount=stake(),sum=M.add(M.sum(sicboChips.map(c=>c.stake)),amount);if(!validStake(amount)||!validStake(sum)){status('置く両は1両以上の整数にしてください。',true);return;}if(M.cmp(sum,W.snapshot().balance)>0){status('置く両の合計が残高を超えています。',true);return;}sicboChips.push({id:b.dataset.sicbo,stake:amount});renderSicboBets();tone('tick');status(R.sicboBet(b.dataset.sicbo).label+'に'+money(amount)+'を置きました。');};
  }
  function renderSicboBets(){
    document.querySelectorAll('[data-sicbo]').forEach(b=>{b.querySelector('.board-chip')?.remove();const amount=M.sum(sicboChips.filter(c=>c.id===b.dataset.sicbo).map(c=>c.stake));b.classList.toggle('has-chip',amount>0);b.setAttribute('aria-pressed',String(amount>0));b.setAttribute('aria-label',R.sicboBet(b.dataset.sicbo).label+'に両を置く'+(amount?' · '+money(amount)+'を置いています':''));if(amount){const marker=document.createElement('span');marker.className='board-chip';marker.textContent=M.format(amount);marker.title=M.full(amount);marker.setAttribute('aria-hidden','true');b.append(marker);}});
    const groups=[...new Set(sicboChips.map(c=>c.id))].map(id=>({id,amount:M.sum(sicboChips.filter(c=>c.id===id).map(c=>c.stake))}));
    $('sicboBetSlip').innerHTML=groups.length?groups.map(b=>'<li><span>'+esc(R.sicboBet(b.id).label)+' · '+money(b.amount)+'</span><button data-remove-sicbo="'+b.id+'" aria-label="'+esc(R.sicboBet(b.id).label)+'の両を外す">×</button></li>').join(''):'<li>盤面を押して両を置こう。</li>';
    $('sicboTotal').textContent=money(M.sum(sicboChips.map(c=>c.stake)));refresh();
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
      later(round,()=>{track.parentElement.classList.add('stopped');track.parentElement.setAttribute('aria-label',['左','中央','右'][i]+'リール：'+final.map(id=>symbolName(id)).join('、'));tone('tick');if(i===2){$('slotMachine').classList.remove('spinning');showStatic(round);settle(round);}},duration);
    }
  }
  function showStatic(round) {
    if(round.game==='poker'){royalResult=round;renderRoyal(W.snapshot());}
    if(round.game==='sicbo')showSicbo(round);
    if(round.game==='janken'){$('playerHand').textContent=hands[round.data.player];$('opponentHand').textContent=hands[round.data.opponent];$('duelCall').textContent=round.data.multiplier===2?'勝ち':round.data.multiplier===1?'あいこ':'負け';}
    if(round.game==='roulette'){$('wheelNumber').textContent=round.data.number;rotation=-R.wheel.indexOf(round.data.number)*360/37;$('rouletteWheel').style.transition='none';$('rouletteWheel').style.transform='rotate('+rotation+'deg)';$('ballOrbit').style.transition='none';$('ballOrbit').style.transform='rotate(0deg)';$('rouletteBoard').querySelector('[data-position="n'+round.data.number+'"]')?.classList.add('landed');}
    if(round.game==='slots'){
      for(let i=0;i<3;i++){
        const t=$('reel'+i), grid=round.data.grid;
        const col=grid?[0,1,2].map(row=>grid[row*3+i]):[R.strip[(round.data.stops[i]+19)%20],round.data.reels[i],R.strip[(round.data.stops[i]+1)%20]];
        t.style.transition='none';t.innerHTML=col.map((id,row)=>symbolHTML(id,row)).join('');t.style.transform='translateY(0px)';
        t.parentElement.setAttribute('aria-label',['左','中央','右'][i]+'リール：'+col.map(id=>symbolName(id)).join('、'));
      }
      slotWins(round);
    }
  }
  function confetti(big) {
    if(fast())return;
    const count=variant==='king'?80:variant==='gold'?70:variant==='silver'?50:big?42:20;$('celebration').innerHTML=Array.from({length:count},()=>'<i style="--x:'+(Math.random()*100)+'%;--delay:'+(Math.random()*.7)+'s"></i>').join('');
    setTimeout(()=>$('celebration').replaceChildren(),3000);
  }
  function showResult(round,recovered=false) {
    const net=M.sub(round.creditedPayout??round.payout,round.stake),win=net>0,big=(round.game==='slots'&&(round.data.multiplier>=50||round.data.bonusTriggered))||(round.game==='poker'&&round.data.multiplier>=25);
    $('roundResult').className='round-result '+(win||round.data.bonusTriggered?'win':net<0?'loss':'draw');$('resultKicker').textContent=recovered?'RESULT RESTORED':round.data.bonusTriggered?'BONUS START':round.freeSpin?'FREE SPIN':big?'GOLDEN WIN':win?'YOU WIN':net===0?'STAKE RETURNED':'ROUND COMPLETE';
    let title=round.game==='janken'?(round.data.multiplier===2?'あなたの勝ち！':round.data.multiplier===1?'あいこ。掛け金が戻りました。':'NPCの勝ち。'):round.game==='roulette'?'玉は '+round.data.number+'！':round.data.title;
    if(round.game==='poker')title=round.data.title;
    if(round.game==='bitcoin'&&!round.data.refunded&&round.payout>round.stake)title='予想的中！払い戻し'+P.factor(round.rebirths??0,2)+'倍。';
    $('resultHeadline').textContent=title+(round.data.bonusTriggered&&title!=='ボーナス発動！'?' ボーナスも発動！':'');
    $('resultDetail').textContent=round.game==='sicbo'?'サイコロ '+round.data.dice.join('・')+' ／ 合計 '+round.data.sum+(round.data.triple?' ／ ゾロ目':'')+'。'+(round.data.bets?round.data.bets.filter(b=>b.payout>0).map(b=>R.sicboBet(b.id).label+' 基本配当 '+money(b.payout)).join(' ／ ')||'的中した場所はありません。':'予想：'+(round.data.choice==='small'?'小':'大')):round.game==='bitcoin'?(round.data.refunded?'判定に使える価格が取得できなかったため、掛け金を全額返しました。':usd(round.data.startPrice)+' → '+usd(round.data.endPrice)+' · '+(round.data.direction==='up'?'値上がり':'値下がり')+'を予想'):round.game==='janken'?'あなた：'+handNames[round.data.player]+' ／ NPC：'+handNames[round.data.opponent]:round.game==='roulette'?'払い戻し '+money(round.creditedPayout??round.payout)+'。的中した場所の両だけが倍率に応じて戻ります。':round.game==='poker'?round.data.handName:round.data.grid?(round.freeSpin?'ボーナス配当2倍 · ':'')+(round.data.wins.length?'的中 '+round.data.wins.length+'ライン · 合計 '+money(round.creditedPayout??round.payout):'ラインの的中なし')+(round.data.bonusTriggered?'。無料スピン5回を獲得！':''):'中央ライン：'+round.data.reels.map(id=>symbolName(id)).join(' · ');
    $('resultNumbers').hidden=false;$('resultBet').textContent=money(round.stake);$('resultPayout').textContent=money(round.creditedPayout??round.payout);$('resultNet').textContent=(net>0?'＋':'')+money(net);
    $('tableArea').classList.toggle('big-win',big);
    if(round.game==='poker')$('resultDetail').textContent=round.data.handName+' · '+round.data.holds.length+'枚を残して確定。基本配当 '+round.data.multiplier+'倍。';
    if((round.rebirths??0)>0)$('resultDetail').textContent+=' リボーン'+round.rebirths+'回 · 本来の配当 ×'+P.factor(round.rebirths)+'を適用（返金を除く）。';
    if(round.creditedPayout!==undefined&&M.cmp(round.creditedPayout,round.payout)<0)$('resultDetail').textContent+=' 所持金は上限の9999無量大数です。';
    if(win||round.data.bonusTriggered){tone(big?'big':'win');confetti(big);}else if(net<0)tone('lose');
    status(!recovered&&round.data.bonusTriggered?'ボーナス発動！無料スピン5回、配当は2倍です。':!recovered&&round.freeSpin?'無料スピンの配当を反映しました。'+(bonus()?'残り'+bonus().remaining+'回。':'ボーナス終了！'):recovered?'途中だった勝負を復元し、払い戻しを確認しました。':win?'払い戻しを両へ反映しました。次の勝負も好きなタイミングで。':net===0?'掛け金が戻りました。次の一手を選ぼう。':'勝負が終了しました。両の残高を確認して次へ。');
  }
  function errorText(error){return {'casino-locked':'リボーン回数が足りません。','insufficient':'両が足りません。掛け金を小さくするか、クイズで集めよう。','pending-round':'ほかの画面で勝負が進んでいます。終了を待ってね。','invalid-bet':'掛け金は1両以上の整数にしてください。','wallet-limit':'所持金の上限は9999無量大数です。','price-unavailable':'新しい価格を取得できません。接続が戻るまで待ってね。','round-gone':'記録が読み込まれたか、リセットされました。この勝負は終了しました。'}[error.message]||'両の更新に失敗しました。保存設定を確認し、ページを読み直すと途中の勝負を復元できます。';}
  function settle(round,recovered=false) {
    if(settling)return;settling=true;
    W.finish(round.id,result=>{settling=false;active=null;starting=false;if(round.game==='roulette'){chips=[];renderBets();}if(round.game==='sicbo'){sicboChips=[];renderSicboBets();}refresh();showResult(result,recovered);},error=>{settling=false;active=null;starting=false;refresh();status(errorText(error),true);});
  }
  function playRoyal(){
    if(starting||settling||locked()||!K)return;
    const pending=W.snapshot().pending;
    if(pending){
      if(pending.game!=='poker')return;
      settling=true;const holds=[...royalHolds];refresh();
      W.finishPoker(pending.id,holds,result=>{royalHolds.clear();royalResult=result;refresh();showResult(result);$('royalCards').classList.remove('royal-reveal');void $('royalCards').offsetWidth;$('royalCards').classList.add('royal-reveal');later(pending,()=>{settling=false;active=null;refresh();},fast()?80:800);},error=>{settling=false;refresh();status(errorText(error),true);});
      return;
    }
    const amount=stake();if(!validStake(amount)){status('掛け金は1両以上の整数にしてください。',true);return;}
    starting=true;royalHolds.clear();royalResult=null;refresh();
    W.beginPoker(amount,K.deal,round=>{active=round;refresh();later(round,()=>{starting=false;refresh();},fast()?80:650);$('resultNumbers').hidden=true;$('resultHeadline').textContent='残すカードを選ぼう。';$('resultDetail').textContent='カードを押すとHOLD。残りを一度だけ交換できます。';status('残すカードを選んで、交換ボタンを押そう。');tone('start');},error=>{starting=false;refresh();status(errorText(error),true);});
  }
  function play() {
    if(game==='poker'){playRoyal();return;}
    if(active||starting||locked())return;
    const amount=total();if(!validStake(amount)){status('掛け金は1両以上の整数。ルーレット・大小は先に盤面へ両を置こう。',true);return;}
    if(game==='bitcoin'){playBitcoin(amount);return;}
    starting=true;$('tableArea').classList.remove('big-win');$('celebration').replaceChildren();$('resultNumbers').hidden=true;$('resultKicker').textContent='GOOD LUCK';$('resultHeadline').textContent='勝負の準備…';$('resultDetail').textContent='';refresh();
    W.begin(game,amount,context=>outcome(amount,context),round=>{starting=false;active=round;refresh();status(round.freeSpin?'無料スピン！配当2倍で抽選中。':'掛け金 '+money(amount)+'。結果が決まるまで待ってね。');$('resultHeadline').textContent=game==='janken'?'じゃん、けん…':game==='roulette'?'玉の行方は、どこへ。':game==='sicbo'?'三つのサイコロ、いざ勝負。':'リールが止まる、その瞬間まで。';({janken:animateJanken,roulette:animateRoulette,slots:animateSlots,sicbo:animateSicbo}[game])(round);},error=>{starting=false;refresh();$('resultHeadline').textContent='勝負を始められませんでした。';status(errorText(error),true);},{variant});
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
  const chooseTab=b=>selectGame(b.dataset.game||({silver:'roulette',gold:'slots',king:'poker'}[b.dataset.casinoVariant]),true,b.dataset.casinoVariant||'standard');
  document.querySelectorAll('.casino-tabs [role=tab]').forEach(b=>{b.onclick=()=>{if(!active&&!starting&&!W.snapshot().pending)chooseTab(b);};b.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)||active||starting||W.snapshot().pending)return;e.preventDefault();const tabs=[...document.querySelectorAll('.casino-tabs [role=tab]')],index=tabs.indexOf(b),next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length;chooseTab(tabs[next]);tabs[next].focus();};});
  $('royalCards').onclick=e=>{const b=e.target.closest('[data-royal-card]');if(!b||b.disabled)return;const i=Number(b.dataset.royalCard);if(royalHolds.has(i))royalHolds.delete(i);else royalHolds.add(i);refresh();tone('tick');};
  $('royalHoldAll').onclick=()=>{royalHolds=new Set([0,1,2,3,4]);refresh();};$('royalHoldNone').onclick=()=>{royalHolds.clear();refresh();};
  document.querySelectorAll('[data-hand]').forEach(b=>b.onclick=()=>{if(b.disabled)return;hand=Number(b.dataset.hand);document.querySelectorAll('[data-hand]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));$('playerHand').textContent=hands[hand];$('opponentHand').textContent='？';$('duelCall').textContent='VS';$('jankenStage').classList.remove('revealed');tone('tick');});
  document.querySelectorAll('[data-stake]').forEach(b=>b.onclick=()=>{if(b.disabled)return;$('stake').value=b.dataset.stake;status(game==='roulette'?'盤面を押して両を置こう。':'掛け金を選びました。');refresh();});
  document.querySelectorAll('[data-all-in]').forEach(b=>b.onclick=()=>{if(b.disabled)return;$('stake').value=M.full(W.snapshot().balance);$('stake').oninput();});
  $('stake').oninput=()=>{status(validStake(stake())?'掛け金を変更しました。':'掛け金は1両以上の整数にしてください。',!validStake(stake()));refresh();};
  $('mobileStake').oninput=()=>{$('stake').value=$('mobileStake').value;$('stake').oninput();};
  $('undoBet').onclick=()=>{chips.pop();renderBets();};$('clearBets').onclick=()=>{chips=[];renderBets();};
  $('betSlip').onclick=e=>{const b=e.target.closest('[data-remove-bet]');if(!b||b.disabled)return;chips=chips.filter(c=>c.id!==b.dataset.removeBet);renderBets();};
  $('sicboUndo').onclick=()=>{sicboChips.pop();renderSicboBets();};$('sicboClear').onclick=()=>{sicboChips=[];renderSicboBets();};
  $('sicboBetSlip').onclick=e=>{const b=e.target.closest('[data-remove-sicbo]');if(!b||b.disabled)return;sicboChips=sicboChips.filter(c=>c.id!==b.dataset.removeSicbo);renderSicboBets();};
  $('soundToggle').onclick=()=>{sound=!sound;$('soundToggle').textContent='音 '+(sound?'ON':'OFF');$('soundToggle').setAttribute('aria-pressed',String(sound));if(sound)tone('start');};
  $('playRound').onclick=play;
  $('mobilePlayRound').onclick=play;
  window.addEventListener('hk-wallet-change',()=>{const wallet=W.snapshot();if(active?.game==='poker'&&!wallet.pending&&!starting&&!settling){const old=wallet.history.find(r=>r.id===active.id);active=null;if(old){royalResult=old;royalHolds.clear();refresh();showResult(old,true);return;}}refresh();});
  makeWheel();makeBoard();idleReels();makeDice();makeSicboBoard();
  const wallet=W.snapshot();if(wallet.pending?.game==='bitcoin')direction=wallet.pending.data.direction;$('stake').value=wallet.pending?.game==='poker'?M.full(wallet.pending.stake):M.cmp(wallet.balance,0)>0?(M.cmp(wallet.balance,10)<0?M.full(wallet.balance):10):10;
  selectGame(wallet.pending?.game||new URLSearchParams(location.search).get('game'),false,wallet.pending?.variant||'standard');
  if(new URLSearchParams(location.search).has('variant')){const url=new URL(location.href);url.searchParams.delete('variant');url.searchParams.set('game',game==='poker'?'janken':game);history.replaceState(null,'',url);}renderBets();renderSicboBets();
  if(wallet.pending){const round=wallet.pending;active=round;if(round.game==='poker'){renderRoyal(wallet);status('途中の手札を復元しました。残すカードを選んで交換しよう。');}else if(round.game==='bitcoin'){startBitcoinFeed();status('途中の予想を復元しました。判定時刻まで待ってね。');updateBitcoin();}else{showStatic(round);settle(round,true);}}
})();
