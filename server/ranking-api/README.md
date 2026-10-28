# 歴史キッズ ランキングAPI

`historykids-ranking-api` は早押しと成金ランキングのCloudflare Workerです。SQLite-backed Durable Objectで順位・確認済み自己ベストを永続保存します。偉人AIのWorkerとは独立して動作します。

## 成金ランキング

`GET /wealth` は経済力順の上位100件・本人の記録・全参加者数・本人の正確な順位を返します。同点は同順位です。`POST /wealth/register` は `{name,snapshot:{balance,buildings:{house:2},residents:{farmer:1}},expectedRevision}` を受け取り、名前だけを入力して現在の町を登録・更新できます。0両・建物0個でも参加できます。建物には木・畑・道路・橋・塀も含みます。

総資産は所持両＋建造物の購入額＋住民の購入額。経済力は総資産＋建造物数×20＋住民数×10です。型・件数・町の最大面積・住民100人の上限を検証し、購入価格と合計値はサーバーで計算します。町と所持両はブラウザに保存されたゲームデータの自己申告であり、クイズ回答を検証する早押しランキングとは異なります。

成金用の32バイト所有証明をAuthorizationで送り、サーバーにはSHA-256のIDだけを保存します。同じブラウザの更新は1件を置き換えます。名前が同じ別の利用者も参加でき、名前だけでは他人の記録を上書きできません。`expectedRevision` が古い更新は409で拒否し、同一内容の再送は成功として扱います。更新で経済力が下がっても現在の値を反映します。早押しの既存テーブルには触れず、同じDurable Object内の専用テーブルを使います。`node tests/wealth-api.cjs` で保存・更新・競技順位・所有権・既存早押しとの共存を確認できます。

GitHub Actionsの **Deploy ranking API** が既存の `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を使って公開し、公開HTTPSの順位読み込みを確認してから `assets/ui/ranking-config.js` を更新します。ブラウザ用の設定は公開URLだけです。

## スコア

10問の正解数を `correct`、回答時間の合計ミリ秒を `answerMs` とすると、

`score = Math.round(correct / 10 * (8000 + 2000 * 60000 / (60000 + answerMs)))`

最大10,000点。正確さ80％・速さ20％で、速さの点数も正答率に応じて加算します。0問正解なら0点ですが、10問完走した記録は登録できます。スコアの高い順に上位100件を返し、同じ整数スコアは同じ競技順位になります。同点内の表示順は合計回答時間、所有IDの順です。自己ベストも同じスコア比較で更新します。

## API

- `GET /ranking`：スコア順の上位100件、自分の公開記録。
- `POST /ranking/start`：14時代から10時代を選び、各時代1問ずつ出題し、挑戦IDを発行。`timingVersion:2` で問題ごとの計測を開始します。
- `POST /ranking/question`：`ticket,index` を検証してサーバー時刻で問題の計測を開始。同じ問題の再送は開始時刻を変えません。
- `POST /ranking/answer`：`ticket,index,id,raw` を検証し、正誤とサーバー時計による回答時間を保存。重複送信は元の結果を返します。問題あたり最大45秒で、期限を超えた回答は不正解です。
- `POST /ranking/finish`：10問すべての計測済み回答を照合し、正解数・合計回答時間・スコアを計算して自己ベストの登録用proofを返します。クライアント指定の時間・正誤・スコアは信用しません。同じ挑戦の再送で結果を変えません。今回の記録（`roundCorrect,roundAnswerMs,roundScore`）と自己ベストを別に返します。
- `POST /ranking/register`：確認済みproofとニックネームを受け取り、自己ベストのスコアを公開。登録済みの高いスコアと日時を保ち、本人のproofでニックネームも更新できます。

問題開始の受理から回答の受理までの時間を各問で計測します。カウントダウン、解説、次の問題の準備時間は合計に含みません。通信の往復によるわずかな時間は含まれます。誤答への5秒加算は廃止しています（60秒ラッシュのルールは別です）。

既存のDurable Objectと所有証明を引き継ぎ、SQLiteの列追加で更新します。古いscores/receiptsの名前・ID・日時・proofを保ち、保存済みの `ms` から誤答5秒の加算分を引いた時間でスコアを換算します。旧記録は当時の解説中の時間を分離できないため `timingVersion:1` として扱います。公開直後にすでに遊んでいる旧クライアントの完走も受け付けます。

ブラウザの所有証明は暗号学的乱数32バイトで生成し、localStorageに保存します。Authorizationヘッダーだけで送信し、URLに含めません。サーバーはSHA-256を保存IDに使い、所有証明やproofは公開一覧に返しません。ブラウザの保存データを消すと、その記録を更新する所有証明も失われます。

Originは `https://historykids.github.io` のみ。IPあたり読み込み60回/分、変更60回/分、サイト全体600回/分に制限します。空白名、期限切れの挑戦、欠けた・形式不正・順番違いの回答、別のブラウザのproofは受け付けません。SQLはパラメーターを使用し、ニックネームはtextContentで表示します。

