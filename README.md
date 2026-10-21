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
- **語系改為下拉選單**：開班資料與師資名冊／學生通過名冊的「語系」欄位改為下拉選單，選項為閩南語、客語，以及原住民族委員會公告的 16 族語言（阿美語、泰雅語、排灣語、布農語、卑南語、魯凱語、鄒語、賽夏語、雅美語（達悟語）、邵語、噶瑪蘭語、太魯閣語、撒奇萊雅語、賽德克語、拉阿魯哇語、卡那卡那富語），定義見 `src/lib/recordSchemas.js` 的 `LANGUAGE_OPTIONS`。
- **認證通過級別改採官方五級制**：原本為自訂的 A／B／C 三級，現改為「原住民族語言能力認證」官方分級：初級、中級、中高級、高級、優級（`LANGUAGE_CERT_LEVELS`），閩南語／客語認證比照同一五級制呈現。
- **「認證統計」改為「師資名冊」，統計數字一律由名冊算出**：原本「認證統計」是直接輸入語系的彙總數字（已認證教師／授課教師總數／應考人數／通過人數），容易被誤會成要逐一填寫教師或學生個人資料，且這組彙總數字和下方「學生通過名冊」各自輸入、互不連動，兩邊數字很容易對不起來。現改為「師資名冊」：逐筆登錄語系、教師姓名、是否已通過認證（與既有的學生通過名冊同樣是逐人登錄的名冊，不再有彙總輸入）。頁面上方「授課教師取得認證比例」「學生族語認證通過人數」兩項統計，現在都是直接從師資名冊／學生通過名冊的筆數即時算出，不會再有輸入不一致的問題；原本的「學生認證通過率」（需要「應考人數」才能算，但應考人數本來就無法從名冊回推）已移除。既有以舊版「認證統計」格式填寫的資料仍會原樣保留在資料庫中，但不會顯示在新版頁面，需要由各處室改用新的「師資名冊」表單重新登錄實際教師名單。

## 特生統計

- 議會報表頁新增「特生統計分析」區塊，以圓環圖依類別（原住民／新住民／低收入戶／身障生／單親生，皆以不同顏色區分）呈現各類別人數，並計算佔全校學生總數（基本資料模組的學生人數）的百分比；由於類別間可能重疊（同一學生可能同時屬於多個類別），百分比各自獨立計算，不會加總為 100%。尚未填寫學生人數時會顯示提示文字，不會顯示錯誤的百分比。計算邏輯見 `src/lib/specialNeedsStats.js`。

## 課後社團

- **上課星期＋起訖時間**：上課時間改為「上課星期」（下拉選單，週一～週五，社團不在週六上課）搭配「開始時間」／「結束時間」兩個時間欄位，系統會驗證結束時間必須晚於開始時間，定義見 `src/lib/recordSchemas.js` 的 `CLUB_WEEKDAYS` 與 `validateGenericRecord`。
- **新增每生費用／上課場地欄位**：每個社團可填寫每生費用（元）與上課場地，與既有的社團名稱／指導老師／人數一併顯示於列表與議會報表的細項資料中。
- **社團參與比例**：議會報表頁新增「社團參與比例」區塊，以比例計量表（meter）呈現所有社團參與人次總和佔全校學生總數的百分比；由於資料僅記錄各社團人數、未記錄學生名單，若同一學生參加多個社團會重複計入，此比例為「參與人次佔比」而非不重複學生人數佔比。計算邏輯見 `src/lib/clubStats.js`。

## 課照學扶（新模組）

