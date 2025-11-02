# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MeowNocode is a lightweight, privacy-focused note-taking application with canvas mode, heatmap statistics, AI chat, and cloud sync capabilities. It supports multiple deployment models and storage backends.

**Key Features:**
- Canvas mode for spatial note organization
- GitHub-style heatmap for tracking productivity
- Markdown support with syntax highlighting
- Tag management and backlink system
- Audio clip attachments to notes
- Music player with playlist support
- AI-powered chat integration
- Cloud sync with Cloudflare D1 or Supabase
- Self-hosted SQLite option

## Architecture

This is a **full-stack application** with three deployment models:

### 1. Frontend (React + Vite)
- **Framework:** React 18 with Vite build tool
- **UI Library:** Radix UI components with Tailwind CSS
- **State Management:** React Context (SettingsContext, ThemeContext, MusicContext, PasswordAuthContext)
- **Routing:** React Router DOM
- **Data Fetching:** TanStack React Query
- **Styling:** Tailwind CSS with `cn()` utility from `src/lib/utils.js`

### 2. Cloudflare Pages + D1 (Default)
- **Database:** Cloudflare D1 (SQLite-compatible)
- **Backend:** Cloudflare Worker (`worker.js`) + Pages Functions (`functions/api/`)
- **Static Assets:** Served via Cloudflare Pages
- **API Routes:** `/api/health`, `/api/init`, `/api/memos`, `/api/settings`

### 3. Self-Hosted (Docker/SQLite)
- **Database:** SQLite with better-sqlite3
- **Backend:** Express.js server (`server/index.js`)
- **Container:** Multi-stage Docker build (see `Dockerfile`)

### 4. Supabase (Alternative)
- **Database:** PostgreSQL with Supabase
- **API:** Compatible with D1 schema

## Database Schema

Two main tables (see `d1-schema.sql`):

1. **`memos`** - Note storage
   - `memo_id`: Unique identifier
   - `content`: Markdown content
   - `tags`: JSON array
   - `backlinks`: JSON array of linked memos
   - `audio_clips`: JSON array of audio attachments
   - `is_public`: Public visibility flag

2. **`user_settings`** - User preferences
   - `theme_color`: App theme color
   - `dark_mode`: Dark/light mode setting
   - `canvas_config`: Canvas layout configuration
   - `music_config`: Music player settings
   - `s3_config`: Object storage configuration
   - Various JSON config fields for customization

## Common Commands

```bash
# Development
npm run dev              # Start Vite dev server (port 8080)
npm run build            # Production build (outputs to build/)
npm run build:dev        # Build with development mode flags
npm run preview          # Preview production build locally
npm run lint             # Run ESLint (React + hooks plugins)

# Self-hosted mode
npm run build            # Build frontend
npm run server           # Start Express server (port 3000)
npm run start            # Alias for npm run server

# Docker deployment
docker build -t meownocode .
docker run -p 3000:3000 -e APP_PASSWORD=your-pass meownocode
```

## Project Structure

```
src/
├── components/           # React components
│   ├── ui/              # Reusable Radix UI components
│   ├── share-templates/ # Share dialog templates
│   ├── Canvas*.jsx      # Canvas mode components
│   ├── Memo*.jsx        # Note-taking components
│   ├── Heatmap*.jsx     # Statistics visualizations
│   ├── Music*.jsx       # Music player components
│   └── ...
├── context/             # React Context providers
├── lib/                 # Utility libraries
│   ├── d1.js           # D1 client
│   ├── utils.js        # Helper functions (cn, tombstone helpers)
│   ├── s3Storage.js    # S3-compatible storage
│   └── fileStorageService.js
├── pages/               # Route pages
├── config/              # Configuration
└── App.jsx              # Main app component

server/
├── index.js            # Express server for SQLite
├── database.js         # Database connection/migration
└── config.js           # Server configuration

functions/api/          # Cloudflare Pages Functions
├── memos.js           # Memo CRUD endpoints
├── settings.js        # Settings endpoints
├── health.js          # Health check
└── ...

d1-schema.sql          # Database schema (D1/Postgres)
Dockerfile             # Multi-stage Docker build
worker.js              # Cloudflare Worker entrypoint
vite.config.js         # Vite configuration with plugins
```

## Development Guidelines

### Code Style
- **Module System:** ES Modules (`"type": "module"` in package.json)
- **Indentation:** 2 spaces
- **Quotes:** Single quotes in JSX props
- **Imports:** Grouped by origin (react → libraries → local)
- **Components:** Functional React components with hooks

### Key Configuration Files
- **`vite.config.js`:** Build configuration with dev logger and HTML transformers
- **`tailwind.config.js`:** Tailwind tokens and design system
- **`components.json`:** Radix UI component configuration
- **`wrangler.example.toml`:** Cloudflare Workers configuration template

### Environment Variables

**For self-hosted server:**
- `PORT`: Server port (default: 3000)
- `APP_PASSWORD`: Login password (optional)
- `SQLITE_DB_PATH`: SQLite database path (default: `/data/meownocode.db`)
- `CORS_ALLOW_ORIGIN`: Comma-separated allowed origins
- `SERVE_STATIC`: Serve frontend assets (default: true)

**For Vite:**
- `CHAT_VARIABLE`: Subdirectory deployment path
- `PUBLIC_PATH`: Public path prefix
- `VITE_SELF_HOSTED`: Self-hosted flag for build

### No Automated Tests
Currently **no test suite exists**. When adding tests:
- Use Vitest + React Testing Library
- Place tests in `src/__tests__/`
- Name files `ComponentName.test.jsx`
- Mock API calls and database operations

## Deployment Models

### Cloudflare Pages + D1
1. Create D1 database: `wrangler d1 create meow-app-db`
2. Set `PASSWORD` environment variable in Cloudflare Pages
3. Bind D1 database as `DB` environment variable
4. Deploy: `wrangler d1 execute meow-app-db --file=./d1-schema.sql --remote`

### Docker Self-Hosted
```bash
docker run -d \
  --name meownocode \
  -p 3000:3000 \
  -e APP_PASSWORD=your-strong-password \
  -v ./meownocode-data:/data \
  docker.cnb.cool/1oved/meownocode
```

### Local Self-Hosted
```bash
npm run build
npm run server  # Serves at http://localhost:3000
```

## API Endpoints

### Memo Operations
- `GET /api/memos` - List all memos
- `POST /api/memos` - Create/update memo
- `DELETE /api/memos?memoId={id}` - Delete memo

### Settings
- `GET /api/settings` - Get user settings
- `POST /api/settings` - Update user settings

### Auth
- `GET /api/auth-status` - Check if auth required
- `POST /api/login` - Login with password
- `POST /api/verify-password` - Verify password

### System
- `GET /api/health` - Health check
- `POST /api/init` - Initialize database (requires `INIT_TOKEN` if set)

## Notes

- The app uses **tombstone pattern** for soft-deleted memos (see `src/lib/utils.js:9-51`)
- JSON columns are serialized as TEXT in SQLite/D1
- Canvas mode uses absolute positioning for memo nodes
- Audio clips support waveform visualization
- Music player has playlist management and custom song support
