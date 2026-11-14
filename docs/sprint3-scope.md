# Sprint 3 – Périmètre et décisions officielles (VALIDÉ PAR LE COORDINATEUR)

> **Statut : Module M3.1 validé et implémenté.** Développement séquentiel module par module (M3.1 → M3.2 → M3.3), avec validation préalable et tests avant chaque commit Git.
> Références : DCTF v3.1.2 §3 (entités `CANDIDATE_PROFILES`, `CANDIDATE_EDUCATIONS`, `CANDIDATE_EXPERIENCES`, `CANDIDATE_SKILLS`, `CANDIDATE_LANGUAGES`, `JOB_OFFERS`, etc.), §5 (Moteur de matching), §8.5 (Consentements), §11.3 (Definition of Done).

---

## 1. Objectif et thème
**« Offres, Profils et Matching »** : outiller les candidats pour compléter leur profil et CV, permettre aux recruteurs de publier des offres d'emploi/stage, et connecter les deux via le moteur de matching pondéré (spécialité 40 %, compétences 30 %, localisation 20 %, expérience 10 %).

---

## 2. Découpage modulaire du Sprint 3

| # | Module | Contenu | Rôle simulé | Dépend de | État |
|---|---|---|---|---|---|
| **M3.1** | **Référentiels & Profil Candidat minimal** | Référentiel des 12 régions marocaines (trilingue FR/AR/EN), CRUD profil candidat (`/candidates/me`), formations, expériences, compétences (`REF_SKILLS`), langues (`CandidateLanguageItemDto`), CV (upload/download presigned URLs + validation 5 Mo / `%PDF-`), consentement vivier (`TALENT_POOL_MATCHING`) & anonymisation (`isAnonymizedInPool`), interface candidat complète (`/candidate/profile`) trilingue FR/AR/EN avec support RTL. | Dev 3 / Dev 2 | Sprint 2 (M1 à M6) | **Validé et implémenté** |
| **M3.2** | **Gestion des Offres d'emploi / stage** | CRUD offres par organisation (`JOB_OFFERS`), statuts de publication (`DRAFT`, `PUBLISHED`, `ARCHIVED`), compétences requises, interface recruteur. | Dev 1 / Dev 2 | M3.1, M5 | *En attente d'autorisation* |
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
