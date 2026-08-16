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
| Forms/validation | React Hook Form + Zod |
| Charts | Recharts |
| Styling | Tailwind CSS 4 + shadcn/Radix primitives |
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
| `/transactions/add` | Add transaction |
| `/transactions/:id/edit` | Edit transaction |
| `/budgets` | Budgets list |
| `/budgets/add` | Add budget |
| `/budgets/:id/edit` | Edit budget |
| `/debts` | Debts list |
| `/debts/add` | Add debt |
| `/debts/:id` | Debt details/payments |
| `/analytics` | Analytics |
| `/more` | Secondary sections/settings |

There is no `/dashboard` or `/stats` route. Dashboard data exists as backend API/service data and is consumed by UI pages such as Home and Analytics.

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

The project follows a Feature-Sliced Design style layout. Shared UI primitives live in `src/shared/ui/`; there is no separate design-system package.

## Telegram Mini App notes

- Phone testing requires a public HTTPS URL; `localhost` is not enough.
- The root helper `npm run dev:miniapp -- --chat-id=<id>` starts a Cloudflare quick tunnel, updates local `WEB_APP_URL`, updates the Telegram persistent menu button, builds, and runs the backend serve command.
- Use `npm run miniapp:menu -- status --chat-id=<id>` from the root only if you need to inspect menu state safely without printing the bot token.

## Verification

The root gate is:

```bash
npm run verify
```

It includes backend build, serial Jest tests, webapp Vitest tests, webapp production build, dependency-cruiser, and madge circular checks.
