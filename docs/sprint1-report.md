# Sprint 1 – Rapport d'état

## Démarrage local (sans Docker – WSL absent)
Préfixe PowerShell : `$env:PATH = "C:\Program Files\nodejs;$env:PATH"` ; utiliser `npm.cmd` / `npx.cmd`.

1. PostgreSQL 16 (binaires portables) :
   `.tools\pgsql\pgsql\bin\postgres.exe -D .tools\pgsql\data`
2. Backend (`backend/`, fichier `.env` copié depuis `.env.example`) :
   `npm.cmd run start:dev` → http://localhost:4000/api/v1/health , Swagger : /api/docs
3. Frontend (`frontend/`) : `npm.cmd run dev` → http://localhost:3000/fr (/ar, /en)
4. Migrations : `npx.cmd prisma migrate dev` ; seed : `npx.cmd ts-node prisma/seed.ts`
5. Tests : `npm.cmd test` (backend)

## Critères Sprint 1
| # | Critère | État |
|---|---|---|
| 1 | Projet démarre sur le PC | OK (hors Docker) |
| 2 | PostgreSQL accepte les connexions | OK |
| 3 | MinIO avec stockage persistant | **NON FAIT** – aucun binaire Windows officiel, Go absent |
| 4 | Prisma ↔ PostgreSQL | OK |
| 5 | Migrations | OK (23 tables) + seed OK |
| 6 | NestJS démarre | OK (`/health` → ok) |
| 7 | Next.js démarre | OK |
| 8 | Front ↔ back | CORS vérifié ; appel `HealthStatus` côté navigateur **non vérifié visuellement** |
| 9 | i18n FR/AR/EN | OK (FR/EN `ltr`, AR `rtl`, rendu serveur vérifié) |
| 10 | Tests de base | OK – 3/3 matching |
| 11 | Documentation | Ce fichier |

## Limites connues
- Docker Compose écrit (`docker/docker-compose.yml`) mais **non testé** (WSL non installé). Il fournira MinIO sur une machine compatible.
- Test golden Cas 2 corrigé : `requiredDegreeLevelValue` 2 → 3 (la valeur 2 ne pouvait pas donner formation = 85 ; total 93,25 recalculé).
- `@nestjs/terminus` épinglé en 10.2.3 (compatible NestJS 10).
- `next.config.mjs` (Next 14 ne supporte pas `.ts`) ; middleware dans `src/`.
- Conformité CNDP (DEC-05) : non validée juridiquement.
