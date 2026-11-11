# Dossier de Conception Technique et Fonctionnelle (DCTF) – Version 3.1
## Projet : PsyRekrute
**Plateforme trilingue de mise en relation et de matching intelligent pour étudiants, diplômés en psychologie de l'éducation / domaines connexes et structures d'accueil au Maroc**

---

### Historique des versions
| Version | Date | Auteur | Statut | Résumé des modifications |
| :--- | :--- | :--- | :--- | :--- |
| **v1.0** | Initiale | Équipe Projet | Archivée | Spécifications fonctionnelles et techniques initiales. |
| **v2.0** | 2026-11-09 | Direction Technique | Archivée | Complément officiel : trilinguisme (FR, AR RTL, EN), 12 régions du Maroc, matching pondéré, conformité Loi 09-08 / CNDP. |
| **v3.0** | 2026-11-09 | Direction Technique | Archivée | Monolithe modulaire, Prisma, Docker, cadrage psychologie de l'éducation, modèle relationnel enrichi. |
| **v3.1** | 2026-11-09 | Direction Technique / Équipe Antigravity | **Soumise à validation** | **Révision majeure suite à la revue approfondie du coordinateur :**<br>• Harmonisation stricte du modèle de données (23 entités exactes, relations, cascades et index corrigés).<br>• Matrice RBAC clarifiée : dissociation étanche entre `GlobalRole` et `OrgMemberRole`.<br>• Refonte mathématique intégrale de l'algorithme de matching : formules formelles pour chaque critère, élimination de la contradiction sur les compétences souhaitables, bonus de vérification borné à 100%, matrice ontologique des compétences connexes.<br>• Trois cas chiffrés complets et reproductibles par des tests unitaires (Observation, PFE, Emploi).<br>• Machine à états finis (FSM) d'application complète avec matrice des transitions autorisées/interdites, expiration des invitations et règles de réinvitation.<br>• Spécifications détaillées de sécurité : cycle de vie des refresh tokens, URLs signées S3 temporaires, validation des magic bytes PDF, logs d'audit sensibles.<br>• Cadrage juridique rigoureux de la Loi 09-08 (durée de conservation de 24 mois requalifiée en choix organisationnel d'entreprise et identification des démarches CNDP soumises à avis juridique).<br>• Contrats d'API exhaustifs avec DTOs, validations, codes d'erreurs et pagination.<br>• Environnement Docker harmonisé sans secrets en clair.<br>• Organisation collaborative des 5 développeurs avec matrice anti-blocage, contrats d'interface et Definition of Done (DoD). |

---

