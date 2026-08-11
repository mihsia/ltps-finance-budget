# 利澤國小基金預算管理系統

宜蘭縣五結鄉利澤國民小學基金預算管理系統：依年度維護學校資料、產出議會報表（網頁／PDF／Excel），並提供跨年度儀表板。

## 技術架構

- 前端：React + Vite
- 後端：Firebase Authentication（帳密登入）、Firestore（依年度分集合）、Storage（歷史檔案）、Cloud Functions（帳號建立）
- 部署：Firebase Hosting，GitHub Actions 於推送至 `main` 時自動 build + deploy

## 本機開發

```bash
npm install
cp .env.example .env   # 填入 Firebase 專案設定（見下）
npm run dev
```

### 建立並連接 Firebase 專案

1. 於 [Firebase Console](https://console.firebase.google.com/) 建立新專案。
2. 啟用 **Authentication**（Email/Password 提供者）、**Firestore**、**Storage**、**Cloud Functions**（需升級為 Blaze 方案）。
3. 在「專案設定 > 一般 > 你的應用程式」新增一個 Web 應用程式，複製設定值填入 `.env`。
4. 安裝並登入 Firebase CLI：`npm i -g firebase-tools && firebase login`。
5. `firebase use --add` 選擇剛建立的專案（會寫入 `.firebaserc`，或手動編輯取代 `REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID`）。
6. 部署前先跑一次規則測試（需本機安裝 Java，供 Firestore emulator 使用）：
   ```bash
   npm run test:rules
   ```
7. 部署安全規則、索引與 Functions：
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes,storage:rules,functions
   ```
8. 初始化第一批資料（113–115 年度真實預算數字＋範例資料）與管理者帳號。先用 `--dry-run` 確認會建立哪些文件（不會實際寫入，且可重複執行不會產生重複資料或覆蓋既有資料）：
   ```bash
   cd scripts
   # 從 Firebase Console > 專案設定 > 服務帳戶 下載金鑰，存為 scripts/serviceAccountKey.json
   cd ..
   npm run seed:dry-run
   SEED_ADMIN_EMAIL=you@school.edu.tw npm run seed
   ```
   `seed` 腳本會印出一個密碼設定連結，交給管理者本人設定密碼後即可登入。

### GitHub Actions 自動部署

於 repo 的 Settings > Secrets 新增：`VITE_FIREBASE_*`（同 `.env`）、`FIREBASE_PROJECT_ID`、`FIREBASE_SERVICE_ACCOUNT`（服務帳戶 JSON 全文）。push 到 `main` 即會自動 build 並部署到 Firebase Hosting。

## 資料模型（Firestore，具名資料庫 `ltps-finance-data`）

```
/years/{year}                                    -- "113" | "114" | "115" ...；locked、deadlines
/years/{year}/modules/basic                      -- 班級數／學生人數／教師人力／學雜費（各年級平均）／
                                                     午餐補助（全年度），含 status: draft|submitted
/years/{year}/modules/library                    -- generalBooks、indigenousBooks
/years/{year}/modules/budgetbook                 -- fundName、reviewAuthority、pdfUrl（PDF 存 Storage，見下）
/years/{year}/modules/{key}/records/{recordId}   -- 多筆資料：budget（expense|revenue，各含 amount 預算
                                                     金額、actualAmount 決算金額、varianceNote 差異原因，
                                                     後兩者選填）、language（class|certification|roster）、
                                                     specialNeeds（特殊生統計：category|count|note）、
                                                     awards、club、land、inquiry；軟刪除以
                                                     deletedAt/deletedBy 標記
/years/{year}/auditLogs/{id}                     -- 不可變更稽核紀錄：moduleKey、recordId、action、
                                                     actorUid、actorName、before、after、createdAt
/years/{year}/files/{id}                         -- 預算書 PDF 的 Storage 路徑／檔名／大小等中繼資料
/years/{year}/exports/{id}                       -- 匯出紀錄 { name, user, time }
/users/{uid}                                     -- { name, email, dept, role, status, modules[] }
```

Storage：`budget-books/{year}/{fileName}`（公開讀取，僅能透過 `uploadBudgetBookPdf` Cloud Function 以 Admin SDK 寫入，見下）。

## 已知的真實數字 vs. 佔位資料

115 年度歲入歲出（歲入合計 53,642／歲出合計 54,358／短絀 716）與 113–115 三年度歲出總額，取自校方實際 115 年度預算書，已寫入 `scripts/migration.cjs`（`scripts/seed.js` 為其 CLI 入口，見上）。圖書、族語、獲獎、社團、土地現值、質詢答詢、特殊生統計等模組資料，以及 115 年度決算金額／差異原因說明、學雜費（各年級平均）、午餐補助等新增欄位，為**示意用佔位資料**，正式啟用前請由各處室以系統表單填入實際數字。

## 帳號與權限

- **管理者**：可存取所有模組、建立新年度、匯入預算書、新增／編輯／停用帳號。
- **填報人員**：僅能編輯 `/users/{uid}.modules` 中列出的模組，且限於未鎖定年度。
- 帳號需 `status: 'active'` 才能存取系統；停用（`status: 'disabled'`）不會刪除帳號或其稽核歷史，只會撤銷存取權與 Firebase Auth session。
- 帳號的新增／編輯／停用／重新啟用皆透過 `functions/index.js` 的 Cloud Function（`createAccount`／`updateAccount`／`setAccountStatus`）以 Admin SDK 執行，並在伺服器端重新驗證呼叫者仍是 active 管理者。新增帳號會回傳密碼設定連結（本專案未串接寄信服務，需由管理者手動轉交連結）。
- 預算書 PDF 上傳／替換透過 `uploadBudgetBookPdf` Cloud Function（同樣以 Admin SDK 寫入 Storage），因為 `storage.rules` 完全禁止用戶端直接寫入 `budget-books/**`。

## 測試

- `npm test`：快速單元測試（`src/`、`functions/`、`scripts/`），全部使用 mock，不需要任何 Firebase 服務。
- `npm run test:rules`：對照 `firestore.rules`／`storage.rules` 的 allow/deny 矩陣，透過 `firebase emulators:exec` 啟動本機 emulator 執行（需要本機已安裝 Java；macOS 可用 `brew install openjdk`）。
- `npm run seed:dry-run`：預覽 `npm run seed` 會建立哪些文件而不實際寫入。

## 尚待接續的功能

- 對齊議會既有 `.xls` 範本欄位順序（需取得總務處提供的範本檔案）。
- PDF 匯入解析（`src/lib/importParser.js`）目前以已知標籤做 regex 比對，若校方文件排版差異較大需調整樣式。
- GitHub Actions 目前僅 build + 部署 Hosting，尚未在 CI 中跑 `npm test`／`npm run lint`，也未自動部署 Firestore/Storage 規則、索引或 Cloud Functions（這些仍需手動以 Firebase CLI 部署，見上）。
- Firestore API 尚未在 Firebase 專案上啟用，代表 Firestore／Storage／Functions 都還沒有正式佈署過；需先確認 Blaze 方案已開通才能啟用並部署（見「建立並連接 Firebase 專案」）。