確認済みの自己ベストreceiptは挑戦とは別に保存され、結果画面を閉じても後から登録できます。古い端末内ベストと旧Firebaseのデータは削除しません。接続できないときも端末内で早押しを遊べます。問題ごとの計測中に通信が失敗した場合は安全に端末内のプレイへ切り替え、その回を未確認記録として扱います。

問題IDと正解データは `../figure-api/ranking-questions.mjs` です。クイズを増やした際はこのデータも更新してください。`node tests/ranking-api.cjs` は実際のSQLiteで、旧記録の移行・所有権・正解検証・計測の再送・解説時間の除外・スコア順・自己ベスト更新を確認します。

公式仕様： https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/


## Username and password accounts

`/wealth/account/register` and `/wealth/account/login` use a 3–24 character account name and an 8–128 character password; email is not collected. Names use NFKC and case-insensitive uniqueness. Passwords use individually salted scrypt (N=32768, r=8, p=3, 32-byte result). Derivations are serialized with a bounded queue to fit the Worker memory budget. The Worker enables `nodejs_compat`; `ACCOUNT_AUTH_LIMITER` limits attempts by IP, and Durable Object counters also throttle each account name.

Sessions are random 256-bit bearer tokens with a 30-day expiry. The database stores only token digests. Logout revokes that session; a password change revokes all older sessions. A newly registered account adopts its proven guest identity so wealth rankings, administrator access, personal notifications and active poker tickets keep their owner. The separate quiz identity is retained by possession of its original token. Bound guest credentials cannot bypass account sign-in.

The explicit `account-data.js` allowlist covers the wallet, town, rebirths, learning and supported game records. Credentials, admin drafts and private ranking caches are excluded. Authenticated snapshots preserve decimal amount strings and use revisions to reject stale writes. Identical retries are idempotent. One-time-code receipts are retained across saved resets. The account page offers a choice when device snapshots conflict. A journal rolls back interrupted local switches, and stale tabs cannot mutate the newly active profile.

Register, login, session, logout, password, save, load and capabilities routes share the existing trusted-origin and no-store policy. Cloud save payloads are capped at 1 MiB and remain private to the owning account. Guests can continue without registering. There is no email-based password recovery.

Validation: `node tests/accounts-api.cjs` and `node tests/accounts-ui.cjs`; the deployment probe exercises a rejected login with a random nonexistent name, testing the deployed password runtime without creating an account.


## 通知の編集・削除

管理者は通知ページの「送信済みの通知」から、全体配信と個人配信を編集・削除できます。編集で配信先・ID・配信日時は変わらず、受信側には編集済み日時が付き、未読に戻ります。削除は確認画面で確定し、受信側が次に更新した際に一覧から消えます。

`GET /wealth/admin/notice-history?offset=0` は管理者専用の50件ずつの履歴です。個人宛ての名前・IDはこの履歴だけに含め、公開一覧は引き続き全体配信と本人宛てだけを返します。`POST /wealth/admin/notice-edit` は `{id,expectedRevision,requestId,title,body}`、`POST /wealth/admin/notice-delete` は `{id,expectedRevision,requestId}` を受け取ります。正のIDは全体配信、負のIDは個人配信です。変更前の版が異なると409、削除済みなら404です。ログイン済み管理者も既存の所有権解決を通ります。

