// Left-sidebar navigation structure. One color per item for quick visual ID
// (colors and icon path data preserved verbatim from the approved design prototype).
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
};

export const navGroups = [
  { label: '總覽', items: [
    { key: 'dashboard', label: '總覽儀表', icon: 'grid', color: '#1F5F52' },
  ] },
  { label: '資料模組', items: [
    { key: 'basic', label: '基本資料', icon: 'school', color: '#C9832F' },
    { key: 'budget', label: '歲入歲出', icon: 'coin', color: '#B5533E' },
    { key: 'library', label: '圖書藏書', icon: 'book', color: '#7D5BA6' },
    { key: 'language', label: '族語開班', icon: 'chat', color: '#2E7DAF' },
    { key: 'awards', label: '獲獎紀錄', icon: 'award', color: '#A1497E' },
    { key: 'club', label: '課後社團', icon: 'star', color: '#4F8C3E' },
    { key: 'land', label: '土地現值', icon: 'map', color: '#8C8C3E' },
    { key: 'inquiry', label: '質詢答詢', icon: 'gavel', color: '#B1456B' },
  ] },
  { label: '報表與管理', items: [
    { key: 'budgetbook', label: '預算書表', icon: 'file', color: '#4C5FAB' },
    { key: 'report', label: '報表匯出', icon: 'download', color: '#3E8E7E' },
    { key: 'archive', label: '歷史歸檔', icon: 'archive', color: '#556B8D' },
    { key: 'settings', label: '帳號管理', icon: 'user', color: '#8C4A5B' },
  ] },
];

export const genericModuleKeys = ['awards', 'club', 'land', 'inquiry'];

export const genericModuleMeta = {
  awards: { title: '獲獎紀錄', desc: '記錄學生與學校各項競賽獲獎資訊', columns: ['獲獎項目', '等級', '日期'] },
  club: { title: '課後社團', desc: '課後社團開設班別與人數', columns: ['社團名稱', '指導老師', '人數', '上課時間'] },
  land: { title: '土地公告現值', desc: '學校用地地號與公告現值資訊', columns: ['地號', '面積(㎡)', '公告現值(元/㎡)'] },
  inquiry: { title: '議會質詢／答詢紀錄', desc: '議員質詢與學校答詢內容存檔', columns: ['日期', '議員/題目', '答詢狀態'] },
};
