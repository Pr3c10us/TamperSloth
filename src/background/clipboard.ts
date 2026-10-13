chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.type !== 'CLIPBOARD_OFFSCREEN') return false;
    if (sender.id !== chrome.runtime.id || sender.tab || (sender.url && !sender.url.startsWith(chrome.runtime.getURL('')))) return false;
    const task = message.action === 'read'
        ? navigator.clipboard.readText().then(text => ({text}))
        : navigator.clipboard.writeText(message.text).then(() => ({ok: true}));
    void task.then(respond, error => respond({error: error.message}));
    return true;
});