変更と永続receiptは同一トランザクションで確定します。同じrequestId・内容の再試行は成功を返し、異なる内容には使い回せません。元の配信内容のreceiptも保持するので、編集・削除後に古い送信を再試行しても上書き・復活しません。旧通知はID・本文・日時を維持して移行します。

検証: `node tests/notices-api.cjs`、`node tests/notices-ui.cjs`。公開時の疎通確認は管理者以外の拒否だけを検証し、実際の通知を変更しません。


## 戦国天下統一（2026-10-25）

`GET /wealth/sengoku` は本人の進行と、現在答えられる問題1問だけを返します。`POST /wealth/sengoku/action` は `{type,revision,requestId,...}` を受け取り、開始、募兵、武将選択・鍛錬、築城、港、訓練・出陣、回答、次の問題、撤退、次周回、ランキング参加を検証します。兵力・作戦・5問の正誤からサーバーで勝敗と報酬を確定します。ブラウザからの軍功・領土・正誤・スコアの申告は受け付けません。

既存SQLite Durable Objectの専用テーブルで保存します。学校など同じIPの利用者が干渉しないよう、プレイヤー単位60回/分と戦国専用の全体3,000回/分の制限を使います。新たなD1や認証基盤は作らず、既存アカウントの所有権を解決して引き継ぎます。ゲストでも遊べ、ゲスト記録を採用したアカウントなら別端末で再開できます。戦国の記録と永久報酬は、両・リボーン・アカウントの端末内スナップショットから独立しています。クライアントのIndexedDBは所有者別の控えで、サーバーの進行を上書きする権限はありません。

状態・兵糧の予約・戦闘結果・週別軍功・公開スコア・requestId receiptは同じ同期トランザクションで確定します。古いrevisionは409、同一requestIdの異なる内容も409です。同じ操作の再試行は現在の進行を返し、報酬を再加算しません。未完の問題の本文・正解のスナップショット、選択肢順、編成は永続保存され、将来の問題と正解は本人への応答にも含めません。獲得済みカードIDは本人へ返し、既存カードの取得状態へ合流します。

`GET /wealth/sengoku/board?period=alltime|weekly` は公開参加に同意したアカウントだけを載せます。全期間は最多制覇地域、倒した地域の敵将数、累計獲得軍功、達成日時の順。週間は月曜日0時（日本時間）からの軍功と達成日時の順で、週を変えるだけなので全体の進行を初期化しません。名前・戦績以外の個人進行、問題、兵糧は公開しません。BANとNGワードを適用します。

ルール・47地域・進軍路は `assets/ui/sengoku-rules.js`。問題と同じ長さの誤答候補は既存の歴史カードから `npm run sengoku:write` で生成します。`npm run sengoku:check`、`node tests/sengoku-api.cjs`、`node tests/sengoku-ui.cjs` が途中復元、権限、再送、ロールバック、全47地域の実際の攻略、周回、限定城の無料設置とリボーン後の保持を検証します。公開後のチェックは読み取りだけで、テスト用の国や戦績を作りません。


## 47-player Sengoku worlds: four independent quizzes (v3)

The existing account and shared SQLite Durable Object store the game. The solo game and wallet are independent. Public world responses use `sengoku-world-v3`; mutations require `rules:3`, a durable request ID and the current player revision. Older clients cannot mutate the new rules.

`quiz` requires one of `general`, `soldiers`, `level`. `begin` starts `battle` with only a target and territory revision. All four modes shuffle five distinct IDs and choices from the existing 298 Jomon–Heisei questions. A server-owned snapshot keeps each question and the attacking force stable. One pending quiz per player; overlapping attackers/defenders/provinces are locked, disjoint attacks can proceed.

- General quizzes increment only the acquisition counter. Each 50 correct answers grants one unowned general. Acquisition never levels a general or grants soldiers.
- Soldier quizzes alone add 20 soldiers per correct answer, plus the selected general's recruitment bonus.
- Level quizzes alone give the selected general experience (base 1 plus its training bonus). Level 1 needs 10 XP, level 2 needs 20, up to level 100. They do not grant soldiers or general credits.
- Battle quizzes end on the first wrong answer, with no damage. Exactly five consecutive correct answers apply `ceil(frozen attack force / 2)` damage to the targeted province's current garrison, capped at its remaining defenders. Attack force is soldier count plus the selected general's attack buff. Combat gives no soldier, acquisition or XP rewards. Historical learning cards still record correct answers in every mode.

