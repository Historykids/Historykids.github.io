/*
 * Original game cartogram: the pre-1868 sixty-eight provinces, plus Ezo and
 * Ryukyu as two supplemental game regions. The tiles express relative location;
 * they are not historical border polygons. No third-party geometry is copied.
 * Name convention reference: Ministry of the Environment, 令制国 六十八カ国一覧
 * https://www.env.go.jp/content/000303787.pdf
 * Historical boundaries vary by date. Modern-prefecture hints and the legacy
 * migration crosswalk are approximate; routes are explicit game connections.
 */
(function(root){
 'use strict';
 // id, name, reading, cartogram x/y, principal legacy prefecture, intersections.
 const rows=[
  ['ezo','蝦夷地','えぞち',1100,70,'01','01'],
  ['mutsu','陸奥','むつ',1080,170,'04','02 03 04 07'],
  ['dewa','出羽','でわ',1000,250,'06','05 06'],
  ['hitachi','常陸','ひたち',1190,410,'08','08'],
  ['shimotsuke','下野','しもつけ',1110,410,'09','09'],
  ['kozuke','上野','こうずけ',1030,410,'10','10'],
  ['musashi','武蔵','むさし',1110,490,'13','11 13 14'],
  ['shimosa','下総','しもうさ',1190,490,'12','08 11 12 13'],
  ['kazusa','上総','かずさ',1230,570,'12','12'],
  ['awa_boso','安房','あわ',1230,650,'12','12'],
  ['sagami','相模','さがみ',1110,570,'14','14'],
  ['izu','伊豆','いず',1030,650,'22','13 22'],
  ['kai','甲斐','かい',1030,490,'19','19'],
  ['suruga','駿河','するが',1030,570,'22','22'],
  ['totomi','遠江','とおとうみ',950,570,'22','22'],
  ['mikawa','三河','みかわ',870,570,'23','23'],
  ['owari','尾張','おわり',790,570,'23','23'],
  ['mino','美濃','みの',790,490,'21','21'],
  ['hida','飛騨','ひだ',870,410,'21','21'],
  ['shinano','信濃','しなの',950,490,'20','20 21'],
  ['echigo','越後','えちご',960,330,'15','15'],
  ['sado','佐渡','さど',900,230,'15','15'],
  ['etchu','越中','えっちゅう',870,330,'16','16'],
  ['noto','能登','のと',790,250,'17','17'],
  ['kaga','加賀','かが',790,330,'17','17'],
  ['echizen','越前','えちぜん',710,410,'18','18'],
  ['wakasa','若狭','わかさ',630,410,'18','18'],
  ['omi','近江','おうみ',710,490,'25','25'],
  ['ise','伊勢','いせ',790,650,'24','24'],
  ['shima','志摩','しま',870,650,'24','24'],
  ['iga','伊賀','いが',710,570,'24','24'],
  ['yamashiro','山城','やましろ',630,570,'26','26'],
  ['yamato','大和','やまと',630,650,'29','29'],
  ['kawachi','河内','かわち',550,650,'27','27'],
  ['izumi','和泉','いずみ',550,730,'27','27'],
  ['settsu','摂津','せっつ',550,570,'27','27 28'],
  ['kii','紀伊','きい',630,730,'30','24 30'],
  ['tamba','丹波','たんば',550,490,'26','26 28'],
  ['tango','丹後','たんご',550,410,'26','26'],
  ['tajima','但馬','たじま',470,410,'28','28'],
  ['harima','播磨','はりま',470,570,'28','28'],
  ['inaba','因幡','いなば',390,410,'31','31'],
  ['hoki','伯耆','ほうき',310,410,'31','31'],
  ['mimasaka','美作','みまさか',390,490,'33','33'],
  ['bizen','備前','びぜん',390,570,'33','33 37'],
  ['bitchu','備中','びっちゅう',310,570,'33','33'],
  ['bingo','備後','びんご',230,570,'34','33 34'],
  ['izumo','出雲','いずも',230,410,'32','32'],
  ['iwami','石見','いわみ',150,490,'32','32'],
  ['oki','隠岐','おき',270,300,'32','32'],
  ['aki','安芸','あき',150,570,'34','34'],
  ['suo','周防','すおう',70,570,'35','35'],
  ['nagato','長門','ながと',70,490,'35','35'],
  ['awaji','淡路','あわじ',470,690,'28','28'],
  ['awa','阿波','あわ',470,770,'36','36'],
  ['sanuki','讃岐','さぬき',390,690,'37','37'],
  ['iyo','伊予','いよ',310,770,'38','38'],
  ['tosa','土佐','とさ',390,850,'39','39'],
  ['tsushima','対馬','つしま',40,670,'42','42'],
  ['iki','壱岐','いき',120,670,'42','42'],
  ['chikuzen','筑前','ちくぜん',80,750,'40','40'],
  ['chikugo','筑後','ちくご',80,830,'40','40'],
  ['buzen','豊前','ぶぜん',160,750,'40','40 44'],
  ['bungo','豊後','ぶんご',200,830,'44','44'],
  ['hizen','肥前','ひぜん',0,830,'41','41 42'],
  ['higo','肥後','ひご',80,910,'43','43'],
  ['hyuga','日向','ひゅうが',200,910,'45','45 46'],
  ['satsuma','薩摩','さつま',80,990,'46','46'],
  ['osumi','大隅','おおすみ',160,990,'46','46'],
  ['ryukyu','琉球','りゅうきゅう',0,1090,'47','47']
 ];
 const prefectures=['北海道','青森','岩手','宮城','秋田','山形','福島','茨城','栃木','群馬','埼玉','千葉','東京','神奈川','新潟','富山','石川','福井','山梨','長野','岐阜','静岡','愛知','三重','滋賀','京都','大阪','兵庫','奈良','和歌山','鳥取','島根','岡山','広島','山口','徳島','香川','愛媛','高知','福岡','佐賀','長崎','熊本','大分','宮崎','鹿児島','沖縄'];
 const important=new Set(['mutsu','musashi','kai','owari','yamashiro','settsu','satsuma']);
 const regions=rows.map(([id,name,reading,cx,cy,legacyPrefecture,overlap])=>{
  const x=cx+100,y=cy+35,l=x-36,r=x+36,t=y-33,b=y+33;
  const legacyPrefectures=overlap.split(' '),supplemental=id==='ezo'||id==='ryukyu';
  return Object.freeze({id,name,short:name,reading,province:supplemental?name:name+'国',supplemental,
   modern:legacyPrefectures.map(n=>prefectures[Number(n)-1]).join('・'),castle:name+'の城',
   tier:important.has(id)?3:2,unit:'infantry',x,y,
   path:`M${l+8},${t}H${r-8}L${r},${t+8}V${b-8}L${r-8},${b}H${l+8}L${l},${b-8}V${t+8}Z`,
   legacyPrefecture,legacyPrefectures:Object.freeze(legacyPrefectures)});
 });
 const japanRegions=Object.freeze([...regions]);
 const overseas=[["russia","ロシア",650,205],["qing","清",746,389],["joseon","朝鮮",847,413],["britain","ブリテン諸島",119,291],["france","フランス",168,353],["iberia","イベリア",175,423],["scandinavia","北欧",268,209],["central_europe","中部ヨーロッパ",267,329],["italy","イタリア",238,404],["ottoman","オスマン",320,443],["kazakh","カザフ",526,329],["bukhara","ブハラ",510,393],["kokand","コーカンド",591,390],["persia","ペルシア",458,442],["afghanistan","アフガニスタン",546,446],["india","インド",576,524],["bengal","ベンガル",640,498],["burma","ビルマ",680,529],["siam","シャム",711,559],["vietnam","大越",738,546],["arabia","アラビア",427,515],["north_africa","北アフリカ",249,559],["south_africa","南アフリカ",303,737],["madagascar","マダガスカル",419,749],["indonesia","東インド諸島",777,667],["philippines","フィリピン",825,573],["oceania","オーストラリア",881,788],["new_zealand","ニュージーランド",1086,883],["pacific","太平洋諸島",1150,672],["canada","北アメリカ北部",1492,263],["united_states","アメリカ合衆国",1698,428],["louisiana","ルイジアナ",1645,383],["new_spain","ヌエバ・エスパーニャ",1522,483],["caribbean","カリブ諸島",1741,551],["new_granada","南アメリカ北部",1732,621],["peru","アンデス",1733,754],["la_plata","ラプラタ",1728,884],["brazil","ブラジル",1841,724],["greenland","グリーンランド",1867,151],["iceland","アイスランド",57,179]];
 for(const [id,name,x,y] of overseas)regions.push(Object.freeze({id,name,short:name,reading:name,province:name,supplemental:true,overseas:true,modern:"海外のゲーム地域",castle:name+"の拠点",tier:2,unit:"infantry",x,y,legacyPrefecture:null,legacyPrefectures:Object.freeze([])}));
 const regionById=new Map(regions.map(r=>[r.id,r]));
 // Land links describe bordering old provinces; water links are game routes.
 const land=`
 yamashiro-omi yamashiro-iga yamashiro-yamato yamashiro-kawachi yamashiro-settsu yamashiro-tamba
 yamato-iga yamato-ise yamato-kii yamato-kawachi kawachi-izumi kawachi-settsu kawachi-kii izumi-settsu izumi-kii
 settsu-tamba settsu-harima iga-omi iga-ise ise-omi ise-mino ise-owari ise-kii ise-shima
 owari-mino owari-mikawa mikawa-mino mikawa-shinano mikawa-totomi totomi-shinano totomi-suruga
 suruga-shinano suruga-kai suruga-sagami suruga-izu izu-sagami kai-shinano kai-sagami kai-musashi
 sagami-musashi musashi-shinano musashi-kozuke musashi-shimotsuke musashi-shimosa
 shimosa-shimotsuke shimosa-hitachi shimosa-kazusa kazusa-awa_boso hitachi-mutsu hitachi-shimotsuke
 omi-wakasa omi-echizen omi-mino mino-echizen mino-hida mino-shinano
 hida-echizen hida-kaga hida-etchu hida-shinano shinano-echigo shinano-etchu shinano-kozuke
 kozuke-echigo kozuke-shimotsuke kozuke-mutsu shimotsuke-mutsu mutsu-dewa mutsu-echigo dewa-echigo
 wakasa-tango wakasa-tamba wakasa-echizen echizen-kaga kaga-etchu kaga-noto noto-etchu etchu-echigo
 tamba-tango tamba-tajima tamba-harima tango-tajima tajima-harima tajima-mimasaka tajima-inaba
 inaba-mimasaka inaba-hoki hoki-mimasaka hoki-bitchu hoki-bingo hoki-izumo
 izumo-bingo izumo-iwami iwami-bingo iwami-aki iwami-suo iwami-nagato
 harima-mimasaka harima-bizen mimasaka-bitchu mimasaka-bizen bizen-bitchu bitchu-bingo bingo-aki aki-suo suo-nagato
 awa-sanuki awa-iyo awa-tosa sanuki-iyo iyo-tosa
 chikuzen-hizen chikuzen-chikugo chikuzen-buzen chikugo-hizen chikugo-higo chikugo-bungo
 buzen-bungo bungo-higo bungo-hyuga higo-hyuga higo-satsuma higo-osumi hyuga-osumi hyuga-satsuma osumi-satsuma`;
 const sea='ezo-mutsu sado-echigo oki-izumo oki-hoki awaji-settsu awaji-harima awaji-awa awaji-kii awa-kii sanuki-bizen iyo-aki iyo-suo iyo-bungo nagato-buzen hizen-iki iki-tsushima satsuma-ryukyu osumi-ryukyu';
 const globalLand='russia-qing russia-kazakh russia-scandinavia russia-central_europe qing-joseon qing-kokand qing-afghanistan qing-india qing-burma qing-vietnam kazakh-bukhara kazakh-kokand bukhara-kokand bukhara-persia bukhara-afghanistan kokand-afghanistan persia-afghanistan persia-ottoman afghanistan-india india-bengal bengal-burma burma-siam siam-vietnam ottoman-arabia ottoman-central_europe central_europe-france central_europe-italy france-iberia north_africa-south_africa canada-united_states canada-louisiana united_states-louisiana louisiana-new_spain new_spain-new_granada new_granada-peru peru-la_plata peru-brazil la_plata-brazil new_granada-brazil';
 const globalSea='tsushima-joseon ezo-russia ryukyu-qing hizen-qing ryukyu-philippines qing-philippines vietnam-philippines vietnam-indonesia siam-indonesia india-arabia arabia-north_africa ottoman-north_africa iberia-north_africa iberia-britain britain-france britain-scandinavia britain-iceland iceland-greenland greenland-canada russia-canada italy-north_africa south_africa-madagascar indonesia-oceania philippines-pacific pacific-new_zealand oceania-new_zealand new_spain-caribbean caribbean-new_granada iberia-caribbean';
 const routes=Object.freeze([[land,false],[sea,true],[globalLand,false],[globalSea,true]].flatMap(([text,water])=>text.trim().split(/\s+/).map(pair=>Object.freeze({ends:Object.freeze(pair.split('-')),sea:water}))));
 const legacy=['ezo','mutsu','mutsu','mutsu','dewa','dewa','mutsu','hitachi','shimotsuke','kozuke','musashi','shimosa','musashi','sagami','echigo','etchu','kaga','echizen','kai','shinano','mino','suruga','owari','ise','omi','yamashiro','settsu','harima','yamato','kii','inaba','izumo','bizen','aki','suo','awa','sanuki','iyo','tosa','chikuzen','hizen','hizen','higo','bungo','hyuga','satsuma','ryukyu'];
 const region=id=>regionById.get(id);
 const legacyRegion=id=>region(id)?id:/^(?:0?[1-9]|[1-3][0-9]|4[0-7])$/.test(String(id))?legacy[Number(id)-1]:null;
 function reachable(state,id){return !!region(id)&&!state.ownedRegions.includes(id)&&routes.some(edge=>(!edge.sea||state.port)&&edge.ends.includes(id)&&edge.ends.some(n=>state.ownedRegions.includes(n)));}
 function enemy(state,id){const r=region(id);if(!r)return null;return{...r,army:Math.round((200+r.tier*r.tier*120)*(1+Math.min(state.unifications||0,20)*.25)),level:r.tier,reward:r.tier>=4?300:100};}
 const api=Object.freeze({version:2,mapVersion:"world-18c-v1",japanRegions,overseasRegions:Object.freeze(regions.filter(r=>r.overseas)),regions:Object.freeze(regions),routes,region,reachable,enemy,legacyRegion,
  viewBox:'0 0 1920 1080',mapNote:'旧国68か国＋蝦夷地・琉球のゲーム用模式図。位置と進軍路を示し、歴史上の国境そのものは表していません。',
  source:'https://www.env.go.jp/content/000303787.pdf'});
 root.HKSengokuKuniMap=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
