# Firestore 管理與全模組 CRUD 設計

## 目標

讓已登入的應用程式管理員 `mihsia@gmail.com` 可在所有左側選單模組新增、編輯、停用、復原資料，並將所有共用業務資料存在 Firebase，不使用 browser localStorage/sessionStorage 作為權威資料來源。

## Firebase 架構

- Firebase 專案：`ltps-finance-budget`（Project number `290257882977`）。
- Cloud Firestore Enterprise Native Mode 具名資料庫：`ltps-finance-data`。
- 區域：`asia-east1`。
- Firebase Authentication：Email/Password 與 Google provider。
- Firebase Storage：預算書 PDF 與匯出檔案；Firestore 只存檔案元資料。
- Firebase Hosting：現有 SPA 部署。

## 資料模型

- `/users/{uid}`：`name`, `email`, `dept`, `role`, `status`, `modules`, timestamps。
- `/years/{year}`：`locked`, `deadlines`, timestamps。
- `/years/{year}/modules/{moduleKey}`：固定欄位模組（basic, library, budgetbook）與模組摘要。
- `/years/{year}/modules/{moduleKey}/records/{recordId}`：多筆資料模組（budget, language, awards, club, land, inquiry）。
- `/years/{year}/auditLogs/{logId}`：不可變更的稽核記錄，包含 actor、moduleKey、recordId、action、before、after、createdAt。
- `/years/{year}/files/{fileId}`：Storage path、原始檔名、contentType、size、uploader 與 timestamps。

## 權限與狀態

- `role: admin` 且 `status: active` 才有全模組管理權。
- `role: editor` 且 `status: active` 只可寫入 `modules` 清單內的模組。
- 缺少使用者文件、狀態非 active、資料讀取中、監聽錯誤、年度缺少或已鎖定時全部 fail closed。
- IAM/Firebase Console Owner 不等於應用程式管理員；必須建立 `/users/{uid}` 應用程式權限文件。
- 帳號不硬刪除，只切換 active/disabled。

## 寫入與稽核

- 資料寫入與 audit log 使用同一 Firestore batch，共用同一 server timestamp。
- 更新、停用、復原前從 server 重讀現值，避免使用過期畫面資料當稽核 before。
- 資料列刪除為軟刪除：`deletedAt`, `deletedBy`；復原時清除刪除狀態並留稽核。
- 即時監聽回呼必須與年度/模組 scope 綁定，舊 scope 回呼不得覆寫新 scope。

## 初始資料與部署

- 以可重複執行的遷移腳本建立 113–115 年度、現有範例資料與 `mihsia@gmail.com` admin 文件。
- 真實 115 年預算金額保留；其他示意資料標記為待校方確認。
- 在規則、索引、遷移與所有測試通過後才佈建具名資料庫並部署。
- 若專案尚未開啟 Blaze/所需 billing，停止並請使用者決定，不自行開啟付費。