Damage to each neutral or player-owned province garrison is persistent. A surviving defender keeps its territory, with no attack cooldown imposed on the attacker. At zero garrison soldiers the targeted province transfers and only the attacker receives a server-enforced 1,800,000 ms (30 minute) cooldown on all new attacks. Learning quizzes remain available during cooldown. Final answers, troop loss, territory, defender reports, cooldown, rankings and idempotency receipts commit atomically; retries cannot apply damage twice. Retreat and timeout deal no damage.

A captured defender keeps its other territory, generals/levels/XP, acquisition progress, permanent rewards and world membership. Its soldier reserve is preserved; it can reinforce through soldier quizzes, respawn in a neutral province, or attack its original home even with no land. Home reclamation remains possible after nationwide unification; the first successful reclamation reopens the map, without removing the previous winner's permanent castle. Neutral starts, respawn and normal captures protect the province for 30 minutes. A landless player who previously owned its original home can reclaim that home without waiting for that province's protection; a successful home reclamation grants no protection. Initial occupied-home participants do not get this exception until they have actually owned that home; owning another province does not unlock it. All other route, friendly-fire, troop, battle and attack-cooldown checks still apply. Declaring an attack ends the attacker's territorial protection.

General effects are expressed as attack-force, dedicated soldier-quiz recruitment or dedicated level-quiz XP bonuses. Old commanders and levels remain; obsolete defense and per-answer battle multipliers are replaced with the relevant dedicated quiz effects described on each card.

Migration from v1/v2 is bounded and idempotent (`sengoku_world_rule_versions`, version 3). Old soldiers/land/generals/XP/credits/cards remain. Historical total correct answers initialize the dedicated general counter so old unspent acquisition credits are preserved. Old pending attacks are safely cancelled without new damage; rewards already awarded stay awarded. New per-mode counters start separately. Browser caches are display-only; verified server state replaces them.

World creation stays capacity-only: bootstrap the first world, then create the next only when the newest world reaches 47 unique participant slots. Occupied starts, lack of neutral land, retirement or under-capacity unification never create a world. Existing records remain. Force rankings derive from current soldiers and attack buffs and preserve reserve strength when province defenders are lost, with national/world scope, public opaque player IDs and moderation filters.

Deployment verifies the public mode list, combat version and cooldown using read-only requests. A bounded rollout wait tolerates brief old-version responses; it never creates a production player, quiz or battle.

## Sengoku alliances (2026-10-25)

Alliances are an additive feature of `sengoku-world-v3`; existing quizzes, troops, commanders, territory, receipts and capture cooldowns continue without resetting. A world stores alliance groups and private 24-hour invitations. One player can belong to one alliance in the same world, with at most five members. Names use NFKC normalization, length 2–16, safe characters, per-world uniqueness and the existing NG-word filter.

`alliance_create`, `alliance_rename`, `alliance_invite`, `alliance_respond`, `alliance_cancel`, `alliance_leave`, `alliance_kick`, and `alliance_lead` use the existing authenticated world action endpoint, revision and idempotency journal. Only the recipient can accept/decline an invitation; only the leader can invite, cancel, rename, remove or transfer leadership. Leaving transfers leadership automatically; the last departure dissolves the alliance. Leaving/removal prevents creation or joining for five minutes, without changing armies or commanders. Active wars block affected membership changes, so a treaty cannot cancel a pending hostile attack. A recipient retiring from a world clears its pending invitations. A moderated leader is replaced by an eligible remaining member.

Benefits are server enforced: allied provinces cannot be attacked; the union of eligible allied provinces provides shared land/sea frontiers; the dedicated soldier quiz gains +2 soldiers per eligible ally, capped at +8. The quiz snapshots this bonus at its start. Joining, leaving or changing the roster later cannot change an in-flight reward. No other quiz mode receives the bonus, and membership actions never mint soldiers or XP. Existing general buffs and the troop cap apply. Territories and armies remain individually owned.

