export function EmptyState() {
    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3.5 px-10 py-16 text-center min-h-[360px]">
            <img src="icon-white.svg" alt="" className="h-14 w-14 opacity-85" />
            <div className="font-heading text-3xl leading-[1.1] tracking-[-0.02em] text-nowrap">
                What should the sloth <em>do?</em>
            </div>
            {/*<div className="font-mono text-[11px] uppercase tracking-[.12em] text-muted-foreground">*/}
            {/*    Pick an element &nbsp;·&nbsp; attach a file &nbsp;·&nbsp; describe it*/}
            {/*</div>*/}
        </div>
    );
}
