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
 const allowed=new Set(palette.map(p=>p.emoji)),MAX_EMOJIS=8,COOLDOWN=5000,WINDOW=60000,MAX_PER_WINDOW=10;
 const valid=value=>Array.isArray(value)&&value.length>=1&&value.length<=MAX_EMOJIS&&value.every(e=>typeof e==='string'&&allowed.has(e));
 const api=Object.freeze({palette,MAX_EMOJIS,COOLDOWN,WINDOW,MAX_PER_WINDOW,valid});root.HKSengokuChatRules=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