- **新增「課照學扶」模組**：記錄課後照顧、學習扶助等開班情況，欄位為班別類別（下拉選單：課照班／特教課照／學扶班／其他可自訂）、班別名稱、任課老師、學生人數、開課時段、上課地點。與獲獎紀錄、課後社團等模組一樣，共用 `src/pages/Generic.jsx` 這套清單式資料頁面（新增／編輯／停用／復原、填報截止日、年度鎖定等規則自動套用），欄位定義見 `src/lib/recordSchemas.js` 的 `genericRecordSchemas.careSupport`。
- **左側選單位置**：放在「教學與活動」分組、緊接在「課後社團」之後，兩者性質相近。
- **權限控管**：與其他模組一致，透過 `canEditModule('careSupport')` 控管頁面存取，並可在「帳號管理」頁將此模組指派給特定帳號的「負責模組」。
- **建立下一年度會複製**：比照課後社團，列入 `src/hooks/useYearData.js` 的 `RECORD_MODULE_KEYS_TO_COPY`，建立新年度時會把目前年度未停用的紀錄複製過去作為起點資料。
- **報表統計**：議會報表匯出頁「各模組現況」新增課照學扶卡片，包含兩張圖表：「依班別類別分布」圓環圖（課照班／特教課照／學扶班，比照獲獎紀錄的依類別分布，共用 `src/lib/awardStats.js` 的 `summarizeByCategory`，傳入 `CARE_SUPPORT_CATEGORIES` 作為固定類別清單）、「參與比例」計量表（比照課後社團，顯示課照學扶參與人次佔全校學生的比例，共用 `src/lib/clubStats.js` 的 `summarizeClubParticipation`，因為兩個模組的欄位都叫 `participants`）；匯出的 PDF／Excel 也會包含此模組的筆數與細項資料（圖表僅顯示於網頁版，與獲獎紀錄、特生統計的圖表一致）。
- **總覽儀表的填報完成度**：`src/pages/Dashboard.jsx` 的「填報完成度」卡片也納入此模組。

## 修正清單式模組的紀錄表格在欄位較多時無法捲動

`src/pages/Generic.jsx`（獲獎紀錄、課後社團、課照學扶、土地現值、質詢答詢、特生統計共用）的紀錄列表，原本在欄位數較多、表格寬度超過卡片寬度時（例如課後社團有 8 個欄位），外層卡片的 `overflow: 'hidden'` 與負責提供橫向捲動的 `.table-scroll` CSS class（`overflow-x: auto`）互相衝突——inline style 的優先權較高，等於把 `overflow-x` 也鎖成 `hidden`，使用者完全無法把表格往右捲動，最右邊的「每生費用」「操作」（編輯／停用／移除）等欄位會直接被卡片裁掉、無法觸碰，看起來就像「舊資料無法編輯」。現已修正為只用 `overflowY: 'hidden'`（保留卡片圓角裁切），讓 `.table-scroll` 原本就有的橫向捲動生效；同時把「操作」欄改為固定在表格右側（`src/styles.js` 的 `stickyActionCell`），捲動時一律看得到編輯／停用（或移除）按鈕，不必先猜到要往右捲才找得到。

## 修正基本資料／圖書藏書留白欄位會擋住整張表單儲存的問題

「基本資料」（9 個人數／班級數欄位）與「圖書藏書」（2 個藏書量欄位）這類固定欄位模組，儲存前會用 `src/lib/fixedFieldEditing.js` 的 `validateFixedFields` 檢查每個欄位都是非負整數；但原本的規則連「留白」也視為不合法（空字串無法通過 `/^\d+$/`），導致只要有一個欄位（例如代理教師人數、學雜費、午餐補助這類不一定每年都有數字的欄位）沒填，點「儲存」就會失敗，並顯示一則不指出是哪個欄位的籠統錯誤訊息「所有人數與班級數都必須是非負整數。」。使用者若沒注意到紅字訊息，看起來就像是「修改後的資料沒有真的存進系統」。現已修正為**留白視為尚未填寫（等同 0，不擋儲存）**，只有真的填入負數、小數或非數字文字時才會擋下；錯誤訊息也改為明確列出哪些欄位有問題（例如「『教師員額（編制內）』必須是非負整數，或留白。」），方便直接找到要修正的欄位。

## 議會質詢／答詢紀錄

