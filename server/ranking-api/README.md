# 早押しランキングAPI

`historykids-ranking-api` は早押し専用のCloudflare Workerです。SQLite-backed Durable Objectで順位・確認済み自己ベストを永続保存します。偉人AIのWorkerとは独立して動作します。

GitHub Actionsの **Deploy ranking API** が既存の `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を使って公開し、公開HTTPSの順位読み込みを確認してから `assets/ui/ranking-config.js` を更新します。ブラウザ用の設定は公開URLだけです。

## スコア

10問の正解数を `correct`、回答時間の合計ミリ秒を `answerMs` とすると、

`score = Math.round(correct / 10 * (8000 + 2000 * 60000 / (60000 + answerMs)))`

最大10,000点。正確さ80％・速さ20％で、速さの点数も正答率に応じて加算します。0問正解なら0点ですが、10問完走した記録は登録できます。スコアの高い順に上位100件を返し、同じ整数スコアは同じ競技順位になります。同点内の表示順は合計回答時間、所有IDの順です。自己ベストも同じスコア比較で更新します。

## API

- `GET /ranking`：スコア順の上位100件、自分の公開記録。
- `POST /ranking/start`：10時代から1問ずつ選び、挑戦IDを発行。`timingVersion:2` で問題ごとの計測を開始します。
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
