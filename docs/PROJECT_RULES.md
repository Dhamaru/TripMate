# TripMate - Project Rules

- **Project name:** TripMate
- **Stack:** React + TypeScript + Vite (frontend), Node.js + Express (backend), MongoDB/Mongoose, Socket.io (real-time collaboration), Google Gemini (every AI call in the app — Atlas, trip planning, utilities; every other LLM provider tried has been removed), Google Places/Maps/Translation API, OpenTopoMap (Leaflet tiles), @dnd-kit, cookie-based JWT with revocable sessions (Passport.js used for Google OAuth; route protection is `requireAuth`/`optionalAuth`)
- **Test command:** npm test
- **Dev command:** npm run dev
- **Build command:** npm run build
- **Commit style:** conventional commits (feat:, fix:, refactor:, test:, docs:)

### Additional Context

These rules are established to ensure consistency when executing agentic workflow tasks. All AI agents must adhere to these structural constraints and use the specified commands.
