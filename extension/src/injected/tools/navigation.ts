/** Runs in the page once navigateTo has loaded it: resolves when the selector appears, or after `ms`. */
export function waitForSelectorAfterNavigation(sel: string, ms: number) {
    return new Promise<any>((resolve) => {
        const existing = document.querySelector(sel);
        if (existing) {
            resolve({found: true, waited: 0});
            return;
        }

        const start = Date.now();
        const observer = new MutationObserver(() => {
            if (document.querySelector(sel)) {
                observer.disconnect();
                resolve({found: true, waited: Date.now() - start});
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
        });

        setTimeout(() => {
            observer.disconnect();
            resolve({found: false, waited: ms});
        }, ms);
    });
}

/** Runs in the page for navigateHistory. */
export function goThroughHistory(dir: string) {
    if (dir === "back") history.back();
    else history.forward();
}
