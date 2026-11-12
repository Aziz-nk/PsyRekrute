# Sprint 1 â€“ Rapport de validation

> Statut : **en attente de validation explicite du coordinateur.** Le Sprint 2 n'est pas commencÃ©.
> Date des vÃ©rifications : 2026-11-12. Machine : Windows, un seul PC, Docker non opÃ©rationnel (WSL absent).

## 1. SynthÃ¨se des critÃ¨res

| # | CritÃ¨re | Statut | Preuve |
|---|---|---|---|
| 1 | Le projet dÃ©marre sur le PC | âœ… ValidÃ© (hors Docker) | PostgreSQL, backend :4000, frontend :3000 dÃ©marrÃ©s |
| 2 | PostgreSQL accepte les connexions | âœ… ValidÃ© | `pg_isready` â†’ *accepting connections* ; PostgreSQL 16.6 |
| 3 | MinIO avec stockage persistant | â¸ï¸ **ReportÃ©** | Aucun binaire Windows officiel ; Go absent ; Docker indisponible |
| 4 | Prisma â†” PostgreSQL | âœ… ValidÃ© | `/health` â†’ `postgresql: up` ; seed exÃ©cutÃ© |
| 5 | Migrations | âœ… ValidÃ© | Migration `init` appliquÃ©e, 23 tables |
| 6 | NestJS dÃ©marre sans erreur | âœ… ValidÃ© | `GET http://localhost:4000/api/v1/health` â†’ 200 `{"status":"ok"}` |
| 7 | Next.js dÃ©marre sans erreur | âœ… ValidÃ© | `GET http://localhost:3000/fr` â†’ 200 |
| 8 | Frontend â†” backend | âœ… ValidÃ© en navigateur rÃ©el | voir Â§3 |
| 9 | i18n FR/AR/EN | âœ… ValidÃ© (initialisation) | `fr`/`en` : `dir=ltr` ; `ar` : `dir=rtl` ; textes traduits affichÃ©s. Les messages couvrent seulement l'accueil, l'auth, les erreurs et le health : le reste est Ã  faire dans les sprints suivants |
| 10 | Tests de base | âœ… ValidÃ© | 42/42 (voir Â§4) |
| 11 | Instructions documentÃ©es | âœ… Ce fichier | Â§6 |

**Partiellement validÃ© :** #1 et #6/#7 uniquement hors conteneurs ; Docker Compose non exÃ©cutÃ© (Â§5) ; i18n limitÃ©e Ã  la structure et aux Ã©crans initiaux.
**ReportÃ© :** #3 MinIO (dÃ©cision du coordinateur : option 3 â€“ MinIO reste la cible, stockage local en dev).

## 2. Stockage : abstraction et limites

**Architecture** (`backend/src/modules/storage/`) : `StorageService` (faÃ§ade mÃ©tier : nommage des clÃ©s, PDF uniquement, 10 Mo max) â†’ interface `StorageProvider` â†’ `S3StorageProvider` (MinIO / S3) ou `LocalStorageProvider` (disque).
Le choix se fait **uniquement** par `STORAGE_DRIVER=local|s3` (dÃ©faut `local`). Les modules mÃ©tier n'injectent que `StorageService` : le passage Ã  MinIO ne demande aucune modification du code mÃ©tier.

> âš ï¸ Correction d'une faiblesse de la premiÃ¨re version : le Â« repli local Â» prÃ©cÃ©dent n'Ã©tait pas rÃ©el (la signature S3 est calculÃ©e hors-ligne et ne lÃ¨ve jamais d'erreur sans MinIO, et les routes locales n'existaient pas). Il est remplacÃ© par un vrai fournisseur local.

**Limites du stockage local (dev uniquement) :**
- Fichiers sur le disque du backend (`backend/local-storage/`, ignorÃ© par Git) : ni rÃ©plication, ni sauvegarde, ni chiffrement au repos, ni antivirus.
- Pas de persistance garantie hors de cette machine ; non partageable entre instances.
- URLs temporaires HMAC (900 s) servies par l'API elle-mÃªme (pas de CDN, pas de limitation de dÃ©bit), secret = `STORAGE_LOCAL_SECRET` ou `JWT_ACCESS_SECRET`.
- Aucune authentification applicative encore (module Auth = Sprint suivant) : **ne jamais y dÃ©poser de vrais documents.**
- **RefusÃ© en production** : le backend ne dÃ©marre pas avec `NODE_ENV=production` et `STORAGE_DRIVER=local`.
- Le chemin `S3StorageProvider` est Ã©crit mais **jamais exÃ©cutÃ© contre un vrai MinIO** (non testÃ©).

## 3. VÃ©rification frontend â†’ backend (navigateur rÃ©el)

Voir l'annexe A (rÃ©sultats bruts de la vÃ©rification navigateur).

## 4. Tests exÃ©cutÃ©s (Jest, backend)

