import type {ReactNode} from "react";
import {cn} from "@/lib/utils";

/** A titled block of settings. `action` sits to the right of the title. */
export function SettingsSection({title, description, action, children, className}: {
    title: string;
    description?: ReactNode;
    action?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section className={cn("flex flex-col gap-2.5", className)}>
            <div className="flex items-end justify-between gap-3 px-0.5">
                <div className="min-w-0">
                    <h3 className="font-mono text-[11px] font-normal uppercase tracking-[.12em] text-muted-foreground">
                        {title}
                    </h3>
                    {description && (
                        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{description}</p>
                    )}
                </div>
                {action && <div className="shrink-0">{action}</div>}
            </div>
            {children}
        </section>
    );
}

/** A card whose children are separated by hairline dividers. */
export function SettingsGroup({children, className}: {children: ReactNode; className?: string}) {
    return (
        <div className={cn("divide-y divide-muted overflow-hidden rounded-[10px] border border-border bg-card", className)}>
            {children}
        </div>
    );
}

/** One labelled setting. The control renders to the right, or below when `stacked`. */
export function SettingRow({label, htmlFor, description, children, stacked}: {
    label: ReactNode;
    htmlFor?: string;
    description?: ReactNode;
    children?: ReactNode;
    stacked?: boolean;
}) {
    const text = (
        <div className="min-w-0 flex-1">
            <label htmlFor={htmlFor} className="block text-[13.5px] font-medium leading-snug text-foreground">
                {label}
            </label>
            {description && (
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{description}</p>
            )}
        </div>
    );
    return stacked ? (
        <div className="flex flex-col gap-3 px-3.5 py-3.5">{text}{children}</div>
    ) : (
        <div className="flex items-center gap-4 px-3.5 py-3">{text}{children}</div>
    );
}

/** Large serif page intro shared by every tab. */
export function TabIntro({title, children}: {title: ReactNode; children?: ReactNode}) {
    return (
        <div className="px-0.5">
            <h2 className="font-heading text-[28px] leading-[1.1] tracking-[-0.02em]">{title}</h2>
            {children && <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{children}</p>}
        </div>
    );
}
