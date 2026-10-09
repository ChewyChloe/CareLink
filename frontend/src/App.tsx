import React from 'react';
import { AcceptInvitePage } from './pages/AcceptInvitePage';
import { InvitationsPage } from './pages/InvitationsPage';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Navigation } from './components/Navigation';
import { ChildrenPage } from './pages/ChildrenPage';
import { NewEntryPage } from './pages/NewEntryPage';
import { ReportsPage } from './pages/ReportsPage';
import { TimelinePage } from './pages/TimelinePage';
import { CalendarPage } from './pages/CalendarPage';
import { BillingPage } from './pages/BillingPage';
import { ContractPage } from './pages/ContractPage';
import { HandoffPage } from './pages/HandoffPage';
import { DevPage } from './pages/DevPage';

export const AppRoutes: React.FC = () => {
  const { loading, liffStatus, user, login, error } = useAuth();

  // BrowserRouter itself and Navigate must not alter the LIFF callback URL.
  if (!liffStatus) {
    return <main role="status" className="p-8 text-center text-sm text-[#574143]">正在初始化 LINE，請稍候…</main>;
  }
  if (!liffStatus.isReady) {
    return <main role="alert" className="p-8 text-center text-sm text-red-600">LINE 初始化失敗：{liffStatus.error}。請關閉此頁後重新開啟。</main>;
  }
  if (loading) {
    return <main role="status" className="p-8 text-center text-sm text-[#574143]">正在確認登入狀態…</main>;
  }

  const preview = new URLSearchParams(window.location.search).get('preview') === 'true' || new URLSearchParams(window.location.search).get('demo') === 'true';
  if (!user && !preview && window.location.pathname !== '/accept-invite') return <main className="p-8 pt-24"><p role="alert">{error || '請以 LINE 登入'}</p><button onClick={login}>以 LINE 登入</button></main>;
  return (
    <BrowserRouter>
      <div className="cl-app-root min-h-screen bg-[#fbf9f5]">
        <Navigation />
        {preview && !user && <p role="status" className="fixed top-16 left-0 z-40 bg-amber-100 w-full text-center">DEMO / 合成資料</p>}
        <Routes>
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
          <Route path="/invitations" element={<InvitationsPage />} />
          <Route path="/children" element={<ChildrenPage />} />
          <Route path="/entry" element={<NewEntryPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/contract" element={<ContractPage />} />
          <Route path="/contracts" element={<ContractPage />} />
          <Route path="/handoff" element={<HandoffPage />} />
          <Route path="/settings" element={<ChildrenPage />} />
          <Route path="/dev" element={<DevPage />} />
          <Route path="*" element={<Navigate to="/children" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
};

export const App: React.FC = () => (
  <AuthProvider>
    <AppRoutes />
  </AuthProvider>
);
