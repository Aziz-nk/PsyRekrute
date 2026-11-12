# Sprint 1 – Rapport de validation

> **Statut réel : socle technique validé par le coordinateur AVEC RÉSERVES (2026-11-12). Le Sprint 1 n'est PAS entièrement validé sur ses 11 critères :**
> **9 critères validés · 1 partiellement validé (i18n) · 1 reporté (MinIO) · Docker Compose non testé donc non validé.**
> Date des vérifications : 2026-11-12. Machine : Windows, un seul PC, Docker non opérationnel (WSL absent).

## 1. Synthèse des critères

| # | Critère | Statut | Preuve |
|---|---|---|---|
| 1 | Le projet démarre sur le PC | ✅ Validé (hors Docker) | PostgreSQL, backend :4000, frontend :3000 démarrés |
| 2 | PostgreSQL accepte les connexions | ✅ Validé | `pg_isready` → *accepting connections* ; PostgreSQL 16.6 |
| 3 | MinIO avec stockage persistant | ⏸️ **Reporté** | Aucun binaire Windows officiel ; Go absent ; Docker indisponible |
| 4 | Prisma ↔ PostgreSQL | ✅ Validé | `/health` → `postgresql: up` ; seed exécuté |
| 5 | Migrations | ✅ Validé | Migration `init` appliquée, 23 tables |
| 6 | NestJS démarre sans erreur | ✅ Validé | `GET http://localhost:4000/api/v1/health` → 200 `{"status":"ok"}` |
| 7 | Next.js démarre sans erreur | ✅ Validé | `GET http://localhost:3000/fr` → 200 |
| 8 | Frontend ↔ backend | ✅ Validé en navigateur réel | voir §3 |
| 9 | i18n FR/AR/EN | ✅ Validé (initialisation) | `fr`/`en` : `dir=ltr` ; `ar` : `dir=rtl` ; textes traduits affichés. Les messages couvrent seulement l'accueil, l'auth, les erreurs et le health : le reste est à faire dans les sprints suivants |
| 10 | Tests de base | ✅ Validé | 42/42 (voir §4) |
| 11 | Instructions documentées | ✅ Ce fichier | §6 |

**Comptage :** validés = #1, 2, 4, 5, 6, 7, 8, 10, 11 (9) ; partiel = #9 (i18n : structure et écrans initiaux seulement) ; reporté = #3 (MinIO).
**Réserves :** #1/#6/#7 validés **hors conteneurs uniquement** ; **Docker Compose non testé, donc non validé** (§5).
**Reporté :** #3 MinIO (décision du coordinateur : option 3 – MinIO reste la cible, stockage local en dev).

## 2. Stockage : abstraction et limites

**Architecture** (`backend/src/modules/storage/`) : `StorageService` (façade métier : nommage des clés, PDF uniquement, 10 Mo max) → interface `StorageProvider` → `S3StorageProvider` (MinIO / S3) ou `LocalStorageProvider` (disque).
Le choix se fait **uniquement** par `STORAGE_DRIVER=local|s3` (défaut `local`). Les modules métier n'injectent que `StorageService` : le passage à MinIO ne demande aucune modification du code métier.

> ⚠️ Correction d'une faiblesse de la première version : le « repli local » précédent n'était pas réel (la signature S3 est calculée hors-ligne et ne lève jamais d'erreur sans MinIO, et les routes locales n'existaient pas). Il est remplacé par un vrai fournisseur local.

**Limites du stockage local (dev uniquement) :**
- Fichiers sur le disque du backend (`backend/local-storage/`, ignoré par Git) : ni réplication, ni sauvegarde, ni chiffrement au repos, ni antivirus.
- Pas de persistance garantie hors de cette machine ; non partageable entre instances.
- URLs temporaires HMAC (900 s) servies par l'API elle-même (pas de CDN, pas de limitation de débit), secret = `STORAGE_LOCAL_SECRET` ou `JWT_ACCESS_SECRET`.
- Aucune authentification applicative encore (module Auth = Sprint suivant) : **ne jamais y déposer de vrais documents.**
- **Refusé en production** : le backend ne démarre pas avec `NODE_ENV=production` et `STORAGE_DRIVER=local`.
- Le chemin `S3StorageProvider` est écrit mais **jamais exécuté contre un vrai MinIO** (non testé).

## 3. Vérification frontend → backend (navigateur réel)

Voir l'annexe A (résultats bruts de la vérification navigateur).

## 4. Tests exécutés (Jest, backend)

Commande : `cd backend && npx.cmd jest --no-coverage --verbose` → **3 suites, 52 tests, 52 réussis** (après la précision diplômes du §4 bis).

