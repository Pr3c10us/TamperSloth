import {createBrowserTools} from "./browserTools";
import {createSkillTools} from "./skillTools";
import {createCodeFileTools} from "./codeFileTools";
import {createPageInspectionTools} from "./pageInspectionTools";
import {createPageStateTools} from "./pageStateTools";
import {createScriptTools} from "./scriptTools";
import {createNavigationTools} from "./navigationTools";
import {createInteractionTools} from "./interactionTools";
import {createWaitTools} from "./waitTools";
import {createDebugTools} from "./debugTools";
import {createAskUserTool} from "./askUserTool";
import {leaseTabTools} from "./tabLease";
import {createToolContext, type ToolContextOptions} from "./toolContext";

/** Every tool the agent can call. The order here is the order the model sees them in. */
export function createAgentTools(options: ToolContextOptions) {
    const context = createToolContext(options);
    return leaseTabTools({
        ...createBrowserTools(() => context.tabId, id => { context.tabId = id; }, context.abortSignal, {conversationId: context.conversationId, originTabId: context.tabId > 0 ? context.tabId : undefined, originBlank: context.originBlank, findAttachment: context.findAttachment}),
        ...createSkillTools(),
        ...createCodeFileTools(context),
        ...createPageInspectionTools(context),
        ...createPageStateTools(context),
        ...createScriptTools(context),
        ...createNavigationTools(context),
        ...createInteractionTools(context),
        ...createWaitTools(context),
        ...createDebugTools(context),
        ...createAskUserTool(context),
    }, context.conversationId, () => context.tabId, context.abortSignal);
}
