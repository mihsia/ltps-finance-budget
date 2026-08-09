# Firestore 管理與全模組 CRUD 實作計畫

> 規格：`docs/superpowers/specs/2026-08-06-firestore-admin-crud-design.md`

## Global Constraints

- 使用 Firestore Enterprise Native Mode 具名 DB `ltps-finance-data`，region `asia-east1`。
- 所有權威業務資料在 Firebase，不得用 localStorage/sessionStorage 持久化。
- 只有 active admin 或 active module editor 可寫入；年度鎖定、尚未載入、缺少文件或監聽錯誤都 fail closed。
- 固定欄位使用 module doc；多筆模組使用 records subcollection。
- 所有資料異動與 immutable audit log 原子寫入；記錄只軟刪除與復原。
- PDF 存 Storage、元資料存 Firestore。帳號只停用/重啟，不硬刪除。
- 每個任務使用 TDD，完成後需有 task review；所有任務完成後做 whole-branch review。
- 任務 9 之前不部署 Firestore/Storage/Functions；若 billing 不足不自行開啟。

## Task 1: Named Firestore Initialization

- 先為 Firebase 設定與 named database 行為寫測試。
- 中央定義 `FIRESTORE_DATABASE_ID = 'ltps-finance-data'`，web SDK 與 Admin SDK 均指定資料庫。
- `firebase.json` 的 rules/indexes 部署目標明確指向具名 DB。
- 執行 focused tests、full tests、build。

## Task 2: Explicit User Access State

- 先寫 AuthContext/access policy 測試，包含 profile 缺少、disabled、listener error、角色/模組權限與即時撤銷。
- 監聽 `/users/{uid}`，只有 `status: active` 通過。
- 提供呼叫當下會重新驗證的 imperative authorization source，過期回呼必須 fail closed。
- 所有現有寫入入口在呼叫時重新檢查權限。

## Task 3: Atomic Module and Record Repository

- 先寫 repository/hook 測試：create/update/delete/restore、server re-read、scope switch、stale callbacks、listener errors。
- 建立原子 module/audit 寫入與 records CRUD repository。
- `useYearRecords` 即時查詢排除軟刪除資料，可選顯示已刪除資料以供復原。
- 所有回呼與 year/module scope 綁定。

## Task 4: Fixed-Field Module Editing

- 先寫 Basic、Library、BudgetBook 測試：載入/錯誤 fail closed、檢核、deadline（含 0099）、pending freeze、年度切換、資料來源版本、audit before/after。
- Basic/Library/BudgetBook 完成 Firestore 新增/更新表單與中文狀態。
- Basic 顯示 module-filtered audit history，明確顯示載入與錯誤。
- BudgetBook PDF 在此任務仍為唯讀，不提前實作上傳。

## Task 5: Record CRUD for Budget, Language, Generic

- 先寫 Budget、Language、Generic 頁面與 repository integration 測試。
- Budget 實作歲入/歲出記錄新增、編輯、軟刪除、復原與金額檢核。
- Language 實作開班、教師/學生統計與認證名冊 CRUD。
- Awards/Club/Land/Inquiry 使用 schema-driven Generic CRUD，各欄位保留原設計語意與檢核。
- 所有操作使用 Task 3 repository、pending freeze、呼叫時權限/年度檢查。

## Task 6: PDF Storage and Account Administration

- 先寫 Storage 上傳/元資料、Settings 帳號表單、停用/重啟與權限檢查測試。
- BudgetBook 支援 PDF 上傳、替換、下載，元資料與 audit 寫 Firestore。
- Settings 實作帳號新增、編輯、角色/模組設定、disabled/active；不硬刪除。
- 帳號建立如需 Admin SDK，使用 callable Function 並在 server 重新驗證 admin。

## Task 7: Firestore/Storage Rules

- 先以 Emulator Rules tests 寫 allow/deny matrix。
- Firestore rules 檢查 active status、admin/editor module scope、year lock、允許欄位/類型、soft delete，audit create-only 與 user status 流程。
- Storage rules 檢查身分、模組權限、年度鎖定、PDF content type/size/path。
- 新增 auditLogs moduleKey + createdAt 查詢的 composite index。
- 修正 ESLint flat config，執行 rules tests、lint、full tests、build。

## Task 8: Idempotent Initial Data Migration

- 先寫 migration dry-run/idempotency/shape tests。
- 將 113–115 module doc 中的 arrays 轉成 records subcollections，保留已驗證預算數字與現有範例。
- 以 Auth email 解析 `mihsia@gmail.com` UID，建立 active admin profile。
- 腳本支援 dry-run、重複執行無重複資料，不覆蓋已由使用者更新的資料。

## Task 9: Provision, Deploy, Verify

- 所有測試、lint、build 通過後，確認 Firebase CLI 專案、登入帳號與 billing 狀態。
- 若 billing/服務尚不具備，停止並請使用者處理，不自行啟用付費。
- 建立 Firestore Enterprise Native Mode DB `ltps-finance-data` in `asia-east1`，啟用 Google provider，部署 indexes/rules/storage/functions/hosting。
- 執行 migration，確認 admin profile、113–115 data、CRUD、soft-delete/restore、PDF、帳號停用與權限撤銷。
- 在實際 Hosting URL 做登入與主要流程 smoke test，再推送 GitHub 並回報部署結果。

