import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * Surfaces a new service-worker version as a dismissible-only-by-action
 * toast instead of reloading automatically (registerType: 'prompt' in
 * vite.config.js) — this app has multi-user, per-year-locked forms, so a
 * background reload mid-edit would be actively harmful.
 */
export default function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateSW, setUpdateSW] = useState(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const update = registerSW({ onNeedRefresh: () => setNeedRefresh(true) });
    setUpdateSW(() => update);
  }, []);

  if (!needRefresh) return null;

  return (
    <div
      style={{
        position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        zIndex: 200, background: '#1E2420', color: '#fff', borderRadius: 8,
        padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
        font: "600 12.5px 'Noto Sans TC', sans-serif", boxShadow: '0 4px 16px rgba(0,0,0,.25)',
        maxWidth: 'min(360px, calc(100vw - 32px))',
      }}
    >
      有新版本可用
      <button
        type="button"
        onClick={() => updateSW?.(true)}
        style={{ border: 0, background: 'transparent', color: '#8FD9C4', fontWeight: 700, cursor: 'pointer', font: 'inherit' }}
      >
        重新整理
      </button>
    </div>
  );
}
