// Left-sidebar navigation structure. Each item carries a `soft`/`ink` pair
// (same fill-colour recipe as src/lib/overviewReport.js's
// OPTIONAL_MODULE_TILE_COLORS, used by the 議會報表 page) instead of one
// flat `color`: `soft` is a resting-state icon-chip fill, `ink` is both the
// dark text/icon on that chip and the active-state chip's own fill (with a
// white icon on top) — see src/components/Sidebar.jsx. This keeps every
// item's own colour (the "多彩" the user asked to keep) while making the
// *active* item the one that actually stands out, instead of every item
// being equally saturated all the time (2026-10-27 系統界面設計定案).
export const icons = {
  grid: 'M1 1H7V7H1ZM9 1H15V7H9ZM1 9H7V15H1ZM9 9H15V15H9Z',
  school: 'M8 1L15 4.5L8 8L1 4.5ZM3.5 6.8L8 9L12.5 6.8V10.3C12.5 11.3 10.5 12.6 8 12.6C5.5 12.6 3.5 11.3 3.5 10.3Z',
  coin: 'M8 1.5C4.4 1.5 1.5 4.4 1.5 8C1.5 11.6 4.4 14.5 8 14.5C11.6 14.5 14.5 11.6 14.5 8C14.5 4.4 11.6 1.5 8 1.5ZM8 3.3C10.6 3.3 12.7 5.4 12.7 8C12.7 10.6 10.6 12.7 8 12.7C5.4 12.7 3.3 10.6 3.3 8C3.3 5.4 5.4 3.3 8 3.3ZM7.3 4.8H8.7V6H7.3ZM7.3 10H8.7V11.2H7.3Z',
  book: 'M1.5 2C1.5 2 3 1.3 4.5 1.7C6 2.1 7.3 3 7.3 3V12.5C7.3 12.5 6 11.6 4.5 11.2C3 10.8 1.5 11.5 1.5 11.5ZM14.5 2C14.5 2 13 1.3 11.5 1.7C10 2.1 8.7 3 8.7 3V12.5C8.7 12.5 10 11.6 11.5 11.2C13 10.8 14.5 11.5 14.5 11.5Z',
  chat: 'M1.5 3.5C1.5 2.4 2.4 1.5 3.5 1.5H12.5C13.6 1.5 14.5 2.4 14.5 3.5V8.5C14.5 9.6 13.6 10.5 12.5 10.5H6L3 13V10.5H3.5C2.4 10.5 1.5 9.6 1.5 8.5Z',
  award: 'M8 1.5C10.2 1.5 12 3.3 12 5.5C12 7.1 11.1 8.4 9.8 9V8.9L11 14.5L8 12.6L5 14.5L6.2 8.9V9C4.9 8.4 4 7.1 4 5.5C4 3.3 5.8 1.5 8 1.5ZM8 3.3C6.8 3.3 5.8 4.3 5.8 5.5C5.8 6.7 6.8 7.7 8 7.7C9.2 7.7 10.2 6.7 10.2 5.5C10.2 4.3 9.2 3.3 8 3.3Z',
  star: 'M8 1.3L9.8 5.5L14.3 5.9L10.9 8.9L11.9 13.4L8 11L4.1 13.4L5.1 8.9L1.7 5.9L6.2 5.5Z',
  map: 'M1.5 3L5.5 1.5L10.5 3L14.5 1.5V13L10.5 14.5L5.5 13L1.5 14.5ZM5.5 1.9V12.8M10.5 3V14.4',
  gavel: 'M5.3 3.6L8.9 7.2L7.5 8.6L3.9 5ZM8.9 7.2L10.6 5.5L14.2 9.1L12.5 10.8ZM2 12.5H8V14H2Z',
  file: 'M3 1.5H9.5L13 5V14.5H3ZM9.3 1.7V5.2H12.8M5 8.2H11V9.2H5ZM5 10.5H11V11.5H5ZM5 12.8H8.5V13.8H5',
  download: 'M7.2 2H8.8V8.6L11 6.4L12.1 7.5L8 11.6L3.9 7.5L5 6.4L7.2 8.6ZM2.5 12.5H13.5V14H2.5Z',
  archive: 'M1.5 2H14.5V5H1.5ZM2.5 5.6H13.5V13C13.5 13.6 13 14 12.5 14H3.5C3 14 2.5 13.6 2.5 13ZM6.2 7.8H9.8V9H6.2',
  user: 'M8 1.8C9.8 1.8 11.2 3.2 11.2 5C11.2 6.8 9.8 8.2 8 8.2C6.2 8.2 4.8 6.8 4.8 5C4.8 3.2 6.2 1.8 8 1.8ZM2 14.4C2.4 11 4.9 8.8 8 8.8C11.1 8.8 13.6 11 14 14.4Z',
  heart: 'M8 14L1.5 8.2C0 6.8 0 4.4 1.8 3.1C3.3 2 5.4 2.3 6.6 3.7L8 5.3L9.4 3.7C10.6 2.3 12.7 2 14.2 3.1C16 4.4 16 6.8 14.5 8.2L8 14Z',
  info: 'M8 1.5C4.4 1.5 1.5 4.4 1.5 8C1.5 11.6 4.4 14.5 8 14.5C11.6 14.5 14.5 11.6 14.5 8C14.5 4.4 11.6 1.5 8 1.5ZM8 3.3C10.6 3.3 12.7 5.4 12.7 8C12.7 10.6 10.6 12.7 8 12.7C5.4 12.7 3.3 10.6 3.3 8C3.3 5.4 5.4 3.3 8 3.3ZM7.2 5H8.8V6.4H7.2ZM7.2 7.6H8.8V11H7.2Z',
  help: 'M8 1.5C4.4 1.5 1.5 4.4 1.5 8C1.5 11.6 4.4 14.5 8 14.5C11.6 14.5 14.5 11.6 14.5 8C14.5 4.4 11.6 1.5 8 1.5ZM5.8 5.9C5.8 4.5 6.7 3.6 8.1 3.6C9.4 3.6 10.3 4.5 10.3 5.6C10.3 6.5 9.8 7 9.1 7.5C8.4 7.9 8.1 8.2 8.1 8.9V9.2H6.9V8.8C6.9 7.8 7.4 7.3 8.1 6.8C8.7 6.4 9 6.1 9 5.6C9 5 8.6 4.6 8 4.6C7.3 4.6 6.9 5.1 6.9 5.9ZM7.3 10.3H8.8V11.7H7.3Z',
  certificate: 'M8 1.5C10.2 1.5 12 3.3 12 5.5C12 7.1 11.1 8.4 9.8 9V8.9L11 14.5L8 12.6L5 14.5L6.2 8.9V9C4.9 8.4 4 7.1 4 5.5C4 3.3 5.8 1.5 8 1.5ZM8 3.3C6.8 3.3 5.8 4.3 5.8 5.5C5.8 6.7 6.8 7.7 8 7.7C9.2 7.7 10.2 6.7 10.2 5.5C10.2 4.3 9.2 3.3 8 3.3Z',
  clock: 'M8 1.5C4.4 1.5 1.5 4.4 1.5 8C1.5 11.6 4.4 14.5 8 14.5C11.6 14.5 14.5 11.6 14.5 8C14.5 4.4 11.6 1.5 8 1.5ZM8 3.3C10.6 3.3 12.7 5.4 12.7 8C12.7 10.6 10.6 12.7 8 12.7C5.4 12.7 3.3 10.6 3.3 8C3.3 5.4 5.4 3.3 8 3.3ZM7.3 4.5H8.7V8.3L11 9.8L10.3 11L7.3 9.1Z',
};

