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
    ClipboardList,
    HelpCircle,
    BookOpen,
    FileSearch,
    FilePlus,
    FilePen,
    FileX,
    Hourglass,
} from 'lucide-react';

export type ToolCategory = 'data' | 'compute' | 'web' | 'utility' | 'communication' | 'media';

/** Identifies a tool in the UI. Call titles come from the model's per-call reason. */
export interface ToolMeta {
    displayName: string;
    icon: LucideIcon;
    category: ToolCategory;
}


const toolMeta: Record<string, ToolMeta> = {
    annotatePage: {displayName:'Page annotations',icon:MousePointerClick,category:'web'},
    waitForUserAction: {displayName:'Guided step',icon:Route,category:'web'},
    clickTarget: {displayName: 'Click target',icon: MousePointerClick, category: 'web'},
    browserGesture: {displayName: 'Browser gesture',icon: MousePointerClick, category: 'web'},
    takeMarkedScreenshot: {displayName: 'Marked screenshot',icon: Camera, category: 'media'},
    browserTabs: {displayName: 'Browser tabs',icon: TabletSmartphone, category: 'web'},
    evaluateJavaScript: {displayName: 'Evaluate JavaScript',icon: SquareTerminal, category: 'compute'},
    persistentStore: {displayName: 'Persistent storage',icon: Database, category: 'data'},
    siteRecipes: {displayName: 'Site recipes',icon: BookOpen, category: 'data'},
    accessibilityTree: {displayName: 'Accessibility tree',icon: TreePine, category: 'web'},
    clipboard: {displayName: 'Clipboard',icon: ClipboardList, category: 'utility'},
    browserDownload: {displayName: 'Downloads',icon: Save, category: 'utility'},
    browserNotify: {displayName: 'Notification',icon: AlertCircle, category: 'communication'},
    trustedInput: {displayName: 'Trusted input',icon: MousePointerClick, category: 'web'},
    networkCapture: {displayName: 'Network capture',icon: MonitorDot, category: 'web'},
    deepDOM: {displayName: 'Frames and shadow DOM',icon: ScanSearch, category: 'web'},
    enableTools: {displayName: 'Enable tools',icon: Wrench, category: 'utility'},
    readToolResult: {displayName: 'Read earlier result',icon: FileSearch, category: 'data'},
    // ── Skills ──
    getSkill: {
        displayName: 'Fetch Skill',
        icon: BookOpen,
        category: 'utility',
    },

    // ── Virtual Files ──
    viewCodeFiles: {
        displayName: 'View Files',
        icon: FileSearch,
        category: 'data',
    },
    createFileTool: {
        displayName: 'Create File',
        icon: FilePlus,
        category: 'utility',
    },
    strReplaceTool: {
        displayName: 'Edit File',
        icon: FilePen,
        category: 'utility',
    },
    deleteFileTool: {
        displayName: 'Delete File',
        icon: FileX,
        category: 'utility',
    },

    // ── Page Inspection ──
    getCurrentTab: {
        displayName: 'Get Current Tab',
        icon: TabletSmartphone,
        category: 'web',
    },
    getPageStructure: {
        displayName: 'Get Page Structure',
        icon: TreePine,
        category: 'web',
    },
    getElementDetails: {
        displayName: 'Get Element Details',
        icon: ScanSearch,
        category: 'web',
    },
    getPageText: {
        displayName: 'Get Page Text',
        icon: FileText,
        category: 'web',
    },
    takeScreenshot: {
        displayName: 'Take Screenshot',
        icon: Camera,
        category: 'media',
    },

    // ── Page State ──
    getLocalStorage: {
        displayName: 'Get Storage',
        icon: Database,
        category: 'data',
    },
    getCookies: {
        displayName: 'Get Cookies',
        icon: Cookie,
        category: 'data',
    },

    // ── Execution & Scripting ──
    executeContentScript: {
        displayName: 'Run Content Script',
        icon: SquareTerminal,
        category: 'compute',
    },
    saveScript: {
        displayName: 'Save Script',
        icon: Save,
        category: 'utility',
    },
    listScripts: {
        displayName: 'List Scripts',
        icon: List,
        category: 'utility',
    },
    toggleScript: {
        displayName: 'Toggle Script',
        icon: ToggleLeft,
        category: 'utility',
    },
    removeScript: {
        displayName: 'Remove Script',
        icon: Trash2,
        category: 'utility',
    },

    // ── Navigation ──
    navigateTo: {
        displayName: 'Navigate Page',
        icon: Route,
        category: 'web',
    },
    navigateHistory: {
        displayName: 'Navigate History',
        icon: ArrowLeft,
        category: 'web',
    },
    reloadPage: {
        displayName: 'Reload Page',
        icon: RefreshCw,
        category: 'web',
    },

    // ── Interaction ──
    clickElement: {
        displayName: 'Click Element',
        icon: MousePointerClick,
        category: 'web',
    },
    typeText: {
        displayName: 'Type Text',
        icon: Keyboard,
        category: 'web',
    },
    selectOption: {
        displayName: 'Select Option',
        icon: ListChecks,
        category: 'web',
    },
    scrollPage: {
        displayName: 'Scroll Page',
        icon: ArrowDownUp,
        category: 'web',
    },
    submitForm: {
        displayName: 'Submit Form',
        icon: SendHorizonal,
        category: 'web',
    },

    // ── DOM Events ──
    waitForElement: {
        displayName: 'Wait for Element',
        icon: Eye,
        category: 'web',
    },
    wait: {
        displayName: 'Wait',
        icon: Hourglass,
        category: 'utility',
    },
    // ── Debugging ──
    getDebugInfo: {
        displayName: 'Get Debug Info',
        icon: MonitorDot,
        category: 'data',
    },

    // ── User Interaction ──
    askUser: {
        displayName: 'Ask user',
        icon: HelpCircle,
        category: 'communication',
    },

};

const fallbackMeta: ToolMeta = {
    displayName: 'Tool',
    icon: Wrench,
    category: 'utility',
};

export {AlertCircle};

export function getToolMeta(toolName: string): ToolMeta {
    return toolMeta[toolName] ?? {...fallbackMeta, displayName: toolName};
}