- **「議員/題目」拆成「議員」與「題目」兩個獨立欄位，新增「答案」欄位**：原本議員姓名與質詢題目擠在同一個欄位（例如「王議員：代理教師人力」），容易讓人誤會是單一欄位；且先前只有「答詢狀態」（已答詢／待答詢）沒有實際答覆內容的欄位。現拆成「議員」「題目」兩欄，並新增「答案」（選填，待答詢時可留空，答覆後再編輯補上）；「答詢狀態」改為下拉選單（待答詢／已答詢，可自訂），欄位定義見 `src/lib/recordSchemas.js` 的 `genericRecordSchemas.inquiry`。
- **新增、編輯、停用、復原功能本來就有，不是這次才加的**：此模組與其他「清單式」資料模組（獲獎紀錄、課後社團、土地現值等）共用同一套 `src/pages/Generic.jsx`，新增一筆／編輯／停用／復原本來就都支援；畫面上看不到「編輯」「停用」欄位，通常是因為目前帳號沒有該模組權限、所選年度不是最新年度、年度被鎖定、或已超過該模組的填報截止日，並非功能缺漏——可對照左方選單「操作手冊」的「新增與編輯資料」一節確認。
- **獨立匯出／匯入**：比照獲獎紀錄頁，議會質詢／答詢紀錄頁現在也可直接「匯出 Excel」目前資料、下載「範本」、或「匯入 Excel」批次新增，與議會報表頁的全模組匯出互不相關；匯入時每一列各自驗證與建立，單列失敗不影響其他列，並列出逐列成功／失敗結果，邏輯見 `src/lib/inquiryImport.js`。`src/pages/Generic.jsx` 原本把這組功能寫死只給 `moduleKey === 'awards'`，現改為一個 `IMPORT_EXPORT` 模組登記表（目前含 `awards`／`inquiry`），之後其他模組要加上同樣的獨立匯出／匯入，只需要在表裡多登記一筆，不用再複製貼上一整段邏輯。
- **既有資料需執行一次欄位搬移**：這次欄位拆分只影響「之後新增的資料」怎麼存；若系統先前已用舊版「議員/題目」合併欄位輸入過質詢紀錄，那些紀錄的 `subject` 仍是舊的合併文字、也還沒有 `councilor`／`answer` 欄位，畫面上「議員」會顯示空白、「題目」會顯示舊的合併文字。請在取得 Firebase 服務帳戶金鑰（`scripts/serviceAccountKey.json`，流程同 `npm run seed` 所需的金鑰）後，執行一次搬移腳本：
  ```
  npm run migrate:inquiry-fields:dry-run   # 預覽會怎麼拆分，不會寫入
  npm run migrate:inquiry-fields           # 實際搬移
  ```
  此腳本（`scripts/migrateInquiryFields.js`／核心邏輯見 `scripts/migrateInquiryFields.cjs`）會把舊的「議員：題目」文字從第一個全形或半形冒號切開，左邊存成「議員」、右邊存成「題目」；若原本的文字裡找不到冒號可切，則「議員」留空、「題目」維持原文字不變，並在搬移報告中單獨列出這些需要人工補填議員姓名的紀錄，不會自動用猜的。具冪等性：已經有 `councilor` 欄位的紀錄會被略過，重複執行也不會重複搬移或出錯。

## 預算書表

- **手動輸入說明文字**：除了上傳 PDF 全文外，「基金別」「審議機關」旁新增「預算書說明」文字區塊，可直接輸入重點內容（上限 2000 字），不需要依賴 PDF 檔案。
- **業務計畫別金額可直接編輯**：預算書表頁的「業務計畫別預算金額」實際上就是歲入歲出模組的歲出紀錄，現在可在此頁點選「編輯」直接修改金額，異動會立即同步反映在歲入歲出模組（兩邊顯示同一份資料），權限與填報期限比照歲入歲出模組本身。

## 議會報表匯出版面

