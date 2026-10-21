import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * Top bar shared by every page, so height, padding and icon sizes stay
 * identical when switching between chat, gallery and settings.
 */
function PageHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "flex h-12 shrink-0 items-center gap-1.5 border-b border-muted bg-background px-2.5",
        className
      )}
      {...props}
    />
  )
}

function PageHeaderTitle({ className, ...props }: React.ComponentProps<"h1">) {
  return (
    <h1
      data-slot="page-header-title"
      className={cn(
        "min-w-0 truncate px-1 pb-px font-heading text-[20px] leading-tight tracking-[-0.01em]",
        className
      )}
      {...props}
    />
  )
}

/** Icon button for the header; every icon renders at 16px with a 1.5 stroke. */
function PageHeaderAction({
  label,
  className,
  ...props
}: { label: string } & React.ComponentProps<typeof Button>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          className={cn(
            "text-foreground/70 hover:text-foreground [&_svg]:size-4 [&_svg]:stroke-[1.5]",
            className
          )}
          {...props}
        />
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

export { PageHeader, PageHeaderTitle, PageHeaderAction }
