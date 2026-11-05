# Design Guidance in AI UI Builder System Prompts and Rules Files

Evidence tags used throughout:
- **[OFFICIAL]**: published by the vendor. Strongest evidence of what the vendor recommends, though it is not proof of what its product's hidden prompt says.
- **[UNOFFICIAL COPY]**: a prompt collected in a public repo. Authenticity is unverified, and it may be outdated or wrong. It is not a fact about the current product.
- **[COMMUNITY]**: user-written rules.
- **[SECONDARY]**: a third-party write-up.

All research date references are as of 2026-11-02. Scope excludes design skill packs and forum sentiment.

## What do the v0, Lovable, Bolt, Same.dev, Replit, Google Stitch, Claude artifacts and Figma Make system prompts say about design?

### Takeaway
Copies exist for only some of these products, and they range from April 2025 to October 2026. v0 and Lovable are the most prescriptive. v0 sets numeric caps, while Lovable is built around a token-first design system. Copies for Bolt, Replit and AI Studio Build have almost no visual guidance. No Figma Make copy was found, and the only Stitch evidence is a May 2025 write-up of a leak. Claude's copies changed the most, from inline guidance favoring bold effects in 2025 to a dedicated skill and restrained rules in 2026.

### Cited Findings

**Copy inventory and dates.** "Commit date" is the last change to that file in the collection, not a confirmed product date. The v0, Lovable and Same.dev copies also embed a "current date" matching their commit date, which suggests capture around then. Neither main repo verifies authenticity: x1xhlol gives no sourcing explanation, and asgeirtj calls its files verbatim without saying how each was obtained. — [x1xhlol repo](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools); [asgeirtj repo](https://github.com/asgeirtj/system_prompts_leaks)

| Product | Copy | Commit date | Design content | How I read it |
|---|---|---|---|---|
| v0 | [x1xhlol Prompt.txt](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/v0%20Prompts%20and%20Tools/Prompt.txt) | 2026-05-10 | Long, numeric | Raw text checked |
| Lovable | [x1xhlol Agent Prompt.txt](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Lovable/Agent%20Prompt.txt) | 2025-09-16 | Long, token-centered | Raw text checked |
| Same.dev | [x1xhlol Prompt.txt](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Same.dev/Prompt.txt) | 2025-08-29 | Short | Raw text checked |
| Replit | [x1xhlol Prompt.txt](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Replit/Prompt.txt) | 2025-07-26 | Almost none | Summarized read |
| Bolt | [x1xhlol Open Source prompts/Bolt](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Open%20Source%20prompts/Bolt/Prompt.txt) | 2025-04-21 | Almost none | Summarized read |
| Claude.ai (Sonnet 4.5) | [x1xhlol](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Anthropic/Sonnet%204.5%20Prompt.txt) | 2025-09-29 | Inline principles | Raw text checked |
| Claude.ai (Sonnet 5) | [x1xhlol](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Anthropic/Claude%20Sonnet%205.txt) | 2026-07-06 | Routes to a skill | Raw text searched |
| Claude.ai (Fable 5) | [x1xhlol](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Anthropic/Claude%20Fable%205.txt) | 2026-06-12 | Routes to a skill | Raw text searched |
| Claude Design | [asgeirtj claude-design.md](https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/Anthropic/claude-design/claude-design.md) | 2026-10-07 | Extensive | Partly raw, first 100k chars summarized |
| Claude artifact type "Design" | [asgeirtj SKILL.md](https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/Anthropic/artifact-types/design/SKILL.md) | 2026-10-10 | Extensive | Summarized read |
| Google AI Studio Build | [asgeirtj](https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/Google/ai-studio-build.md) | 2026-03-15 | Little | Summarized read |
| Google Antigravity (adjacent, not a UI builder) | [x1xhlol planning-mode](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Google/Antigravity/planning-mode.txt) | 2025-11-19 | Moderate | Summarized read |
| Google Stitch | No raw copy read. [DEV write-up](https://dev.to/yang_ella_f2a3e16ccb54550/google-stitch-system-prompt-leaked-analysis-and-insights-23dp) points to an entry dated 2025-05-24 | n/a | Workflow only | Secondary only |
| Figma Make | None found in either repo or by search | n/a | n/a | Official docs only |

**Per product**
- **v0 [UNOFFICIAL COPY, 2026-05]:** Has a dedicated design guidelines section with hard numeric caps. Its headline color rule reads "ALWAYS use exactly 3-5 colors total." It also bans filler blobs and emoji icons, and closes by telling the model to prefer interesting over boring without being ugly. — [v0 copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/v0%20Prompts%20and%20Tools/Prompt.txt)
- **Lovable [UNOFFICIAL COPY, 2025-09]:** The central rule is "The design system is everything." Styling goes through tokens in `index.css` and `tailwind.config.ts` plus shadcn variants, with no ad hoc component styles. It names beautiful design as the top priority and tells the model to impress the user on first contact. — [Lovable copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Lovable/Agent%20Prompt.txt)
- **Same.dev [UNOFFICIAL COPY, 2025-08]:** A short `web_design` block: "NEVER stay with default shadcn/ui components," no emoji, avoid purple, indigo and blue unless asked, use attached image colors, and stay responsive. Most other design text concerns website cloning. — [Same.dev copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Same.dev/Prompt.txt)
- **Bolt [UNOFFICIAL COPY, 2025-04, open-source variant]:** Covers WebContainer, Supabase and artifact formatting, with no color, type, layout or state guidance. This may not reflect the commercial product. — [Bolt copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Open%20Source%20prompts/Bolt/Prompt.txt)
- **Bolt [OFFICIAL]:** Bolt's docs show an example user-settable system prompt asking for designs that are "beautiful, not cookie cutter," with lucide-react icons and Unsplash photos. This is an example, not the built-in prompt (seen through a search summary). — [Bolt docs](https://support.bolt.new/docs/prompting-effectively). An April 2025 post claims the agent moved away from generic components but gives no rules. — [Bolt blog](https://bolt.new/blog/say-goodbye-to-boring-uis-bolt-design-updates)
- **Replit [UNOFFICIAL COPY, 2025-07]:** Describes an IDE assistant with no visual design rules. It predates Replit Design and should not be read as that product's prompt. — [Replit copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Replit/Prompt.txt)
- **Stitch [SECONDARY on an UNOFFICIAL leak, 2025-05]:** The write-up attributes a UX designer role, one platform per thread, up to six screens per generation, 2 to 6 proposed concepts for vague requests, no image generation, and refusal of non-UI requests. It attributes no palette, type or spacing rules, and the author does not explain any verification. — [DEV](https://dev.to/yang_ella_f2a3e16ccb54550/google-stitch-system-prompt-leaked-analysis-and-insights-23dp)
- **Google AI Studio Build [UNOFFICIAL COPY, 2026-03]:** Asks for polished, production-ready apps with Tailwind and adequate contrast, and no specific aesthetic. — [AI Studio Build copy](https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/Google/ai-studio-build.md)
- **Google Antigravity [UNOFFICIAL COPY, 2025-11]:** Calls basic-looking output a failure. It recommends curated HSL palettes, dark modes, gradients, glassmorphism, micro-animations and hover effects, plus fonts such as Inter, Roboto or Outfit. It also prefers vanilla CSS over Tailwind unless asked. — [Antigravity copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Google/Antigravity/planning-mode.txt)
- **Claude artifacts, 2025 [UNOFFICIAL COPY, 2025-09]:** Separates complex apps (functionality first) from landing pages (emotional impact). For the latter it defaults to trends such as "dark modes, glassmorphism, micro-animations, 3D elements, bold typography, vibrant gradients," treats static design as the exception, and prefers bold over safe. — [Sonnet 4.5 copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Anthropic/Sonnet%204.5%20Prompt.txt)
- **Claude artifacts, 2026 [UNOFFICIAL COPIES]:** A search of the Sonnet 5 and Fable 5 copies finds none of the earlier inline phrases. They instead direct the model to a `frontend-design` skill file for UI work. — [Sonnet 5 copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Anthropic/Claude%20Sonnet%205.txt); [Fable 5 copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Anthropic/Claude%20Fable%205.txt). The "Design" artifact type copy says to pick a design system first, avoid the default cream, serif and clay palette unless the brief calls for it, and avoid Inter, Roboto and Arial. — [Design type copy](https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/Anthropic/artifact-types/design/SKILL.md)
- **Claude Design [UNOFFICIAL COPY, 2026-10]:** Follows the existing visual vocabulary when adding to a UI, uses brand colors or oklch, and lists tropes to avoid: aggressive gradient backgrounds, emoji, rounded containers with left-border accents, and Inter, Roboto, Arial and Fraunces. — [Claude Design copy](https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/Anthropic/claude-design/claude-design.md). Separate reports say Anthropic has not confirmed the leak. — [BestHub](https://www.besthub.dev/articles/what-s-inside-the-leaked-70k-word-claude-design-system-prompt-2c6ba1d2386a); [Lobsterpack](https://www.lobsterpack.com/blog/claude-design-trenchcoat/)
- **Figma Make [OFFICIAL, docs only]:** The default `Guidelines.md` template favors flexbox and grid over absolute positioning, small files, and component usage with variants. Figma warns that more context can confuse the model. The page is undated. — [Figma Help](https://help.figma.com/hc/en-us/articles/33665861260823-Add-guidelines-to-Figma-Make)

### Inferences
- Prompt size and strictness do not track each other. Lovable's copy is emphatic but gives few numbers, while v0's gives many.
- Anthropic's copies show a direct reversal between 2025 and 2026 on gradients and bold defaults. If the copies are genuine, this may be a response to the convergence problem Anthropic describes in its official docs.

### Gaps
- No current prompt copy found for Bolt's commercial agent, Replit Design or Figma Make, and I did not read the raw Stitch copy. Their real instructions remain unknown.
- The Lovable and Same.dev copies are over a year old, so current behavior could differ substantially.
- None of these copies can be confirmed by vendors, and none of the vendors has published a matching prompt.

## What concrete rules do they give for color count, typography, layout, spacing, components, images, and interaction states?

### Takeaway
Numeric rules cluster on color and fonts: 1 to 2 accents and about 2 typefaces. Spacing rules are about using a scale, not specific values. Interaction states are the weakest area in builder prompts. The v0 copy has no hover, focus or animation rule at all. Detailed state guidance sits instead in Vercel's guidelines and in Bolt's prompting advice.

### Cited Findings

**Color**
- v0 [UNOFFICIAL COPY]: 3 to 5 colors: 1 primary, 2 to 3 neutrals, 1 to 2 accents. No prominent purple or violet. Avoid gradients unless asked. If needed, they must be subtle accents, analogous, with 2 to 3 stops. — [v0 copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/v0%20Prompts%20and%20Tools/Prompt.txt)
- OpenAI [OFFICIAL]: one accent by default, CSS variables, no purple-on-white default, and no flat single-color backgrounds. — [OpenAI](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4)
- Anthropic [OFFICIAL]: no numeric count. Dominant colors with sharp accents beat evenly spread palettes. Use CSS variables, and draw on IDE themes and cultural aesthetics. — [Anthropic cookbook](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics)
- Claude Design [UNOFFICIAL COPY]: 0 to 2 accents in oklch with the same chroma and lightness, varying only hue. — [Claude Design copy](https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/Anthropic/claude-design/claude-design.md)
- Lovable [UNOFFICIAL COPY]: no count. HSL only, primary plus glow tokens, gradient tokens, and no raw `text-white` or `bg-white`. — [Lovable copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Lovable/Agent%20Prompt.txt)

**Typography**
- v0 [UNOFFICIAL COPY]: at most 2 families, body line height 1.4 to 1.6, no text under 14px, no decorative body fonts. — [v0 copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/v0%20Prompts%20and%20Tools/Prompt.txt)
- OpenAI [OFFICIAL]: two typefaces at most without a clear reason. Avoid Inter, Roboto, Arial and system stacks. Define display, headline, body and caption roles. — [OpenAI](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4)
- Anthropic [OFFICIAL]: its isolated typography prompt bans Inter, Roboto, Open Sans, Lato and system fonts. It suggests 100/200 against 800/900 weights, size jumps of 3x or more, one distinctive font used decisively, and stating the choice before coding. It lists named options by category, including JetBrains Mono, Fraunces, Clash Display and IBM Plex. — [Anthropic cookbook](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics)
- Claude Design and Design type [UNOFFICIAL COPIES]: 1 to 3 typefaces, 4.5:1 body contrast and 3:1 for large type. — [Claude Design copy](https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/Anthropic/claude-design/claude-design.md); [Design type copy](https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/Anthropic/artifact-types/design/SKILL.md)

**Layout**
- v0 [UNOFFICIAL COPY]: mobile-first, flexbox by default, grid only for complex 2D layouts, avoid floats and absolute positioning. — [v0 copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/v0%20Prompts%20and%20Tools/Prompt.txt)
- OpenAI [OFFICIAL]: one H1, no more than six sections, one primary CTA above the fold, full-bleed hero by default, and a hero limited to brand, headline, one sentence, CTA group and one image. Each section has one job. No cards by default, and never in the hero. — [OpenAI](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4)
- Anthropic [OFFICIAL]: no layout numbers, only an instruction to avoid predictable layouts and component patterns. — [Anthropic cookbook](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics)
- Lovable [UNOFFICIAL COPY]: responsive layouts, one H1, title under 60 characters, description under 160. — [Lovable copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Lovable/Agent%20Prompt.txt)

**Spacing**
- v0 [UNOFFICIAL COPY]: use the Tailwind scale instead of arbitrary values, prefer `gap`, and never use `space-*`. — [v0 copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/v0%20Prompts%20and%20Tools/Prompt.txt)
- DESIGN.md [OFFICIAL, Google Labs, alpha]: spacing is a token section alongside colors, typography, rounded and components. — [DESIGN.md README](https://raw.githubusercontent.com/google-labs-code/design.md/main/README.md)
- I found no product prompt or vendor guide that sets a specific base unit, such as a 4px or 8px grid.

**Components**
- v0 [UNOFFICIAL COPY]: pre-installed shadcn components in new-york style. — [v0 copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/v0%20Prompts%20and%20Tools/Prompt.txt)
- Lovable [UNOFFICIAL COPY]: customize shadcn through named variants, never with overrides. — [Lovable copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Lovable/Agent%20Prompt.txt)
- Same.dev [UNOFFICIAL COPY]: edit each shadcn component before building the app. — [Same.dev copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Same.dev/Prompt.txt)
- Bolt [OFFICIAL]: reference design system components by exact name. — [Bolt support](https://support.bolt.new/building/design-system/best-practices)

**Images**
- Generate or use real images, no placeholders: v0 and Lovable [UNOFFICIAL COPIES]; Antigravity [UNOFFICIAL COPY]. — [v0 copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/v0%20Prompts%20and%20Tools/Prompt.txt); [Lovable copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Lovable/Agent%20Prompt.txt); [Antigravity copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Google/Antigravity/planning-mode.txt)
- OpenAI [OFFICIAL]: in-situ photography over abstract gradients or fake 3D, at least one strong image for brand and venue pages, calm tonal areas for text, and no generated images with UI frames built in. — [OpenAI](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4)
- Same.dev [UNOFFICIAL COPY]: find images by web search or Unsplash and link directly. — [Same.dev copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Same.dev/Prompt.txt)
- Claude Design [UNOFFICIAL COPY]: no complex hand-drawn SVG. Use labeled striped placeholders and request real assets. — [Claude Design copy](https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/Anthropic/claude-design/claude-design.md)
- Bolt [OFFICIAL]: stock illustrations or placeholder images are acceptable for layout. — [Bolt blog](https://bolt.new/blog/prompting-tips-for-bolt)

**Interaction states and motion**
- Vercel [OFFICIAL for Vercel Labs]: the most complete source. Visible `:focus-visible`, 24px hit targets (44px on mobile), buttons that keep labels while loading, designed empty, sparse, dense and error states, `prefers-reduced-motion`, animate only `transform` and `opacity`, and never `transition: all`. — [Vercel guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/README.md)
- Bolt [OFFICIAL]: tells users to describe focus, hover, invalid and disabled states. — [Bolt blog](https://bolt.new/blog/prompting-tips-for-bolt)
- Anthropic [OFFICIAL]: one well-orchestrated staggered page load beats scattered micro-interactions. CSS-only for HTML and the Motion library for React. — [Anthropic cookbook](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics)
- OpenAI [OFFICIAL]: at least 2 to 3 intentional motions, removed if purely ornamental. — [OpenAI](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4)
- A search of the v0 copy finds no hover, focus, animation or transition rule. Accessibility guidance is limited to alt text, semantic HTML, ARIA and contrast overrides. — [v0 copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/v0%20Prompts%20and%20Tools/Prompt.txt)

### Inferences
- Rules that can be checked mechanically (color count, font count, hex bans) are common because they are easy to state. Harder qualities like hierarchy and rhythm are rarely specified.
- Builders appear to spend prompt budget on first-impression aesthetics rather than the states real apps need. Loading, empty, and error states are nearly absent from the builder copies I checked.

### Gaps
- I did not exhaustively read every long copy for interaction state rules. Claude Design's copy has a state-related section I saw only partly, and the Design type refers to a separate `craft.md` that I did not read.
- No source measures whether any numeric rule improves results. Anthropic's evidence is qualitative screenshots only. — [Anthropic blog](https://claude.com/blog/improving-frontend-design-through-skills)

## Do they run a planning or design direction step before generating code? How do they choose a direction?

### Takeaway
Most do something, but in four different ways: a private brief, a user choice among options, inheriting a design system, or following references. Only v0 appears to have a dedicated direction tool, and that evidence is an unofficial copy. Anthropic's official guidance is the most specific on method: propose several directions and let the user pick.

### Cited Findings

**Private brief, no user gate**
- v0 [UNOFFICIAL COPY]: requires a `GenerateDesignInspiration` tool call before any design work, which produces a design brief. — [v0 copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/v0%20Prompts%20and%20Tools/Prompt.txt)
- Lovable [UNOFFICIAL COPY]: on the first message, the model writes what the request evokes, names inspiring designs, lists features, and lists colors, gradients, animations and fonts, then starts with the design system. It also assumes the user probably wants code rather than discussion. — [Lovable copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Lovable/Agent%20Prompt.txt)
- Antigravity [UNOFFICIAL COPY]: understand requirements and draw inspiration, then tokens in `index.css`, components, pages, and polish. — [Antigravity copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Google/Antigravity/planning-mode.txt)
- OpenAI [OFFICIAL]: define the design system, constraints, references and page narrative up front. Its frontend skill writes a one-sentence visual thesis, a content plan and 2 to 3 interaction ideas. — [OpenAI](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4)

**User chooses among options**
- Anthropic [OFFICIAL]: for Opus 4.8 and Sonnet 5, "propose 4 distinct visual directions," each given as background hex, accent hex, typeface and a one-line rationale, then implement only the chosen one. It is presented as the way to get variety, including where `temperature` is unavailable. — [Opus 4.8 guide](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8); [Sonnet 5 guide](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5)
- Claude Design [UNOFFICIAL COPY]: asks about variations and at least 4 problem-specific questions, and skips questions when the inputs are clear. — [Claude Design copy](https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/Anthropic/claude-design/claude-design.md)
- Replit [OFFICIAL]: a Design tab sits apart from Build. Each result is a frame, suggestions offer other approaches, layouts or vibes, and the same brief can go to another model for a more distinct direction. — [Replit Design](https://docs.replit.com/design/what-is-replit-design)
- Bolt [OFFICIAL]: use Discussion Mode to confirm the look before generating, and compare drafts of the opening prompt. — [Bolt blog](https://bolt.new/blog/prompting-tips-for-bolt)
- Stitch [SECONDARY on an UNOFFICIAL leak]: proposes 2 to 6 screen concepts for vague requests, and confirms multi-screen lists. These are product concepts rather than visual directions. — [DEV](https://dev.to/yang_ella_f2a3e16ccb54550/google-stitch-system-prompt-leaked-analysis-and-insights-23dp)

**Inherit from a design system**
- Claude Design type [UNOFFICIAL COPY]: pick a design system first, and only build a custom look if none applies. Commit to one look and state assumptions briefly. — [Design type copy](https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/Anthropic/artifact-types/design/SKILL.md)
- Figma Make, Bolt and Replit [OFFICIAL]: all document stored guidelines or design systems as the source of direction. — [Figma Help](https://help.figma.com/hc/en-us/articles/33665861260823-Add-guidelines-to-Figma-Make); [Bolt support](https://support.bolt.new/building/design-system/best-practices); [Replit Design](https://docs.replit.com/design/what-is-replit-design)

**Follow user-provided direction**
- Lovable [OFFICIAL]: choose a direction such as calm, bold or premium before building, then save those keywords to project instructions. — [Lovable docs](https://docs.lovable.dev/prompting/prompting-one)
- v0 [OFFICIAL]: state the product surface, the context of use, and constraints and taste. — [Vercel blog, 2025-12-15](https://vercel.com/blog/how-to-prompt-v0)
- Stitch [apparently first-party, unlabeled forum post]: adjectives set the vibe, which shapes colors, fonts and imagery. Change one or two things per prompt. — [Stitch guide, 2025-05-19](https://discuss.ai.google.dev/t/stitch-prompt-guide/83844)
- Anthropic [OFFICIAL]: name a theme or inspiration, as in its Solarpunk example. — [Anthropic cookbook](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics)

**Little or no direction step**
- Same.dev [UNOFFICIAL COPY]: only for cloning, where the model analyzes the design and shares a plan on fonts, colors and spacing. — [Same.dev copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Same.dev/Prompt.txt)
- AI Studio Build [UNOFFICIAL COPY]: outline a plan only when asked. — [AI Studio Build copy](https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/Google/ai-studio-build.md)

### Inferences
- Writing a private brief may not break the model's defaults by itself, since the same model produces the brief. Anthropic's official claim about user-picked options supports this indirectly, but no source tests it directly.
- Direction steps create friction. Anthropic's Opus 4.8 guide also advises reducing human interactions in coding products, so the two pieces of advice need balancing. One possible resolution is asking only when the brief is open-ended.

### Gaps
- The v0 copy shows when the inspiration tool runs, but not how it chooses a direction. Its internal prompt is not in the copy I read.
- I found no public comparison of the output quality of these approaches.

## What do popular design-focused Cursor rules and rules collections say?

### Takeaway
Popular collections mostly encode stack and code conventions, not visual design. Vercel's Web Interface Guidelines is the main exception, and it focuses on interaction and craft rather than aesthetic direction.

### Cited Findings
- **Vercel Web Interface Guidelines [OFFICIAL for Vercel Labs, not v0's prompt; last commit 2026-10-05]:** A living, non-exhaustive checklist that is framework-agnostic for the most part and built for agent use. Beyond the state rules above, it covers: alignment to a grid or optical center; testing on mobile, laptop and ultra-wide; at least two shadow layers with semi-transparent borders; concentric child radii; borders tinted toward the background hue; APCA preferred over WCAG 2; curly quotes and ellipsis characters; and inline help over tooltips. — [Vercel guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/README.md)
- **awesome-cursorrules [COMMUNITY; about 41.1k stars; last commit 2026-05-30]:** From the repo's index, only two entries look clearly design-focused, Toss-Style Design System and Landing Page Image Quality. Most UI entries are per-framework guides for Tailwind, shadcn or Chakra. This classification comes from a summarized read of the index, so the count is approximate. — [awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules)
- **Toss-Style rule [COMMUNITY]:** One primary accent plus four semantic status colors, no gradients, grayscale carrying the structure, dark gray rather than pure black. Five type roles with hierarchy from weight and color rather than size. One spacing token set, one radius, subtle shadows, no nested cards, status never by color alone, WCAG AA, and a rebuilt grayscale for dark mode. — [Toss rule](https://raw.githubusercontent.com/PatrickJS/awesome-cursorrules/main/rules/toss-style-design-system.mdc)
- **cursor.directory [SECONDARY]:** A Japanese translation of its top Next.js rule, by Pontus Abrahamsson, shows a stack rule (Next.js, shadcn, Radix, Tailwind) with mobile-first responsive design, plus React Server Component guidance and no aesthetic rules. — [Zenn](https://zenn.dev/nagisora/articles/ea823063a0e9c3)
- **Tailwind and shadcn rule set [COMMUNITY, updated 2026-06-08]:** Check existing primitives first, use `variant` and `size` before className overrides, use `cn()`, and avoid dynamic class names like `bg-${color}-500`. These are code rules rather than visual ones. — [PasteCode](https://pastecode.xyz/rules/cursor-rules-for-tailwind-shadcn)
- **User-side rule mechanisms [OFFICIAL]:** Bolt's Project and System Prompts, Lovable's project instructions and Figma's `Guidelines.md` are the first-party equivalents of a rules file. — [Bolt blog](https://bolt.new/blog/prompting-tips-for-bolt); [Lovable docs](https://docs.lovable.dev/prompting/prompting-one); [Figma Help](https://help.figma.com/hc/en-us/articles/33665861260823-Add-guidelines-to-Figma-Make)

### Inferences
- Rules files and builder prompts solve different problems. Rules files mostly prevent code errors, builder prompts push for visual appeal, and Vercel's guide covers quality in use. A complete guide would likely need all three layers.
- Toss's rule shows a restrained, product-UI philosophy that most builder prompts lack. It is closer to what a dashboard or tool needs than the landing-page advice found elsewhere.

### Gaps
- cursor.directory returned HTTP 429, so I could not read its rule pages directly or get install rankings. Its "popular" rules are represented only through one secondary translation.
- Star counts measure repo popularity, not use of individual rules. I found no per-rule usage data.

## Which official first-party documents exist on this topic?

### Takeaway
Anthropic and OpenAI both publish detailed frontend design prompting guidance, and they agree on most of the diagnosis. I found no comparably detailed Google guide I could read: Google's evidence is an AI Studio learning page I could not render, a forum guide, and the DESIGN.md spec.

### Cited Findings

**Anthropic [OFFICIAL]**
- *Prompting for frontend aesthetics* (cookbook, 2025-10-21, Prithvi Rajasekaran): covers typography, color and theme, motion and backgrounds, and includes an avoid list. Recommends also varying light and dark themes and fonts, noting convergence on Space Grotesk. — [Anthropic cookbook](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics)
- *Improving frontend design through skills* (blog, 2025-11-12): attributes generic output to "distributional convergence," since safe designs dominate web training data. Argues for loading guidance only when relevant, and reports only qualitative screenshot comparisons. — [Anthropic blog](https://claude.com/blog/improving-frontend-design-through-skills)
- *Prompting best practices*: includes a Frontend design section and a `frontend_aesthetics` snippet aimed at Opus 4.5 and 4.6, naming the "AI slop" aesthetic. — [Best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- *Prompting Claude Opus 4.8* (undated): says the model has a house style of warm cream backgrounds around `#F4F1EA`, serif display type (Georgia, Fraunces, Playfair), italic accents, and terracotta or amber. This suits editorial briefs but not dashboards, dev tools, fintech, healthcare or enterprise apps. Generic bans just move it to another fixed palette. Two reliable fixes are a concrete specification or proposing options. Opus 4.8 also needs less design prompting than earlier models. — [Opus 4.8 guide](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8)
- *Prompting Claude Sonnet 5* (undated): gives the same two fixes without naming the palette, and notes `temperature` returns an error on this model. — [Sonnet 5 guide](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5)

**OpenAI [OFFICIAL]**
- *Designing delightful frontends with GPT-5.4* (date not shown on the page): the fullest rule set found. It covers tokens, constraints, heroes, cards, copy, imagery, motion and litmus checks, and suggests starting at low reasoning effort for simpler sites and using Playwright to check rendered pages. — [OpenAI](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4); press coverage at [The Decoder](https://the-decoder.com/openai-publishes-a-prompting-playbook-that-helps-designers-get-better-frontend-results-from-gpt-5-4/)
- *Frontend with GPT-5* (cookbook, undated, marked archived): lists Next.js, Tailwind, shadcn/ui, Radix Themes, Lucide, Motion, and fonts including Inter, Geist and Manrope. Sets no color or layout rules. — [OpenAI cookbook](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_frontend)

**Google [OFFICIAL or apparently first-party]**
- *AI UI design: 8 ways to make vibe-coded apps look better*: exists on AI Studio's learning hub, but the page rendered empty for me. A search summary says it recommends reference screenshots, extracting design language from sites you like, and using design terminology. Treat that as unverified. — [AI Studio Learn](https://aistudio.google.com/learn/ai-ui-design-google-ai-studio)
- *Stitch prompting guide*: a docs page exists but rendered empty for me. — [Stitch docs](https://stitch.withgoogle.com/docs/learn/prompting/). The readable version is a forum post that appears first-party but carries no official label. — [Stitch guide](https://discuss.ai.google.dev/t/stitch-prompt-guide/83844)
- *DESIGN.md* (alpha): a format pairing YAML tokens with prose rationale, with ordered sections from Overview through Do's and Don'ts, and a linter that warns below WCAG AA 4.5:1. — [DESIGN.md README](https://raw.githubusercontent.com/google-labs-code/design.md/main/README.md). A search summary dates its open-sourcing announcement to 2026-04-21, which I did not confirm at the source. — [MindStudio](https://www.mindstudio.ai/blog/google-stitch-design-md-claude-code-consistent-ui)

**Builder vendors [OFFICIAL]**
- Vercel: *How to prompt v0* (2025-12-15). — [Vercel blog](https://vercel.com/blog/how-to-prompt-v0)
- Lovable: prompting docs on buzzwords, specific wording and project instructions (undated). — [Lovable docs](https://docs.lovable.dev/prompting/prompting-one)
- Bolt: prompting tips (2025-09-25) and design system best practices (undated). — [Bolt blog](https://bolt.new/blog/prompting-tips-for-bolt); [Bolt support](https://support.bolt.new/building/design-system/best-practices)
- Replit: Design docs (undated). The older Design Mode page says Gemini 3 powers it and that it builds front-end only (seen through a search summary). — [Replit Design](https://docs.replit.com/design/what-is-replit-design); [Replit Design Mode](https://docs.replit.com/replitai/design-mode)
- Figma: Guidelines docs (undated). — [Figma Help](https://help.figma.com/hc/en-us/articles/33665861260823-Add-guidelines-to-Figma-Make)

### Inferences
- Vendor documents describe the same failure from each lab's own side. Anthropic and OpenAI both name Inter-type fonts and purple-on-white as defaults, which supports treating those as real model tendencies rather than folklore. The evidence is still vendor observation, not a measured study.
- Anthropic's documents show defaults move over time. Purple and Inter were the issue in 2025, and cream, serif and terracotta for Opus 4.8. Static ban lists will likely go stale.

### Gaps
- I could not read Google's two most relevant official pages, because they render client-side. Someone with a browser should check them before concluding that Google lacks detailed guidance.
- I found no Google document equivalent to the Anthropic or OpenAI rule sets, but that absence is not proven.
- Several vendor pages are undated, so their order relative to the leaked copies is unclear.

## Where do the rules conflict with one another, and which rules appear nearly everywhere?

### Takeaway
Nearly everyone agrees on tokens, specificity, following supplied designs, responsiveness and avoiding the purple default. They disagree on how expressive output should be, especially gradients, fonts, motion, placeholders and whether to ask first. Many conflicts reflect product type or era, not just opinion.

### Cited Findings

**Rules appearing nearly everywhere**
1. **Use tokens or variables rather than ad hoc values:** v0, Lovable, Antigravity (copies); Anthropic, OpenAI, Figma, Bolt, Replit, DESIGN.md (official); Toss (community). — [v0 copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/v0%20Prompts%20and%20Tools/Prompt.txt); [Lovable copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Lovable/Agent%20Prompt.txt); [Anthropic cookbook](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics); [OpenAI](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4); [DESIGN.md](https://raw.githubusercontent.com/google-labs-code/design.md/main/README.md)
2. **Vague briefs produce generic output, so be specific:** Anthropic, OpenAI, Vercel, Lovable, Bolt, Replit and the Stitch guide. — [Opus 4.8 guide](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8); [OpenAI](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4); [Vercel blog](https://vercel.com/blog/how-to-prompt-v0); [Lovable docs](https://docs.lovable.dev/prompting/prompting-one); [Bolt blog](https://bolt.new/blog/prompting-tips-for-bolt); [Stitch guide](https://discuss.ai.google.dev/t/stitch-prompt-guide/83844)
3. **Follow an existing brand, system or requested design over any default:** v0, Lovable, Same.dev, Claude Design (copies); Anthropic, OpenAI (official). — [v0 copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/v0%20Prompts%20and%20Tools/Prompt.txt); [Lovable copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Lovable/Agent%20Prompt.txt); [Claude Design copy](https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/Anthropic/claude-design/claude-design.md); [OpenAI cookbook](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_frontend)
4. **Responsive design:** v0, Lovable, Same.dev, Claude Design type (copies); OpenAI, Vercel (official). — [Same.dev copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Same.dev/Prompt.txt); [Vercel guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/README.md)
5. **Do not default to purple:** v0, Same.dev (copies); Anthropic, OpenAI (official). — [v0 copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/v0%20Prompts%20and%20Tools/Prompt.txt); [Same.dev copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Same.dev/Prompt.txt); [Anthropic cookbook](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics); [OpenAI](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4)
6. **Limit accents and typefaces:** roughly 1 to 2 accents and 2 to 3 typefaces in v0, the Claude copies and OpenAI, with Toss capping accents at one. Anthropic's public guidance gives no color count, though its typography prompt says to pick one distinctive font. — [v0 copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/v0%20Prompts%20and%20Tools/Prompt.txt); [Design type copy](https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/Anthropic/artifact-types/design/SKILL.md); [OpenAI](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4); [Toss rule](https://raw.githubusercontent.com/PatrickJS/awesome-cursorrules/main/rules/toss-style-design-system.mdc)
7. **No emoji as icons or decoration:** v0, Same.dev, Claude Design, Design type (all copies). No official document I read states this as a general rule. — [v0 copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/v0%20Prompts%20and%20Tools/Prompt.txt); [Same.dev copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Same.dev/Prompt.txt); [Claude Design copy](https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/Anthropic/claude-design/claude-design.md)
8. **Flex or grid with `gap`, not absolute positioning:** v0, Claude Design (copies); Figma (official template). — [v0 copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/v0%20Prompts%20and%20Tools/Prompt.txt); [Figma Help](https://help.figma.com/hc/en-us/articles/33665861260823-Add-guidelines-to-Figma-Make)
9. **Basic accessibility, namely contrast and semantic HTML:** v0, Lovable, Claude (copies); Vercel, DESIGN.md (official); Toss. — [Vercel guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/README.md); [DESIGN.md](https://raw.githubusercontent.com/google-labs-code/design.md/main/README.md)

**Direct conflicts**

| Topic | Position A | Position B |
|---|---|---|
| Backgrounds | Solid colors, avoid gradients: [v0 copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/v0%20Prompts%20and%20Tools/Prompt.txt), [Toss](https://raw.githubusercontent.com/PatrickJS/awesome-cursorrules/main/rules/toss-style-design-system.mdc) | Atmosphere instead of flat color: [Anthropic cookbook](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics), [OpenAI](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4). Gradient tokens: [Lovable copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Lovable/Agent%20Prompt.txt) |
| Gradient and glass trends | Recommended: [Sonnet 4.5 copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Anthropic/Sonnet%204.5%20Prompt.txt), [Antigravity copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Google/Antigravity/planning-mode.txt) | Named as a trope (aggressive gradients): [Claude Design copy](https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/Anthropic/claude-design/claude-design.md) |
| Inter and Roboto | Use as modern fonts: [Antigravity copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Google/Antigravity/planning-mode.txt), [OpenAI GPT-5 cookbook, archived](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_frontend) | Avoid: [Anthropic cookbook](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics), [OpenAI GPT-5.4](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4) |
| Type contrast | 100/200 vs 800/900, 3x jumps: [Anthropic cookbook](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics) | Sparing size changes, weight and color carry hierarchy: [Toss](https://raw.githubusercontent.com/PatrickJS/awesome-cursorrules/main/rules/toss-style-design-system.mdc) |
| Placeholders | Never, generate images: [v0 copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/v0%20Prompts%20and%20Tools/Prompt.txt), [Lovable copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Lovable/Agent%20Prompt.txt) | Labeled placeholders, ask for assets: [Claude Design copy](https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/Anthropic/claude-design/claude-design.md). Stock placeholders for layout: [Bolt blog](https://bolt.new/blog/prompting-tips-for-bolt) |
| Motion amount | Static is the exception: [Sonnet 4.5 copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Anthropic/Sonnet%204.5%20Prompt.txt). At least 2 to 3 motions: [OpenAI](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4) | One orchestrated page load: [Anthropic cookbook](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics) |
| `transition: all` | Used in a sample prompt: [Opus 4.8 guide](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8) | Never: [Vercel guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/README.md) |
| Ask or act | Propose directions and ask: [Opus 4.8 guide](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8), [Claude Design copy](https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/Anthropic/claude-design/claude-design.md) | Just build: [Lovable copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Lovable/Agent%20Prompt.txt), [AI Studio Build copy](https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/Google/ai-studio-build.md). Commit and state assumptions: [Design type copy](https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/Anthropic/artifact-types/design/SKILL.md) |
| shadcn | Use the installed components: [v0 copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/v0%20Prompts%20and%20Tools/Prompt.txt), [PasteCode](https://pastecode.xyz/rules/cursor-rules-for-tailwind-shadcn) | Edit each before building: [Same.dev copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Same.dev/Prompt.txt) |
| Cards | None by default: [OpenAI](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4) | Bento grid in worked example: [v0 copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/v0%20Prompts%20and%20Tools/Prompt.txt). Card sections as an example constraint: [Vercel blog](https://vercel.com/blog/how-to-prompt-v0) |
| Contrast standard | WCAG AA 4.5:1: [DESIGN.md](https://raw.githubusercontent.com/google-labs-code/design.md/main/README.md), [Claude Design copy](https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/Anthropic/claude-design/claude-design.md) | Prefer APCA: [Vercel guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/README.md) |
| Dark mode | Recommended: [Antigravity copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Google/Antigravity/planning-mode.txt). Vary light and dark: [Anthropic cookbook](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics) | Avoid a dark bias: [OpenAI](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4). No toggle unless asked: [Lovable copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Lovable/Agent%20Prompt.txt) |
| CSS approach | Tailwind: [v0 copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/v0%20Prompts%20and%20Tools/Prompt.txt), [OpenAI](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4) | Vanilla CSS unless asked: [Antigravity copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/Google/Antigravity/planning-mode.txt) |

**Moving ban lists.** Anthropic's 2025 cookbook suggests Fraunces and Space Grotesk as font options, while also naming Space Grotesk as a convergence example. — [Anthropic cookbook](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics). Its Opus 4.8 guide later names Fraunces as part of the default house style. — [Opus 4.8 guide](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8). The October 2026 Claude Design copy lists Fraunces as overused. — [Claude Design copy](https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/Anthropic/claude-design/claude-design.md)

**Prompt length.** Figma warns that more context can confuse the model, and Anthropic says Opus 4.8 needs less design prompting and that guidance should load only when relevant. — [Figma Help](https://help.figma.com/hc/en-us/articles/33665861260823-Add-guidelines-to-Figma-Make); [Opus 4.8 guide](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8); [Anthropic blog](https://claude.com/blog/improving-frontend-design-through-skills). The v0 and Claude Design copies nonetheless run long, at about 46 KB and 143 KB as downloaded, though much of that is not design guidance. — [v0 copy](https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/main/v0%20Prompts%20and%20Tools/Prompt.txt); [Claude Design copy](https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/Anthropic/claude-design/claude-design.md)

### Inferences
- Many apparent conflicts are explained by context. OpenAI separates brand pages from product UI, Anthropic's copy separates apps from landing pages, and Opus 4.8's guide says its default fails for dashboards and fintech. "Vary the rules by surface type" looks like the most defensible reconciliation.
- Some conflicts are probably era effects, since copies span April 2025 to October 2026. The gradient reversal fits this pattern, but I cannot prove it because the copies are unverified and from different products.
- Negative rules alone look weak. Anthropic says bans shift the model to another fixed palette, and the Fraunces history shows a recommendation becoming a default and then a ban. Positive specification plus a direction choice appears more durable.
- A rule appearing everywhere does not prove that it works. Several vendors may be copying each other or reacting to the same public complaints.

### Gaps
- No independent benchmark compares these rule sets, such as v0's caps against Anthropic's expressive rules, on the same briefs.
- Consensus counts here rest on the products with available evidence, and are skewed toward those with copies or detailed docs. Bolt, Replit and Figma contribute only official user advice, not system-level instructions.
- Claims from summarized reads (Claude Design beyond checked lines, Design type, Antigravity, AI Studio Build, Toss, OpenAI) were not line-checked against raw text, so details should be spot-checked before being quoted.
