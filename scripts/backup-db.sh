#!/usr/bin/env bash
# ==============================================================================
# PsyRekrute - Script de Sauvegarde Automatisée PostgreSQL
# Format : pg_dump compressé (-Fc) avec empreinte SHA-256 et rétention
# ==============================================================================
set -euo pipefail

# Configuration par défaut (peut être surchargée via variables d'environnement)
BACKUP_DIR="${BACKUP_DIR:-/var/backups/psyrekrute}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"
BACKUP_FILENAME="psyrekrute_db_${TIMESTAMP}.dump"
BACKUP_FILEPATH="${BACKUP_DIR}/${BACKUP_FILENAME}"
CHECKSUM_FILEPATH="${BACKUP_FILEPATH}.sha256"

# Informations de connexion à la base
DB_CONTAINER="${DB_CONTAINER:-psyrekrute_prod_postgres}"
DB_USER="${POSTGRES_USER:-psyrekrute_prod_user}"
DB_NAME="${POSTGRES_DB:-psyrekrute_prod_db}"

echo "================================================================="
echo "[PsyRekrute Backup] Démarrage de la sauvegarde PostgreSQL"
echo "Date / Heure : $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "Cible        : ${BACKUP_FILEPATH}"
echo "================================================================="

# Création du répertoire de sauvegarde avec permissions restreintes
mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

# Exécution de la sauvegarde
# Si le conteneur Docker est en cours d'exécution, on utilise docker exec
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    echo "[Info] Exécution via le conteneur Docker : ${DB_CONTAINER}"
    docker exec -t "${DB_CONTAINER}" pg_dump \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        -F c \
        -b \
        -v > "${BACKUP_FILEPATH}"
else
    echo "[Info] Exécution directe via pg_dump local"
    pg_dump \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        -F c \
        -b \
        -v \
        -f "${BACKUP_FILEPATH}"
fi

# Vérification que le fichier de sauvegarde a été créé et n'est pas vide
if [ ! -s "${BACKUP_FILEPATH}" ]; then
    echo "[ERREUR CRITIQUE] Le fichier de sauvegarde est manquant ou vide !" >&2
    rm -f "${BACKUP_FILEPATH}"
    exit 1
fi

# Restriction des droits sur le fichier de sauvegarde (lecture/écriture propriétaire uniquement)
chmod 600 "${BACKUP_FILEPATH}"

# Génération du checksum SHA-256 pour garantie d'intégrité
echo "[Info] Calcul de l'empreinte SHA-256..."
if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${BACKUP_FILEPATH}" > "${CHECKSUM_FILEPATH}"
elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "${BACKUP_FILEPATH}" > "${CHECKSUM_FILEPATH}"
fi
chmod 600 "${CHECKSUM_FILEPATH}"

BACKUP_SIZE="$(du -h "${BACKUP_FILEPATH}" | cut -f1)"
echo "[Succès] Sauvegarde créée avec succès : ${BACKUP_FILENAME} (${BACKUP_SIZE})"
echo "[Succès] Checksum : $(cat "${CHECKSUM_FILEPATH}")"

# Application de la politique de rétention
echo "[Info] Nettoyage des sauvegardes datant de plus de ${RETENTION_DAYS} jours..."
find "${BACKUP_DIR}" -type f -name "psyrekrute_db_*.dump*" -mtime "+${RETENTION_DAYS}" -exec rm -vf {} \;

echo "[PsyRekrute Backup] Opération terminée avec succès."
exit 0
