# Repository Guidelines

This guide helps agents move quickly inside the MeowNocode codebase while matching the existing conventions.

## Project Structure & Module Organization
- `src/` holds the React frontend. `src/components/` contains reusable UI, `src/pages/` contains routed screens, and `src/lib/` exposes shared utilities (data fetchers, helpers).  
- `functions/api/` hosts Cloudflare Pages Functions (e.g., `proxy.js`, `memos.js`) that back the app; keep endpoint-specific helpers next to the handler.  
- `public/` stores static assets served as-is. Styles live in `src/index.css`, auto-generated Tailwind layers load via `tailwind.config.js`.  
- Cloudflare Worker glue remains in `_worker.js` and `worker.js`; database schema and seeds live in `d1-schema.sql` and `d1-migration.sql`.

## Build, Test, and Development Commands
- `npm run dev`: start Vite with hot reload for the React app; ideal when iterating on UI.  
- `npm run build`: produce optimized production assets for deployment.  
- `npm run build:dev`: production build using the development mode flags for quicker iteration.  
- `npm run preview`: locally serve the built bundle for final verification.  
- `npm run lint`: run ESLint with React, hooks, and refresh plugins; fix warnings before pushing.

## Coding Style & Naming Conventions
- Use modern ES Modules and functional React components; favor hooks co-located with the components they serve.  
- Apply 2-space indentation, single quotes in JSX props when strings contain spaces, and keep imports grouped by origin (`react`, libraries, local).  
- Tailwind utility classes should reflect design tokens defined in `tailwind.config.js`; extract repeated combos into component-level helpers.

## Testing Guidelines
- Automated tests are not yet present; when adding coverage, prefer Vitest + React Testing Library under `src/__tests__/`.  
- Name new test files `ComponentName.test.jsx` and ensure critical endpoints in `functions/api/` include request/response mocks.  
- Run `npm run lint` and exercise affected flows via `npm run preview` before opening a PR.

## Commit & Pull Request Guidelines
- Follow Conventional Commits (`feat(scope): message`, `fix: message`, `doc: message`) to align with existing history (`feat(MiniMusicPlayer): …`).  
- Each PR should link the related GitHub issue, describe UI changes, and attach screenshots for visual updates.  
- Keep PRs focused: touch only the folders relevant to the change, note any schema updates (e.g., modifications to `d1-schema.sql`) in the description, and flag backend function changes for additional review.
