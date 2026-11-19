# PLAN D'ARCHITECTURE ET DE DÉPLOIEMENT DOCKER (LAN + INTERNET) — PSYREKRUTE

**Projet :** PsyRekrute (Monolithe modulaire — Next.js 14 / NestJS 10 / Prisma 5.14 / PostgreSQL 16 / MinIO)  
**Hébergement cible :** Ordinateur Windows principal (collègue non développeur, équipé uniquement de Docker Desktop)  
**Modes d'accès simultanés :**  
- **Réseau local (LAN Wi-Fi / Ethernet) :** `http://<IP_LOCALE_SERVEUR>` (ex. `http://192.168.1.50`)  
- **Internet public (HTTPS) :** `https://<DOMAINE_PSYREKRUTE>` (via Cloudflare Tunnel `cloudflared`)  
**Branche et commit de référence :** `feat/sprints4-5-pre-lan` (`9b4259049944a7320176969c0c633d86be04ef7d`)  
**Date :** 19 novembre 2026  
**Nature du document :** Analyse et conception en lecture seule (aucun code source, Dockerfile ou configuration modifié).

---

## 1. Architecture cible et vérification de l'état actuel

### 1.1 Vérification factuelle de l'état des anomalies (`docs/audit_global_mvp_psyrekute.md`)
Conformément à la section 3 de la mission, l'état réel du code au commit `9b425904` a été vérifié sans rien présumer :

| ID Anomalie | Description | État réel dans le code (`9b425904`) | Action requise avant déploiement |
|---|---|---|---|
| **`ANOM-01`** | Absence de la pile Docker Compose et du `Caddyfile` pour le déploiement hybride LAN + Internet | **NON CRÉÉ** (`docker/` ne contient que `docker-compose.yml` dev et `docker-compose.prod.yml` Nginx) | **À créer** (`docker/docker-compose.lan.yml`, `docker/caddy/Caddyfile`, `docker/.env.lan.example`). |
| **`ANOM-02`** | Absence de vérification du préfixe `candidates/${profile.id}/cv/` dans `confirmCvUpload` (IDOR potentiel) | **NON CORRIGÉ** (`backend/src/modules/candidates/candidates.service.ts:384-398` n'exécute que `this.storageService.exists(dto.storageKey)`) | **À corriger (P1)** avant ouverture sur Internet. |
| **`ANOM-03`** | Absence de vérification serveur de la taille ($\le 5\text{ Mo}$) et des magic bytes `%PDF-` sur S3 dans `confirmCvUpload` | **NON CORRIGÉ** (`candidates.service.ts:390` n'appelle pas `validatePdfMagicBytes` en mode S3) | **À corriger (P1)** avant ouverture sur Internet. |
| **`ANOM-04`** | Élagage de la CLI `prisma` hors de l'étape `runner` par `npm prune --omit=dev` (`backend/Dockerfile.prod:36`) | **NON CORRIGÉ** (`prisma` est en `devDependencies` dans `backend/package.json:63`) | **À résoudre (P1)** via un service d'initialisation `db-init` (`target: builder`) ou déplacement de `prisma` dans `dependencies`. |
| **`ANOM-07`** | 1) 4 variables inutilisées dans `ssrf-guard.util.spec.ts` faisant échouer `npm run lint` backend ; 2) absence de `ProxyAwareThrottlerGuard` sur `/auth/refresh` | **NON CORRIGÉ** (`ssrf-guard.util.spec.ts:225,236,325,328` et `auth.controller.ts:136`) | **À corriger (P2)** avant construction finale des images. |

### 1.2 Principes de l'architecture cible unifiée (LAN + Internet)
Une **seule pile Docker Compose** (`docker/docker-compose.lan.yml`) hébergée sur le PC Windows du collègue orchestre 6 conteneurs persistants et 2 conteneurs d'initialisation ponctuels (`restart: "no"`) :
1. **`postgres` (`postgres:16-alpine`)** : Base relationnelle unique, sur réseau interne isolé (`internal`), **aucun port publié**.
2. **`minio` (`minio/minio`)** : Stockage objet S3 privé des CV, **aucun port publié sur l'hôte**.
3. **`minio-init` (`minio/mc`)** : Crée le bucket `psyrekrute-documents` et force `mc anonymous set none` au démarrage.
4. **`db-init` (image backend `target: builder`)** : Exécute `npx prisma migrate deploy` (et les seeds de démonstration au premier lancement) avant le démarrage du backend.
5. **`backend` (NestJS compilé `node:20-bookworm-slim`)** : API REST `/api/v1`, écoute `0.0.0.0:4000` sur les réseaux `internal` et `edge`, **aucun port publié sur l'hôte**.
6. **`frontend` (Next.js standalone `node:20-alpine`)** : Interface web trilingue compilée avec `NEXT_PUBLIC_API_URL=/api/v1`, écoute `0.0.0.0:3000` sur `edge`, **aucun port publié sur l'hôte**.
7. **`caddy` (`caddy:2.8-alpine`)** : Point d'entrée HTTP unique. **Seul le port `80:80` est publié sur l'interface réseau locale (LAN) du PC Windows.**
8. **`cloudflared` (`cloudflare/cloudflared:latest`)** : Établit un tunnel sortant chiffré vers le réseau périphérique Cloudflare (sans aucune ouverture de port entrant ni redirection NAT sur la box Internet du collègue) et transmet le trafic `https://<DOMAINE_PSYREKRUTE>` directement à `http://caddy:80` sur le réseau Docker `edge`.

---

## 2. Schéma des flux réseau (LAN et Internet)

```mermaid
flowchart TB
    subgraph Internet["Accès Internet Public"]
        ExtUser["Navigateur Internet\nhttps://DOMAINE_PSYREKRUTE"]
        CFEdge["Cloudflare Edge\nTerminaison HTTPS / TLS 1.3"]
        ExtUser <-->|"HTTPS (:443)"| CFEdge
    end

    subgraph LocalWiFi["Réseau Local (Wi-Fi / Ethernet du collègue)"]
        LanUser["Appareil LAN (PC / Smartphone)\nhttp://192.168.1.50"]
    end

    subgraph HostPC["PC Windows Hébergeur (Docker Desktop / WSL2)"]
        subgraph EdgeNet["Réseau Docker 'edge' (bridge)"]
            CFContainer["Conteneur cloudflared\n(Tunnel sortant uniquement)"]
            Caddy["Conteneur Caddy (:80)\nSeul port publié sur le LAN (80:80)"]
            Frontend["Conteneur Frontend Next.js (:3000)\nNEXT_PUBLIC_API_URL=/api/v1"]
            Backend["Conteneur Backend NestJS (:4000)\n/api/v1/*"]
        end

        subgraph InternalNet["Réseau Docker 'internal' (internal: true — isolé)"]
            Postgres[("PostgreSQL 16 (:5432)\nVolume: psyrekrute_pg_data")]
            MinIO[("MinIO S3 (:9000)\nVolume: psyrekrute_minio_data\nBucket privé: psyrekrute-documents")]
        end
    end

    CFEdge <-->|"Tunnel sortant chiffré\n(aucun port box ouvert)"| CFContainer
    CFContainer -->|"http://caddy:80\nHost: DOMAINE_PSYREKRUTE\nX-Forwarded-Proto: https"| Caddy
    LanUser -->|"http://192.168.1.50:80\nHost: 192.168.1.50"| Caddy

    Caddy -->|"/* -> frontend:3000"| Frontend
    Caddy -->|"/api/* -> backend:4000"| Backend
    Caddy -->|"/psyrekrute-documents/* -> minio:9000\n(Host préservé pour signature SigV4)"| MinIO

    Backend -->|"Prisma (:5432)"| Postgres
    Backend -->|"S3_ENDPOINT=http://minio:9000"| MinIO
```

---

## 3. Analyse approfondie des conséquences techniques du double accès (LAN HTTP + Cloudflare Tunnel HTTPS)

L'inspection du code réel met en évidence **6 interactions techniques critiques** entre l'accès LAN (`http://IP_LOCALE`) et l'accès Cloudflare Tunnel (`https://DOMAINE`) :

### 3.1 URLs API Frontend (`frontend/src/lib/api-client.ts:149`)
- **Constat dans le code :** Toutes les pages Next.js sont des composants client (`'use client'`). L'image `frontend/Dockerfile.prod` est compilée avec `ARG NEXT_PUBLIC_API_URL=/api/v1` (chemin relatif).
- **Comportement en double accès :**
  - Sur le LAN (`http://192.168.1.50`), le navigateur appelle `http://192.168.1.50/api/v1/...` (même origine).
  - Sur Internet (`https://DOMAINE`), le navigateur appelle `https://DOMAINE/api/v1/...` (même origine).
- **Verdict :** **100 % compatible sans modification**, une seule image Docker frontend fonctionne simultanément pour toute adresse IP LAN et tout nom de domaine public.

### 3.2 Configuration CORS (`backend/src/main.ts:54-66`)
- **Constat dans le code :** `allowedOrigin.split(',').map((origin) => origin.trim())` découpe déjà `FRONTEND_URL` sur la virgule.
- **Configuration cible :** `FRONTEND_URL=http://${LAN_HOST},https://${PUBLIC_DOMAIN}` autorise simultanément les deux origines.

### 3.3 Cookies de session HttpOnly (`backend/src/modules/auth/refresh-cookie.util.ts:10-44`)
- **Constat dans le code :** `resolveRefreshCookieSecure` lit `COOKIE_SECURE` (`true` ou `false`).
- **Conséquence du double accès :**
  - Si `COOKIE_SECURE=true`, les utilisateurs Internet (`https://DOMAINE`) conservent leur session, mais **les utilisateurs LAN (`http://192.168.1.50`) perdent leur session à chaque rafraîchissement (F5)** car le navigateur refuse un cookie `Secure` sur HTTP.
  - Si `COOKIE_SECURE=false`, le cookie `HttpOnly; SameSite=Lax; Path=/api/v1/auth` fonctionne sur les deux accès (LAN HTTP et Internet HTTPS), mais les utilisateurs Internet n'ont pas le drapeau `Secure`.
