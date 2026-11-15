# Sprint 3 – Périmètre et décisions officielles (VALIDÉ PAR LE COORDINATEUR)

> **Statut : Modules M3.1 et M3.2 validés et implémentés.** Développement séquentiel module par module (M3.1 → M3.2 → M3.3), avec validation préalable et tests avant chaque commit Git.
> Références : DCTF v3.1.2 §3 (entités `CANDIDATE_PROFILES`, `CANDIDATE_EDUCATIONS`, `CANDIDATE_EXPERIENCES`, `CANDIDATE_SKILLS`, `CANDIDATE_LANGUAGES`, `JOB_OFFERS`, `JOB_REQUIRED_SKILLS`, `JOB_REQUIRED_LANGUAGES`, etc.), §4.2 (Matrice RBAC), §5 (Moteur de matching), §8.5 (Consentements), §9.3 (API Offres), §11.3 (Definition of Done).

---

## 1. Objectif et thème
**« Offres, Profils et Matching »** : outiller les candidats pour compléter leur profil et CV, permettre aux recruteurs de publier des offres d'emploi/stage, et connecter les deux via le moteur de matching pondéré.

---

## 2. Découpage modulaire du Sprint 3

| # | Module | Contenu | Rôle simulé | Dépend de | État |
|---|---|---|---|---|---|
| **M3.1** | **Référentiels & Profil Candidat minimal** | Référentiel des 12 régions marocaines (trilingue FR/AR/EN), CRUD profil candidat (`/candidates/me`), formations, expériences, compétences (`REF_SKILLS`), langues (`CandidateLanguageItemDto`), CV (upload/download presigned URLs + validation 5 Mo / `%PDF-`), consentement vivier (`TALENT_POOL_MATCHING`) & anonymisation (`isAnonymizedInPool`), interface candidat complète (`/candidate/profile`) trilingue FR/AR/EN avec support RTL. | Dev 3 / Dev 2 | Sprint 2 (M1 à M6) | **Validé et commité** (`7e4c5392`) |
| **M3.2** | **Gestion des Offres d'emploi / stage** | CRUD offres par organisation (`JOB_OFFERS`, `JOB_REQUIRED_SKILLS`, `JOB_REQUIRED_LANGUAGES`), statuts (`DRAFT`, `PUBLISHED`, `CLOSED`, `ARCHIVED`), protection des organisations non vérifiées (`VERIFIED` requis pour publier), contrôle RBAC (`OWNER`, `ADMIN`, `RECRUITER`, `VIEWER`) et isolation inter-organisations, recherche publique paginée (`/api/v1/job-offers`), interfaces frontend trilingues FR/AR(RTL)/EN (`/offers`, `/offers/[id]`, `/organization/offers`). | Dev 1 / Dev 2 | M3.1, M5 | **Validé et implémenté** |
| **M3.3** | **Moteur de Matching exposé en API** | Intégration du `MatchingService` existant sur les offres et profils éligibles (consentement `TALENT_POOL_MATCHING` actif, organisation vérifiée), calcul des scores et seuil d'admissibilité (≥ 50 %), restitution détaillée. | Dev 3 | M3.1, M3.2 | *En attente d'autorisation* |

---

## 3. Détail du Module M3.1 (Réalisé)

### 3.1 Backend
- **Référentiel des 12 régions marocaines** (`backend/src/constants/moroccan-regions.constant.ts`) :
  - Standardisé selon le Décret n° 2-15-40 et la norme ISO 3166-2:MA (`MA-01` à `MA-12`).
  - Noms officiels trilingues (français, arabe, anglais).
  - Validation stricte des codes région dans les DTOs.
- **Contrôleur et Service Référentiel** (`backend/src/modules/reference/`) :
  - `GET /api/v1/reference/regions` : liste des 12 régions marocaines (public).
  - `GET /api/v1/reference/specialties` : liste des spécialités actives de `REF_SPECIALTIES` (public).
  - `GET /api/v1/reference/skills` : référentiel des compétences de `REF_SKILLS` (public).
