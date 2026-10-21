// Content for the 操作手冊 (user manual), shared by the online page
// (src/pages/Manual.jsx) and the downloadable PDF (src/lib/manualExport.js)
// so both always show exactly the same material.
//
// MANUAL_LAST_REVIEWED_VERSION records which APP_VERSION (src/lib/appInfo.js)
// this content was last checked against. Manual.jsx compares it to the live
// APP_VERSION and shows a notice when they've drifted apart, so a stale
// manual is visible rather than silently out of date. Bump this constant
// whenever the content below is reviewed/updated for a new release.
export const MANUAL_LAST_REVIEWED_VERSION = '1.36';

// A block is one of:
//   { type: 'p', text }                              — a paragraph
//   { type: 'steps', items: [text, ...] }             — a numbered how-to
//   { type: 'image', src, alt, caption }              — a screenshot
//   { type: 'note', text }                            — a highlighted aside
export const MANUAL_SECTIONS = [
  {
    id: 'intro',
    title: '系統簡介',
    blocks: [
      { type: 'p', text: '利澤國小基金預算管理系統依「年度」維護學校各項資料（基本資料、歲入歲出、圖書、族語、獎項、社團、土地現值、議會質詢等），並可產出議會審查用的報表（網頁／PDF／Excel）。' },
      { type: 'p', text: '左側選單依功能分成「校務與學生」「教學與活動」「財務與行政」等幾組；你能看到並編輯哪些項目，依你的帳號被指派的「負責模組」而定，管理者則可存取所有項目。' },
      { type: 'p', text: '每個年度的資料各自獨立存放，右上角可隨時切換要查看的年度。' },
    ],
  },
  {
    id: 'login',
    title: '登入系統',
    blocks: [
      { type: 'p', text: '系統帳號一律使用 Google 帳號登入，不再提供密碼設定信。' },
      {
        type: 'steps',
        items: [
          '開啟系統網址',
          '點選「使用 Google 帳號登入」',
          '選擇你的 Google 帳號，完成登入',
        ],
      },
      { type: 'note', text: '若尚未擁有帳號，請洽系統管理員在「帳號管理」頁新增帳號後才能登入；未登錄的帳號（含未登錄的 Google 帳號）將無法進入系統。' },
      { type: 'p', text: '畫面下方「仍使用舊版帳號密碼登入」僅保留給少數過渡期帳號使用，一般情況請一律使用 Google 登入。' },
      { type: 'image', src: '/manual/manual-login.png', alt: '登入畫面，中央為使用 Google 帳號登入按鈕', caption: '登入頁面' },
    ],
  },
  {
    id: 'nav',
    title: '介面導覽',
    blocks: [
      { type: 'p', text: '左側選單依功能分成「校務與學生」「教學與活動」「財務與行政」「報表與管理」等幾組，點選項目即可切換頁面。' },
      { type: 'p', text: '選單最下方顯示目前系統版本與更新日期，點選可直接跳到「更新日誌」。' },
      { type: 'p', text: '右上角可切換要查看的年度（預設顯示最近 3 個年度；更久以前的資料請從「歷史歸檔」查看）。右上角頭像旁顯示你的姓名與權限身分（管理者／填報人員），點選「登出」可結束使用。' },
      { type: 'image', src: '/manual/manual-basic.png', alt: '系統主畫面，左側為選單，右側為基本資料頁內容', caption: '系統主畫面（以「基本資料」頁為例）' },
    ],
  },
  {
    id: 'crud',
    title: '新增與編輯資料',
    blocks: [
      { type: 'p', text: '系統內的資料頁面主要分兩種形式：' },
      {
        type: 'steps',
        items: [
          '整頁式資料（如基本資料）：畫面顯示目前資料，點選「編輯資料」即可修改各欄位，完成後儲存。',
          '清單式資料（如歲入歲出、獲獎紀錄、課後社團等）：畫面顯示多筆紀錄列表，可點選「新增」新增一筆，或在列表中對既有紀錄點選「編輯」「停用」。',
        ],
      },
      { type: 'note', text: '若系統設有「填報截止日」（全系統統一一個日期，不分模組），頁面上方會顯示提示；超過截止日後所有模組都將無法再新增、編輯或刪除資料，僅能檢視。登入後頁首（系統名稱旁）會顯示目前的截止日與剩餘天數，不論在哪個頁面都看得到，不必逐一點進各模組頁面才看得到。' },
      { type: 'note', text: '若你的帳號未被指派某模組的權限，開啟該頁面時會顯示「無權限，請洽系統管理員」，不會顯示任何資料內容。' },
      { type: 'image', src: '/manual/manual-budget.png', alt: '歲入歲出頁面，顯示年度金額列表與新增、編輯、停用按鈕', caption: '清單式資料頁面（以「歲入歲出」為例）' },
    ],
  },
  {
    id: 'report',
    title: '議會報表匯出',
    blocks: [
      { type: 'p', text: '「報表匯出」頁彙整所有模組的資料，分為「財務概況」「各模組現況」「匯出與紀錄」三個區塊，並包含歲出三年趨勢、歲入來源、獲獎統計、特生統計、社團參與比例等圖表。' },
      { type: 'p', text: '「各模組現況」上方可勾選要涵蓋哪些模組的資料，再進行匯出。' },
      {
        type: 'steps',
        items: [
          '勾選要涵蓋的模組',
          '點選「匯出 PDF（全貌總覽）」或「匯出 Excel（全貌總覽）」',
          '在跳出的預覽視窗中確認內容無誤',
          '點選「確認下載」才會真正下載檔案（點選「取消」則不會下載）',
        ],
      },
      { type: 'note', text: '「對齊議會既有格式（.xls 範本）」是另一份單獨對齊議會原有審查格式的 Excel 檔案，與「全貌總覽」的 PDF／Excel 是不同的匯出內容。' },
      { type: 'p', text: '「全貌總覽」PDF 的正文（財務概況、校務資料、各模組現況）先呈現一段文字說明再放圖表，不逐筆列出明細；所有逐筆明細表（業務計畫別明細、歲入明細、各模組逐筆資料）改放到 PDF 最後新開一頁的「附件：詳細資料」，資料完全沒有減少，只是正文更容易一眼看懂重點（此調整僅套用於 PDF，Excel 匯出格式不變）。' },
      { type: 'note', text: '文字說明由系統依目前資料自動產生草稿，顯示在「報表匯出」頁的「文字說明（PDF 用）」區塊；管理者可點選「編輯」調整用詞，儲存後會保留到你再次按「還原為自動產生」為止，一般使用者僅能檢視目前的文字。' },
      { type: 'p', text: '每次下載都會記錄在頁面下方的「匯出紀錄」，列出檔名、時間與匯出人，方便日後查核。' },
      { type: 'image', src: '/manual/manual-report.png', alt: '議會報表匯出頁，顯示財務概況圖表、各模組現況卡片與匯出按鈕', caption: '議會報表匯出頁' },
      { type: 'image', src: '/manual/manual-report-pdf-preview.png', alt: 'PDF 預覽視窗，下方為確認下載與取消按鈕', caption: '下載前的預覽視窗' },
    ],
  },
  {
    id: 'settings',
    title: '帳號管理',
    adminOnly: true,
    blocks: [
      { type: 'note', text: '本節僅系統管理者可見與操作；一般填報人員的「帳號管理」頁將顯示「無權限」。' },
      { type: 'p', text: '管理者可在「帳號管理」頁新增、編輯、停用系統帳號，並指派每個帳號的「負責模組」與權限（管理者／填報人員）。' },
      { type: 'p', text: '新增帳號只需輸入姓名、Email（可用下拉選單選擇網域）、處室、權限與負責模組，帳號一律以 Google 登入，不需另外設定密碼。' },
      { type: 'p', text: '也可點選「下載帳號範例檔」取得 Excel 範本，填妥後以「匯入帳號（.xlsx）」批次新增多筆帳號；匯入時每一列各自驗證，單列失敗不影響其他列，並會列出逐列成功／失敗結果。' },
      { type: 'image', src: '/manual/manual-settings.png', alt: '帳號管理頁，依處室分組顯示帳號、負責模組與狀態', caption: '帳號管理頁（管理者視角）' },
    ],
  },
  {
    id: 'pwa',
    title: '安裝為手機／電腦應用程式',
    blocks: [
      { type: 'p', text: '系統支援安裝為手機或電腦上的獨立應用程式（PWA），安裝後可從主畫面／桌面直接開啟，不必每次重新輸入網址，網路不穩時也能維持基本瀏覽。' },
      {
        type: 'steps',
        items: [
          'iPhone（Safari）：開啟系統網址 → 點選下方分享圖示 → 選擇「加入主畫面」',
          'Android（Chrome）：開啟系統網址 → 點選右上角選單 → 選擇「安裝應用程式」或「加到主畫面」',
          '電腦（Chrome／Edge）：開啟系統網址 → 點選網址列右側的安裝圖示 → 選擇「安裝」',
        ],
      },
      { type: 'note', text: '系統有新版本時，畫面上會出現「有新版本可用」提示，點選「重新整理」即可更新，不會在你編輯資料時自動更新打斷操作。' },
    ],
  },
  {
    id: 'changelog',
    title: '版本與更新日誌',
    blocks: [
      { type: 'p', text: '左側選單最下方可隨時查看目前系統版本；點選「更新日誌」可查看每次系統修正或新增功能的完整紀錄，由新到舊排列，所有使用者皆可檢視，不受模組權限限制。' },
      { type: 'note', text: '本手冊內容對應的系統版本標示於頁首；若手冊內容與實際畫面有落差，請以系統畫面與「更新日誌」最新紀錄為準，並可通知系統管理員更新手冊。' },
      { type: 'image', src: '/manual/manual-changelog.png', alt: '更新日誌頁，由新到舊列出每個版本的修改內容', caption: '更新日誌頁' },
    ],
  },
];
