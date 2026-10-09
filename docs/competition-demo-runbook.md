# Competition demo runbook

基準：fb40c2af735082c277e18cd712dacb123573f134。以下為操作程序，部署及真機結果尚未驗證。

## 環境與身分

| 項目 | 必要設定／核對 |
| --- | --- |
| Guardian test identity | 專用 LINE 測試帳號 G；不使用真實家長個資。由正常登入及建立孩子流程取得 GUARDIAN grant |
| Caregiver test identity | 另一個專用 LINE 測試帳號 C；透過邀請接受與家長啟用取得權限 |
| Synthetic child | 「競賽合成寶寶 A」「競賽合成寶寶 B」，不得使用真實兒童姓名與照護資料 |
| LINE OA entry | 待填：對應 Messaging API channel 的官方帳號連結；確認 C 與 G 加為好友 |
| LIFF URL | 公開 LIFF ID：2011632269-xjYdlBwl；https://liff.line.me/2011632269-xjYdlBwl 。Console endpoint 是否對應本版部署：NOT VERIFIED |
| Webhook | https://<permanent-backend-host>/api/webhooks/line，或 /webhooks/line；不是 /api/line/webhook |
| Health | https://<permanent-backend-host>/api/health；應回覆 DB connected。此工作副本尚未接資料庫 |

不要把 secret、LINE access token、資料庫密碼放入本文件或聊天。Debug secret 僅放伺服器環境變數。

## Deployment readiness checklist

- [ ] 前後端部署至穩定 HTTPS 網域，使用同源 `/api` reverse proxy，不是 localhost 或臨時 trycloudflare。
- [ ] `NODE_ENV=production`；`FRONTEND_ORIGIN` 填永久前端 HTTPS origin，`FRONTEND_URL` 與 LIFF endpoint 一致。
- [ ] LINE Developers：LIFF endpoint 填實際前端部署 URL；確認 LIFF 所屬 Login channel/provider 與伺服器驗證 ID token 的 channel/provider 一致。
- [ ] Login channel 設定的 callback 與 SDK 實際 redirect 一致；測試 query 的 invitation token 經登入仍能恢復。不要把 localhost callback 用於正式展示。
- [ ] Messaging API webhook 填上述 URL；啟用 webhook，Console Verify 通過；channel secret 僅由後端使用 HMAC 驗證。
- [ ] 同源 HTTPS cookie：HttpOnly、Secure、SameSite=Lax；前端 fetch 使用 credentials。跨站架構不能假設 Lax cookie 會被送出，先採同源 proxy。
- [ ] Proxy 保留原始 webhook body、Content-Type、Origin、X-Line-Signature、Set-Cookie，正確傳遞可信的 forwarded headers；避免重複 `/api/api`。
- [ ] Prisma migration status 在專用測試 DB 通過；不要直接在有真實資料的 DB 執行 regression cleanup。
- [ ] `ENABLE_AI_DEBUG_ENDPOINT=false`。Production 即使設定 true 也拒絕 debug extraction；development 需明確 true + 至少 32 字元 `AI_DEBUG_SECRET`，10 次/分鐘/程序，輸入最多 2000 字元。多實例需外部配額限制。
- [ ] 設定正式 Gemini key 只代表已設定；需另外執行 live evaluation，保存結果後才能聲稱真實模型可用。
- [ ] 邀請、access grant、LINE 通知與 job worker 錯誤監控已檢查。

## Golden path

1. G 正常 LINE 登入，建立合成孩子 A/B；不進 `/dev`，不靠自動 seed 授權。
2. G 開啟「照護邀請」，選 B、建立邀請，複製唯一連結給指定 C。
3. C 以不同瀏覽器／LINE session 開啟連結並登入，確認孩子 alias 與 target role；接受後應顯示等待啟用，不能讀取 B。
4. G 重新整理邀請列表，與 C 核對接受帳號核對碼，啟用。C 重新登入／刷新，應能看到 B。重複接受／啟用應拒絕。
5. C 手動記錄 B 的 150 ml FEED、13:10 SLEEP_START、14:35 SLEEP_END、36.5°C TEMPERATURE；確認 API response 成功，再重新整理。
6. G 在另一個 session 查看 B 同一天；時間軸與摘要一致。空日不出現健康、完食、規律等判斷。
7. LINE 訊息只能產生草稿；確認成功前不得視為已記錄。換尿布／體溫等未支援 AI 的內容應明確顯示改用手動記錄，不能自動當成健康建議。
8. `/handoff?child_id=B`：建立、確認、準備及接收皆核對 B 的 alias。刷新後維持 server 狀態，再切 A 確认沒有 B 的任務。
9. 帳單查看計算與 evidence chain，契約查看版本與 hash。沒有電子簽署或已保存確認按鈕。
10. G 在 Timeline 保存一般留言或接送叮嚀，C 重新整理讀取同一筆作者、孩子、時間與內容；失敗保留原文。「已保存」不表示 LINE 已送達或保母已閱讀。合成 preview 停用保存。
11. 對專用測試環境模擬 401/500；應顯示登入或載入錯誤，不顯示備品充足、沒有待辦等正常狀態。

## Fallback video

在上述真實雙角色流程通過後才錄影。錄製 G/C 的獨立 session、操作、refresh、時間軸與 DB 只讀核對，遮蔽身分與 token。保留錄製日期、commit、環境與模型來源。若使用 preview，畫面全程標示「DEMO / 合成資料」，不得說明為真實使用成效。现场网络失败时播放既有验证影片；尚未验证的步骤不得补拍成成功。
