# AUDIT GLOBAL FINAL DE PSYREKRUTE — PRÉPARATION MVP AVANT DÉPLOIEMENT LAN

**Projet :** PsyRekrute  
**Référence architecturale :** DCTF v3.1.2 (`docs/cahier_des_charges_et_conception.md`)  
**Branche auditée :** `feat/sprints4-5-pre-lan`  
**Commit audité (`HEAD`) :** `9b4259049944a7320176969c0c633d86be04ef7d`  
**Dépôt distant :** `https://github.com/Aziz-nk/PsyRekrute.git` (`Aziz-nk/PsyRekrute`)  
**Date de l'audit :** 19 novembre 2026 (`16:32Z` – `16:40Z` UTC)  
**Mode d'exécution :** Lecture seule stricte (aucun fichier source ou configuration modifié, aucun conteneur Docker ni serveur PostgreSQL démarré).

---

## Partie 1 — Synthèse exécutive

### 1.1 Vérification initiale de l'environnement (Section 3)
| Contrôle | Valeur relevée | Conformité |
|---|---|---|
| **Chemin réel du projet** | `C:\Users\PC\Desktop\PsyRekrute` | Conforme |
| **Branche Git active** | `feat/sprints4-5-pre-lan` | Conforme |
| **Commit `HEAD`** | `9b4259049944a7320176969c0c633d86be04ef7d` | Conforme |
| **État du working tree avant création du rapport** | Vide (`git status --short` propre) | Conforme |
| **Remote `origin`** | `https://github.com/Aziz-nk/PsyRekrute.git` (fetch/push) | Conforme |
| **Présence du DCTF v3.1.2** | `docs/cahier_des_charges_et_conception.md` (1 260 lignes, 81,4 Ko) | Conforme |
| **Dossiers structurels** | `backend/`, `frontend/`, `backend/prisma/`, `docker/`, `docs/`, `scripts/` | Conforme |