- **依功能分區，而非一路排到底**：報表頁隨著各模組陸續加入已累積不少內容，原本是一長串同樣字重的區塊標題，容易讓人找不到重點。現改為較大的分區標題（財務概況／各模組現況／匯出與紀錄，見 `src/pages/Report.jsx` 的 `ZoneHeader`），每個分區底下再用既有的小標題細分，閱讀時更容易掃視定位。
- **財務概況新增圖表，不再只有表格**：報表最前面、最重要的財務概況先前只有表格、沒有任何圖表。現「歲出三年比較」新增長條圖（`ExpenseTrendBars`，三年金額與年增減一眼看出走勢），並新增「歲入來源」卡片（原本只有匯出的 PDF／Excel 看得到，網頁版從未顯示過），以圓環圖（`RevenueSourceDonut`，見 `src/lib/revenueStats.js` 的 `summarizeRevenueSources`）呈現各收入來源佔比，搭配既有的明細表。三張卡（歲出三年比較／業務計畫別預算與決算／歲入來源）並排顯示，寬度不足時自動換行堆疊。
- **各模組現況與統計圖表合併，不再分成兩個分開的區塊**：先前「各模組現況」（各模組的數字卡片）與「統計分析」（獲獎／特生／社團圖表）是分開的兩個區塊，同一個模組的數字在上面、圖表卻在下面，要跳著看才能對照。現改為圖表直接嵌入對應模組的卡片中，一個模組只需看一張卡。
- **匯出的 PDF／Excel 同步改版**：先前網頁版改成分區後，匯出的 PDF 與 Excel 仍是舊的一路排到底表格，與畫面不一致。現 `src/lib/overviewExport.js` 的 `buildOverviewPdf` 也加入與網頁一致的分區標題（財務概況／校務資料／各模組現況，含底線分隔與間距），分區標題遇到跨頁會自動換頁重新起算，不會卡在頁尾；`buildOverviewWorkbook`（Excel）則在對應位置插入同樣的分區標籤列，方便在試算表中依區塊快速定位。

## 每個模組都有自己的統計圖表；匯出的 PDF 也看得到

- **所有模組現在都有至少一張圖表**：先前只有獲獎紀錄、特生統計、課後社團、課照學扶有圖表，圖書藏書量、族語開班、土地現值、議會質詢答詢四個模組只有單純的數字卡片。現已全部補上，依資料實際要回答的問題挑選適合的圖表形式，不是每個都硬套圓餅圖：
  - **圖書藏書量**：「館藏組成」長條圖，比較一般書籍與族語／原住民書籍冊數。
  - **族語開班**：「各語系開班數」長條圖，依班級數由多到少排列各語系（`src/lib/languageStats.js` 的 `summarizeClassesByLang`）。
  - **土地現值**：「各地號現值」長條圖，以面積 × 公告現值計算各地號總現值並排序（`src/lib/landStats.js` 的 `summarizeParcelValues`）。
  - **議會質詢答詢**：「答詢完成率」計量表，顯示已答詢筆數佔全部質詢的比例（`src/lib/inquiryStats.js` 的 `summarizeInquiryResolution`）——答詢完成率是「筆數佔自身總數」的比例，不是跟另一個總量比較，所以用計量表而非圓餅圖，道理與既有的課後社團／課照學扶參與比例計量表一致。
  - 清單式模組（獲獎紀錄、特生統計、課後社團、課照學扶）的既有圖表不變。
- **匯出的 PDF 現在也包含圖表，不再只有表格**：先前無論網頁版有多少圖表，匯出的 PDF 一律只有表格。現在點選「匯出 PDF」或「匯出 PDF（全貌總覽）」預覽時，會先用 `html2canvas` 把網頁上目前顯示的每張圖表（財務概況的歲出三年比較長條圖、歲入來源圓環圖，以及每個已勾選模組卡片內的圖表）擷取成圖片，再由 `src/lib/overviewExport.js` 的 `buildOverviewPdf` 嵌入對應表格下方（見 `src/lib/chartCapture.js` 的 `captureChartImages`）；PDF 內容因此與網頁版看到的圖表一致，閱讀報表時不必再對照畫面。只擷取當下實際顯示在畫面上的圖表，若在「選擇涵蓋模組」取消勾選了某個模組，匯出的 PDF 也不會出現它的圖表。Excel 匯出維持純表格（試算表格式本來就不適合嵌入圖片）。

