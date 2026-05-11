export const CHROME_MATCH_PATTERN_RE =
    /^(\*|https?|file|ftp):\/\/(\*|\*\.[^/*]+|[^/*]+)\/(.*)?$/;

export function isValidMatchPattern(pattern: string): boolean {
    if (pattern === "<all_urls>") return true;
    return CHROME_MATCH_PATTERN_RE.test(pattern);
}

export function urlMatchesPattern(url: string, pattern: string): boolean {
    if (pattern === "<all_urls>") return true;
    if (!pattern) return false;

    const match = pattern.match(CHROME_MATCH_PATTERN_RE);
    if (!match) return false;

    const [, scheme, host, path = ""] = match;

    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }

    if (scheme !== "*") {
        if (parsed.protocol !== scheme + ":") return false;
    } else {
        if (!["http:", "https:"].includes(parsed.protocol)) return false;
    }

    if (host !== "*") {
        if (host.startsWith("*.")) {
            const domain = host.slice(2);
            if (parsed.hostname !== domain && !parsed.hostname.endsWith("." + domain)) {
                return false;
            }
        } else {
            if (parsed.hostname !== host) return false;
        }
    }

    const pathToMatch = parsed.pathname + parsed.search + parsed.hash;
    const escapedPath = path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    const pathRegex = new RegExp("^/" + escapedPath + "$");

    return pathRegex.test(pathToMatch);
}
