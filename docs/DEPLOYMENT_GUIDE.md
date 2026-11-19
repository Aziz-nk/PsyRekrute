# Guide de Déploiement en Production — PsyRekrute MVP

Ce document décrit la procédure complète, éprouvée et sécurisée pour déployer l'application **PsyRekrute** en production, conformément aux exigences du DCTF v3.1.2.

---

## 1. Architecture de Production

L'infrastructure repose sur un ensemble de conteneurs Docker orchestrés via `docker-compose.prod.yml`, isolés sur un réseau privé interne (`psyrekrute_prod_network`). Seul le reverse proxy Nginx expose les ports d'entrée publics HTTP (80) et HTTPS (443).

```
                      INTERNET / UTILISATEURS
                                │
                                ▼
                   ┌─────────────────────────┐
                   │   Nginx Reverse Proxy   │ (Ports 80 / 443)
                   │   - TLS 1.2 / 1.3       │
                   │   - Hardening Headers   │
                   │   - Gzip Compression    │
                   └────────────┬────────────┘
                                │
        ┌───────────────────────┴───────────────────────┐
        │ / (Trafic Web)                                │ /api/ (Trafic REST)
        ▼                                               ▼
┌───────────────────────────┐               ┌───────────────────────────┐
│     Frontend Next.js      │               │      Backend NestJS       │
│  - Mode Standalone        │               │  - Helmet HTTP Security   │
│  - Node.js 20 Alpine      │               │  - Strict CORS            │
│  - i18n FR / AR / EN      │               │  - Swagger désactivé      │
│  - Port 3000 (interne)    │               │  - Port 4000 (interne)    │
└───────────────────────────┘               └─────────────┬─────────────┘
                                                          │
                                ┌─────────────────────────┴─────────────────────────┐
                                │                                                   │
                                ▼                                                   ▼
                ┌───────────────────────────┐                       ┌───────────────────────────┐
                │   PostgreSQL 16 Alpine    │                       │     MinIO S3 Storage      │
                │  - Base relationnelle     │                       │  - Bucket privé sécurisé  │
                │  - Volume persistant      │                       │  - Stockage CVs & ICE     │
                │  - Sauvegardes SHA-256    │                       │  - Volume persistant      │
                └───────────────────────────┘                       └───────────────────────────┘
```

---

## 2. Prérequis Serveur

- **Système d'exploitation** : Ubuntu 22.04 LTS / 24.04 LTS ou Debian 12 (Bookworm).
- **Processeur & Mémoire** : Minimum 2 vCPU, 4 Go RAM (8 Go recommandés).
- **Stockage** : Minimum 40 Go SSD / NVMe.
- **Réseau** : Nom de domaine valide avec enregistrements DNS pointant vers l'IP publique du serveur :
  - `A` : `psyrekrute.ma` ➔ `<IP_PUBLIQUE>`
  - `CNAME` : `www.psyrekrute.ma` ➔ `psyrekrute.ma`
