# How AI Design Workflows Choose a Direction and Use References

Checked 2026-11-02. Most pages were read through a summarizing fetch tool, so treat wording as paraphrase unless quoted. I read these directly from raw files: Anthropic's frontend-design SKILL.md, Refero's SKILL.md, and UI UX Pro Max's two CSV files (counts on those CSVs are my own). No sign-ins were made and no bot protection was bypassed. Blocks are recorded as findings. Refero's public SKILL.md was read through the GitHub CLI, which may have used a GitHub login already on the machine.

## How do published AI design workflows and skills choose a design direction?

### Takeaway
Seven methods are in use: style lookup tables, a "commit to one aesthetic" instruction, intake questions, generating several directions, random assignment from a curated catalog, research-first reference locks, and inheriting an existing design system. Almost none have outcome evidence. The one published experiment series (a vendor's) found that models collapse variety when they choose for themselves, which argues for moving the choice to a human or a random draw.

### Cited Findings

**Method summary**

| Method | Example | How product maps to style | Evidence of working |
|---|---|---|---|
| Style database lookup | UI UX Pro Max | Product category row gives style, palette, fonts, avoid list | None found; see next question |
| Commit to a distinctive aesthetic | Anthropic frontend-design | Subject, audience and primary job, then model judgment | Illustrative side-by-sides only |
| Intake questions | Impeccable init, gstack, Refero brief | Answers saved as context for later steps | None found |
| Several directions, human picks | gstack design-shotgun, Refero visual exploration, Claude Design | Human judges options against product | Indirect: human-designer study (Dow 2010) |
| Random draw from curated catalog | Impeccable v4 | Model proposes, script assigns | Vendor experiments, one rater |
| Research-first reference lock | Refero Skill | Retrieved references fix the direction | No benchmarks published |
| Inherit design system | gstack with DESIGN.md, Claude Design | Direction already decided | Not applicable |

**Style database**
- UI UX Pro Max reports 192 industry rules, 79 searchable styles, 192 palettes and 74 font pairings. It runs five parallel searches, ranks styles with BM25, filters industry anti-patterns, applies JSON conditions, then outputs a style, palette, fonts, an avoid list and a checklist. Its spa example returns Soft UI Evolution with Cormorant Garamond and Montserrat — [README](https://raw.githubusercontent.com/nextlevelbuilder/ui-ux-pro-max-skill/main/README.md)

**Commit to an aesthetic**
- Anthropic's current skill casts the agent as a studio design lead told to make opinionated choices specific to the brief. If the brief names no subject, the agent proposes a subject, audience and primary job and confirms them. Distinctive choices should come from the subject's industry, materials and vernacular. The agent writes a compact plan (4–6 named hex values, typefaces, layout concept, principles), then revises anything that reads as a generic default. It collects no references. Its best-known line: "Spend your boldness in one place." The brief's own words override everything, including when it asks for a cliché — [SKILL.md](https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md)

**Intake**
- Impeccable's init reads the code, asks only what it can't infer (audience, purpose, constraints) and writes PRODUCT.md for later commands — [README](https://raw.githubusercontent.com/pbakaus/impeccable/main/README.md)
- gstack's design-consultation reads existing files, confirms a pre-filled product read in one question, then asks whether to research competitors and what one thing users should remember — [gstack](https://raw.githubusercontent.com/garrytan/gstack/main/design-consultation/SKILL.md.tmpl)
- Refero's skill starts with a brief covering product, audience, platform, goal, tone, objections, constraints and research layers needed — [Refero docs](https://doc.refero.design/skill/overview.md)
- Claude Design may ask clarifying questions before drawing, per a third-party summary — [DataCamp](https://www.datacamp.com/blog/claude-design)

**Several directions**
- gstack design-shotgun defaults to 3 variants and goes up to 8. It confirms text concepts before spending image calls, then collects a preferred pick, ratings and notes on a comparison board. A taste profile plus up to 10 prior approvals bias later runs. Variants "should feel like separate design teams made them", and if two headlines could be swapped unnoticed, one gets reworked — [gstack](https://raw.githubusercontent.com/garrytan/gstack/main/design-shotgun/SKILL.md.tmpl)
- Refero's skill defaults to three reference-locked options for high-visibility work and asks the user to choose — [SKILL.md](https://github.com/referodesign/refero_skill/blob/master/skills/refero-design/SKILL.md)
- Anthropic's docs suggest asking for 2–3 options when unsure of direction (seen in a search excerpt of the article, not the full page) — [Claude support](https://support.claude.com/en/articles/14604416-get-started-with-claude-design)

**Random draw**
- Impeccable's research page describes a July 2026 campaign: about 30 skill iterations, about 200 sampled concepts, about $2,600 in evaluations. Findings: 30 of 35 responses across sixteen creative framings proposed the same concept. Rejecting first ideas landed the model on its second choice. The first-listed option won 27 of 30 packets when the model, a simulated user or a rejection rule chose. The resulting script "chooses among relevant ideas the model has already proposed" — [Impeccable research](https://impeccable.style/research)
- That catalog held 375 entries on July 21, 2026: 188 approved, 172 rejected, 15 pending. A common rejection reason was that the idea didn't translate to an interface. Each draw offers six world candidates plus up to three compositions, and re-rolls avoid worlds already dealt — [Impeccable research](https://impeccable.style/research)
- Conflict: Impeccable's home page says it weighs directions against product ideas and builds around the strongest fit, which reads differently from random assignment — [Impeccable](https://impeccable.style/); contrast [research page](https://impeccable.style/research)

**Research-first**
- Refero's skill makes research mandatory before implementation and requires every major decision to trace to research, the brief or a craft reference. It searches styles first, then screens and flows. It then writes a "reference lock": one primary source, 3–5 traits to preserve, 1–2 borrowed details, role rules, a media strategy, a reject list and token commitments. Without its MCP, it falls back to bundled craft guidance — [SKILL.md](https://github.com/referodesign/refero_skill/blob/master/skills/refero-design/SKILL.md)
- gstack's consultation optionally opens 5–10 competitor products with user approval, then compares three layers: category conventions, current trends and first-principles reasoning. It recommends where to play safe and where to take risks — [gstack](https://raw.githubusercontent.com/garrytan/gstack/main/design-consultation/SKILL.md.tmpl)

**Moodboards**
- I found no agent skill built around moodboards. Shin et al. propose showing contrasting mood boards before code generation, as an untested proposal — [arXiv 2603.13036](https://arxiv.org/html/2603.13036)
- Lovart, a vendor, recommends 3–5 distinct boards followed by extracting palette, type and imagery rules from the approved one — [Lovart](https://www.lovart.ai/fr/blog/complete-guide-ai-collage-moodboard-creation)
- NN/g says moodboards and inspiration images help match a style but rarely reach pixel-perfect results — [NN/g](https://www.nngroup.com/articles/vague-prototyping/)

**Named style in the prompt**
- NN/g rates naming a recognized style (neobrutalism) above describing its traits, and both above "trendy". It advises against words like "clean" or "modern" and against asking AI to copy a specific brand's look — [NN/g, Dec 5, 2025](https://www.nngroup.com/articles/vague-prototyping/)

### Inferences
- The strongest-supported pipeline combines parts from several tools: intake, then options sourced from outside the model's defaults, then selection by a human or a random draw, then a written lock, then a check of the build against that lock. No single tool's evidence proves this sequence.
- Self-selection is the failure point. If the agent picks its own favorite from a shortlist, generating options may add cost without adding variety. This rests on one vendor's data.

### Gaps
- I did not read Impeccable's direction-selection code, so the home page versus research page conflict is unresolved.
- Claude Design's question flow and default variant count are not confirmed in official docs I could read.
- Stitch's direction behavior was seen only through third-party blogs.

## How is style matched to context such as audience, industry, seriousness and trust? How reliable are the mappings?

### Takeaway
The main published mapping is UI UX Pro Max's table, and I found no validation of it. It contains internal contradictions. NN/g publishes per-style cautions but no industry-to-style table, and its own data shows a playful tone isn't reliably harmful in serious industries. Research also shows preferences vary by audience traits, not only by industry.

### Cited Findings

**Published mappings, read at source**
- Sample rows: Banking is Minimalism & Swiss Style plus Accessible & Ethical, with playful design as an anti-pattern. Government is Accessible & Ethical plus Minimalism. SaaS (General) is Glassmorphism plus Flat Design. Healthcare App is Neumorphism plus Accessible & Ethical. Educational App is Claymorphism plus Micro-interactions. Gaming is 3D & Hyperrealism plus Retro-Futurism. Creative Agency is Brutalism plus Motion-Driven — [ui-reasoning.csv](https://raw.githubusercontent.com/nextlevelbuilder/ui-ux-pro-max-skill/main/src/ui-ux-pro-max/data/ui-reasoning.csv)
- Style-level advice in the same skill — [styles.csv](https://raw.githubusercontent.com/nextlevelbuilder/ui-ux-pro-max-skill/main/src/ui-ux-pro-max/data/styles.csv):
  - Neubrutalism: for Gen Z brands, startups and creative agencies; not for luxury, finance, healthcare or conservative industries; accessibility risk labeled low.
  - Bento Box Grid: for dashboards, product pages, portfolios and SaaS; not for dense data tables, text-heavy content or real-time monitoring.
  - Glassmorphism: for modern SaaS, financial dashboards and modals; not for critical accessibility; risk labeled conditional.
  - Neumorphism: for wellness apps; not for critical accessibility or complex apps; risk labeled high.
  - Claymorphism: for education and children; not for serious, medical, legal or finance products.
- A separate skill listing reserves neobrutalism for bold graphic marketing UIs and points elsewhere for soft, low-contrast surfaces — [skillselion](https://skillselion.com/skills/bergside/awesome-design-skills/neobrutalism)

**My checks of the UI UX Pro Max data (192 rows)**
- Healthcare App and Telemedicine recommend Neumorphism, which the style table rates high accessibility risk and excludes from critical accessibility. The Healthcare row also requires WCAG AAA. Eight rows use Neumorphism in total — [ui-reasoning.csv](https://raw.githubusercontent.com/nextlevelbuilder/ui-ux-pro-max-skill/main/src/ui-ux-pro-max/data/ui-reasoning.csv); [styles.csv](https://raw.githubusercontent.com/nextlevelbuilder/ui-ux-pro-max-skill/main/src/ui-ux-pro-max/data/styles.csv)
- Style usage is concentrated. Minimalism & Swiss Style appears in 68 rows (35%), and there are only 94 unique style pairs. Neubrutalism is never chosen as a row's style, even though the style table describes it. Brutalism appears twice, Bento 7 times and Glassmorphism 15 times — [ui-reasoning.csv](https://raw.githubusercontent.com/nextlevelbuilder/ui-ux-pro-max-skill/main/src/ui-ux-pro-max/data/ui-reasoning.csv)
- Reasoning and Confidence fields are blank for 161 of 192 rows. The other 31 show values such as 0.93, and I found no stated method behind them. "AI purple/pink gradients" is an anti-pattern in 14 rows — [ui-reasoning.csv](https://raw.githubusercontent.com/nextlevelbuilder/ui-ux-pro-max-skill/main/src/ui-ux-pro-max/data/ui-reasoning.csv)

**Criticism of the mapping approach**
- One writer warns rule matching may produce "industry-looking mass production", with spas all getting Soft UI and fintech apps looking alike. The author had not run the skill, and the piece cites older counts (67 styles, 100 rules) — [lilting.ch](https://lilting.ch/en/articles/ui-ux-pro-max-skill-comparison)

**NN/g guidance on specific styles**
- Neobrutalism (Apr 11, 2025): attention-grabbing and memorable, and suits distinct personalities such as Gumroad. NN/g advises 2–3 bold colors, neutral body fonts and generous spacing, and warns it can overwhelm users and hinder accessibility. "success hinges on balancing boldness with usability". It gives no audience or industry rules — [NN/g](https://www.nngroup.com/articles/neobrutalism/)
- Brutalism and antidesign (Nov 5, 2017): keep brutalism to visual design and away from hierarchy, navigation and interaction. Antidesign can suit designer or artist audiences and entertainment products, but "antidesign should be avoided for most products" — [NN/g](https://www.nngroup.com/articles/brutalism-antidesign/)
- Glassmorphism (Jun 7, 2024): "best when utilized sparingly". Test contrast against actual backgrounds, use stronger blur on intricate ones, and let users reduce transparency — [NN/g](https://www.nngroup.com/articles/glassmorphism/)
- Liquid Glass (Oct 10, 2025): translucent floating controls over busy content lower legibility. "Overall, Apple is prioritizing spectacle over usability." — [NN/g](https://www.nngroup.com/articles/liquid-glass/)
- Bento: a site-limited search found no NN/g article on bento grids, only general grid guidance — [NN/g grids](https://www.nngroup.com/articles/using-grids-in-interface-designs/)

**Other guidance on bento**
- Practitioner advice says bento suits content with natural hierarchy and fits sequential content poorly. This comes from a vendor blog, not testing — [StudioMeyer](https://studiomeyer.io/en/blog/bento-grid-layouts)
- Grid placement can disconnect visual order from tab and reading order — [Rachel Andrew](https://rachelandrew.co.uk/archives/2019/06/04/grid-content-re-ordering-and-accessibility)

**Evidence on trust and audience**
- NN/g's tone study (2016, reviewed 2024) surveyed 100 US adults on text-only copy in four industries. Playful insurance copy lost 0.3 points on trust, but casual banking copy and humorous home-security copy gained on trust and recommendation, and casual hospital copy was marginally more trusted. Trustworthiness explained about 52% of recommendation variance. It tested copy only, with visual design removed — [NN/g](https://www.nngroup.com/articles/tone-voice-users/)
- Reinecke and Gajos (CHI 2014) collected 2.4 million ratings from nearly 40,000 people. Preferences for color and complexity varied by country and education, and they built a model to estimate appeal for target groups — [Harvard](https://eecs.harvard.edu/~kgajos/papers/2014/reinecke14visual.shtml)
- Shin et al. illustrate a minimalist default overriding a preference for high-density Japanese web design — [arXiv 2603.13036](https://arxiv.org/html/2603.13036)

### Inferences
- Exclusions travel better than prescriptions. "Avoid low contrast where tasks are critical" has NN/g support, while "SaaS means glassmorphism" has none I could find.
- A blanket "no playful design in serious industries" rule goes beyond NN/g's data, which is mixed by industry and limited to copy.
- Treating Accessible & Ethical as a style option is a category problem. It appears in only 31 rows of 192 (my count), even though the style table says it applies universally.
- Trust is not the only axis. Industry alone misses audience traits such as culture and education.

### Gaps
- I found no study validating any industry-to-style table against conversion, trust or usability outcomes.
- I found no controlled study of neobrutalism, bento or glassmorphism by industry.
- A search did not surface the prototypicality research on first impressions (Tuch et al.), so it is not covered.

## How do workflows use real references?

### Takeaway
There are five channels: paid MCP servers from reference libraries, unofficial scrapers and wrappers, approved agent browsing, screenshots or URLs supplied by the user, and token extraction into DESIGN.md. Paid MCPs are the only channels with clear permission. Token extraction is the most mechanical, and I found no independent audit of its fidelity.

### Cited Findings

**Official MCP servers**
- Mobbin: `https://api.mobbin.com/mcp`, OAuth, Pro, Team or Enterprise. Limit is 60 requests per 60 seconds per user. Tools search screens, flows and sections and manage collections — [Mobbin MCP](https://mobbin.com/mcp). Its launch release claims 621,500 screens, a vendor figure — [press release](https://www.wboc.com/online_features/press_releases/mobbin-launches-mcp-server-giving-ai-tools-621-500-real-app-screens-to-reference/article_ffe043e0-a91b-5bb4-9128-21c46942e00c.html)
- Mobbin tells agents to clarify the question, compare several products, keep product names and URLs, separate what is visible from interpretation, and check accessibility independently. "A recurring pattern is a convention, not automatically a best practice." — [Mobbin MCP guide](https://mobbin.com/mcp.md)
- Refero: `https://api.refero.design/mcp`, OAuth or Bearer token, Pro, Team or Lifetime. Up to 8,000 tool calls per monthly period per user, no rollover — [Refero docs](https://doc.refero.design/mcp/getting-started.md)
- A Refero "style" is a semantic reference extracted from a real marketing or product page, with tokens, composition and do/don't rules, rather than a screenshot. Styles don't currently cover dashboards, auth, settings or iOS screens — [SKILL.md](https://github.com/referodesign/refero_skill/blob/master/skills/refero-design/SKILL.md)
- Refero library counts conflict: 150,000+ screens and 6,000+ flows in its [repo](https://github.com/referodesign/refero_skill); 142,000+ and 12,000+ per a competitor quoting its landing page ([Lazyweb](https://www.lazyweb.com/vs/refero)); 125,000+ and 8,000+ in a [launch listing](https://www.hunted.space/product/refero/launches/refero-mcp).
- Lazyweb offers free browsing and MCP setup with partial reports for non-Pro users, and Pro at $39/month. This is its own comparison page — [Lazyweb](https://www.lazyweb.com/vs/refero)

**Unofficial wrappers**
- awwwards-mcp scrapes public Awwwards pages at 1 request per second using robots-allowed paths and a 7-day cache. It also offers component capture, token export and "pixel-informed rebuilds". It says it is unaffiliated and for personal, non-commercial inspiration — [wiki](https://github.com/INSANE0777/Awwwards-mcp/wiki)
- design-inspiration-mcp-server avoids the galleries directly by using Google search with `site:` filters through Serper, and calls Dembrandt for tokens. Its listing marks maintenance as inactive — [Glama](https://glama.ai/mcp/servers/YonasValentin/design-inspiration-mcp-server)
- referro-mcp calls Refero endpoints its author reverse-engineered, without auth. "The free public API is undocumented." — [GitHub](https://github.com/CalmOli/referro-mcp)

**Approved browsing**
- gstack has the user approve which sites to open, takes read-only screenshots, and skips sites with sign-in walls or bot checks — [gstack](https://raw.githubusercontent.com/garrytan/gstack/main/design-consultation/SKILL.md.tmpl)

**Screenshots and URLs**
- Claude Design's documented flow takes context such as screenshots or a codebase — [Claude support](https://support.claude.com/en/articles/14604416-get-started-with-claude-design)
- Stitch reportedly analyzes a URL into a DESIGN.md, working best on public pages without login or paywall. Sources are secondary — [YouMind](https://youmind.com/ar/blog/google-stitch-design-md-ai-brand-consistency); [MindStudio](https://www.mindstudio.ai/blog/how-to-use-google-stitch-website-design-system)
- NN/g says direct connection to design sources such as Figma tokens or the Figma MCP is more precise than screenshots. A polished visual match can still be poor design if the prompt is vague — [NN/g](https://www.nngroup.com/articles/vague-prototyping/)

**Token extraction**
- Dembrandt renders with Playwright and reads computed styles. It outputs DTCG tokens, DESIGN.md, Tailwind v4, shadcn and WCAG grades, and has MCP tools such as `get_design_tokens` and `generate_design_md`. Stated limits: no canvas or WebGL, hover and focus sampled, dark mode needs a flag, some dynamic content missed. It claims multi-page crawling is stronger, without independent verification — [README](https://raw.githubusercontent.com/dembrandt/dembrandt/main/README.md)
- awesome-design-md badges 84 brand files (83 listed when counted) "extracted from real websites", built from public CSS values. It disclaims ownership of any site's identity. The recommended use is copying a brand's file into your project root — [README](https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/README.md)
- getdesign.md fronts that collection and says trademarks and design elements belong to their owners — [about](https://getdesign.md/about)
- Firecrawl's scrape endpoint has a branding format for colors, fonts, spacing and components — [Firecrawl docs](https://docs.firecrawl.dev/features/scrape). A community skill wraps it into a DESIGN.md under the name website-design-clone — [listing](https://skillselion.com/skills/firecrawl/firecrawl-workflows/firecrawl-website-design-clone)

### Inferences
- A style reference with tokens and role rules is a different product from a screenshot library, and suits different stages: styles for direction, screens and flows for structure. Refero's own split supports this.
- Paying for an MCP may be cheaper than maintaining a scraper once breakage, terms and missing attribution are counted. This is judgment, not measured.

### Gaps
- I found no independent audit of how faithfully DESIGN.md files or Dembrandt output match live brands.
- Refero's MCP was not exercised, since it requires a paid sign-in. Neither was Mobbin's.
- I didn't check whether Lazyweb's claims hold, as only its own comparison page was read.

## What are the terms, access limits and practical blockers for an agent reading those galleries?

### Takeaway
Dribbble, Land-book and Lapa Ninja blocked plain automated reads during my check. Mobbin and Refero prohibit scraping but sell agent access through MCP. Awwwards was readable, though its terms reserve reproduction rights and its robots file excludes filtered listing URLs. A permissive robots.txt does not equal permission under a site's terms.

### Cited Findings

**How I tested:** one fetch-tool request and one plain curl request per page on 2026-11-02, with no retries around blocks and no altered user agent. Results may differ from a real browser.

| Site | Official agent route | Terms on automation | robots.txt | Observed |
|---|---|---|---|---|
| Mobbin | MCP (paid); REST on Team and up | Bars scrapers without authorization and AI-tool derivatives | `*` allowed; GPTBot blocked except listed text files | `/terms` 403 to fetch tool; published `.md` versions readable; home 200 |
| Refero | MCP (paid) | Bars scraping outside documented features | Only GPTBot blocked | Pages return a title only to the fetch tool; docs site readable |
| Dribbble | API limited to own shots | Bars scraping and access by unprovided means | No named AI bots; many paths blocked | 202 with `x-amzn-waf-action: challenge`, empty body |
| Awwwards | None found | No wording on bots or AI; reserves reproduction | Blocks `/websites/?` and search paths | `/websites/` readable, no login |
| Land-book | None mentioned | Could not read | Readable; names AI bots under shared rules | 403 with `cf-mitigated: challenge` |
| Lapa Ninja | Unknown | Could not read | 403 | 403, Cloudflare server |
| Godly | None seen | None seen | Not checked | 301 to recent.design |

**Mobbin**
- Terms (effective May 16, 2026; updated Sep 23, 2026). §3(2) bars scrapers, bots and crawlers without authorization, plus mirroring, caching or re-hosting. §3(3) lets crawlers and data-extraction tools operate only with a descriptive user agent, robots compliance and clear contact details. §3(4) bars AI tools from creating derivative works or training, testing, indexing or benchmarking models. §3(5) limits API and MCP use to personal or internal business use or integration into your own products, and bars standalone repositories. §4.3 charges calls against AI Credits. §10.3 disclaims ownership of third-party interfaces and allows limited publication with credit — [Terms](https://mobbin.com/terms.md)
- Robots allows `*`, and blocks GPTBot except specific text files — [robots.txt](https://mobbin.com/robots.txt)
- As of Sep 11, 2026: Free has limited access with no search, flows or MCP. Pro is $10–15/month with MCP. Team is $16–24 per member with REST API — [Pricing](https://mobbin.com/pricing.md)
- The acceptable-use policy doesn't name scraping or agents, but bars manipulating metering — [AUP](https://mobbin.com/acceptable-use.md)

**Refero**
- Terms (updated Aug 3, 2026). §§10, 13 and 14 bar scraping and bulk extraction outside documented features. §13 allows MCP and API for internal design research and ordinary product work, including commercial work, capped at 8,000 requests a month. Customer-facing embedding, reselling and high-volume use need a separate agreement, and tokens must stay out of client-side or publicly distributed software. Training and benchmarking are barred. §§9–10 permit use in moodboards, Figma files and client work but not republishing as a library. §11 says screenshots and logos remain their owners' — [Terms](https://doc.refero.design/legal/terms-of-use.md)
- Free has limited search and no MCP, and there is currently no trial — [Plans](https://doc.refero.design/help/plans.md)
- Free reportedly covers about 3% of the library and Pro about $10/month billed annually. I saw this only in a search excerpt, and other sources conflict — [Pricing](https://refero.design/pricing); [Lazyweb](https://www.lazyweb.com/vs/refero)
- One reviewer who paid for a month of Pro reports a later MCP query returning 401, with the cause not established — [review](https://soymarketingultra.com/en/refero-review-design-claude-code-codex/)
- Robots blocks only GPTBot — [robots.txt](https://refero.design/robots.txt)

**Dribbble**
- Terms (updated Mar 17, 2025). §7.1 bars copying including automated scraping. §7.2 limits robots to human-reasonable request rates and gives search engines only revocable index permission. §7.11 bars access by means Dribbble doesn't provide. §7.12 bars bypassing access restrictions. §11 restricts copying or derivatives of content. AI is not mentioned — [Terms](https://dribbble.com/terms)
- API requires OAuth and returns only the authenticated user's shots, at 60 requests per minute and 1,440 per day. No public listing or search endpoint is documented — [API](https://developer.dribbble.com/v2/); [Shots](https://developer.dribbble.com/v2/shots/)
- Robots blocks `/shots/day|week|month|year/*`, `/colors` and more, with no named AI bots — [robots.txt](https://dribbble.com/robots.txt)

**Awwwards**
- Terms carry no date and no wording on scraping, bots, AI or an API. "All rights are reserved and any unauthorized use or reproduction is strictly prohibited." Commercial use requires express authorization — [Terms](https://www.awwwards.com/terms/)
- Robots blocks `/websites/?`, `/gallery/`, `/inspiration/search`, `/elements/*` and several named tools, but no AI bots by name — [robots.txt](https://www.awwwards.com/robots.txt)
- The page was readable without login and exposes site URLs as text, while thumbnails appear as tiny placeholders. "Next" points to `/websites/?page=2` — [Awwwards](https://www.awwwards.com/websites/)
- awwwards-mcp claims a public read-only Annual Awards API, which I did not verify — [wiki](https://github.com/INSANE0777/Awwwards-mcp/wiki)

**Land-book**
- Robots names GPTBot, ClaudeBot and others under shared rules, disallowing `/api/`, login paths and filter parameters such as style, industry and category — [robots.txt](https://land-book.com/robots.txt)
- Its llms.txt lists a sitemap and RSS feed, asks that references link to the entry and credit the designer, and says Pro unlocks unlimited browsing and filters. It mentions no API, MCP or agent policy — [llms.txt](https://land-book.com/llms.txt)

**Godly**
- godly.website returned a 301 to recent.design, and that page doesn't mention Godly. A search found nothing confirming a relationship. Recent's galleries appeared open without login, with no terms link in the text returned — [Recent](http://recent.design/?ref=godly)

### Inferences
- Awwwards' "Next" link and robots rule conflict, so a robots-respecting agent can read only the first listing page plus individual entries.
- Land-book's RSS feed and sitemap are the sanctioned machine-readable routes, though its HTML is challenged. I did not test the feed.
- Mobbin allowing ClaudeBot in robots while barring unauthorized automated access in terms shows that robots checks alone are insufficient.
- The Mobbin §3(4) wording on AI derivative works sits awkwardly beside its MCP product. Anyone embedding this in a shipped tool should get legal review; these notes aren't legal advice.
- referro-mcp's undocumented access looks hard to square with Refero's §14, which allows automation only through documented features.

### Gaps
- Land-book and Lapa Ninja terms could not be read (403). A search for Lapa Ninja's terms and pricing found nothing. The `/terms` and `/terms-of-service` URLs were guesses, so they may not be the real paths.
- Godly's own terms and its relation to Recent are unknown.
- Mobbin's gated content behavior was not tested beyond the HTTP status.
- Credit costs per Mobbin MCP call were not found.

## Is copying from references treated as a risk, and how do workflows avoid cloning and convergence?

### Takeaway
Yes, though unevenly. Reference libraries warn against copying and use "one dominant source plus narrow details" rules, while brand-file collections and cloning tools make imitation the default use. Convergence is documented across tools, and instructions alone have not stopped it: fixes tend to shift the default rather than remove it.

### Cited Findings

**Copying as a risk**
- Figma disabled Make Design in July 2024 after it kept producing near-copies of Apple's Weather app. Figma later blamed design-system assets added shortly before launch that weren't vetted carefully, and did not say where they came from — [9to5Mac](https://9to5mac.com/2024/07/19/figma-explains-why-ai-kept-making-copies-of-apples-weather-app/); [The Register](https://www.theregister.com/2024/07/03/figma_plagiarizes_apple/)
- Mobbin's guide says not to reproduce protected designs, branding, text or assets directly — [Mobbin](https://mobbin.com/mcp.md)
- Dembrandt asks users to run only where "Terms of Service permit automated access" or on their own properties, and not to reproduce third-party brand identities. It still ships a `--stealth` flag labeled authorized use only — [README](https://raw.githubusercontent.com/dembrandt/dembrandt/main/README.md)
- awwwards-mcp's showcase includes a one-shot local rehost of a live site, and recreations labeled not for publication — [wiki](https://github.com/INSANE0777/Awwwards-mcp/wiki)

**Anti-cloning mechanisms**
- Refero's skill says study several references, pick one dominant direction, and take narrow details from the others: "Do not average references into a safe middle." It tells agents to preserve token roles and avoid presenting work as copying a named source — [SKILL.md](https://github.com/referodesign/refero_skill/blob/master/skills/refero-design/SKILL.md)
- Note that the same skill tells agents not to use generic design skills as a parallel authority, so it conflicts with other installed design skills by design — [SKILL.md](https://github.com/referodesign/refero_skill/blob/master/skills/refero-design/SKILL.md)
- Impeccable found styling applied over a standard grid hid a conventional layout, and kept the instruction to borrow a form's skeleton rather than its surface. It removed a check against obviously borrowed forms after it would have rejected a 10/10 human reference, and calls that its largest quality gain — [Impeccable research](https://impeccable.style/research)

**Evidence of convergence**
- Anthropic calls the problem distributional convergence, and the prompt text its article publishes admits: "You still tend to converge on common choices (Space Grotesk, for example)" — [Anthropic blog](https://claude.com/blog/improving-frontend-design-through-skills)
- The current skill names different clusters: cream with terracotta, near-black with acid green, broadsheet layouts, the SaaS card kit, and template chrome — [SKILL.md](https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md)
- Design Theater (accepted at AAAI/AIES) generated 120 interfaces from ChatGPT, Claude, Firebase Studio, v0 and Bolt across 24 tasks. Visual appearance and layout converged across tools, while color varied more. It defines the gap as "plausible and confident design rationales that have little relationship to the actual implementation". Over 25% of rationales went unimplemented. There was no human baseline, and tools were barred from web search — [arXiv 2607.22928](https://arxiv.org/html/2607.22928); [abstract](https://arxiv.org/abs/2607.22928)
- Shin et al. argue "the push for frictionless generation can exacerbate homogenization and its harms". They propose clarifying questions, contrasting mood boards, ingesting brand tokens, flagging generic conventions and style adapters. It is a preprint with illustrative case studies and no measurements of generated sites — [arXiv 2603.13036](https://arxiv.org/html/2603.13036)
- Convergence predates AI. Goree et al. (CHI 2021) studied about 10,000 sites and found layout distance fell over 30%, with Bootstrap and similar library users looking more alike. Sources differ on the window: since 2007 in the paper's abstract, 2010–2016 in press — [paper](https://vision.soic.indiana.edu/papers/websimilarity2021chi.pdf) (search excerpt only); [The Conversation](https://theconversation.com/yes-websites-really-are-starting-to-look-more-similar-136484)

**Anti-convergence mechanisms**
- Named cliché lists: [frontend-design](https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md). A deterministic 62-rule detector that flags tells such as purple-to-blue gradients and nested cards, with no LLM: [Impeccable](https://raw.githubusercontent.com/pbakaus/impeccable/main/README.md)
- A distinctness requirement and a headline swap test: [gstack](https://raw.githubusercontent.com/garrytan/gstack/main/design-shotgun/SKILL.md.tmpl)
- Random draws, with re-rolls that avoid dealt entries: [Impeccable research](https://impeccable.style/research)
- Refero's skill also flags calm editorial styling as a current AI-slop risk, a sign these lists age quickly — [SKILL.md](https://github.com/referodesign/refero_skill/blob/master/skills/refero-design/SKILL.md)
- Impeccable's own catalog review rejected a style for resembling common AI aesthetics, and found mining productive sources brought repetition, so it moved to small rounds in new territory — [Impeccable research](https://impeccable.style/research)

### Inferences
- Cliché lists work like a moving target. Space Grotesk, cream with terracotta and calm editorial all look like second-order defaults that emerged after earlier bans. The timeline is my reading, not a measured trend.
- Lookups, galleries and brand files can each converge in their own way: within a category, around what gets curated, and around the same brands. Multi-source synthesis and outside-domain references address this only partly.
- Stated rationales shouldn't be taken as proof of a direction. Design Theater suggests checking the build against the lock mechanically or with a fresh reviewer.

### Gaps
- I did not research case law on trade dress or UI copying.
- I found no measurement of whether reference-locked or database-driven outputs are more or less homogeneous than prompt-only output.

## What evidence shows reference-driven work beats prompt-only work?

### Takeaway
The evidence is thin and indirect. I found no controlled study comparing reference-driven and prompt-only output from coding agents with independent human judges. The best available items are one image-model study, one vendor's campaign and qualitative NN/g findings, and fixation research shows references also carry a cost.

### Cited Findings

**For**
- Vologdin and Bakaev (IMS 2024; published Oct 2025) found multimodal prompts raised mean evaluations of generated UIs by 50.9% on Stable Diffusion 1.5, 40.5% on KreaAI and 9.1% on a UI/UX LoRA. Simple wireframes beat detailed screenshots of real UIs. These were image models rather than coding agents, and I saw only a search excerpt — [Springer](https://link.springer.com/chapter/10.1007/978-3-031-96177-9_18); [Crossref](https://api.crossref.org/works/10.1007/978-3-031-96177-9_18)
- Impeccable reports its final workflow won 100% of decisive pairs against the strongest competitor skill on examined tasks, from 30–40% earlier and 0 of 9 at baseline. Curated outside references widened range when the model's list was repetitive, and reference cards appeared in the strongest builds. The page itself says the card effect wasn't isolated, ratings came from one director, and model and judge are unnamed. It is also a vendor measuring its own product — [Impeccable research](https://impeccable.style/research)
- NN/g reports reference images help match a visual style and detailed prompts got closer to human work. This is qualitative — [NN/g](https://www.nngroup.com/articles/vague-prototyping/)
- Dow et al. (TOCHI 2010) found parallel prototyping gave better results and more divergence than serial in an ad-design task, using click-through and expert ratings. This supports several-directions workflows, though with humans. I saw summaries only — [Stanford](https://cs303.stanford.edu/papers/ParallelPrototyping2010-final.pdf); [talk abstract](https://hci.stanford.edu/seminar/abstracts/09-10/100115-dow.html)
- DesignPrompt (DIS 2024) reports multimodal input helped designers explore and express themselves — [HAL](https://hal.u-pec.fr/LISN-EX-SITU/hal-04652020v1)

**Against or cautionary**
- Wadinambiarachchi et al. (CHI 2024, N=60, 20 per condition) compared no support, Google Images and Midjourney for human ideation. Both aids raised fixation over baseline. "GenAI led to even more design fixation than Image Search". Image search also lowered fluency and variety, largely via time on task — [arXiv](https://arxiv.org/html/2403.11164v1)
- Chen et al. saw superficial modifications rather than new structures among novices — [arXiv 2502.05870](https://arxiv.org/html/2502.05870v1)
- A reference shows that a product used a design, not that it worked — [Mobbin](https://mobbin.com/mcp.md)

**Vendor claims without evidence**
- Refero's repo offers no benchmarks or before-and-after results, only scale and intent — [repo](https://github.com/referodesign/refero_skill)
- A review's "real test" of Refero had no comparison group, no repeated runs and no output measurement. It also recommends a Lifetime plan and doesn't state any affiliate status — [review](https://soymarketingultra.com/en/refero-review-design-claude-code-codex/)
- Anthropic's evidence compares skill against no skill, without references, through captioned side-by-sides — [Anthropic blog](https://claude.com/blog/improving-frontend-design-through-skills)

### Inferences
- "References improve output" is plausible but unproven for coding agents. "References trade breadth for anchoring" has better experimental support, though with human subjects.
- Raw screenshots may be the weakest reference form. The wireframe result and NN/g's token-precision point both lean that way, on limited evidence.
- A fair test would run the same briefs with no references, retrieved references and a random catalog draw, using blind human raters and a homogeneity metric such as Design Theater's index. None of the sources I read did this.

### Gaps
- Springer's page redirected to an authorization step, so the Vologdin and Bakaev method and sample are unverified.
- Calò and De Russis (IS-EUD 2025) compared visual prompting modes, but results weren't verified — [PoliTO](https://iris.polito.it/handle/11583/3000511).
- Dow's exact numbers weren't verified, since the PDF links failed.
- I found no conversion or usability outcome data for any workflow in this review.
