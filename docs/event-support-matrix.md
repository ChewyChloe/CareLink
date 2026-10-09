# Care event model audit

AI 支援表示結構化候選，仍須人工確認才能成為 CareEvent；不表示 live Gemini 已驗證。

| Event | AI extraction / draft confirmation | Manual | Timeline |
| --- | --- | --- | --- |
| FEED | 支援；禁止用藥轉成 FEED，不猜單位 | 支援 | 支援 |
| SLEEP_START / SLEEP_END | 支援 | 支援 | 支援 |
| CHECK_IN / CHECK_OUT / PLANNED_PICKUP | 支援 | 支援 | 支援 |
| MEAL | 支援 | 支援 | 支援 |
| NIGHT_STAY | 既有 AI schema 支援 | 無獨立入口 | 基礎顯示 |
| DIAPER | requires_manual_entry | 支援 | 支援 |
| TEMPERATURE | requires_manual_entry，不作診斷 | 支援 | 支援 |
| BOWEL_MOVEMENT / HYGIENE / ACTIVITY / GROWTH / NOTE | requires_manual_entry；Gemini prompt 要求列出未支援內容，provider output 可攜帶 unsupported | 支援 | 支援 |
| MEDICATION | requires_manual_entry，不擴充 AI 用藥建議 | 既有委託授權流程 | 支援 |

DIAPER / TEMPERATURE 本輪選擇明確轉手動，避免加入新的 AI 功能。Service 對高頻未支援類別另加保守檢查；未識別且沒有候選的訊息要求手動。Mixed message 的完整語意覆蓋仍需 live model 測試，不能宣稱零漏判。LINE Flex 缺少必填或未支援項目不提供確認 CTA，提供既有手動入口；完整草稿提供確認及查看已保存紀錄入口。避免連到不存在的 `/drafts/:id` 編輯頁。
