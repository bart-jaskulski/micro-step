<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# AGENTS.md: SolidStart AI Task List

_Last updated: 2025-11-22_

> **Purpose** – This file is the onboarding manual for every AI assistant (Claude, Cursor, GPT, etc.) and every human who edits this repository.
> It encodes our coding standards, architectural principles, and workflow to ensure high-quality, maintainable code.

---

## Project Overview

This is a **Local-First AI Task Manager** built with **SolidStart**. It is designed to help users (specifically targeting neurodivergent needs) break down complex tasks into manageable chunks using Generative AI.

**Key Components:**

- **Framework**: SolidStart (SolidJS meta-framework) using `vinxi`.
- **Language**: TypeScript.
- **Data Layer (Local-First)**: **cr-sqlite** for structured queries with CRDTs, persisted via **OPFS** (Origin Private File System) with IndexedDB fallback. Tasks stored in SQL tables. There is **no** traditional backend database (Postgres/MySQL).
- **AI Layer**: Vercel AI SDK (`ai`, `@ai-sdk/google`) running on Server Actions to interface with Gemini.
- **Styling**: Modern vanilla CSS with CSS Variables, layers, CSS nesting, scoped component CSS, features like View Transitions and modern size values.
- **Ordering**: `lexorank` for efficient drag-and-drop sorting.
- **Sync Architecture**: File-based encrypted changesets stored in **Cloudflare R2**. Sync is pull-to-refresh (no real-time WebSocket). Device-to-device pairing via QR codes with end-to-end encryption.

**Golden Rule**: When unsure about implementation details, architectural choices, or requirements, **ALWAYS consult the developer** rather than making assumptions.

---

## Non-negotiable Golden Rules

| #:  | AI _may_ do                                                                                                                                         | AI _must NOT_ do                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-0 | Ask for clarification if the task involves adding a backend database or changing the local-first architecture.                                      | ❌ Attempt to install Tailwind, ORMs (Prisma/Drizzle), or switch to React.                                                                            |
| G-1 | Generate code **only inside** `src/` or explicitly pointed configuration files.                                                                     | ❌ Touch `.vinxi/`, `.output/`, or `node_modules/`.                                                                                                   |
| G-2 | Use **SolidJS primitives** (`createSignal`, `createEffect`, `Show`, `For`).                                                                         | ❌ Use React hooks (`useState`, `useEffect`) or React patterns (dependency arrays, virtual DOM logic).                                                |
| G-3 | Follow existing CSS patterns (CSS variables defined in `app.css`, separate `.css` files for components).                                            | ❌ Introduce CSS-in-JS libraries or Utility classes (Tailwind) unless explicitly requested.                                                           |
| G-4 | For changes >300 LOC or >5 files, **ask for confirmation** before proceeding.                                                                       | ❌ Refactor the `taskStore.ts` synchronization logic without deep understanding of Y.js.                                                              |
| G-5 | Stay within the current task context. Inform the developer if it would be better to start afresh.                                                   | ❌ Continue work from a prior prompt after "new task" – start a fresh session.                                                                        |

---

## Coding Standards

- **Framework**: SolidStart (Vinxi).
- **Reactivity**: Fine-grained reactivity.
    -   Use `createSignal` for local state.
    -   Use `createStore` for complex nested state.
    -   **Never** destructure props in Solid components (you lose reactivity). Access them via `props.value`.
- **Control Flow**: Use Solid's `<Show>`, `<For>`, `<Switch>`, `<Match>` components instead of `array.map()` or ternary operators for rendering.
- **Data Persistence**:
    -   All persistent data goes through `src/stores/taskStore.ts` and `src/stores/vaultStore.ts`.
    -   Task mutations happen via SQL queries to cr-sqlite database.
    -   Vault keys and sync state stored in IndexedDB.
- **Styling**:
    -   Use minimal amount of classes, enhance css + html with data attributes for variable styling, (e.g., button[type="submit"] or .container[data-size="large"])
    -   Design for mobile-first experience, targeting media queries only above certain screen sizes.
    -   Leverage variables from `app.css` (e.g., `var(--accent)`, `var(--surface)`).