Commande : `cd backend && npx.cmd jest --no-coverage --verbose` â†’ **3 suites, 42 tests, 42 rÃ©ussis.**

| Suite | Tests | Contenu |
|---|---|---|
| `matching.service.spec.ts` | 3 | Vecteurs d'or DCTF Â§6 : Cas 1 = 100,00 ; Cas 2 = 93,25 ; Cas 3 = 82,33 |
| `matching.edge-cases.spec.ts` | 31 | Formation, compÃ©tences (vÃ©rification â‰¤ 100, souhaitables absentes, plafond), expÃ©rience, localisation, langues, bornes de disponibilitÃ© (30 j â†’ 55 ; 31 j â†’ 40), total âˆˆ [0,100], aucun rejet automatique, absence de champs discriminants, dÃ©terminisme |
| `storage.service.spec.ts` | 8 | Aller-retour, PDF only, 10 Mo, path traversal, signature valide/falsifiÃ©e/expirÃ©e/mauvaise mÃ©thode |

ContrÃ´les manuels : `tsc --noEmit` backend et frontend sans erreur ; `PUT`/`GET /storage/local/object` avec signature invalide â†’ 403.
Non couvert : tests d'intÃ©gration base de donnÃ©es, e2e API, composant React, appel rÃ©el Ã  MinIO.

### Matching â€“ Cas 2 (PFE) : dÃ©cision et correction
- Le DCTF Â§6 Cas 2 : offre Â« **Bac+5 / Master requis** Â», candidat Â« **Master 2 en cours** Â», `Score_niveau = 85`.
- AppliquÃ©e littÃ©ralement, la rÃ¨gle Â§5.2 donne 100 si V_cand = V_offre. L'exemple n'est cohÃ©rent que si **V_cand = plus haut diplÃ´me *obtenu*** (Licence, V=1 = V_offre âˆ’ 1, Ã©tudiant en cours â†’ 85).
- **Le niveau 3 que j'avais mis dans le test prÃ©cÃ©dent Ã©tait une erreur** : il contredisait Â« Bac+5 requis Â» et faisait passer le test artificiellement. Il est annulÃ© (offre = 2, candidat = 1 + en cours).
- Aucune rÃ¨gle mÃ©tier modifiÃ©e. PrÃ©cision de sÃ©mantique ajoutÃ©e dans le code (`degreeLevelValue` = diplÃ´me obtenu). Seul ajout au moteur : Â« aucune formation â†’ S_form = 0 et critÃ¨re obligatoire non satisfait Â», rÃ¨gle dÃ©jÃ  Ã©crite au DCTF Â§5.2.1 mais non implÃ©mentÃ©e.
- **Point Ã  confirmer par le coordinateur** : le DCTF devrait prÃ©ciser noir sur blanc que le niveau d'un diplÃ´me *en cours* n'est pas comptÃ© (le candidat est alors saisi avec le niveau prÃ©cÃ©dent + `is_currently_enrolled`).

## 5. Revue Docker Compose (`docker/docker-compose.yml`)

**Statut : NON VALIDÃ‰.** `docker compose config` (syntaxe) rÃ©ussit ; aucun conteneur n'a Ã©tÃ© dÃ©marrÃ© (`docker ps` â†’ moteur indisponible). Ne pas considÃ©rer Docker comme opÃ©rationnel avant un `docker compose up` rÃ©ussi.

ProblÃ¨mes trouvÃ©s et corrigÃ©s (par lecture, non exÃ©cutÃ©s) :
| Sujet | ProblÃ¨me | Correction |
|---|---|---|
| Dockerfiles | `backend/Dockerfile` et `frontend/Dockerfile` **n'existaient pas** â†’ `build` Ã©chouait | CrÃ©Ã©s (dev, node 20 bookworm-slim, openssl pour Prisma) |
| Bucket | Aucun bucket crÃ©Ã© â†’ tout upload Ã©choue (`NoSuchBucket`) | Service `minio-init` (`mc mb`, accÃ¨s anonyme dÃ©sactivÃ©) |
| Migrations | Jamais appliquÃ©es dans le conteneur | `prisma migrate deploy` avant le dÃ©marrage |
| `STORAGE_DRIVER` | Absent | `s3` dans le conteneur backend |
| `DATABASE_URL` | Correcte (hÃ´te `postgres`) ; mot de passe non encodÃ© si caractÃ¨res spÃ©ciaux | Commentaire ; Ã  encoder en URL si modifiÃ© |
| Healthchecks | Aucun pour backend ; frontend `depends_on` sans condition | Healthcheck backend + `condition: service_healthy` |
| Volumes | `/app/node_modules` anonyme (recrÃ©Ã© Ã  chaque `up`) | Volumes nommÃ©s |
| `version:` | ObsolÃ¨te | RemplacÃ© par `name:` |
| Ports | 5432 en conflit avec le PostgreSQL portable de l'hÃ´te | `POSTGRES_PORT=5433` Ã  dÃ©finir si les deux tournent |
| Variables | `.env` racine non lu (le compose est dans `docker/`) | Lancer avec `--env-file ../.env` |
| JWT | Valeurs par dÃ©faut faibles | Acceptable en dev ; Ã  remplacer hors dev |