- **Module Candidats** (`backend/src/modules/candidates/`) :
  - `GET /api/v1/candidates/me` : consultation de son profil complet avec relations (formations, expériences, compétences, langues, consentement vivier).
  - `PUT /api/v1/candidates/me` : création/mise à jour du profil, calcul automatique du taux de complétion (0–100 %).
  - `POST /api/v1/candidates/me/education` & `DELETE /api/v1/candidates/me/education/:id` : gestion des diplômes et formations.
  - `POST /api/v1/candidates/me/experiences` & `DELETE /api/v1/candidates/me/experiences/:id` : gestion des stages et emplois.
  - `PUT /api/v1/candidates/me/skills` : déclaration des compétences avec niveau (`BEGINNER`, `INTERMEDIATE`, `ADVANCED`, `EXPERT`) et années d'expérience.
  - `PUT /api/v1/candidates/me/languages` : déclaration des langues avec niveau CECRL (`A1` à `C2` ou `NATIVE`).
  - `POST /api/v1/candidates/me/cv/presigned-upload` : génération d'URL d'upload pré-signée (5 Mo, type application/pdf).
  - `POST /api/v1/candidates/me/cv/confirm` : confirmation après téléversement avec persistance du `cvFileId`.
  - `GET /api/v1/candidates/me/cv/download-url` : URL pré-signée de téléchargement sécurisée + journalisation `CV_DOWNLOAD` dans `AUDIT_LOGS`.
  - Sécurité : accès strictement réservé au rôle `GlobalRole.CANDIDATE` via `JwtAuthGuard` et `GlobalRolesGuard`.

### 3.2 Frontend
- **Page Profil Candidat** (`frontend/src/app/[locale]/candidate/profile/page.tsx`) :
  - Barre de progression du taux de complétion en temps réel (0–100 %).
  - Formulaires intégrés : coordonnées, spécialité, région marocaine, ville, disponibilité, mobilité.
  - Gestion dynamique des formations et expériences (ajout modal / suppression unitaire).
  - Sélecteurs interactifs pour les compétences du référentiel et langues CECRL.
  - Téléversement direct du CV en deux étapes (presigned URL + confirmation) et téléchargement sécurisé.
  - Case à cocher pour le consentement au vivier (`TALENT_POOL_MATCHING`) via l'API M4 et option d'anonymisation (`isAnonymizedInPool`).
  - Internationalisation complète FR / AR / EN avec support RTL natif (`dir="rtl"`).
- **Navigation** :
  - Liens "Mon profil" ajoutés dans la `Navbar` et le `UserSessionCard` pour tout utilisateur connecté avec le rôle `CANDIDATE`.

### 3.3 Tests & Qualité
- 19 tests d'intégration automatisés (`backend/src/modules/candidates/candidates.spec.ts`) validant les 5 axes fonctionnels.
- 163 tests backend passés sans régression sur l'ensemble de la suite (`npm test`).
- Type-check TypeScript strict (`tsc --noEmit`) backend et frontend sans erreur.
- Linter ESLint frontend validé sans erreur ni avertissement.

---

## 4. Détail du Module M3.2 – Gestion des Offres d'emploi et de stage (Réalisé)

### 4.1 Backend (`backend/src/modules/offers/`)
- **Recherche et consultation publique (`JobOffersController` — `/api/v1/job-offers`)** :
  - `GET /api/v1/job-offers` (public) : recherche paginée et filtrée (`offerType`, `regionCode`, `specialtyId`, `search`). Retourne **exclusivement** les offres au statut `PUBLISHED` émises par des organisations actives et vérifiées (`verificationStatus = 'VERIFIED'`).
  - `GET /api/v1/job-offers/:id` (public) : détail complet d'une offre publiée avec structure émettrice, spécialité ciblée, compétences requises (`JOB_REQUIRED_SKILLS`) et langues requises (`JOB_REQUIRED_LANGUAGES`). Masque (`404 Not Found`) toute offre non publiée.
  - `GET /api/v1/job-offers/my-organizations` (`ORGANIZATION_USER`) : liste des structures actives auxquelles appartient l'utilisateur connecté avec son rôle (`OrgMemberRole`) et le statut de vérification.
