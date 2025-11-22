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
- **Data Layer (Local-First)**: **Y.js** for state and CRDTs, persisted via **IndexedDB** (`y-indexeddb`). There is **no** traditional backend database (Postgres/MySQL).
- **AI Layer**: Vercel AI SDK (`ai`, `@ai-sdk/google`) running on Server Actions to interface with Gemini.
- **Styling**: Modern vanilla CSS with CSS Variables, layers, CSS nesting, scoped component CSS, features like View Transitions and modern size values.
- **Ordering**: `lexorank` for efficient drag-and-drop sorting.

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
    -   All persistent data goes through `src/stores/taskStore.ts`.
    -   Mutations must happen inside `doc.transact(() => { ... })`.
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

### 1. Local-First Data (Y.js + IndexedDB)
-   **Concept**: The app works offline. Data is stored in a Y.js `Doc` which syncs to IndexedDB via `y-indexeddb`.
-   **State**: The UI reads from a Solid `createStore` that mirrors the Y.js map.
-   **Sync**: `yTasks.observe` triggers a `reconcile` on the Solid store to update the UI efficiently.
-   **Implication**: Do not try to fetch tasks from an API endpoint. Read them from `tasks()` in `taskStore.ts`.

### 2. Server Actions for AI
-   **Concept**: Heavy AI processing happens on the server to protect API keys.
-   **Flow**:
    1.  User submits form in `TaskPrompt.tsx`.
    2.  `breakdownTask` action (in `src/actions/taskActions.ts`) runs on the server.
    3.  Server calls Google Gemini via Vercel AI SDK.
    4.  Action returns structured data (JSON) to the client.
    5.  Client receives data and updates the **local** Y.js store.

### 3. Lexorank Ordering
-   **Concept**: To support drag-and-drop without re-indexing the whole list, we use `lexorank`.
-   **Usage**: Every task has a `rank` string. When moving a task, calculate the new rank between the previous and next sibling.

---

## Common Pitfalls (SolidJS Specific)

-   **Destructuring Props**: `const { title } = props;` breaks reactivity. **Always** use `props.title`.
-   **Dependency Arrays**: `createEffect` tracks dependencies automatically. Do not pass a dependency array like in React.
-   **Class vs ClassName**: Solid uses `class="..."`, not `className`.
-   **Server vs Client**:
    -   Files with `"use server"` run only on the server.
    -   Components using browser APIs (like `IndexedDB` or `document`) must be wrapped in `clientOnly` or checked with `isServer` / `onMount`.

---

## Files to NOT Modify

- `.vinxi/`
- `.output/`
- `pnpm-lock.yaml`
- `node_modules/`
- `dist/` 