## Sommaire
1. [Périmètre Métier Recentré, Typologies et Anti-Scope](#1-périmètre-métier-recentré-typologies-et-anti-scope)
2. [Architecture Technique Globale & Choix Technologiques Arrêtés](#2-architecture-technique-globale--choix-technologiques-arrêtés)
3. [Modèle de Données Exhaustif (23 Entités) & Schéma ERD](#3-modèle-de-données-exhaustif-23-entités--schéma-erd)
4. [Gouvernance des Accès & Matrice RBAC Harmonisante](#4-gouvernance-des-accès--matrice-rbac-harmonisante)
5. [Spécification Mathématique Intégrale du Moteur de Matching](#5-spécification-mathématique-intégrale-du-moteur-de-matching)
6. [Trois Exemples Chiffrés Recalculés Pas à Pas (Reproductibles par Tests Unitaires)](#6-trois-exemples-chiffrés-recalculés-pas-à-pas-reproductibles-par-tests-unitaires)
7. [Parcours de Recrutement & Machine à États Finis (FSM) Complète](#7-parcours-de-recrutement--machine-à-états-finis-fsm-complète)
8. [Sécurité, Confidentialité, Gestion des Fichiers & Conformité Loi 09-08 / CNDP](#8-sécurité-confidentialité-gestion-des-fichiers--conformité-loi-09-08--cndp)
9. [Contrats d'API REST Détaillés](#9-contrats-dapi-rest-détaillés)
10. [Configuration Docker, Variables d'Environnement & Procédure Locale Standardisée](#10-configuration-docker-variables-denvironnement--procédure-locale-standardisée)
11. [Organisation Opérationnelle des 5 Développeurs (Matrice Anti-Blocage & DoD)](#11-organisation-opérationnelle-des-5-développeurs-matrice-anti-blocage--dod)
12. [Tableau Comparatif des Modifications (v3.0 vs v3.1)](#12-tableau-comparatif-des-modifications-v30-vs-v31)
13. [Matrice des Risques et Décisions Soumises à l'Approbation du Coordinateur](#13-matrice-des-risques-et-décisions-soumises-à-lapprobation-du-coordinateur)

---

## 1. Périmètre Métier Recentré, Typologies et Anti-Scope

### 1.1 Cadrage Métier Strict
PsyRekrute se concentre exclusivement sur les métiers de la **psychologie de l'éducation, du développement de l'enfant et de l'adolescent, de l'accompagnement éducatif spécialisé et de la remédiation des troubles du neurodéveloppement et des apprentissages**.
La plateforme n'intègre pas les professions médicales généralistes ou hospitalières lourdes (médecine, psychiatrie, chirurgie, soins infirmiers généraux).

#### Référentiel initial proposé des spécialités académiques (`REF_SPECIALTIES`) :
1. **Psychologie de l'Éducation et du Développement** (Apprentissages scolaires, orientation, difficultés socio-émotionnelles en milieu éducatif).
2. **Psychologie Clinique de l'Enfant et de l'Adolescent** (Évaluation psycho-affective, guidance parentale, bilans de développement).
3. **Neuropsychologie Infantile et Troubles des Apprentissages** (Troubles DYS : dyslexie, dyspraxie, dyscalculie, TDAH, bilans cognitifs WISC-V / TEA-Ch).
4. **Psycho-éducation et Éducation Spécialisée** (Interventions éducatives adaptées, gestion des troubles du comportement, accompagnement en milieu inclusif).
5. **Accompagnement du Spectre de l'Autisme (TSA)** (Méthodes éducatives et comportementales structurées : ABA, TEACCH, PECS).
6. **Remédiation Cognitive et Psychopédagogie** (Stratégies métacognitives, réhabilitation des fonctions attentionnelles et exécutives).

#### Typologie des profils candidats :
- **Étudiants** : En cours de formation (Licence 3, Master 1, Master 2, Diplôme Universitaire spécialisé), en recherche active de **stages d'observation** ou de **stages de fin d'études (PFE)**.
- **Jeunes Diplômés (< 2 ans post-diplôme)** : Titulaires d'un diplôme d'État ou universitaire en recherche d'un premier emploi (CDD, CDI) ou d'un stage d'insertion supervisé.
- **Professionnels Expérimentés (> 2 ans de pratique)** : Praticiens en exercice cherchant une mobilité, des vacations ou des postes de coordination médico-éducative.

#### Typologie des structures d'accueil (`ORGANIZATIONS`) :
- **Centres Médico-Psycho-Pédagogiques (CMPP)** et centres de rééducation pluridisciplinaire.
- **Associations pour l'inclusion d'enfants à besoins spécifiques** (TSA, Trisomie, Retards globaux de développement).
- **Établissements scolaires privés et internationaux** disposant de cellules d'écoute ou de classes d'intégration inclusive.
- **Cabinets de consultation libérale** (psychologues, psycho-éducateurs cherchant des collaborateurs ou stagiaires).

### 1.2 Frontière stricte de périmètre (Anti-Scope)
> [!CAUTION]
> **Interdiction formelle des dossiers médicaux et de santé de tiers :**
> PsyRekrute est un système d'information de **recrutement RH et de mise en relation professionnelle**.
> - En aucun cas la plateforme ne doit permettre le dépôt, la consultation, le stockage ou la transmission de dossiers médicaux d'enfants, de bilans psychologiques de patients, de données diagnostiques individuelles de mineurs ou de comptes-rendus thérapeutiques nominatifs.
> - Aucune fonctionnalité de dossier patient ou de suivi clinique ne fait partie du périmètre du projet.

---

## 2. Architecture Technique Globale & Choix Technologiques Arrêtés

### 2.1 Synthèse de la Pile Technique Validée
L'architecture technique est définitivement arrêtée sur un **monolithe modulaire** déployé via **Docker Compose** :

| Composant | Technologie retenue | Version cible | Justification technique |
| :--- | :--- | :--- | :--- |
| **Frontend** | Next.js (App Router) + React + TypeScript | Next.js 14.2+ / Node 20 LTS | Rendu hybride SSR/CSR, performance, sécurité des sessions. |
| **Internationalisation** | `next-intl` | 3.14+ | Support natif complet FR (défaut), AR (sens RTL intégral) et EN (LTR). |
| **UI & Styles** | Tailwind CSS + shadcn/ui + Lucide Icons | Tailwind 3.4+ | Propriétés logiques CSS (`margin-inline-start`, etc.) pour bascule RTL sans régression. |
| **Backend** | NestJS + TypeScript | NestJS 10.3+ / Node 20 LTS | Architecture modulaire d'entreprise, injection de dépendances étanche, prévisibilité. |
| **Base de Données** | PostgreSQL | PostgreSQL 16-alpine | ACID, types JSONB natifs, indexation avancée, compatibilité future `pgvector`. |
| **ORM** | Prisma ORM | Prisma 5.14+ | Type-safety de bout en bout, migrations versionnées prévisibles, Developer Experience. |
| **Stockage Fichiers** | Compatible S3 (MinIO en local) | MinIO RELEASE.2024+ | Isolation stricte des CVs, accès exclusif par URLs pré-signées temporaires (TTL 15 min). |
| **Conteneurisation** | Docker & Docker Compose | Docker Engine 24+ / Compose v2 | Reproductibilité absolue de l'environnement de développement pour les 5 développeurs. |
| **Gestion du Code & CI** | GitHub & GitHub Actions | GitHub standard | Trunk-based Git Flow avec feature branches, revues obligatoires, CI automatisée. |

### 2.2 Arbitrage architectural : Monolithe Modulaire sans Redis/BullMQ
- **Monolithe modulaire** : Tous les domaines métier s'exécutent au sein d'une unique application NestJS structurée en modules hautement cohésifs et faiblement couplés (`AuthModule`, `CandidatesModule`, `OrganizationsModule`, `OffersModule`, `ApplicationsModule`, `MatchingModule`, `NotificationsModule`, `AuditModule`, `StorageModule`).
- **Absence de microservices, de Redis et de BullMQ dans le MVP** :
  - Le volume initial d'un MVP ne justifie pas la complexité opérationnelle d'un bus de messages distribué ou d'une infrastructure multi-conteneurs asynchrone.
  - Les calculs de matching sont exécutés de façon synchrone ou par événements in-process non-bloquants (via `EventEmitter2` de NestJS).
  - L'architecture préserve des frontières de services nettes permettant d'extraire le moteur de matching ou d'introduire Redis/BullMQ ultérieurement si et seulement si des métriques de charge en production en démontrent la nécessité.

---

## 3. Modèle de Données Exhaustif (23 Entités) & Schéma ERD

Le modèle relationnel compte **exactement 23 entités**, toutes spécifiées, indexées et intégrées au diagramme ERD.

### 3.1 Liste exhaustive des 23 entités
1. `USERS` (Authentification et identité générique)
2. `CANDIDATE_PROFILES` (Profil professionnel du candidat)
3. `ORGANIZATIONS` (Structures et centres d'accueil)
4. `ORGANIZATION_MEMBERS` (Appartenance et permissions multi-utilisateurs)
5. `REF_SPECIALTIES` (Référentiel taxonomique des spécialités)
6. `REF_SKILLS` (Référentiel des compétences cliniques et techniques)
7. `CANDIDATE_EDUCATION` (Parcours académique et diplômes)
8. `CANDIDATE_EXPERIENCE` (Stages et expériences professionnelles)
9. `CANDIDATE_SKILLS` (Compétences déclarées et vérifiées du candidat)
10. `CANDIDATE_LANGUAGES` (Compétences linguistiques détaillées)
11. `CANDIDATE_CERTIFICATIONS` (Certifications officielles déposées)
12. `JOB_OFFERS` (Offres de stages et d'emplois publiées)
13. `JOB_REQUIRED_SKILLS` (Compétences obligatoires et souhaitables par offre)
14. `JOB_REQUIRED_LANGUAGES` (Exigences linguistiques par offre)
15. `APPLICATIONS` (Candidatures directes et invitations)
16. `APPLICATION_HISTORY` (Journal d'audit immuable des transitions de recrutement)
17. `MATCHING_CONFIG` (Pondérations configurables par type d'offre)
18. `MATCH_RESULTS` (Mise en cache des scores et explications de matching)
19. `SAVED_OFFERS` (Offres mises en favoris par les candidats)
20. `NOTIFICATIONS` (Centre de notifications in-app et traçabilité e-mails)
21. `CONSENTS` (Consentements explicites Loi 09-08 / CNDP)
22. `AUDIT_LOGS` (Journal d'audit de sécurité et traçabilité des accès aux CVs)
23. `REPORTS` (Signalements d'abus, d'offres frauduleuses ou de faux profils)

---

### 3.2 Diagramme Entité-Association Complet (ERD)

```mermaid
erDiagram
    USERS ||--o| CANDIDATE_PROFILES : "possède profil"
    USERS ||--o{ ORGANIZATION_MEMBERS : "membre de"
    USERS ||--o{ NOTIFICATIONS : "reçoit"
    USERS ||--o{ CONSENTS : "accorde"
    USERS ||--o{ AUDIT_LOGS : "génère"
    USERS ||--o{ REPORTS : "émet"
    USERS ||--o{ APPLICATION_HISTORY : "opère transition"

    ORGANIZATIONS ||--o{ ORGANIZATION_MEMBERS : "comprend"
    ORGANIZATIONS ||--o{ JOB_OFFERS : "publie"
    ORGANIZATIONS ||--o{ REPORTS : "fait l'objet de"

    CANDIDATE_PROFILES ||--o{ CANDIDATE_EDUCATION : "a suivi"
    CANDIDATE_PROFILES ||--o{ CANDIDATE_EXPERIENCE : "a réalisé"
    CANDIDATE_PROFILES ||--o{ CANDIDATE_SKILLS : "maîtrise"
    CANDIDATE_PROFILES ||--o{ CANDIDATE_LANGUAGES : "pratique"
    CANDIDATE_PROFILES ||--o{ CANDIDATE_CERTIFICATIONS : "a obtenu"
    CANDIDATE_PROFILES ||--o{ SAVED_OFFERS : "sauvegarde"
    CANDIDATE_PROFILES ||--o{ APPLICATIONS : "postule / invité"
    CANDIDATE_PROFILES ||--o{ MATCH_RESULTS : "évalué dans"

    REF_SPECIALTIES ||--o{ CANDIDATE_PROFILES : "spécialité principale"
    REF_SPECIALTIES ||--o{ CANDIDATE_EDUCATION : "filière diplôme"
    REF_SPECIALTIES ||--o{ JOB_OFFERS : "cible"
    REF_SPECIALTIES ||--o{ REF_SPECIALTIES : "est sous-spécialité de"

    REF_SKILLS ||--o{ CANDIDATE_SKILLS : "référence"
    REF_SKILLS ||--o{ JOB_REQUIRED_SKILLS : "exigée dans"
    REF_SKILLS ||--o{ REF_SKILLS : "est connexe à"

    JOB_OFFERS ||--o{ JOB_REQUIRED_SKILLS : "exige compétences"
    JOB_OFFERS ||--o{ JOB_REQUIRED_LANGUAGES : "exige langues"
    JOB_OFFERS ||--o{ SAVED_OFFERS : "mise en favori dans"
    JOB_OFFERS ||--o{ APPLICATIONS : "reçoit"
    JOB_OFFERS ||--o{ MATCH_RESULTS : "évaluée dans"
    JOB_OFFERS ||--o{ REPORTS : "fait l'objet de"

    APPLICATIONS ||--o{ APPLICATION_HISTORY : "historique immuable"
    MATCHING_CONFIG ||--o{ MATCH_RESULTS : "paramètre"
```

---

### 3.3 Spécification exhaustive des tables, clés, contraintes et index

#### 1. `USERS`
- `id` (UUID, PK, `gen_random_uuid()`)
- `email` (VARCHAR(255), UNIQUE, NOT NULL, INDEX)
- `password_hash` (VARCHAR(255), NOT NULL)
- `global_role` (VARCHAR(30), NOT NULL) : `'CANDIDATE'`, `'ORGANIZATION_USER'`, `'SYSTEM_ADMIN'`
- `preferred_locale` (VARCHAR(5), NOT NULL, default: `'fr'`) : `'fr'`, `'ar'`, `'en'`
- `is_email_verified` (BOOLEAN, default: false)
- `is_active` (BOOLEAN, default: true)
- `last_login_at` (TIMESTAMP NULL)
- `created_at` (TIMESTAMP, default: `now()`)
- `updated_at` (TIMESTAMP, default: `now()`)

#### 2. `CANDIDATE_PROFILES`
- `id` (UUID, PK)
- `user_id` (UUID, FK `USERS.id`, UNIQUE, NOT NULL, ON DELETE CASCADE)
- `first_name` (VARCHAR(100), NOT NULL)
- `last_name` (VARCHAR(100), NOT NULL)
- `phone` (VARCHAR(30) NULL)
- `profile_category` (VARCHAR(30), NOT NULL) : `'STUDENT'`, `'RECENT_GRADUATE'`, `'EXPERIENCED_PROFESSIONAL'`
- `primary_specialty_id` (UUID, FK `REF_SPECIALTIES.id`, NOT NULL, ON DELETE RESTRICT)
- `region_code` (VARCHAR(10), NOT NULL, INDEX) : Code région ISO Maroc (ex: `'MA-04'`)
- `city_name` (VARCHAR(100), NOT NULL, INDEX)
- `mobility_radius_km` (INT, default: 0)
- `open_to_relocation` (BOOLEAN, default: false)
- `availability_status` (VARCHAR(30), NOT NULL) : `'IMMEDIATE'`, `'DATE'`, `'CURRENTLY_EMPLOYED'`, `'PART_TIME'`
- `available_from` (DATE NULL)
- `target_contract_types` (TEXT[], NOT NULL) : `['STAGE_OBSERVATION', 'STAGE_PFE', 'CDD', 'CDI', 'VACATION']`
- `bio` (TEXT NULL)
- `cv_storage_path` (VARCHAR(500) NULL)
- `is_anonymized_in_pool` (BOOLEAN, default: false) : Si true, masque nom/photo/coordonnées dans le vivier
- `is_deleted` (BOOLEAN, default: false) : Soft-delete pour préserver l'historique RH des centres
- `profile_completion_percentage` (INT, default: 0)
- `created_at`, `updated_at`

#### 3. `ORGANIZATIONS`
- `id` (UUID, PK)
- `legal_name` (VARCHAR(255), NOT NULL)
- `trade_name` (VARCHAR(255), NOT NULL)
- `organization_type` (VARCHAR(50), NOT NULL) : `'CMPP'`, `'ASSOCIATION'`, `'CABINET_LIBERAL'`, `'ECOLE_INCLUSIVE'`, `'CLINIQUE_SPECIALISEE'`
- `identifier_ice` (VARCHAR(15) NULL, UNIQUE) : Identifiant Commun de l'Entreprise marocain
- `official_registration_number` (VARCHAR(100) NULL) : Récépissé ou patente
- `website` (VARCHAR(255) NULL)
- `phone` (VARCHAR(50), NOT NULL)
- `email` (VARCHAR(255), NOT NULL)
- `region_code` (VARCHAR(10), NOT NULL, INDEX)
- `city_name` (VARCHAR(100), NOT NULL, INDEX)
- `address_line` (TEXT, NOT NULL)
- `verification_status` (VARCHAR(30), default: `'PENDING'`) : `'PENDING'`, `'VERIFIED'`, `'REJECTED'`
- `verified_at` (TIMESTAMP NULL)
- `is_active` (BOOLEAN, default: true)
- `created_at`, `updated_at`

#### 4. `ORGANIZATION_MEMBERS`
- `id` (UUID, PK)
- `organization_id` (UUID, FK `ORGANIZATIONS.id`, NOT NULL, ON DELETE CASCADE)
- `user_id` (UUID, FK `USERS.id`, NOT NULL, ON DELETE CASCADE)
- `role` (VARCHAR(30), NOT NULL) : `'OWNER'`, `'ADMIN'`, `'RECRUITER'`, `'VIEWER'`
- `created_at` (TIMESTAMP, default: `now()`)
- **Contrainte unique** : `UNIQUE(organization_id, user_id)`

#### 5. `REF_SPECIALTIES`
- `id` (UUID, PK)
- `parent_id` (UUID NULL, FK `REF_SPECIALTIES.id`, ON DELETE SET NULL)
- `code` (VARCHAR(50), UNIQUE, NOT NULL)
- `title_fr` (VARCHAR(150), NOT NULL)
- `title_ar` (VARCHAR(150), NOT NULL)
- `title_en` (VARCHAR(150), NOT NULL)
- `description` (TEXT NULL)
- `is_active` (BOOLEAN, default: true)

#### 6. `REF_SKILLS`
- `id` (UUID, PK)
- `category` (VARCHAR(50), NOT NULL) : `'TEST_PSYCHOMETRIQUE'`, `'METHODE_EDUCATIVE'`, `'PRISE_EN_CHARGE'`, `'OUTIL_EVALUATION'`, `'COMMUNICATION'`
- `parent_id` (UUID NULL, FK `REF_SKILLS.id`, ON DELETE SET NULL)
- `code` (VARCHAR(50), UNIQUE, NOT NULL)
- `title_fr` (VARCHAR(150), NOT NULL)
- `title_ar` (VARCHAR(150), NOT NULL)
- `title_en` (VARCHAR(150), NOT NULL)
- `is_verified_eligible` (BOOLEAN, default: true)

#### 7. `CANDIDATE_EDUCATION`
- `id` (UUID, PK)
- `candidate_id` (UUID, FK `CANDIDATE_PROFILES.id`, NOT NULL, ON DELETE CASCADE)
- `degree_level` (VARCHAR(30), NOT NULL) : `'BAC_3'`, `'BAC_5_MASTER'`, `'BAC_8_DOCTORAT'`, `'DIPLOME_ETAT'`, `'DU_SPECIALISE'`
- `degree_title` (VARCHAR(200), NOT NULL)
- `institution_name` (VARCHAR(200), NOT NULL)
- `specialty_id` (UUID, FK `REF_SPECIALTIES.id`, NOT NULL, ON DELETE RESTRICT)
- `start_year` (INT, NOT NULL)
- `end_year` (INT NULL)
- `is_currently_enrolled` (BOOLEAN, default: false)
- `is_diploma_verified` (BOOLEAN, default: false)
- `diploma_document_path` (VARCHAR(500) NULL)

#### 8. `CANDIDATE_EXPERIENCE`
- `id` (UUID, PK)
- `candidate_id` (UUID, FK `CANDIDATE_PROFILES.id`, NOT NULL, ON DELETE CASCADE)
- `experience_type` (VARCHAR(30), NOT NULL) : `'STAGE_OBSERVATION'`, `'STAGE_PFE'`, `'STAGE_CLINIQUE'`, `'EMPLOI_SALARIE'`, `'VOLONTARIAT'`
- `organization_name` (VARCHAR(200), NOT NULL)
- `position_title` (VARCHAR(200), NOT NULL)
- `target_audience` (VARCHAR(50) NULL) : `'ENFANTS_TSA'`, `'TROUBLES_APPRENTISSAGES'`, `'ADOLESCENTS'`, `'POLYHANDICAP'`
- `start_date` (DATE, NOT NULL)
- `end_date` (DATE NULL)
- `is_current` (BOOLEAN, default: false)
- `total_months` (INT, NOT NULL)
- `description` (TEXT NULL)

#### 9. `CANDIDATE_SKILLS`
- `id` (UUID, PK)
- `candidate_id` (UUID, FK `CANDIDATE_PROFILES.id`, NOT NULL, ON DELETE CASCADE)
- `skill_id` (UUID, FK `REF_SKILLS.id`, NOT NULL, ON DELETE RESTRICT)
- `level` (VARCHAR(30), NOT NULL) : `'NOTIONS'`, `'PRATIQUANT'`, `'AUTONOME'`, `'EXPERT'`
- `is_verified` (BOOLEAN, default: false)
- `verification_source` (VARCHAR(100) NULL)
- **Contrainte unique** : `UNIQUE(candidate_id, skill_id)`

#### 10. `CANDIDATE_LANGUAGES`
- `id` (UUID, PK)
- `candidate_id` (UUID, FK `CANDIDATE_PROFILES.id`, NOT NULL, ON DELETE CASCADE)
- `language_code` (VARCHAR(20), NOT NULL) : `'AR_STANDARD'`, `'AR_DARIJA'`, `'FR'`, `'EN'`
- `proficiency_level` (VARCHAR(30), NOT NULL) : `'NOTIONS'`, `'INTERMEDIAIRE'`, `'COURANT_PROFESSIONNEL'`, `'LANGUE_MATERNELLE'`
- **Contrainte unique** : `UNIQUE(candidate_id, language_code)`

#### 11. `CANDIDATE_CERTIFICATIONS`
- `id` (UUID, PK)
- `candidate_id` (UUID, FK `CANDIDATE_PROFILES.id`, NOT NULL, ON DELETE CASCADE)
- `title` (VARCHAR(200), NOT NULL)
- `issuing_organization` (VARCHAR(200), NOT NULL)
- `issue_date` (DATE, NOT NULL)
- `credential_id` (VARCHAR(100) NULL)
- `document_path` (VARCHAR(500) NULL)
- `is_verified` (BOOLEAN, default: false)

#### 12. `JOB_OFFERS`
- `id` (UUID, PK)
- `organization_id` (UUID, FK `ORGANIZATIONS.id`, NOT NULL, ON DELETE CASCADE)
- `author_member_id` (UUID, FK `ORGANIZATION_MEMBERS.id`, NOT NULL, ON DELETE RESTRICT)
- `title` (VARCHAR(255), NOT NULL)
- `offer_type` (VARCHAR(30), NOT NULL, INDEX) : `'STAGE_OBSERVATION'`, `'STAGE_PFE'`, `'EMPLOI'`
- `contract_sub_type` (VARCHAR(30), NOT NULL) : `'CONVENTION_STAGE'`, `'CDD'`, `'CDI'`, `'VACATION'`
- `required_degree_level` (VARCHAR(30), NOT NULL) : `'BAC_3'`, `'BAC_5_MASTER'`, `'BAC_8_DOCTORAT'`, `'DIPLOME_ETAT'`
- `target_specialty_id` (UUID, FK `REF_SPECIALTIES.id`, NOT NULL, ON DELETE RESTRICT)
- `region_code` (VARCHAR(10), NOT NULL, INDEX)
- `city_name` (VARCHAR(100), NOT NULL, INDEX)
- `min_experience_months` (INT, default: 0)
- `is_experience_mandatory` (BOOLEAN, default: false)
- `start_date` (DATE, NOT NULL)
- `duration_months` (INT NULL)
- `remuneration_stipend` (VARCHAR(100) NULL)
- `description` (TEXT, NOT NULL)
- `status` (VARCHAR(30), default: `'DRAFT'`) : `'DRAFT'`, `'PUBLISHED'`, `'PAUSED'`, `'CLOSED'`, `'ARCHIVED'`
- `published_at` (TIMESTAMP NULL)
- `closed_at` (TIMESTAMP NULL)
- `created_at`, `updated_at`

#### 13. `JOB_REQUIRED_SKILLS`
- `id` (UUID, PK)
- `job_offer_id` (UUID, FK `JOB_OFFERS.id`, NOT NULL, ON DELETE CASCADE)
- `skill_id` (UUID, FK `REF_SKILLS.id`, NOT NULL, ON DELETE RESTRICT)
- `is_mandatory` (BOOLEAN, default: false) : `true` = obligatoire, `false` = souhaitable
- `min_required_level` (VARCHAR(30), NOT NULL) : `'NOTIONS'`, `'PRATIQUANT'`, `'AUTONOME'`, `'EXPERT'`
- `weight` (INT, default: 1) : 1 à 3
- **Contrainte unique** : `UNIQUE(job_offer_id, skill_id)`

#### 14. `JOB_REQUIRED_LANGUAGES`
- `id` (UUID, PK)
- `job_offer_id` (UUID, FK `JOB_OFFERS.id`, NOT NULL, ON DELETE CASCADE)
- `language_code` (VARCHAR(20), NOT NULL) : `'AR_STANDARD'`, `'AR_DARIJA'`, `'FR'`, `'EN'`
- `min_proficiency_level` (VARCHAR(30), NOT NULL) : `'NOTIONS'`, `'INTERMEDIAIRE'`, `'COURANT_PROFESSIONNEL'`, `'LANGUE_MATERNELLE'`
- `is_mandatory` (BOOLEAN, default: true)
- **Contrainte unique** : `UNIQUE(job_offer_id, language_code)`

#### 15. `APPLICATIONS`
- `id` (UUID, PK)
- `job_offer_id` (UUID, FK `JOB_OFFERS.id`, NOT NULL, ON DELETE CASCADE)
- `candidate_id` (UUID, FK `CANDIDATE_PROFILES.id`, NOT NULL, ON DELETE RESTRICT) : Protégé par soft-delete
- `origin` (VARCHAR(30), NOT NULL) : `'DIRECT_APPLY'`, `'CENTER_INVITATION'`
- `current_status` (VARCHAR(40), NOT NULL, INDEX) :
  `'INVITED'`, `'INVITATION_DECLINED'`, `'INVITATION_EXPIRED'`, `'SUBMITTED'`, `'REVIEWING'`, `'INTERVIEW_PROPOSED'`, `'INTERVIEW_CONFIRMED'`, `'INTERVIEW_RESCHEDULE_REQUESTED'`, `'OFFER_EXTENDED'`, `'HIRED'`, `'REJECTED'`, `'WITHDRAWN'`
- `initial_match_score` (DECIMAL(5,2) NULL)
- `invitation_sent_at` (TIMESTAMP NULL)
- `invitation_expires_at` (TIMESTAMP NULL)
- `interview_date` (TIMESTAMP NULL)
- `interview_mode` (VARCHAR(30) NULL) : `'IN_PERSON'`, `'VIDEO_CALL'`
- `interview_location_or_link` (TEXT NULL)
- `interview_reschedule_count` (INT, default: 0)
- `hiring_offer_details` (TEXT NULL)
- `hiring_offer_deadline` (TIMESTAMP NULL)
- `created_at`, `updated_at`
- **Contrainte unique** : `UNIQUE(job_offer_id, candidate_id)`

#### 16. `APPLICATION_HISTORY`
- `id` (UUID, PK)
- `application_id` (UUID, FK `APPLICATIONS.id`, NOT NULL, ON DELETE CASCADE)
- `from_status` (VARCHAR(40) NULL)
- `to_status` (VARCHAR(40), NOT NULL)
- `changed_by_user_id` (UUID, FK `USERS.id`, NOT NULL, ON DELETE RESTRICT)
- `comment` (TEXT NULL)
- `created_at` (TIMESTAMP, default: `now()`)

#### 17. `MATCHING_CONFIG`
- `id` (UUID, PK)
- `offer_type` (VARCHAR(30), UNIQUE, NOT NULL) : `'STAGE_OBSERVATION'`, `'STAGE_PFE'`, `'EMPLOI'`
- `weight_formation` (DECIMAL(4,2), NOT NULL)
- `weight_skills` (DECIMAL(4,2), NOT NULL)
- `weight_experience` (DECIMAL(4,2), NOT NULL)
- `weight_location` (DECIMAL(4,2), NOT NULL)
- `weight_languages` (DECIMAL(4,2), NOT NULL)
- `weight_availability` (DECIMAL(4,2), NOT NULL)
- `algo_version` (VARCHAR(20), NOT NULL)
- `is_active` (BOOLEAN, default: true)
- `updated_at` (TIMESTAMP, default: `now()`)

#### 18. `MATCH_RESULTS`
- `id` (UUID, PK)
- `job_offer_id` (UUID, FK `JOB_OFFERS.id`, NOT NULL, ON DELETE CASCADE)
- `candidate_id` (UUID, FK `CANDIDATE_PROFILES.id`, NOT NULL, ON DELETE CASCADE)
- `total_score` (DECIMAL(5,2), NOT NULL, INDEX)
- `score_formation` (DECIMAL(5,2), NOT NULL)
- `score_skills` (DECIMAL(5,2), NOT NULL)
- `score_experience` (DECIMAL(5,2), NOT NULL)
- `score_location` (DECIMAL(5,2), NOT NULL)
- `score_languages` (DECIMAL(5,2), NOT NULL)
- `score_availability` (DECIMAL(5,2), NOT NULL)
- `explanations` (JSONB, NOT NULL)
- `mandatory_criteria_satisfied` (BOOLEAN, NOT NULL)
- `algo_version` (VARCHAR(20), NOT NULL)
- `calculated_at` (TIMESTAMP, default: `now()`)
- **Contrainte unique** : `UNIQUE(job_offer_id, candidate_id)`

#### 19. `SAVED_OFFERS`
- `id` (UUID, PK)
- `candidate_id` (UUID, FK `CANDIDATE_PROFILES.id`, NOT NULL, ON DELETE CASCADE)
- `job_offer_id` (UUID, FK `JOB_OFFERS.id`, NOT NULL, ON DELETE CASCADE)
- `created_at` (TIMESTAMP, default: `now()`)
- **Contrainte unique** : `UNIQUE(candidate_id, job_offer_id)`

#### 20. `NOTIFICATIONS`
- `id` (UUID, PK)
- `user_id` (UUID, FK `USERS.id`, NOT NULL, ON DELETE CASCADE, INDEX)
- `type` (VARCHAR(50), NOT NULL) : `'NEW_INVITATION'`, `'INVITATION_EXPIRED'`, `'STATUS_CHANGED'`, `'INTERVIEW_PROPOSED'`, `'INTERVIEW_CONFIRMED'`, `'INTERVIEW_RESCHEDULE'`, `'OFFER_EXTENDED'`
- `title` (VARCHAR(255), NOT NULL)
- `message` (TEXT, NOT NULL)
- `link_url` (VARCHAR(255) NULL)
- `is_read` (BOOLEAN, default: false, INDEX)
- `created_at` (TIMESTAMP, default: `now()`)

#### 21. `CONSENTS`
- `id` (UUID, PK)
- `user_id` (UUID, FK `USERS.id`, NOT NULL, ON DELETE CASCADE)
- `consent_type` (VARCHAR(50), NOT NULL) : `'TERMS_OF_SERVICE'`, `'PRIVACY_POLICY'`, `'TALENT_POOL_MATCHING'`
- `version` (VARCHAR(20), NOT NULL)
- `has_consented` (BOOLEAN, NOT NULL)
- `ip_address` (VARCHAR(45), NOT NULL)
- `user_agent` (TEXT, NOT NULL)
- `consented_at` (TIMESTAMP, default: `now()`)

#### 22. `AUDIT_LOGS`
- `id` (UUID, PK)
- `user_id` (UUID NULL, FK `USERS.id`, ON DELETE SET NULL)
- `action` (VARCHAR(100), NOT NULL) : `'CV_DOWNLOAD'`, `'PROFILE_UNMASK'`, `'OFFER_PUBLISH'`, `'INVITATION_SENT'`, `'APPLICATION_STATUS_UPDATE'`
- `entity_type` (VARCHAR(50), NOT NULL)
- `entity_id` (UUID, NOT NULL)
- `details` (JSONB NULL)
- `ip_address` (VARCHAR(45), NOT NULL)
- `created_at` (TIMESTAMP, default: `now()`)

#### 23. `REPORTS`
- `id` (UUID, PK)
- `reporter_user_id` (UUID, FK `USERS.id`, NOT NULL, ON DELETE RESTRICT)
- `target_type` (VARCHAR(30), NOT NULL) : `'JOB_OFFER'`, `'ORGANIZATION'`
- `target_id` (UUID, NOT NULL)
- `reason` (VARCHAR(50), NOT NULL) : `'SUSPICIOUS_OFFER'`, `'DISCRIMINATORY_CONTENT'`, `'MEDICAL_DATA_REQUEST'`, `'ABUSIVE_BEHAVIOR'`
- `description` (TEXT, NOT NULL)
- `status` (VARCHAR(30), default: `'PENDING'`) : `'PENDING'`, `'INVESTIGATING'`, `'RESOLVED'`, `'DISMISSED'`
- `created_at`, `updated_at`

---

## 4. Gouvernance des Accès & Matrice RBAC Harmonisante

### 4.1 Dissociation stricte des deux niveaux de rôles
Pour éliminer toute ambiguïté dans le code NestJS et la base :
1. **`GlobalRole` (Niveau Utilisateur Système)** : Rôle d'identité unique dans `USERS.global_role`.
   - `CANDIDATE` : Compte étudiant, diplômé ou praticien individuel. Ne peut pas être membre d'une organisation.
   - `ORGANIZATION_USER` : Utilisateur professionnel appartenant à une ou plusieurs structures d'accueil.
   - `SYSTEM_ADMIN` : Administrateur interne de la plateforme PsyRekrute (supervision, vérification légale, référentiels).
2. **`OrgMemberRole` (Niveau Membre d'Organisation)** : Rôle contextuel dans `ORGANIZATION_MEMBERS.role`, actif uniquement au sein d'une organisation donnée :
   - `OWNER` : Propriétaire légal de la structure. Droits totaux, suppression/fermeture de l'organisation, nomination des `ADMIN`.
   - `ADMIN` : Administrateur de la structure. Gestion des membres, publication d'offres, gestion globale du recrutement.
   - `RECRUITER` : Opérationnel recrutement. Publication d'offres, accès au vivier, envoi d'invitations, planification d'entretiens.
   - `VIEWER` : Consultation en lecture seule des offres et des candidatures (aucun droit d'écriture ni d'invitation).

### 4.2 Matrice Exhaustive des Permissions

| Ressource / Action | `CANDIDATE` | `ORG: VIEWER` | `ORG: RECRUITER` | `ORG: ADMIN` | `ORG: OWNER` | `SYSTEM_ADMIN` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Gérer son profil / déposer CV | **Propriétaire** | Interdit | Interdit | Interdit | Interdit | Lecture Support |
| Consulter les offres publiées | **Lecture** | **Lecture** | **Lecture** | **Lecture** | **Lecture** | **Lecture** |
| Créer / Modifier une offre | Interdit | Interdit | **Écriture** | **Écriture** | **Écriture** | Modération |
| Supprimer / Archiver une offre | Interdit | Interdit | Interdit | **Action** | **Action** | **Action** |
| Explorer le vivier de talents | Interdit | **Lecture** | **Lecture** | **Lecture** | **Lecture** | **Lecture** |
| Inviter un candidat du vivier | Interdit | Interdit | **Action** | **Action** | **Action** | Interdit |
| Postuler directement à une offre | **Action** | Interdit | Interdit | Interdit | Interdit | Interdit |
| Planifier / Confirmer entretien | Réponse | Interdit | **Action** | **Action** | **Action** | Interdit |
| Télécharger CV candidat (URL signée) | **Son CV** | Interdit | **Si candidat actif** | **Si candidat actif** | **Si candidat actif** | Audit |
| Gérer les membres de l'organisation | Interdit | Interdit | Interdit | Inviter / Révoquer | Tous droits | Interdit |
| Valider structure (Vérification ICE) | Interdit | Interdit | Interdit | Interdit | Interdit | **Action exclusive** |
| Gérer les référentiels métiers | Interdit | Interdit | Interdit | Interdit | Interdit | **Action exclusive** |
| Consulter les logs d'audit | Interdit | Interdit | Interdit | Interdit | Interdit | **Action exclusive** |

---

## 5. Spécification Mathématique Intégrale du Moteur de Matching

### 5.1 Architecture Mathématique et Formule Globale
Le score global $S_{total} \in [0, 100]$ est une combinaison linéaire pondérée de 6 sous-scores normés sur l'intervalle $[0, 100]$ :

$$S_{total} = \frac{W_{form} \cdot S_{form} + W_{skills} \cdot S_{skills} + W_{exp} \cdot S_{exp} + W_{loc} \cdot S_{loc} + W_{lang} \cdot S_{lang} + W_{avail} \cdot S_{avail}}{\sum W_i}$$

Avec $\sum W_i = 1.00$ ($100\%$).

#### Configurations des Pondérations par Type d'Offre (`MATCHING_CONFIG`) :
| Type d'Offre | $W_{form}$ | $W_{skills}$ | $W_{exp}$ | $W_{loc}$ | $W_{lang}$ | $W_{avail}$ | Somme |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`STAGE_OBSERVATION`** | **0.35** | **0.15** | **0.05** | **0.25** | **0.10** | **0.10** | **1.00** |
| **`STAGE_PFE`** | **0.30** | **0.25** | **0.15** | **0.15** | **0.10** | **0.05** | **1.00** |
| **`EMPLOI`** *(CDI/CDD/Vacation)* | **0.20** | **0.30** | **0.25** | **0.10** | **0.10** | **0.05** | **1.00** |

---

### 5.2 Spécification des 6 Dimensions Mathématiques

#### 1. Score Formation & Spécialité ($S_{form}$)
- **Données requises** : `CANDIDATE_EDUCATION` (`degree_level`, `specialty_id`, `is_currently_enrolled`), `JOB_OFFERS` (`required_degree_level`, `target_specialty_id`).
- **Échelle des niveaux** : Bac+3 ($V=1$), Bac+5 / Master ($V=2$), Doctorat / Diplôme État ($V=3$).
- **Calcul du niveau** :
  - Si $V_{cand} \ge V_{offre}$ : $Score_{niveau} = 100$.
  - Si $V_{cand} = V_{offre} - 1$ et étudiant en cours d'année diplômante : $Score_{niveau} = 85$.
  - Si $V_{cand} < V_{offre} - 1$ : $Score_{niveau} = 40$.
- **Calcul de la spécialité (Arbre taxonomique `REF_SPECIALTIES`)** :
  - Même spécialité (`specialty_id` identique) : $\sigma_{spec} = 1.00$.
  - Spécialité sœur (même `parent_id`) : $\sigma_{spec} = 0.75$.
  - Spécialité cousine (même grand-parent) : $\sigma_{spec} = 0.50$.
  - Autre spécialité du domaine : $\sigma_{spec} = 0.25$.
- **Formule exacte** :
  $$S_{form} = Score_{niveau} \times \sigma_{spec}$$
- **Données manquantes** : Si aucune formation n'est renseignée, $S_{form} = 0$ et `mandatory_criteria_satisfied = false`.

---

#### 2. Score Compétences Techniques ($S_{skills}$)
- **Données requises** : `CANDIDATE_SKILLS` (`level`, `is_verified`), `JOB_REQUIRED_SKILLS` (`is_mandatory`, `min_required_level`, `weight`).
- **Niveaux de compétence** : `NOTIONS` ($L=1$), `PRATIQUANT` ($L=2$), `AUTONOME` ($L=3$), `EXPERT` ($L=4$).
- **Évaluation unitaire d'une compétence $k$** :
  - Si le candidat ne possède pas la compétence $k$ :
    - Si une compétence connexe existe dans `REF_SKILLS` (même `parent_id`), elle est prise en compte avec un abattement de $50\%$ de son niveau.
    - Sinon, $L_{cand} = 0$.
  - Si $L_{cand} \ge L_{req}$ : $Score_{base}(k) = 100$.
  - Si $L_{cand} < L_{req}$ : $Score_{base}(k) = \frac{L_{cand}}{L_{req}} \times 100$.
  - **Règle mathématique du bonus de vérification (sans jamais dépasser 100%)** :
    $$Score_{unitaire}(k) = \min\left(100, Score_{base}(k) \times (1 + \beta)\right)$$
    Avec $\beta = 0.15$ si `is_verified = true`, $\beta = 0$ sinon.
- **Résolution formelle de la contradiction v3.0 (Compétences obligatoires vs souhaitables)** :
  Les compétences obligatoires constituent le socle de base $S_{skills, oblig}$. Les compétences souhaitables apportent un **bonus additif borné** :
  $$S_{skills, oblig} = \frac{\sum_{k \in Oblig} w_k \cdot Score_{unitaire}(k)}{\sum_{k \in Oblig} w_k}$$
  (Si aucune compétence obligatoire n'est définie, $S_{skills, oblig} = 100$).

  $$Bonus_{souhait} = \min\left(15, \frac{\sum_{j \in Souhait} w_j \cdot Score_{unitaire}(j)}{\sum_{j \in Souhait} w_j} \times 0.15\right)$$
  (Si aucune compétence souhaitable n'est définie ou si le candidat n'en possède aucune, $Bonus_{souhait} = 0$. **L'absence de compétence souhaitable n'abaisse jamais le score de base**).

  **Formule exacte** :
  $$S_{skills} = \min\left(100, S_{skills, oblig} + Bonus_{souhait}\right)$$

---

#### 3. Score Expérience & Pratique ($S_{exp}$)
- **Données requises** : `CANDIDATE_EXPERIENCE` (`total_months`, `target_audience`), `JOB_OFFERS` (`min_experience_months`, `is_experience_mandatory`).
- **Formule exacte** :
  - Si $M_{requis} = 0$ (Stage d'observation / Stage sans prérequis) : $S_{exp} = 100$.
  - Si $M_{requis} > 0$ :
    $$Ratio_{exp} = \min\left(100, \frac{M_{cand}}{M_{requis}} \times 100\right)$$
    - Bonus public cible identique (ex: TSA / DYS) : $+10$ points (plafonné à 100).
    $$S_{exp} = \min\left(100, Ratio_{exp} + Bonus_{public}\right)$$
- **Données manquantes** : Si aucune expérience n'est renseignée et $M_{requis} > 0$, $S_{exp} = 0$.

---

#### 4. Score Localisation & Mobilité ($S_{loc}$)
- **Données requises** : `CANDIDATE_PROFILES` (`region_code`, `city_name`, `mobility_radius_km`, `open_to_relocation`), `JOB_OFFERS` (`region_code`, `city_name`).
- **Formule exacte** :
  - Même ville (`city_name` identique) : $S_{loc} = 100$.
  - Villes différentes mais même région (`region_code` identique) :
    - Si mobilité déclarée ($\ge 30$ km ou axe de transport) : $S_{loc} = 85$.
    - Sans mobilité déclarée : $S_{loc} = 65$.
  - Régions différentes :
    - Si `open_to_relocation = true` : $S_{loc} = 75$.
    - Si `open_to_relocation = false` : $S_{loc} = 25$.

---

#### 5. Score Langues Maîtrisées ($S_{lang}$)
- **Données requises** : `CANDIDATE_LANGUAGES`, `JOB_REQUIRED_LANGUAGES`.
- **Niveaux de langue** : `NOTIONS` ($1$), `INTERMEDIAIRE` ($2$), `COURANT_PROFESSIONNEL` ($3$), `LANGUE_MATERNELLE` ($4$).
- **Calcul unitaire** :
  - Si $N_{cand} \ge N_{req}$ : $Score(l) = 100$.
  - Si $N_{cand} < N_{req}$ : $Score(l) = \frac{N_{cand}}{N_{req}} \times 100$.
- **Formule exacte** :
  $$S_{lang} = \frac{1}{|L_{req}|} \sum_{l \in L_{req}} Score(l)$$
- **Données manquantes** : Langue requise absente du profil du candidat $\rightarrow Score(l) = 0$.

---

#### 6. Score Disponibilité & Rythme ($S_{avail}$)
- **Données requises** : `CANDIDATE_PROFILES` (`availability_status`, `available_from`), `JOB_OFFERS` (`start_date`).
- **Formule exacte** :
  - `availability_status = 'IMMEDIATE'` ou $Date_{cand} \le Date_{start}$ : $S_{avail} = 100$.
  - Retard de disponibilité $\Delta d \le 30$ jours :
    $$S_{avail} = 100 - (\Delta d \times 1.5)$$
  - Retard $\Delta d > 30$ jours : $S_{avail} = 40$.
  - Incompatibilité totale de statut : $S_{avail} = 20$.

---

## 6. Trois Exemples Chiffrés Recalculés Pas à Pas (Reproductibles par Tests Unitaires)

> [!NOTE]
> Les trois cas ci-dessous sont calculés strictement selon les formules formelles de la section 5. Ils constituent le jeu de données d'or (golden test vectors) pour la suite de tests unitaires Jest du `MatchingEngine`.

---

### Cas 1 : Stage d'Observation (Profil Étudiant L3)
- **Configuration** : Type `STAGE_OBSERVATION` ($W = [0.35, 0.15, 0.05, 0.25, 0.10, 0.10]$).
- **Offre Fictive #OFF-OBS-01** :
  - Structure : Centre Psycho-Éducatif Al-Amal (Casablanca, `MA-06`).
  - Spécialité : Psychologie de l'Éducation (Bac+3 requis).
  - Expérience requise : 0 mois.
  - Compétences obligatoires : Aucune ($S_{skills, oblig} = 100$).
  - Compétences souhaitables : Notions TSA ($w=1$, niveau requis `NOTIONS`).
  - Langues obligatoires : Darija (`LANGUE_MATERNELLE`), Français (`COURANT_PROFESSIONNEL`).
  - Date début : Immédiat.
- **Candidat Fictif #CAND-OBS-01 (Kenza E.)** :
  - Formation : L3 Psychologie en cours à Casablanca ($V_{cand}=1$, $\sigma_{spec}=1.0$) $\rightarrow S_{form} = 100 \times 1.0 = 100$.
  - Compétences : Notions TSA déclarées ($L_{cand}=1, L_{req}=1$) $\rightarrow Score(TSA) = 100$.
    - $S_{skills, oblig} = 100$.
    - $Bonus_{souhait} = \min(15, 100 \times 0.15) = 15$.
    - $S_{skills} = \min(100, 100 + 15) = 100$.
  - Expérience : 0 mois demandé $\rightarrow S_{exp} = 100$.
  - Localisation : Réside à Casablanca (même ville) $\rightarrow S_{loc} = 100$.
  - Langues : Darija (maternelle), Français (courant) $\rightarrow S_{lang} = 100$.
  - Disponibilité : Immédiate $\rightarrow S_{avail} = 100$.

**Calcul arithmétique rigoureux :**
$$S_{total} = (0.35 \times 100) + (0.15 \times 100) + (0.05 \times 100) + (0.25 \times 100) + (0.10 \times 100) + (0.10 \times 100)$$
$$S_{total} = 35.00 + 15.00 + 5.00 + 25.00 + 10.00 + 10.00 = \mathbf{100.00\%}$$

---

### Cas 2 : Stage de Fin d'Études PFE (Profil Étudiant Master 2)
- **Configuration** : Type `STAGE_PFE` ($W = [0.30, 0.25, 0.15, 0.15, 0.10, 0.05]$).
- **Offre Fictive #OFF-PFE-02** :
  - Structure : Institut Médico-Éducatif Al-Inara (Rabat, `MA-04`).
  - Spécialité : Neuropsychologie Infantile (Bac+5 / Master requis).
  - Expérience requise : 2 mois de stage préalable ($M_{requis} = 2$).
  - Compétences obligatoires : WISC-V ($w=2$, niveau requis `AUTONOME` / $L=3$).
  - Compétences souhaitables : Méthode PECS ($w=1$, niveau requis `PRATIQUANT` / $L=2$).
  - Langues obligatoires : Darija (`COURANT_PROFESSIONNEL`), Français (`COURANT_PROFESSIONNEL`).
  - Date début : 01 Février.
- **Candidat Fictif #CAND-PFE-02 (Youssef M.)** :
  - Formation : Master 2 Neuropsychologie en cours ($Score_{niveau}=85$, $\sigma_{spec}=1.0$) $\rightarrow S_{form} = 85 \times 1.0 = 85.00$.
  - Compétences :
    - WISC-V : Niveau `AUTONOME` ($L=3$), **vérifié par attestation** ($\beta = 0.15$).
      $$Score(WISC) = \min(100, 100 \times 1.15) = 100$$
      $S_{skills, oblig} = 100$.
    - PECS : Non renseigné ($L=0$) $\rightarrow Score(PECS) = 0$.
      $Bonus_{souhait} = \min(15, 0 \times 0.15) = 0$.
      *(Règle corrigée : L'absence de PECS n'abaisse pas la note obligatoire)*.
      $$S_{skills} = \min(100, 100 + 0) = 100.00$$
  - Expérience : 3 mois de stage antérieur ($M_{cand}=3 \ge 2$) $\rightarrow S_{exp} = 100.00$.
  - Localisation : Réside à Kénitra (même région `MA-04`, mobilité active déclarée) $\rightarrow S_{loc} = 85.00$.
  - Langues : Darija (maternelle), Français (courant) $\rightarrow S_{lang} = 100.00$.
  - Disponibilité : Disponible au 01 Février (alignement parfait) $\rightarrow S_{avail} = 100.00$.

**Calcul arithmétique rigoureux :**
$$S_{total} = (0.30 \times 85.00) + (0.25 \times 100.00) + (0.15 \times 100.00) + (0.15 \times 85.00) + (0.10 \times 100.00) + (0.05 \times 100.00)$$
$$S_{total} = 25.50 + 25.00 + 15.00 + 12.75 + 10.00 + 5.00 = \mathbf{93.25\%}$$

---

### Cas 3 : Emploi Salarié (Profil Professionnel Psycho-Éducateur)
- **Configuration** : Type `EMPLOI` ($W = [0.20, 0.30, 0.25, 0.10, 0.10, 0.05]$).
- **Offre Fictive #OFF-JOB-03** :
  - Structure : Association Rayon d'Espoir (Tanger, `MA-01`).
  - Spécialité : Psycho-éducation (Diplôme d'État Bac+3 requis).
  - Expérience requise : 24 mois auprès d'enfants TSA ($M_{requis} = 24$).
  - Compétences obligatoires : TEACCH ($w=2$, niveau `AUTONOME`), PPI ($w=1$, niveau `AUTONOME`).
  - Compétences souhaitables : ABA ($w=1$, niveau `PRATIQUANT`).
  - Langues obligatoires : Darija (`COURANT_PROFESSIONNEL`), Français (`COURANT_PROFESSIONNEL`).
  - Date début : Immédiat.
- **Candidat Fictif #CAND-JOB-03 (Salma T.)** :
  - Formation : Diplôme d'État Éducatrice Spécialisée ($V_{cand}=1 \ge 1$, spécialité sœur psycho-éducation $\sigma_{spec}=0.75$).
    $$S_{form} = 100 \times 0.75 = 75.00$$
  - Compétences :
    - TEACCH : `EXPERT` ($L=4 \ge 3$), **vérifié** $\rightarrow Score = 100$.
    - PPI : `PRATIQUANT` ($L=2 < 3$, non vérifié) $\rightarrow Score = \frac{2}{3} \times 100 = 66.67$.
    - $S_{skills, oblig} = \frac{(2 \times 100) + (1 \times 66.67)}{3} = \frac{266.67}{3} = 88.89$.
    - ABA : `PRATIQUANT` ($L=2 \ge 2$, non vérifié) $\rightarrow Score(ABA) = 100$.
    - $Bonus_{souhait} = \min(15, 100 \times 0.15) = 15.00$.
    - $S_{skills} = \min(100, 88.89 + 15.00) = \mathbf{100.00}$ *(plafonné à 100)*.
  - Expérience : 14 mois déclarés avec public TSA ($M_{cand}=14$).
    $$Ratio_{exp} = \frac{14}{24} \times 100 = 58.33$$
    Bonus public TSA : $+10$ points $\rightarrow S_{exp} = 58.33 + 10.00 = 68.33$.
  - Localisation : Réside à Fès (`MA-03`), prête à déménager à Tanger (`MA-01`) $\rightarrow S_{loc} = 75.00$.
  - Langues : Darija et Français maîtrisés $\rightarrow S_{lang} = 100.00$.
  - Disponibilité : Préavis d'un mois ($\Delta d = 30$ jours) :
    $$S_{avail} = 100 - (30 \times 1.5) = 55.00$$

**Calcul arithmétique rigoureux :**
$$S_{total} = (0.20 \times 75.00) + (0.30 \times 100.00) + (0.25 \times 68.33) + (0.10 \times 75.00) + (0.10 \times 100.00) + (0.05 \times 55.00)$$
$$S_{total} = 15.00 + 30.00 + 17.08 + 7.50 + 10.00 + 2.75 = \mathbf{82.33\%}$$

---

## 7. Parcours de Recrutement & Machine à États Finis (FSM) Complète

### 7.1 Matrice Exhaustive des États et Transitions Autorisées

```mermaid
stateDiagram-v2
    [*] --> INVITED : Structure invite un candidat du vivier
    [*] --> SUBMITTED : Candidat postule directement

    INVITED --> INVITATION_DECLINED : Candidat refuse
    INVITED --> INVITATION_EXPIRED : Système (après 14 jours)
    INVITED --> SUBMITTED : Candidat accepte l'invitation

    SUBMITTED --> REVIEWING : Structure examine la candidature
    SUBMITTED --> REJECTED : Structure refuse
    SUBMITTED --> WITHDRAWN : Candidat retire sa candidature

    REVIEWING --> INTERVIEW_PROPOSED : Structure propose un créneau
    REVIEWING --> REJECTED : Structure refuse
    REVIEWING --> WITHDRAWN : Candidat retire sa candidature

    INTERVIEW_PROPOSED --> INTERVIEW_CONFIRMED : Candidat accepte la date
    INTERVIEW_PROPOSED --> INTERVIEW_RESCHEDULE_REQUESTED : Candidat demande report (max 2)
    INTERVIEW_PROPOSED --> WITHDRAWN : Candidat retire sa candidature
    INTERVIEW_RESCHEDULE_REQUESTED --> INTERVIEW_PROPOSED : Structure repropose une date
    INTERVIEW_RESCHEDULE_REQUESTED --> REJECTED : Structure décline le report

    INTERVIEW_CONFIRMED --> OFFER_EXTENDED : Structure propose le poste
    INTERVIEW_CONFIRMED --> REJECTED : Structure non convaincue
    INTERVIEW_CONFIRMED --> WITHDRAWN : Candidat renonce

    OFFER_EXTENDED --> HIRED : Candidat accepte l'offre
    OFFER_EXTENDED --> WITHDRAWN : Candidat refuse l'offre finale
    OFFER_EXTENDED --> REJECTED : Structure annule l'offre

    REJECTED --> [*]
    HIRED --> [*]
    WITHDRAWN --> [*]
    INVITATION_DECLINED --> [*]
    INVITATION_EXPIRED --> [*]
```

### 7.2 Règles d'Arbitrage et Cas Particuliers

| Transition | Acteur Autorisé | Conditions et Prérequis Métier | Action Système & Notifications |
| :--- | :---: | :--- | :--- |
| `[*] -> INVITED` | Membre Org (`RECRUITER`, `ADMIN`, `OWNER`) | Offre à l'état `PUBLISHED`. Candidat actif dans le vivier. Aucune invitation active. | Crée `APPLICATIONS`, fixe `invitation_expires_at = now() + 14d`. Notifie le candidat. |
| `INVITED -> INVITATION_EXPIRED` | **`SYSTEM` (Tâche CRON)** | `now() > invitation_expires_at` et statut toujours `INVITED`. | Clôture l'invitation. Notifie le candidat et le recruteur. |
| `INVITED -> INVITATION_DECLINED` | `CANDIDATE` | Le candidat décline l'invitation reçue. | Notifie le recruteur. **Règle anti-spam : réinvitation interdite pour la même offre pendant 30 jours**. |
| `INVITED -> SUBMITTED` | `CANDIDATE` | Le candidat accepte l'invitation. | **Débloque l'identité et le CV pour cette organisation**. Notifie le recruteur. |
| `[*] -> SUBMITTED` | `CANDIDATE` | Candidature directe sur offre `PUBLISHED`. | Crée la candidature avec score de matching instantané. |
| `REVIEWING -> INTERVIEW_PROPOSED` | Membre Org (`RECRUITER`, `ADMIN`) | Dossier validé. Créneau d'entretien renseigné dans le futur. | Notifie le candidat (date, mode présentiel/visio, lien). |
| `INTERVIEW_PROPOSED -> INTERVIEW_RESCHEDULE` | `CANDIDATE` | Motif fourni. Compteur `interview_reschedule_count < 2`. | Incrémente le compteur. Notifie le recruteur. Si compteur $= 2$, blocage de nouveau report. |
| `INTERVIEW_CONFIRMED -> OFFER_EXTENDED` | Membre Org (`RECRUITER`, `ADMIN`) | Entretien réalisé. Conditions de stage/embauche et date limite renseignées. | Notifie le candidat avec date limite de décision (délai par défaut : 7 jours). |
| `OFFER_EXTENDED -> HIRED` | `CANDIDATE` | Acceptation formelle avant la date limite. | Marque le recrutement comme finalisé. Met à jour les statistiques de l'organisation. |
| `* -> WITHDRAWN` | `CANDIDATE` | Possible à tout moment avant `HIRED`. | Clôture le dossier candidat pour cette offre. |
| `* -> REJECTED` | Membre Org (`RECRUITER`, `ADMIN`) | Justification interne enregistrée dans l'historique. | Notifie poliment le candidat. |

### 7.3 Règle de Conservation de l'Historique (Immuabilité)
Toutes les transitions insèrent systématiquement une ligne dans `APPLICATION_HISTORY`. Même si le candidat supprime son compte ultérieurement, la ligne `APPLICATIONS` est préservée en mode soft-delete (`candidate_id` pseudonymisé, profil anonymisé) afin que les recruteurs conservent l'intégrité de leur tableau de bord d'activité RH.

---

## 8. Sécurité, Confidentialité, Gestion des Fichiers & Conformité Loi 09-08 / CNDP

### 8.1 Cycle de Vie des Jetons d'Authentification (Tokens)
- **Access Token JWT** :
  - Durée de vie : **15 minutes**.
  - Payload minimaliste et sécurisé : `{ sub: userId, email: string, global_role: string, org_id?: string, org_role?: string }`.
  - Signé avec l'algorithme asymétrique `RS256` (ou `HS256` en local avec clé secrète de 256 bits minimum).
- **Refresh Token (Rotation & Révocation)** :
  - Durée de vie : **7 jours**.
  - Stocké exclusivement dans un cookie HTTP `Set-Cookie` avec les attributs : `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`.
  - Haché cryptographiquement en base (`SHA-256`) dans la session utilisateur.
  - **Refresh Token Rotation (RTR)** : À chaque renouvellement, l'ancien Refresh Token est immédiatement invalidé et remplacé par un nouveau. Toute tentative de réutilisation d'un ancien token déclenche la révocation immédiate de toutes les sessions actives du compte (détection de vol de session).

### 8.2 Sécurisation du Stockage Documentaire (CVs et Diplômes)
1. **Compartiment Object Storage (MinIO / S3) hermétique** :
   - Le bucket est strictement privé : tout accès public anonyme (`s3:GetObject` public) est interdit et désactivé par politique d'accès (Bucket Policy).
2. **Distribution via URLs Pré-signées Temporaires (Presigned URLs)** :
   - Les documents ne transitent pas par le serveur applicatif sous forme de flux lourd, mais via des URLs pré-signées cryptographiquement valables **strictement 15 minutes**.
   - La génération d'une URL de téléchargement (`Presigned GET`) est conditionnée à une vérification RBAC stricte :
     - Seul le candidat propriétaire OU une organisation disposant d'une candidature active (`current_status != 'INVITED'`) ou d'une invitation acceptée peut obtenir l'URL.
3. **Protection contre les Fichiers Malveillants (Upload Security)** :
   - **Validation par Magic Bytes** : Le backend inspecte les premiers octets du fichier binaire pour vérifier la signature réelle `%PDF-` (`0x25 0x50 0x44 0x46`), rejetant les faux exécutables renommés `.pdf`.
   - **Taille maximale autorisée** : 5 Mo par document.
   - **Nommage cryptographique sécurisé** : Les fichiers ne conservent jamais leur nom d'origine. Ils sont stockés sous l'arborescence :
     `candidates/{candidateId}/cv/{randomUUID}.pdf`.

### 8.3 Chiffrement des Données
- **En transit** : Protocole **TLS 1.3** obligatoire sur toutes les communications HTTP.
- **Au repos** : Chiffrement **AES-256** activé au niveau du stockage S3 (Server-Side Encryption SSE-S3) et chiffrement LUKS des volumes de base de données.

### 8.4 Journalisation des Accès Sensibles (`AUDIT_LOGS`)
Toute action accédant à des informations confidentielles génère un log d'audit immuable :
- Téléchargement d'un CV ou d'un diplôme (`CV_DOWNLOAD`).
- Déblocage des coordonnées d'un profil anonymisé suite à acceptation (`PROFILE_UNMASK`).
- Consultation de pièces d'identité / ICE d'une organisation (`ORG_VERIFICATION_VIEW`).
Chaque enregistrement comprend l'horodatage précis UTC, l'identifiant de l'auteur, l'adresse IP et le User-Agent.

### 8.5 Cadrage Juridique Rigoureux : Loi marocaine n° 09-08 & CNDP
> [!WARNING]
> **Clarification réglementaire indispensable :**
> - La durée de conservation de **24 mois d'inactivité** pour les profils candidats est un **choix d'organisation interne d'entreprise** (aligné sur les cycles universitaires marocains de 2 années académiques), et **non une prescription légale directe** de la Loi 09-08.
> - La conformité légale ne saurait être considérée comme acquise d'office du simple fait d'un hébergement technique sur le territoire marocain.

#### Démarches formelles nécessitant une validation juridique auprès de la CNDP :
1. **Dépôt formel préalable du dossier de déclaration de traitement RH** auprès de la CNDP avant tout déploiement commercial ou public.
2. **Autorisation de transfert de données à l'étranger** : Nécessaire si les services d'envoi d'e-mails transactionnels (ex: Brevo, Resend) ou d'hébergement utilisent des serveurs localisés hors du Maroc.
3. **Distinction contractuelle tripartite** :
   - *Conditions Générales d'Utilisation (CGU)* : Encadrement des règles d'usage de la plateforme.
   - *Politique de Confidentialité* : Information claire sur les finalités, destinataires et durées de traitement.
   - *Consentements spécifiques (Opt-in)* : Case à cocher distincte et non pré-cochée pour l'intégration au vivier de mise en relation et l'exécution du matching automatisé.

---

## 9. Contrats d'API REST Détaillés

Tous les endpoints respectent les standards REST, avec validation stricte des DTOs via `class-validator`, réponses au format JSON uniforme et pagination systématique sur les collections (`page`, `limit`, `total`, `totalPages`).

### 9.1 `POST /api/v1/auth/register`
- **Rôle requis** : Public.
- **Corps de la requête (`RegisterUserDto`)** :
```json
{
  "email": "kenza.etudiante@example.ma",
  "password": "Password123!Secure",
  "globalRole": "CANDIDATE",
  "preferredLocale": "fr",
  "termsAccepted": true
}
```
- **Règles de validation** : `email` valide et unique, `password` $\ge 8$ caractères avec majuscule, chiffre et caractère spécial, `termsAccepted = true`.
- **Réponse (`201 Created`)** :
```json
{
  "statusCode": 201,
  "message": "User registered successfully",
  "data": {
    "userId": "d3b07384-d113-4944-9c88-c7a5223cb234",
    "email": "kenza.etudiante@example.ma",
    "globalRole": "CANDIDATE",
    "preferredLocale": "fr"
  }
}
```
- **Erreurs possibles** : `400 Bad Request` (données invalides), `409 Conflict` (adresse email déjà existante).

---

### 9.2 `POST /api/v1/auth/login`
- **Rôle requis** : Public.
- **Corps de la requête (`LoginDto`)** :
```json
{
  "email": "kenza.etudiante@example.ma",
  "password": "Password123!Secure"
}
```
- **Réponse (`200 OK`)** :
```json
{
  "statusCode": 200,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900,
    "user": {
      "id": "d3b07384-d113-4944-9c88-c7a5223cb234",
      "email": "kenza.etudiante@example.ma",
      "globalRole": "CANDIDATE",
      "preferredLocale": "fr"
    }
  }
}
```
*Note : Le Refresh Token est transmis dans l'en-tête de réponse `Set-Cookie: refreshToken=...; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`.*
- **Erreurs possibles** : `401 Unauthorized` (identifiants incorrects), `403 Forbidden` (compte désactivé).

---

### 9.3 `GET /api/v1/job-offers` (Recherche publique & candidat avec filtres)
- **Rôle requis** : Public ou Authentifié.
- **Paramètres de requête (Query Params)** :
  - `page` (défaut : 1), `limit` (défaut : 10, max : 50).
  - `offerType` : `'STAGE_OBSERVATION'`, `'STAGE_PFE'`, `'EMPLOI'`.
  - `regionCode` : Ex: `'MA-06'`.
  - `specialtyId` : UUID de la spécialité.
  - `search` : Recherche textuelle dans le titre et la description.
- **Réponse (`200 OK`)** :
```json
{
  "statusCode": 200,
  "data": [
    {
      "id": "b78d8a70-8911-4f1a-b6d3-2f887b6a9e10",
      "title": "Stage PFE Neuropsychologie Infantile",
      "offerType": "STAGE_PFE",
      "contractSubType": "CONVENTION_STAGE",
      "organization": {
        "tradeName": "Institut Médico-Éducatif Al-Inara",
        "cityName": "Rabat",
        "regionCode": "MA-04"
      },
      "startDate": "2026-02-01",
      "durationMonths": 6,
      "publishedAt": "2026-01-15T09:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5
  }
}
```

---

### 9.4 `GET /api/v1/job-offers/:id/recommended-candidates` (Vivier de talents pour la structure)
- **Rôle requis** : Membre de l'organisation (`RECRUITER`, `ADMIN`, `OWNER`).
- **Paramètres de requête** : `page`, `limit`, `minScore` (défaut : 60).
- **Réponse (`200 OK`)** :
```json
{
  "statusCode": 200,
  "data": [
    {
      "candidateId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "displayName": "Youssef M. (ou #CAND-7842 si anonymisé)",
      "profileCategory": "STUDENT",
      "cityName": "Kénitra",
      "mobilityRadiusKm": 45,
      "totalScore": 93.25,
      "subScores": {
        "formation": 85.00,
        "skills": 100.00,
        "experience": 100.00,
        "location": 85.00,
        "languages": 100.00,
        "availability": 100.00
      },
      "explanations": {
        "strengths": [
          "Master 2 Neuropsychologie Infantile en adéquation",
          "Maîtrise attestée du WISC-V (Attestation vérifiée)",
          "Mobilité géographique active confirmée"
        ],
        "gaps": [
          "Certification PECS souhaitée non renseignée sur le profil"
        ]
      },
      "hasApplied": false,
      "isInvited": false
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 8,
    "totalPages": 1
  }
}
```
- **Erreurs possibles** : `403 Forbidden` (non-membre de l'organisation émettrice de l'offre), `404 Not Found` (offre inexistante).

---

### 9.5 `POST /api/v1/applications/invite` (Invitation d'un candidat par la structure)
- **Rôle requis** : Membre Org (`RECRUITER`, `ADMIN`, `OWNER`).
- **Corps de la requête (`InviteCandidateDto`)** :
```json
{
  "jobOfferId": "b78d8a70-8911-4f1a-b6d3-2f887b6a9e10",
  "candidateId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "personalizedMessage": "Bonjour Youssef, votre profil en neuropsychologie correspond parfaitement à notre offre de stage PFE."
}
```
- **Réponse (`201 Created`)** :
```json
{
  "statusCode": 201,
  "message": "Candidate invited successfully",
  "data": {
    "applicationId": "e113a7c4-5412-4091-8844-315ec23a9d22",
    "status": "INVITED",
    "expiresAt": "2026-02-02T10:00:00Z"
  }
}
```
- **Erreurs possibles** : `400 Bad Request` (invitation déjà en cours ou refusée il y a moins de 30 jours), `403 Forbidden`.

---

### 9.6 `POST /api/v1/candidate/cv/download-url`
- **Rôle requis** : `CANDIDATE` (pour son propre CV) OU Membre Org (`RECRUITER`, `ADMIN`, `OWNER` si candidature active).
- **Corps de la requête (`GetCvUrlDto`)** :
```json
{
  "candidateId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "jobOfferId": "b78d8a70-8911-4f1a-b6d3-2f887b6a9e10"
}
```
- **Réponse (`200 OK`)** :
```json
{
  "statusCode": 200,
  "data": {
    "presignedUrl": "https://storage.psyrekrute.ma/cv-bucket/candidates/f47ac10b.../cv.pdf?X-Amz-Expires=900&X-Amz-Signature=...",
    "expiresInSeconds": 900
  }
}
```
*Note : Cette requête enregistre instantanément une ligne dans `AUDIT_LOGS`.*
- **Erreurs possibles** : `403 Forbidden` (le recruteur n'a pas de candidature active liée à ce candidat).

---

## 10. Configuration Docker, Variables d'Environnement & Procédure Locale Standardisée

### 10.1 Architecture du Réseau Docker Compose
Le fichier `docker/docker-compose.yml` orchestre 4 services interconnectés sur le réseau pont `psyrekrute-net` :

```mermaid
flowchart LR
    subgraph DOCKER_COMPOSE["Réseau Local Docker Compose (psyrekrute-net)"]
        PG["postgres:16-alpine<br>Port 5432"]
        MINIO["minio/minio<br>Ports 9000 (API) & 9001 (Console)"]
        BE["backend (NestJS dev)<br>Port 4000"]
        FE["frontend (Next.js dev)<br>Port 3000"]
    end
    BE --> PG
    BE --> MINIO
    FE --> BE
```

### 10.2 Fichier de Configuration `.env.example` Standardisé (Aucun Secret en Dur)
```bash
# ==========================================
# ENVIRONNEMENT GLOBAL PSYREKRUTE (LOCAL DEV)
# ==========================================
NODE_ENV=development
APP_PORT=4000
FRONTEND_PORT=3000

# BASE DE DONNEES POSTGRESQL
POSTGRES_USER=psyrekrute_dev_user
POSTGRES_PASSWORD=dev_secret_change_in_prod
POSTGRES_DB=psyrekrute_db
POSTGRES_PORT=5432
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public

# STOCKAGE MINIO (COMPATIBLE S3)
MINIO_ROOT_USER=minio_dev_admin
MINIO_ROOT_PASSWORD=minio_dev_secret_password
MINIO_PORT_API=9000
MINIO_PORT_CONSOLE=9001
MINIO_BUCKET_DOCUMENTS=psyrekrute-documents
S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=${MINIO_ROOT_USER}
S3_SECRET_KEY=${MINIO_ROOT_PASSWORD}

# SECURITE & JETONS JWT (GÉNÉRER DES CLÉS SÉCURISÉES EN PROD)
JWT_ACCESS_SECRET=local_jwt_access_secret_key_minimum_256_bits_for_testing
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_SECRET=local_jwt_refresh_secret_key_minimum_256_bits_for_testing
JWT_REFRESH_EXPIRATION=7d

# APPLICATION FRONTEND
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
NEXT_PUBLIC_DEFAULT_LOCALE=fr
```

### 10.3 Procédure de Démarrage Locale Pas à Pas (Identique pour les 5 Développeurs)
1. **Clonage du dépôt** :
   ```bash
   git clone git@github.com:organisation/psyrekrute.git
   cd psyrekrute
   ```
2. **Initialisation des variables d'environnement** :
   ```bash
   cp .env.example .env
   ```
3. **Lancement de l'infrastructure Docker** :
   ```bash
   docker compose -f docker/docker-compose.yml up -d
   ```
4. **Application des migrations Prisma et semences de données marocaines** :
   ```bash
   docker compose -f docker/docker-compose.yml exec backend npx prisma migrate dev --name init
   docker compose -f docker/docker-compose.yml exec backend npx prisma db seed
   ```
5. **Vérification des interfaces de développement** :
   - Frontend Next.js : `http://localhost:3000`
   - Documentation interactive Swagger : `http://localhost:4000/api/docs`
   - Console MinIO : `http://localhost:9001` (Identifiants : `minio_dev_admin` / `minio_dev_secret_password`)
   - Inspection visuelle de la base : `docker compose -f docker/docker-compose.yml exec backend npx prisma studio` (`http://localhost:5555`).

---

## 11. Organisation Opérationnelle des 5 Développeurs (Matrice Anti-Blocage & DoD)

### 11.1 Matrice de Répartition et Contrats d'Interface Anti-Blocage
Pour éliminer les dépendances bloquantes dès le Sprint 1 :
- **Dev 4 et Dev 5 fournissent dès les 48 premières heures** le schéma Prisma typé, la base Docker opérationnelle et les contrats DTO TypeScript partagés.
- **Dev 2 (Frontend Étudiant) et Dev 3 (Frontend Structure)** travaillent immédiatement en mode mocké via les DTOs TypeScript partagés générés automatiquement depuis OpenAPI, sans attendre que les services NestJS soient finalisés.
- **Dev 1 (Backend Core & Matching)** implémente les algorithmes en Test-Driven Development (TDD) en s'appuyant directement sur le client Prisma généré par Dev 4.

```mermaid
flowchart TD
    DEV5["Dev 5 (Infra & S3)<br>Livre Docker, MinIO & CI J+1"]
    DEV4["Dev 4 (Data & Auth)<br>Livre Prisma Schema & Types J+2"]
    
    DEV1["Dev 1 (Backend Services)<br>Implémente Matching & FSM"]
    DEV2["Dev 2 (Frontend Candidat)<br>Développe UI Candidat & RTL"]
    DEV3["Dev 3 (Frontend Structure)<br>Développe UI Centre & Vivier"]

    DEV5 & DEV4 --> DEV1 & DEV2 & DEV3
    DEV1 -. APIs réelles intégrées au Sprint 3 .- DEV2 & DEV3
```

### 11.2 Fiches de Rôles et Livrables Individuels

#### Développeur 1 : Backend Core, Moteur de Matching & FSM
- **Livrables attendus** :
  - `MatchingModule` : Implémentation stricte des 6 dimensions mathématiques et de la gestion des critères obligatoires/souhaitables.
  - `ApplicationsModule` : Machine à états finis, contrôle des transitions autorisées et tâche CRON d'expiration des invitations.
  - `JobOffersModule` : CRUD complet des offres avec validation des compétences requises.
- **Dépendances** : Consomme le schéma Prisma de Dev 4 et le service de stockage S3 de Dev 5.

#### Développeur 2 : Frontend Candidat & Internationalisation RTL
- **Livrables attendus** :
  - Dashboard étudiant complet sous Next.js (App Router).
  - Composants visuels de matching : jauges de compatibilité circulaires, listes de points forts et compétences à valoriser.
  - Parcours complet : candidature directe, acceptation/refus d'invitation, confirmation de créneau d'entretien.
  - Validation de la mise en page miroir en Arabe RTL via `next-intl`.
- **Dépendances** : Consomme les contrats d'API partagés et les types TypeScript.

#### Développeur 3 : Frontend Structures, Vivier de Talents & Console Admin
- **Livrables attendus** :
  - Dashboard structure / centre sous Next.js.
  - Interface du vivier de talents recommandés avec filtres dynamiques, décomposition des sous-scores et bouton d'invitation.
  - Interface de gestion multi-membres et module de proposition d'entretiens.
  - Console d'administration système : interface de vérification des ICE des structures et traitement des signalements (`REPORTS`).
- **Dépendances** : Consomme les contrats d'API partagés et les types TypeScript.

#### Développeur 4 : Base de Données, Sécurité, RBAC & Audit CNDP
- **Livrables attendus** :
  - Schéma exhaustif `schema.prisma` (23 entités, relations, index, cascades).
  - Scripts de semence (`seed.ts` : 12 régions officielles du Maroc, spécialités, compétences).
  - `AuthModule` complet : JWT asymétrique, Refresh Token Rotation en cookie HTTP-Only, Guards RBAC étanches.
  - `AuditModule` & `ConsentModule` : Traçabilité des accès aux CVs et recueil des consentements.
- **Dépendances** : Livre ses artefacts à toute l'équipe dès le Sprint 1.

#### Développeur 5 : Infrastructure, Docker, Stockage S3 & QA Lead
- **Livrables attendus** :
  - Fichier `docker-compose.yml` complet et reproductible.
  - `StorageModule` NestJS : Client compatible S3 / MinIO avec génération d'URLs signées éphémères et validation des magic bytes PDF.
  - Pipeline GitHub Actions CI : Lint, vérification TypeScript, exécution automatique des tests.
  - Pilotage de la stratégie de tests E2E avec Playwright.
- **Dépendances** : Fournit le socle d'exécution à l'équipe.

---

### 11.3 Critères d'Acceptation et Definition of Done (DoD)
Pour qu'une tâche ou un module soit déclaré officiellement **terminé (Done)** au sein d'un sprint :
1. **Code & Typage** : 100% TypeScript strict, zéro avertissement au linter (`eslint`), zéro type `any`.
2. **Couverture de Tests** : Tests unitaires rédigés avec une couverture minimale de **85% sur les services métier** (notamment sur le moteur de matching et les transitions de statuts).
3. **Documentation API** : DTOs validés avec `class-validator` et décorateurs Swagger OpenAPI complets.
4. **Revue de Code** : Pull Request relue et formellement approuvée par au moins **1 pair développeur**.
5. **Intégration Continue (CI)** : Pipeline GitHub Actions vert (build Docker, lint, tests unitaires et intégration passés avec succès).
6. **Support RTL** : Pour tout composant frontend, validation visuelle de non-régression en langue arabe avec direction RTL.

---

## 12. Tableau Comparatif des Modifications (v3.0 vs v3.1)

| Domaine / Sujet | Version v3.0 | Version révisée v3.1 | Justification technique de la correction |
| :--- | :--- | :--- | :--- |
| **Nombre d'entités en base** | Annonce ambiguë de "20" puis "22" entités. | **Exactement 23 entités** spécifiées, listées et intégrées à l'ERD. | Élimination des incohérences de comptage et inclusion de `JOB_REQUIRED_LANGUAGES`. |
| **Gouvernance RBAC** | Confusion partielle entre rôles globaux et rôles de membres d'organisations. | **Dissociation stricte** : `GlobalRole` (`CANDIDATE`, `ORGANIZATION_USER`, `SYSTEM_ADMIN`) vs `OrgMemberRole` (`OWNER`, `ADMIN`, `RECRUITER`, `VIEWER`). | Séparation étanche de l'identité système et des droits contextuels multi-organisations. |
| **Contradiction compétences souhaitables** | Le texte affirmait "pas de pénalité" mais moyennait les $0\%$ ce qui dégradait la note. | **Formule additive découplée** : $S_{skills} = \min(100, S_{skills, oblig} + Bonus_{souhait})$. | L'absence d'une compétence souhaitable n'abaisse plus jamais le score de base ($Bonus = 0$). |
| **Bonus de vérification des compétences** | Multiplicateur $+15\%$ risquant de dépasser $100\%$. | **Plafonnement systématique** : $\min(100, Score_{base} \times 1.15)$. | Cohérence mathématique stricte garantissant des bornes $[0, 100]$. |
| **Exemples chiffrés de matching** | Exemples approximatifs non recalculés avec les pondérations réelles. | **3 cas recalculés pas à pas** avec formules exactes, prêts pour tests unitaires Jest. | Vecteurs de test d'or reproductibles pour le développement en TDD. |
| **Machine à états (FSM)** | Parcours de recrutement incomplet (pas d'expiration d'invitation, reports non limités). | **Matrice complète** : expiration automatique (14j), réinvitation bloquée 30j après refus, max 2 reports d'entretien. | Prévention des blocages métier et du démarchage intempestif. |
| **Sécurité des jetons** | Mention sommaire de JWT sans spécification des sessions. | **Spécification stricte** : Access Token (15m) + Refresh Token Rotation (7j) en cookie HttpOnly haché SHA-256. | Prévention active du vol de session et conformité aux standards OWASP. |
| **Sécurité des fichiers** | Mention générique d'URLs signées. | **URLs signées de 15 minutes** + validation des magic bytes binaires PDF + nommage UUID étanche. | Blocage formel des fichiers exécutables malveillants renommés en `.pdf`. |
| **Conformité Loi 09-08 / CNDP** | Présentation erronée des 24 mois comme "obligation légale". | **Requalification** en choix d'organisation interne justifié + identification des démarches CNDP soumises à avis juridique. | Rigueur juridique évitant toute fausse affirmation de conformité acquise. |
| **Contrats d'API REST** | Liste simple de verbes et d'URLs sans payloads. | **Spécifications détaillées** avec DTOs d'entrée, exemples JSON réels, codes HTTP et pagination. | Permet aux développeurs frontend de développer en mocké sans attendre le backend. |
| **Environnement Docker** | Chemins et commandes disparates dans le document. | **Arborescence Docker unifiée**, fichier `.env.example` documenté sans secrets en clair. | Reproductibilité absolue de l'environnement de dev pour les 5 développeurs. |

---

## 13. Matrice des Risques et Décisions Soumises à l'Approbation du Coordinateur

Avant tout engagement d'initialisation technique, les arbitrages suivants sont formellement soumis à la décision du coordinateur du projet :

| Réf. | Objet de la Décision | Option Recommandée | Option Alternative | Justification & Impact | Statut |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **DEC-01** | **Validation du Référentiel des 6 Spécialités** | **Adopter les 6 spécialités cibles** centrées sur la psychologie de l'éducation et l'accompagnement neurodéveloppemental. | Élargir dès le MVP à l'orthophonie et à la psychomotricité. | Le recentrage consolide la promesse de valeur du MVP sans disperser l'effort de référencement. | *En attente* |
| **DEC-02** | **Politique d'Anonymisation par Défaut dans le Vivier** | **Profil public par défaut avec option d'anonymisation** (`is_anonymized_in_pool = false` par défaut, activable par le candidat). | Anonymisation systématique obligatoire de tous les candidats (`true` par défaut). | L'option recommandée offre le meilleur compromis d'engagement pour les recruteurs tout en respectant le choix de discrétion. | *En attente* |
| **DEC-03** | **Délai d'Expiration des Invitations du Vivier** | **Fixer le délai de validité à 14 jours calendaires** avant expiration automatique (`INVITATION_EXPIRED`). | Fixer un délai court de 7 jours ou un délai long de 30 jours. | 14 jours correspondent au rythme moyen de consultation des étudiants sans bloquer indûment le vivier des structures. | *En attente* |
| **DEC-04** | **Niveau de Contrôle des Structures Recruteuses** | **Validation administrative préalable obligatoire (ICE / Récépissé)** avant autorisation d'accès au vivier. | Inscription libre et activation immédiate avec contrôle a posteriori. | L'option recommandée protège les étudiants contre les structures fictives ou la collecte illicite de CVs. | *En attente* |
| **DEC-05** | **Calendrier et Démarche Réglementaire CNDP** | **Initier la déclaration formelle CNDP en amont du Sprint 4** en parallèle du développement. | Reporter la déclaration formelle à la phase de recette finale (Sprint 6). | Anticiper la démarche auprès de la CNDP prévient tout blocage administratif lors de l'ouverture du pilote. | *En attente* |

---
*Fin du Dossier de Conception Technique et Fonctionnelle (DCTF v3.1).*  
*Ce document consolidé est prêt pour exploitation par l'équipe des 5 développeurs et attend la validation formelle du coordinateur de projet avant toute initialisation de code ou d'infrastructure.*
