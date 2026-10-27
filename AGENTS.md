# Flickfolk working rules

- TypeScript strict npm workspace monorepo: apps/client, apps/server, packages/shared.
- Keep shared protocol, validation, permissions and sync math in shared.
- Host and Moderators control playback; Participants request approval. Server owns roles, state and timestamps. Never echo player events.
- Project root: `/home/onyx/Projects/watchparty/`. Keep all application files, dependencies and build output inside this subfolder.
- New projects must use their own named subfolders of `/home/onyx/Projects/`. Never scaffold in parent directories or replace their unrelated files.
- No auth, database, ORM, Redux, component library or extra services. Subtle CSS-only effects are allowed by the current brief; respect reduced motion.
- Validate all untrusted socket payloads; bound rooms, participants and chat.
- Verify lint, typecheck, tests and production build before completion.
- Keep changes minimal, accessible, responsive and free of emojis.

- The assignment-final iteration preserves signup-free local identity, media adapters and sync. No auth, Supabase, profiles or database. After local and GitHub CI gates pass, merge and deploy the exact main SHA to the existing Flickfolk Render service; do not create services.
- Runtime diagnostics must be measured; unavailable values display `--`.

10. A prompt may amend SPEC.md or DESIGN.md. When it does, update those files first, then implement.