| Suite | Tests | Contenu |
|---|---|---|
| `matching.service.spec.ts` | 3 | Vecteurs d'or DCTF §6 : Cas 1 = 100,00 ; Cas 2 = 93,25 ; Cas 3 = 82,33 |
| `matching.edge-cases.spec.ts` | 41 | Formation (diplôme obtenu vs en cours, par type d'offre), compétences (vérification ≤ 100, souhaitables absentes, plafond), expérience, localisation, langues, bornes de disponibilité (30 j → 55 ; 31 j → 40), total ∈ [0,100], aucun rejet automatique, absence de champs discriminants, déterminisme |
| `storage.service.spec.ts` | 8 | Aller-retour, PDF only, 10 Mo, path traversal, signature valide/falsifiée/expirée/mauvaise méthode |

Contrôles manuels : `tsc --noEmit` backend et frontend sans erreur ; `PUT`/`GET /storage/local/object` avec signature invalide → 403.
Non couvert : tests d'intégration base de données, e2e API, composant React, appel réel à MinIO.

### 4 bis. Matching – diplôme obtenu vs formation en cours (décision du coordinateur, DCTF v3.1.1)
- Règle confirmée : **un diplôme en cours n'est pas un diplôme obtenu.** Le moteur reçoit deux données distinctes : `degreeLevelValue` (plus haut diplôme **obtenu**) et `enrolledLevelValue` (niveau de la formation **suivie**, 0 si aucune).
- Le crédit d'une inscription dépend du **type d'offre** (`ENROLLMENT_CREDIT_BY_OFFER_TYPE`) : **EMPLOI = 0** (diplôme obtenu exigé), **STAGE_PFE = 85**, **STAGE_OBSERVATION = 100**. Pondérations des 6 dimensions inchangées.
- Exemple « Master 2 en cours » (Cas 2, PFE, offre Bac+5) : Licence obtenue (V_obt = 1), inscrit en Master 2 (V_ins = 2 ≥ 2) → crédit PFE **85** → formation 85, total **93,25** (inchangé). Le même candidat sur un **emploi** Bac+5 obtient 40 avec le motif « diplôme requis non obtenu ».
- Historique : mon changement précédent (offre « niveau 3 ») était une erreur et a été annulé ; la règle ancienne « V_cand = V_offre − 1 et étudiant en cours → 85 » est **remplacée** par la règle ci-dessus.
- **Choix à valider** : le crédit 100 du stage d'observation et le crédit 85 du PFE sont **déduits des deux exemples chiffrés du DCTF** (Cas 1 : L3 en cours → 100 ; Cas 2 : Master 2 en cours → 85). Le DCTF §5.2.1 les formalise désormais ; ils sont modifiables par offre.
- Non fait : l'ajout d'un champ `enrollment_credit_score` (ou dérivé du `offer_type`) sur `JOB_OFFERS` n'est pas encore dans le schéma Prisma ; il sera traité avec le module Offres.
- Le calcul de V_obt / V_ins à partir de `CANDIDATE_EDUCATION` (`is_currently_enrolled`) sera implémenté avec le module Candidats.
- Le critère de diplôme **ne déclenche aucun rejet automatique** (un score est toujours calculé ; seul « aucune formation » active le drapeau obligatoire, règle déjà au DCTF).

## 5. Revue Docker Compose (`docker/docker-compose.yml`)

**Statut : NON VALIDÉ.** `docker compose config` (syntaxe) réussit ; aucun conteneur n'a été démarré (`docker ps` → moteur indisponible). Ne pas considérer Docker comme opérationnel avant un `docker compose up` réussi.

Problèmes trouvés et corrigés (par lecture, non exécutés) :
| Sujet | Problème | Correction |
|---|---|---|
| Dockerfiles | `backend/Dockerfile` et `frontend/Dockerfile` **n'existaient pas** → `build` échouait | Créés (dev, node 20 bookworm-slim, openssl pour Prisma) |
| Bucket | Aucun bucket créé → tout upload échoue (`NoSuchBucket`) | Service `minio-init` (`mc mb`, accès anonyme désactivé) |
| Migrations | Jamais appliquées dans le conteneur | `prisma migrate deploy` avant le démarrage |
| `STORAGE_DRIVER` | Absent | `s3` dans le conteneur backend |
| `DATABASE_URL` | Correcte (hôte `postgres`) ; mot de passe non encodé si caractères spéciaux | Commentaire ; à encoder en URL si modifié |
| Healthchecks | Aucun pour backend ; frontend `depends_on` sans condition | Healthcheck backend + `condition: service_healthy` |
| Volumes | `/app/node_modules` anonyme (recréé à chaque `up`) | Volumes nommés |
| `version:` | Obsolète | Remplacé par `name:` |
| Ports | 5432 en conflit avec le PostgreSQL portable de l'hôte | `POSTGRES_PORT=5433` à définir si les deux tournent |
| Variables | `.env` racine non lu (le compose est dans `docker/`) | Lancer avec `--env-file ../.env` |
| JWT | Valeurs par défaut faibles | Acceptable en dev ; à remplacer hors dev |

Points **encore incertains** (à vérifier au premier vrai lancement) : healthcheck `mc ready local` de l'image MinIO épinglée ; tags `minio/mc` ; build des images ; hot-reload via bind-mount sous Windows ; Prisma dans l'image Linux.

## 6. Lancer le projet localement (sans Docker)

Préfixe PowerShell : `$env:PATH = "C:\Program Files\nodejs;$env:PATH"` ; utiliser `npm.cmd` / `npx.cmd`. Les commandes PostgreSQL/ports exigent un terminal non restreint.

```powershell
# 1. PostgreSQL (laisser la fenêtre ouverte)
.tools\pgsql\pgsql\bin\postgres.exe -D .tools\pgsql\data

# 2. Backend (backend\.env copié depuis .env.example, STORAGE_DRIVER=local)
cd backend
npm.cmd run start:dev          # http://localhost:4000/api/v1/health  |  Swagger : /api/docs

# 3. Frontend (frontend\.env.local : NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1)
cd ..\frontend
npm.cmd run dev                # http://localhost:3000/fr  (/ar, /en)

# Base de données / tests
cd ..\backend
npx.cmd prisma migrate dev     # migrations
npx.cmd ts-node prisma/seed.ts # données de référence
npx.cmd jest --no-coverage     # tests
```
Avec Docker (non validé) : `docker compose --env-file .env -f docker/docker-compose.yml up --build`.

## 7. Limites connues
- Docker Compose non exécuté ; MinIO jamais lancé ; `S3StorageProvider` non testé en réel.
- PostgreSQL local en `trust` (aucun mot de passe) : **dev uniquement**, loopback.
- `backend/.env` contient des secrets de dev, non versionné (`.gitignore`) ; `.env.example` sert de modèle.
- 33 vulnérabilités signalées par `npm audit` (dépendances transitives) non traitées.
- Aucune authentification, aucun module métier (candidats, offres…) : Sprint 2+.
- Le modèle Prisma `Report` utilise deux FK optionnelles vers le même `targetId` (relation polymorphe) : accepté par la migration mais à revoir avant usage.
- **DEC-05 (CNDP)** : aucune conformité légale n'est revendiquée ; analyse juridique requise.
- Corrections techniques de ce sprint : `@nestjs/terminus` épinglé à 10.2.3 ; `next.config.mjs` (Next 14 sans support `.ts`) ; middleware dans `src/` ; `expandVariables` activé pour les `${VAR}` du `.env`.



## 8. Backlog issu du Sprint 1 (à conserver)
| Réf. | Élément | Origine | Priorité |
|---|---|---|---|
| B-01 | **MinIO** : lancer un vrai MinIO (Docker ou autre) et tester `S3StorageProvider` de bout en bout (upload, download, expiration) | critère #3 reporté | Haute avant toute donnée réelle |
| B-02 | **Docker Compose** : exécuter `docker compose up --build` sur une machine compatible et valider ou corriger (healthcheck `mc ready`, build des images, hot-reload, migrations) | non testé | Haute |
| B-03 | **Traductions restantes FR/AR/EN** : formulaires, notifications, messages d'erreur API, tableaux de bord, 12 régions et villes ; relecture des textes arabes par un locuteur | critère #9 partiel | Moyenne, progressive à chaque écran |
| B-04 | Champ `enrollment_credit_score` / règle par type d'offre dans le schéma Prisma et calcul V_obt / V_ins | décision diplômes | Avec modules Offres / Candidats |
| B-05 | `npm audit` : 33 vulnérabilités transitives | Sprint 1 | Moyenne |
| B-06 | Revoir la relation polymorphe `Report` (deux FK vers `targetId`) | Sprint 1 | Avant le module Signalements |
| B-07 | CI GitHub Actions, ESLint, couverture ≥ 85 % mesurée (DoD §11.3) — **non mesurée à ce jour** | DCTF | Moyenne |
| B-08 | DEC-05 CNDP : analyse juridique ; aucune conformité revendiquée | DCTF | Selon calendrier DEC-05 |

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