`GET /wealth/sengoku/world/alliances` returns `sengoku-alliance-v1`, nationally or with `?world=ID`. Separate group/member index tables join live server-owned individual force scores. Ranks order summed force, territory and wins, then achievement time; real ties share a rank. Top 100 plus the caller's actual alliance/rank are returned. Reserve growth, captures, joining, retirement and removal immediately affect totals; losing defenders alone does not reduce reserve force. Moderated accounts and NG names are excluded. Public results contain opaque player/group IDs and public names/metrics, never account owner hashes, sessions, invitations, quiz snapshots or XP.

Membership/index updates and world revisions share the existing SQLite transaction and request receipt. Failed cache/receipt writes roll back all membership, invitation and ranking changes. The feature bootstraps empty alliance arrays lazily; it never creates an extra world or cancels a current v3 quiz. The dedicated page is `sengoku-alliance-ranking.html`; gameplay provides a fifth navigation tab and marks allied territory on the SVG map. Public deployment probes only read configuration/rankings and never create a group or invitation.

## Initial home selection and neutral-only respawn

A new participant can choose a province already owned by another player, including in a unified map with fewer than 47 participants. The province remains with its current owner, including its army, protection and any ongoing battle. The new player starts with zero soldiers and no territory, can train and attack that home, or respawn in an unowned province. Neutral starts still grant the chosen neutral province. Respawn never transfers an occupied province. Existing worlds are filled before a new world is created, and only the 47th admission creates the next world. Alliance territory provides additional land and sea frontiers, including for landless allies; friendly provinces remain protected from allied attacks.

## Province garrisons

The owned-province garrison is saved independently of the player's offensive soldier reserve. Combat damages only the target province; the reserve, other provinces and force ranking remain unchanged. At zero defenders the province changes owner and receives the new owner's current reserve as its garrison. Neutral starts have zero defenders, and respawns copy the existing reserve without spending it. Correct soldier-quiz answers reinforce all currently owned provinces by the recruitment reward, independently capped at the soldier limit, even if the reserve is already at its cap. Other quiz modes give no garrison reinforcement.

Existing v3 worlds initialize owned garrisons once from the current reserve. Pending quizzes, questions, answers, attack snapshots, locks, rewards and cooldowns are preserved. Damaged garrisons never reset on reload or unrelated ownership changes. Ownership, garrison loss, reinforcement, rankings and receipts use the existing atomic transactions and replay protection. Public configuration advertises `armyModel: province-garrisons-v1`; public regions expose their current `garrison`.

### 旧国マップ・常設5ワールド（2026-10-25）

オンライン版は `sengoku-world-v4`、書き込み `rules: 4`。`assets/ui/sengoku-kuni-map.js` が旧国68国＋蝦夷地・琉球の70領地、独自模式図、陸路・海路、旧47県との対応を定義する。ひとり用は以前の地図・ルールを保つ。

- ワールド1〜5を初回アクセス時に冪等作成する。人数上限は設けず、満員による追加作成はしない。おまかせは参加人数の少ないワールドを選ぶ。すでに6以降にいる旧参加者は元の記録を保持するが、新規参加先にはしない。
- 攻撃兵は保存済みの `state.soldiers`、守備兵は各 `region.garrison`。兵士クイズは `role: 'attack'` なら攻撃兵のみ、`role: 'defense', region: 'owari'` なら所有する指定1領地の守備兵のみを増やす。同じクイズカテゴリの別コースで、武将獲得・育成の正解数や経験値と混ぜない。対象はクイズ開始時に固定し、奪われた場合は補充クイズを終了する。正解ごとの報酬と送信レシートは同じトランザクションで確定する。
- 攻撃自体のクールタイムは0。通常の占領に成功した場合だけ、成功時点から次の攻撃まで1時間待ち。占領に至らない攻撃・不正解・撤退・期限切れでは待ち時間は発生しない。通常の開始・再起・占領地は1時間保護。過去の実際の所有を `heldRegions` に記録し、奪還は既存クールタイム・相手の保護を待たず出陣でき、新しい待ち時間も保護も付けない。進軍路・同盟の同士討ち禁止・合戦ロックは共通。
- 新たに所有した土地の守備兵は0。攻撃兵をコピー・消費せず、その土地の守備兵クイズで配置する。全領土を失っても攻撃兵・武将・学習記録は保持。再起は中立地限定、最初の故郷は他勢力の土地も選べるが所有履歴には数えない。
- 70領地同時支配で天下統一。個人・同盟ランキングの勢力は攻撃兵と武将バフから算出し、守備兵の損失では減らさない。
- 移行は `mapVersion: 'kyukoku-v1'` を1回だけ適用。元の県別地図と途中の戦闘を `legacyPrefectureMap` に保存。旧国の代表県の領主を優先し、代表県が中立なら交差県の領主を採用する。旧県の守備兵は同じ領主の対応先に分割し複製しない。対応先を失う分は `migrationGuardReserve` に保存する。攻撃兵・武将・学習・永久報酬・同盟を保持し、進行中の学習クイズは継続、旧県への合戦は安全に中断する。移行前の原データは公開レスポンスへ出さない。
- 同じワールドに戻る際は退役したプレイヤーの学習・兵士・武将を復元する。離脱時は土地を解放する。別ワールドの進行は混ぜない。