- **Gestion par organisation (`OrgJobOffersController` — `/api/v1/organizations/:organizationId/job-offers`)** :
  - `POST /api/v1/organizations/:organizationId/job-offers` (`RECRUITER`, `ADMIN`, `OWNER`) : création d'une offre au statut initial `DRAFT`, avec compétences et langues requises.
  - `GET /api/v1/organizations/:organizationId/job-offers` (`VIEWER`, `RECRUITER`, `ADMIN`, `OWNER`, `SYSTEM_ADMIN`) : liste paginée des offres de l'organisation (tous statuts, filtrable par `status`).
  - `GET /api/v1/organizations/:organizationId/job-offers/:offerId` (`VIEWER`, `RECRUITER`, `ADMIN`, `OWNER`, `SYSTEM_ADMIN`) : consultation interne détaillée quel que soit le statut.
  - `PUT /api/v1/organizations/:organizationId/job-offers/:offerId` (`RECRUITER`, `ADMIN`, `OWNER`, `SYSTEM_ADMIN`) : mise à jour atomique de l'offre et de ses exigences (interdite si `ARCHIVED`).
  - `POST /api/v1/organizations/:organizationId/job-offers/:offerId/publish` (`RECRUITER`, `ADMIN`, `OWNER`) : publication (`DRAFT` -> `PUBLISHED`), **strictement réservée aux organisations au statut `VERIFIED`** (`403 Forbidden` si `PENDING` ou `REJECTED`), avec journalisation immuable `OFFER_PUBLISH` dans `AUDIT_LOGS`.
  - `POST /api/v1/organizations/:organizationId/job-offers/:offerId/close` (`RECRUITER`, `ADMIN`, `OWNER`) : clôture d'une offre publiée (`PUBLISHED` -> `CLOSED`).
  - `POST /api/v1/organizations/:organizationId/job-offers/:offerId/archive` & `DELETE /api/v1/organizations/:organizationId/job-offers/:offerId` (`ADMIN`, `OWNER`, `SYSTEM_ADMIN` — **interdit au `RECRUITER`** conformément à la matrice DCTF §4.2) : archivage de l'offre (`*` -> `ARCHIVED`).

### 4.2 Frontend (`frontend/src/app/[locale]/...`)
- **Liste publique des offres** (`/offers` — `frontend/src/app/[locale]/offers/page.tsx`) : recherche par mots-clés, filtres par type d'offre, région marocaine et spécialité, cartes d'offres et pagination.
- **Détail d'une offre** (`/offers/[id]` — `frontend/src/app/[locale]/offers/[id]/page.tsx`) : présentation complète des missions, conditions, compétences obligatoires/souhaitables et langues requises.
- **Espace Recruteur – Gestion des offres** (`/organization/offers` — `frontend/src/app/[locale]/organization/offers/page.tsx`) :
  - Création directe de structure si l'utilisateur `ORGANIZATION_USER` n'en possède pas encore.
  - Affichage du rôle (`OWNER`, `ADMIN`, `RECRUITER`, `VIEWER`) et du badge de statut de vérification (`PENDING`, `VERIFIED`, `REJECTED`) avec bandeau d'information lorsque la structure est en attente de vérification.
  - Création, modification, publication, clôture et archivage des offres selon les permissions exactes du membre.
  - Internationalisation complète FR / AR (RTL) / EN.

### 4.3 Tests & Qualité M3.2
- 20 tests d'intégration automatisés (`backend/src/modules/offers/offers.spec.ts`) couvrant RBAC, protection des organisations non vérifiées, isolation inter-organisations, recherche publique et cycle de vie des statuts.

