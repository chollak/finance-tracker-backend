# Finance Tracker Backend

This project provides a simple backend service written in TypeScript for tracking financial transactions and processing voice or text inputs using OpenAI. Transactions are stored in a Notion database.

## Prerequisites

- Node.js >= 18
- npm
- ffmpeg (for converting voice messages)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file in the project root and define the following variables:

```
OPENAI_API_KEY=your_openai_key
NOTION_API_KEY=your_notion_key
NOTION_DATABASE_ID=your_notion_database_id
TG_BOT_API_KEY=your_telegram_bot_key
WEB_APP_URL=https://sapaev.uz
```

## Build and Run

To compile the TypeScript sources and start the application:

```bash
npm run build
npm run serve
```

During development you can run the server with automatic reload:

```bash
npm run dev
```

## Docker Compose

To build and start the application in a container:

```bash
docker compose up -d --build
```

The service will be available on [http://localhost:3000](http://localhost:3000).
View logs with:

```bash
docker compose logs -f
```

Stop and remove the containers when you're done:

```bash
docker compose down
```

## Web App (Telegram Mini App)

The `webapp/` folder contains a React + TypeScript frontend built with Vite. It
is served by Express from the `/webapp` route.

### Development

```bash
cd webapp
npm install
npm run dev
```

### Building for production

```bash
cd webapp
npm run build
```

The build outputs static files to `public/webapp/` so they can be served by the
backend.

## Running Tests

Unit tests are executed with Jest:

```bash
npm test
```

## GitHub Actions

The `deploy` workflow in `.github/workflows/deploy.yml` runs on pushes to the `main` branch and performs the following steps:

1. Sets up Node.js 18 using `actions/setup-node`.
2. Installs dependencies with `npm ci`.
3. Executes tests with `npm test`.
4. Deploys the application to your server over SSH, where the container is built using `docker compose`.
5. Ensure that the repository secrets `SSH_HOST`, `SSH_USER` and `SSH_KEY` are configured with your server details so the SSH deployment step can connect.

## Project Structure

The code follows Clean Architecture principles with layers for `domain`, `application`, `infrastructure`, and `interfaces`. Express configuration lives under `src/framework/express`.

### Module interactions

The `voiceProcessing` module depends on the `transaction` module through the `CreateTransactionUseCase`. Voice commands are transcribed and immediately recorded as transactions. Both modules are instantiated once in `createModules()` and shared between the HTTP server and the Telegram bot.
