# Sprint 2 – Périmètre et décisions officielles (VALIDÉ PAR LE COORDINATEUR)

> **Statut : périmètre validé le 2026-11-12.** Développement séquentiel module par module (M0 → M6), avec présentation des changements et des tests avant chaque commit Git.
> Références : DCTF v3.1.2 §3 (24 entités dont `USER_SESSIONS`), §4 (RBAC), §8 (sécurité), §9.1–9.2 (contrats d'API), §11.3 (Definition of Done et couverture à 85 %).

## 1. Objectif et thème
**« Identité, accès et traçabilité »** : tout ce qui doit exister avant de manipuler des données de candidats ou de structures. Il correspond aux livrables du rôle simulé *Dev 4* (Auth, RBAC, Audit, Consentements) plus un socle minimal Organisations nécessaire pour tester les rôles de membre et l'isolation inter-organisations.

Le Sprint 2 ne livre **aucune** fonctionnalité de matching exposé en API, d'offres, de candidatures ni de vivier.

## 2. Modules, dans l'ordre d'implémentation
Un seul module à la fois ; présentation des changements et des tests avant chaque commit Git.

| # | Module | Contenu | Rôle simulé | Dépend de | État |
|---|---|---|---|---|---|
| **M0** | Outillage qualité + D3 | ESLint (`@typescript-eslint`, zéro `any`, `--max-warnings=0`), `tsconfig.json` strict, couverture Jest ≥ 85 % avec métriques et exclusions explicites, alignement D3 (limite stricte 5 Mo + contrôle des magic bytes PDF) | Dev 5 (QA) | – | **Validé et commité** |
| **M1.1** | `USER_SESSIONS` (persistance & rotation) | 24e entité `USER_SESSIONS`, migration SQL + contraintes `CHECK` et trigger d'invariants PostgreSQL, `UserSessionsService` (SHA-256, rotation atomique `FOR UPDATE`, détection concurrente de réutilisation, révocation unitaire/globale, politique de conservation 30j après expiration) | Dev 4 | M0 | **Validé et commité** |
| **M1.2** | Inscription (`POST /auth/register`) | Validation stricte des données d'inscription, restriction backend aux rôles `CANDIDATE` et `ORGANIZATION_USER` (D2), mot de passe 12–128 car. haché **Argon2id** (D7), enregistrement atomique `User` + consentements initiaux obligatoires (`TERMS_OF_SERVICE`, `PRIVACY_POLICY`) + `AUDIT_LOGS`, protection anti-bruteforce (throttling 5/min/IP + proxy), sans connexion automatique ni génération de JWT | Dev 4 | M1.1 | **Validé et commité** |
| **M1.3** | Connexion, JWT & routes de session | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/logout-all`, `GET /auth/me` ; access JWT HS256 15 min (D6) ; cookie refresh HttpOnly (D5) | Dev 4 | M1.1, M1.2 | **Validé et commité** |
| **M2** | RBAC | Guards `JwtAuthGuard`, `GlobalRolesGuard`, `OrgRolesGuard`, décorateurs `@Roles()` / `@OrgRoles()` ; matrice §4.2 testée ; `GlobalRole` ≠ `OrgMemberRole` ; isolation entre organisations | Dev 4 | M1 | **Validé et commité** |
| **M3** | `AuditModule` | Service d'écriture dans `AUDIT_LOGS` (UTC, auteur, IP, User-Agent), immuable côté application ; `GET /admin/audit-logs` réservé `SYSTEM_ADMIN` ; événements de sécurité | Dev 4 | M1, M2 | **Validé et commité** |
| **M4** | `ConsentModule` | Consentements distincts et non pré-cochés (CGU/politique à l'inscription ; vivier ; matching automatisé), versionnés, révocables ; `GET/PUT /me/consents` | Dev 4 | M1, M3 | **Validé et commité** (type facultatif unique `TALENT_POOL_MATCHING` couvrant vivier + matching ; `PUT` réservé à `CANDIDATE`) |
| **M5** | Organisations (socle minimal) | Création et informations essentielles, `OWNER` et association des membres, rôles `OWNER`/`ADMIN`/`RECRUITER`/`VIEWER`, isolation entre organisations, statut de vérification `PENDING` et contrôle administratif avant accès au vivier | Dev 1/4 | M2, M3 | **Validé et commité** |
| **M6** | Écrans d'authentification (frontend) | Pages inscription et connexion FR/AR(RTL)/EN, messages d'erreur traduits, appel réel à l'API ; vérification navigateur FR/AR/EN ; aucun jeton dans `localStorage` | Dev 2 | M1, M4 | À faire |

**Hors périmètre Sprint 2** : profil candidat, offres, matching exposé en API, candidatures et machine à états, vivier, entretiens, console admin avancée, e-mails (D8 : vérification d'adresse, réinitialisation, invitations et notifications — aucun envoi simulé), MinIO réel (B-01), validation Docker Compose (B-02), CNDP (DEC-05).

## 3. Décisions officielles du coordinateur (D1 à D8)
| Réf. | Décision validée |
|---|---|
| **D1** | **APPROUVÉ** : Ajout de la 24e entité `USER_SESSIONS` et mise à jour du DCTF en **v3.1.2**. Refresh token haché SHA-256 en base (jamais en clair), rotation, détection de réutilisation (révocation de toutes les sessions du compte), expiration et déconnexion globale (`logout-all`). |
| **D2** | **APPROUVÉ** : L'inscription publique (`POST /auth/register`) accepte uniquement `CANDIDATE` et `ORGANIZATION_USER`, imposé côté backend. `SYSTEM_ADMIN` est créé exclusivement par processus contrôlé (seed initial). |
| **D3** | **APPROUVÉ** : Limite backend alignée sur **5 Mo** conformément au DCTF §8.2, avec contrôle du type réel par magic bytes PDF (`%PDF-`). |
| **D4** | **APPROUVÉ** : DEC-02 mis à jour : profil privé par défaut, participation au vivier facultative, anonymisation par défaut dans le vivier (`is_anonymized_in_pool = true`), divulgation de l'identité et des documents soumise aux autorisations nécessaires. |
| **D5** | **APPROUVÉ** : Cookie refresh token `HttpOnly`, `SameSite=Strict`, `Secure=false` en développement HTTP et `Secure=true` en production HTTPS. Interdiction de stocker le refresh token dans `localStorage`. |
| **D6** | **APPROUVÉ SOUS CONDITIONS** : JWT `HS256` accepté pour le backend unique du MVP avec secret aléatoire ≥ 256 bits, différent par environnement et jamais commité dans Git. Access token courte durée (15 min) + sessions en base (`USER_SESSIONS`). |
| **D7** | **APPROUVÉ** : Mot de passe de **12 à 128 caractères**, phrases de passe acceptées, pas de complexité artificielle obligatoire, hachage **Argon2id** et protection contre les tentatives répétées. |
| **D8** | **HORS SPRINT 2** : Aucun service d'e-mail intégré au Sprint 2 ; aucun envoi réussi simulé. Dépendances fonctionnelles documentées dans le DCTF v3.1.2 §8.1 (vérification d'adresse, réinitialisation, invitations, notifications). |
| **M5** | **MAINTENU** : Socle minimal uniquement (création, informations essentielles, `OWNER` et membres, rôles `OWNER`/`ADMIN`/`RECRUITER`/`VIEWER`, isolation inter-organisations, statut de vérification `PENDING`). |

## 4. Métriques et exclusions de couverture (85 %)
- **Seuils vérifiés automatiquement par `npm run test:cov`** : `statements >= 85%`, `lines >= 85%`, `functions >= 85%`, `branches >= 80%`.
- **Exclusions justifiées** :
  - `main.ts` et `**/*.module.ts` : câblage et démarrage NestJS sans logique métier ;
  - `**/*.dto.ts`, `**/*.types.ts`, `**/*.interface.ts` : types et contrats déclaratifs ;
  - `database/prisma.service.ts` et `modules/health/prisma.health.ts` : adaptateurs d'infrastructure vers Prisma ;
  - `modules/storage/s3-storage.provider.ts` : adaptateur SDK S3/MinIO non exécutable tant que MinIO est reporté (B-01) ;
  - `**/*.spec.ts` : fichiers de tests.