- **Amélioration recommandée (`COOKIE_SECURE=auto`) :** Dans `refresh-cookie.util.ts` et `auth.controller.ts`, lorsque `COOKIE_SECURE=auto` (ou non forcé à `false`), déterminer `secure` dynamiquement par requête via `req.secure || req.headers['x-forwarded-proto'] === 'https'`. Ainsi :
  - Toute connexion via Cloudflare Tunnel (`X-Forwarded-Proto: https`) reçoit un cookie **`Secure; HttpOnly; SameSite=Lax`**.
  - Toute connexion directe via le LAN (`http://192.168.1.50`) reçoit un cookie **`HttpOnly; SameSite=Lax`** (sans `Secure`).

### 3.4 Extraction de l'IP cliente et Rate Limiting derrière `cloudflared` + `Caddy` (`ip-extractor.util.ts:138-181`)
- **Constat dans le code :** `createExpressTrustProxyValidator` vérifie que chaque saut dans `X-Forwarded-For` appartient à `TRUSTED_PROXIES` (`loopback,linklocal,uniquelocal`) dans la limite de `TRUSTED_PROXY_HOPS` (défaut : `1`).
- **Conséquence avec Cloudflare Tunnel :**
  - Sur le LAN (`Client -> Caddy -> NestJS`), il y a **1 saut** de proxy interne.
  - Sur Internet (`Client -> cloudflared -> Caddy -> NestJS`), il y a **2 sauts** de proxys internes (`cloudflared` et `Caddy`, tous deux sur le réseau Docker `172.16.0.0/12` couvert par `uniquelocal`).
  - Si `TRUSTED_PROXY_HOPS` restait à `1` (ou si Caddy n'était pas configuré avec `trusted_proxies static 172.16.0.0/12`), NestJS verrait l'IP Docker de `cloudflared` pour tous les internautes : **tous les utilisateurs Internet partageraient le même quota de 5 inscriptions / 10 connexions par minute** et auraient la même IP interne dans `AUDIT_LOGS`.
- **Configuration requise (sans modifier le code de `ip-extractor.util.ts`) :**
  1. Dans `Caddyfile` : déclarer `trusted_proxies static 172.16.0.0/12` (fait confiance à `cloudflared`, mais jamais à un client Wi-Fi `192.168.x.x`).
  2. Dans `.env.lan` : définir `TRUSTED_PROXY_HOPS=2` et `TRUSTED_PROXIES=loopback,linklocal,uniquelocal`.

### 3.5 Upload et téléchargement des CV via URLs pré-signées MinIO (`s3-storage.provider.ts:10-66`)
- **Constat dans le code :** Actuellement, `S3StorageProvider` instancie un seul `presignerClient` au démarrage avec l'unique valeur `S3_PUBLIC_ENDPOINT`. Or la signature AWS SigV4 signe obligatoirement l'en-tête `Host` (`X-Amz-SignedHeaders=host`).
- **Conséquence critique du double accès LAN + Internet :**
  - Si `S3_PUBLIC_ENDPOINT=http://192.168.1.50`, un utilisateur Internet sur `https://DOMAINE` recevra une URL `http://192.168.1.50/psyrekrute-documents/...` **inaccessible depuis Internet et bloquée par le navigateur (Mixed Content HTTPS/HTTP)**.
  - Si `S3_PUBLIC_ENDPOINT=https://DOMAINE`, les utilisateurs Internet et les utilisateurs LAN disposant d'Internet passeront par `https://DOMAINE/psyrekrute-documents/...` (ce qui exige une configuration CORS sur le bucket MinIO pour les requêtes `fetch(..., { method: 'PUT' })` initiées depuis `http://192.168.1.50`), et **l'upload/download LAN échouera si la connexion Internet est coupée**.
- **Solution technique recommandée (Sélection dynamique du client de signature par origine autorisée) :**
  - Permettre à `S3_PUBLIC_ENDPOINT` de contenir les deux origines autorisées séparées par une virgule : `S3_PUBLIC_ENDPOINT=http://${LAN_HOST},https://${PUBLIC_DOMAIN}`.
  - Dans `S3StorageProvider`, pré-instancier au démarrage une `Map<string, S3Client>` indexée par le `host` de chaque origine autorisée (`192.168.1.50` $\rightarrow$ client HTTP LAN ; `DOMAINE` $\rightarrow$ client HTTPS public).
  - Lors de l'appel à `generateCvUploadUrl` / `generateCvDownloadUrl` / `getCvDownloadUrl`, transmettre l'en-tête `Host` de la requête HTTP entrante :
    - Si l'utilisateur navigue sur `http://192.168.1.50`, l'URL est signée avec le client `http://192.168.1.50` (`Host: 192.168.1.50`).
    - Si l'utilisateur navigue sur `https://DOMAINE`, l'URL est signée avec le client `https://DOMAINE` (`Host: DOMAINE`).
  - **Résultat :** Aucune URL n'est jamais modifiée après signature, chaque accès reste 100 % *Same-Origin* (aucun Mixed Content, aucun problème CORS sur le PUT MinIO), et le LAN reste autonome même en cas de coupure Internet.

### 3.6 WebSockets et Redirections Next.js (`next-intl`)
- **WebSockets :** Aucun WebSocket n'est utilisé en production (les notifications sont en HTTP REST PostgreSQL ; WebSocket ne sert qu'au Hot-Reload de `next dev`).
- **Redirections i18n (`frontend/src/middleware.ts`) :** `next-intl` utilise l'en-tête `Host` et `X-Forwarded-Proto` transmis par Caddy pour rediriger `/` vers `/fr` en préservant l'origine appelante (`http://192.168.1.50/fr` sur le LAN, `https://DOMAINE/fr` sur Internet).

---

## 4. Inventaire des fichiers existants et fichiers à créer ou modifier

