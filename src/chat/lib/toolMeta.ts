import {type LucideIcon, Route} from 'lucide-react';
import {
    TabletSmartphone,
    TreePine,
    ScanSearch,
    FileText,
    Camera,
    Database,
    Cookie,
    SquareTerminal,
    Save,
    List,
    ToggleLeft,
    Trash2,
    Eye,
    MonitorDot,
    Wrench,
    AlertCircle,
    ArrowLeft,
    RefreshCw,
MousePointerClick,
    Keyboard,
    ListChecks,
    ArrowDownUp,
    SendHorizonal,
} from 'lucide-react';

export type ToolCategory = 'data' | 'compute' | 'web' | 'utility' | 'communication' | 'media';

export interface ToolMeta {
    displayName: string;
    activeLabel: string;
    doneLabel: string;
    errorLabel: string;
    icon: LucideIcon;
    category: ToolCategory;
}


const toolMeta: Record<string, ToolMeta> = {
    // ── Page Inspection ──
    getCurrentTab: {
        displayName: 'Get Current Tab',
        activeLabel: 'Reading active tab…',
        doneLabel: 'Retrieved active tab',
        errorLabel: 'Failed to get active tab',
        icon: TabletSmartphone,
        category: 'web',
    },
    getPageStructure: {
        displayName: 'Get Page Structure',
        activeLabel: 'Scanning page structure…',
        doneLabel: 'Captured page structure',
        errorLabel: 'Failed to scan page structure',
        icon: TreePine,
        category: 'web',
    },
    getElementDetails: {
        displayName: 'Get Element Details',
        activeLabel: 'Inspecting elements…',
        doneLabel: 'Retrieved element details',
        errorLabel: 'Failed to inspect elements',
        icon: ScanSearch,
        category: 'web',
    },
    getPageText: {
        displayName: 'Get Page Text',
        activeLabel: 'Extracting page text…',
        doneLabel: 'Extracted page text',
        errorLabel: 'Failed to extract page text',
        icon: FileText,
        category: 'web',
    },
    takeScreenshot: {
        displayName: 'Take Screenshot',
        activeLabel: 'Capturing screenshot…',
        doneLabel: 'Screenshot captured',
        errorLabel: 'Failed to capture screenshot',
        icon: Camera,
        category: 'media',
    },

    // ── Page State ──
    getLocalStorage: {
        displayName: 'Get Storage',
        activeLabel: 'Reading page storage…',
        doneLabel: 'Retrieved storage data',
        errorLabel: 'Failed to read storage',
        icon: Database,
        category: 'data',
    },
    getCookies: {
        displayName: 'Get Cookies',
        activeLabel: 'Reading cookies…',
        doneLabel: 'Retrieved cookies',
        errorLabel: 'Failed to read cookies',
        icon: Cookie,
        category: 'data',
    },

    // ── Execution & Scripting ──
    executeContentScript: {
        displayName: 'Run Content Script',
        activeLabel: 'Running script on page…',
        doneLabel: 'Script executed',
        errorLabel: 'Script execution failed',
        icon: SquareTerminal,
        category: 'compute',
    },
    saveScript: {
        displayName: 'Save Script',
        activeLabel: 'Saving background script…',
        doneLabel: 'Script saved',
        errorLabel: 'Failed to save script',
        icon: Save,
        category: 'utility',
    },
    listScripts: {
        displayName: 'List Scripts',
        activeLabel: 'Loading saved scripts…',
        doneLabel: 'Listed saved scripts',
        errorLabel: 'Failed to list scripts',
        icon: List,
        category: 'utility',
    },
    toggleScript: {
        displayName: 'Toggle Script',
        activeLabel: 'Toggling script status…',
        doneLabel: 'Script status updated',
        errorLabel: 'Failed to toggle script',
        icon: ToggleLeft,
        category: 'utility',
    },
    removeScript: {
        displayName: 'Remove Script',
        activeLabel: 'Deleting script…',
        doneLabel: 'Script deleted',
        errorLabel: 'Failed to delete script',
        icon: Trash2,
        category: 'utility',
    },

    // ── Navigation ──
    navigateTo: {
        displayName: 'Navigate Page',
        activeLabel: 'Navigating to page…',
        doneLabel: 'Navigation complete',
        errorLabel: 'Navigation failed',
        icon: Route,
        category: 'web',
    },
    navigateHistory: {
        displayName: 'Navigate History',
        activeLabel: 'Navigating history…',
        doneLabel: 'History navigation complete',
        errorLabel: 'History navigation failed',
        icon: ArrowLeft,
        category: 'web',
    },
    reloadPage: {
        displayName: 'Reload Page',
        activeLabel: 'Reloading page…',
        doneLabel: 'Page reloaded',
        errorLabel: 'Failed to reload page',
        icon: RefreshCw,
        category: 'web',
    },

    // ── Interaction ──
    clickElement: {
        displayName: 'Click Element',
        activeLabel: 'Clicking element…',
        doneLabel: 'Element clicked',
        errorLabel: 'Failed to click element',
        icon: MousePointerClick,
        category: 'web',
    },
    typeText: {
        displayName: 'Type Text',
        activeLabel: 'Typing text…',
        doneLabel: 'Text entered',
        errorLabel: 'Failed to type text',
        icon: Keyboard,
        category: 'web',
    },
    selectOption: {
        displayName: 'Select Option',
        activeLabel: 'Selecting option…',
        doneLabel: 'Option selected',
        errorLabel: 'Failed to select option',
        icon: ListChecks,
        category: 'web',
    },
    scrollPage: {
        displayName: 'Scroll Page',
        activeLabel: 'Scrolling page…',
        doneLabel: 'Page scrolled',
        errorLabel: 'Failed to scroll page',
        icon: ArrowDownUp,
        category: 'web',
    },
    submitForm: {
        displayName: 'Submit Form',
        activeLabel: 'Submitting form…',
        doneLabel: 'Form submitted',
        errorLabel: 'Failed to submit form',
        icon: SendHorizonal,
        category: 'web',
    },

    // ── DOM Events ──
    waitForElement: {
        displayName: 'Wait for Element',
        activeLabel: 'Waiting for element…',
        doneLabel: 'Element detected',
        errorLabel: 'Element wait failed',
        icon: Eye,
        category: 'web',
    },
    // ── Debugging ──
    getDebugInfo: {
        displayName: 'Get Debug Info',
        activeLabel: 'Capturing debug info…',
        doneLabel: 'Debug info captured',
        errorLabel: 'Failed to capture debug info',
        icon: MonitorDot,
        category: 'data',
    },
};

const fallbackMeta: ToolMeta = {
    displayName: 'Tool',
    activeLabel: 'Running tool',
    doneLabel: 'Tool completed',
    errorLabel: 'Tool failed',
    icon: Wrench,
    category: 'utility',
};

export {AlertCircle};

export function getToolMeta(toolName: string): ToolMeta {
    return toolMeta[toolName] ?? {...fallbackMeta, displayName: toolName};
}