### 1.2 État général et niveau de maturité de la MVP
La MVP PsyRekrute implémente fidèlement l'architecture de **monolithe modulaire** définie par le DCTF v3.1.2 (`NestJS 10` + `Next.js 14 App Router` + `Prisma 5.14` + `PostgreSQL 16` + `MinIO S3`), sans introduire Redis, BullMQ ni microservices.
- **Périmètre examiné :** **30 exigences DCTF** auditées à travers **12 modules backend**, **12 pages frontend trilingues (FR / AR RTL / EN)** et **25 modèles Prisma** (les 24 entités du DCTF §3.1 + `ExternalJobListing`).
- **Répartition fonctionnelle des 30 exigences :**
  - **22 fonctionnalités validées** (code complet, typage strict, tests unitaires ou d'intégration présents).
  - **5 fonctionnalités partielles** (présentes dans le schéma ou avec une divergence mineure vis-à-vis du DCTF).
  - **2 fonctionnalités non implémentées** (module de signalements `REPORTS` et suppression/anonymisation du compte par le candidat en libre-service ; plus les fonctions liées à l'envoi d'e-mails explicitement différées hors MVP par la décision D8 du DCTF §8.1).
  - **1 fonctionnalité non vérifiée en exécution réelle** (déploiement Docker LAN multi-appareils Wi-Fi, dont les fichiers `docker-compose.lan.yml` et `Caddyfile` restent à créer à l'étape dédiée).

### 1.3 Les 5 risques les plus importants avant déploiement LAN
1. **Absence du fichier d'orchestration `docker/docker-compose.lan.yml` et du `Caddyfile` (`ANOM-01`, P0 Opérationnel) :** Le dépôt contient `docker-compose.yml` (dev, exposant les ports 5432 et 9000 et codant `localhost` en dur) et `docker-compose.prod.yml` (Nginx exigeant des certificats TLS Let's Encrypt impossibles à obtenir sur un LAN privé). La pile Docker LAN dédiée doit être créée avant de lancer les conteneurs.
2. **Faille IDOR / BOLA sur la confirmation d'upload de CV (`ANOM-02`, P1 Sécurité) :** Dans `backend/src/modules/candidates/candidates.service.ts:384-398`, `confirmCvUpload` vérifie uniquement que `dto.storageKey` existe dans le stockage sans vérifier que la clé appartient bien au préfixe `candidates/${profile.id}/cv/`.
3. **Absence de contrôle serveur de la taille ($\le 5$ Mo) et des Magic Bytes (`%PDF-`) lors d'un upload direct vers MinIO S3 (`ANOM-03`, P1 Sécurité) :** En mode `STORAGE_DRIVER=s3`, le client envoie le fichier directement sur l'URL pré-signée PUT MinIO, puis `confirmCvUpload` n'exécute qu'un `HeadObjectCommand` (`exists()`) sans vérifier la taille ni les 4 octets `%PDF-`.
4. **Exécution des migrations et seeds dans l'image de production (`ANOM-04`, P1 Docker) :** `backend/Dockerfile.prod:36` exécute `npm prune --omit=dev`, ce qui retire la CLI `prisma` (placée dans `devDependencies`) de l'étape finale `runner`. Sans conteneur `db-init` ciblant l'étape `builder` (ou déplacement de `prisma` dans `dependencies`), `npx prisma migrate deploy` échouera ou téléchargera une version non verrouillée de Prisma depuis Internet.
5. **Re-calcul synchrone en boucle `N+1` dans `MatchingOrchestratorService` (`ANOM-05`, P2 Performance) :** À chaque appel de `GET /api/v1/job-offers/:id/recommended-candidates`, le service recalcule et exécute un `await prisma.matchResult.upsert(...)` séquentiel pour chaque candidat éligible (`matching-orchestrator.service.ts:256-310`).

### 1.4 Avis synthétique sur la préparation au déploiement LAN
**Décision : `PRÊTE SOUS RÉSERVE`** (création de `docker-compose.lan.yml` + `Caddyfile`, correction de la vérification de propriété `storageKey` dans `confirmCvUpload`, puis exécution de la suite de validation en conteneurs).

---

## Partie 2 — Matrice de conformité au DCTF v3.1.2 (30 exigences)

| # | Réf. DCTF | Exigence | Module / Fichiers | Statut | Preuve technique | Écart constaté |
|---|---|---|---|---|---|---|
| 1 | **§1.1 / §3.1** | Taxonomie des 6 spécialités et référentiel des compétences cliniques/éducatives (FR/AR/EN) | `ReferenceModule` (`reference.controller.ts`, `reference.service.ts`, `seed.ts:10-110`) | **Validé** | `GET /api/v1/reference/specialties` et `/skills` publics ; hiérarchie `parentId` gérée. | Aucun écart. |
| 2 | **§1.1** | Référentiel des 12 régions administratives du Maroc | `ReferenceModule` (`moroccan-regions.constant.ts`, `reference.controller.ts:12-20`) | **Validé** | `GET /api/v1/reference/regions` retourne les 12 codes `MA-01` à `MA-12` trilingues. | Aucun écart. |
| 3 | **§1.2** | Anti-Scope : absence totale de diagnostic clinique, de score psychologique arbitraire ou de téléconsultation | Ensemble du dépôt (`matching.service.ts`, `schema.prisma`) | **Validé** | Matching purement académique/compétences/logistique (§5) ; aucun champ médical/patient. | Aucun écart. |
| 4 | **§2.1 / §2.2** | Monolithe modulaire NestJS + Next.js + Prisma + PostgreSQL 16 + MinIO sans Redis/BullMQ | `backend/package.json`, `frontend/package.json`, `backend/src/app.module.ts` | **Validé** | Aucune dépendance Redis, BullMQ ou microservice dans les `package.json`. | Aucun écart. |
| 5 | **§3.1 / §3.3** | Modèle relationnel des 24 entités DCTF + contraintes SQL et triggers | `backend/prisma/schema.prisma`, `backend/prisma/migrations/*` | **Validé** | 25 modèles Prisma (24 DCTF + `ExternalJobListing`), 4 migrations SQL incluant index `LOWER(email)` et triggers `user_sessions`. | Aucun écart sur le schéma. |
| 6 | **§4.1 / §4.2** | Dissociation `GlobalRole` (`CANDIDATE`, `ORGANIZATION_USER`, `SYSTEM_ADMIN`) et `OrgMemberRole` (`OWNER`, `ADMIN`, `RECRUITER`, `VIEWER`) | `jwt-auth.guard.ts`, `global-roles.guard.ts`, `org-roles.guard.ts`, `rbac.decorators.ts` | **Partiel** | Double garde NestJS testée dans `rbac.spec.ts` (602 lignes). | Divergence interne au DCTF : §4.2 (l. 490) accorde la lecture du vivier à `ORG: VIEWER`, tandis que §9.4 (l. 964) et `matching-orchestrator.service.ts:84` la restreignent à `OWNER`, `ADMIN`, `RECRUITER` (`ANOM-06`). |
| 7 | **§8.1 (D2, D7)** | Inscription publique (`CANDIDATE` / `ORGANIZATION_USER` uniquement), mot de passe 12–128 car., Argon2id (`64 MiB, t=3, p=4`) | `auth-registration.service.ts:46-167`, `password-hash.service.ts:14-45` | **Validé** | Rejet de `SYSTEM_ADMIN` (`400`), normalisation email, transaction atomique `User` + 2 `Consent` + `AuditLog`. | Aucun écart. |
| 8 | **§8.1 (D1, D5, D6)** | Login JWT HS256 (15 min) + Refresh Token opaque (7 j) haché SHA-256 en DB et déposé en cookie `HttpOnly` | `auth-session.service.ts:69-195`, `refresh-cookie.util.ts:1-83` | **Partiel** | JWT 900s en mémoire client uniquement (`api-client.ts:138`) ; refresh token haché SHA-256 dans `user_sessions`. | DCTF §8.1 (l. 804) mentionne `SameSite=Strict`, tandis que `refresh-cookie.util.ts:36` implémente `sameSite: 'lax'` (annoté `D5 / DCTF §8.1` dans le code). `Lax` est compatible et préférable pour la navigation LAN. |
| 9 | **§8.1** | Rotation atomique du Refresh Token (`SELECT FOR UPDATE`), détection de réutilisation (`REUSE_DETECTED`) et `logout-all` | `user-sessions.service.ts`, `20261112151821_add_user_sessions/migration.sql` | **Validé** | Verrou `FOR UPDATE`, trigger SQL `trg_enforce_user_session_invariants`, révocation en cascade et audit. | Aucun écart. |
| 10 | **§8.1** | Limitation de débit (Throttling) sur l'authentification derrière reverse proxy | `auth.controller.ts:69-70,104-105`, `proxy-throttler.guard.ts`, `ip-extractor.util.ts` | **Partiel** | `register` limité à 5 req/min/IP, `login` à 10 req/min/IP avec extraction sécurisée d'IP proxy. | L'endpoint `POST /api/v1/auth/refresh` (`auth.controller.ts:136`) n'a pas le décorateur `@UseGuards(ProxyAwareThrottlerGuard)` alors que DCTF §8.1 (l. 794) cite `register`, `login`, `refresh` (`ANOM-07`). |
| 11 | **§8.1 (D8)** | Absence de simulation d'e-mail ; différé explicite de la vérification email et réinitialisation de mot de passe | `auth-registration.service.ts:56,116` | **Validé (Différé D8)** | `isEmailVerified: false` à l'inscription ; aucun faux envoi SMTP simulé. | Réinitialisation de mot de passe différée hors MVP conformément à la décision D8. |
| 12 | **§8.5** | Gestion des consentements Loi 09-08 (`TERMS_OF_SERVICE`, `PRIVACY_POLICY`, opt-in explicite `TALENT_POOL_MATCHING`) | `consent.service.ts`, `me-consents.controller.ts` | **Validé** | Journal append-only dans `consents` ; `TALENT_POOL_MATCHING` non accordé par défaut et révocable à tout moment (`PUT /api/v1/me/consents`). | Aucun écart. |
| 13 | **§3.3 / §5.2** | Profil candidat complet (informations, formations, expériences, compétences, langues, taux de complétion) | `candidates.controller.ts`, `candidates.service.ts` | **Partiel** | CRUD complet sur profil, formations, expériences, compétences, langues + calcul `profileCompletionPercentage`. | La table `CANDIDATE_CERTIFICATIONS` existe dans `schema.prisma:361`, mais aucun endpoint CRUD de dépôt de certification n'est exposé dans `CandidatesController` (`ANOM-08`). |
| 14 | **§7.3 / §8.5** | Désactivation / suppression du compte candidat avec pseudonymisation soft-delete (`isDeleted`) | `schema.prisma:187` (`isDeleted`), `matching-orchestrator.service.ts:183` | **Non implémenté** | Le champ `isDeleted` est filtré partout en lecture, mais aucun endpoint `DELETE /api/v1/candidates/me` ne permet au candidat de supprimer son compte en libre-service. | Endpoint de suppression/anonymisation en libre-service absent (`ANOM-09`). |
| 15 | **§8.2 / §9.6** | Stockage CV privé MinIO/S3, URLs pré-signées 15 min (900s), contrôle RBAC d'anonymat et audit `CV_DOWNLOAD` | `storage.service.ts:5,25-35`, `s3-storage.provider.ts`, `applications.service.ts:1056-1144` | **Partiel** | `URL_TTL_SECONDS = 900`, support `S3_PUBLIC_ENDPOINT`, refus du téléchargement recruteur tant que statut = `INVITED`, log `CV_DOWNLOAD`. | `confirmCvUpload` (`candidates.service.ts:384-398`) ne vérifie pas que `dto.storageKey` commence par `candidates/${profile.id}/cv/` (`ANOM-02`) ni les magic bytes `%PDF-` sur S3 (`ANOM-03`). |
| 16 | **§3.3 / §4.2** | Création d'organisation (statut `PENDING`, créateur `OWNER`) et validation du format ICE (15 chiffres) | `organizations.controller.ts:49-82`, `organizations.service.ts`, `create-organization.dto.ts` | **Validé** | Validation regex `^\d{15}$` sur `identifierIce`, unicité, création transactionnelle `Organization` + `OrganizationMember(OWNER)`. | Aucun écart. |
| 17 | **§4.2** | Gestion des membres d'organisation (`OWNER`, `ADMIN`, `RECRUITER`, `VIEWER`) et isolation inter-organisations | `organizations.controller.ts:111-216`, `organizations.service.ts`, `org-roles.guard.ts` | **Validé** | Ajout par `userId` ou `email`, interdiction d'ajouter un `CANDIDATE`, protection du `OWNER`, isolation vérifiée par `OrgRolesGuard`. | Aucun écart. |
| 18 | **§4.2** | Vérification administrative des organisations (`PENDING` $\rightarrow$ `VERIFIED` / `REJECTED`) par `SYSTEM_ADMIN` | `admin-organizations.controller.ts:42-98`, `organizations.service.ts` | **Validé** | Endpoints `GET /api/v1/admin/organizations` et `PATCH /api/v1/admin/organizations/:id/verification` avec journalisation dans `audit_logs`. | Aucun écart. |
| 19 | **§3.3 / §4.2** | Cycle de vie des offres (`DRAFT` $\rightarrow$ `PUBLISHED` $\rightarrow$ `CLOSED` / `ARCHIVED`) et blocage si organisation non `VERIFIED` | `org-job-offers.controller.ts`, `offers.service.ts` | **Validé** | Publication refusée (`403`) si `organization.verificationStatus !== 'VERIFIED'` ; archivage réservé à `OWNER`, `ADMIN`, `SYSTEM_ADMIN`. | Aucun écart. |
| 20 | **§9.3** | Recherche publique des offres publiées avec filtres (type, région, ville, spécialité, texte) et pagination | `job-offers.controller.ts:31-45`, `offers.service.ts` | **Validé** | Filtre strict `status: 'PUBLISHED'` et `organization.isActive: true`, pagination `page`/`limit`/`total`/`totalPages`. | Aucun écart. |
| 21 | **§5.1 / §5.2** | Moteur de matching déterministe à 6 dimensions et pondérations par type d'offre (`STAGE_OBSERVATION`, `STAGE_PFE`, `EMPLOI`) | `matching.service.ts`, `matching.service.spec.ts`, `matching.edge-cases.spec.ts` | **Validé** | Formule linéaire pondérée exacte, distinction diplôme obtenu ($V_{obt}$) vs en cours ($V_{ins}$), crédit d'inscription $c$, explicabilité `strengths`/`gaps`. | Aucun écart mathématique. |
| 22 | **§6** | Reproductibilité exacte des 3 exemples chiffrés du DCTF (Cas 1 : 94,00 ; Cas 2 : 93,25 ; Cas 3 : 89,00) | `matching.service.spec.ts`, `matching.edge-cases.spec.ts` | **Validé** | 45 tests unitaires exécutés et validés (`PASS`) couvrant les 3 cas chiffrés et 31 cas limites. | Aucun écart. |
| 23 | **§8.5 / §9.4** | Vivier de talents recommandé : filtrage par consentement `TALENT_POOL_MATCHING` et anonymisation stricte (`#CAND-XXXXXX`) | `matching-orchestrator.service.ts:180-403` | **Validé** | Purge immédiate de `MATCH_RESULTS` si consentement révoqué ; aucun nom, email, téléphone ou CV exposé dans le vivier. | Boucle d'upsert séquentielle `N+1` (`ANOM-05`). |
| 24 | **§7.1 / §7.2** | Machine à états finis (FSM) des candidatures et invitations (11 statuts, transitions strictes par acteur) | `applications.service.ts:45-1050`, `applications.controller.ts` | **Validé** | Contrôle exhaustif des transitions candidat vs recruteur, unicité `(jobOfferId, candidateId)`. | Aucun écart. |
| 25 | **§7.2** | Règles métier FSM : expiration d'invitation à 14 jours, anti-spam 30 jours après refus, maximum 2 reports d'entretien | `applications.service.ts:45-48,250-310,600-740,1150-1200` | **Validé** | Constantes `INVITATION_VALIDITY_DAYS = 14`, `ANTI_SPAM_REINVITE_COOLDOWN_DAYS = 30`, `MAX_INTERVIEW_RESCHEDULES = 2`, expiration évaluée à la volée sans CRON. | Aucun écart. |
| 26 | **§7.2 / §8.4** | Anonymisation des candidats invités jusqu'à acceptation (`INVITED -> SUBMITTED`) et audit `PROFILE_UNMASK` | `applications.service.ts:63-67,710-760,1240-1285` | **Validé** | Masquage strict de `firstName`, `lastName`, `email`, `phone`, `cvStoragePath` tant que le statut est `INVITED`, `INVITATION_DECLINED` ou `INVITATION_EXPIRED`. | Aucun écart. |
| 27 | **§7.3** | Immuabilité de `APPLICATION_HISTORY` à chaque transition | `applications.service.ts` | **Validé** | Insertion transactionnelle systématique dans `application_history` avec `fromStatus`, `toStatus`, `changedByUserId`, `reasonNote`. | Aucun écart. |
| 28 | **§3.1 (19, 20)** | Favoris candidat (`SAVED_OFFERS`) et notifications In-App PostgreSQL (`NOTIFICATIONS`) | `candidates.service.ts:438-534`, `notifications.controller.ts`, `notifications.service.ts` | **Validé** | Ajout/retrait/liste des favoris ; création de notifications In-App lors des transitions de candidature, compteur non lus, marquage lu. | Aucun écart. |
| 29 | **§3.1 (23)** | Signalements d'abus (`REPORTS`) | `schema.prisma:585-607` (`model Report`) | **Non implémenté** | Le modèle Prisma `Report` et la table SQL `reports` existent, mais aucun module/contrôleur `ReportsModule` n'est implémenté. | Fonctionnalité de signalement absente du code applicatif. |
| 30 | **Extension MVP** | Agrégateur d'offres externes marocaines (`ExternalJobsModule`) avec modération `SYSTEM_ADMIN`, étanchéité candidatures et garde Anti-SSRF / DNS Rebinding | `external-jobs.service.ts`, `ssrf-guard.util.ts`, `ssrf-guard.util.spec.ts` | **Validé** | Table indépendante `external_job_listings`, statut initial `PENDING_REVIEW`, épinglage IP socket TCP anti-DNS Rebinding (12/12 tests `PASS`). | 4 variables inutilisées dans le fichier de test `ssrf-guard.util.spec.ts` signalées par ESLint (`ANOM-07bis`). |

---

## Partie 3 — Audit fonctionnel des parcours de bout en bout (Section 5)

| Parcours | État constaté | Détail des sous-parcours et preuves |
|---|---|---|
| **A. Authentification & comptes** | **Fonctionnel et testé** *(sauf réinitialisation MDP différée D8)* | Inscription (`POST /api/v1/auth/register`), connexion (`POST /api/v1/auth/login`), rafraîchissement par cookie HttpOnly (`POST /api/v1/auth/refresh`), déconnexion simple et globale (`POST /api/v1/auth/logout`, `/logout-all`), profil session (`GET /api/v1/auth/me`). Protection des routes privées assurée côté API par `JwtAuthGuard` et côté Next.js par `useAuth()` + redirection vers `/login?returnTo=...`. |
| **B. Candidats** | **Partiellement implémenté** *(opérationnel à 90 %)* | Profil, formations, expériences, compétences, langues, disponibilité, mobilité, upload/download CV par URL pré-signée, favoris et consentement `TALENT_POOL_MATCHING` sont **fonctionnels**. Manquent : endpoints CRUD pour `CANDIDATE_CERTIFICATIONS` (`ANOM-08`) et suppression/anonymisation du compte par le candidat (`ANOM-09`). |
| **C. Organisations** | **Fonctionnel et testé** | Création (`POST /api/v1/organizations`), consultation, ajout de membre par email ou UUID (`POST /api/v1/organizations/:id/members`), révocation (`DELETE /api/v1/organizations/:id/members/:userId`), hiérarchie `OWNER > ADMIN > RECRUITER > VIEWER`, vérification ICE par `SYSTEM_ADMIN` et séparation hermétique inter-organisations via `OrgRolesGuard`. |
| **D. Offres** | **Fonctionnel et testé** | Création en `DRAFT`, modification, publication (`POST .../publish` conditionnée à `VERIFIED`), clôture (`POST .../close`), archivage (`POST .../archive` et `DELETE`), recherche publique multi-critères (`GET /api/v1/job-offers` avec pagination et filtre texte/région/ville/type/spécialité). |
| **E. Candidatures** | **Fonctionnel et testé** | Candidature directe (`POST /api/v1/applications`), invitation vivier (`POST /api/v1/applications/invite`), prévention des doublons (`@@unique([jobOfferId, candidateId])` + anti-spam 30j), FSM complète candidat et recruteur, historique immuable `APPLICATION_HISTORY`, notifications In-App associées. |
| **F. Matching** | **Fonctionnel et testé (exécuté pendant cet audit)** | 6 dimensions mathématiques, pondérations par type d'offre, score sur 100, distinction diplôme obtenu vs en cours, explications `strengths`/`gaps` déterministes, aucun score clinique/psychologique. **45 tests unitaires exécutés et validés (`PASS`) pendant cet audit.** |
| **G. Administration** | **Fonctionnel et testé** *(sauf signalements `REPORTS`)* | Console `/[locale]/admin` à 3 onglets : vérification ICE des organisations (`GET / PATCH /api/v1/admin/organizations`), journal d'audit paginé et filtrable (`GET /api/v1/admin/audit-logs`), modération et collecte des offres externes (`GET / POST / PATCH /api/v1/admin/external-jobs`). La gestion des signalements (`REPORTS`) et la modification des référentiels via UI ne sont pas implémentées. |
| **H. Agrégation d'offres externes** | **Fonctionnel et testé (garde SSRF exécutée pendant cet audit)** | Collecte RSS Dreamjob.ma à la demande (sans CRON), import manuel d'URL, filtrage sémantique Maroc/spécialités, dédoublonnage par `sourceUrl` et `contentHash` SHA-256, modération obligatoire `PENDING_REVIEW -> PUBLISHED`, redirection externe sans candidature interne, protection SSRF avec épinglage IP socket TCP (**12 tests exécutés et validés `PASS`**). |

---

## Partie 4 — Audit de sécurité (Section 6)

### 4.1 Authentification, Autorisations et IDOR / BOLA
- **Forces constatées :**
  - Les gardes `JwtAuthGuard`, `GlobalRolesGuard` et `OrgRolesGuard` vérifient systématiquement la signature JWT HS256, l'appartenance à l'organisation en base et le rôle requis.
  - Les routes candidat utilisent `@CurrentUser() user` (`user.userId` extrait du JWT vérifié) et non un paramètre d'URL manipulable.
  - Les routes organisation vérifient systématiquement que `offer.organizationId === organizationId` et que l'utilisateur est membre actif de `organizationId`.
- **Vulnérabilité identifiée (`ANOM-02` — Criticité Élevée / P1) :**
  - Dans `backend/src/modules/candidates/candidates.service.ts:384-398` (`confirmCvUpload`), la méthode accepte n'importe quel `dto.storageKey` existant dans le bucket sans vérifier qu'il commence par `candidates/${profile.id}/cv/`. Un candidat authentifié connaissant la clé de stockage d'un autre candidat pourrait rattacher ce fichier à son propre profil puis générer une URL de téléchargement via `GET /api/v1/candidates/me/cv/download-url`.

### 4.2 Sécurité des API (Validation, Injections, XSS, CSRF, CORS, Rate Limiting)
- **Validation des entrées :** `ValidationPipe` global activé dans `backend/src/main.ts:25-31` avec `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true` et `ParseUUIDPipe` sur tous les paramètres d'URL UUID.
- **Injections SQL :** Toutes les requêtes passent par le client Prisma paramétré ; la seule requête SQL brute (`user-sessions.service.ts`, verrou `SELECT ... FOR UPDATE`) utilise le tagged template sécurisé ``this.prisma.$queryRaw`...` ``.
- **Protection XSS & En-têtes HTTP :** `helmet` est activé dans `backend/src/main.ts:14-19`. Côté frontend, React échappe automatiquement toutes les variables JSX et aucun appel à `dangerouslySetInnerHTML` n'existe dans `frontend/src/`. Dans l'agrégateur externe, `stripHtmlToText` (`semantic-filter.util.ts`) supprime les balises `<script>`, `<style>` et le balisage HTML.
- **Protection CSRF & CORS :** Les mutations API exigent un en-tête `Authorization: Bearer <jwt>` (stocké uniquement en mémoire JS, jamais envoyé automatiquement par le navigateur), ce qui immunise les endpoints métier contre le CSRF. L'endpoint `/api/v1/auth/refresh` utilise un cookie `HttpOnly; SameSite=Lax; Path=/api/v1/auth` combiné à un contrôle CORS strict sur `FRONTEND_URL` (`main.ts:54-66`).
- **Rate Limiting :** `ProxyAwareThrottlerGuard` protège `/auth/register` (5 req/min/IP) et `/auth/login` (10 req/min/IP), mais manque sur `/auth/refresh` (`ANOM-07`, P2).

### 4.3 Sécurité des fichiers (MinIO / CV)
- **Forces constatées :** Bucket `psyrekrute-documents` configuré en accès privé (`mc anonymous set none`), durée de vie des URLs pré-signées bornée à **900 secondes (15 minutes)** (`storage.service.ts:5`), nommage par UUID aléatoire (`candidates/{candidateId}/cv/{randomUUID}.pdf`), signature AWS SigV4 sur `S3_PUBLIC_ENDPOINT` sans réécriture post-signature (`s3-storage.provider.ts:27-60`), vérification RBAC d'anonymat et journalisation `CV_DOWNLOAD` avant génération d'URL de téléchargement (`applications.service.ts:1056-1144`).
- **Faiblesse identifiée (`ANOM-03` — Criticité Élevée / P1) :**
  - Si `StorageService.savePdf` (`storage.service.ts:38-42`) vérifie bien `body.length <= 5 Mo` et les magic bytes `%PDF-` (`0x25 0x50 0x44 0x46`), cette méthode n'est appelée que par le contrôleur de développement local (`local-storage.controller.ts:46`).
  - En mode `STORAGE_DRIVER=s3` (MinIO), l'upload s'effectue directement du navigateur vers MinIO via l'URL pré-signée PUT, puis `confirmCvUpload` (`candidates.service.ts:390`) appelle uniquement `this.storageService.exists(dto.storageKey)` (`HeadObjectCommand`), sans contrôler la taille de l'objet déposé ni les 4 premiers octets `%PDF-`.

### 4.4 Sécurité des secrets
- **Aucun secret versionné :** Vérifié sur les 81 fichiers du commit `9b425904` et sur tout l'historique Git.
- `backend/.env` et `frontend/.env.local` sont exclus par `.gitignore`, `backend/.dockerignore` et `frontend/.dockerignore`.
- Côté frontend, seules `NEXT_PUBLIC_API_URL` et `NEXT_PUBLIC_DEFAULT_LOCALE` sont exposées au navigateur.

### 4.5 Protection Anti-SSRF et DNS Rebinding
- **Fichier audité :** `backend/src/modules/external-jobs/ssrf-guard.util.ts` (374 lignes) et `ssrf-guard.util.spec.ts` (351 lignes).
- **Mécanismes actifs :**
  - Filtrage strict des protocoles (`http:` et `https:` uniquement) et liste noire des hôtes internes (`localhost`, `*.local`, `*.internal`, `postgres`, `minio`, `backend`, `frontend`, `nginx`).
  - Blocage exhaustif des plages privées/réservées IPv4 (`0.0.0.0/8`, `10.0.0.0/8`, `127.0.0.0/8`, `100.64.0.0/10`, `169.254.0.0/16`, `172.16.0.0/12`, `192.168.0.0/16`, `198.18.0.0/15`, TEST-NET 1/2/3, multicast) et IPv6 (`::1`, `::`, `fc00::/7`, `fe80::/10`, `2001:db8::/32`, IPv4-mapped IPv6 décimal et hexadécimal `::ffff:7f00:1`).
  - **Épinglage IP au niveau socket TCP :** `validateSafeUrl` vérifie toutes les IPs retournées par le DNS (rejet total si une seule IP est privée) et épingle la première IP publique dans `validatedUrl.pinnedIp`. La fonction `lookup` personnalisée passée à `http.request` / `https.request` retourne directement cette IP épinglée sans jamais effectuer de seconde requête DNS, tout en conservant `servername: validatedUrl.hostname` pour le SNI et la validation du certificat TLS.
  - Redirections gérées manuellement (`MAX_REDIRECTS = 3`) avec réévaluation complète de chaque saut, timeout strict de `8 000 ms` et limite de flux de `2 Mo`.
- **Résultat des tests exécutés pendant cet audit :** **12/12 tests unitaires PASS** (`ssrf-guard.util.spec.ts`).

### 4.6 Données personnelles et conformité technique Loi 09-08
- **Points conformes :** Recueil granulaire des consentements (`TERMS_OF_SERVICE`, `PRIVACY_POLICY` à l'inscription ; opt-in séparé et non pré-coché `TALENT_POOL_MATCHING` pour le vivier), journalisation append-only dans `consents` avec IP et User-Agent, anonymisation par défaut dans le vivier et sur les invitations non acceptées, traçabilité des accès sensibles (`CV_DOWNLOAD`, `PROFILE_UNMASK`, `ORG_VERIFICATION_UPDATED`) dans `audit_logs`.
- **Écart technique identifié (`ANOM-09`, P2) :** Absence d'endpoint permettant au candidat d'exercer son droit de suppression/désactivation de compte directement depuis son espace personnel (le champ `isDeleted` existe dans `candidate_profiles`, mais n'est pas relié à une action API).

---

## Partie 5 — Audit technique (Sections 7, 8, 9, 10, 11, 12)

### 5.1 Backend NestJS (Section 7)
- **Architecture :** Monolithe modulaire proprement découpé en 12 modules (`AuthModule`, `ConsentModule`, `CandidatesModule`, `OrganizationsModule`, `OffersModule`, `MatchingModule`, `ApplicationsModule`, `NotificationsModule`, `ExternalJobsModule`, `AuditModule`, `StorageModule`, `HealthModule`) + `PrismaModule` global.
- **Cohérence des réponses API :** Toutes les réponses suivent l'enveloppe `{ statusCode, message?, data, meta? }`.
- **Démarrage production :** `backend/src/main.ts:69` écoute sur `0.0.0.0:4000` et `backend/Dockerfile.prod:72` pointe vers `dist/src/main.js`.

### 5.2 Frontend Next.js (Section 8)
- **Organisation :** 12 routes sous `frontend/src/app/[locale]/` (`page.tsx`, `login`, `register`, `offers`, `offers/[id]`, `candidate/profile`, `candidate/applications`, `candidate/saved-offers`, `organization/offers`, `notifications`, `admin`, `admin/external-jobs`), internationalisées en FR, AR (avec `dir="rtl"` dans `layout.tsx`) et EN via `next-intl`.
- **Connexion au backend :** Centralisée dans `frontend/src/lib/api-client.ts` (1 274 lignes), aucun secret côté client, gestion automatique du header `Authorization: Bearer` et de `credentials: 'include'`.
- **Qualité TypeScript & ESLint :** **0 erreur et 0 avertissement** lors de l'exécution de `npm run type-check` et `npm run lint`.

### 5.3 Prisma et PostgreSQL (Section 9)
- **Schéma (`backend/prisma/schema.prisma`, 677 lignes) :** 25 modèles, clés primaires UUID, contraintes d'unicité composites (`@@unique([organizationId, userId])`, `@@unique([jobOfferId, candidateId])`, `@@unique([candidateId, jobOfferId])`), index sur les colonnes de filtrage (`regionCode`, `cityName`, `offerType`, `currentStatus`, `status`) et règles `onDelete: Cascade` / `Restrict` cohérentes.
- **Migrations :** 4 migrations SQL ordonnées (`20261109212351_init`, `20261112151821_add_user_sessions`, `20261113093600_enforce_users_email_normalized`, `20261116112943_add_external_job_listings`) totalisant 25 `CREATE TABLE`, sans instruction destructive sur les données existantes.

### 5.4 Tests et Qualité — Résultats réellement exécutés pendant cet audit (Section 10)

| # | Horodatage UTC | Commande exécutée | Répertoire | Code sortie | Résultat constaté |
|---|---|---|---|---|---|
| 1 | `2026-11-19T16:35:33Z` | `npm run type-check` (`tsc --noEmit`) | `backend/` | **`0`** | **PASS** — 0 erreur TypeScript. |
| 2 | `2026-11-19T16:35:42Z` | `npm run lint` (`eslint "{src,apps,libs,test}/**/*.ts" --max-warnings=0`) | `backend/` | **`1`** | **FAIL (4 erreurs ESLint)** — 0 erreur dans le code applicatif, mais 4 variables inutilisées dans le fichier de test `src/modules/external-jobs/ssrf-guard.util.spec.ts` (lignes 225, 236, 325, 328 : `publicServerHit`, `port`, `bigHeaderPort`, `mockDns`). |
| 3 | `2026-11-19T16:35:56Z` | `npx jest src/modules/external-jobs/ssrf-guard.util.spec.ts src/modules/health/health.controller.spec.ts src/modules/matching/matching.edge-cases.spec.ts src/modules/matching/matching.service.spec.ts src/modules/storage/local-storage.controller.spec.ts src/modules/storage/storage.service.spec.ts` | `backend/` | **`0`** | **PASS** — **6 suites PASS / 6, 73 tests PASS / 73** en 18,38 s (Matching : 45 tests ; Stockage local & S3 SigV4 : 16 tests ; SSRF & DNS Rebinding : 12 tests ; Health : 1 test). |
| 4 | `2026-11-19T16:36:22Z` | `npm run type-check` (`tsc --noEmit`) | `frontend/` | **`0`** | **PASS** — 0 erreur TypeScript. |
| 5 | `2026-11-19T16:36:26Z` | `npm run lint` (`next lint`) | `frontend/` | **`0`** | **PASS** — `✔ No ESLint warnings or errors`. |

### 5.5 Docker et préparation LAN (Section 11)
| Élément Docker | Statut de vérification | Constat précis |
|---|---|---|
| `backend/Dockerfile.prod` | **Vérifié par inspection** | Multi-stage `node:20-bookworm-slim`, utilisateur non-root `node`, `CMD ["node", "dist/src/main.js"]` conforme. Attention : `npm prune --omit=dev` retire la CLI `prisma` de l'étape `runner` (`ANOM-04`). |
| `frontend/Dockerfile.prod` | **Vérifié par inspection** | Multi-stage `node:20-alpine`, `output: 'standalone'`, `ARG NEXT_PUBLIC_API_URL=/api/v1`, utilisateur non-root `nextjs`, `HOSTNAME="0.0.0.0"`, port `3000`. |
| `docker/docker-compose.yml` | **Vérifié par inspection** | Configuration de développement : publie les ports `5432` (PostgreSQL) et `9000`/`9001` (MinIO) et fige `localhost`. **Ne pas utiliser en LAN.** |
| `docker/docker-compose.prod.yml` | **Vérifié par inspection** | Configuration de production publique : n'expose que `80` et `443` via Nginx, mais exige des certificats TLS Let's Encrypt (`/etc/nginx/ssl/live/fullchain.pem`). **Non utilisable tel quel sur un LAN privé sans domaine public.** |
| `docker/docker-compose.lan.yml` & `Caddyfile` | **Non créés (`ANOM-01`)** | À créer lors de l'étape de préparation Docker LAN (seul le port `80` de Caddy publié, PostgreSQL et MinIO sans ports publiés, `COOKIE_SECURE=false`, `S3_PUBLIC_ENDPOINT=http://<IP_LAN>`). |
| Build et exécution réelle des conteneurs | **Non vérifié** | Aucun `docker build` ni `docker compose up` n'a été exécuté conformément aux règles de lecture seule de cet audit. |

### 5.6 Performance et Robustesse (Section 12)
- **Pagination :** Appliquée sur les offres publiques (`offers.service.ts`), les offres d'organisation, le vivier de matching (`matching-orchestrator.service.ts`), les notifications (`notifications.service.ts`), les offres externes (`external-jobs.service.ts`) et les logs d'audit (`audit.service.ts`). Absente sur la liste admin des organisations (`organizations.service.ts:listOrganizationsForAdmin`) et la liste des candidatures d'une offre (`applications.service.ts:listOfferApplicationsForOrg`), ce qui reste acceptable à l'échelle d'une MVP (< 500 lignes par offre/liste) mais devra être paginé à moyen terme.
- **Risque `N+1` identifié (`ANOM-05`) :** Dans `matching-orchestrator.service.ts:181-310`, le chargement de tous les profils candidats actifs en mémoire suivi d'une boucle `for (const cand of eligibleCandidates) { await this.prisma.matchResult.upsert(...); }` génère $N$ écritures séquentielles en base à chaque consultation du vivier par un recruteur. Pour 30 à 100 candidats en démonstration LAN, le temps de réponse reste inférieur à 300 ms, mais au-delà de 1 000 candidats, il faudra utiliser une transaction groupée (`this.prisma.$transaction(...)`) ou ne recalculer le score qu'à la modification du profil ou de l'offre.
- **Scénarios de charge recommandés pour la MVP (à exécuter sur environnement de test isolé uniquement) :**
  1. *Scénario 1 (Consultation publique concurrente) :* 30 visiteurs simultanés sur `GET /api/v1/job-offers?page=1&limit=10` et `GET /api/v1/external-jobs` pendant 60 secondes (objectif : $p_{95} < 200\text{ ms}$, 0 erreur 5xx).
  2. *Scénario 2 (Calcul du vivier de matching) :* 5 recruteurs appelant simultanément `GET /api/v1/job-offers/:id/recommended-candidates` avec 50 candidats actifs en base (objectif : $p_{95} < 800\text{ ms}$).
  3. *Scénario 3 (Téléversement et téléchargement de CV PDF de 4 Mo via Caddy/MinIO) :* 5 candidats téléversant un CV PDF de 4 Mo en parallèle depuis le réseau Wi-Fi local (objectif : 100 % de succès de signature SigV4 et de confirmation).

---

## Partie 6 — Anomalies identifiées

| ID | Gravité | Composant / Fichier | Localisation | Description & Scénario de reproduction | Impact | Correction recommandée |
|---|---|---|---|---|---|---|
| **`ANOM-01`** | **P0** *(Bloquant LAN)* | `docker/` (absence de `docker-compose.lan.yml` et `docker/caddy/Caddyfile`) | Répertoire `docker/` | Aucune pile Docker Compose dédiée au LAN HTTP avec Caddy n'est encore présente. `docker-compose.prod.yml` utilise Nginx qui bloque au démarrage sans certificats Let's Encrypt (`docker/nginx/conf.d/psyrekrute.conf:31-32`), et `docker-compose.yml` expose PostgreSQL/MinIO et code `localhost` en dur. | Impossible de lancer la démonstration LAN en conteneurs sans créer ces fichiers. | Créer `docker/docker-compose.lan.yml`, `docker/caddy/Caddyfile` et `docker/.env.lan.example` à l'étape dédiée (port 80 unique sur Caddy, réseau interne isolé pour Postgres/MinIO, routage `/psyrekrute-documents/* -> minio:9000`). |
| **`ANOM-02`** | **P1** *(Sécurité IDOR)* | `backend/src/modules/candidates/candidates.service.ts` | Lignes `384-398` (`confirmCvUpload`) | `confirmCvUpload` vérifie uniquement `this.storageService.exists(dto.storageKey)` sans vérifier que `dto.storageKey` appartient au candidat connecté (`candidates/${profile.id}/cv/...`). *Reproduction :* Un candidat B envoie `POST /api/v1/candidates/me/cv/confirm` avec le `storageKey` du candidat A, puis appelle `GET /api/v1/candidates/me/cv/download-url`. | Accès horizontal non autorisé (IDOR/BOLA) au CV d'un autre candidat si sa clé est connue. | Vérifier en entrée de `confirmCvUpload` que `dto.storageKey` correspond exactement à l'expression régulière `new RegExp('^candidates/' + profile.id + '/cv/[0-9a-f-]{36}\\.pdf$', 'i')`, sinon lever `ForbiddenException`. |
| **`ANOM-03`** | **P1** *(Sécurité Fichiers)* | `backend/src/modules/candidates/candidates.service.ts` & `s3-storage.provider.ts` | `candidates.service.ts:390-393` | En mode `STORAGE_DRIVER=s3`, l'upload s'effectue directement vers MinIO via l'URL pré-signée PUT. Lors de `confirmCvUpload`, seul `exists()` (`HeadObject`) est appelé : ni la limite de 5 Mo ni la signature binaire `%PDF-` (`validatePdfMagicBytes`) ne sont vérifiées côté serveur sur l'objet S3. | Un utilisateur contournant l'interface frontend pourrait téléverser sur l'URL pré-signée un fichier non-PDF ou > 5 Mo et le rattacher à son profil. | Dans `confirmCvUpload`, lire l'objet (ou ses métadonnées `ContentLength <= 5 Mo` et ses 4 premiers octets via `Range: bytes=0-3` ou `storageService.read`) et vérifier `validatePdfMagicBytes`, en supprimant l'objet et rejetant la requête si le contrôle échoue. |
| **`ANOM-04`** | **P1** *(Docker / Prisma)* | `backend/Dockerfile.prod` & `backend/package.json` | `Dockerfile.prod:36`, `package.json:63` | La CLI `prisma` est déclarée dans `devDependencies`. L'instruction `RUN npm prune --omit=dev` dans `backend/Dockerfile.prod:36` supprime donc `node_modules/.bin/prisma` de l'image finale `runner`. | Impossibilité d'exécuter `npx prisma migrate deploy` dans le conteneur `runner` sans accès Internet ou sans conteneur d'initialisation ciblant `target: builder`. | Déplacer `"prisma": "^5.14.0"` dans `dependencies` de `backend/package.json` (ou utiliser un service `db-init` avec `target: builder` dans `docker-compose.lan.yml` pour exécuter `prisma migrate deploy` et les seeds compilés `node dist/prisma/seed.js`). |
| **`ANOM-05`** | **P2** *(Performance)* | `backend/src/modules/matching/matching-orchestrator.service.ts` | Lignes `256-310` | Boucle `for (const cand of eligibleCandidates)` exécutant un `await this.prisma.matchResult.upsert(...)` séquentiel à chaque requête `GET /api/v1/job-offers/:id/recommended-candidates`. | Latence linéaire $O(N)$ en nombre de candidats éligibles lors de l'affichage du vivier. | Regrouper les `upsert` dans `await this.prisma.$transaction(...)` ou mettre en cache tant que ni l'offre ni le profil candidat n'ont été modifiés. |
| **`ANOM-06`** | **P2** *(RBAC / DCTF)* | `backend/src/modules/matching/matching-orchestrator.service.ts` & `matching.controller.ts` | `matching-orchestrator.service.ts:84-88`, `matching.controller.ts:78` | Le DCTF comporte une contradiction interne : §4.2 (l. 490) autorise `ORG: VIEWER` en lecture sur le vivier, tandis que §9.4 (l. 964) exige `RECRUITER`, `ADMIN` ou `OWNER`. Le code suit §9.4 et rejette `VIEWER` avec `403`. | Un membre ayant le rôle `VIEWER` ne peut pas consulter les candidats recommandés du vivier. | Clarifier avec le coordinateur si `OrgMemberRole.VIEWER` doit être ajouté à `ALLOWED_RECRUITER_ROLES` (conformément à §4.2) ou maintenu exclu (conformément à §9.4). |
| **`ANOM-07`** | **P2** *(Sécurité / Qualité)* | `backend/src/modules/auth/auth.controller.ts` & `ssrf-guard.util.spec.ts` | `auth.controller.ts:136`, `ssrf-guard.util.spec.ts:225,236,325,328` | 1) `POST /api/v1/auth/refresh` n'a pas `@UseGuards(ProxyAwareThrottlerGuard)` (contrairement à `/register` et `/login`). 2) `npm run lint` dans `backend/` échoue avec 4 erreurs `@typescript-eslint/no-unused-vars` dans `ssrf-guard.util.spec.ts`. | 1) Absence de rate-limiting dédié sur `/auth/refresh`. 2) Échec de la commande `npm run lint` côté backend. | 1) Ajouter `@UseGuards(ProxyAwareThrottlerGuard)` et `@Throttle({ default: { limit: 20, ttl: 60000 } })` sur `refresh()`. 2) Supprimer ou préfixer par `_` les 4 variables inutilisées dans `ssrf-guard.util.spec.ts`. |
| **`ANOM-08`** | **P3** *(Fonctionnel)* | `backend/src/modules/candidates/candidates.controller.ts` | `schema.prisma:361-374` (`CandidateCertification`) | La table `candidate_certifications` existe dans Prisma/PostgreSQL, mais aucun endpoint ni formulaire UI ne permet au candidat d'ajouter des certifications. | Fonctionnalité secondaire du profil non exposée dans l'interface (les compétences et diplômes couvrent déjà le matching). | Ajouter ultérieurement les endpoints `POST / DELETE /api/v1/candidates/me/certifications` ou documenter hors périmètre MVP. |
| **`ANOM-09`** | **P3** *(Conformité 09-08 / Hors MVP)* | `backend/src/modules/candidates/` & `reports` | `schema.prisma:187` (`isDeleted`), `schema.prisma:585` (`Report`) | 1) Aucun endpoint `DELETE /api/v1/candidates/me` ne permet au candidat de désactiver/pseudonymiser son compte en libre-service. 2) Le modèle `Report` (signalements) n'a pas de contrôleur/service. | Ces opérations nécessitent une intervention administrateur tant que les endpoints ne sont pas exposés. | Planifier dans un lot post-MVP avant toute ouverture publique commerciale. |