### 4.1 Fichiers existants réutilisés tels quels
- `frontend/Dockerfile.prod` (Next.js 14 standalone, `NEXT_PUBLIC_API_URL=/api/v1`)
- `backend/Dockerfile.prod` (NestJS multi-stage, `CMD ["node", "dist/src/main.js"]`)
- `backend/prisma/schema.prisma` et les 4 migrations dans `backend/prisma/migrations/`
- `backend/prisma/seed.ts` et `backend/prisma/seed-demo-offers.ts` (déjà convertis en Argon2id à l'Étape 1)

### 4.2 Modifications ciblées du code backend avant construction des images
1. `backend/src/modules/candidates/candidates.service.ts` : Correction de `ANOM-02` (vérification du préfixe `candidates/${profile.id}/cv/<uuid>.pdf`) et `ANOM-03` (vérification de la taille $\le 5\text{ Mo}$ et des magic bytes `%PDF-` dans `confirmCvUpload`).
2. `backend/src/modules/storage/s3-storage.provider.ts`, `storage.service.ts`, `storage.module.ts`, `candidates.controller.ts`, `applications.controller.ts` : Support multi-origines dans `S3_PUBLIC_ENDPOINT` (`http://${LAN_HOST},https://${PUBLIC_DOMAIN}`) avec sélection du `presignerClient` selon l'en-tête `Host` de la requête.
3. `backend/src/modules/auth/refresh-cookie.util.ts` et `auth.controller.ts` : Support de `COOKIE_SECURE=auto` (active `Secure` si `X-Forwarded-Proto === 'https'`, désactive `Secure` sur HTTP LAN) + ajout de `@UseGuards(ProxyAwareThrottlerGuard)` sur `POST /api/v1/auth/refresh` (`ANOM-07`).
4. `backend/src/modules/external-jobs/ssrf-guard.util.spec.ts` : Nettoyage des 4 variables inutilisées pour que `npm run lint` passe à 0 erreur (`ANOM-07`).

### 4.3 Nouveaux fichiers de déploiement et d'exploitation Windows à créer (lors de l'étape d'implémentation)
| Chemin du fichier | Rôle |
|---|---|
| `docker/docker-compose.lan.yml` | Orchestration complète (Postgres, MinIO, `minio-init`, `db-init`, Backend, Frontend, Caddy, `cloudflared` en profil optionnel ou actif) |
| `docker/caddy/Caddyfile` | Reverse proxy unique `:80` routant `/api/*`, `/psyrekrute-documents/*` et `/*` |
| `docker/.env.lan.example` | Modèle documenté des variables LAN + Cloudflare Tunnel (sans secret) |
| `scripts/windows/start-lan.ps1` | Script PowerShell de démarrage, contrôle de santé et affichage des URLs LAN/Internet |
| `scripts/windows/stop-lan.ps1` | Script PowerShell d'arrêt propre des conteneurs **sans suppression des volumes** |
| `scripts/windows/backup.ps1` | Script PowerShell de sauvegarde à chaud de PostgreSQL (`pg_dump -Fc`) et des CV MinIO + SHA-256 |
| `scripts/windows/restore.ps1` | Script PowerShell de restauration contrôlée de PostgreSQL et MinIO avec vérification SHA-256 |

---

## 5. Configuration Docker Compose recommandée (`docker/docker-compose.lan.yml`)

```yaml
name: psyrekrute-server

services:
  postgres:
    image: postgres:16-alpine
    container_name: psyrekrute_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:?requis}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?requis}
      POSTGRES_DB: ${POSTGRES_DB:-psyrekrute_db}
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10
    networks: [internal]

  minio:
    image: minio/minio:RELEASE.2024-05-01T01-11-10Z
    container_name: psyrekrute_minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${S3_ACCESS_KEY:?requis}
      MINIO_ROOT_PASSWORD: ${S3_SECRET_KEY:?requis}
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks: [internal, edge]

  minio-init:
    image: minio/mc:RELEASE.2024-05-03T11-21-07Z
    container_name: psyrekrute_minio_init
    depends_on:
      minio: { condition: service_healthy }
    restart: "no"
    environment:
      S3_ACCESS_KEY: ${S3_ACCESS_KEY}
      S3_SECRET_KEY: ${S3_SECRET_KEY}
      MINIO_BUCKET_DOCUMENTS: ${MINIO_BUCKET_DOCUMENTS:-psyrekrute-documents}
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 $${S3_ACCESS_KEY} $${S3_SECRET_KEY} &&
      mc mb --ignore-existing local/$${MINIO_BUCKET_DOCUMENTS} &&
      mc anonymous set none local/$${MINIO_BUCKET_DOCUMENTS}"
    networks: [internal]

  db-init:
    build:
      context: ../backend
      dockerfile: Dockerfile.prod
      target: builder
    container_name: psyrekrute_db_init
    depends_on:
      postgres: { condition: service_healthy }
    restart: "no"
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-psyrekrute_db}?schema=public
    command: >
      sh -c "npx prisma migrate deploy &&
      node dist/prisma/seed.js &&
      node dist/prisma/seed-demo-offers.js"
    networks: [internal]

  backend:
    build:
      context: ../backend
      dockerfile: Dockerfile.prod
    container_name: psyrekrute_backend
    restart: unless-stopped
    depends_on:
      db-init: { condition: service_completed_successfully }
      minio-init: { condition: service_completed_successfully }
    environment:
      NODE_ENV: production
      APP_PORT: 4000
      FRONTEND_URL: http://${LAN_HOST:?requis},https://${PUBLIC_DOMAIN:-localhost}
      PUBLIC_API_URL: http://${LAN_HOST}/api/v1
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-psyrekrute_db}?schema=public
      STORAGE_DRIVER: s3
      S3_ENDPOINT: http://minio:9000
      S3_PUBLIC_ENDPOINT: http://${LAN_HOST},https://${PUBLIC_DOMAIN:-localhost}
      S3_REGION: us-east-1
      S3_ACCESS_KEY: ${S3_ACCESS_KEY}
      S3_SECRET_KEY: ${S3_SECRET_KEY}
      MINIO_BUCKET_DOCUMENTS: ${MINIO_BUCKET_DOCUMENTS:-psyrekrute-documents}
      JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET:?requis}
      JWT_ACCESS_EXPIRATION: 15m
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET:?requis}
      JWT_REFRESH_EXPIRATION: 7d
      TRUSTED_PROXIES: loopback,linklocal,uniquelocal
      TRUSTED_PROXY_HOPS: 2
      COOKIE_SECURE: ${COOKIE_SECURE:-auto}
    networks: [internal, edge]

  frontend:
    build:
      context: ../frontend
      dockerfile: Dockerfile.prod
      args:
        NEXT_PUBLIC_API_URL: /api/v1
        NEXT_PUBLIC_DEFAULT_LOCALE: fr
    container_name: psyrekrute_frontend
    restart: unless-stopped
    depends_on:
      backend: { condition: service_healthy }
    networks: [edge]

  caddy:
    image: caddy:2.8-alpine
    container_name: psyrekrute_caddy
    restart: unless-stopped
    depends_on: [frontend, backend, minio]
    ports:
      - "80:80"
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    networks: [edge]

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: psyrekrute_cloudflared
    restart: unless-stopped
    depends_on: [caddy]
    command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
    profiles: ["internet"]
    networks: [edge]

volumes:
  pg_data:     { name: psyrekrute_server_pg_data }
  minio_data:  { name: psyrekrute_server_minio_data }
  caddy_data:  { name: psyrekrute_server_caddy_data }
  caddy_config: { name: psyrekrute_server_caddy_config }

networks:
  internal:
    name: psyrekrute_server_internal
    internal: true
  edge:
    name: psyrekrute_server_edge
    driver: bridge
```
*(Note : placer `cloudflared` sous `profiles: ["internet"]` permet de démarrer la pile en mode LAN pur si `CLOUDFLARE_TUNNEL_TOKEN` est vide, et d'activer l'accès Internet automatiquement dans `start-lan.ps1` dès que `CLOUDFLARE_TUNNEL_TOKEN` est renseigné dans `docker/.env.lan`.)*

---

## 6. Configuration Caddy (`docker/caddy/Caddyfile`)

```caddyfile
{
    auto_https off
    servers {
        # Fait confiance aux en-têtes X-Forwarded-For / X-Forwarded-Proto provenant
        # du conteneur cloudflared sur le réseau Docker (172.16.0.0/12), mais jamais
        # à un client externe du Wi-Fi (192.168.0.0/16).
        trusted_proxies static 172.16.0.0/12
    }
}

:80 {
    encode gzip

    request_body {
        max_size 10MB
    }

    header {
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server
    }

    # 1. Accès aux objets du bucket privé MinIO via URLs pré-signées AWS SigV4 uniquement
    # Caddy conserve par défaut l'en-tête Host d'origine (IP LAN ou domaine public),
    # indispensable pour la validation de signature par MinIO.
    handle /psyrekrute-documents/* {
        reverse_proxy minio:9000
    }

    # 2. API Backend NestJS (/api/v1/*)
    handle /api/* {
        reverse_proxy backend:4000
    }

    # 3. Application Frontend Next.js (/*)
    handle {
        reverse_proxy frontend:3000
    }
}
```

---

## 7. Configuration Cloudflare Tunnel (`cloudflared`)

1. **Architecture Zero-Trust sans ouverture de port :**
   - Le conteneur `cloudflared` initie 4 connexions sortantes QUIC/HTTP2 (port 7844 sortant) vers le réseau Cloudflare.
   - **Aucun port entrant (80 ou 443) n'a besoin d'être ouvert ou redirigé (NAT/Port Forwarding) sur le routeur/box Internet du collègue.**
2. **Routage dans le tableau de bord Cloudflare Zero Trust (*Networks > Tunnels*) :**
   - Créer un tunnel nommé `psyrekrute-tunnel`.
   - Récupérer le jeton `CLOUDFLARE_TUNNEL_TOKEN` (stocké uniquement dans `docker/.env.lan`).
   - Configurer une route publique (*Public Hostname*) :
     - **Subdomain / Domain :** `<DOMAINE_PSYREKRUTE>` (ex. `psyrekrute.votredomaine.ma`)
     - **Service Type :** `HTTP`
     - **URL :** `caddy:80`
   - Cloudflare gère automatiquement le certificat SSL/TLS public (TLS 1.3), la protection DDoS et transmet les requêtes HTTP à `caddy:80` avec `Host: <DOMAINE_PSYREKRUTE>` et `X-Forwarded-Proto: https`.

---

## 8. Gestion des variables d'environnement (`docker/.env.lan`)

Toutes les variables sont regroupées dans un seul fichier `docker/.env.lan` sur le PC hébergeur (jamais commité sur GitHub, protégé par `.gitignore`).

| Variable | Rôle | Exemple / Règle de génération |
|---|---|---|
| `LAN_HOST` | Adresse IPv4 locale fixe du PC Windows hébergeur | `192.168.1.50` |
| `PUBLIC_DOMAIN` | Nom de domaine public rattaché au Cloudflare Tunnel | `psyrekrute.votredomaine.ma` (ou `localhost` si LAN seul) |
| `CLOUDFLARE_TUNNEL_TOKEN` | Jeton d'authentification du conteneur `cloudflared` | `eyJhIjoi...` (vide si mode LAN seul) |
| `POSTGRES_USER` | Utilisateur PostgreSQL | `psyrekrute_user` |
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL (hexadécimal sans caractères spéciaux d'URL) | 64 caractères hex (`openssl rand -hex 32`) |
| `POSTGRES_DB` | Nom de la base de données | `psyrekrute_db` |
| `S3_ACCESS_KEY` | Identifiant administrateur MinIO | 32 caractères hex |
| `S3_SECRET_KEY` | Clé secrète MinIO (min. 8 caractères, recommandé 64 hex) | 64 caractères hex |
| `MINIO_BUCKET_DOCUMENTS` | Nom du bucket privé des CV | `psyrekrute-documents` |
| `JWT_ACCESS_SECRET` | Clé secrète JWT HS256 (15 min) | 64 caractères hex |
| `JWT_REFRESH_SECRET` | Clé secrète Refresh Token | 64 caractères hex (distincte de `JWT_ACCESS_SECRET`) |
| `COOKIE_SECURE` | Politique de l'attribut `Secure` du cookie HttpOnly | `auto` (`true` sur HTTPS Cloudflare, `false` sur HTTP LAN) |

---

## 9. Gestion des données persistantes

- **Volumes nommés dédiés :**
  - `psyrekrute_server_pg_data` (`/var/lib/postgresql/data`) : conserve toutes les tables, utilisateurs, offres, candidatures et journaux d'audit.
  - `psyrekrute_server_minio_data` (`/data`) : conserve tous les CV PDF téléversés dans `psyrekrute-documents`.
- **Cycle de vie :**
  - Un redémarrage de conteneur (`docker compose restart`), un arrêt (`docker compose stop` / `docker compose down` **sans** le drapeau `-v`) ou un redémarrage de Windows **conserve 100 % des données PostgreSQL et MinIO**.
  - Le service `db-init` utilise `prisma migrate deploy` (qui n'applique que les migrations non encore exécutées) et des seeds basés sur `upsert` (qui ne détruisent ni n'écrasent les données créées par les utilisateurs).

---

## 10. Stratégie de distribution et procédure d'installation Windows (Section 6 & 7)

### 10.1 Comparaison des deux stratégies de distribution (Section 7)

| Critère | Option A : Construire les images sur le PC du collègue (`docker compose up --build`) | Option B : Pré-construire les images et les distribuer (Registre GHCR ou archive `.tar` USB) |
|---|---|---|
| **Prérequis sur le PC du collègue** | Clone complet du code source + connexion Internet stable pendant le build (`npm ci`, téléchargement moteurs Prisma, compilation TS/Next.js). | Uniquement le dossier `docker/` + `scripts/windows/` (aucun code source ni `npm ci` à exécuter sur le PC cible). |
| **Temps d'installation sur le PC cible** | 8 à 15 minutes (selon la bande passante et le CPU). | **2 à 3 minutes** (`docker compose pull` depuis GitHub Container Registry `ghcr.io` ou `docker load -i psyrekrute-images.tar` depuis clé USB). |
| **Risque d'échec le jour J** | Moyen (coupure réseau pendant `npm ci` ou blocage antivirus Windows sur la compilation). | **Très faible** (les images exactes testées sur votre PC sont exécutées à l'identique). |
| **Verdict recommandé** | Solution de secours si modification de code sur place. | **Solution principale recommandée (Option B hybride : publication sur `ghcr.io/aziz-nk/psyrekrute-*` + archive `.tar` sur clé USB en secours hors-ligne).** |

### 10.2 Procédure d'installation en 5 étapes pour le collègue (non développeur)
1. **Préparation Windows sur le PC hébergeur :**
   - Installer **Docker Desktop pour Windows** (avec backend WSL2 activé) et activer *« Start Docker Desktop when you sign in to your computer »*.
   - **Réservation IP LAN :** Dans l'interface du routeur Wi-Fi (ou dans les paramètres de la carte réseau Windows), fixer l'adresse IPv4 locale du PC (ex. `192.168.1.50`) et déclarer le réseau Wi-Fi en profil **Privé** dans Windows.
   - **Paramètres d'alimentation et veille Windows :** Dans *Paramètres > Système > Alimentation et mise en veille*, régler *« Mettre mon appareil en veille après »* sur **Jamais** (lorsque branché sur secteur). Si c'est un ordinateur portable, régler l'action de fermeture du capot (*Panneau de configuration > Options d'alimentation*) sur **Ne rien faire**.
   - **Pare-feu Windows :** Autoriser le port entrant `TCP 80` uniquement sur le profil réseau **Privé** (automatisé par `start-lan.ps1`).
