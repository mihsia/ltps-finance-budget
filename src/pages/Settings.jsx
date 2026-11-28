import { useMemo } from 'react';
import * as XLSX from 'xlsx';
import { createAccountHubClient } from '@ltps/account-sdk/core';
import { LtpsAccountManager } from '@ltps/account-sdk/react';
import '@ltps/account-sdk/styles.css';
import { ACCOUNT_HUB_URL, hubFunctions, isFirebaseConfigured } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { runAuthorized } from '../lib/accessPolicy';
import NoModuleAccess from '../components/NoModuleAccess';

/**
 * 將帳號中心 SDK Client 的所有寫入動作包裝在即時權限檢查內，
 * 即使工作階段中途管理者權限遭撤銷，前端也能立即攔截並顯示錯誤（後端亦同步驗證）。
 */
function createGuardedAccountClient(baseClient, authorizeAdmin) {
  if (!baseClient) return null;

  const guardWrite = (fn) => async (payload) => {
    const result = await runAuthorized(() => authorizeAdmin(), () => fn(payload));
    if (!result.executed) {
      throw new Error(result.reason || '此功能僅限系統管理員使用。');
    }
    return result.value;
  };

  return {
    ...baseClient,
    createAccount: guardWrite(baseClient.createAccount),
    updateAccount: guardWrite(baseClient.updateAccount),
    setAppStatus: guardWrite(baseClient.setAppStatus),
    setGlobalStatus: guardWrite(baseClient.setGlobalStatus),
    setSuperAdmin: guardWrite(baseClient.setSuperAdmin),
    importAccounts: guardWrite(baseClient.importAccounts),
    upsertApp: guardWrite(baseClient.upsertApp),
  };
}

export default function Settings() {
  const { canEditModule, authorizeAdmin, authorizeAdminActor } = useAuth();
  const selfDecision = authorizeAdminActor();
  const selfUid = selfDecision.allowed ? selfDecision.actor?.uid : null;

  const guardedClient = useMemo(() => {
    if (!isFirebaseConfigured || !hubFunctions) return null;
    return createGuardedAccountClient(createAccountHubClient(hubFunctions), authorizeAdmin);
  }, [authorizeAdmin]);

  if (!canEditModule('settings')) {
    return <NoModuleAccess title="帳號管理" />;
  }

  return (
    <LtpsAccountManager
      mode="app"
      appId="finance"
      client={guardedClient}
      currentUid={selfUid}
      hubUrl={ACCOUNT_HUB_URL}
      xlsxModule={XLSX}
      title="帳號管理"
      subtitle="由全校統一帳號管理中心提供；本頁異動僅影響財務預算系統權限，不影響教職員在其他校務系統的登入。"
    />
  );
}