export const navGroups = [
  { label: '總覽', items: [
    { key: 'dashboard', label: '總覽儀表', icon: 'grid', soft: '#E9F1EE', ink: '#0F3A30', desc: '跨年度總覽儀表板，顯示各項關鍵指標' },
  ] },
  { label: '校務與學生', items: [
    { key: 'basic', label: '基本資料', icon: 'school', soft: '#FFF3DC', ink: '#7A5A0A', desc: '班級數、學生人數、教師人力等學校基本統計資料' },
    { key: 'specialNeeds', label: '特生統計', icon: 'heart', soft: '#F3E9DE', ink: '#6B4423', desc: '原住民、新住民、低收入戶、身障生、單親生等統計人數' },
  ] },
  { label: '教學與活動', items: [
    { key: 'library', label: '圖書藏書', icon: 'book', soft: '#F1E9F8', ink: '#4A2E66', desc: '圖書館藏書量統計' },
    { key: 'language', label: '族語開班', icon: 'chat', soft: '#E6F1F8', ink: '#0F4C66', desc: '本土語言（閩南語、客語）及原住民族語開班班級數與學生人數' },
    { key: 'languageCert', label: '族語認證', icon: 'certificate', soft: '#E3F2F1', ink: '#1C5C5A', desc: '師資與學生族語能力認證統計、通過名冊登錄' },
    { key: 'club', label: '課後社團', icon: 'star', soft: '#EAF5E6', ink: '#2C5420', desc: '課後社團開設班別與人數' },
    { key: 'careSupport', label: '課照學扶', icon: 'clock', soft: '#FBEAE2', ink: '#7A3A1E', desc: '課後照顧、學習扶助等開班情況與人數' },
    { key: 'awards', label: '獲獎紀錄', icon: 'award', soft: '#FBE9F2', ink: '#6B1D44', desc: '記錄學生與學校各項競賽獲獎資訊' },
  ] },
  { label: '財務與行政', items: [
    { key: 'budget', label: '歲入歲出', icon: 'coin', soft: '#FDEAE6', ink: '#8A2E1E', desc: '年度歲入歲出預算與決算金額、差異原因說明' },
    { key: 'land', label: '校地概況', icon: 'map', soft: '#F5F0DC', ink: '#5C5420', desc: '校地總面積（公頃）與各地號公告現值資訊' },
    { key: 'inquiry', label: '質詢答詢', icon: 'gavel', soft: '#FDE8EE', ink: '#85204A', desc: '議員質詢與學校答詢內容存檔' },
  ] },
  { label: '報表與管理', items: [
    { key: 'budgetbook', label: '預算書表', icon: 'file', soft: '#E9EAF8', ink: '#363F80', desc: '基金來源與用途明細表，含預算書 PDF 上傳' },
    { key: 'report', label: '報表匯出', icon: 'download', soft: '#E3F0EC', ink: '#1C5C4E', desc: '產出並匯出議會報表（PDF／Excel）' },
    { key: 'archive', label: '歷史歸檔', icon: 'archive', soft: '#E9EDF3', ink: '#30455E', desc: '查閱歷年資料歸檔' },
    { key: 'settings', label: '帳號管理', icon: 'user', soft: '#F7E9EC', ink: '#5C2430', desc: '新增、編輯、停用系統帳號與權限' },
    { key: 'manual', label: '操作手冊', icon: 'help', soft: '#E0F3F3', ink: '#0A5C5C', desc: '系統操作說明與畫面截圖，含線上版與可下載的 PDF，所有使用者皆可檢視' },
    { key: 'changelog', label: '更新日誌', icon: 'info', soft: '#F0EEE6', ink: '#6B6F76', desc: '系統每次修正或新增功能的紀錄，所有使用者皆可檢視' },
  ] },
];

export const genericModuleKeys = ['awards', 'club', 'careSupport', 'land', 'inquiry', 'specialNeeds'];

export const genericModuleMeta = {
  awards: { title: '獲獎紀錄', desc: '記錄學生與學校各項競賽獲獎資訊', columns: ['類別', '獲獎項目', '等級', '日期'] },
  club: { title: '課後社團', desc: '課後社團開設班別與人數', columns: ['社團名稱', '指導老師', '人數', '上課時間'] },
  careSupport: { title: '課照學扶', desc: '課後照顧、學習扶助等開班情況與人數', columns: ['班別類別', '班別名稱', '任課老師', '學生人數', '開課時段', '上課地點'] },
  land: { title: '校地概況', desc: '校地總面積（公頃，依教育部校務資訊公告數字固定）與各地號公告現值資訊', columns: ['地號', '面積(㎡)', '公告現值(元/㎡)'] },
  inquiry: { title: '議會質詢／答詢紀錄', desc: '議員質詢與學校答詢內容存檔', columns: ['日期', '議員', '題目', '答案', '答詢狀態'] },
  specialNeeds: { title: '特生統計', desc: '原住民、新住民、低收入戶、身障生、單親生等統計人數', columns: ['類別', '人數', '說明'] },
};
