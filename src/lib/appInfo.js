// Release notes shown on the login screen and in the sidebar's 版本更新說明
// page. Version numbers count up from the system's first release (v1.0) and
// increase by one with every shipped fix or feature — never reused, never
// renumbered. Add one entry per release; APP_VERSION/APP_UPDATED_AT always
// reflect the most recent entry, so there is a single source of truth.
export const CHANGELOG = [
  {
    version: '1.0',
    date: '2026-09-11',
    notes: '系統首次上線：建立利澤國小基金預算管理系統，含歲入歲出、基本資料、圖書藏書、族語開班、獲獎紀錄、課後社團、土地現值、質詢答詢等模組，支援 PWA 安裝、Google 帳號登入、議會報表（PDF／Excel）匯出。',
  },
  {
    version: '1.1',
    date: '2026-10-16',
    notes: '帳號管理：限制僅已登錄帳號可登入系統（含 Google 登入），新增批次匯入帳號（.xlsx）功能與範例檔下載。',
  },
  {
    version: '1.2',
    date: '2026-10-19',
    notes: '帳號管理：新增帳號一律僅限 Google 帳號登入（不再寄送密碼設定信），Email 欄位改為網域下拉選單，模組選擇旁新增功能說明。',
  },
  {
    version: '1.3',
    date: '2026-10-19',
    notes: '帳號管理頁面重新設計：負責模組改以標籤呈現、新增帳號改為彈出視窗、模組說明改為點選後顯示。',
  },
  {
    version: '1.4',
    date: '2026-10-20',
    notes: '獲獎紀錄：新增獨立匯出／匯入 Excel、獲獎項目與等級下拉選單；議會報表新增獲獎項目統計圖表。',
  },
  {
    version: '1.5',
    date: '2026-10-20',
    notes: '獲獎紀錄：新增賽事類型（個人賽／團體賽）與得獎學生姓名欄位，獲獎項目改以宜蘭縣層級賽事為主；議會報表新增特生統計佔全體學生比例圖表。',
  },
  {
    version: '1.6',
    date: '2026-10-20',
    notes: '課後社團：上課時間改為下拉選單，新增每生費用與上課場地欄位；議會報表新增社團參與比例。',
  },
  {
    version: '1.7',
    date: '2026-10-20',
    notes: '課後社團上課時間改為星期＋起訖時間；預算書表新增手動輸入說明與可直接編輯業務計畫別金額；所有模組頁面新增填報截止日提示與無權限畫面；帳號管理模組標籤顯示優化；登入頁新增系統版本資訊；使用者頭像改用 Google 大頭貼。',
  },
  {
    version: '1.8',
    date: '2026-10-20',
    notes: '新增左方選單「版本更新說明」頁面，記錄每次系統修正內容，不受模組權限限制，所有使用者皆可檢視；登入畫面改以 Google 帳號登入為主要方式，帳號密碼登入收合為次要選項，避免使用者誤用造成登入錯誤。',
  },
];

export const APP_VERSION = CHANGELOG[CHANGELOG.length - 1].version;
export const APP_UPDATED_AT = CHANGELOG[CHANGELOG.length - 1].date;
