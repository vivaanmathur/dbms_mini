#!/usr/bin/env bash
# Creates a local development database for Continuity, from nothing.
#
#   cd backend && ./scripts/setup_local_db.sh
#
# It creates the database and a dedicated user with a random password, writes
# backend/.env (only if there is not one already), and loads the schema and
# the routines. Needs a local MySQL 8+ whose root user can sign in without a
# password, which is how Homebrew installs it.
#
# Nothing here touches any other database on the machine.
set -euo pipefail
cd "$(dirname "$0")/.."

DB=${DB_NAME:-continuity_dev}
USER_NAME=${DB_USER:-continuity}

if [ -f .env ]; then
  echo "backend/.env already exists — using the credentials in it."
  set -a; . ./.env; set +a
  DB=$DB_NAME; USER_NAME=$DB_USER; PASSWORD=$DB_PASSWORD
else
  PASSWORD=$(python3 -c "import secrets; print(secrets.token_urlsafe(18))")
  JWT=$(python3 -c "import secrets; print(secrets.token_hex(32))")
  cat > .env <<ENV
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=$DB
DB_USER=$USER_NAME
DB_PASSWORD=$PASSWORD
JWT_SECRET_KEY=$JWT
JWT_EXPIRE_MINUTES=480
CORS_ORIGINS=http://localhost:5174
ENV
  echo "Wrote backend/.env"
fi

mysql -u root <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS '$USER_NAME'@'localhost' IDENTIFIED BY '$PASSWORD';
ALTER USER '$USER_NAME'@'localhost' IDENTIFIED BY '$PASSWORD';
GRANT ALL PRIVILEGES ON \`$DB\`.* TO '$USER_NAME'@'localhost';
FLUSH PRIVILEGES;
SQL
echo "Database $DB and user $USER_NAME are ready."

TABLES=$(mysql -u root -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB'")
if [ "$TABLES" -gt 0 ]; then
  echo "$DB already has $TABLES tables — leaving the schema as it is."
else
  mysql -u root "$DB" < sql/schema.sql
  # routines as root: with binary logging on, only a privileged account may
  # create functions. The app still connects as its own restricted user.
  mysql -u root "$DB" < sql/routines.sql
  echo "Loaded the schema and the routines."
fi

echo
echo "Next:  .venv/bin/python -m scripts.seed"
