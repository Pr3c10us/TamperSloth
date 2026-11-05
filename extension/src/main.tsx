import { createRoot } from 'react-dom/client'
import './index.css'
import GalleryPage from "@/pages/gallery/GalleryPage";
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import SettingsPage from "@/pages/settings/SettingsPage";
import ChatPage from "@/pages/chat/ChatPage";
import MicrophonePage from "@/pages/microphone/MicrophonePage";
import ScriptViewerPage from "@/pages/script-viewer/ScriptViewerPage";
import InstallPage from "@/pages/install/InstallPage";
import ConnectPage from "@/pages/connect/ConnectPage";
import ImageLibraryPage from "@/pages/images/ImageLibraryPage";
import { TooltipProvider } from "@/ui/shadcn/tooltip";
import { usePanelRequestRouting } from "@/pages/chat/hooks/usePanelRequests";
import { initTheme } from "@/ui/theme";

initTheme();

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
          <Route path="/" element={<ChatPage />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="/images" element={<ImageLibraryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/microphone" element={<MicrophonePage />} />
          <Route path="/scripts/:id" element={<ScriptViewerPage />} />
          <Route path="/install" element={<InstallPage />} />
          <Route path="/connect/:id" element={<ConnectPage />} />
          <Route path="/chat" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </TooltipProvider>
  </HashRouter>,
)
