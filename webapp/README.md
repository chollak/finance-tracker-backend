# Finance Tracker WebApp

React + TypeScript Telegram Mini App frontend for Finance Tracker.

Current source of truth for routes: `src/app/router/routes.tsx`.

## Tech Stack

| Area | Current stack |
|---|---|
| UI | React 19 + TypeScript |
| Build | Vite 7 |
| Routing | React Router 7 |
| Server state | TanStack Query |
| Styling | Tailwind CSS 4 + the design system «Пастель» (`src/shared/ui/pastel/`, rules in `docs/pastel/`); its sheet is a Radix dialog |
| Offline | Dexie |
| Tests | Vitest |

## Development

From the repository root:

```bash
# Full-stack hot reload: backend :3000 + Vite dev server :5173
npm run dev:full

# Phone / Telegram Mini App flow (recommended for product testing)
npm run dev:miniapp -- --chat-id=<telegram_chat_id>
```

From `webapp/` only:

```bash
npm install
npm run dev      # Vite dev server; backend must run separately
npm run test     # Vitest
npm run build    # TypeScript build + Vite production build
```

The production build is emitted to `../public/webapp/` and served by the Express backend.

## Routes

| Route | Page |
|---|---|
| `/` | Home |
| `/transactions` | Transactions list |
| `/add` | Manual entry (keypad, account, category, date) |
| `/?record=<id>` | Home with the record sheet open (a record has no page; rows open the sheet) |
| `/analytics` | Analytics: a month by category (`?month=YYYY-MM&type=income`) |
| `/analytics/categories/:id` | One category of the month: by day and its operations |
| `/more` | Secondary sections/settings |

There is no `/dashboard` or `/stats` route. The webapp no longer reads the backend's dashboard API (FT-121): Analytics reads `GET /api/analytics`. The budget screens are gone since #264, the debt screens since #265.

## Structure

```text
webapp/
└── src/
    ├── app/        # providers, router, styles
    ├── pages/      # route pages
    ├── widgets/    # composed page blocks
    ├── features/   # user actions/forms/flows
    ├── entities/   # domain UI models/components
    └── shared/     # UI primitives, API client, lib, hooks, config
```

The project follows a Feature-Sliced Design style layout. The components of «Пастель» live in `src/shared/ui/pastel/`; there is no separate design-system package and no shadcn layer (#290).

Every page loads its own code (#291): the router's lazy imports go through `src/app/router/pageLoaders.ts`, one `import('@/pages/<page>')` per page module, and there is no `src/pages/index.ts` barrel — one import of a barrel of all the pages would put every screen into a single chunk, and Home would download all of them. The build names these chunks `page-<page>-*.js`; the screens of one page module (analytics, the accounts, voice and receipts offline) share its chunk.

Once Home is drawn, its reads are in and the browser is idle (`requestIdleCallback`, a one-second timer in Safari and the iOS WebView), the chunks of the screens Home leads to load ahead (`screenPrefetch.ts`), so the first move to a screen does not wait for its code. The login, the first launch and a screen opened straight away load only their own. The load ahead runs once, one screen after another, and stops quietly at the first failure. A browser remembers a failed `import()` until the app is loaded again (Chrome does), so it is not tried while the app is offline or while a read on Home has got no answer at all (its error, or the failed attempt it is retrying). If a piece still fails, every screen that needs it shows «Экран не открылся» until «Обновить»: one screen when it was that screen's own piece, almost all of them when it was a shared one (`back-button-*`). One «Обновить» mends them all.

## Telegram Mini App notes

- Phone testing requires a public HTTPS URL; `localhost` is not enough.
- The root helper `npm run dev:miniapp -- --chat-id=<id>` starts a Cloudflare quick tunnel, updates local `WEB_APP_URL`, updates the Telegram persistent menu button, builds, and runs the backend serve command.
- Use `npm run miniapp:menu -- status --chat-id=<id>` from the root only if you need to inspect menu state safely without printing the bot token.

## Verification

The root gate is:

```bash
npm run verify
```

It includes backend build, test types (`typecheck:tests`), script types (`typecheck:scripts`), serial Jest tests, webapp Vitest tests, webapp production build, font and token checks, and dependency-cruiser (layer rules and circular imports).
