import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Settings from "@/src/settings";
import Chat from "@/src/chat";

createRoot(document.getElementById('root')!).render(
  <HashRouter>
      <Routes>
          <Route path="/" element={<App />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
  </HashRouter>,
)