## 權限與填報期限

- **無權限時不再顯示資料**：填報人員若未被指派某模組的權限，過去仍能看到該模組資料（唯讀），現在會直接顯示「無權限，請洽系統管理員」訊息，不再顯示任何資料內容；管理者不受影響，仍可存取所有模組。
- **帳號管理頁補上同樣的權限檢查**：`src/pages/Settings.jsx`（帳號管理）先前漏掉了這道 `canEditModule` 檢查，只有畫面上的「編輯／停用／新增帳號」等按鈕是管理者限定（`isAdmin`），但頁面本身任何已登入帳號都能打開、看到完整帳號清單（含所有人的 Email、處室、負責模組），即使該帳號的「負責模組」裡沒有勾選「帳號管理」。現已補上與其他模組頁一致的 `canEditModule('settings')` 檢查，沒有被指派「帳號管理」模組的帳號會改看到「無權限」畫面。同時也收緊了 `firestore.rules` 的 `/users/{uid}` 讀取規則（原本是任何登入帳號都可讀取整個帳號集合，僅用畫面擋，Firestore 本身沒擋）：現在只有讀取**自己的**個人資料（登入流程需要）、管理者，或被指派「帳號管理」模組的帳號，才能讀取**其他人**的帳號資料。**這項規則異動需要額外執行 `firebase deploy --only firestore:rules` 才會在正式環境生效**，否則資料庫層級仍是舊規則。
- **報表匯出、歷史歸檔頁也補上同樣的權限檢查**：`src/pages/Report.jsx`（報表匯出）與 `src/pages/Archive.jsx`（歷史歸檔）先前完全沒有 `canEditModule` 檢查——`report`／`archive` 在「帳號管理」頁其實都可以被指派成某帳號的負責模組，但即使沒被指派，任何已登入帳號仍能打開這兩頁看到完整內容（報表匯出含全校跨模組財務總覽；歷史歸檔含歷年年度列表與「檢視／匯出」連結），畫面上並未限制。現已比照其他模組頁補上 `canEditModule('report')`／`canEditModule('archive')` 檢查，沒有被指派對應模組的帳號會改看到「無權限」畫面；管理者不受影響，仍可存取所有頁面。左方選單「報表與管理」分組中，只有「操作手冊」與「更新日誌」刻意不做模組權限檢查（所有已登入使用者皆可檢視），其餘項目（含本次補上的兩項）皆受「負責模組」設定控管。
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
- **修正進入系統未必落在最新年度的問題**：`src/App.jsx` 原本用 `useState(latestYear)` 設定預設年度，但這行只在元件第一次掛載那一刻執行一次——如果當下 `years` 清單還沒從 Firestore 同步完成（例如剛好用到尚未同步前的暫時預設值），或是有人在同一個瀏覽階段中途建立了更新的年度，畫面選到的年度就會卡在當時那個不是最新的年度，不會自動跟著變成真正的最新年度。現在改用「尚未手動選擇年度時一律跟隨最新年度，一旦手動選過某個年度才固定在那個年度」的邏輯（見 `src/lib/yearSelection.js` 的 `resolveEffectiveYear`），確保每次進入系統、或年度清單更新時，只要使用者還沒自己切換過年度，都會顯示當下真正最新的年度。

## 操作手冊

