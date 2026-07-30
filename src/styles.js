// Shared style objects mirroring the approved design prototype's inline styles.
export const card = {
  background: '#FFFFFF',
  border: '1px solid #E3DFD3',
  borderRadius: 10,
  padding: 20,
};

export const statTile = {
  background: '#F5F3EE',
  borderRadius: 10,
  padding: '18px 20px',
};

export const pageTitle = {
  font: "800 20px 'Noto Sans TC', sans-serif",
  color: '#1E2420',
  marginBottom: 4,
};

export const pageSubtitle = {
  font: "400 13px 'Noto Sans TC', sans-serif",
  color: '#8A9089',
  marginBottom: 22,
};

export const sectionLabel = {
  font: "700 13px 'Noto Sans TC', sans-serif",
  color: '#1E2420',
  marginBottom: 10,
};

export const input = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #D8D3C4',
  borderRadius: 8,
  font: "600 14px Inter, sans-serif",
  color: '#1E2420',
  background: '#fff',
};

export const label = {
  font: "600 12.5px 'Noto Sans TC', sans-serif",
  color: '#454B45',
  display: 'block',
  marginBottom: 6,
};

export const btnPrimary = {
  background: '#1F5F52',
  color: '#fff',
  font: "700 13px 'Noto Sans TC', sans-serif",
  padding: '10px 18px',
  borderRadius: 8,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

export const btnSecondary = {
  background: '#F5F3EE',
  color: '#454B45',
  font: "700 13px 'Noto Sans TC', sans-serif",
  padding: '10px 18px',
  borderRadius: 8,
  cursor: 'pointer',
  border: '1px solid transparent',
};

export const btnOutline = {
  background: '#F5F3EE',
  color: '#1F5F52',
  font: "700 13px 'Noto Sans TC', sans-serif",
  padding: '9px 16px',
  borderRadius: 8,
  cursor: 'pointer',
  border: '1px solid #E3DFD3',
  display: 'inline-flex',
};

export const emptyState = {
  background: '#FBFAF7',
  border: '1px dashed #D8D3C4',
  borderRadius: 10,
  padding: 36,
  textAlign: 'center',
  maxWidth: 480,
};

export const deadlineBanner = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  background: '#FDF3E7',
  border: '1px solid #EFD9B3',
  color: '#8A5A1E',
  borderRadius: 8,
  padding: '10px 16px',
  font: "600 12.5px 'Noto Sans TC', sans-serif",
  maxWidth: 640,
  marginBottom: 20,
};

export const lockedBanner = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  background: '#F2F0EA',
  border: '1px solid #E3DFD3',
  color: '#6B726A',
  borderRadius: 8,
  padding: '10px 16px',
  font: "600 12.5px 'Noto Sans TC', sans-serif",
  maxWidth: 640,
  marginBottom: 20,
};

export const tableHeadRow = (cols) => ({
  display: 'grid',
  gridTemplateColumns: cols,
  padding: '12px 18px',
  background: '#F5F3EE',
  font: "700 12px 'Noto Sans TC', sans-serif",
  color: '#6B726A',
});

export const tableRow = (cols) => ({
  display: 'grid',
  gridTemplateColumns: cols,
  padding: '12px 18px',
  borderTop: '1px solid #EEEBE2',
  font: "500 13.5px 'Noto Sans TC', sans-serif",
  color: '#1E2420',
});

export function badge(active, activeColor = '#1F5F52', activeBg = '#E9F1EE', inactiveColor = '#8A9089', inactiveBg = '#EDEAE2') {
  return {
    font: "700 10.5px Inter, sans-serif",
    padding: '3px 8px',
    borderRadius: 5,
    background: active ? activeBg : inactiveBg,
    color: active ? activeColor : inactiveColor,
  };
}

export function chip(active) {
  return {
    padding: '6px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    font: "600 12.5px 'Noto Sans TC', sans-serif",
    color: active ? '#fff' : '#454B45',
    background: active ? '#1F5F52' : '#F5F3EE',
    border: `1px solid ${active ? '#1F5F52' : '#E3DFD3'}`,
  };
}

export function progressBar(pct, color) {
  return {
    track: { height: 7, background: '#F0EEE6', borderRadius: 4 },
    fill: { height: '100%', width: `${pct}%`, background: color, borderRadius: 4 },
  };
}
