import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import dayjs from 'dayjs';
import Layout from './components/Layout';
import DailyPage from './pages/DailyPage';
import MonitorPage from './pages/MonitorPage';

export default function App() {
  const today = dayjs().format('YYYY-MM-DD');

  return (
    <BrowserRouter>
      <Layout>
        {({ project }) => (
          <Routes>
            <Route path="/" element={<Navigate to={`/daily/${today}`} replace />} />
            <Route path="/daily/:date" element={<DailyPage project={project} />} />
            <Route path="/monitor" element={<MonitorPage />} />
          </Routes>
        )}
      </Layout>
    </BrowserRouter>
  );
}
