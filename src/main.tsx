import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Settings from "@/src/settings";
import Chat from "@/src/chat";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePanelRequestRouting } from "@/src/chat/hooks/usePanelRequests";

function PanelRequestRouting() {
  usePanelRequestRouting();
  return null;
}

// Chrome disconnects this port when the side-panel document closes.
if(typeof globalThis.chrome!=='undefined' && typeof chrome.runtime?.connect==='function' && new URLSearchParams(location.search).has('tabId')) {
  const panelPort=chrome.runtime.connect({name:'tampersloth-panel'});
  window.addEventListener('pagehide',()=>panelPort.disconnect(),{once:true});
}

createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <TooltipProvider delayDuration={300}>
      <PanelRequestRouting />
      <Routes>
          <Route path="/" element={<Chat />} />
          <Route path="/gallery" element={<App />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/chat" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </TooltipProvider>
  </HashRouter>,
)
