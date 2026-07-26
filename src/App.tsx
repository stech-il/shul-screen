import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Admin } from './pages/Admin';
import { Agency } from './pages/Agency';
import { Display } from './pages/Display';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { PlatformLogin } from './pages/PlatformLogin';

function DisplayRoute() {
  const { id = 'amishav' } = useParams();
  let synagogueId = id;
  try {
    synagogueId = decodeURIComponent(id);
  } catch {
    /* keep raw id */
  }
  return <Display synagogueId={synagogueId} />;
}

function AdminRoute() {
  const { id = 'amishav' } = useParams();
  let synagogueId = id;
  try {
    synagogueId = decodeURIComponent(id);
  } catch {
    /* keep raw id */
  }
  return <Admin synagogueId={synagogueId} />;
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/display/:id" element={<DisplayRoute />} />
        <Route path="/screen/:id" element={<DisplayRoute />} />
        {/* Platform super-admin gate — must be before /admin/:id */}
        <Route path="/admin" element={<PlatformLogin />} />
        <Route path="/admin/:id" element={<AdminRoute />} />
        <Route path="/login/:id" element={<Login />} />
        <Route path="/agency" element={<Agency />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
