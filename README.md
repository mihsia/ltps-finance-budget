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
                                                     後兩者選填）、language（class，開班資料）、
                                                     languageCert（certification|roster，認證統計與通過
                                                     名冊，與 language 分開存放，見下「族語開班與族語認證」）、
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

## 族語開班與族語認證

- **拆分為兩個獨立模組**：「族語開班」（開班資料：語系、班級數、學生人數，`src/pages/Language.jsx`，Firestore moduleKey `language`）與「族語認證」（認證統計、學生通過名冊，`src/pages/LanguageCert.jsx`，Firestore moduleKey `languageCert`）原本合併在同一頁、同一個 Firestore 子集合，容易讓填報人員搞混兩種性質不同的資料，現已拆成左方選單兩個獨立項目，帳號管理頁的「負責模組」也可分別授權（模組清單直接取自 `src/lib/nav.js` 的 `navGroups`，新增項目會自動出現在帳號管理頁，不需另外維護）。
- **`languageCert` 也需要加入 Cloud Functions 的帳號模組白名單**：帳號新增／編輯（含 xlsx 批次匯入）由 `functions/accountAdmin.cjs` 的 `ACCOUNT_MODULE_KEYS`／`MODULE_LABELS` 在伺服器端驗證「負責模組」是否為已知模組，這份清單與 `src/lib/nav.js` 是分開維護的兩份清單，新增模組時兩邊都要同步更新（已修正並加入 `languageCert`／「族語認證」）。這個檔案屬於 Cloud Functions，**同樣需要執行 `firebase deploy --only functions` 才會在正式環境生效**，否則帳號管理頁指派「族語認證」模組時仍會收到「負責模組不存在：languageCert」的錯誤。
- **既有認證／名冊資料需手動搬移一次**：這個拆分只影響「之後新增的資料」存放位置；若系統先前已透過「族語開班」頁輸入過認證統計或名冊資料，那些紀錄仍留在舊的 `language` 子集合中，不會自動出現在新的「族語認證」頁。請在取得 Firebase 服務帳戶金鑰（`scripts/serviceAccountKey.json`，流程同 `npm run seed` 所需的金鑰）後，執行一次搬移腳本：
  ```
  npm run migrate:language-cert:dry-run   # 預覽會搬移哪些紀錄，不會寫入
  npm run migrate:language-cert           # 實際搬移
  ```
  此腳本（`scripts/migrateLanguageCertification.js`／核心邏輯見 `scripts/migrateLanguageCertification.cjs`）只搬移 `recordType` 為 `certification`／`roster` 的紀錄，且具冪等性：目的地已存在的紀錄不會被覆蓋，重複執行也不會重複搬移或出錯。
- **語系改為下拉選單**：開班資料與認證統計／名冊的「語系」欄位改為下拉選單，選項為閩南語、客語，以及原住民族委員會公告的 16 族語言（阿美語、泰雅語、排灣語、布農語、卑南語、魯凱語、鄒語、賽夏語、雅美語（達悟語）、邵語、噶瑪蘭語、太魯閣語、撒奇萊雅語、賽德克語、拉阿魯哇語、卡那卡那富語），定義見 `src/lib/recordSchemas.js` 的 `LANGUAGE_OPTIONS`。
- **認證通過級別改採官方五級制**：原本為自訂的 A／B／C 三級，現改為「原住民族語言能力認證」官方分級：初級、中級、中高級、高級、優級（`LANGUAGE_CERT_LEVELS`），閩南語／客語認證比照同一五級制呈現。

## 特生統計

- 議會報表頁新增「特生統計分析」區塊，以圓環圖依類別（原住民／新住民／低收入戶／身障生／單親生，皆以不同顏色區分）呈現各類別人數，並計算佔全校學生總數（基本資料模組的學生人數）的百分比；由於類別間可能重疊（同一學生可能同時屬於多個類別），百分比各自獨立計算，不會加總為 100%。尚未填寫學生人數時會顯示提示文字，不會顯示錯誤的百分比。計算邏輯見 `src/lib/specialNeedsStats.js`。

## 課後社團