この節が、それ以前の47人上限・満員時の追加生成・30分待ち・全自領への自動補充の説明を置き換える。公開検証は70領地・5ワールド・`capacity:null`・1時間と奪還例外・個人/同盟順位のプライバシーを確認し、実プレイヤーや合戦は作らない。

### 同盟本陣・3ワールド統合・守備兵リセット（2026-10-25）

オンライン版は `sengoku-world-v5`、書き込み `rules:5`。常設ワールドを1〜3にする。初回アクセス時の1トランザクションで、元の全ワールドのJSONを `sengoku_world_archives` に退避し、4→1・5→2（それ以降も3ワールドへ順番に）の現役参加者・同盟を統合する。攻撃兵・武将・学習記録・同盟IDを保持し、重複した領地は統合先の領主を優先。移動した参加者の旧領地履歴は奪還に使える。同名同盟には「・旧4」等を付ける。古い合戦ロックは安全に解除し、学習クイズは継続する。重複する退役プレイヤーや旧ワールドの元記録は退避JSONから復元可能。

すべての現役領地（中立を含む）の守備兵を一度だけ0人にし、更新マーカー `three-worlds-defense-zero-20261025` を保存する。攻撃兵は減らさない。以後の補充を再読み込み・再起動で再リセットしない。処理が失敗した場合は、退避・移動・守備兵・所属・ランキング・完了マーカーをまとめてロールバックする。存在しない領主・退役者だけが所有する土地は中立に修復する。

同盟本陣は本陣／作戦／領地／盟員／募集の5タブ。盟主は副盟主・指揮官を各1名まで任命できる。盟主・副盟主は募集と加入申請承認、盟主・副盟主・指揮官は500文字のお知らせと1つの作戦目標を管理できる。人事・名前変更・盟主交代は権限を別途検証。副盟主は役職持ちや盟主を除名できない。

作戦は攻撃／防衛／集合、対象国、100文字メモ、24時間の期限を持つ。更新ごとに新しい作戦IDを発行し、古い準備完了の送信を拒否する。準備完了は本人のみ操作できる。攻撃目標に同盟領地を指定すること、防衛目標に同盟外の土地を指定することはできない。

加入申請は本人が送信し、盟主または副盟主が承認。未所属者は同時に3同盟まで、24時間有効。本人取り消し、管理者却下、期限切れを処理する。承認時に上限5人・現所属・参加待ち時間・両者の合戦／クイズ状態を再確認する。申請文、お知らせ、作戦、操作ログは公開マップに含めない。お知らせ・メモは文字数・禁止語・制御文字を検証し、画面はテキストとして表示する。

同盟領地はUIとサーバー両方で攻撃禁止。加入によって途中の敵対合戦を取り消せず、戦闘結果の確定時にも同盟関係を確認する。個人・同盟ランキングは戦国ページ内で切り替え、同盟領地・作戦の対象から同じページの地図へ移動できる。独立したランキングページは既存リンク用に維持する。

本節が以前の常設5ワールドの説明を置き換える。参考元は公式「三國志 真戦」戦略家幕舎の役職・法令・同盟タグの考え方。画面、軍旗、文章は歴史キッズ用の独自実装で、参考元の画像・音楽・ゲーム素材は使わない。


