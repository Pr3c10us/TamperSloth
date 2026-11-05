import { createRoot } from 'react-dom/client'
import './index.css'
import App from '@/pages/gallery/GalleryPage'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Settings from "@/pages/settings/SettingsPage";
import Chat from "@/pages/chat/ChatPage";
import MicrophoneAccess from "@/pages/microphone/MicrophonePage";
import ScriptViewer from "@/pages/script-viewer/ScriptViewerPage";
import InstallUserscript from "@/pages/install/InstallPage";
import ConnectPrompt from "@/pages/connect/ConnectPage";
import ImageLibrary from "@/pages/images/ImageLibraryPage";
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
          <Route path="/" element={<Chat />} />
          <Route path="/gallery" element={<App />} />
          <Route path="/images" element={<ImageLibrary />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/microphone" element={<MicrophoneAccess />} />
          <Route path="/scripts/:id" element={<ScriptViewer />} />
          <Route path="/install" element={<InstallUserscript />} />
          <Route path="/connect/:id" element={<ConnectPrompt />} />
          <Route path="/chat" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </TooltipProvider>
  </HashRouter>,
)
