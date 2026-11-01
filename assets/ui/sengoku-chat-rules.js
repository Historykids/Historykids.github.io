/* Exact sequences only: no free text, letters, numbers, invisible characters or links. */
(function(root){
 'use strict';
 const palette=Object.freeze([
  ['😀','にっこり'],['😊','えがお'],['😆','わくわく'],['😂','大笑い'],['🥳','お祝い'],['😎','かっこいい'],['🤔','考え中'],['😮','びっくり'],
  ['😢','かなしい'],['😭','大泣き'],['😴','おやすみ'],['🥺','お願い'],['🤗','ありがとう'],['🙌','やった'],['👏','拍手'],['👍','いいね'],
  ['👌','了解'],['✌️','勝利'],['🤝','握手'],['🙏','おねがい'],['💪','がんばる'],['👋','またね'],['🫡','敬礼'],['🙇','おじぎ'],
  ['❤️','ハート'],['💛','黄色のハート'],['💚','緑のハート'],['💙','青のハート'],['✨','きらきら'],['🌟','星'],['🎉','おめでとう'],['🎊','お祝いのくす玉'],
  ['🏯','城'],['⚔️','刀'],['🛡️','盾'],['🏹','弓'],['🐎','馬'],['👑','王冠'],['🏆','優勝'],['🥇','金メダル'],
  ['🌸','桜'],['🌻','ひまわり'],['🍁','もみじ'],['❄️','雪'],['☀️','晴れ'],['🌙','月'],['🌈','虹'],['🌏','地球'],
  ['📚','勉強'],['✏️','鉛筆'],['💡','ひらめき'],['🎯','目標'],['🍵','お茶'],['🍙','おにぎり'],['🍡','だんご'],['🎮','ゲーム']
 ].map(([emoji,label])=>Object.freeze({emoji,label})));
 const presetGroups=Object.freeze([
  ['greeting','あいさつ',['こんにちは！','ありがとう！','おつかれさま！','よろしくお願いします！','またあとで！','おやすみなさい！']],
  ['cheer','応援・お祝い',['ナイス！','おめでとう！','いい勝負だった！','助かりました！','あと少し！','みんなでがんばろう！']],
  ['alliance','同盟募集',['同盟メンバー募集中！','同盟に入りたいです！','初心者も歓迎です！','一緒に天下統一を目指そう！','加入申請を送りました！','同盟への参加ありがとう！']],
  ['support','援軍・協力',['援軍をお願いします！','援軍に向かいます！','援軍要請を確認しました！','一緒に攻めよう！','共同攻撃ありがとう！','同盟本陣を確認してね！']],
  ['strategy','作戦・外交',['停戦を希望します！','防衛を固めよう！','兵士を集めています！','攻撃の準備中です！','今は攻撃を待とう！','外交の提案を確認してね！']],
  ['quiz','クイズ・育成',['クイズがんばろう！','全問正解できた！','世界史に挑戦中！','武将を育てています！','城を建設しています！','同盟ミッションを進めよう！']]
 ].map(([id,name,messages])=>Object.freeze({id,name,messages:Object.freeze(messages)})));
 const presets=Object.freeze(presetGroups.flatMap(g=>g.messages)),CHANNEL_VERSION='world-chat-20261101-v1',PRESET_VERSION='chat-presets-20261101-v2';
 const allowed=new Set(palette.map(p=>p.emoji)),MAX_EMOJIS=8,COOLDOWN=5000,WINDOW=60000,MAX_PER_WINDOW=10;
 const valid=value=>Array.isArray(value)&&value.length>=1&&value.length<=MAX_EMOJIS&&(value.every(e=>typeof e==='string'&&allowed.has(e))||(value.length===1&&presets.includes(value[0])));
 const api=Object.freeze({palette,presets,presetGroups,CHANNEL_VERSION,PRESET_VERSION,MAX_EMOJIS,COOLDOWN,WINDOW,MAX_PER_WINDOW,valid});root.HKSengokuChatRules=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
