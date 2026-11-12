# Sprint 2 – Proposition de périmètre (EN ATTENTE DE VALIDATION)

> **Aucune implémentation du Sprint 2 n'a été commencée.** Ce document propose le périmètre ; le développement ne démarre qu'après validation explicite du coordinateur.
> Références : DCTF v3.1.1 §4 (RBAC), §8 (sécurité), §9.1–9.2 (contrats d'API), §11.2 (rôles simulés), §11.3 (Definition of Done).

## 1. Objectif et thème
**« Identité, accès et traçabilité »** : tout ce qui doit exister avant de manipuler des données de candidats ou de structures. Il correspond aux livrables du rôle simulé *Dev 4* (Auth, RBAC, Audit, Consentements) plus un socle minimal Organisations nécessaire pour tester les rôles de membre.

Le Sprint 2 ne livre **aucune** fonctionnalité de matching, d'offres, de candidatures ni de vivier.

## 2. Modules, dans l'ordre d'implémentation
Un seul module à la fois ; tests puis commit Git à la fin de chacun.

| # | Module | Contenu | Rôle simulé | Dépend de |
|---|---|---|---|---|
| M0 | Outillage qualité | ESLint (TypeScript strict, pas de `any`), script de couverture avec seuil 85 % sur les services métier, validation globale des DTO déjà en place | Dev 5 (QA) | – |
| M1 | `AuthModule` | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` ; hachage bcrypt ; access JWT 15 min ; refresh 7 j en cookie HttpOnly haché SHA-256 avec rotation et détection de réutilisation | Dev 4 | M0, schéma `User` (+ session, voir D1) |
| M2 | RBAC | Guards `JwtAuthGuard`, `GlobalRolesGuard`, `OrgRolesGuard`, décorateurs `@Roles()` / `@OrgRoles()` ; matrice §4.2 testée ; `GlobalRole` ≠ `OrgMemberRole` | Dev 4 | M1 |
| M3 | `AuditModule` | Service d'écriture dans `AUDIT_LOGS` (UTC, auteur, IP, User-Agent), immuable côté application ; `GET /admin/audit-logs` réservé `SYSTEM_ADMIN` ; événements de connexion et de refus d'accès | Dev 4 | M1, M2 |
| M4 | `ConsentModule` | Consentements distincts et non pré-cochés (CGU/politique à l'inscription ; vivier ; matching automatisé), versionnés, révocables ; `GET/PUT /me/consents` | Dev 4 | M1, M3 |
| M5 | Organisations (socle minimal) | `POST /organizations` (créateur = `OWNER`, vérification ICE = `PENDING`), `GET /me/memberships`, changement de rôle / révocation de membre par `OWNER`/`ADMIN` | Dev 1/4 | M2, M3 |
| M6 | Écrans d'authentification (frontend) | Pages inscription et connexion FR/AR(RTL)/EN, messages d'erreur traduits, appel réel à l'API ; vérification navigateur FR/AR/EN | Dev 2 | M1, M4 |

**Hors périmètre Sprint 2** : profil candidat, offres, matching exposé en API, candidatures et machine à états, vivier, entretiens, téléchargement de CV, console admin (vérification ICE), e-mails (vérification d'adresse, mot de passe oublié), MinIO réel, validation Docker Compose, CNDP. MinIO et Docker restent au backlog (B-01, B-02).

## 3. Dépendances techniques
- **Déjà présent** : schéma Prisma (`User`, `Consent`, `AuditLog`, `Organization`, `OrganizationMember`), `bcryptjs`, `@nestjs/jwt`, `@nestjs/passport`, `class-validator`, Swagger, PostgreSQL local, seed. Présence de `passport-jwt` et `@nestjs/throttler` à vérifier à l'installation.
- **À ajouter (si approuvé)** : `cookie-parser`, `@nestjs/throttler` (limitation de débit sur login/register), ESLint.
- Aucun changement d'architecture (monolithe modulaire, pas de Redis ni BullMQ). Les modules Sprint 1 (matching, stockage, santé) ne sont pas réécrits.

## 4. Décisions à prendre avant de commencer
| Réf. | Sujet | Ma proposition |
|---|---|---|
| **D1** | Le DCTF §8.1 exige un refresh token **haché en base**, mais le schéma n'a **aucune table de sessions** (23 entités). La rotation et la détection de vol l'imposent. | Ajouter une table `USER_SESSIONS` (24ᵉ entité : id, user_id, token_hash, expires_at, revoked_at, user-agent, IP) via une migration Prisma, et passer le DCTF en v3.1.2. **Nécessite ton accord** car le nombre d'entités est un point validé. |
| **D2** | `register` reçoit `globalRole` dans le DCTF §9.1. | N'accepter que `CANDIDATE` et `ORGANIZATION_USER` ; `SYSTEM_ADMIN` uniquement par seed / action interne (jamais par l'API publique). |
| **D3** | Taille maximale d'un document : DCTF §8.2 = **5 Mo** ; le code stockage du Sprint 1 applique **10 Mo**. | Aligner le code sur 5 Mo (changement d'une constante + test), sans réécrire le module. |
| **D4** | DCTF §13 DEC-02 indique « public par défaut » (`false`) alors que tes décisions et le schéma retiennent **anonymisé par défaut** (`true`). | Mettre à jour DEC-02 dans le DCTF (documentation seule). |
| **D5** | Cookie `Secure` en développement HTTP local. | `Secure` activé seulement si `NODE_ENV=production` ; `HttpOnly` et `SameSite=Strict` toujours actifs. |
| **D6** | JWT : DCTF autorise `HS256` en local, `RS256` en cible. | HS256 pour le Sprint 2 ; passage RS256 avant déploiement (backlog). |
| **D7** | Politique de mot de passe : DCTF = ≥ 8 caractères, majuscule, chiffre, caractère spécial. | Appliquer exactement cette règle ; bcrypt coût 12 ; message d'erreur identique pour e-mail inconnu et mauvais mot de passe. |
| **D8** | E-mails (vérification, réinitialisation) : dépendent d'un fournisseur, avec la question de transfert de données à l'étranger (DEC-05). | Hors Sprint 2. |

## 5. Critères d'acceptation
**Par module (Definition of Done §11.3, adaptée à un développeur unique)** : TypeScript strict sans `any` ; DTO validés (`class-validator`) et décorés Swagger ; tests unitaires et d'intégration verts ; couverture ≥ 85 % mesurée sur les services du module ; `tsc --noEmit` propre ; commit Git dédié ; pas de secret versionné. Pas de pull request (un seul développeur).

**M1 Auth**
- Inscription valide → 201 ; e-mail déjà utilisé → 409 ; mot de passe faible, `termsAccepted=false` ou rôle `SYSTEM_ADMIN` → 400.
- Mot de passe stocké uniquement haché ; jamais dans une réponse ni dans les logs.
- Login correct → access token (expire en 900 s) + cookie refresh `HttpOnly; SameSite=Strict; Path=/api/v1/auth` ; identifiants faux → 401 sans révéler si l'e-mail existe ; compte désactivé → 403.
- Refresh : l'ancien token est invalidé ; **la réutilisation d'un ancien token révoque toutes les sessions** du compte (test dédié) ; logout révoque la session.
- Limitation de débit sur login/register (dépassement → 429).

**M2 RBAC**
- Chaque cellule de la matrice §4.2 implémentée dans cette itération est couverte par un test (autorisé / refusé) ; un `CANDIDATE` ne peut jamais devenir membre d'une organisation ; un membre n'a de droits que dans **son** organisation (isolation inter-organisations testée) ; route sans jeton → 401 ; rôle insuffisant → 403.

**M3 Audit**
- Connexion réussie, échec de connexion et accès refusé produisent une entrée avec UTC, auteur, IP, User-Agent ; aucune route de modification ou de suppression des logs ; lecture réservée `SYSTEM_ADMIN` (403 sinon) ; pagination.

**M4 Consentements**
- Aucun consentement pré-coché ; CGU obligatoires à l'inscription, vivier et matching automatisé facultatifs et indépendants ; chaque consentement est horodaté, versionné et révocable ; la révocation est auditée ; **profil privé et anonymisé par défaut** inchangé.

**M5 Organisations**
- Le créateur devient `OWNER` ; une organisation reste `PENDING` (aucun accès au vivier, qui n'existe pas encore) ; `VIEWER`/`RECRUITER` ne peuvent pas gérer les membres ; on ne peut pas retirer le dernier `OWNER`.

**M6 Frontend**
- Inscription et connexion fonctionnelles de bout en bout dans un navigateur réel, en FR, EN et AR (`dir=rtl`) ; erreurs API traduites ; aucune erreur console ; jeton d'accès non stocké dans `localStorage`. Vérification par captures et journal réseau, comme au Sprint 1.

**Sortie du sprint** : rapport `docs/sprint2-report.md` avec statuts réels (validé / partiel / reporté), résultats de tests et couverture mesurée, limites connues. Aucune conformité CNDP revendiquée (DEC-05).

## 6. Risques
- **D1** bloque M1 tant que la table de sessions n'est pas approuvée.
- La couverture à 85 % n'a jamais été mesurée : l'écart éventuel sur le code Sprint 1 est traité à part, sans réécrire les modules validés.
- Cookies `SameSite=Strict` entre `localhost:3000` et `localhost:4000` : même site (même hôte, ports différents), mais à valider en navigateur au M6.
- La limitation de débit en mémoire (sans Redis) ne vaut que pour une seule instance ; acceptable pour le MVP.
