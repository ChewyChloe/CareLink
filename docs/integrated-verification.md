# 正式整合與隔離測試

此版本以 GitHub master fb40c2af735082c277e18cd712dacb123573f134 為基準，包含 Core-Flow Hardening 全部新增及修改檔案。原 CareLink_v1 比 GitHub 基準舊；整合時一併恢復 GitHub 已有的依賴、schema 與四個 migration，未增加產品功能。

CareLink_v1 現在有自己的 .git，origin 為 ChewyChloe/CareLink。上層「比賽」原有 Git 歷史保留；請在 CareLink_v1 執行 Git 命令。

## 獨立測試資料庫

測試 branch：competition-hardening-tests-20261008，branch id br-lively-firefly-b3bqb1p8；資料庫 carelink_hardening_test。它是新建空白 DB，沒有從應用 DB 複製業務資料。四個既有 migration 已部署於測試 DB。

複製 backend/.env.test.example 到 backend/.env.test.local，填入測試 DB 的 pooled/direct connection string。此檔被 Git 忽略，禁止提交真實密碼。原 backend/.env 保留應用 DB 設定。

runner 拒絕資料庫名稱不等於 carelink_hardening_test、direct DB 不一致、或測試與應用 DB 的 host/name 相同。它覆寫 LINE 設定為合成測試值，避免測試拿正式 LINE token；保留真實 Gemini benchmark 所需 key。Gemini key 缺失或 quota 錯誤不計為通過。

在 backend 執行：

```powershell
npm run test:db:migrate
npm run test:db:status
npm test -- --json --outputFile=full-jest-results.json
$env:RUN_SCOPED_LIVE_CORE='true'
npm test -- --testRegex='scoped-live-core.integration.ts$'
npm run build
```

在 frontend 執行 npm test 與 npm run build。

本機 Gemini 設定由無效顯示名稱修正為 API 可用的 gemini-3.5-flash-lite；模型 API 回覆 gemini-2.5-flash-lite 已對新使用者停用。既有 JSON Schema 的必填欄位已與 Zod 對齊；沒有放寬解析器或降低測試門檻。測試結束呼叫 PrismaService.onModuleDestroy，關閉 Neon pool。

LINE／LIFF 手機雙角色流程仍需要部署與 Console 設定後實測。後端測試與 Gemini 合成 benchmark 通過不能代替手機 E2E，也不能推論真實使用成效。