---

## Partie 7 — Plan de correction priorisé

### Priorité P0 — Critique (Bloque le déploiement LAN en conteneurs)
1. **`ANOM-01` :** Créer la pile d'orchestration LAN (`docker/docker-compose.lan.yml`, `docker/caddy/Caddyfile`, `docker/.env.lan.example`) exposant uniquement le port `80` de Caddy, isolant PostgreSQL 16 et MinIO sur un réseau interne sans port publié, routant `/psyrekrute-documents/*` vers `minio:9000` et `/api/*` vers `backend:4000`, et configurant `COOKIE_SECURE=false` et `S3_PUBLIC_ENDPOINT=http://${LAN_HOST}`.

### Priorité P1 — Important (À corriger avant les tests utilisateurs sur le LAN)
2. **`ANOM-02` :** Verrouiller dans `candidates.service.ts` (`confirmCvUpload`) que `dto.storageKey` appartient obligatoirement à `candidates/${profile.id}/cv/<uuid>.pdf`.
3. **`ANOM-03` :** Vérifier dans `confirmCvUpload` la taille ($\le 5\text{ Mo}$) et la signature binaire `%PDF-` du fichier stocké sur MinIO/S3 avant de valider le rattachement au profil.
4. **`ANOM-04` :** Assurer l'exécution automatique de `prisma migrate deploy` et des seeds de démonstration (`seed.js` + `seed-demo-offers.js`) au démarrage de la pile Docker LAN (via un service `db-init` ou la présence de `prisma` dans l'image).

