import type { PointerEvent } from "react";

/** The sloth mark (public/icon.svg) rasterized to text at 64 columns. */
export const ASCII_SLOTH = String.raw`                   ,:;i11ttfttt1ii:,.
            ,itLG8@@@@@@@@@@@@@@@@@@@8GCfi:
        ,1C8@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@GL1,
      iG@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@0Li.
   .t8@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@8Li
  ;0@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@8t.
 t@@@@@@@0Cft1i;;;i1fC8@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@8f.
1@@@@Gf;.              :L@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@81
8@0t,          :i;.      f@@@@@@@@@@@@@@@@@888@@@@@@@@@@@@@@C.
;,           ,0@@@@;     1@@@@@@@@@@@@@@C;.    ,;1L0@@@@@@@@@G.
              1G80f.    i8@@@@@@@@@@@@@C            ,1G@@@@@@@C
                     .iG@@@@@@@@@@@@@@@t     :ti,      ,f8@@@@@i
                 ,;tC8@@@@@@@88@@@@@@@@C    ,@@@@C       .f@@@@C
         ,;1fCG0@@@@@@@@@@8i.  .,iL@@@@@f    tG8G1         :0@@8
     ,tG8@@@@@@@@@@@@@@@@@@t       C@@@@@G:                 .C@8
     L@@@@@@@@@@@@@@@G8@@@@@8CftfC8@@@@@@@@Ci.                1;
     .G@@@@@@@@@@@@@@:.1G@@@@@@@@@@@@@@@@@@@@8C1,
       t@@@@@@@@@@@@@@L: ,1LC08880GCf1C@@@@@@@@@@Gt,
        ,f8@@@@@@@@@@@@@8Ct;,.    .:1C@@@@@@@@@@@@@@C:
          .1G@@@@@@@@@@@@@@@@@@88@@@@@@@@@@@@@@@@@@@@@;
             .iL0@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@0,
                 ,itC0@@@@@@@@@@@@@@@@@@@@@@@@@@@@Gf;
                      .:itfCG08@@@@@@@@@@@8GCLti:
                                .,,:::,,.`;

/** A quiet ASCII sloth that lights up in sage under the pointer. */
export function AsciiSloth({ className = "" }: { className?: string }) {
  const onMove = (e: PointerEvent<HTMLPreElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <pre className={`ascii ${className}`} aria-hidden onPointerMove={onMove}>
      {ASCII_SLOTH}
    </pre>
  );
}
