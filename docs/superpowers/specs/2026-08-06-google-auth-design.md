# Google 帳號登入設計

## 目標

在既有 Email／密碼登入之外，加入 Google 登入，並保留 Firebase Authentication 的單一使用者身分（UID）與 Firestore `/users/{uid}` 權限模型。新版登入頁部署至既有 Firebase Hosting，不改變資料模組與角色權限規則。

## 方案評估

### A. 只加入 Google 登入按鈕

實作最少，但若相同 Email 已使用密碼註冊，Google 登入可能回報 `account-exists-with-different-credential`，使用者無法在頁面內完成帳號合併。

### B. Google 登入加既有帳號連結（採用）

加入 Google popup 登入；若 Firebase 回報相同 Email 已有密碼帳號，登入頁切換到「輸入原密碼完成連結」狀態。密碼驗證成功後，以 `linkWithCredential` 把 Google provider 連到同一 UID。此方案保留既有 Firestore 權限與操作紀錄。

### C. 改成只有 Google 登入

介面最簡單，但會中斷既有 Email／密碼帳號，不符合保留原登入方式的要求。

## 使用者介面

- 保留現有 Email、密碼欄位與「登入」按鈕。
- 在下方加入分隔線與「使用 Google 帳號登入」按鈕。
- Google popup 進行中時停用兩種登入按鈕，避免重複送出。
- 相同 Email 已存在時，保留／預填該 Email，顯示「請輸入原密碼完成 Google 帳號連結」。
- 連結成功後沿用 Firebase Auth 狀態，自動進入系統，不要求再次登入。
- popup 被使用者關閉時不顯示嚴重錯誤；其他錯誤顯示繁體中文訊息。

## 程式架構

### `AuthContext`

- 新增 `loginWithGoogle()`：使用 `GoogleAuthProvider` 與 `signInWithPopup`。
- 新增 pending-link 狀態，保存 Firebase 回傳的 Google credential 與 Email。
- Email／密碼登入成功後，如有 pending credential，呼叫 `linkWithCredential` 完成連結。
- 對外提供 `pendingGoogleEmail`、`clearError` 與一致的 `submitting` 所需狀態。
- Google 登入後仍以 `/users/{uid}` 讀取應用程式角色；Google Cloud 專案 Owner 不會自動成為應用程式 admin。

### `Login`

- 呼叫 Context 的 Email／密碼與 Google 登入方法。
- Google 按鈕採用 popup，桌面與手機瀏覽器均維持同一登入頁。
- pending-link 時鎖定 Email 為 Firebase 回傳值，要求輸入原密碼。

### Firebase 設定

- 在 `firebase.json` 設定 Google Sign-In、品牌名稱、支援信箱及授權網域。
- 部署 auth 設定後，再 build 並部署 Hosting。
- `ltps-finance-budget.web.app`、`ltps-finance-budget.firebaseapp.com` 與 `localhost` 列為授權網域。

## 授權與帳號資料

- Authentication 只證明登入者身分；應用程式權限仍取自 `/users/{uid}`。
- 若 `mihsia@gmail.com` 尚無應用程式 profile，首次 Google 登入只能取得預設 editor／無模組權限；需再以可信任的管理程序建立 admin profile。
- 不以 Email、前端環境變數或 Google Cloud IAM Owner 身分直接授予 admin，避免權限提升漏洞。

## 錯誤處理

- `auth/popup-closed-by-user`：安靜返回登入頁。
- `auth/popup-blocked`：提示允許瀏覽器彈出視窗。
- `auth/account-exists-with-different-credential`：進入密碼驗證與連結流程。
- `auth/credential-already-in-use`：提示該 Google 帳號已連結其他使用者。
- 原密碼錯誤：維持 pending-link 狀態，讓使用者重試。

## 測試與驗證

- 使用 Vitest 對錯誤映射、pending-link 狀態轉換與 Google credential 連結流程進行單元測試；Firebase SDK 呼叫採邊界 mock。
- TDD 順序：先建立失敗測試，確認因功能缺失而失敗，再加入最小實作使測試通過。
- 執行完整 test、production build 與 `git diff --check`。
- 部署後確認首頁與 JS 資產為 HTTP 200，並在正式站驗證 Google popup 能開啟。

## 不在本次範圍

- 不自動把 Firebase／Google Cloud 專案 Owner 設為系統 admin。
- 不部署目前尚未通過安全稽核的 Firestore／Storage rules 或 Functions。
- 不移除 Email／密碼登入。
