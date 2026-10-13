import {runPageGuidance} from './pageGuidance';
import type {CDPManager} from './cdp';

export async function cleanupBrowserGuidance(cdp: CDPManager, shouldContinue=()=>true) {
    const stored=await chrome.storage.session.get(null);
    const keys=Object.keys(stored).filter(key=>/^ts_guidance_tab_\d+$/.test(key));
    const tabs=new Set([...keys.map(key=>Number(key.slice('ts_guidance_tab_'.length))),...cdp.status()]);
    for(const tabId of tabs) {
        if(!shouldContinue()) return;
        await runPageGuidance(tabId,{action:'dispose'}).catch(()=>{});
        await cdp.detach(tabId).catch(()=>{});
    }
    if(shouldContinue()) await chrome.storage.session.remove(keys);
}

/** A panel port lives for the whole UI document, including chat/gallery navigation. */
export function installPanelLifecycle(cdp: CDPManager) {
    const panels=new Set<chrome.runtime.Port>();
    chrome.runtime.onConnect.addListener(port=>{
        if(port.name!=='tampersloth-panel' || port.sender?.id!==chrome.runtime.id
            || !port.sender.url?.startsWith(chrome.runtime.getURL('')) || port.sender.tab) return;
        panels.add(port);
        cdp.setPanelClosed(false);
        port.onDisconnect.addListener(()=>{
            panels.delete(port);
            if(panels.size) return;
            cdp.setPanelClosed(true);
            void (async()=>{
                // Session storage survives worker suspension while the panel is idle.
                await cleanupBrowserGuidance(cdp,()=>!panels.size);
            })().catch(error=>console.warn('[Tampersloth] Panel cleanup failed:',error));
        });
    });
}