2. **Copie du dossier de déploiement :** Décompresser le dossier `PsyRekrute` (ou cloner la branche) dans `C:\PsyRekrute`.
3. **Configuration :** Copier `docker\.env.lan.example` en `docker\.env.lan` et renseigner `LAN_HOST=192.168.1.50`, `PUBLIC_DOMAIN` et `CLOUDFLARE_TUNNEL_TOKEN` (le script `start-lan.ps1` peut générer automatiquement les clés hexadécimales aléatoires si elles sont encore à `CHANGE_ME`).
4. **Démarrage :** Clic droit sur `scripts\windows\start-lan.ps1` $\rightarrow$ *Exécuter avec PowerShell*.
5. **Accès :**
   - Depuis n'importe quel appareil du Wi-Fi : `http://192.168.1.50`
   - Depuis Internet : `https://<DOMAINE_PSYREKRUTE>`

### 10.3 Spécification des 4 scripts PowerShell (`scripts/windows/`)
- **`start-lan.ps1`** :
  - Vérifie que Docker Desktop est démarré (`docker info`).
  - Vérifie l'existence de `docker/.env.lan` (et propose de le générer avec des secrets cryptographiques 256 bits aléatoires s'il n'existe pas).
  - Détecte si `CLOUDFLARE_TUNNEL_TOKEN` est renseigné : si oui, lance `docker compose -f docker/docker-compose.lan.yml --env-file docker/.env.lan --profile internet up -d` ; sinon, lance sans le profil `internet`.
  - Attend que le healthcheck `/api/v1/health` réponde `200 OK` via `http://localhost/api/v1/health`, puis affiche clairement les URLs LAN et Internet ainsi que les comptes de démonstration.