- 左方選單「報表與管理」新增「操作手冊」頁面（`src/pages/Manual.jsx`），提供使用者操作說明與畫面截圖，涵蓋登入、介面導覽、新增／編輯資料的共用操作模式、議會報表匯出、帳號管理（標示「管理者專屬」）、PWA 安裝、版本與更新日誌。與「更新日誌」一樣不做模組權限檢查，所有已登入使用者皆可檢視。
- **線上版與 PDF 共用同一份內容**：手冊文字、步驟與截圖集中定義在 `src/lib/manualContent.js` 的 `MANUAL_SECTIONS`，由 `Manual.jsx`（線上瀏覽）與 `src/lib/manualExport.js` 的 `buildManualPdf`（頁面上「下載 PDF 手冊」按鈕）共用，避免線上版與 PDF 內容兩邊分別維護而逐漸脫節。
- **跟隨系統版本**：手冊頁首與 PDF 封面都會顯示目前系統版本（直接讀取 `src/lib/appInfo.js` 的 `APP_VERSION`，不用手動同步）。`manualContent.js` 另外記錄一個 `MANUAL_LAST_REVIEWED_VERSION`（手冊內容最後確認覆蓋到的版本），若與目前 `APP_VERSION` 不同，頁面與 PDF 都會顯示提示，說明手冊可能尚未收錄最新功能——之後異動畫面相關功能時，請一併檢查手冊內容是否需要更新，並同步調整這個常數。
- 截圖為示範資料（非校內真實資料），放在 `public/manual/`，避免手冊曝露真實學生或財務資料。畫面有重大改版時（如本次議會報表匯出的分區與圖表改版），需要重新截圖替換。
- PDF 內嵌文字需要 `src/assets/fonts/NotoSansTC-{Regular,Bold}-subset.js` 這個中文字型子集涵蓋手冊用到的所有字；新增手冊內容後，若 PDF 出現缺字（字變成空白），執行 `python3 scripts/build-pdf-font.py` 重新產生字型子集（需要 `pip install fonttools brotli`）。

## 歷史歸檔：建立下一年度與匯入新年度預算書

「歷史歸檔」頁有兩個建立新年度資料的入口，兩者最終效果相同，可擇一或合併使用：

- **「＋ 建立 {下一年度} 年度（複製 {目前} 年度資料）」**：建立新年度文件（未封存）、封存目前年度，並複製目前年度的資料到新年度，作為可直接編輯的起點，不必每年重新輸入：「基本資料」「圖書藏書」「預算書表」這類固定欄位模組複製既有內容；「族語開班」「族語認證」「獲獎紀錄」「課後社團」「土地現值」「質詢答詢」「特生統計」這類清單式模組，則把目前年度每一筆**未停用**的紀錄複製成新年度的全新紀錄（各自取得新的建立時間與文件 ID，不是搬移舊紀錄），停用中的舊紀錄不會被複製過去。**「歲入歲出」是唯一的例外，不會複製**：新年度的歲入歲出數字改由「匯入新年度預算書」解析當年度實際核定的預算書取得，沿用上一年度的舊數字沒有意義。複製邏輯見 `src/hooks/useYearData.js` 的 `createNextYear`／`copyActiveRecords`。
- **「匯入新年度預算書（自動填入各模組）」**：上傳議會版預算書 PDF／DOCX，解析後把歲入歲出金額匯入新年度的「歲入歲出」模組。**即使沒有先點選上面的「建立下一年度」，直接在這裡上傳檔案也能正常運作**：匯入前會自動確認新年度是否已完整建立，若還沒有（例如管理者直接略過上面那顆按鈕，直接上傳預算書），會先自動執行與「建立下一年度」相同的流程（建立新年度、封存舊年度、複製固定欄位模組），再把解析出的金額寫入歲入歲出模組；若新年度已經存在（已經點過上面的按鈕），則不會重複建立或覆蓋既有資料。這項保護邏輯見 `src/hooks/useYearData.js` 的 `ensureNextYearCreated`。

## 「停用」按鈕在未經編輯的紀錄上顯示為「移除」

清單式模組（歲入歲出、族語開班、族語認證、獲獎紀錄、課後社團、土地現值、質詢答詢、特生統計）的每筆紀錄，原本一律顯示「停用」按鈕。這個按鈕背後一律是軟刪除（設定 `deletedAt`／`deletedBy`，可用「復原」還原，原始資料仍保留在資料庫中），這點沒有改變，也不會改變——系統刻意不提供個別紀錄的真正刪除，讓議會審查用的資料保有完整稽核紀錄。

