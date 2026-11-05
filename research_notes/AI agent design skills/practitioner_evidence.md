# Practitioner Evidence: What Makes AI-Generated UI Look Generic, and What Fixes It

Evidence grades used throughout: **[A]** anecdote or opinion. **[S]** structured comparison (a defined protocol, but qualitative or unscored). **[M]** measured result (numbers from a stated method). **[V]** the source sells or promotes a related product, or is a vendor.

Retrieval limits the report writer must carry forward:
- **No Reddit evidence is in these notes.** Web search refused reddit.com as a filter, and the built-in browser refused old.reddit.com under a safety restriction. I did not try mirrors or other workarounds. Coverage is therefore Hacker News (HN), blogs and papers. Nothing here should be presented as "what Reddit says".
- HN comments were retrieved through the Algolia API and paraphrased by an automated extraction step. Comment IDs are given in the links so they can be checked. None is quoted.
- ACM pages returned a 403 on fetch and a Cloudflare challenge in the browser, which I did not attempt to pass. "Generated Inaccessible" is known only from search snippets. "Good Accessibility, Handcuffed Creativity" was read from the author's PDF.
- I read the page images directly for UI-Bench, Design Theater (abstract and introduction), Guriță & Vatavu and EvoGenUI-Bench (abstract). Design Creativity Bench figures and the PerceptUI table come from automated extraction of the HTML versions.

## What are the telltale signs of AI-generated UI, and which are agreed or disputed?

### Takeaway
There is strong convergence on a recognizable cluster: default sans type, purple or indigo gradients, a centered hero with a badge, identical card grids, and low-contrast dark mode. Practitioners dispute whether any single sign means AI at all, because many predate LLMs. The agreement is about clusters, and it is mostly agreement between observers, not validated detection.

