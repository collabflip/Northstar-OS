import { BrowserRouter, Routes, Route } from 'react-router';
import { I18nProvider } from '@/lib/i18n';
import { TRPCProvider } from '@/providers/trpc';
import Layout from '@/components/Layout';
import Home from '@/pages/Home';
import Login from '@/pages/Login';
import Portal from '@/pages/Portal';
import Pipeline from '@/pages/Pipeline';
import Sellers from '@/pages/Sellers';
import Seller360 from '@/pages/Seller360';
import PropertyDossier from '@/pages/PropertyDossier';
import Approvals from '@/pages/Approvals';
import ListingLaunch from '@/pages/ListingLaunch';
import Conversations from '@/pages/Conversations';
import Campaigns from '@/pages/Campaigns';
import CalendarPage from '@/pages/CalendarPage';
import OfferRoom from '@/pages/OfferRoom';
import Transactions from '@/pages/Transactions';
import TransactionTimeline from '@/pages/TransactionTimeline';
import Compliance from '@/pages/Compliance';
import AuditExplorer from '@/pages/AuditExplorer';
import SettingsPage from '@/pages/SettingsPage';
import NotFound from '@/pages/NotFound';

export default function App() {
  return (
    <I18nProvider>
      <BrowserRouter>
        <TRPCProvider>
          <Routes>
            {/* Standalone routes outside the app shell */}
            <Route path="/login" element={<Login />} />
            <Route path="/portal" element={<Portal />} />

            {/* App shell: nested layout route (Layout renders <Outlet/>) */}
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="pipeline" element={<Pipeline />} />
              <Route path="sellers" element={<Sellers />} />
              <Route path="sellers/:id" element={<Seller360 />} />
              <Route path="properties/:id" element={<PropertyDossier />} />
              <Route path="approvals" element={<Approvals />} />
              <Route path="listings/:id/launch" element={<ListingLaunch />} />
              <Route path="conversations" element={<Conversations />} />
              <Route path="campaigns" element={<Campaigns />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="offers" element={<OfferRoom />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="transactions/:id" element={<TransactionTimeline />} />
              <Route path="compliance" element={<Compliance />} />
              <Route path="audit" element={<AuditExplorer />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </TRPCProvider>
      </BrowserRouter>
    </I18nProvider>
  );
}
