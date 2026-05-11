export interface BackgroundScript {
    id: string;
    conversationId: string;
    name: string;
    description: string;
    code: string;
    urlMatchPattern: string;
    status: "active" | "paused";
    runAt: "document_start" | "document_end" | "document_idle";
}

export interface ScriptExecutionLog {
    scriptId: string;
    scriptName: string;
    url: string;
    timestamp: number;
    success: boolean;
    error?: string;
}

export type ContentMessage =
    | { type: "TAMPERSLOTH_EXECUTE_TEMP_SCRIPT"; script: string; id: string }
    | { type: "TAMPERSLOTH_GET_PAGE_INFO"; id: string };

export type ContentResponse =
    | { type: "TAMPERSLOTH_SCRIPT_RESULT"; id: string; result: unknown; error?: string }
    | { type: "TAMPERSLOTH_PAGE_INFO"; id: string; url: string; title: string; meta: Record<string, string> };