- **Logiciels requis sur l'hôte** :
  - Docker Engine v24+
  - Docker Compose v2.20+
  - OpenSSL
  - `cron` (pour l'ordonnancement des sauvegardes)

---

## 3. Configuration des Variables d'Environnement

1. Créer le fichier d'environnement de production à partir du gabarit fourni :
   ```bash
   cp .env.production.example .env.production
   chmod 600 .env.production
   ```

2. Générer des secrets cryptographiques d'au moins 256 bits (32 octets aléatoires) pour chaque variable sensible :
   ```bash
   # Génération des secrets JWT et mots de passe
   openssl rand -base64 32
   ```

3. Renseigner les valeurs dans `.env.production` :
   - `PRODUCTION_URL` : URL HTTPS finale (ex: `https://psyrekrute.ma`).
   - `POSTGRES_USER` / `POSTGRES_PASSWORD` : Identifiants forts de la base.
   - `S3_ACCESS_KEY` / `S3_SECRET_KEY` : Clés du stockage S3 / MinIO.
   - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` : Clés 256 bits générées à l'étape précédente.
   - `TRUSTED_PROXIES=loopback,linklocal,uniquelocal` : Permet la détection exacte de l'IP cliente derrière Nginx.

---

## 4. Obtention du Certificat SSL/TLS (Let's Encrypt)

### Option A : Initialisation avec Certbot sur l'hôte
```bash
# Installation de Certbot
sudo apt-get update && sudo apt-get install -y certbot

# Arrêt temporaire de tout service écoutant sur le port 80 si nécessaire
# Obtention du certificat via le mode standalone
sudo certbot certonly --standalone -d psyrekrute.ma -d www.psyrekrute.ma

# Création du volume Docker et copie des certificats
docker volume create psyrekrute_prod_ssl_certs
sudo cp -rL /etc/letsencrypt/live/psyrekrute.ma/* /var/lib/docker/volumes/psyrekrute_prod_ssl_certs/_data/
```

### Option B : Certificat existant ou wildcard
Copier le fichier `fullchain.pem` et la clé privée `privkey.pem` dans le dossier dédié ou monter le volume SSL :
```bash
mkdir -p /var/docker-volumes/psyrekrute/ssl
cp fullchain.pem /var/docker-volumes/psyrekrute/ssl/
cp privkey.pem /var/docker-volumes/psyrekrute/ssl/
chmod 600 /var/docker-volumes/psyrekrute/ssl/privkey.pem
```

---

## 5. Procédure de Déploiement Initial

### Étape 1 : Construction et démarrage de la pile de base
```bash
# Démarrer d'abord PostgreSQL et MinIO pour initialiser les données
docker compose --env-file .env.production -f docker/docker-compose.prod.yml up -d postgres minio minio-init

# Vérifier l'état de santé de la base
docker compose --env-file .env.production -f docker/docker-compose.prod.yml ps
```

### Étape 2 : Exécution des migrations de schéma Prisma
Ne JAMAIS exécuter `prisma db push` en production. Utiliser exclusivement la commande de déploiement des migrations :
```bash
docker compose --env-file .env.production -f docker/docker-compose.prod.yml run --rm backend npx prisma migrate deploy
```

### Étape 3 : Démarrage complet de l'application
```bash
# Construction et lancement de l'ensemble des conteneurs
docker compose --env-file .env.production -f docker/docker-compose.prod.yml up -d --build

# Vérification du bon démarrage de tous les services
docker compose --env-file .env.production -f docker/docker-compose.prod.yml ps
```

### Étape 4 : Validation de bon fonctionnement
1. Tester la sonde de santé HTTP :
   ```bash
   curl -I https://psyrekrute.ma/api/v1/health
   # Réponse attendue : HTTP/1.1 200 OK
   ```
2. Vérifier que Swagger est bien désactivé :
   ```bash
   curl -I https://psyrekrute.ma/api/docs
   # Réponse attendue : HTTP/1.1 404 Not Found
   ```
3. Vérifier les en-têtes de sécurité Helmet et Nginx :
   ```bash
   curl -I https://psyrekrute.ma/
   # Doit contenir Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options
   ```

---

## 6. Automatisation des Sauvegardes PostgreSQL

Le script `scripts/backup-db.sh` réalise un dump compressé `pg_dump` au format binaire optimisé (`-Fc`), calcule une empreinte d'intégrité SHA-256 et applique une rétention automatique (14 jours par défaut).

### Configuration de la tâche Cron quotidienne :
```bash
# Rendre le script exécutable
chmod +x scripts/backup-db.sh scripts/restore-db.sh

# Éditer la table cron de root
sudo crontab -e
```

Ajouter la ligne suivante pour exécuter la sauvegarde tous les jours à 02:30 UTC :
```cron
30 2 * * * /opt/psyrekrute/scripts/backup-db.sh >> /var/log/psyrekrute-backup.log 2>&1
```

---

## 7. Procédure de Restauration de Sinistre (Disaster Recovery)

En cas d'incident critique ou de corruption de données :

1. Identifier le fichier de sauvegarde le plus récent :
   ```bash
   ls -la /var/backups/psyrekrute/
   ```

2. Exécuter le script de restauration :
   ```bash
   # Mode interactif avec confirmation manuelle :
   ./scripts/restore-db.sh /var/backups/psyrekrute/psyrekrute_db_20261116_023000.dump

   # Ou en mode forcé (non-interactif) pour scripts de reprise :
   ./scripts/restore-db.sh /var/backups/psyrekrute/psyrekrute_db_20261116_023000.dump --force
   ```

Le script vérifie automatiquement l'intégrité SHA-256 avant toute modification et restaure la base en nettoyant l'ancien schéma.

---

## 8. Procédure de Mise à Jour Sans Interruption

Lors du déploiement d'une nouvelle version de code :

```bash
# 1. Récupération des modifications git
git pull origin main

# 2. Exécution des éventuelles migrations Prisma en amont
docker compose --env-file .env.production -f docker/docker-compose.prod.yml run --rm backend npx prisma migrate deploy

# 3. Reconstruction et redémarrage progressif sans coupure
docker compose --env-file .env.production -f docker/docker-compose.prod.yml up -d --build --no-deps backend frontend

# 4. Rechargement gracieux de Nginx
docker compose --env-file .env.production -f docker/docker-compose.prod.yml exec nginx nginx -s reload

# 5. Nettoyage des anciennes images inutilisées
docker image prune -f
```