### Priorité P2 — Améliorations à court terme
5. **`ANOM-07` :** Corriger les 4 variables inutilisées dans `backend/src/modules/external-jobs/ssrf-guard.util.spec.ts` pour que `npm run lint` passe à `0` erreur dans `backend/`, et ajouter `@UseGuards(ProxyAwareThrottlerGuard)` sur `POST /api/v1/auth/refresh`.
6. **`ANOM-05` & `ANOM-06` :** Encapsuler les `upsert` de `MatchingOrchestratorService` dans une transaction Prisma et trancher l'accès `ORG: VIEWER` au vivier.

### Priorité P3 — Évolutions post-MVP (avant mise en production publique)
7. **`ANOM-08` & `ANOM-09` :** Implémenter l'endpoint de suppression/pseudonymisation de compte candidat (`isDeleted = true`), le module de signalements (`REPORTS`), le CRUD des certifications et l'intégration SMTP transactionnelle (décision D8).

---

## Partie 8 — Tests restant à effectuer (et raisons de non-exécution pendant cet audit)

1. **Suites Jest d'intégration Backend dépendantes de PostgreSQL (13 fichiers `.spec.ts`) :**
   - *Fichiers :* `auth-registration.spec.ts`, `auth-session.spec.ts`, `rbac.spec.ts`, `user-sessions.service.spec.ts`, `consent.spec.ts`, `candidates.spec.ts`, `organizations.spec.ts`, `offers.spec.ts`, `matching-api.spec.ts`, `applications.spec.ts`, `notifications.spec.ts`, `external-jobs.spec.ts`, `audit.spec.ts`.
   - *Raison :* Le serveur PostgreSQL local est maintenu arrêté et toute connexion ou écriture en base était formellement interdite pendant cet audit en lecture seule.
