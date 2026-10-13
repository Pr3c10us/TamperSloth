import type {ComponentProps, ReactElement, ReactNode} from "react";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";

interface HintProps {
    /** Tooltip content; without it the child renders bare. */
    label?: ReactNode;
    side?: ComponentProps<typeof TooltipContent>["side"];
    align?: ComponentProps<typeof TooltipContent>["align"];
    className?: string;
    /** A single element that can hold a ref (a DOM element or forwardRef component). */
    children: ReactElement;
}

/** shadcn tooltip around one element, for the many places a hint is optional. */
export function Hint({label, side = "top", align, className, children}: HintProps) {
    if (label === undefined || label === null || label === "") return children;
    return (
        <Tooltip>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent side={side} align={align} className={className}>{label}</TooltipContent>
        </Tooltip>
    );
}
