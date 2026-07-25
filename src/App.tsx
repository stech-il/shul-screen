import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Admin } from './pages/Admin';
import { Agency } from './pages/Agency';
import { Display } from './pages/Display';
import { Home } from './pages/Home';
import { Login } from './pages/Login';

function DisplayRoute() {
  const { id = 'amishav' } = useParams();
  return <Display synagogueId={id} />;
}

function AdminRoute() {
  const { id = 'amishav' } = useParams();
  return <Admin synagogueId={id} />;
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/display/:id" element={<DisplayRoute />} />
        <Route path="/screen/:id" element={<DisplayRoute />} />
        <Route path="/admin/:id" element={<AdminRoute />} />
        <Route path="/login/:id" element={<Login />} />
        <Route path="/agency" element={<Agency />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
