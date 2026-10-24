# Security policy

TamperSloth runs with broad browser permissions and can act on any page, so security reports matter a lot to us.

## Reporting a vulnerability

Please don't open a public issue. Instead, report it privately in one of these ways:

- Use **Report a vulnerability** on the repository's **Security** tab on GitHub, or
- Email **support@tampersloth.com** with "Security" in the subject.

Include what you found, how to reproduce it, and what an attacker could do with it. We'll confirm we got your report within a few days and keep you posted while we fix it. Please give us a reasonable amount of time to release a fix before you disclose anything publicly.

## What's in scope

- The Chrome extension in `extension/`, especially ways a web page could make the agent act without the user's consent, read data from other sites, or get around the confirmation prompts and safety checks.
- The API in `server/`: authentication, billing and webhooks, and credit or spend-limit bypasses.
- The website in `landing-page/`.

Problems that only affect your own self-hosted deployment because of how it's configured are out of scope, as is prompt injection that only works after the user approves the action it leads to.