### Cited Findings
**Best available count:** Adrian Krebs scored 1,590 Show HN landing pages using deterministic CSS and DOM checks: 22% high (4+ patterns), 32% medium (2-3), 46% low (0-1). A manual pass put false positives at "maybe 5-10%". He says one pattern alone does not indicate AI, and that a high score signals a template look, not proof. His verdict: "Is this bad? Not really, just uninspired." The post is inconsistent on sample size (~1400 vs 1,590) and on pattern count (16 stated, 18 listed), and he says the analysis was AI-assisted. [M, no ground truth for AI authorship] — [Krebs](https://www.adriankrebs.ch/blog/design-slop/). HN discussion: 333 points, 235 comments — [HN thread](https://news.ycombinator.com/item?id=47864393)

**Agreement across independent sources (only those I checked):**

| Sign | Named by |
|---|---|
| Inter or default sans everywhere | [Krebs](https://www.adriankrebs.ch/blog/design-slop/), [Capital & Compute](https://capitalandcompute.net/blog/fix-ai-slop-design/), [Anthropic, V](https://claude.com/blog/improving-frontend-design-through-skills), [Lavaee](https://alexlavaee.me/blog/lessons-learned-designing-with-ai/) |
| Purple or indigo gradients | Krebs, Capital & Compute, Anthropic, HN users [sen](https://news.ycombinator.com/item?id=47871467) and [LucidLynx](https://news.ycombinator.com/item?id=48506189) |
| Identical rounded or icon-topped card grids | Krebs, Capital & Compute, [Anthropic skill, V](https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/plugins/frontend-design/skills/frontend-design/SKILL.md), [UI-Bench](https://arxiv.org/pdf/2508.20410) (low-ranked tools) |
| Centered hero, pill badge above H1 | Krebs, Capital & Compute |
| Colored left or top borders on cards | Krebs, [joegibbs](https://news.ycombinator.com/item?id=47872336) |
| Glassmorphism | Krebs, Capital & Compute |
| Dark mode with grey, low-contrast text | Krebs, [HN comment](https://news.ycombinator.com/item?id=47865126) |
| All-caps eyebrow labels | Krebs, Capital & Compute, Anthropic skill, [bensyverson](https://news.ycombinator.com/item?id=49642823) |
| Filler copy and invented statistics | Capital & Compute (Krebs flags stat banner rows, not whether the numbers are real) |

**Second-wave tells, after the first wave got banned:** cream background with serif and terracotta accent near #D97757, near-black with one neon accent, broadsheet hairlines with zero radius — [Capital & Compute](https://capitalandcompute.net/blog/fix-ai-slop-design/). Anthropic's own skill now names these looks as defaults to avoid and notes the terracotta matches its own accent — [Anthropic skill, V](https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/plugins/frontend-design/skills/frontend-design/SKILL.md). Krebs's checks already include Space Grotesk, Instrument Serif, Geist and a serif italic accent word — [Krebs](https://www.adriankrebs.ch/blog/design-slop/)

**Disputed signs:**
- shadcn/ui and Tailwind patterns: gradients and centered heroes predate AI and come largely from TailwindUI and shadcn ([nomdep](https://news.ycombinator.com/item?id=47865416)). One user hand-coded with shadcn and Radix ([anduril22](https://news.ycombinator.com/item?id=47871458)). Non-AI shadcn generator output also reads as AI ([waterTanuki](https://news.ycombinator.com/item?id=47871728)). [A]
- A reply notes default framework styles would not explain the contrast problem, so not everything reduces to defaults ([toraway](https://news.ycombinator.com/item?id=47866612)). [A]
- Asking for Tailwind plus shadcn yields something generic that does not read as AI ([debarshri](https://news.ycombinator.com/item?id=47867467)). This conflicts with Krebs treating shadcn as a pattern. [A]
- Motion: Anthropic describes the default as minimal animation, while Capital & Compute names the same fade-up on every section as a tell. These may describe different model generations. — [Anthropic, V](https://claude.com/blog/improving-frontend-design-through-skills); [Capital & Compute](https://capitalandcompute.net/blog/fix-ai-slop-design/)

### Inferences
- The signs work as a density signal. Krebs's false-positive estimate is for his tiers, and no one has measured precision against known AI-built versus human-built sites.
- Any tell list has a short shelf life. Krebs's April 2026 checks do not include the cream-and-terracotta look that a September 2026 guide treats as a main tell.

### Gaps
- I found no study scoring pre-LLM sites with the same checks, so the base rate of these patterns in human work is unknown.
- Reddit consensus could not be assessed (see limits above).

## Why does it happen, and how well supported is each explanation?

### Takeaway
Convergence itself is measured. Its cause is not. "Training data averaging" is the dominant story but rests on assertion and plausibility. Evidence also supports pre-AI web convergence, tool and template defaults, and underspecified prompts as contributors.

### Cited Findings
- **Training data convergence** (Anthropic's term is "distributional convergence"): models sample high-probability choices, and safe choices dominate the data. Asserted, not tested. [A, V] — [Anthropic](https://claude.com/blog/improving-frontend-design-through-skills)
- **Tailwind origin story:** Tailwind's `bg-indigo-500` demo default spread widely, with Adam Wathan's August 2025 apology on X cited as support. Plausible, but no training-data measurement. I did not verify the X post itself. [A] — [prg.sh](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website)
- **Convergence across models is measured:** 15 models, 2,400 designs, 80 tasks. Originality 0.592 (95% CI 0.582-0.602) versus 0.764 (0.751-0.778) for humans. Creative range 0.581 (0.567-0.597) versus 0.902 (0.884-0.919). This shows the effect, not its cause. [M, V: authors are at Kombai, which sells UI AI products] — [Design Creativity Bench](https://arxiv.org/html/2610.11539v1)
- **Web design was already converging:** Goree et al. (2021), as cited in Design Theater, found sites became more similar after 2007, with layout distance down over 30%, driven largely by shared frameworks like Bootstrap. Second-hand citation; original not read. [M] — [Design Theater](https://arxiv.org/pdf/2607.22928)
- **Tool and harness layer:** NN/g saw unstyled outputs defaulting to Shadcn and Tailwind ([NN/g](https://www.nngroup.com/articles/ai-prototyping/)) [S]. UI-Bench's authors argue that tools likely sharing models still diverge, which points to orchestration, templates and post-processing over model choice. That is a hypothesis in the paper, not a tested result. — [UI-Bench](https://arxiv.org/pdf/2508.20410). Anthropic also blames the single-file HTML constraint on artifacts — [Anthropic, V](https://claude.com/blog/improving-frontend-design-through-skills)
- **Underspecified prompts:** in NN/g's test, vague prompts let tools fill gaps with assumptions, and several read "profile page" as a social-media profile. [S] — [NN/g](https://www.nngroup.com/articles/ai-prototyping/)
- **Weak judgment of own output:** Anthropic's Labs team reports that "agents reliably skew positive when grading their own work". [A, V] — [Anthropic engineering](https://www.anthropic.com/engineering/harness-design-long-running-apps). On WiserUI-Bench, zero-shot models picking A/B-test winners scored 47.5-61.9% average accuracy and 10.4-34.6% when required to be correct under both input orders. [M, predicts behavior, not aesthetics; some baselines may be taken from prior reports] — [PerceptUI, Woven by Toyota](https://arxiv.org/html/2606.05697)
- **Opinion-level accounts:** slop is every web style averaged ([Xotic007](https://news.ycombinator.com/item?id=48506922)), or simply no opinion applied ([solidasparagus](https://news.ycombinator.com/item?id=48507068)). LLMs are trained toward consistent code ([jjcm, V: sells a design tool](https://news.ycombinator.com/item?id=48923018)). [A]
- **Weak citation to watch:** Lavaee invokes a 2024 Nature paper on model collapse to explain the pull toward the mean. The link to UI is his own argument, and I did not verify the paper. — [Lavaee](https://alexlavaee.me/blog/lessons-learned-designing-with-ai/)

### Inferences
- These explanations are probably additive, not rivals: frameworks homogenized the web, training data absorbed that, tools then hard-code the same stack, and vague prompts leave the defaults in place.
- The appropriateness finding (all models above 90%) means models satisfy the brief while staying alike, so better requirements alone may not produce distinctiveness.

### Gaps
- I found no study tracing specific visual defaults to training data, and no experiment that varies training exposure.

## Which techniques do people report actually worked?

### Takeaway
Concrete external references and explicit systems have the most consistent support, and the only structured support for references comes from NN/g. Named styles and critique loops have mixed reports. **I found no blinded comparison of these techniques against each other.** Almost everything here is anecdote.

### Cited Findings
**Reference artifacts (screenshots, Figma, real HTML/CSS)**
- NN/g's prompt ladder: broad prompts varied widely, detailed prompts came close to the human design, and text plus a Figma link gave the most accurate translation. No numeric scores; free tiers only. [S] — [NN/g](https://www.nngroup.com/articles/ai-prototyping/), [method](https://www.nngroup.com/articles/testing-ai-methodology)
- Feeding HTML/CSS and screenshots of admired sites gave close results ([Rastonbury](https://news.ycombinator.com/item?id=48513441), [brinki](https://news.ycombinator.com/item?id=48514722)). [A]
- A dissent on redesigning existing HTML ([rafram](https://news.ycombinator.com/item?id=48506371)), with a reply favoring code as reference over generating from scratch ([duffycommaryan](https://news.ycombinator.com/item?id=48508044)). [A]

**Design tokens, DESIGN.md, design systems**
- Pointing Claude at a design system matched the target style better than the skill alone ([ageitgey](https://news.ycombinator.com/item?id=48475829)). [A]
- A gallery of widgets built from a PNG board, with design docs limited to those components ([mywittyname](https://news.ycombinator.com/item?id=48505716)). [A]
- Stripe-derived DESIGN.md versus generic pricing page: looked less generic, screenshots only. The author says it is not a benchmark, and he promotes the open-source extractor. [S, n=1, V] — [DEV](https://dev.to/yuvrajangadsingh/i-gave-claude-stripes-designmd-the-ui-stopped-looking-generic-4l13)
- A screenshot conveys pixels but not decisions, hence writing the rules down. Search snippet only. [A] — [DEV](https://dev.to/thisisroushan/i-stopped-describing-designs-to-my-coding-agent-now-i-hand-it-a-designmd-47p7)
- Extracting a team's implicit system from its code and feeding it back; no measurements despite calling gains "measurable". [A] — [Lavaee](https://alexlavaee.me/blog/lessons-learned-designing-with-ai/)

**Screenshot critique loops**
- Generator plus separate evaluator using Playwright screenshots, four weighted criteria and few-shot calibration, 5-15 iterations, up to four hours. Scores rose then plateaued. No score values, no baseline comparison. The author sometimes preferred a middle iteration. [S, V] — [Anthropic engineering](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- A tool that screenshots the app, compares against the design and adjusts styles ([mywittyname](https://news.ycombinator.com/item?id=48506957)). Review passes with explicit checks such as text overflow ([singingtoday](https://news.ycombinator.com/item?id=48505817)). [A]

**Direction briefs**
- Write a short direction first (4-6 colors, 1-2 typefaces, a layout concept), then filter defaults. Filters alone yield a sterile page, and direction alone keeps the defaults. No independent tests. [A] — [Capital & Compute](https://capitalandcompute.net/blog/fix-ai-slop-design/)
- A clear idea up front reduces redo cycles ([Febriss33](https://news.ycombinator.com/item?id=48517977)). [A]

**Naming a style or reference system**
- Volpe regenerated one page in many styles and found only a Qt look removed the sloppy feel, concluding slop can sit on top of any style. Self-described as lacking design taste, n=1. [A] — [Volpe](https://envs.net/~volpe/blog/posts/reduce-slop.html) (HN: 219 points, 136 comments, [thread](https://news.ycombinator.com/item?id=48504912))
- "Google Podcasts" look worked over two projects ([aviperl](https://news.ycombinator.com/item?id=48506646)). Apple HIG plus customization ([dustarion](https://news.ycombinator.com/item?id=48517098)). [A]

**Multiple variations**
- Throwaway standalone mockups compared in a browser, then porting decisions rather than code. [A] — [Lavaee](https://alexlavaee.me/blog/lessons-learned-designing-with-ai/)
- The evidence usually cited is about human teams: NN/g reports best-of-4 at 56% above the average of the originals, merged at 70%, and 152% after one more iteration. Dated 1996, with no sample size stated in the article. Not AI evidence. [M, indirect] — [NN/g](https://www.nngroup.com/articles/parallel-and-iterative-design/)

**Component and stack constraints**
- Pure Tailwind utilities let the model reason about discrete chunks ([ramesh31](https://news.ycombinator.com/item?id=48505940)). A modified skill limited to Tailwind components ([kirtivr](https://news.ycombinator.com/item?id=48181083)). [A]

**Palette and font constraints**
- Anthropic reports immediate improvement from naming fonts to avoid; paired screenshots chosen by the authors, no metrics. [S at best, V] — [Anthropic](https://claude.com/blog/improving-frontend-design-through-skills)

**Taking CSS away from the model**
- One user stopped having the LLM write CSS and does it personally ([atoav](https://news.ycombinator.com/item?id=48515125)). [A]

### Inferences
- The common factor among positive reports is an external source of decisions (a reference, a system, an explicit check). This is a pattern across anecdotes, not a tested conclusion.
- Critique loops seem to work best with a target to compare against or a checkable rule. Open-ended taste judgment is where the evidence is weakest (see measured section).

### Gaps
- No controlled test of DESIGN.md, tokens, or reference screenshots against a baseline with blinded raters was found.
- No AI-specific measurement of generating variations was found. NN/g's follow-up prompt for a distinctly different layout is described in its method, but the results I read do not report it.

## Which popular techniques failed or made things worse?

### Takeaway
The best-supported failure is that ban lists move the output to the next default instead of producing a design. Even the skill's authors now say so. Reports on Anthropic's frontend-design skill split sharply, and the skill's output is itself reported as recognizable.

### Cited Findings
**Anti-slop rules create new recognizable looks**
- Anthropic: with bans in place, Claude converged on new defaults such as Space Grotesk. [A, V, an admission against interest] — [Anthropic](https://claude.com/blog/improving-frontend-design-through-skills)
- Banning purple moves the model to the next most probable look; swapping one font or color alone does not work. Reviewed READMEs and skill files, no tests of its own. [A] — [Capital & Compute](https://capitalandcompute.net/blog/fix-ai-slop-design/)
- Users report seeing the new look: many similar brown sites ([smusamashah](https://news.ycombinator.com/item?id=48507500)), skill-built sites easy to spot ([efficax](https://news.ycombinator.com/item?id=48497957)), tools looking alike ([mahmedalam](https://news.ycombinator.com/item?id=48280827)), a recurring all-caps monospace caption ([bensyverson](https://news.ycombinator.com/item?id=49642823)), a move to Space Grotesk and IBM Plex Mono ([bbg2401](https://news.ycombinator.com/item?id=49446935)). [A]

**Mixed or negative reports on skills**
- Better results with: [halfmatthalfcat](https://news.ycombinator.com/item?id=48649025), [rib3ye](https://news.ycombinator.com/item?id=49330250), [lherron](https://news.ycombinator.com/item?id=48507451), [brinki](https://news.ycombinator.com/item?id=48514722). [A]
- Worse or doubtful: stronger models do better without it ([ValentineC](https://news.ycombinator.com/item?id=49291799)). It may mainly prime expectations ([hypfer](https://news.ycombinator.com/item?id=48513952)). Doubts it improves UI, though it may help those without UI spec experience ([viccis](https://news.ycombinator.com/item?id=48508403)). No output the user liked ([freedomben](https://news.ycombinator.com/item?id=48278342)). [A]
- A Habr commenter found it produced garish neon interfaces where plain Claude was practical and minimal. Search snippet, translated by the search tool. [A] — [Habr](https://habr.com/en/articles/1011524/comments)
- Web Claude was bolder than Claude Code, whose output still read as AI. Search snippet only; the page returned 404 on fetch. [A] — [Bare Metal Digest](https://baremetaldigest.substack.com/p/the-design-gap-between-claude-web)

**Other failures**
- Prompting alone ("make it look like Linear") gave inconsistent results across components. [A] — [Lavaee](https://alexlavaee.me/blog/lessons-learned-designing-with-ai/)
- Brand presets changed color and theme, not layout ([AnthonyR](https://news.ycombinator.com/item?id=48922497)). Its demos failed Lighthouse accessibility checks ([james2doyle](https://news.ycombinator.com/item?id=48922963)) and were not mobile-optimized ([jjcm, V](https://news.ycombinator.com/item?id=48923050)). [A]
- Criteria wording has side effects: "museum quality" language pushed designs toward a particular look. Complexity also rose across rounds. [A, V] — [Anthropic engineering](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- More detailed accessibility prompts did not yield fewer violations. Violations by prompt: basic 4, generic 4, visual 4, motor 2, comprehensive 3. The visual-focused prompt produced the only severity-2 issues (for example a 3.05:1 contrast). Only 17 violations in 90 UIs, so this is underpowered. [M, small] — [Guriță & Vatavu, DIS '25](https://mintviz.usv.ro/publications/2025.DIS.2.pdf)
- Critic prompts spend tokens on checks that could be deterministic ([_boffin_](https://news.ycombinator.com/item?id=48923595)). [A]
- GitHub stars are a weak quality signal; one 29,140-star skill had no push since 6 August when checked on 25 September 2026. [A, GitHub data] — [Capital & Compute](https://capitalandcompute.net/blog/fix-ai-slop-design/)

### Inferences
- Design Theater found color varied across tools more than layout and appearance did. That fits the complaint that palette and theme swaps leave the underlying look intact, though the study did not test swaps.
- If a shared skill is widely installed, it may act as a new shared default. Users report this, but adoption has not been linked to measured similarity.

### Gaps
- I found no before-and-after score, such as Krebs's checker, on a skill versus no-skill sample. His published [checker](https://github.com/AdrianKrebs/ai-design-checker) could support one.

## Is there measured evidence?

### Takeaway
Yes on the size of the problem, model and tool rankings, and accessibility. **Essentially no on which fixes work.** Design Creativity Bench says outright that it tested no intervention. The research base measures the disease, not the treatments.

### Cited Findings
| Study | Design | Key result | Caveats |
|---|---|---|---|
| [Design Creativity Bench](https://arxiv.org/html/2610.11539v1) (Oct 2026) | 15 models, 80 tasks, 2,400 designs vs human reference | Originality 0.592 vs 0.764; range 0.581 vs 0.902; appropriateness above 90% for all, Claude Opus 5.5 highest at 99.2%, humans 98.0%; T-score GPT-6 Astra 65.5, human 92.3 | Kombai authors (V). Own embedding metric. Default sampling. Humans could use inspiration libraries. "No diversity-seeking prompting was attempted." |
| [UI-Bench](https://arxiv.org/pdf/2508.20410) (Sep 2025) | 194 invited experts, 4,075 blinded pairs, 10 tools, 30 prompts; asks which you would deliver to a client | Orchids 30.12 (67.5% wins), Figma Make 27.46, Lovable 27.14, v0 22.24, Replit 20.95 (38.9%) | AfterQuery authors. Visual craft only. No human baseline. Default settings. Figma Make got shortened prompts. Generated Aug 2025, so now dated. Best human-judged design protocol I found. |
| [Design Theater](https://arxiv.org/pdf/2607.22928) (Jul 2026) | 5 tools, 24 tasks, 120 interfaces | ~25% of stated design rationale not implemented, 34% for functional requirements; mean principle adherence 0.54; 4 of 5 tools implement 6% or fewer functional principles; narrow differences in appearance and layout, colors vary more | Academic preprint |
| [EvoGenUI-Bench](https://arxiv.org/pdf/2608.29387) (Sep 2026) | 8 models, 150 five-turn tasks, 750 turns | Best model 74.9% per turn, only 37.3% of full episodes; presentation failures center on information architecture | NYU Shanghai preprint. About maintenance, not style. |
| [Guriță & Vatavu](https://mintviz.usv.ro/publications/2025.DIS.2.pdf) (DIS '25) | 90 UIs, 2 tools, 5 prompt types, 8 designer interviews | 73 of 90 no violations, none at severity 3-4; structural similarity 0.88-0.93 within each app type, also evident under accessibility prompts | Peer reviewed, small, 4 criteria, mobile mockups |
| [Generated Inaccessible](https://dl.acm.org/doi/10.1145/3800424.3800430) (W4A '26) | 54 designers, 6 tools, 21,880 assessments, 5 criteria | 29.0% compliance; contrast 26.8%; use of color 19.2% | **Search snippet only.** Human baseline values not seen. |
| [PerceptUI / WiserUI](https://arxiv.org/html/2606.05697) (Jun 2026) | 300 A/B-tested pairs | Claude Opus 4.6: 56.34% average, 26.44% consistent; GPT-5: 61.86% and 31.09%; for most baselines, first-position accuracy is far below second | Authors' own method reported best. Predicts A/B winners, not aesthetic quality. |
| [Krebs](https://www.adriankrebs.ch/blog/design-slop/) (Apr 2026) | 1,590 Show HN pages, deterministic checks | 22% / 32% / 46% tiers | Measures pattern density, not quality or authorship |

**Lower-trust or narrow:**
- [Design Arena](https://notes.designarena.ai/methodology/): anonymized pairwise votes, Bradley-Terry rating, no voter qualification stated, prompts pass through LLM enhancement. It measures preference, not usability. Paid evaluations are reported in [secondary sources](https://sacra.com/c/design-arena/), not confirmed on a primary page. Leaders vary by board and date. [M, crowd taste]
- [GenDesigns](https://gendesigns.ai/blog/llm-ui-generation-benchmark-2026): three raters, blinding unstated, no inter-rater agreement. The August "data" contains no new subjective scores, and the weighted totals do not all reconcile. It sells a UI generator. [V, low trust]
- [Startrise](https://www.startrise.io/blog/best-llm-for-frontend/): seen only in search; its method looked hard to check. Do not rely on it.
- FrontendBench tests behavior, not looks. Its expert agreement figure is 90.45% in [UI-Bench's citation](https://arxiv.org/pdf/2508.20410) and 90.54% in a [third-party summary](https://pith.science/paper/2506.13832); the original was not checked.
- Anthropic's [with and without skill screenshots](https://claude.com/blog/improving-frontend-design-through-skills) are authors' own picks with no metrics, so they do not count as a controlled comparison. [V]

### Inferences
- UI-Bench's confidence intervals overlap heavily (Orchids 26.61-33.55 versus Figma Make 24.11-30.81), so the "clear separation" language is stronger than the table for adjacent ranks.
- The UI-Bench protocol plus Krebs-style checks would be a cheap, credible template for testing fixes, which is the missing experiment.
- Kombai's humans had reference libraries, and models had none. The human originality advantage may partly reflect access to references, though the paper does not separate this.

### Gaps
- No controlled test comparing DESIGN.md, reference images, briefs, variations, or skills was found.
- Design Creativity Bench notes prior work reporting limited effects from prompting and sampling changes. I did not follow those citations.

## What do professional designers criticize beyond surface style?

### Takeaway
Hierarchy, grouping, context, flows and follow-through. Outputs read as polished at a glance and fail on inspection. Evidence that the stated reasoning is not actually implemented is a distinct and under-discussed finding.

### Cited Findings
- NN/g sums up results as "good from afar, but far from good": poor grouping and hierarchy, overused color, poor contrast, inconsistent margins. Bolt put a course-materials password far from its link. A Replit output pushed course content below a large profile photo. It does not assess IA or content separately. [S] — [NN/g](https://www.nngroup.com/articles/ai-prototyping/)
- **Rationales overclaim:** roughly a quarter of stated design reasoning is not in the interface, and non-designers may read it as competence. [M] — [Design Theater](https://arxiv.org/pdf/2607.22928)
- **Information architecture:** presentation failures in multi-turn work center on IA. [M] — [EvoGenUI-Bench](https://arxiv.org/pdf/2608.29387)
- **Accessibility and specialized needs:** interviewees describe "accessibility handcuffs", where compliance arrives as uniform patterns that do not adapt to specific user needs. A senior designer argues models return the most common pattern, which leaves out marginalized users. [S, n=8 interviews] — [Guriță & Vatavu](https://mintviz.usv.ro/publications/2025.DIS.2.pdf)
- **Inspection failures:** a product designer says UIs can look designed yet carry usability gaps ([squid_fm](https://news.ycombinator.com/item?id=45696741)). Inconsistencies show on closer look ([chorkpop](https://news.ycombinator.com/item?id=48506571)). Output drifts without constant pushback ([kvasserman](https://news.ycombinator.com/item?id=48506755)). UX hid the core task more than the look did ([weitendorf](https://news.ycombinator.com/item?id=49778446)). Desktop-style pages break on mobile ([dizhn](https://news.ycombinator.com/item?id=48517064)). [A]
- **Missing states and flows:** empty, loading, error and permission states are reported as routinely absent, and single-screen generation is criticized as a dead end. These come from a cluster of search snippets I could not attribute line by line. Not measured. [A, partly V] — [13Labs](https://www.13labs.au/guides/beyond-the-prototype-ui), [UXMagic, V](https://uxmagic.ai/blog/single-screen-ai-design-dead-end), [VP0, V](https://vp0.com/blogs/designing-ios-empty-states-that-feel-intentional). The 13Labs guide also says no peer-reviewed research exists on AI interface homogeneity, which [Guriță & Vatavu](https://mintviz.usv.ro/publications/2025.DIS.2.pdf) contradicts.
- **Content:** fabricated statistics need separate removal since visual rules cannot catch them. [A] — [Capital & Compute](https://capitalandcompute.net/blog/fix-ai-slop-design/)

### Inferences
- Removing visual tells can make a page look more trustworthy without fixing any of this, which may increase over-trust. This extends Design Theater's concern about non-designer reviewers and is not separately tested.

### Gaps
- I found no dedicated content-quality or microcopy study of AI UI, and no measured rate of missing states.
- UI-Bench deliberately excludes accessibility and code quality and makes no failure-mode claims, though it plans a labeled dataset.

## Where do practitioners disagree?

### Takeaway
The sharpest splits: whether the look is an AI problem at all, whether it matters, whether skills help, whether models can critique design, and how accessible the output is.

### Cited Findings
- **AI problem or inherited defaults?** Traits predate AI ([nomdep](https://news.ycombinator.com/item?id=47865416)), versus models reproducing the web's mediocre average ([classified](https://news.ycombinator.com/item?id=47873197), [userbinator](https://news.ycombinator.com/item?id=47872415)). The Goree finding supports the first camp in part, via [Design Theater](https://arxiv.org/pdf/2607.22928).
- **Does sameness matter?** "Just uninspired" ([Krebs](https://www.adriankrebs.ch/blog/design-slop/)), and custom styling and flashy motion can be worse for users than platform conventions ([DaiPlusPlus](https://news.ycombinator.com/item?id=49330562)). "Slop" is a subjective label ([llm_nerd](https://news.ycombinator.com/item?id=48505774)). On the other side, UI-Bench cites a 2001 Stanford finding that 46% of comments on credibility mentioned look and feel ([UI-Bench](https://arxiv.org/pdf/2508.20410), second-hand). Guriță & Vatavu acknowledge that consistent, predictable patterns are themselves an accessibility principle ([paper](https://mintviz.usv.ro/publications/2025.DIS.2.pdf)).
- **Do skills help?** Compare [brinki](https://news.ycombinator.com/item?id=48514722) with [Exoristos](https://news.ycombinator.com/item?id=48513783) and [hypfer](https://news.ycombinator.com/item?id=48513952).
- **Model or method?** Decent results need Opus plus the skill ([lherron](https://news.ycombinator.com/item?id=48507451)). Fable did well with no skills ([satvikpendem](https://news.ycombinator.com/item?id=48519595)). A commenter's screenshot test favored GPT-5.6 Sol over Claude on structure ([weli](https://news.ycombinator.com/item?id=49330004)). UI-Bench's authors point to tooling over model choice ([UI-Bench](https://arxiv.org/pdf/2508.20410)).
- **Can LLMs critique design?** Anthropic finds a tuned separate evaluator tractable ([Anthropic engineering, V](https://www.anthropic.com/engineering/harness-design-long-running-apps)). A commenter who sells a diffusion-based design tool says LLM review does not fix sameness ([jjcm, V](https://news.ycombinator.com/item?id=48923018)). Baseline judges are order-biased on A/B winners ([PerceptUI](https://arxiv.org/html/2606.05697)).
- **Is slop a style or a quality?** Volpe says it sits on top of any style ([post](https://envs.net/~volpe/blog/posts/reduce-slop.html)). Reaction to his Qt result split too: much better ([Retr0id](https://news.ycombinator.com/item?id=48505406), V: links own page), versus hideous ([Gander5739](https://news.ycombinator.com/item?id=48506549)).
- **shadcn: helper or tell?** Predictable components help models recombine ([prg.sh](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website)), versus a flagged pattern ([Krebs](https://www.adriankrebs.ch/blog/design-slop/)).
- **Is basic craft already fine?** Anthropic says Claude usually passes craft and functionality by default ([Anthropic engineering, V](https://www.anthropic.com/engineering/harness-design-long-running-apps)), which conflicts with [NN/g](https://www.nngroup.com/articles/ai-prototyping/) and [Design Theater](https://arxiv.org/pdf/2607.22928). The studies cover different tools, models and dates.
- **How accessible is it?** Low severity, 73 of 90 clean ([Guriță & Vatavu](https://mintviz.usv.ro/publications/2025.DIS.2.pdf)), versus 29.0% compliance ([Generated Inaccessible](https://dl.acm.org/doi/10.1145/3800424.3800430), snippet only). Tools, criteria and scoring differ, and Guriță appears as an author on both per search results, so this looks like scope difference more than a contradiction. Whether agents fix it when asked: [HN comment](https://news.ycombinator.com/item?id=47865330), [victorbjorklund](https://news.ycombinator.com/item?id=47867266) say yes. Guriță & Vatavu's prompt results are not encouraging.

### Inferences
- Many disputes dissolve into audience: non-designers report large gains from any skill or named style, while experienced reviewers see the new default. Viccis's comment suggests this, but no study segments results by expertise.
- Design Theater's quality claims and Anthropic's craft claim may both hold if evaluating self-chosen landing pages versus functional briefs. That is untested.

### Gaps
- Reddit's view of these disputes is missing, as noted at the top.
- A search also surfaced a claim that accessibility-oriented prompts improve generated UIs. I could not tie it to a specific paper, so it needs checking before use, particularly since it would conflict with Guriță & Vatavu.
