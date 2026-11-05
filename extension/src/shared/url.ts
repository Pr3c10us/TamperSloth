const CHROME_MATCH_PATTERN_RE =
    /^(\*|https?|file|ftp):\/\/(\*|\*\.[^/*]+|[^/*]+)\/(.*)?$/;

/** A tab showing nothing of the user's yet: the new tab page or a blank tab. */
export function isNewTabPage(url: string | undefined): boolean {
    return !url || /^(?:about:blank|about:newtab|chrome:\/\/(?:newtab|new-tab-page)\/?|chrome-search:\/\/local-ntp\/|edge:\/\/newtab\/?)/i.test(url);
}

export function isValidMatchPattern(pattern: string): boolean {
    if (pattern === "<all_urls>") return true;
    return CHROME_MATCH_PATTERN_RE.test(pattern);
}
