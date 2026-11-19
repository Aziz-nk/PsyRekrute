#!/usr/bin/env bash
# ==============================================================================
# PsyRekrute - Script de Restauration de Base de Données PostgreSQL
# Vérifie l'empreinte SHA-256 et restaure via pg_restore (-Fc)
# ==============================================================================
set -euo pipefail

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <chemin_du_fichier_dump> [--force]" >&2
    echo "Exemple: $0 /var/backups/psyrekrute/psyrekrute_db_20261116_120000.dump" >&2
    exit 1
fi

BACKUP_FILE="$1"
FORCE_MODE="${2:-}"

DB_CONTAINER="${DB_CONTAINER:-psyrekrute_prod_postgres}"
DB_USER="${POSTGRES_USER:-psyrekrute_prod_user}"
DB_NAME="${POSTGRES_DB:-psyrekrute_prod_db}"

echo "================================================================="
echo "[PsyRekrute Restore] Démarrage de la procédure de restauration"
echo "Fichier source : ${BACKUP_FILE}"
echo "Base cible     : ${DB_NAME}"
echo "================================================================="

# 1. Vérification de l'existence du fichier
if [ ! -f "${BACKUP_FILE}" ]; then
    echo "[ERREUR CRITIQUE] Le fichier de sauvegarde introuvable : ${BACKUP_FILE}" >&2
    exit 1
fi

# 2. Vérification d'intégrité SHA-256 si le fichier .sha256 existe
CHECKSUM_FILE="${BACKUP_FILE}.sha256"
if [ -f "${CHECKSUM_FILE}" ]; then
    echo "[Info] Vérification de l'intégrité SHA-256..."
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum -c "${CHECKSUM_FILE}" || {
            echo "[ERREUR CRITIQUE] L'empreinte SHA-256 ne correspond pas ! Fichier potentiellement corrompu." >&2
            exit 2
        }
    fi
    echo "[Info] Intégrité du fichier vérifiée avec succès."
else
    echo "[Avertissement] Aucun fichier de checksum ${CHECKSUM_FILE} trouvé. Restauration sans contrôle d'empreinte."
fi

# 3. Confirmation utilisateur obligatoire hors mode non-interactif
if [ "${FORCE_MODE}" != "--force" ]; then
    echo ""
    echo "ATTENTION : Cette opération va écraser les données actuelles de la base '${DB_NAME}' !"
    read -r -p "Confirmez-vous la restauration ? (tapez 'OUI' pour continuer) : " CONFIRM
    if [ "${CONFIRM}" != "OUI" ]; then
        echo "[Annulation] Restauration interrompue par l'administrateur."
        exit 0
    fi
fi

# 4. Exécution de la restauration
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    echo "[Info] Restauration via le conteneur Docker ${DB_CONTAINER}..."
    docker exec -i "${DB_CONTAINER}" pg_restore \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        --clean \
        --if-exists \
        --no-owner \
        --no-privileges \
        -v < "${BACKUP_FILE}"
else
    echo "[Info] Restauration directe via pg_restore..."
    pg_restore \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        --clean \
        --if-exists \
        --no-owner \
        --no-privileges \
        -v \
        "${BACKUP_FILE}"
fi

echo "[Succès] Base de données restaurée avec succès depuis ${BACKUP_FILE}."
exit 0
