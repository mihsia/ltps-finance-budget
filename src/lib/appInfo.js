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
  {
    version: '1.9',
    date: '2026-10-20',
    notes: '族語開班模組拆分為「族語開班」（開班資料）與「族語認證」（認證統計、通過名冊）兩個獨立模組，並同步更新帳號可用模組設定；語系欄位改為下拉選單（閩南語、客語及原住民族16族語言），認證級別改採官方「原住民族語言能力認證」五級制（初級／中級／中高級／高級／優級）；登入畫面版面微調；版本更新說明改以左側版號色塊＋右側說明呈現，並依版次交錯底色以利閱讀。',
  },
  {
    version: '1.10',
    date: '2026-10-20',
    notes: '修正帳號管理頁指派「族語認證」模組時顯示「負責模組不存在」的錯誤（伺服器端模組白名單未同步更新）；左方選單「版本更新說明」改名為「更新日誌」（四字），與其他模組標籤長度對齊。',
  },
  {
    version: '1.11',
    date: '2026-10-20',
    notes: 'Cloud Functions 執行環境由即將於 2026-10-30 停用的 Node.js 20 升級為 Node.js 22，避免屆時無法部署；帳號白名單登入限制（Google 登入 Blocking Functions）正式部署並生效。',
  },
  {
    version: '1.12',
    date: '2026-10-20',
    notes: '修正帳號管理頁權限漏洞：先前沒有「帳號管理」模組權限的帳號仍能打開此頁並看到所有人的帳號資料，現已補上與其他模組一致的權限檢查，並同步收緊 Firestore 安全規則，從資料庫層級擋下未授權的讀取。',
  },
  {
    version: '1.13',
    date: '2026-10-20',
    notes: '左方選單最下方新增系統版本與更新日期（點選可跳至更新日誌），登入後也能隨時確認版本；右上角年度切換改為只顯示最近 3 個年度，避免清單無限變長，超過 3 年的舊資料請從「歷史歸檔」進入查看。',
  },
  {
    version: '1.14',
    date: '2026-10-20',
    notes: '左方選單「資料模組」改依功能拆分為「校務與學生」「教學與活動」「財務與行政」三組，項目較長不易掃視的問題獲得改善；版本資訊改為兩行顯示，避免選單變寬；完成手機、平板、電腦三種尺寸的版面檢視，確認 RWD 與 PWA（可安裝、離線快取、新版本提示）運作正常。',
  },
  {
    version: '1.15',
    date: '2026-10-20',
    notes: '族語認證頁的「認證統計」改為「師資名冊」：不再直接輸入彙總數字，改為逐筆登錄教師姓名與是否已通過認證，與既有的學生通過名冊一致；頁面統計數字一律從名冊筆數即時算出，避免輸入不一致造成誤會。',
  },
];

export const APP_VERSION = CHANGELOG[CHANGELOG.length - 1].version;
export const APP_UPDATED_AT = CHANGELOG[CHANGELOG.length - 1].date;