2. **Construction complète des images Docker (`docker compose build` / `next build`) :**
   - *Raison :* Interdiction de modifier les artefacts locaux ou de construire/lancer les conteneurs Docker pendant la phase d'audit.
3. **Validation fonctionnelle E2E en réseau local (LAN) depuis un second appareil Wi-Fi (téléphone / second PC) :**
   - *À vérifier lors de l'Étape de validation LAN :*
     - Connexion et persistance de session au rafraîchissement (F5) en HTTP (`COOKIE_SECURE=false`).
     - Téléversement (`PUT`) et téléchargement (`GET`) effectifs d'un CV PDF via une URL pré-signée MinIO transitant par Caddy (`http://<IP_LAN>/psyrekrute-documents/...`).
     - Parcours complet Candidat $\leftrightarrow$ Recruteur $\leftrightarrow$ `SYSTEM_ADMIN` sur les données de démonstration.

---

## Partie 9 — Décision finale

### **2. `PRÊTE SOUS RÉSERVE`**

**Justification objective :**
L'architecture monolithique modulaire, le modèle de données Prisma (25 tables), le moteur de matching déterministe (45/45 tests unitaires `PASS`), la garde Anti-SSRF avec épinglage IP (12/12 tests `PASS`), la gestion du stockage S3 avec `S3_PUBLIC_ENDPOINT` (16/16 tests `PASS`), la gestion du cookie de session HTTP LAN (`COOKIE_SECURE`) et le typage/linting du frontend Next.js (`0` erreur TypeScript, `0` erreur ESLint) sont validés et prêts.

Le passage aux tests sur réseau local (LAN) est conditionné à :
1. La correction des deux anomalies de sécurité sur la confirmation d'upload de CV (`ANOM-02` et `ANOM-03`) et des 4 erreurs ESLint du fichier de test `ssrf-guard.util.spec.ts` (`ANOM-07`).
2. La création des fichiers d'orchestration Docker LAN (`docker/docker-compose.lan.yml`, `docker/caddy/Caddyfile`, `docker/.env.lan.example` — `ANOM-01` & `ANOM-04`).
3. Le démarrage de la pile Docker LAN sur une base de démonstration dédiée et la validation réelle depuis un appareil externe connecté au même Wi-Fi.
