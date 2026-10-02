# 偉人AIのAPI

GitHub Pagesは静的配信のため、AIはこのCloudflare Workerで生成します。モデルはQwen3 30B A3B。ブラウザにAPIキーを置かず、Workers AI bindingで呼び出します。会話の永続保存とログ出力は行いません。AIサービス側のデータ取扱いはCloudflareの規定が適用されます。

## 現在の状態

サーバーコードとサイト側の自動接続を実装済みです。Cloudflareアカウントへの認証がこの実行環境にないため、サーバーは未デプロイです。`assets/ui/ai-config.js` の endpoint が空の間、画面は「接続準備中」と表示し、AIが回答したように装いません。旧端末内モデルは起動しません。

## 接続する

1. CloudflareでWorkers AIを利用できるアカウントを用意します。利用上限・請求設定はアカウント側で確認してください。
2. GitHubリポジトリのActions secretsに `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を設定します。トークンはこのWorkerのデプロイに必要な権限だけに制限してください。チャットやソースコードにトークンを書かないでください。
3. Actionsの **Deploy historical AI API** を手動実行します。Workerの公開、ヘルス確認、サイトの接続先更新を行います。
4. GitHub Pagesの更新完了後、偉人AIを再読み込みします。自動接続し、起動ボタンやモデルダウンロードなしで質問できます。

または、認証した手元のWranglerから `npx wrangler deploy --config server/figure-api/wrangler.toml` を実行し、出力された公開URLの `/chat` を `assets/ui/ai-config.js` に設定します。既存APIを利用するなら同じJSON契約とCORSを実装してください。

## API契約

- `GET /health` → `{ "ready": true }`。AI・rate-limit bindings未設定ならfalse。
- `POST /chat` → `{ "person": "nobunaga", "messages": [{"role":"user","content":"楽市楽座を教えて"}] }`
- 応答 → `{ "answer": "...", "sources": [{"url":"https://..."}] }`
- 人物IDは `taishi`, `murasaki`, `yoritomo`, `nobunaga`, `ieyasu`, `ino`。
- 直近8メッセージ、質問500字、回答4000字まで。systemメッセージ・人物情報はサーバー側で決めます。
- CORSは `https://historykids.github.io` のみ。1接続IPあたり30回/分、サイト全体120回/分。学校等の共有IPでは同じ枠になります。
- メッセージが多すぎる・不正な形式・制限超過・AIエラーは明示的に返し、無制限に再試行しません。

公式資料：
https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/
https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