Points **encore incertains** (Ã  vÃ©rifier au premier vrai lancement) : healthcheck `mc ready local` de l'image MinIO Ã©pinglÃ©e ; tags `minio/mc` ; build des images ; hot-reload via bind-mount sous Windows ; Prisma dans l'image Linux.

## 6. Lancer le projet localement (sans Docker)

PrÃ©fixe PowerShell : `$env:PATH = "C:\Program Files\nodejs;$env:PATH"` ; utiliser `npm.cmd` / `npx.cmd`. Les commandes PostgreSQL/ports exigent un terminal non restreint.

```powershell
# 1. PostgreSQL (laisser la fenÃªtre ouverte)
.tools\pgsql\pgsql\bin\postgres.exe -D .tools\pgsql\data

# 2. Backend (backend\.env copiÃ© depuis .env.example, STORAGE_DRIVER=local)
cd backend
npm.cmd run start:dev          # http://localhost:4000/api/v1/health  |  Swagger : /api/docs

# 3. Frontend (frontend\.env.local : NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1)
cd ..\frontend
npm.cmd run dev                # http://localhost:3000/fr  (/ar, /en)

# Base de donnÃ©es / tests
cd ..\backend
npx.cmd prisma migrate dev     # migrations
npx.cmd ts-node prisma/seed.ts # donnÃ©es de rÃ©fÃ©rence
npx.cmd jest --no-coverage     # tests
```
Avec Docker (non validÃ©) : `docker compose --env-file .env -f docker/docker-compose.yml up --build`.

## 7. Limites connues
- Docker Compose non exÃ©cutÃ© ; MinIO jamais lancÃ© ; `S3StorageProvider` non testÃ© en rÃ©el.
- PostgreSQL local en `trust` (aucun mot de passe) : **dev uniquement**, loopback.
- `backend/.env` contient des secrets de dev, non versionnÃ© (`.gitignore`) ; `.env.example` sert de modÃ¨le.
- 33 vulnÃ©rabilitÃ©s signalÃ©es par `npm audit` (dÃ©pendances transitives) non traitÃ©es.
- Aucune authentification, aucun module mÃ©tier (candidats, offresâ€¦) : Sprint 2+.
- Le modÃ¨le Prisma `Report` utilise deux FK optionnelles vers le mÃªme `targetId` (relation polymorphe) : acceptÃ© par la migration mais Ã  revoir avant usage.
- **DEC-05 (CNDP)** : aucune conformitÃ© lÃ©gale n'est revendiquÃ©e ; analyse juridique requise.
- Corrections techniques de ce sprint : `@nestjs/terminus` Ã©pinglÃ© Ã  10.2.3 ; `next.config.mjs` (Next 14 sans support `.ts`) ; middleware dans `src/` ; `expandVariables` activÃ© pour les `${VAR}` du `.env`.


## Annexe A – Vérification navigateur (frontend → backend)

Deux passes, via le navigateur intégré (page servie par `localhost:3000`, appel vers `localhost:4000`). La seconde passe a été faite **après** la correction de l'URL d'API et avec `frontend/.env.local` : `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1`.

| Page | Badge affiché | Requête | Console |
|---|---|---|---|
| `/fr` | « État du service : API Connecté · PostgreSQL Connecté » (pastilles vertes) | `GET http://localhost:4000/api/v1/health` → 200, `Origin: http://localhost:3000` | 0 erreur, 0 avertissement |
| `/en` | « Service Status: API Connected · PostgreSQL Connected » | idem → 200 | 0 erreur, 0 avertissement |
| `/ar` (1re passe) | « حالة الخدمة : API متصل · PostgreSQL متصل », `dir="rtl"`, mise en page inversée | idem → 200 | 0 erreur |

- **CORS observé** (pas seulement configuré) : réponse avec `access-control-allow-origin: http://localhost:3000`, `access-control-allow-credentials: true`, `vary: Origin`. Aucune erreur CORS.
- Réponse : `{"status":"ok","info":{"postgresql":{"status":"up"}},...}`.
- Bug corrigé pendant la vérification : `HealthStatus.tsx` ajoutait `/api/v1` à une variable qui le contient déjà (`.env.example`), ce qui aurait donné `/api/v1/api/v1/health`.
- Limites : `evaluate` en console désactivé pour le sous-agent (l'appel observé est celui du composant React) ; pas testé : autre origine (doit être refusée), mobile, navigateurs autres que celui intégré, `/ar` après la seconde passe.
- Capture : `brain/.../browser_evidence/676d24d7.../final_step_14.png` (AR).