但「建立下一年度」會把上一年度未停用的紀錄複製成新年度的起點資料（見上一節），這些**剛複製過來、還沒有人確認或編輯過**的紀錄，若管理者發現不適用於新年度想要移除，看到「停用」兩個字容易誤解成「這筆本來是有效、現在要停用它」，但它其實從未在新年度被確認使用過。因此，一筆紀錄只要**建立後到現在都還沒被編輯過**（`createdAt` 等於 `updatedAt`），按鈕文字會改顯示「移除」而不是「停用」；一旦使用者編輯過這筆紀錄（`updatedAt` 更新過），按鈕就會變回「停用」。兩種情況背後的動作完全相同（都是軟刪除、都能復原），只有按鈕文字不同，用來區分「這是我確認過的資料」與「這是系統幫我複製但我還沒處理的起點資料」。邏輯見 `src/lib/recordLifecycle.js` 的 `isUntouchedSinceCreation`／`softDeleteVerb`。

## 歷史歸檔：刪除年度資料

- **僅能刪除目前「編輯中」（尚未封存）的最新年度**：左方選單「歷史歸檔」頁的年度列表中，只有標示「編輯中」的那一列（也就是 `latestYear`）會顯示管理者專屬的「刪除」連結；已標示「已封存」的歷史年度沒有這個連結，無法從畫面上刪除。即使繞過畫面直接呼叫，`src/hooks/useYearData.js` 的 `deleteLatestYear(year)` 本身也會先檢查該年度 `locked === false` 才會動作，而 `firestore.rules` 的 `records/{recordId}` 刪除規則同樣要求 `yearWritable(year)`（年度未封存）——三層都擋在同一條件上，封存後的年度資料庫層級就無法再被刪除。
- **這是真正從資料庫移除，不是本系統其他地方慣用的停用／軟刪除**：系統內其他所有刪除操作（歲入歲出、圖書、獎項等各模組紀錄的「停用」）都只是設定 `deletedAt`／`deletedBy` 欄位，原始資料仍保留在資料庫中可供查核；這個「刪除年度」功能則會把該年度所有模組的全部紀錄、各模組文件與年度文件本身，從 Firestore 中整批永久刪除，**無法復原**。設計這項例外是因為操作錄入年度資料時發生整年度性的錯誤（例如誤用「建立下一年度」複製出一個不該存在的年度），需要能整年度重建，而不是要取代掉既有模組頁面上針對個別紀錄的「停用」操作；若只是少數幾筆資料有誤，請直接到該模組編輯或停用即可。
- **操作方式**：在該年度列點選「刪除」後會跳出確認視窗，說明此操作的影響；需要在輸入框中打出與年度數字完全相符的文字，「確實刪除」按鈕才會生效，避免手滑誤刪。刪除完成後，系統會自動解除前一個年度的封存（`locked: false`），讓使用者可以接著在那個年度繼續編輯；若刪除的已是最早的年度（沒有更早的年度可解除封存），則單純移除該年度。稽核紀錄（`auditLogs`）與匯出紀錄（`exports`）不受影響，仍永久保留，只是在該年度文件被刪除後，需另外透過 Firebase Console 存取，不再能從系統畫面瀏覽到。
- **這項功能需要額外手動部署 `firestore.rules`**：為了讓管理者能在未封存年度執行這個刪除動作，`records/{recordId}` 的刪除規則從原本的 `allow delete: if false;` 放寬為 `allow delete: if isActiveAdmin() && yearWritable(year);`（僅此一處例外，其餘規則維持原樣）。GitHub Actions 的自動部署只會建置並部署網站本身，**不會**部署 Firestore 安全規則，因此這項規則異動需要有權限的人手動執行一次：
  ```bash
  firebase deploy --only firestore:rules
  ```
  部署前可先執行 `npm run test:rules`（本機 Firestore emulator 測試）確認規則行為符合預期。在手動部署完成前，畫面上的「刪除」功能即使點了也會因資料庫規則拒絕而失敗。

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
