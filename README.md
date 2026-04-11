# SolidStart

Everything you need to build a Solid project, powered by [`solid-start`](https://start.solidjs.com);

## Docker deployment

The app can be run as a single Node container.

1. Create a runtime env file:

```bash
cp .env.example .env
```

2. Set `GOOGLE_API_KEY` in `.env`.

3. Build and start the app:

```bash
docker compose up --build -d
```

The app is exposed on `http://localhost:3000` by default.

Notes:

- The container runs the existing SolidStart/Nitro production server from `.output/server/index.mjs`.
- `./storage` is mounted into the container so filesystem-backed sync data survives container recreation.
- Task data remains local-first in the browser via OPFS/IndexedDB, so Docker does not add a backend database.

## Creating a project

```bash
# create a new project in the current directory
npm init solid@latest

# create a new project in my-app
npm init solid@latest my-app
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

Solid apps are built with _presets_, which optimise your project for deployment to different environments.

By default, `npm run build` will generate a Node app that you can run with `npm start`. To use a different preset, add it to the `devDependencies` in `package.json` and specify in your `app.config.js`.

## This project was created with the [Solid CLI](https://github.com/solidjs-community/solid-cli)