- **上課星期＋起訖時間**：上課時間改為「上課星期」（下拉選單，週一～週五，社團不在週六上課）搭配「開始時間」／「結束時間」兩個時間欄位，系統會驗證結束時間必須晚於開始時間，定義見 `src/lib/recordSchemas.js` 的 `CLUB_WEEKDAYS` 與 `validateGenericRecord`。
- **新增每生費用／上課場地欄位**：每個社團可填寫每生費用（元）與上課場地，與既有的社團名稱／指導老師／人數一併顯示於列表與議會報表的細項資料中。
- **社團參與比例**：議會報表頁新增「社團參與比例」區塊，以比例計量表（meter）呈現所有社團參與人次總和佔全校學生總數的百分比；由於資料僅記錄各社團人數、未記錄學生名單，若同一學生參加多個社團會重複計入，此比例為「參與人次佔比」而非不重複學生人數佔比。計算邏輯見 `src/lib/clubStats.js`。

## 預算書表

- **手動輸入說明文字**：除了上傳 PDF 全文外，「基金別」「審議機關」旁新增「預算書說明」文字區塊，可直接輸入重點內容（上限 2000 字），不需要依賴 PDF 檔案。
- **業務計畫別金額可直接編輯**：預算書表頁的「業務計畫別預算金額」實際上就是歲入歲出模組的歲出紀錄，現在可在此頁點選「編輯」直接修改金額，異動會立即同步反映在歲入歲出模組（兩邊顯示同一份資料），權限與填報期限比照歲入歲出模組本身。

## 權限與填報期限

- **無權限時不再顯示資料**：填報人員若未被指派某模組的權限，過去仍能看到該模組資料（唯讀），現在會直接顯示「無權限，請洽系統管理員」訊息，不再顯示任何資料內容；管理者不受影響，仍可存取所有模組。
- **帳號管理頁補上同樣的權限檢查**：`src/pages/Settings.jsx`（帳號管理）先前漏掉了這道 `canEditModule` 檢查，只有畫面上的「編輯／停用／新增帳號」等按鈕是管理者限定（`isAdmin`），但頁面本身任何已登入帳號都能打開、看到完整帳號清單（含所有人的 Email、處室、負責模組），即使該帳號的「負責模組」裡沒有勾選「帳號管理」。現已補上與其他模組頁一致的 `canEditModule('settings')` 檢查，沒有被指派「帳號管理」模組的帳號會改看到「無權限」畫面。同時也收緊了 `firestore.rules` 的 `/users/{uid}` 讀取規則（原本是任何登入帳號都可讀取整個帳號集合，僅用畫面擋，Firestore 本身沒擋）：現在只有讀取**自己的**個人資料（登入流程需要）、管理者，或被指派「帳號管理」模組的帳號，才能讀取**其他人**的帳號資料。**這項規則異動需要額外執行 `firebase deploy --only firestore:rules` 才會在正式環境生效**，否則資料庫層級仍是舊規則。
- **填報截止日**：`/years/{year}.deadlines` 可針對任一模組（`basic`／`budget`／`library`／`language`／`languageCert`／`budgetbook`／`awards`／`club`／`land`／`inquiry`／`specialNeeds`）個別設定填報截止日；各模組頁面會顯示醒目的截止日提示（含「截止當日 23:59 前可儲存」或「已超過填報期限」），超過期限後該模組即停用新增／編輯／刪除，伺服器端（`useRecordCrudActions`／各頁 `checkInvocation`）與畫面會同時擋下操作，不只是畫面上看不到按鈕。共用邏輯見 `src/lib/fixedFieldEditing.js` 的 `deadlineExtraCheck`／`getDeadlineState`。

## 登入與介面

