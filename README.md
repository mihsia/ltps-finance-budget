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
   管理者帳號只能以 Google 帳號登入（不會設定密碼），請確認 `SEED_ADMIN_EMAIL` 是一個可登入 Google 的信箱，設定完成後該管理者即可直接用該 Google 帳號登入系統。

### GitHub Actions 自動部署

於 repo 的 Settings > Secrets 新增：`VITE_FIREBASE_*`（同 `.env`）、`FIREBASE_PROJECT_ID`、`FIREBASE_SERVICE_ACCOUNT`（服務帳戶 JSON 全文）。push 到 `main` 即會自動 build 並部署到 Firebase Hosting。

## 資料模型（Firestore，具名資料庫 `ltps-finance-data`）

```
/years/{year}                                    -- "113" | "114" | "115" ...；locked、deadlines
/years/{year}/modules/basic                      -- 班級數／學生人數／代理教師人數（substituteVacancy 懸缺
                                                     代理、substituteAdditional 增置員額，分開存放）／其餘
                                                     教師人力／學雜費（各年級平均）／午餐補助（全年度），
                                                     含 status: draft|submitted
/years/{year}/modules/library                    -- generalBooks、indigenousBooks
/years/{year}/modules/budgetbook                 -- fundName、reviewAuthority、pdfUrl（PDF 存 Storage，見下）
/years/{year}/modules/{key}/records/{recordId}   -- 多筆資料：budget（expense|revenue，各含 amount 預算
                                                     金額、actualAmount 決算金額、varianceNote 差異原因，
                                                     後兩者選填）、language（class|certification|roster）、
                                                     specialNeeds（特生統計：category|count|note，
                                                     category 為下拉選單並可自訂）、awards（含 category
                                                     語文類|藝文類|體育類|科學類下拉選單）、club、land、
                                                     inquiry；軟刪除以 deletedAt/deletedBy 標記
/years/{year}/auditLogs/{id}                     -- 不可變更稽核紀錄：moduleKey、recordId、action、
                                                     actorUid、actorName、before、after、createdAt
/years/{year}/files/{id}                         -- 預算書 PDF 的 Storage 路徑／檔名／大小等中繼資料
/years/{year}/exports/{id}                       -- 匯出紀錄 { name, user, time }
/users/{uid}                                     -- { name, email, dept, role, status, modules[] }
```

Storage：`budget-books/{year}/{fileName}`（公開讀取，僅能透過 `uploadBudgetBookPdf` Cloud Function 以 Admin SDK 寫入，見下）。

## 已知的真實數字 vs. 佔位資料

115 年度歲入歲出（歲入合計 53,642／歲出合計 54,358／短絀 716）與 113–115 三年度歲出總額，取自校方實際 115 年度預算書，已寫入 `scripts/migration.cjs`（`scripts/seed.js` 為其 CLI 入口，見上）。圖書、族語、獲獎、社團、土地現值、質詢答詢、特生統計等模組資料，以及 115 年度決算金額／差異原因說明、學雜費（各年級平均）、午餐補助、代理教師懸缺代理／增置員額分項等新增欄位，為**示意用佔位資料**，正式啟用前請由各處室以系統表單填入實際數字。

## 帳號與權限

- **管理者**：可存取所有模組、建立新年度、匯入預算書、新增／編輯／停用帳號。
- **填報人員**：僅能編輯 `/users/{uid}.modules` 中列出的模組，且限於未鎖定年度。
- 帳號需 `status: 'active'` 才能存取系統；停用（`status: 'disabled'`）不會刪除帳號或其稽核歷史，只會撤銷存取權與 Firebase Auth session。
- 帳號的新增／編輯／停用／重新啟用皆透過 `functions/index.js` 的 Cloud Function（`createAccount`／`updateAccount`／`setAccountStatus`）以 Admin SDK 執行，並在伺服器端重新驗證呼叫者仍是 active 管理者。
- **帳號一律僅限 Google 帳號登入**：`createAccount`／`importAccounts` 建立 Firebase Auth 使用者時都不會設定密碼（只是一個掛著 Email 的「空殼」帳號），該使用者第一次以同一個 Email 的 Google 帳號登入時，Firebase 會直接把 Google 登入方式掛上這筆既有帳號，不會另外產生新帳號。帳號管理頁建立帳號時，Email 欄位可從下拉選單選擇網域（`tmail.ilc.edu.tw`／`gmail.com`／自行輸入完整 Email）。
- **帳號白名單登入限制（含 Google 登入）**：`functions/index.js` 註冊了 `beforeAccountCreate`／`beforeAccountSignIn` 兩個 Firebase Auth Blocking Functions，任何登入（含第一次使用 Google 帳號登入）都會先比對該 Email 是否已存在一筆 `status: 'active'` 的 `/users` 帳號；不符合則直接在伺服器端拒絕，連 Firebase Auth 使用者都不會建立，而不只是登入後才被畫面擋下來。這兩個函式**需要額外執行 `firebase deploy --only functions` 才會生效**；Firebase CLI 會自動將其註冊為 Blocking Functions，不需要在 Console 另外設定，但每個專案的 `beforeCreate`／`beforeSignIn` 事件各自只能有一個函式，若專案已有其他 Blocking Function 需合併邏輯。
- **批次匯入帳號**：帳號管理頁可下載「帳號匯入範例檔」（`.xlsx`，內附填寫說明與可用模組／處室清單），填好後以「匯入帳號」上傳；每一列各自驗證與建立，單列失敗（例如 Email 重複）不會中斷其他列，上傳後會列出逐列的成功／失敗結果。帳號欄位只要輸入帳號名稱，系統會自動補上預設網域 `@tmail.ilc.edu.tw`（輸入含 `@` 的完整 Email 則直接使用）；實際邏輯見 `functions/accountAdmin.cjs` 的 `normalizeImportRow` 與 `importAccounts` Cloud Function。
- 預算書 PDF 上傳／替換透過 `uploadBudgetBookPdf` Cloud Function（同樣以 Admin SDK 寫入 Storage），因為 `storage.rules` 完全禁止用戶端直接寫入 `budget-books/**`。

