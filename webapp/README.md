# Kapelka WebApp

React + TypeScript Telegram Mini App of Kapelka (the bot, this Mini App and the iOS app share the name). The same app
opens in a browser after a login through the bot.

Source of truth for routes: `src/app/router/appRoutes.tsx` (`routes.tsx` only makes the browser router of it); links in
code go through `ROUTES` in `src/shared/lib/constants/routes.ts`.

## Tech Stack

| Area | Current stack |
|---|---|
| UI | React 19 + TypeScript |
| Build | Vite 7, `vite-plugin-pwa` |
| Routing | React Router 7 |
| Server state | TanStack Query |
| Client state | zustand |
| Styling | Tailwind CSS 4 + the design system «Пастель» (`src/shared/ui/pastel/`); its sheet is a Radix dialog |
| Offline | Dexie (the outbox of records and the reads kept for the offline mode) |
| Tests | Vitest |
| Lint | ESLint |

The rules of «Пастель» — tokens, components, screens — are in [`docs/pastel/`](../docs/pastel/README.md):
[`design-system.md`](../docs/pastel/design-system.md) and one spec per component in
[`components/`](../docs/pastel/components/). There are no forms libraries (React Hook Form, Zod) and no chart library.

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
npm run lint     # ESLint; a warning fails it too (--max-warnings 0)
npm run build    # TypeScript build + Vite production build
```

The Express backend serves the production build from `../public/webapp/`; the files of `assets/` with a content hash in
the name get `Cache-Control: immutable` (`src/delivery/web/express/httpApp.ts`). The root `npm run build:webapp` (`scripts/build-webapp.js`, #380) builds into
`public/webapp.next` and puts it in place of `public/webapp` whole, so a running server never serves a half-written
build; `npm run build` from `webapp/` alone writes into `../public/webapp/` directly.

## Routes

| Route | Page (`src/pages/…`) |
|---|---|
| `/` | Home (`home`): balance card, month tiles, the audit card, recent records, the composer |
| `/?record=<id>` | Home with the record sheet open — a record has no page, rows open the sheet; the bot's «Изменить» links here |
| `/transactions` | History (`transactions`): search and filter chips; `?account=<id>&record=<id>` — narrowed to an account with a record's sheet open |
| `/add` | Manual entry (`manual-entry`): keypad, account, category, date; `?type=income` starts as an income |
| `/review` | Review of the records a phrase from the composer made (`capture-review`) |
| `/offline-voice`, `/offline-receipt` | Voice and receipts without a connection (`capture-offline`), with «Ввести вручную» |
| `/analytics` | Analytics (`analytics`): a month by category, `?month=YYYY-MM&type=income` |
| `/analytics/categories/:id` | One category of the month (`analytics`): by day and its operations |
| `/accounts` | Accounts and the USD rate (`accounts`) |
| `/accounts/:id` | One account (`accounts`): balance, records and moves |
| `/accounts/transfer` | Transfer and exchange (`accounts`); `?from=<id>` — from that account |
| `/audit` | The spending audit of the month before (`audit`) |
| `/more` | «Ещё» (`more`): sections and settings |
| `/more/categories` | Categories (`categories`): rename, colour, hide, add |
| `/dev/pastel` | Showcase of the «Пастель» components in both themes (`pastel-showcase`); outside the login and the first launch, not linked |
| any other | «Такой страницы нет» (`not-found`) |

Not routes, but screens in their place: the login (`login`) — any app address in a browser without a session
(`AuthGate`); the first launch (`first-launch`) — any app address until «Сколько у вас сейчас денег?» is answered
(`FirstLaunchGate`); «Экран не открылся» (`route-error`) — a
screen whose code did not load or that failed; «Откройте Kapelka заново» (`mini-app-reopen`) — the whole app inside
Telegram once the server refuses its initData (a `401`).

There is no `/dashboard` or `/stats` route. The webapp does not read the backend's dashboard API (FT-121): Analytics
reads `GET /api/analytics`. The budget screens are gone since #264, the debt screens since #265: their old addresses
are «Такой страницы нет».

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

The project follows a Feature-Sliced Design style layout. The components of «Пастель» live in `src/shared/ui/pastel/`
and every screen is built of them (#290); there is no separate design-system package. Outside `pastel/`,
`src/shared/ui/` keeps the error boundary and five shadcn primitives (`badge`, `button`, `card`, `progress`,
`skeleton`). They, `sonner`, `@radix-ui/react-slot` and `@radix-ui/react-progress` serve only the limit and
subscription widgets (`widgets/usage-limits`, `entities/subscription/ui`, `features/limit-warning`), which no screen
shows; they stay until the decision on #319.

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

It includes backend build, test types (`typecheck:tests`), script types (`typecheck:scripts`), this app's ESLint (`lint:webapp`), serial Jest tests, webapp Vitest tests, webapp production build, font and token checks, and dependency-cruiser over the backend's `src/` (layer rules and circular imports).