- 登入頁下方顯示目前系統版本與最後更新日期；版號不是 `package.json` 的版本號，而是從系統第一次上線起算，每次有使用者可見的異動就加一（v1.0、v1.1……）。版號與異動說明集中定義在 `src/lib/appInfo.js` 的 `CHANGELOG` 陣列，`APP_VERSION`／`APP_UPDATED_AT` 一律取陣列最後一筆，單一真實來源；每次出新版時在陣列尾端新增一筆（`version`／`date`／`notes`），不修改或重排舊紀錄。
- **登入畫面以 Google 帳號登入為主**：由於系統帳號已全面改用 Google 登入，登入頁預設只顯示「使用 Google 帳號登入」按鈕，帳號密碼表單收合為「仍使用舊版帳號密碼登入」連結，點選後才展開，避免使用者誤填密碼表單造成登入錯誤。既有的 Google／密碼帳號連結流程（`pendingGoogleEmail`）不受影響：當 Google 帳號需要連結既有密碼帳號時，密碼表單會自動強制展開並要求輸入原密碼。版面並加大卡片留白、置中品牌標題、縮短按鈕下方說明文字，避免換行斷字。
- **更新日誌**：左方選單「報表與管理」新增「更新日誌」頁面（`src/pages/Changelog.jsx`），列出 `CHANGELOG` 所有版本紀錄（新到舊），左側以固定色塊顯示版號、右側顯示日期與說明，並依版次交錯背景色以利逐筆閱讀；導覽標籤維持四字，與其他模組的標籤長度一致。此頁面刻意不做模組權限檢查，所有已登入使用者皆可檢視，不受帳號的「負責模組」設定影響。
- 畫面右上角使用者頭像改為顯示 Google 帳號的大頭貼（`photoURL`）；若無法載入則自動回退為原本的姓名字首圓形圖示。
- 帳號管理頁的「負責模組」欄位最多顯示 3 個模組標籤，超過的數量以「+N」徽章呈現，滑鼠移至徽章上可看到完整清單（`title` 屬性），避免模組數量多時版面過於擁擠。
- **登入後也看得到系統版本**：左方選單最下方新增兩行小字（「系統版本 vX.X」與更新日期分行顯示，避免選單變寬），點選可直接跳到「更新日誌」頁；與登入頁下方的版本資訊共用同一份 `src/lib/appInfo.js` 資料。
- **左方選單依功能分區**：原本「資料模組」一組塞了 10 個項目，隨族語開班／族語認證拆分後更長，現拆成「校務與學生」（基本資料、特生統計）、「教學與活動」（圖書藏書、族語開班、族語認證、課後社團、獲獎紀錄）、「財務與行政」（歲入歲出、土地現值、質詢答詢）三組，加上原有的「總覽」「報表與管理」，共五組，每組項目數都在可一眼掃完的範圍內。分組定義見 `src/lib/nav.js` 的 `navGroups`。
- **右上角年度切換只顯示最近 3 個年度**：避免年度一多，切換列無限變長。超過 3 年的舊年度請從左方選單「歷史歸檔」進入——點選任一年度的「查看」或「匯出」即可切換到該年度並直接跳轉到對應頁面；若目前選取的正是歷史歸檔切過去的舊年度，右上角仍會額外顯示該年度，讓使用者看得出目前在哪個年度，不會因為不在最近 3 年清單裡而消失。邏輯見 `src/components/Header.jsx` 的 `RECENT_YEARS_SHOWN`。

## 測試

- `npm test`：快速單元測試（`src/`、`functions/`、`scripts/`），全部使用 mock，不需要任何 Firebase 服務。
- `npm run test:rules`：對照 `firestore.rules`／`storage.rules` 的 allow/deny 矩陣，透過 `firebase emulators:exec` 啟動本機 emulator 執行（需要本機已安裝 Java；macOS 可用 `brew install openjdk`）。
- `npm run seed:dry-run`：預覽 `npm run seed` 會建立哪些文件而不實際寫入。

## 尚待接續的功能

- **移除 113、114 年度資料**（因資料不完整、易產生統計錯誤，僅保留 115 年度）：這是對正式 Firestore 資料庫的刪除操作且無法復原，需要 Firebase 服務帳戶金鑰才能執行，待取得金鑰後再處理；注意移除後「歲出三年比較」等跨年度趨勢功能只會剩 115 年度可顯示。
- 對齊議會既有 `.xls` 範本欄位順序（需取得總務處提供的範本檔案）。
- PDF 匯入解析（`src/lib/importParser.js`）目前以已知標籤做 regex 比對，若校方文件排版差異較大需調整樣式。
- GitHub Actions 目前僅 build + 部署 Hosting，尚未在 CI 中跑 `npm test`／`npm run lint`，也未自動部署 Firestore/Storage 規則、索引或 Cloud Functions（這些仍需手動以 Firebase CLI 部署，見上）。
- Firestore API 尚未在 Firebase 專案上啟用，代表 Firestore／Storage／Functions 都還沒有正式佈署過；需先確認 Blaze 方案已開通才能啟用並部署（見「建立並連接 Firebase 專案」）。