### 2026-10-26 火力調整・中立化・ワールド切替・クイズホーム

この節が以前の火力・待ち時間・ワールド移動の説明を置き換える。オンライン版は `sengoku-world-v6`、操作は `rules:6` と `activeWorldId`。古い画面や別タブで変更済みのワールドからの書き込みを拒否する。

- 5問連続正解時の損害は武将バフを含む出陣時攻撃力の `ceil(force / 4)`。対象の現在の守備兵だけを減らす。
- 出陣終了時に5分待ち。成功・不正解・占領・奪還・撤退・期限切れで共通。`sengoku_attack_penalties` にアカウント単位で保存し、ワールド切替でも回避できない。不正解は即終了・損害0。学習クイズの不正解には適用しない。保護期間は引き続き1時間、奪還で得た領地に保護は付けない。既存の占領待ちは更新時点から最大5分へ短縮する。
- 一度だけの移行キー `quarter-force-neutral-half-20261025`。全3ワールドの元JSONを `sengoku_world_archives` に退避し、各領主の所有領地の半分（切り上げ）を中立へ戻す。旧国ID順、故郷は最後で安定選択。対象の守備兵・保護・戦闘ロックを解除し、残る領地の守備兵、攻撃兵、武将、学習、同盟、奪還履歴、永久報酬を保持。進行中の合戦は更新中断、対象を失う守備兵クイズは終了し、既得の正解を保持。完了印・順位・全ワールドを一括確定する。
- 地図の `switch` は `worldId` と初参加用 `region` を受け取り、元の領地・同盟を保持して世界ごとの本人プロフィールを切り替える。初参加なら攻撃兵0人から開始。兵士等を世界間で複製・移送しない。クイズ中・被攻撃中は切替不可。他ワールドにいても領地は攻撃される。
- `sengoku_world_members` は操作中のワールド、各プロフィールはワールドJSON、`sengoku_world_force_scores` は `(owner,worldId)` 主キーの順位を保存。個人・同盟順位は非操作中の世界も更新する。旧単一owner順位表は復旧用に残す。操作の再送は既存の一括保存・操作ID判定を通す。
- 「出陣・クイズ」のナビゲーションは毎回4目的のホームへ戻す。途中クイズは削除せず明示的な再開ボタンを表示。出陣準備は地図から選ぶ場合のみ開く。ゲーム一覧の個人・同盟順位カードは削除し、戦国ページ内の順位切替を維持する。
- テストでは移行一回限り、全体ロールバック、再送、兵士非複製、待ち時間の迂回禁止、ホームからの再開を検証。公開検証は設定と移行完了を読み、実アカウント・合戦・同盟を作らない。


### 2026-10-26 攻撃ダメージを10分の1へ変更

現行の合戦ダメージは `ceil(frozen attack force / 10)`。5問連続正解時に、武将バフを含む出陣時攻撃兵力の10分の1（端数切り上げ）だけ、対象の現在の守備兵を減らす。公開設定は `combat: five-correct-tenth-force` と `damageDivisor: 10`。画面の予測・進行中のクイズ・結果判定は同じ共有計算を使う。5分待ち・保護期間・ワールド・領有権・軍勢・同盟のルールは維持し、完了済みの中立化の移行キーを変えない。

## World atlas expansion (2026-10-28)

The shared geography now contains 110 game areas: the same 70 Japanese province IDs and 40 overseas areas based on the owner-supplied eighteenth-century reference. This is a fictional composite, not a single historical date or a claim about real sovereignty. Sea links are explicit game routes. Starting homes remain Japanese; overseas areas can be conquered or used for neutral-only recovery. Three worlds remain unlimited. Damage and all cooldowns are unchanged.

`global-map-neutral-20261028` archives each raw world before appending missing overseas areas with owner null, garrison zero and no protection. All three world updates, ranking sync and the completion marker commit atomically. Japanese ownership, garrisons, learning quizzes, ongoing battles, armies, generals, alliances and account entitlements are preserved. Existing territory/defense reset keys are not changed or repeated. Subsequent requests never reset conquered overseas lands. A completed Japanese campaign retains its castle reward at 70 Japanese lands; victory in the expanded world requires all 110 areas.

