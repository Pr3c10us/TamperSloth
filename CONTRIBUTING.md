# Contributing to TamperSloth

Thanks for helping out. Bug reports, fixes and new browser tools are all welcome.

## Before you start

- For anything bigger than a small fix, open an issue first so we can agree on the approach before you put time into it.
- Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## Setup

See the [README](README.md) for running each package. Most changes only touch `extension/`.

Turn on the repository's pre-commit hook. It stops commits that include `.env` files, private keys or lines that look like API keys:

```bash
git config core.hooksPath .githooks
```

## Making a change

1. Fork the repository and create a branch from `master`.
2. Keep the change focused. Unrelated refactors make a pull request harder to review.
3. Match the code around you: naming, formatting and how much it comments.
4. Add or update tests when you change behavior. Extension tests live in `extension/tests/` and use Node's built-in test runner.
5. Check your work before opening the pull request:

   ```bash
   cd extension && npm test && npm run build
   cd server && bunx tsc --noEmit
   cd landing-page && npm run build
   ```

6. In the pull request, say what changed and why, and how you tested it. Include a screenshot or short recording for UI changes.

## Database changes

Schema changes go in `server/migrations/` as an `up` and a `down` SQL file. Create the pair with `bun run migrate:create <name>`, and make sure the `down` file really undoes the `up` file.

## Secrets

Never commit real keys, tokens or passwords. Put them in an ignored `.env` file (`server/.env`, `extension/.env.local`, `landing-page/.env.local`), and add any new variable to the matching `.env.example` with a comment.

## Licensing

By contributing, you agree that your contribution is licensed under this repository's [LICENSE](LICENSE).
