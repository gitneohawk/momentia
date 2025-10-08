Momentia 監視＆ログ運用ガイド

本書は Momentia（Next.js + ACA + Postgres + Stripe + ACS）の本番運用で使用する監視・ログ集約・アラートの実務ガイドです。まずは手動運用を行い、後日IaC化を想定しています。

1) ログの基本方針

1.1 出力先
	•	アプリログ: console.info / warn / error → Azure Container Apps → Log Analytics (LA)
	•	カテゴリ: 環境（Managed Environment）の ContainerAppConsoleLogs、ContainerAppSystemLogs を有効化済み
	•	プラットフォームメトリクス: ACA/環境の AllMetrics → LA

1.2 構造化ログのルール
	•	重要なイベントは1行JSON（文字列化）で出力する
	•	必須フィールド（例）
	•	ts（ISO文字列）、level（info|warn|error|fatal）
	•	type（例: mail.send、order.created、stripe.webhook など）
	•	messageId / orderId / sessionId / slug / itemType など検索キー
	•	エラー時は err または error に文字列化して出す
	•	例（Stripe Webhook 成功）

{"ts":"2025-10-06T06:59:17Z","level":"info","type":"stripe.webhook","tag":"[STRIPE_WEBHOOK_OK][MAIL_SENT_USER]","orderId":"cs_123","itemType":"digital","to":"foo@example.com"}

	•	例（Mailer/ACS 送信）

{"ts":"2025-10-06T06:59:23Z","level":"info","type":"mail.send","provider":"acs","to":"info@evoluzio.com","subject":"【注文通知】...","status":"Succeeded","messageId":"5979a9c...","durationMs":6250}

	•	例（Stripe 検証失敗）

{"ts":"2025-10-06T06:59:23Z","level":"error","type":"stripe.webhook","tag":"[ALERT][STRIPE_WEBHOOK_ERROR][CONSTRUCT_EVENT]","error":"Webhook signature verification failed"}

実装メモ: 既存の route.ts ではすでに
[STRIPE_WEBHOOK_RECEIVED] / [STRIPE_WEBHOOK_PROCESSING] / [STRIPE_WEBHOOK_OK] / [ALERT]... のタグを出力済みです。可能であれば console.*(JSON.stringify(obj)) を徹底するとクエリが容易になります。

⸻

2) Log Analytics（KQL）スニペット

ワークスペース: momentia-law

2.1 直近エラー集計（アプリ）

ContainerAppConsoleLogs
| where TimeGenerated > ago(2h)
| where Log has_any ("[ALERT]", "ERROR", "Error", "FATAL")
| summarize count() by bin(TimeGenerated, 10m)
| order by TimeGenerated desc

2.2 Stripe Webhook の成功/失敗

ContainerAppConsoleLogs
| where TimeGenerated > ago(24h)
| where Log has "stripe.webhook"
| extend J = extractjson("$", Log)
| project TimeGenerated,
          level = tostring(J.level),
          tag   = tostring(J.tag),
          type  = tostring(J.type),
          orderId = tostring(J.orderId),
          itemType = tostring(J.itemType),
          error = tostring(J.error)
| summarize total = count(),
            errors = countif(tag has "[ALERT]"),
            mails  = countif(tag has "[MAIL_SENT_")

2.3 メール送信の遅延監視（95パーセンタイル）

ContainerAppConsoleLogs
| where TimeGenerated > ago(24h)
| where Log has "\"type\":\"mail.send\""
| extend J = extractjson("$", Log)
| project ts=TimeGenerated, durationMs = todouble(J.durationMs), to = tostring(J.to), status=tostring(J.status)
| summarize p95=percentile(durationMs, 95), fail=countif(status !~ "Succeeded")

2.4 注文トレーシング（orderId 起点）

let oid = "cs_XXXX"; // 対象の Checkout Session ID
ContainerAppConsoleLogs
| where TimeGenerated > ago(7d)
| where Log has oid
| order by TimeGenerated asc

2.5 ACA メトリクス（スケール/CPU/メモリ）

AzureMetrics
| where ResourceProvider == "MICROSOFT.APP"
| where TimeGenerated > ago(24h)
| where MetricName in ("CpuUsage","MemoryWorkingSetBytes","Requests","RequestsServerErrors")
| summarize avg(Average), max(Maximum) by MetricName, bin(TimeGenerated, 5m)
| order by TimeGenerated desc


⸻

3) 監視・アラート設計

3.1 “今すぐ作れる” 推奨アラート（手動運用）
	1.	Stripe Webhook エラー
	•	クエリ:

ContainerAppConsoleLogs
| where TimeGenerated > ago(5m)
| where Log has "[ALERT][STRIPE_WEBHOOK_ERROR]"

	•	アラート条件: 結果件数が1件以上
	•	通知: メール（運営）、将来的には Teams/Slack へ拡張予定

	2.	メール送信失敗
	•	クエリ:

ContainerAppConsoleLogs
| where TimeGenerated > ago(10m)
| where Log has "\"type\":\"mail.send\"" and Log has "\"status\":\"Failed\""

	•	条件: 件数が1件以上

	3.	HTTP 5xx 増加（Next.js 側で console.error を必ず出す前提）
	•	クエリ（例）:

ContainerAppConsoleLogs
| where TimeGenerated > ago(5m)
| where Log has "[API_ERROR]" or Log has "500"
| summarize count()

	•	条件: 連続3回の評価で件数が5件を超える

	4.	CPU/メモリのしきい値（メトリクス）
	•	ソース: AzureMetrics（ポータルからメトリクスアラート設定）
	•	例: CpuUsage が80%を超えて10分継続、MemoryWorkingSetBytes が80%を超えて10分継続
	5.	ダウンロードリンク 404 多発
	•	実装: /api/download で console.error を構造化JSONで出力
	•	クエリ:

ContainerAppConsoleLogs
| where TimeGenerated > ago(30m)
| where Log has "[DOWNLOAD_ERROR]" and Log has "404"
| summarize count()

しきい値は最初は緩やかに設定し、誤検知がないことを確認しながら段階的に厳しくするのがポイントです。

3.2 ダッシュボード（Log Analytics / Workbook）
	•	タイルに載せると便利なKPI
	•	当日の注文数（digital/panel）
	•	Webhook エラー数
	•	メール送信失敗数
	•	ダウンロード 404 件数
	•	リクエスト数・平均処理時間（任意、計測を組み込んだ場合）
	•	“過去24時間のトレンド”と“直近1時間”の2つの時間幅を設けると運用しやすい

⸻

4) Azure 側の構成メモ（手順の要約）

4.1 診断設定（実施済みの再掲）
	•	環境（Managed Environment）に対して:
	•	ContainerAppConsoleLogs、ContainerAppSystemLogs、AllMetrics を Log Analytics へ送信
	•	コンテナアプリ（momentia）に対して:
	•	AllMetrics を Log Analytics へ送信（現時点では Logs は環境側のみ有効）

4.2 参考コマンド（再利用用）

# 変数
RG=momentia-rg
APP=momentia
APP_ID=$(az containerapp show -g $RG -n $APP --query id -o tsv)
ENV_ID=$(az containerapp show -g $RG -n $APP --query "properties.environmentId" -o tsv)
LAW_ID=$(az monitor log-analytics workspace show -g $RG -n momentia-law --query id -o tsv)

# 診断設定: 環境（ログ + メトリクス）
az monitor diagnostic-settings create \
  --name "dia-env-$(basename $ENV_ID)" \
  --resource "$ENV_ID" \
  --workspace "$LAW_ID" \
  --logs '[
    {"category":"ContainerAppConsoleLogs","enabled":true},
    {"category":"ContainerAppSystemLogs","enabled":true}
  ]' \
  --metrics '[{"category":"AllMetrics","enabled":true}]'

# 診断設定: コンテナアプリ（メトリクス）
az monitor diagnostic-settings create \
  --name "dia-ca-$APP" \
  --resource "$APP_ID" \
  --workspace "$LAW_ID" \
  --metrics '[{"category":"AllMetrics","enabled":true}]'


⸻

5) 運用チェックリスト（初期）
	•	Log Analytics の基本クエリ（本書2章）を Saved Query として保存する
	•	“Stripe 重大系”のアラート2本（検証失敗 / メール失敗）を作成する
	•	“5xx 多発”の簡易アラートを作成し、誤検知がないか1週間観察する
	•	ダッシュボード（Workbook）にKPIを5タイル以上配置する
	•	ログ増加時のコストを週次で監視し、データ保持期間は30～90日で検討する

⸻

6) 追加実装の提案（余裕ができたら）
	•	共通ロガー（薄いラッパー）
	•	log.info(type, fields) / log.error(type, err, fields) のような小さなユーティリティを lib/logger.ts に作成
	•	自動で ts を付与し、JSON文字列化や [ALERT] 付与などを一元管理
	•	ダウンロードAPIの計測
	•	成功/失敗、token の有効/無効、ダウンロードバイト数（必要であれば）
	•	アクセス概要
	•	Application Insights を後日導入してページビューやユーザー行動を分析（広告やSEOチューニングを開始する段階で）

⸻

7) トラブルシュートの型
	•	「購入したのにメールが届かない」
	1.	ContainerAppConsoleLogs で orderId を検索
	2.	[MAIL_SENT_USER] の有無、ACS 側のステータス（status）を確認
	3.	受信側の隔離/迷惑メールフォルダ（M365 側で Quarantine になっていないか）を確認
	•	「ダウンロードできない（404）」
	1.	orderId → downloadToken 発行済みかDBを確認
	2.	/api/download のエラーログ（[DOWNLOAD_ERROR]）を検索
	3.	Tokenの期限・URL書式（?token= で渡されているか）を確認
	•	「Webhook が届かない/失敗する」
	1.	Stripeダッシュボードのイベントリトライ履歴を確認
	2.	[STRIPE_WEBHOOK_RECEIVED] ログの有無を確認
	3.	署名検証失敗（[CONSTRUCT_EVENT]）やDB保存失敗（[DB_SAVE_FAILED]）の有無を確認

⸻

8) コスト＆保持ポリシーの目安
	•	保持期間: 初期は30日、その後需要に応じて60～90日に延長
	•	コスト削減策:
	•	開発・検証環境ではINFOログを最小限に（本番タグのみに限定）
	•	重いスタックトレースは1行に圧縮（error.message と発生箇所のみ）
	•	不要になったログカテゴリの診断設定は解除する