World polling now has a single in-flight read: a slow response cannot be superseded forever by the five-second timer. World-list refresh is at most once every 30 seconds, including the lobby. List failures retain the verified campaign connection; world failures back off (30 seconds for throttling), while explicit refresh can retry immediately. Mutating actions retain the original journal and idempotency rules.

Map uploads are optional device-local backgrounds, stored per world in a separate IndexedDB database `hk_sengoku_map_images_v1`. They are never sent to the game server or account sync. Only PNG/JPEG/WebP up to 8 MiB, 24 MP and 8192 pixels per side are accepted; decoding and canvas re-encoding remove embedded metadata. SVG/HTML are rejected. Image opacity, position, scale, restoration and removal affect only presentation; territory boundaries and authority remain server-controlled. Storage denial shows an explicit temporary-session message. Verify with `tests/sengoku-global.cjs` and `tests/sengoku-global-ui.cjs`.

## Composite power, regional boards, multiple generals and emoji-only chat (2026-10-29)

`GET /wealth/sengoku/world/ranking` now returns `sengoku-force-v2` with a server-calculated `score` (0–10,000), six public `breakdown` components and the original offensive `force`. Territory contributes 6,000 points, offensive force 1,000, the sum of separately saved provincial garrisons 1,000, all owned generals' levels 1,000, distinct correctly answered questions 700 (5 per type, capped at 140), and unique conquered lands 300. Army components use logarithmic scaling with the legal army maximum so raw troop inflation cannot dominate all other progress. Repeated answers to the same question and recaptures of the same land do not farm learning or conquest points. Scores have no dependency on casino money or rebirths. Equal scores share a rank; achievement time and opaque player ID stabilize their display order. Top 100 and the caller's true rank are calculated from the same complete set of eligible, unmoderated records.

`?region=ID` selects `japan`, `east_asia`, `southeast_asia`, `central_south_asia`, `europe`, `middle_east_africa`, `north_america`, `south_america` or `oceania` (default `all`). These are fictional game groupings that partition all 110 areas. Regional boards require at least one local land, use only local territory, garrisons and unique conquests, and retain the faction's common offense, generals and learning. `?world=1` can be combined with any region. Private account hashes, pending questions, learned-card IDs and full regional snapshots never appear in the response. Alliance rankings continue to compare summed offensive force, explicitly labeled separately from individual composite points.

`formation` on the existing authenticated, revision-checked world action route accepts a unique array `generalIds` of owned generals (zero to all nine). Their attack, recruitment and XP buffs add together. `commander` selects only the individual training target once an explicit formation exists. Claiming another general deploys them alongside existing generals. Quiz XP still goes only to the selected training target. Pending quizzes and incoming wars lock formation changes; a battle retains its initial attack snapshot. The additive `multi-general-ranking-20261029-v1` migration preserves the previous active general as the initial formation, every general's XP, both army types, map progress and interrupted questions. Existing force indexes remain for alliance compatibility; composite profiles use a separate table and are updated atomically with world mutations and receipts.

`GET /wealth/sengoku/chat` is a read-only global feed shared by all three worlds. `POST /wealth/sengoku/chat/send` requires a registered account session and exactly `requestId` plus `emojis` (the internal owner is supplied by authenticated routing). The UI has no text entry field. Shared rules accept only 1–8 exact sequences from a fixed 56-emoji palette. Letters, digits, links, whitespace, hidden controls, unlisted variants, mixed arrays and unexpected fields are rejected server-side. Names and world badges are public metadata; message bodies contain emoji only and render via `textContent`.

Chat messages, request receipts and per-account posting limits commit in one storage transaction. A retry with the original request ID returns the original result even during cooldown; changing its payload is rejected. The per-account limit is one post per five seconds and at most ten in a minute, persisted across restarts and world switches. The feed returns the latest 60 eligible messages, stores at most 200 messages from the last seven days and retains retry receipts for seven days. Banned accounts and blocked names cannot post and their messages are hidden. Anonymous visitors can read but cannot post. Account changes invalidate delayed responses and clear drafts. Runtime deployment checks only read public rankings/chat and never create a player, battle or chat message.
