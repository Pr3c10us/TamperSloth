import {clip, serialize} from "@/agent/tools/toolOutput";

export function summarizeSelectedElement(html: string): string {
    const element = new DOMParser().parseFromString(html, "text/html").body.firstElementChild;
    if (!element) return clip(html, 1500);
    return serialize({tag: element.tagName.toLowerCase(),
        attributes: Object.fromEntries(["id", "class", "role", "aria-label", "name", "href", "type"].filter(name => element.hasAttribute(name))
            .map(name => [name, clip(element.getAttribute(name)!, 160)])),
        text: clip(element.textContent?.trim() ?? "", 400),
        children: Array.from(element.children).slice(0, 6).map(child => child.tagName.toLowerCase()),
        hint: "Selected-element summary; inspect the live DOM for additional detail."});
}
