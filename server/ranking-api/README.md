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


## 47-player Sengoku worlds: simple rules (v2)

The shared map and its 47-person capacity remain unchanged. The online economy has one troop type, `soldiers`, and no spendable merit/food, four troop types, recruitment purchases, fort upgrades or tactical formation input. New participants start at zero soldiers and zero generals. Existing solo endpoints and the solo page keep their original rules.

`GET /wealth/sengoku/worlds` lists public world summaries. `GET /wealth/sengoku/world?world=ID` reads a shared world; omitting the ID resumes the caller's membership. Responses use `sengoku-world-v2`. `POST /wealth/sengoku/world/action` requires the existing account session, `rules:2`, a durable request ID and the player's current revision. Actions: join, train, begin, answer, next, retreat, claim, commander, respawn, leave. Begin only accepts target and region revision: the entire army and selected general are snapshotted automatically.

Every server-verified correct answer immediately and transactionally awards 20 soldiers (plus the selected general's recruitment buff), increments the cumulative correct count, records the history card, and gives the selected general one experience. Incorrect answers award nothing. Retreat, expiry and closing the page keep awarded progress. Duplicate answers and retries cannot award twice; failed receipt/ranking writes roll back together. Castle conquest, respawn, general selection/acquisition and level changes never generate soldiers. Soldier count is exact and capped at 1e12; all power multiplication uses integer BigInt intermediates.

Every 50 cumulative correct answers grants one general acquisition. `claim` chooses an unowned general; it does not spend soldiers or erase the correct count. After all nine generals have been acquired, reacquisition raises the chosen general one level (maximum 100). One general is selected for battle and learning. Level 1 needs 10 correct answers to reach level 2, level 2 needs 20, etc. Levels increase automatically and strengthen the general's attack/defense/quiz/recruitment buffs. No new general is automatically granted by territory capture.

Attack power equals soldiers times the selected attack buff. A battle's five correct answers add 10% power each, plus any quiz buff. Defense equals all soldiers times the defense buff, with no manual configuration. Army and buffs are fixed at declaration, while correctly answered questions can still grow the player's next army/general. Ties favor defense. Existing spawn/respawn protection, sea routes, five-minute deadlines, mutually exclusive siege locks, retirement confirmation and permanent nationwide castle rewards remain intact.

`GET /wealth/sengoku/world/ranking` returns `sengoku-force-v1`. An optional `?world=ID` scopes it to a world. Server-owned ranking rows update with real actions. Force descends first, then territory count and victories; identical values share a rank, ordered deterministically by achievement time. Only the top 100 and the authenticated caller's actual rank are returned. Public IDs are random world player IDs, not account hashes; no session, private quiz or pending answer data is exposed. Banned accounts and blocked names are filtered. Leaving removes that world's current record. The standalone `sengoku-ranking.html` and in-game board share the same renderer, large bold force values, own summary, scope controls and name search.

Existing worlds are upgraded in bounded batches and on access. Old troop counts are added together; owned territories, generals/levels, learned cards and cumulative correct answers are preserved. Correct answers in an unfinished old quiz are credited exactly once, and old battle locks are released without moving territory. Old economic values are retained privately in `legacyEconomy` for recovery. A per-world rules-version marker makes migration idempotent, and ranking backfill occurs in the same transaction. No old client action can bypass the v2 protocol check.

Worlds remain independent: one active membership per account, 47 unique participant slots, automatic overflow allocation without confiscating an occupied birthplace. A fresh world starts army/generals/correct counts from zero, while historical cards and permanent town rewards remain. Browser action journals retry the same request ID, ignore old cached protocols, discard responses after account switches, and use verified server state after reconnecting. Deployment verification reads protocols and ranking schemas only; it never creates a production participant or quiz.