- **Icons**: Use `lucide-solid`.

---

## Project Layout & Core Components

| Directory | Description |
| :--- | :--- |
| `src/actions/` | Server Actions (`use server`). Handles AI calls and sensitive logic. |
| `src/components/` | UI Components and their specific `.css` files. |
| `src/routes/` | File-based routing. `index.tsx` is the home. |
| `src/stores/` | **Critical**. Contains `taskStore.ts` which handles Y.js, IndexedDB, and Lexorank logic. |
| `src/app.tsx` | Root application component and provider setup. |
| `src/app.css` | Global styles and CSS variables. |

---

## Key Architectural Concepts

### 1. Local-First Data (cr-sqlite + OPFS)
-   **Concept**: The app works offline. Data is stored in cr-sqlite WASM database persisted via OPFS (Origin Private File System) with IndexedDB fallback.
-   **State**: The UI reads from a Solid `createStore` that mirrors SQLite queries.
-   **Sync**: Changes trigger reactive updates to the Solid store to update the UI efficiently.
-   **Implication**: Do not try to fetch tasks from an API endpoint. Read them from `tasks()` in `taskStore.ts`.

### 2. Server Actions for AI
-   **Concept**: Heavy AI processing happens on the server to protect API keys.
-   **Flow**:
    1.  User submits form in `TaskPrompt.tsx`.
    2.  `breakdownTask` action (in `src/actions/taskActions.ts`) runs on the server.
    3.  Server calls Google Gemini via Vercel AI SDK.
    4.  Action returns structured data (JSON) to the client.
    5.  Client receives data and updates the **local** SQLite database.

### 3. Lexorank Ordering
-   **Concept**: To support drag-and-drop without re-indexing the whole list, we use `lexorank`.
-   **Usage**: Every task has a `rank` string. When moving a task, calculate the new rank between the previous and next sibling.

### 4. Vault-Based Sync (Cloudflare R2 + cr-sqlite CRDTs)
-   **Concept**: Optional sync via encrypted changesets stored in Cloudflare R2. Device pairing via QR codes.
-   **Flow**:
    1.  First device = local-only (no sync)
    2.  Adding first paired device generates vault key and stores in IndexedDB
    3.  QR code contains vault key + device ID
    4.  cr-sqlite generates changesets on local changes
    5.  Changesets encrypted with vault key (AES-GCM) before upload
    6.  Upload to R2 with path = SHA256(vaultKey) (prevents enumeration)
    7.  Sync on page load: fetch changesets since last sync, decrypt, apply to local DB
    8.  Offline queue for failed uploads with retry on next sync
-   **Zero-Knowledge**: Server (R2 proxy) never sees unencrypted data. All encryption happens client-side.
-   **CRDT Merger**: cr-sqlite handles conflicts automatically with last-write-wins per column.

---

## Common Pitfalls (SolidJS Specific)

-   **Destructuring Props**: `const { title } = props;` breaks reactivity. **Always** use `props.title`.
-   **Dependency Arrays**: `createEffect` tracks dependencies automatically. Do not pass a dependency array like in React.
-   **Class vs ClassName**: Solid uses `class="..."`, not `className`.
- **Server vs Client**:
     -   Files with `"use server"` run only on the server.
     -   Components using browser APIs (like `IndexedDB`, `document`, or `crypto`) must be wrapped in `clientOnly` or checked with `isServer` / `onMount`.
- **SQL Database**:
     -   When working with cr-sqlite, always use camelCase for TypeScript types (e.g., `parentId`, `dueAt`) but snake_case for SQL queries (e.g., `parent_id`, `due_at`).
     -   Convert between types using helper functions (e.g., `dbRowToTask`).

---

## Files to NOT Modify

- `.vinxi/`
- `.output/`
- `pnpm-lock.yaml`
- `node_modules/`
- `dist/` 
