# Notes for AI agents working on this server

This checkout IS production (code-up.tech). PM2 app `Thefake` serves directly from `.next`.

## Building / deploying

- Use `npm run build` (runs `scripts/deploy.sh`). It builds into `.next.staging`, smoke-tests it on port 3099, swaps it in, reloads PM2 and rolls back automatically if the site is unhealthy.
- NEVER run `npx next build` / `next build` / `npm run build:raw` here. They rebuild `.next` in place and take the live site down for the whole build (2026-09-22 outage: every admin panel returned 500 for ~15 minutes).
- Don't run `pm2 reload` after `npm run build`; the deploy already did it.
- Roll back one build: `npm run deploy:rollback`.
- Log: `logs/deploy.log`.
