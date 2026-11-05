/** Runs in the page's own world (MAIN) for getDebugInfo: installs fetch and XHR interceptors on first call, then reports what they captured. */
export function captureNetworkRequests(shouldClear: boolean, filter: string | null) {
    // 200 x 2000 chars of bodies was ~100k tokens per call,
    // re-sent on every later step.
    const MAX_ENTRIES = 50;
    const MAX_BODY = 600;
    const w = window as any;

    // ── Install interceptors on first call ──
    if (!w.__netCapture) {
        w.__netCapture = {requests: []};
        const buf = w.__netCapture.requests;

        // — Fetch interceptor —
        const origFetch = w.fetch;
        w.fetch = async function (...args: any[]) {
            const req =
                args[0] instanceof Request
                    ? args[0]
                    : new Request(args[0], args[1]);
            const entry: any = {
                source: "fetch",
                method: req.method,
                url: req.url,
                timestamp: Date.now(),
            };
            try {
                const requestBody = args[1]?.body;
                if (typeof requestBody === "string") {
                    entry.requestBody = requestBody.slice(0, MAX_BODY);
                }
            } catch {
            }

            try {
                const response: Response = await origFetch.apply(w, args);
                entry.status = response.status;
                entry.statusText = response.statusText;
                // Full response headers on every request cost far
                // more than they answer; content-type is the one
                // that actually gets read.
                const contentType = response.headers.get("content-type");
                if (contentType) entry.contentType = contentType;

                const clone = response.clone();
                try {
                    const text = await clone.text();
                    entry.responseBody = text.slice(0, MAX_BODY);
                    if (text.length > MAX_BODY)
                        entry.responseBodyTruncated = true;
                } catch {
                }

                if (buf.length < MAX_ENTRIES) buf.push(entry);
                return response;
            } catch (err: any) {
                entry.error = err?.message ?? String(err);
                if (buf.length < MAX_ENTRIES) buf.push(entry);
                throw err;
            }
        };

        // — XHR interceptor —
        const OrigXHR = w.XMLHttpRequest;
        w.XMLHttpRequest = function () {
            const xhr = new OrigXHR();
            const entry: any = {source: "xhr", timestamp: Date.now()};

            const origOpen = xhr.open;
            xhr.open = function (
                method: string,
                url: string,
                ...rest: any[]
            ) {
                entry.method = method;
                entry.url = url;
                return origOpen.call(xhr, method, url, ...rest);
            };

            const origSend = xhr.send;
            xhr.send = function (body?: any) {
                if (typeof body === "string") {
                    entry.requestBody = body.slice(0, MAX_BODY);
                }

                xhr.addEventListener("load", () => {
                    entry.status = xhr.status;
                    entry.statusText = xhr.statusText;
                    try {
                        const text =
                            typeof xhr.responseText === "string"
                                ? xhr.responseText
                                : "";
                        entry.responseBody = text.slice(0, MAX_BODY);
                        if (text.length > MAX_BODY)
                            entry.responseBodyTruncated = true;
                    } catch {
                    }
                    if (buf.length < MAX_ENTRIES) buf.push(entry);
                });

                xhr.addEventListener("error", () => {
                    entry.error = "Network error";
                    if (buf.length < MAX_ENTRIES) buf.push(entry);
                });

                return origSend.call(xhr, body);
            };

            return xhr;
        } as any;
        w.XMLHttpRequest.prototype = OrigXHR.prototype;

        // — WebSocket interceptor —
        const OrigWS = w.WebSocket;
        w.WebSocket = function (...args: any[]) {
            const ws = new OrigWS(...args);
            const connEntry: any = {
                source: "websocket",
                method: "CONNECT",
                url: args[0],
                timestamp: Date.now(),
            };
            if (buf.length < MAX_ENTRIES) buf.push(connEntry);

            ws.addEventListener("message", (e: any) => {
                const data =
                    typeof e.data === "string"
                        ? e.data.slice(0, MAX_BODY)
                        : `[${e.data?.constructor?.name ?? "binary"}]`;
                const entry: any = {
                    source: "websocket",
                    method: "RECEIVE",
                    url: args[0],
                    timestamp: Date.now(),
                    responseBody: data,
                };
                if (typeof e.data === "string" && e.data.length > MAX_BODY)
                    entry.responseBodyTruncated = true;
                if (buf.length < MAX_ENTRIES) buf.push(entry);
            });

            const origSendWS = ws.send.bind(ws);
            ws.send = function (data: any) {
                const body =
                    typeof data === "string"
                        ? data.slice(0, MAX_BODY)
                        : `[${data?.constructor?.name ?? "binary"}]`;
                const entry: any = {
                    source: "websocket",
                    method: "SEND",
                    url: args[0],
                    timestamp: Date.now(),
                    requestBody: body,
                };
                if (typeof data === "string" && data.length > MAX_BODY)
                    entry.requestBodyTruncated = true;
                if (buf.length < MAX_ENTRIES) buf.push(entry);
                return origSendWS(data);
            };

            ws.addEventListener("close", (e: any) => {
                const entry: any = {
                    source: "websocket",
                    method: "CLOSE",
                    url: args[0],
                    timestamp: Date.now(),
                    status: e.code,
                    statusText: e.reason || "",
                };
                if (buf.length < MAX_ENTRIES) buf.push(entry);
            });

            ws.addEventListener("error", () => {
                const entry: any = {
                    source: "websocket",
                    method: "ERROR",
                    url: args[0],
                    timestamp: Date.now(),
                    error: "WebSocket error",
                };
                if (buf.length < MAX_ENTRIES) buf.push(entry);
            });

            return ws;
        } as any;
        w.WebSocket.prototype = OrigWS.prototype;
        w.WebSocket.CONNECTING = OrigWS.CONNECTING;
        w.WebSocket.OPEN = OrigWS.OPEN;
        w.WebSocket.CLOSING = OrigWS.CLOSING;
        w.WebSocket.CLOSED = OrigWS.CLOSED;

        // — EventSource (SSE) interceptor —
        const OrigES = w.EventSource;
        if (OrigES) {
            w.EventSource = function (...args: any[]) {
                const es = new OrigES(...args);
                const connEntry: any = {
                    source: "eventsource",
                    method: "CONNECT",
                    url: args[0],
                    timestamp: Date.now(),
                };
                if (buf.length < MAX_ENTRIES) buf.push(connEntry);

                es.addEventListener("message", (e: any) => {
                    const entry: any = {
                        source: "eventsource",
                        method: "MESSAGE",
                        url: args[0],
                        timestamp: Date.now(),
                        responseBody: (e.data ?? "").slice(0, MAX_BODY),
                    };
                    if (e.data && e.data.length > MAX_BODY)
                        entry.responseBodyTruncated = true;
                    if (buf.length < MAX_ENTRIES) buf.push(entry);
                });

                es.addEventListener("error", () => {
                    const entry: any = {
                        source: "eventsource",
                        method: "ERROR",
                        url: args[0],
                        timestamp: Date.now(),
                        error: "EventSource error",
                    };
                    if (buf.length < MAX_ENTRIES) buf.push(entry);
                });

                return es;
            } as any;
            w.EventSource.prototype = OrigES.prototype;
            w.EventSource.CONNECTING = OrigES.CONNECTING;
            w.EventSource.OPEN = OrigES.OPEN;
            w.EventSource.CLOSED = OrigES.CLOSED;
        }

        // — sendBeacon interceptor —
        if (navigator.sendBeacon) {
            const origBeacon = navigator.sendBeacon.bind(navigator);
            navigator.sendBeacon = function (url: string, data?: any) {
                const body =
                    typeof data === "string"
                        ? data.slice(0, MAX_BODY)
                        : data
                            ? `[${data.constructor?.name ?? "blob/formdata"}]`
                            : undefined;
                const entry: any = {
                    source: "beacon",
                    method: "POST",
                    url,
                    timestamp: Date.now(),
                    requestBody: body,
                };
                if (buf.length < MAX_ENTRIES) buf.push(entry);
                return origBeacon(url, data);
            };
        }
    }

    // ── Collect results ──
    let requests: any[] = w.__netCapture.requests;

    const perfEntries = performance
        .getEntriesByType("resource")
        .slice(-100)
        .map((e: any) => ({
            source: "performance-api",
            url: e.name,
            type: e.initiatorType,
            duration: Math.round(e.duration),
            transferSize: e.transferSize,
            timestamp: Math.round(e.startTime),
        }));

    const interceptedUrls = new Set(
        requests.map((r: any) => r.url)
    );
    const uniquePerfEntries = perfEntries.filter(
        (p: any) => !interceptedUrls.has(p.url)
    );

    let allRequests = [...requests, ...uniquePerfEntries];

    if (filter) {
        allRequests = allRequests.filter((r: any) =>
            r.url?.includes(filter)
        );
    }

    if (shouldClear) {
        w.__netCapture.requests = [];
    }

    return {
        interceptorInstalled: true,
        captured: allRequests.length,
        requests: allRequests.slice(-MAX_ENTRIES),
    };
}