- **`stop-lan.ps1`** :
  - Exécute `docker compose -f docker/docker-compose.lan.yml --env-file docker/.env.lan --profile internet stop` (interdiction formelle d'utiliser `down -v` afin de ne **jamais** supprimer les volumes `psyrekrute_server_pg_data` et `psyrekrute_server_minio_data`).
- **`backup.ps1`** :
  - Crée un dossier horodaté `C:\PsyRekrute-Backups\backup_YYYYMMDD_HHMMSS\`.
  - Exécute à chaud un dump PostgreSQL complet via le conteneur :
    `docker exec psyrekrute_postgres pg_dump -U $POSTGRES_USER -d $POSTGRES_DB -F c > pg_backup.dump`
  - Exécute une copie complète du volume MinIO des CV via un conteneur éphémère Alpine monté en lecture seule sur `psyrekrute_server_minio_data` :
    `docker run --rm -v psyrekrute_server_minio_data:/data:ro -v "$BackupDir":/backup alpine tar czf /backup/minio_data.tar.gz -C /data .`
  - Génère le fichier `checksums.sha256` (`Get-FileHash`) pour les deux archives.
- **`restore.ps1`** :
  - Vérifie les empreintes SHA-256 de `pg_backup.dump` et `minio_data.tar.gz` avant toute opération.
  - Demande une confirmation interactive explicite (`OUI`).
  - Restaure la base PostgreSQL avec `pg_restore --clean --if-exists` dans `psyrekrute_postgres` et extrait `minio_data.tar.gz` dans `psyrekrute_server_minio_data`.

---

## 11. Prérequis du domaine et de Cloudflare (Section 12)

1. **Nom de domaine actif** (ex. `.ma`, `.com`, `.org`) dont les serveurs DNS (Nameservers) sont gérés par un compte Cloudflare gratuit.
2. **Compte Cloudflare Zero Trust (gratuit jusqu'à 50 utilisateurs) :**
   - Créer un tunnel `Cloudflare Tunnel` (*Networks > Tunnels > Create a tunnel > Cloudflared*).
   - Copier le token du tunnel dans `CLOUDFLARE_TUNNEL_TOKEN` au sein de `docker/.env.lan`.
   - Dans l'onglet *Public Hostname* du tunnel, associer `<DOMAINE_PSYREKRUTE>` vers le service `http://caddy:80`.
3. **Paramètre SSL/TLS Cloudflare :** Mode *Full* ou *Flexible* compatible (le trafic entre le navigateur et Cloudflare est en HTTPS TLS 1.3 ; le trafic entre Cloudflare Edge et `cloudflared` sur le PC est chiffré dans le tunnel WireGuard/QUIC ; `cloudflared` remet la requête en HTTP local à `caddy:80` sur le réseau privé Docker).

---

## 12. Plans de tests de validation LAN et Internet (Sections 13 & 14)

### 12.1 Plan de tests LAN (`http://<IP_LOCALE_SERVEUR>`)
1. **Test LAN-1 (Santé & Accueil public) :** Depuis un smartphone ou second PC connecté au Wi-Fi, ouvrir `http://192.168.1.50` $\rightarrow$ affichage des 30 offres `[DÉMO]` et des offres externes, bascule linguistique FR / AR (RTL) / EN.
2. **Test LAN-2 (Authentification & Persistance Cookie HTTP) :** Se connecter avec un compte candidat, appuyer sur F5 (rafraîchissement complet) $\rightarrow$ `POST /api/v1/auth/refresh` retourne `200 OK`, l'utilisateur reste connecté (validation de `COOKIE_SECURE=auto/false` en HTTP LAN).
3. **Test LAN-3 (Upload & Download CV PDF via Caddy/MinIO) :** Depuis le smartphone sur le Wi-Fi, téléverser un CV PDF ($\le 5\text{ Mo}$) $\rightarrow$ vérifier que l'URL pré-signée commence par `http://192.168.1.50/psyrekrute-documents/...`, que le `PUT` retourne `200 OK`, que la confirmation réussit et que le téléchargement ouvre le PDF.
4. **Test LAN-4 (Isolation des ports internes) :** Depuis le second appareil Wi-Fi, vérifier que `http://192.168.1.50:5432`, `:9000`, `:9001`, `:4000` et `:3000` sont **fermés / inaccessibles** (seul le port `80` répond).

### 12.2 Plan de tests Internet (`https://<DOMAINE_PSYREKRUTE>`)
1. **Test NET-1 (HTTPS & En-têtes de sécurité) :** Depuis un smartphone en **4G/5G (Wi-Fi coupé)**, ouvrir `https://<DOMAINE_PSYREKRUTE>` $\rightarrow$ certificat cadenas HTTPS valide, aucun avertissement Mixed Content.
2. **Test NET-2 (Cookie `Secure` & Session HTTPS) :** Se connecter en 4G/5G, inspecter l'en-tête `Set-Cookie` sur `/api/v1/auth/login` $\rightarrow$ vérifier la présence de `HttpOnly`, `Secure` et `SameSite=Lax`, puis rafraîchir la page (F5) $\rightarrow$ session maintenue.
3. **Test NET-3 (Upload & Download CV PDF en HTTPS via Cloudflare Tunnel) :** En 4G/5G, téléverser et télécharger un CV PDF $\rightarrow$ vérifier que l'URL pré-signée commence par `https://<DOMAINE_PSYREKRUTE>/psyrekrute-documents/...` (grâce à la sélection dynamique de `S3_PUBLIC_ENDPOINT` par `Host`), sans erreur de signature SigV4 ni blocage Mixed Content.
4. **Test NET-4 (Cohérence temps réel LAN $\leftrightarrow$ Internet) :** Un candidat postule en 4G/5G sur `https://<DOMAINE_PSYREKRUTE>` $\rightarrow$ le recruteur connecté en Wi-Fi local sur `http://192.168.1.50` voit instantanément la candidature et la notification In-App, planifie un entretien et consulte le CV.

---

## 13. Risques, mesures de sécurité et dimensionnement matériel (Sections 15 & 16)

### 13.1 Risques et mesures de sécurité
| Risque identifié | Gravité | Mesure de protection intégrée à l'architecture |
|---|---|---|
| **Exposition de PostgreSQL ou MinIO sur Internet ou sur le LAN** | Critique | Aucune directive `ports:` sur `postgres`, `minio`, `backend` ou `frontend` ; réseau Docker `internal: true` étanche. |
| **Échec des URLs pré-signées MinIO entre HTTP LAN et HTTPS Internet** | Élevée | Double client de signature S3 dans `S3StorageProvider` sélectionnant l'origine (`http://LAN_HOST` vs `https://PUBLIC_DOMAIN`) selon l'en-tête `Host` de la requête. |
| **Partage du quota de Rate-Limiting entre tous les internautes** | Élevée | `trusted_proxies static 172.16.0.0/12` dans Caddy + `TRUSTED_PROXY_HOPS=2` dans NestJS pour préserver l'IP cliente réelle à travers `cloudflared` $\rightarrow$ `caddy` $\rightarrow$ `backend`. |
| **Limite de taille d'upload Cloudflare gratuit (100 Mo)** | Faible | La limite applicative des CV PsyRekrute est de **5 Mo** (`10 Mo` dans Caddy), très inférieure au plafond de 100 Mo de Cloudflare Free. |
| **Coupure de courant ou mise en veille du PC Windows** | Moyenne | Désactivation de la mise en veille Windows, `restart: unless-stopped` sur tous les conteneurs, sauvegarde quotidienne `backup.ps1` et recommandation d'un onduleur (UPS) si le PC est un poste fixe. |

### 13.2 Estimation des ressources matérielles nécessaires sur le PC du collègue (Section 16)
| Ressource | Minimum fonctionnel | Recommandé pour un confort optimal | Consommation estimée des conteneurs PsyRekrute |
|---|---|---|---|
| **Processeur (CPU)** | 4 cœurs / 4 threads (x86_64 avec virtualisation VT-x / AMD-V activée) | 4 à 8 cœurs modernes (Intel Core i5 / AMD Ryzen 5 ou supérieur) | ~5 % au repos, ~30–50 % lors des calculs Argon2id (64 Mio, `p=4`). |
| **Mémoire vive (RAM)** | **8 Go** (dont 4 Go alloués à WSL2 / Docker Desktop) | **16 Go** (dont 6 Go alloués à WSL2 via `.wslconfig`) | PostgreSQL (~150 Mo) + MinIO (~180 Mo) + NestJS (~180 Mo) + Next.js standalone (~140 Mo) + Caddy (~30 Mo) + `cloudflared` (~40 Mo) = **~720 Mo pour les conteneurs** (+ ~1,2 Go pour le noyau Linux WSL2). |
| **Stockage disque (SSD)** | 20 Go libres sur SSD | 40 Go libres sur SSD NVMe | Images Docker (~1,8 Go) + Base PostgreSQL (~100 Mo) + CV PDF MinIO (5 Mo $\times$ 1 000 CV = 5 Go) + Sauvegardes (~2 Go). |
| **Alimentation** | Secteur permanent | Portable sur secteur (batterie faisant office d'onduleur intégré) ou PC fixe sur onduleur (UPS 600 VA) | Protège PostgreSQL contre les arrêts électriques brusques. |

---

## 14. Validation technique complémentaire — Réseaux, S3, Proxy et Cookies

Cette section documente les vérifications approfondies réalisées en lecture seule avant l'autorisation du Lot 1.

---

### 14.1 Segmentation réseau Docker à 3 zones (`internal`, `storage-edge`, `edge`)

#### A. Problème identifié dans une topologie à 2 réseaux
- Si `minio` est placé uniquement sur `internal` (`internal: true`) et `caddy` uniquement sur `edge`, Caddy ne peut pas joindre `minio:9000` pour servir les URLs pré-signées `/psyrekrute-documents/*`.
- Inversement, si l'on attache `minio` au réseau `edge`, alors `minio` partage le même pont réseau que `frontend` et `cloudflared` et dispose d'une passerelle sortante vers Internet.

#### B. Topologie sécurisée à 3 réseaux avec sous-réseaux CIDR déterministes

```mermaid
flowchart LR
    subgraph Edge["1. Réseau 'edge' (172.28.2.0/24 - bridge)"]
        CF["cloudflared"]
        Caddy1["caddy (:80)"]
        FE["frontend (:3000)"]
        BE1["backend (:4000)"]
    end

    subgraph StorageEdge["2. Réseau 'storage-edge' (172.28.1.0/24 - internal: true)"]
        Caddy2["caddy"]
        MinIO1["minio (:9000)"]
    end

    subgraph Internal["3. Réseau 'internal' (172.28.0.0/24 - internal: true)"]
        BE2["backend"]
        MinIO2["minio (:9000)"]
        MinIOInit["minio-init"]
        PG[("postgres (:5432)")]
        DBInit["db-init"]
    end

    CF -->|"HTTP :80"| Caddy1
    Caddy1 -->|"HTTP :3000"| FE
    Caddy1 -->|"HTTP :4000"| BE1
    Caddy2 -->|"/psyrekrute-documents/* -> :9000"| MinIO1
    BE2 -->|"Prisma :5432"| PG
    DBInit -->|"Migrate/Seed :5432"| PG
    BE2 -->|"S3 API :9000"| MinIO2
    MinIOInit -->|"Bucket init :9000"| MinIO2
```

#### C. Justification de chaque attachement réseau par service

| Service | `internal` (`172.28.0.0/24`, `internal: true`) | `storage-edge` (`172.28.1.0/24`, `internal: true`) | `edge` (`172.28.2.0/24`, `bridge`) | Ports publiés sur l'hôte | Justification de sécurité |
|---|:---:|:---:|:---:|:---:|---|
| **`postgres`** | **OUI** | NON | NON | **Aucun** | Base de données strictement isolée : ni `caddy`, ni `frontend`, ni `cloudflared` ne peuvent joindre le port `5432`. Aucune sortie Internet. |
| **`db-init`** | **OUI** | NON | NON | **Aucun** | Conteneur éphémère de migration/seed accédant uniquement à `postgres:5432`. |
| **`minio`** | **OUI** | **OUI** | **NON** | **Aucun** | Joignable par `backend`/`minio-init` via `internal` et par `caddy` via `storage-edge`. **Inaccessible depuis `frontend` et `cloudflared`, et privé de toute sortie Internet (`internal: true` sur ses 2 réseaux).** |
| **`minio-init`** | **OUI** | NON | NON | **Aucun** | Conteneur éphémère configurant le bucket privé sur `minio:9000`. |
| **`backend`** | **OUI** | NON | **OUI** | **Aucun** | Doit joindre `postgres` et `minio` (`internal`), être appelé par `caddy` (`edge`) et pouvoir interroger le flux RSS Dreamjob.ma en sortie (`edge`, protégé par `ssrf-guard.util.ts`). |
| **`frontend`** | NON | NON | **OUI** | **Aucun** | Appelé uniquement par `caddy:80` sur `edge`. Aucun accès à `postgres` ni à `minio`. |
| **`caddy`** | NON | **OUI** | **OUI** | **`80:80`** | Reçoit le trafic LAN (`80:80`) et `cloudflared` (`edge`), route vers `frontend`/`backend` (`edge`) et vers `minio:9000` (`storage-edge`). Aucun accès à `postgres`. |
| **`cloudflared`** | NON | NON | **OUI** | **Aucun** | Établit le tunnel sortant vers Cloudflare et remet le trafic HTTP uniquement à `caddy:80` sur `edge`. Aucun accès direct à `postgres` ni à `minio`. |

---

### 14.2 Signature S3 (`S3_PUBLIC_ENDPOINT`), Liste blanche stricte et AWS SigV4

#### A. Risque d'injection d'en-tête `Host` et principe de la liste blanche
- Si le backend utilisait directement la valeur brute de `req.headers.host` pour construire l'endpoint d'un `S3Client`, un attaquant pourrait envoyer `Host: evil.example.com` et obtenir une URL pré-signée pointant vers un domaine externe malveillant contenant les métadonnées de signature (`X-Amz-Credential`, `X-Amz-Date`).
- **Règle impérative :** L'origine de signature ne doit **jamais** être construite dynamiquement à partir de la requête. Elle doit être sélectionnée dans une **liste blanche immuable pré-compilée au démarrage** à partir de `S3_PUBLIC_ENDPOINT`.

#### B. Algorithme exact de la liste blanche dans `S3StorageProvider`
1. **Au démarrage (`constructor` de `S3StorageProvider`) :**
   - `S3_PUBLIC_ENDPOINT` contient la liste blanche configurée par l'administrateur dans `docker/.env.lan`, par exemple :
     `S3_PUBLIC_ENDPOINT=http://192.168.1.50,https://psyrekrute.votredomaine.ma`
   - Chaque entrée est validée via `new URL(rawEntry.trim())` :
     - Le protocole doit être `http:` ou `https:`.
     - Un `S3Client` dédié (`forcePathStyle: true`, `endpoint: parsedUrl.origin`) est instancié et stocké dans `private readonly presignersByHost = new Map<string, S3Client>()` avec pour clé `parsedUrl.host.toLowerCase()` (ex. `'192.168.1.50'` et `'psyrekrute.votredomaine.ma'`).
     - Le premier client de la liste est conservé comme `private readonly defaultPresignerClient: S3Client`.
2. **Lors d'une requête d'upload ou de téléchargement (`createUploadUrl` / `createDownloadUrl`) :**
   - Le contrôleur extrait `const requestHost = req.headers.host` et le passe à `StorageService`.
   - `S3StorageProvider` normalise la clé : `const keyHost = (requestHost ?? '').trim().toLowerCase()`.
   - Recherche stricte en lecture seule dans la `Map` :
     ```typescript
     const signer = this.presignersByHost.get(keyHost) ?? this.defaultPresignerClient;
     ```
   - **Garantie de sécurité :** Si un en-tête `Host` inconnu ou falsifié est transmis, `.get(keyHost)` retourne `undefined` et le système utilise `defaultPresignerClient`. Aucune URL hors liste blanche ne peut jamais être générée.

#### C. Comportement AWS SigV4 (Upload `PUT` et Download `GET`) à travers Caddy
- **Paramètres couverts par la signature HMAC-SHA256 (`@aws-sdk/s3-request-presigner`) :**
  - Méthode HTTP (`PUT` pour `createUploadUrl`, `GET` pour `createDownloadUrl`) : une URL de téléchargement ne peut jamais servir à écraser un fichier, et inversement.
  - Chemin canonique : `/psyrekrute-documents/candidates/<candidateId>/cv/<uuid>.pdf`.
  - En-tête signé : `X-Amz-SignedHeaders=host` (le `Host` exact de l'origine blanche sélectionnée).
  - Durée de validité : `X-Amz-Expires=900` (15 minutes).
- **Durcissement de la route MinIO dans `Caddyfile` :**
  Pour empêcher toute requête non signée ou méthode destructive (`DELETE`, `POST`) d'atteindre MinIO via Caddy :
  ```caddyfile
  @s3_presigned {
      path /psyrekrute-documents/candidates/*
      method GET HEAD PUT
      query X-Amz-Signature=*
  }
  handle @s3_presigned {
      reverse_proxy minio:9000
  }
  handle /psyrekrute-documents/* {
      respond "Forbidden" 403
  }
  ```
  Ainsi, Caddy ne laisse passer vers `minio:9000` que les requêtes `GET`, `HEAD` ou `PUT` visant `/psyrekrute-documents/candidates/*` et portant effectivement une signature `X-Amz-Signature`.

---

### 14.3 Proxy, En-têtes transmis, Sous-réseaux CIDR et Rate Limiting

#### A. Analyse du risque de `TRUSTED_PROXIES=uniquelocal` avec `TRUSTED_PROXY_HOPS=2`
- Dans `backend/src/modules/auth/ip-extractor.util.ts:91-97`, le mot-clé `uniquelocal` autorise simultanément `10.0.0.0/8`, `172.16.0.0/12` et `192.168.0.0/16`.
- Or, les appareils connectés au Wi-Fi local (LAN) possèdent eux-mêmes des adresses IP dans `192.168.0.0/16` (ou `10.0.0.0/8`). Un poste client du Wi-Fi ne doit **jamais** être considéré comme un proxy de confiance par Express.
- De plus, `ip-extractor.util.ts:100-122` supporte nativement la notation CIDR explicite (ex. `172.28.2.0/24`).

#### B. Chaîne de confiance exacte avec le sous-réseau `edge` (`172.28.2.0/24`)
En fixant le sous-réseau Docker `edge` à `172.28.2.0/24` dans `docker-compose.lan.yml` :
1. **Dans `Caddyfile` :** `trusted_proxies static 172.28.2.0/24`
2. **Dans `backend` (`.env.lan`) :**
   - `TRUSTED_PROXIES=127.0.0.0/8,::1,172.28.2.0/24`
   - `TRUSTED_PROXY_HOPS=2`

| Scénario d'accès | Connexion reçue par Caddy | En-têtes envoyés par Caddy au Backend (`socket = 172.28.2.x`) | Évaluation par Express (`ip-extractor.util.ts`) | IP finale `req.ip` (Rate Limiting & Audit) |
|---|---|---|---|---|
| **1. Client LAN honnête** (`192.168.1.120`) | `192.168.1.120` (hors `172.28.2.0/24`) | `X-Forwarded-For: 192.168.1.120`<br>`X-Forwarded-Proto: http` | `hop 0` (`172.28.2.x` Caddy) = **Confiance**.<br>Fin de chaîne `XFF`. | **`192.168.1.120`** (IP LAN réelle de l'appareil) |
| **2. Client LAN tentant d'usurper `X-Forwarded-For: 1.2.3.4` ou `X-Forwarded-Proto: https`** | `192.168.1.120` (non approuvé par Caddy) | Caddy **écrase** les en-têtes entrants et émet :<br>`X-Forwarded-For: 192.168.1.120`<br>`X-Forwarded-Proto: http` | `hop 0` (`172.28.2.x` Caddy) = **Confiance**.<br>L'IP forgée `1.2.3.4` a été éliminée par Caddy. | **`192.168.1.120`** (Usurpation neutralisée) |
| **3. Client Internet via Cloudflare Tunnel** (`196.200.10.20` $\rightarrow$ `cloudflared 172.28.2.y`) | `172.28.2.y` (approuvé par Caddy car dans `172.28.2.0/24`) | `X-Forwarded-For: 196.200.10.20, 172.28.2.y`<br>`X-Forwarded-Proto: https` | `hop 0` (`172.28.2.x` Caddy) = **Confiance**.<br>`hop 1` (`172.28.2.y` cloudflared) = **Confiance**.<br>`maxHops=2` atteint. | **`196.200.10.20`** (IP Internet réelle du client) |

*(Ce comportement de `createExpressTrustProxyValidator('127.0.0.0/8,::1,172.28.2.0/24', 2)` a été testé et validé par assertions sur le module compilé `dist/src/modules/auth/ip-extractor.util.js`.)*

---

### 14.4 Gestion des Cookies (`COOKIE_SECURE=auto`) en LAN HTTP et Internet HTTPS

#### A. Sécurité contre les en-têtes `X-Forwarded-Proto` non fiables
- Pour déterminer si la requête courante est en HTTPS lors de l'émission ou de la suppression du cookie `psyrekrute_refresh_token`, le backend **ne doit pas lire `req.headers['x-forwarded-proto']` directement**.
- Il doit utiliser **`Boolean(req.secure || req.protocol === 'https')`** fourni par Express : Express ne valorise `req.protocol = 'https'` à partir de `X-Forwarded-Proto` **que si la connexion provient d'un proxy validé par `configureTrustedProxies` (`172.28.2.0/24`)**.
- Comme Caddy (`172.28.2.0/24`) réinitialise systématiquement `X-Forwarded-Proto: http` sur toute connexion provenant du Wi-Fi LAN (`192.168.x.x`), un client LAN ne peut jamais tromper `req.secure`.

#### B. Comportement exact de `resolveRefreshCookieSecure` avec `COOKIE_SECURE=auto`

| Valeur de `COOKIE_SECURE` | Accès LAN (`http://192.168.1.50`, `req.secure === false`) | Accès Internet Cloudflare (`https://DOMAINE`, `req.secure === true`) | Attributs constants conservés dans tous les cas |
|---|---|---|---|
| `auto` *(recommandé en hybride LAN + Internet)* | `Secure: false` (cookie accepté en HTTP sur le Wi-Fi) | **`Secure: true`** (cookie protégé par le drapeau `Secure` sur Internet) | `HttpOnly: true`<br>`SameSite: 'lax'`<br>`Path: '/api/v1/auth'`<br>`Domain: undefined` *(host-only)*<br>`Max-Age: 7 jours` |
| `false` *(démo LAN pure sans HTTPS)* | `Secure: false` | `Secure: false` | Idem |
| `true` *(ou non défini en prod pure HTTPS)* | `Secure: true` *(rejeté par le navigateur en HTTP)* | `Secure: true` | Idem |

- **Cohérence à la déconnexion (`clearRefreshTokenCookie`) :** `auth.controller.ts` passe également `req` à `clearRefreshTokenCookie(res, req)` afin que les attributs `secure`, `httpOnly`, `sameSite` et `path` du cookie effacé correspondent exactement à ceux du cookie émis.

---

### 14.5 Récapitulatif des fichiers concernés par le Lot 1 et le Lot 2

#### Lot 1 — Adaptations ciblées du code Backend (6 fichiers)
1. [backend/src/modules/candidates/candidates.service.ts](file:///c:/Users/PC/Desktop/PsyRekrute/backend/src/modules/candidates/candidates.service.ts#L373-L433) :
   - Validation stricte du préfixe `^candidates/${profile.id}/cv/[0-9a-f-]{36}\.pdf$` dans `confirmCvUpload` (`ANOM-02`).
   - Vérification de la taille ($\le 5\text{ Mo}$) et des magic bytes `%PDF-` sur l'objet stocké avant confirmation (`ANOM-03`).
   - Passage de `requestHost` à `generateUploadPresignedUrl` et `generateDownloadPresignedUrl`.
2. [backend/src/modules/storage/s3-storage.provider.ts](file:///c:/Users/PC/Desktop/PsyRekrute/backend/src/modules/storage/s3-storage.provider.ts) & [storage.service.ts](file:///c:/Users/PC/Desktop/PsyRekrute/backend/src/modules/storage/storage.service.ts) & [storage.module.ts](file:///c:/Users/PC/Desktop/PsyRekrute/backend/src/modules/storage/storage.module.ts) :
   - Pré-instanciation de la liste blanche `presignersByHost: Map<string, S3Client>` à partir de `S3_PUBLIC_ENDPOINT` (support d'une ou plusieurs origines séparées par virgule).
   - Sélection en lecture seule du `S3Client` de signature selon `requestHost` (avec repli sur `defaultPresignerClient`).
3. [backend/src/modules/candidates/candidates.controller.ts](file:///c:/Users/PC/Desktop/PsyRekrute/backend/src/modules/candidates/candidates.controller.ts#L173-L216) & [backend/src/modules/applications/applications.controller.ts](file:///c:/Users/PC/Desktop/PsyRekrute/backend/src/modules/applications/applications.controller.ts#L204-L236) (`+ applications.service.ts`) :
   - Transmission de `req.headers.host` lors des appels à `generateCvUploadUrl`, `generateCvDownloadUrl` et `getCvDownloadUrl`.
4. [backend/src/modules/auth/refresh-cookie.util.ts](file:///c:/Users/PC/Desktop/PsyRekrute/backend/src/modules/auth/refresh-cookie.util.ts) & [backend/src/modules/auth/auth.controller.ts](file:///c:/Users/PC/Desktop/PsyRekrute/backend/src/modules/auth/auth.controller.ts) :
   - Support de `COOKIE_SECURE=auto` basé sur `Boolean(req?.secure || req?.protocol === 'https')`.
   - Ajout de `@UseGuards(ProxyAwareThrottlerGuard)` et `@Throttle({ default: { limit: 20, ttl: 60000 } })` sur `POST /api/v1/auth/refresh` (`ANOM-07`).
5. [backend/src/modules/external-jobs/ssrf-guard.util.spec.ts](file:///c:/Users/PC/Desktop/PsyRekrute/backend/src/modules/external-jobs/ssrf-guard.util.spec.ts#L225-L328) :
   - Suppression des 4 variables inutilisées signalées par ESLint (`ANOM-07`).

#### Lot 2 — Fichiers d'orchestration Docker et scripts Windows (7 nouveaux fichiers)
1. `docker/docker-compose.lan.yml` (avec les 3 réseaux `internal` `172.28.0.0/24`, `storage-edge` `172.28.1.0/24`, `edge` `172.28.2.0/24`)
2. `docker/caddy/Caddyfile` (avec `trusted_proxies static 172.28.2.0/24` et matcher `@s3_presigned`)
3. `docker/.env.lan.example`
4. `scripts/windows/start-lan.ps1`
5. `scripts/windows/stop-lan.ps1`
6. `scripts/windows/backup.ps1`
7. `scripts/windows/restore.ps1`

---

## 15. Validation finale avant autorisation du Lot 1 — Chaîne de proxys & Signature S3

Cette section consigne les résultats des vérifications empiriques exécutées en lecture seule sur les implémentations compilées (`express`, `proxy-addr`, `ip-extractor.util.ts`, `ProxyAwareThrottlerGuard`, `audit.service.ts`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `s3-storage.provider.ts` et le code frontend).

---

### 15.1 Fichiers réellement examinés et testés en mémoire

1. [backend/src/modules/auth/ip-extractor.util.ts](file:///c:/Users/PC/Desktop/PsyRekrute/backend/src/modules/auth/ip-extractor.util.ts#L1-L191) (`createExpressTrustProxyValidator`, `configureTrustedProxies`, `extractClientIp`)
2. [backend/src/modules/auth/proxy-throttler.guard.ts](file:///c:/Users/PC/Desktop/PsyRekrute/backend/src/modules/auth/proxy-throttler.guard.ts#L1-L16) (`ProxyAwareThrottlerGuard.getTracker`)
3. [backend/src/modules/audit/audit.service.ts](file:///c:/Users/PC/Desktop/PsyRekrute/backend/src/modules/audit/audit.service.ts#L103-L183) (`normalizeAuditIp`, `buildData`)
4. [backend/src/modules/storage/s3-storage.provider.ts](file:///c:/Users/PC/Desktop/PsyRekrute/backend/src/modules/storage/s3-storage.provider.ts#L1-L66) (`S3StorageProvider`, `createUploadUrl`, `createDownloadUrl`)
5. [backend/src/modules/storage/storage.service.ts](file:///c:/Users/PC/Desktop/PsyRekrute/backend/src/modules/storage/storage.service.ts#L1-L51) (`generateUploadPresignedUrl`, `generateDownloadPresignedUrl`)
6. [frontend/src/app/[locale]/candidate/profile/page.tsx](file:///c:/Users/PC/Desktop/PsyRekrute/frontend/src/app/%5Blocale%5D/candidate/profile/page.tsx#L355-L396) (`fetch(uploadInfo.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: file })` et `window.open(data.downloadUrl, '_blank')`)
7. [frontend/src/app/[locale]/organization/offers/page.tsx](file:///c:/Users/PC/Desktop/PsyRekrute/frontend/src/app/%5Blocale%5D/organization/offers/page.tsx#L616-L617) (`applicationsApi.getCvDownloadUrl(app.candidateId)`)

---

### 15.2 Sujet 1 — Sécurité de la chaîne de proxys, IPs statiques et anti-usurpation

#### A. Pourquoi faire confiance à tout le sous-réseau `172.28.2.0/24` serait excessif
Sur le réseau Docker `edge` (`172.28.2.0/24`), quatre conteneurs sont présents : `caddy`, `cloudflared`, `frontend` et `backend`.
- Si `TRUSTED_PROXIES` faisait confiance à l'ensemble du CIDR `172.28.2.0/24`, le conteneur **`frontend` (`Next.js`)** serait lui aussi considéré comme un proxy de confiance par `backend` et par `caddy`.
- En cas de compromission du conteneur `frontend`, celui-ci pourrait appeler directement `http://backend:4000/api/v1/auth/login` en forgeant `X-Forwarded-For` (contournement du rate limiting `ProxyAwareThrottlerGuard` et falsification de `ipAddress` dans `AUDIT_LOGS`) et `X-Forwarded-Proto: https`.
- **Correction architecturale retenue :** Attribuer des **adresses IPv4 statiques** sur le réseau `edge` (`172.28.2.0/24`) et restreindre la confiance aux **seules adresses IP unitaires (`/32`) des proxys réels** :
  - `caddy` : **`172.28.2.10`**
  - `cloudflared` : **`172.28.2.11`**
  - `frontend` : **`172.28.2.20`** *(non approuvé comme proxy)*
  - `backend` : **`172.28.2.30`**
  - Dans `Caddyfile` : **`trusted_proxies static 172.28.2.11`** (Caddy fait confiance **exclusivement** à `cloudflared`).
  - Dans `backend` (`.env.lan`) : **`TRUSTED_PROXIES=172.28.2.10,172.28.2.11`** et **`TRUSTED_PROXY_HOPS=2`** (Express fait confiance **exclusivement** à `caddy` et `cloudflared`, jamais à `frontend` ni aux clients LAN).

#### B. Chaîne détaillée n°1 : Client LAN $\rightarrow$ Caddy $\rightarrow$ Backend (1 saut proxy)

```text
[Client Wi-Fi LAN : 192.168.1.120]
       │  Requête HTTP directe sur port 80
       │  (Même si le client tente d'injecter X-Forwarded-For: 1.2.3.4, 172.28.2.11 et X-Forwarded-Proto: https)
       ▼
[Caddy : 172.28.2.10 (:80)]
       │  1. Vérifie remote_ip (192.168.1.120) contre `trusted_proxies static 172.28.2.11` -> NON FIABLE.
       │  2. Écrase/supprime les en-têtes X-Forwarded-* entrants non fiables.
       │  3. Écrit :
       │     X-Forwarded-For: 192.168.1.120
       │     X-Forwarded-Proto: http
       │     X-Forwarded-Host: 192.168.1.50
       ▼
[Backend NestJS / Express : 172.28.2.30 (:4000)]
       │  1. `req.socket.remoteAddress` = 172.28.2.10 (hopIndex = 0).
       │  2. `validator('172.28.2.10', 0)` -> TRUE (hop 0 < maxHops 2, et 172.28.2.10 ∈ {172.28.2.10, 172.28.2.11}).
       │  3. `proxy-addr` lit l'entrée à droite de X-Forwarded-For : 192.168.1.120 (hopIndex = 1).
       │  4. `validator('192.168.1.120', 1)` -> FALSE (non proxy) : l'évaluation s'arrête immédiatement sur 192.168.1.120.
       │  5. Résultat Express :
       │     - `req.ip` / `extractClientIp(req)` = '192.168.1.120'
       │     - `req.protocol` = 'http' / `req.secure` = false
```

- **Preuve de non-falsification par un client LAN (double barrière testée avec `proxy-addr`) :**
  1. **Barrière 1 (Caddy) :** `192.168.1.120` n'étant pas `172.28.2.11`, Caddy écrase systématiquement `X-Forwarded-For` par `192.168.1.120` et `X-Forwarded-Proto` par `http`.
  2. **Barrière 2 (Express `proxy-addr`, défense en profondeur) :** Même si Caddy avait concaténé au lieu d'écraser (`X-Forwarded-For: 1.2.3.4, 172.28.2.11, 192.168.1.120`), `proxy-addr` parcourt la liste **de droite à gauche** : au saut `hopIndex = 1`, l'adresse à droite est `192.168.1.120`, qui est rejetée par `validator('192.168.1.120', 1) === false`. L'algorithme s'arrête donc toujours à `192.168.1.120` et ignore tout ce qui se trouve à gauche.

#### C. Chaîne détaillée n°2 : Client Internet $\rightarrow$ Cloudflare $\rightarrow$ `cloudflared` $\rightarrow$ Caddy $\rightarrow$ Backend (2 sauts proxys internes)

```text
[Client Internet : 196.200.10.20]
       │  Requête HTTPS TLS 1.3 vers https://DOMAINE_PSYREKRUTE
       │  (Même si le client envoie un faux en-tête X-Forwarded-For: 8.8.8.8)
       ▼
[Cloudflare Edge -> Tunnel chiffré -> Conteneur cloudflared : 172.28.2.11]
       │  Transmet à http://caddy:80 depuis l'IP source 172.28.2.11 :
       │     CF-Connecting-IP: 196.200.10.20
       │     X-Forwarded-For: 196.200.10.20 (ou 8.8.8.8, 196.200.10.20)
       │     X-Forwarded-Proto: https
       │     Host: DOMAINE_PSYREKRUTE
       ▼
[Caddy : 172.28.2.10 (:80)]
       │  1. Vérifie remote_ip (172.28.2.11) contre `trusted_proxies static 172.28.2.11` -> FIABLE.
       │  2. Conserve X-Forwarded-Proto: https.
       │  3. Ajoute 172.28.2.11 à droite de X-Forwarded-For :
       │     X-Forwarded-For: [8.8.8.8, ]196.200.10.20, 172.28.2.11
       ▼
[Backend NestJS / Express : 172.28.2.30 (:4000)]
       │  1. `hopIndex = 0` (`req.socket.remoteAddress` = 172.28.2.10 Caddy) -> `validator` = TRUE.
       │  2. `hopIndex = 1` (entrée droite de XFF = 172.28.2.11 cloudflared) -> `validator` = TRUE.
       │  3. `hopIndex = 2` (entrée suivante à gauche = 196.200.10.20) -> `hopIndex >= maxHops (2)` -> FALSE (arrêt).
       │  4. Résultat Express :
       │     - `req.ip` / `extractClientIp(req)` = '196.200.10.20' (tout préfixe forgé `8.8.8.8` à gauche est ignoré)
       │     - `req.protocol` = 'https' / `req.secure` = true
```

- **Résultat du test d'exécution Node.js sur `dist/src/modules/auth/ip-extractor.util.js` + `proxy-addr` :**
  ```text
  Case 1 (LAN honest):                         { ip: '192.168.1.120', protocol: 'http',  secure: false }
  Case 2a (LAN spoof blocked by Caddy):        { ip: '192.168.1.120', protocol: 'http',  secure: false }
  Case 2b (LAN spoof even if Caddy appended):  { ip: '192.168.1.120', protocol: 'http',  secure: false }
  Case 3 (Internet via cloudflared):           { ip: '196.200.10.20', protocol: 'https', secure: true  }
  Case 4 (Internet client spoofing XFF):       { ip: '196.200.10.20', protocol: 'https', secure: true  }
  Case 5 (Compromised frontend direct call):   { ip: '172.28.2.20',   protocol: 'http',  secure: false }
  ```

---

### 15.3 Sujet 2 — Signature S3, Normalisation `Host`, Liste blanche et Flux Caddy

#### A. Normalisation de l'en-tête `Host` et gestion des ports
L'examen de `@aws-sdk/client-s3` et `@aws-sdk/s3-request-presigner` montre que :
1. Lorsqu'une origine est analysée par `const u = new URL(origin)` :
   - Les ports standards (`:80` en `http:` et `:443` en `https:`) sont automatiquement omis par `u.host` (ex. `new URL('http://192.168.1.50:80').host === '192.168.1.50'`).
   - Les ports non standards (ex. `:8080` ou `:9000`) sont conservés dans `u.host` (`'192.168.1.50:8080'`).
2. Pour éviter tout décalage si un client HTTP envoie explicitement le port par défaut (`Host: 192.168.1.50:80` ou `Host: DOMAINE:443`) ou des majuscules (`Host: PsyRekrute.Example.ma`), la fonction de normalisation `normalizeRequestHost(rawHost)` dans `S3StorageProvider` appliquera :
   - `trim().toLowerCase()`
   - Rejet immédiat de tout caractère hors `^[a-z0-9.-]+(:\d{1,5})?$` (ou `[a-f0-9:]+` pour IPv6).
   - Indexation dans la `Map` à la fois sous la forme canonique sans port par défaut (`192.168.1.50`) et avec port par défaut explicite (`192.168.1.50:80` pour une origine `http:`, `domaine:443` pour une origine `https:`), pointant vers le même `S3Client` pré-instancié.

#### B. Comportement face à un `Host` inconnu, absent ou falsifié
- **Cas 1 (`requestHost` présent et appartenant à la liste blanche `S3_PUBLIC_ENDPOINT`) :** Sélectionne le `S3Client` pré-instancié correspondant (`http://192.168.1.50` ou `https://DOMAINE_PSYREKRUTE`).
- **Cas 2 (`requestHost` présent mais INCONNU / FALSIFIÉ, ex. `Host: evil.attacker.com` ou `Host: 10.0.0.1`) :**
  - Au lieu de retomber silencieusement sur une origine par défaut, **`S3StorageProvider` lève une exception `ForbiddenException('Untrusted Host header for storage presigning')` (`403 Forbidden`)** !
  - Ainsi, toute requête présentant un en-tête `Host` non inscrit dans la liste blanche `S3_PUBLIC_ENDPOINT` (ou `S3_ENDPOINT`) se voit refuser la génération d'URL pré-signée.
- **Cas 3 (`requestHost` absent / `undefined`, ex. appel interne ou test unitaire hors contrôleur HTTP) :** Utilise `defaultPresignerClient` (première origine de la liste blanche).

#### C. Cohérence AWS SigV4 entre l'URL signée, l'appel Frontend et le proxy Caddy
Le test empirique sur `@aws-sdk/client-s3` v3.577.0 confirme les faits suivants :
1. **En-têtes signés (`X-Amz-SignedHeaders`) :**
   - Tant pour `PutObjectCommand` (`ContentType: 'application/pdf'`) que pour `GetObjectCommand`, `@aws-sdk/s3-request-presigner` signe **`X-Amz-SignedHeaders=host` uniquement**.
   - Conséquence importante : lorsque Caddy transmet la requête à `minio:9000` sur le réseau `storage-edge` et ajoute `X-Forwarded-For` ou `X-Forwarded-Proto`, **ces en-têtes ajoutés par Caddy n'invalident pas la signature AWS SigV4**, car MinIO ne vérifie la signature que sur les en-têtes listés dans `X-Amz-SignedHeaders` (`host`), la méthode HTTP (`PUT` ou `GET`), le chemin exact (`/psyrekrute-documents/candidates/...`) et les paramètres de query string `X-Amz-*`.
2. **Conservation du chemin, de la query string et du `Host` par Caddy :**
   - Dans Caddy v2, `handle @s3_presigned { reverse_proxy minio:9000 }` (sans directive `uri strip_prefix` ni `rewrite`) **conserve intégralement le chemin `/psyrekrute-documents/candidates/<id>/cv/<uuid>.pdf`, la query string `?X-Amz-Algorithm=...` et l'en-tête `Host` d'origine**.
   - **Règle critique :** Ne jamais utiliser `handle_path` (qui supprimerait le préfixe `/psyrekrute-documents` et ferait échouer la signature SigV4 ainsi que la résolution du bucket par MinIO en mode `forcePathStyle: true`) ; utiliser exclusivement **`handle`**.

#### D. Matrice de validation des scénarios S3 / MinIO / Caddy

| Scénario | Origine / En-tête `Host` | Action Backend (`S3StorageProvider`) | Action Caddy (`:80`) & MinIO (`:9000`) | Résultat attendu |
|---|---|---|---|---|
| **1. Accès LAN légitime** | `http://192.168.1.50`<br>`Host: 192.168.1.50` | Sélectionne le client blanc `http://192.168.1.50` ; signe `PUT`/`GET` avec `host:192.168.1.50`. | Caddy vérifie `@s3_presigned` (`GET`/`HEAD`/`PUT` + `X-Amz-Signature`), transmet à `minio:9000` via `storage-edge` avec `Host: 192.168.1.50`. MinIO valide SigV4. | **Upload (`200 OK`) & Download (`200 OK`) fonctionnels** |
| **2. Accès Internet légitime** | `https://DOMAINE`<br>`Host: DOMAINE` | Sélectionne le client blanc `https://DOMAINE` ; signe `PUT`/`GET` avec `host:DOMAINE`. | `cloudflared` remet à Caddy avec `Host: DOMAINE`. Caddy transmet à `minio:9000` avec `Host: DOMAINE`. MinIO valide SigV4. | **Upload (`200 OK`) & Download (`200 OK`) fonctionnels en HTTPS (0 Mixed Content)** |
| **3. `Host` falsifié à la génération** | `Host: evil.attacker.com` sur `/api/v1/candidates/me/cv/upload-url` | `evil.attacker.com` absent de `presignersByHost` $\rightarrow$ lève `ForbiddenException`. | Aucune URL pré-signée n'est émise. | **`403 Forbidden` (Aucun accès à une origine arbitraire)** |
| **4. Signature invalide, expirée (>15m) ou `Host` modifié après signature** | LAN ou Internet sur `/psyrekrute-documents/...` | — | Caddy transmet à `minio:9000`, MinIO recalcule le HMAC-SHA256 et détecte l'écart. | **Requête refusée par MinIO (`403 SignatureDoesNotMatch` / `AccessDenied`)** |
| **5. Méthode non autorisée (`DELETE`, `POST`) ou absence de `X-Amz-Signature`** | Route `/psyrekrute-documents/*` | — | Ne correspond pas au matcher `@s3_presigned` (`method GET HEAD PUT` + `query X-Amz-Signature=*`) $\rightarrow$ intercepté par le `handle /psyrekrute-documents/*` de repli. | **`403 Forbidden` bloqué directement par Caddy** |

---

### 15.4 Conclusion de la validation finale pré-Lot 1

- **Statut :** **`VALIDÉ`**
- **Synthèse des garanties :**
  1. L'attribution d'IPs statiques sur le réseau `edge` (`caddy = 172.28.2.10`, `cloudflared = 172.28.2.11`) combinée à `trusted_proxies static 172.28.2.11` dans Caddy et `TRUSTED_PROXIES=172.28.2.10,172.28.2.11` (`TRUSTED_PROXY_HOPS=2`) dans NestJS élimine toute confiance envers le conteneur `frontend` ou les postes du LAN, tout en résolvant exactement l'IP cliente et le protocole (`http` vs `https`) en 1 saut (LAN) comme en 2 sauts (Internet).
  2. La liste blanche `presignersByHost` dans `S3StorageProvider` (rejetant en `403` tout `Host` inconnu) combinée à la directive `handle @s3_presigned` de Caddy sur le réseau isolé `storage-edge` (`internal: true`) garantit le fonctionnement natif des signatures AWS SigV4 en LAN HTTP et en Internet HTTPS sans jamais exposer MinIO.


