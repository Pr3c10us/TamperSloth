// When a userscript asks to contact a site its @connect doesn't list, the service
// worker asks the user in a small window; these are the messages between the two.

export const CONNECT_DECISION = "CONNECT_DECISION";

export interface ConnectAsk {
    scriptName: string;
    host: string;
    pageUrl: string;
}

export interface ConnectDecision {
    allow: boolean;
    remember: "session" | "always";
}
