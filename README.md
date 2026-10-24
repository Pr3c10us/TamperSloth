# TamperSloth

TamperSloth is a Chrome extension that puts an AI agent in your browser's side panel. Ask it to do something on the page you're on, or across several tabs, and it reads, clicks, types and fills forms for you. It can also write user scripts that run every time you visit a site.

Bring your own key for Anthropic, OpenAI, Google Gemini, Vertex AI, DeepSeek, Moonshot Kimi or xAI Grok, or sign in with Google and use the hosted "Sloth" models. With your own key, requests go straight from your browser to that provider. Keys, conversations and scripts stay in the browser's own storage.

Website: [tampersloth.com](https://tampersloth.com)

## Repository layout

| Folder | What it is | Stack |
| --- | --- | --- |
| [`extension/`](extension) | The Chrome extension: side panel, background worker, browser tools | React, Vite, Tailwind, Vercel AI SDK |
| [`server/`](server) | API for Google sign-in, the hosted Sloth models, credits and Paddle billing | Bun, Express, Postgres, Redis |
| [`landing-page/`](landing-page) | tampersloth.com, including the pricing and legal pages | React, Vite, Cloudflare Workers |

You only need the extension to use TamperSloth with your own API keys. The server and landing page are only needed for sign-in, Sloth models and billing.

## Running the extension

Needs Node 22.12 or newer and Chrome 138 or newer.

```bash
cd extension
npm install
npm run build
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick `extension/extension` (the build output).
3. Open the extension's **Details** page and turn on **Allow User Scripts**.
4. Press `Ctrl+Shift+S` (`Cmd+Shift+S` on a Mac) to open the panel, then add an API key in Settings.

By default a build talks to the hosted API at `api.tampersloth.com`. To use a local server instead, copy [`extension/.env.example`](extension/.env.example) to `extension/.env.local` and rebuild.

`npm run dev` serves the panel UI on its own at `http://localhost:5173`, which is handy for UI work. The browser tools only work in the loaded extension.

Run the tests with:

```bash
npm test
```

## Running the server

Needs [Bun](https://bun.sh) 1.4 or newer, plus Postgres and Redis. The bundled Compose file provides both.

```bash
cd server
cp .env.example .env    # then fill it in; the comments say what each value is for
bun install
docker compose up -d postgres redis
bun run migrate
bun run dev
```

The API listens on `http://localhost:5000` (`GET /health` answers `server up`). To run the API in Docker too, use `docker compose up -d --build`, then `docker compose run --rm backend bun run migrate`.

What you'll need to set up first:

- **Google sign-in.** Create an OAuth client of type "Chrome extension" in Google Cloud for your extension ID. Put its client ID in `extension/public/manifest.json` (`oauth2.client_id`) and in `GOOGLE_EXTENSION_CLIENT_ID`. Unpacked extensions get a new ID on each machine unless you pin one with a `key` in the manifest.
- **Sloth models.** Set `ANTHROPIC_API_KEY`.
- **Billing (optional).** Leave the `PADDLE_*` values empty and billing stays off. To try it, use a Paddle sandbox account.

Typecheck with:

```bash
bunx tsc --noEmit
```

## Running the landing page

```bash
cd landing-page
npm install
npm run dev     # http://localhost:5180
```

See [`landing-page/.env.example`](landing-page/.env.example) to point the pricing page at a local server or a Paddle sandbox.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). To report a security problem, follow [SECURITY.md](SECURITY.md) instead of opening an issue.

## License

TamperSloth is released under the [MIT License](LICENSE). The TamperSloth name and logo aren't covered by the license; please don't use them for your own builds or forks.
