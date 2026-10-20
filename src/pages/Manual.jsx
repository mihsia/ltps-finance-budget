import { useState } from 'react';
import { MANUAL_SECTIONS, MANUAL_LAST_REVIEWED_VERSION } from '../lib/manualContent';
import { buildManualPdf } from '../lib/manualExport';
import { APP_VERSION, APP_UPDATED_AT } from '../lib/appInfo';
import {
  pageTitle, pageSubtitle, card, sectionLabel, btnPrimary, deadlineBanner, badge,
} from '../styles';

const noteStyle = {
  ...deadlineBanner,
  display: 'block',
  marginBottom: 12,
  font: "500 12.5px/1.8 'Noto Sans TC', sans-serif",
};

function Block({ block }) {
  if (block.type === 'p') {
    return <p style={{ font: "400 13.5px/1.9 'Noto Sans TC', sans-serif", color: '#454B45', margin: '0 0 12px' }}>{block.text}</p>;
  }
  if (block.type === 'steps') {
    return (
      <ol style={{ margin: '0 0 12px', paddingLeft: 20, font: "400 13.5px/1.9 'Noto Sans TC', sans-serif", color: '#454B45' }}>
        {block.items.map((item) => <li key={item} style={{ marginBottom: 4 }}>{item}</li>)}
      </ol>
    );
  }
  if (block.type === 'note') {
    return <div style={noteStyle}>💡 {block.text}</div>;
  }
  if (block.type === 'image') {
    return (
      <figure style={{ margin: '0 0 18px' }}>
        <img
          src={block.src}
          alt={block.alt}
          style={{ width: '100%', maxWidth: 760, borderRadius: 8, border: '1px solid #E3DFD3', display: 'block' }}
          loading="lazy"
        />
        {block.caption && (
          <figcaption style={{ font: "400 11.5px 'Noto Sans TC', sans-serif", color: '#8A9089', marginTop: 6 }}>
            {block.caption}
          </figcaption>
        )}
      </figure>
    );
  }
  return null;
}

// No canEditModule check here on purpose — like 更新日誌, this is reference
// material visible to every signed-in user regardless of module permissions.
// Admin-only content (帳號管理) stays in the same manual but is flagged with
// a badge/note instead of being hidden, so any user can see what a module
// does and who to ask for it.
export default function Manual() {
  const [generating, setGenerating] = useState(false);
  const isStale = MANUAL_LAST_REVIEWED_VERSION !== APP_VERSION;

  const downloadPdf = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const doc = await buildManualPdf();
      doc.save(`利澤國小基金預算管理系統操作手冊_v${APP_VERSION}.pdf`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <div style={pageTitle}>操作手冊</div>
      <div style={pageSubtitle}>適用系統版本 v{APP_VERSION} · {APP_UPDATED_AT}</div>

      {isStale && (
        <div style={noteStyle}>
          ⚠ 本手冊內容最後確認對應版本為 v{MANUAL_LAST_REVIEWED_VERSION}，系統目前已更新至 v{APP_VERSION}，部分新功能可能尚未收錄，請一併參考左側選單的「更新日誌」。
        </div>
      )}

      <div style={{ marginBottom: 22 }}>
        <div
          style={{ ...btnPrimary, opacity: generating ? 0.6 : 1, cursor: generating ? 'default' : 'pointer' }}
          onClick={downloadPdf}
        >
          {generating ? '產生中…' : '⬇ 下載 PDF 手冊'}
        </div>
      </div>

      <div style={{ ...card, marginBottom: 28, maxWidth: 520 }}>
        <div style={sectionLabel}>目錄</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {MANUAL_SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#manual-${section.id}`}
              style={{ font: "600 13px 'Noto Sans TC', sans-serif", color: '#1F5F52', textDecoration: 'none' }}
            >
              {section.title}
              {section.adminOnly && <span style={{ marginLeft: 8, ...badge(true, '#8C4A5B', '#F6E9ED') }}>管理者專屬</span>}
            </a>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 780 }}>
        {MANUAL_SECTIONS.map((section) => (
          <div key={section.id} id={`manual-${section.id}`} style={{ marginBottom: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ font: "800 16px 'Noto Sans TC', sans-serif", color: '#1E2420' }}>{section.title}</div>
              {section.adminOnly && <span style={badge(true, '#8C4A5B', '#F6E9ED')}>管理者專屬</span>}
            </div>
            {section.blocks.map((block, i) => <Block key={i} block={block} />)}
          </div>
        ))}
      </div>
    </div>
  );
}
