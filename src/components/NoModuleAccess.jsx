import { pageTitle, card } from '../styles';

/**
 * Replaces a module page's entire body when the signed-in account doesn't
 * have that module in its `modules` list — previously such a user still saw
 * the module's data (read-only), which an account with no real need for it
 * should not be able to browse.
 */
export default function NoModuleAccess({ title }) {
  return (
    <div>
      <div style={pageTitle}>{title}</div>
      <div style={{ ...card, maxWidth: 480, textAlign: 'center' }}>
        <div style={{ font: "700 14px 'Noto Sans TC', sans-serif", color: '#1E2420', marginBottom: 8 }}>無權限</div>
        <div style={{ font: "400 13px 'Noto Sans TC', sans-serif", color: '#6B726A', lineHeight: 1.7 }}>
          您沒有「{title}」的使用權限，如有需要請洽系統管理員協助開通。
        </div>
      </div>
    </div>
  );
}