## 獲獎紀錄

- **獲獎項目／等級皆為下拉選單**：「獲獎項目」依所選「類別」分組列出宜蘭縣／全縣層級常見競賽名稱（如宜蘭縣語文競賽各組別、宜蘭縣科學展覽會、宜蘭縣運動會等；全國賽得獎機會較少，未列入預設選項，可透過「其他（自訂）」輸入），「等級」提供特優／優等／甲等／第一～六名／佳作；兩者皆附「其他（自訂）」可自行輸入，欄位定義見 `src/lib/recordSchemas.js` 的 `AWARD_ITEM_OPTIONS_BY_CATEGORY`／`AWARD_LEVELS`。
- **賽事類型與得獎學生姓名**：每筆紀錄需選擇「賽事類型」（個人賽／團體賽）；個人賽必須填寫「學生姓名」，團體賽則可留空（沒有單一得獎人），驗證邏輯見 `src/lib/recordSchemas.js` 的 `validateGenericRecord`。
- **獨立匯出／匯入**：獲獎紀錄頁可直接「匯出 Excel」目前資料、下載「範本」、或「匯入 Excel」批次新增，與議會報表頁的全模組匯出互不相關；匯入時每一列各自驗證與建立，單列失敗不影響其他列，並列出逐列成功／失敗結果，邏輯見 `src/lib/awardImport.js`。
- **統計分析**：議會報表頁新增「獲獎項目統計分析」區塊，提供依類別（圓環圖）與依等級（長條圖）的分布統計，計算邏輯見 `src/lib/awardStats.js`。

## 特生統計

- 議會報表頁新增「特生統計分析」區塊，以圓環圖依類別（原住民／新住民／低收入戶／身障生／單親生，皆以不同顏色區分）呈現各類別人數，並計算佔全校學生總數（基本資料模組的學生人數）的百分比；由於類別間可能重疊（同一學生可能同時屬於多個類別），百分比各自獨立計算，不會加總為 100%。尚未填寫學生人數時會顯示提示文字，不會顯示錯誤的百分比。計算邏輯見 `src/lib/specialNeedsStats.js`。

## 課後社團

- **上課時間改為下拉選單**：提供常見的平日放學後時段與週六上午時段快速選取，並附「其他（自訂）」可自行輸入其他時段，選項定義見 `src/lib/recordSchemas.js` 的 `CLUB_SCHEDULE_OPTIONS`。
- **新增每生費用／上課場地欄位**：每個社團可填寫每生費用（元）與上課場地，與既有的社團名稱／指導老師／人數／上課時間一併顯示於列表與議會報表的細項資料中。
- **社團參與比例**：議會報表頁新增「社團參與比例」區塊，以比例計量表（meter）呈現所有社團參與人次總和佔全校學生總數的百分比；由於資料僅記錄各社團人數、未記錄學生名單，若同一學生參加多個社團會重複計入，此比例為「參與人次佔比」而非不重複學生人數佔比。計算邏輯見 `src/lib/clubStats.js`。

## 測試

- `npm test`：快速單元測試（`src/`、`functions/`、`scripts/`），全部使用 mock，不需要任何 Firebase 服務。
- `npm run test:rules`：對照 `firestore.rules`／`storage.rules` 的 allow/deny 矩陣，透過 `firebase emulators:exec` 啟動本機 emulator 執行（需要本機已安裝 Java；macOS 可用 `brew install openjdk`）。
- `npm run seed:dry-run`：預覽 `npm run seed` 會建立哪些文件而不實際寫入。

## 尚待接續的功能

- 對齊議會既有 `.xls` 範本欄位順序（需取得總務處提供的範本檔案）。
- PDF 匯入解析（`src/lib/importParser.js`）目前以已知標籤做 regex 比對，若校方文件排版差異較大需調整樣式。
- GitHub Actions 目前僅 build + 部署 Hosting，尚未在 CI 中跑 `npm test`／`npm run lint`，也未自動部署 Firestore/Storage 規則、索引或 Cloud Functions（這些仍需手動以 Firebase CLI 部署，見上）。
- Firestore API 尚未在 Firebase 專案上啟用，代表 Firestore／Storage／Functions 都還沒有正式佈署過；需先確認 Blaze 方案已開通才能啟用並部署（見「建立並連接 Firebase 專案」）。
