
# Repository Guidelines

## Project Structure & Modules
- `src/`: TypeScript source. Key areas: `config/` (AppConfig), `framework/` (Express server, Telegram bot), `modules/` (transaction, voiceProcessing with `domain/`, `application/`, `infrastructure/`, `interfaces/`), `shared/` (errors, middleware, validation, learning), `appModules.ts`, `index.ts`.
- `tests/`: Jest tests, `*.test.ts`.
- `dist/`: Compiled output from TypeScript.
- `public/webapp/`: Static web app served under `/webapp`.
- `webapp/`: Frontend built on postinstall; not required for backend dev.

## Build, Test, and Development
- `npm run dev`: Start local API and Telegram bot via ts-node-dev.
- `npm run build`: Compile TypeScript to `dist/`.
- `npm start`: Run compiled server from `dist/index.js`.
- `npm test`: Run Jest tests (`ts-jest`, Node env). Health check: `GET /api/health`.
- Docker: `docker compose up --build` to run containerized (optional).

## Coding Style & Naming
- Language: TypeScript (`strict: true`). Use 2-space indentation.
- Filenames: camelCase (`processTextInput.ts`), tests: `name.test.ts`.
- Classes/Types: PascalCase; functions/variables: camelCase; constants: UPPER_SNAKE_CASE.
- Organize code by module (domain/application/infrastructure/interfaces). Avoid cross-module imports from internals; depend on interfaces.

## Testing Guidelines
- Framework: Jest with `ts-jest` preset. Place tests in `tests/` and name `*.test.ts`.
- Scope: unit test application/domain, route tests via Express routers; mock external services (OpenAI, Notion, Telegram).
- Run locally with `npm test`. Add minimal fixtures; keep tests deterministic.

## Commit & Pull Requests
- Commits: Conventional style (`feat:`, `fix:`, `refactor:`). Imperative, concise subject; include scope when helpful.
- PRs: clear description, linked issue, steps to validate, note breaking changes. Add API examples and screenshots for webapp changes when relevant.
- Keep PRs focused and small. Include tests and update docs when behavior changes.

## Security & Configuration
- Create `.env` from `.env.example`: set `OPENAI_API_KEY`, `NOTION_API_KEY`, `NOTION_DATABASE_ID`, `TG_BOT_API_KEY` (required in prod), `WEB_APP_URL`.
- Never commit secrets. App validates config at startup (`AppConfig.validate()`); check logs on boot.
- Default paths: downloads/uploads under project root; supported audio formats: mp3/wav/ogg/m4a.
