import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AppNoticeProvider } from './components/AppNotice';
import { I18nProvider } from './i18n';
import { isAndroidKiosk } from './lib/androidKiosk';
import { isManageShellBuild, markManageSession } from './lib/manageApp';
import { Admin } from './pages/Admin';
import { Agency } from './pages/Agency';
import { Display } from './pages/Display';
import { Guide } from './pages/Guide';
import { KioskSetup } from './pages/KioskSetup';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { ManageHome } from './pages/ManageApp';
import { PlatformLogin } from './pages/PlatformLogin';
import { ResetPassword } from './pages/ResetPassword';

/** Native APK: never show marketing landing — go straight to registration. */
function HomeRoute() {
  if (isManageShellBuild()) {
    markManageSession();
    return <Navigate to="/manage" replace />;
  }
  if (isAndroidKiosk()) {
    return <Navigate to="/kiosk-setup" replace />;
  }
  return <Landing />;
}

function DisplayRoute() {
  const { id } = useParams();
  if (!id) return <Navigate to="/" replace />;
  let synagogueId = id;
  try {
    synagogueId = decodeURIComponent(id);
  } catch {
    /* keep raw id */
  }
  return <Display synagogueId={synagogueId} />;
}

function AdminRoute({ manageMode = false }: { manageMode?: boolean }) {
  const { id } = useParams();
  if (!id) return <Navigate to={manageMode ? '/manage' : '/'} replace />;
  let synagogueId = id;
  try {
    synagogueId = decodeURIComponent(id);
  } catch {
    /* keep raw id */
  }
  if (manageMode) markManageSession();
  return <Admin synagogueId={synagogueId} manageMode={manageMode} />;
}

export default function App() {
  return (
    <I18nProvider>
      <AppNoticeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="/kiosk-setup" element={<KioskSetup />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/display/:id" element={<DisplayRoute />} />
          <Route path="/screen/:id" element={<DisplayRoute />} />
          {/* Platform super-admin gate — must be before /admin/:id */}
          <Route path="/admin" element={<PlatformLogin />} />
          <Route path="/admin/:id" element={<AdminRoute />} />
          <Route path="/manage" element={<ManageHome />} />
          <Route path="/manage/:id" element={<AdminRoute manageMode />} />
          <Route path="/login/:id" element={<Login />} />
          <Route path="/agency" element={<Agency />} />
          <Route
            path="*"
            element={
              <Navigate
                to={
                  isManageShellBuild()
                    ? '/manage'
                    : isAndroidKiosk()
                      ? '/kiosk-setup'
                      : '/'
                }
                replace
              />
            }
          />
        </Routes>
      </BrowserRouter>
      </AppNoticeProvider>
    </I18nProvider>
  );
}
