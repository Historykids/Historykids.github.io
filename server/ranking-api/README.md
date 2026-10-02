# 早押しランキングAPI

`historykids-ranking-api` は早押し専用のCloudflare Workerです。SQLite-backed Durable Objectで順位・確認済み自己ベストを永続保存します。偉人AIのWorkerとは独立して動作します。

GitHub Actionsの **Deploy ranking API** が既存の `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を使って公開し、公開HTTPSの順位読み込みを確認してから `assets/ui/ranking-config.js` を更新します。ブラウザ用の設定は公開URLだけです。

- `GET /ranking`：タイム順の上位100件、自分の公開記録。
- `POST /ranking/start`：10時代から1問ずつ選び、挑戦IDを発行。
- `POST /ranking/finish`：その挑戦の10問の回答を検証。全問正解でなくても登録でき、サーバーが正解数と誤答1問につき5秒のペナルティを計算してタイムを決め、速い自己ベストの登録用proofを返す。通信失敗後の同じ挑戦の再送ではタイムを変えない。
- `POST /ranking/register`：確認済みproofとニックネームを受け取り、速い自己ベストを公開。登録済みの速いタイムと日時を保ち、本人の確認済みproofでニックネームを更新できる。

ブラウザの所有証明は暗号学的乱数32バイトで生成し、localStorageに保存します。Authorizationヘッダーだけで送信し、URLに含めません。サーバーはSHA-256を保存IDに使い、所有証明やproofは公開一覧に返しません。ブラウザの保存データを消すと、その記録を更新する所有証明も失われます。

Originは `https://historykids.github.io` のみ。IPあたり読み込み60回/分、変更60回/分、サイト全体600回/分に制限します。空白名、期限切れの挑戦、欠けた・形式不正の回答、別のブラウザのproof、クライアントが指定するタイムは受け付けません。SQLはパラメーターを使用します。ニックネームの表示はtextContentで行います。

確認済みの最速receiptは挑戦とは別に保存され、結果画面を閉じても後から登録できます。古い端末内ベストと旧Firebaseのデータは削除しません。ランキング登録には、新しいオンライン決戦で確認した記録を使います。接続できないときも端末内で早押しを遊べます。

サーバーが選んだ問題IDと正解データは `../figure-api/ranking-questions.mjs` です。クイズを増やした際はこのデータも更新してください。`node tests/ranking-api.cjs` は実際のSQLiteで、所有権・正解検証・保存・再試行・自己ベスト更新を確認します。

公式仕様： https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
