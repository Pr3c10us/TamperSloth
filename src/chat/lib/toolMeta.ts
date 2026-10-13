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
    ListTodo,
    ClipboardList,
    Eraser,
    HelpCircle,
    BookOpen,
    FileSearch,
    FilePlus,
    FilePen,
    FileX,
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
    annotatePage: {displayName:'Page annotations',activeLabel:'Drawing guidance…',doneLabel:'Guidance updated',errorLabel:'Guidance unavailable',icon:MousePointerClick,category:'web'},
    waitForUserAction: {displayName:'Guided step',activeLabel:'Waiting for your action…',doneLabel:'Step observed',errorLabel:'Step could not be observed',icon:Route,category:'web'},
    clickTarget: {displayName: 'Click target', activeLabel: 'Clicking target…', doneLabel: 'Target clicked', errorLabel: 'Target click failed', icon: MousePointerClick, category: 'web'},
    browserGesture: {displayName: 'Browser gesture', activeLabel: 'Performing gesture…', doneLabel: 'Gesture verified', errorLabel: 'Gesture failed', icon: MousePointerClick, category: 'web'},
    takeMarkedScreenshot: {displayName: 'Marked screenshot', activeLabel: 'Marking the page…', doneLabel: 'Screenshot ready', errorLabel: 'Screenshot failed', icon: Camera, category: 'media'},
    browserTabs: {displayName: 'Browser tabs', activeLabel: 'Managing tabs…', doneLabel: 'Tabs updated', errorLabel: 'Tab action failed', icon: TabletSmartphone, category: 'web'},
    evaluateJavaScript: {displayName: 'Evaluate JavaScript', activeLabel: 'Evaluating…', doneLabel: 'Evaluation returned', errorLabel: 'Evaluation failed', icon: SquareTerminal, category: 'compute'},
    persistentStore: {displayName: 'Persistent storage', activeLabel: 'Accessing storage…', doneLabel: 'Storage ready', errorLabel: 'Storage failed', icon: Database, category: 'data'},
    siteRecipes: {displayName: 'Site recipes', activeLabel: 'Accessing recipes…', doneLabel: 'Recipes ready', errorLabel: 'Recipe action failed', icon: BookOpen, category: 'data'},
    accessibilityTree: {displayName: 'Accessibility tree', activeLabel: 'Reading accessibility…', doneLabel: 'Accessibility read', errorLabel: 'Accessibility read failed', icon: TreePine, category: 'web'},
    clipboard: {displayName: 'Clipboard', activeLabel: 'Accessing clipboard…', doneLabel: 'Clipboard ready', errorLabel: 'Clipboard failed', icon: ClipboardList, category: 'utility'},
    browserDownload: {displayName: 'Downloads', activeLabel: 'Managing download…', doneLabel: 'Download updated', errorLabel: 'Download failed', icon: Save, category: 'utility'},
    browserNotify: {displayName: 'Notification', activeLabel: 'Sending notification…', doneLabel: 'Notification sent', errorLabel: 'Notification failed', icon: AlertCircle, category: 'communication'},
    trustedInput: {displayName: 'Trusted input', activeLabel: 'Sending input…', doneLabel: 'Input sent', errorLabel: 'Input failed', icon: MousePointerClick, category: 'web'},
    networkCapture: {displayName: 'Network capture', activeLabel: 'Inspecting network…', doneLabel: 'Network result ready', errorLabel: 'Network action failed', icon: MonitorDot, category: 'web'},
    deepDOM: {displayName: 'Frames and shadow DOM', activeLabel: 'Inspecting frames…', doneLabel: 'Frames inspected', errorLabel: 'Frame action failed', icon: ScanSearch, category: 'web'},
    enableTools: {displayName: 'Enable tools', activeLabel: 'Enabling tools…', doneLabel: 'Tools ready', errorLabel: 'Could not enable tools', icon: Wrench, category: 'utility'},
    readToolResult: {displayName: 'Read earlier result', activeLabel: 'Reading earlier result…', doneLabel: 'Earlier result retrieved', errorLabel: 'Could not retrieve result', icon: FileSearch, category: 'data'},
    // ── Skills ──
    getSkill: {
        displayName: 'Fetch Skill',
        activeLabel: 'Fetching skill reference…',
        doneLabel: 'Skill reference loaded',
        errorLabel: 'Failed to fetch skill',
        icon: BookOpen,
        category: 'utility',
    },

    // ── Virtual Files ──
    viewCodeFiles: {
        displayName: 'View Files',
        activeLabel: 'Reading files…',
        doneLabel: 'Files read',
        errorLabel: 'Failed to read files',
        icon: FileSearch,
        category: 'data',
    },
    createFileTool: {
        displayName: 'Create File',
        activeLabel: 'Creating file…',
        doneLabel: 'File created',
        errorLabel: 'Failed to create file',
        icon: FilePlus,
        category: 'utility',
    },
    strReplaceTool: {
        displayName: 'Edit File',
        activeLabel: 'Editing file…',
        doneLabel: 'File edited',
        errorLabel: 'Failed to edit file',
        icon: FilePen,
        category: 'utility',
    },
    deleteFileTool: {
        displayName: 'Delete File',
        activeLabel: 'Deleting file…',
        doneLabel: 'File deleted',
        errorLabel: 'Failed to delete file',
        icon: FileX,
        category: 'utility',
    },

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
    // ── Task Tracking ──
    TodoWrite: {
        displayName: 'Update Todo List',
        activeLabel: 'Updating todo list…',
        doneLabel: 'Todo list updated',
        errorLabel: 'Failed to update todo list',
        icon: ListTodo,
        category: 'utility',
    },
    TodoRead: {
        displayName: 'Read Todo List',
        activeLabel: 'Reading todo list…',
        doneLabel: 'Todo list read',
        errorLabel: 'Failed to read todo list',
        icon: ClipboardList,
        category: 'utility',
    },
    TodoClear: {
        displayName: 'Clear Todo List',
        activeLabel: 'Clearing todo list…',
        doneLabel: 'Todo list cleared',
        errorLabel: 'Failed to clear todo list',
        icon: Eraser,
        category: 'utility',
    },

    // ── User Interaction ──
    askUser: {
        displayName: 'Ask user',
        activeLabel: 'Waiting on you…',
        doneLabel: 'Got your answer',
        errorLabel: 'Question dropped',
        icon: HelpCircle,
        category: 'communication',
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
