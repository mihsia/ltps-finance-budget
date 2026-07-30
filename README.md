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
6. 部署安全規則與 Functions：
   ```bash
   firebase deploy --only firestore:rules,storage:rules,functions
   ```
7. 初始化第一批資料（113–115 年度真實預算數字＋範例資料）與管理者帳號：
   ```bash
   cd scripts
   # 從 Firebase Console > 專案設定 > 服務帳戶 下載金鑰，存為 scripts/serviceAccountKey.json
   cd ..
   SEED_ADMIN_EMAIL=you@school.edu.tw npm run seed
   ```
   `seed` 腳本會印出一個密碼設定連結，交給管理者本人設定密碼後即可登入。

### GitHub Actions 自動部署

於 repo 的 Settings > Secrets 新增：`VITE_FIREBASE_*`（同 `.env`）、`FIREBASE_PROJECT_ID`、`FIREBASE_SERVICE_ACCOUNT`（服務帳戶 JSON 全文）。push 到 `main` 即會自動 build 並部署到 Firebase Hosting。

## 資料模型（Firestore）

```
/years/{year}                          -- "113" | "114" | "115" ...；locked、deadlines
/years/{year}/modules/basic            -- 班級數／學生人數／教師人力，含 status: draft|submitted
/years/{year}/modules/budget           -- expense.breakdown[]、revenue.rows[]
/years/{year}/modules/library          -- generalBooks、indigenousBooks
/years/{year}/modules/language         -- classes[]、cert[]、certRecords[]
/years/{year}/modules/awards|club|land|inquiry  -- rows: string[][]
/years/{year}/modules/budgetbook        -- fundName、reviewAuthority、pdfUrl
/years/{year}/changeLogs/{id}          -- { module, user, field, from, to, time }
/years/{year}/exports/{id}             -- { name, user, time }
/users/{uid}                            -- { name, email, dept, role, modules[] }
```

## 已知的真實數字 vs. 佔位資料

115 年度歲入歲出（歲入合計 53,642／歲出合計 54,358／短絀 716）與 113–115 三年度歲出總額，取自校方實際 115 年度預算書，已寫入 `scripts/seed.js`。圖書、族語、獲獎、社團、土地現值、質詢答詢等模組資料為**示意用佔位資料**，正式啟用前請由各處室以系統表單填入實際數字。

## 帳號與權限

- **管理者**：可存取所有模組、建立新年度、匯入預算書、新增帳號。
- **填報人員**：僅能編輯 `/users/{uid}.modules` 中列出的模組，且限於未鎖定年度。
- 新增帳號透過 `functions/index.js` 的 `createAccount` Cloud Function 建立 Auth 帳號＋Firestore 個人資料，並回傳密碼設定連結（本專案未串接寄信服務，需由管理者手動轉交連結）。

## 尚待接續的功能

- 對齊議會既有 `.xls` 範本欄位順序（需取得總務處提供的範本檔案）。
- PDF 匯入解析（`src/lib/importParser.js`）目前以已知標籤做 regex 比對，若校方文件排版差異較大需調整樣式。
