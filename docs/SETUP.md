# Setup

How to get Continuity running on a new machine, and how to start it day to
day once it is set up.

- [Already set up? Starting it](#already-set-up-starting-it)
- [New setup](#new-setup)
  1. [What you need](#1-what-you-need)
  2. [Get the code](#2-get-the-code)
  3. [Create the database](#3-create-the-database)
  4. [Create `backend/.env`](#4-create-backendenv)
  5. [Backend: install, load the database, run](#5-backend-install-load-the-database-run)
  6. [Frontend: install and run](#6-frontend-install-and-run)
  7. [Sign in](#7-sign-in)
- [Checking it works](#checking-it-works)
- [When something goes wrong](#when-something-goes-wrong)

---

## Already set up? Starting it

`backend/.env` is already there and points at the Hostinger database. Open
two terminals.

**Terminal 1, the backend** (http://localhost:8000):

```bash
cd backend
.venv/bin/uvicorn app.main:app --port 8000
```

**Terminal 2, the frontend** (http://localhost:5173):

```bash
cd frontend
npx vite --port 5173
```

Open **http://localhost:5173**. Stop either one with `Ctrl+C`.

---

## New setup

### 1. What you need

| | Version | Check with |
|---|---|---|
| Python | 3.10 or newer | `python3 --version` |
| Node.js | 18 or newer | `node --version` |
| A database | MySQL 8.0.16+ or MariaDB 10.5+ (Hostinger's MySQL is MariaDB) | |

### 2. Get the code

```bash
git clone https://github.com/vivaanmathur/dbms_mini.git
cd dbms_mini
```

### 3. Create the database

**On Hostinger:**

1. hPanel → **Databases → MySQL Databases**: create a database and a user
   with a strong password. Write down all three names. Hostinger puts your
   account id in front of each, for example `u129569208_lectureplanner`.
2. hPanel → **Databases → Remote MySQL**: add your computer's IP address, or
   `%` for any address. Without this, Hostinger refuses connections from your
   laptop.
3. The hostname is shown on the same page, for example `auth-db1257.hstgr.io`.

**On your own machine** (a local MySQL), run the commands in
[DATABASE.md → Database setup](DATABASE.md#1-database-setup) and
[DCL](DATABASE.md#2-dcl-users-and-privileges). On macOS with Homebrew MySQL,
`backend/scripts/setup_local_db.sh` does all of it for you, writes
`backend/.env`, and loads the tables. You can then skip to step 5.

You do not need to create any tables by hand: step 5 loads them.

### 4. Create `backend/.env`

Create a file called `.env` inside the `backend` folder: `backend/.env`. Paste
this in and fill in your values:

```ini
# the database (from step 3)
DB_HOST=auth-db1257.hstgr.io
DB_PORT=3306
DB_NAME=u129569208_lectureplanner
DB_USER=u129569208_youruser
DB_PASSWORD=your-database-password

# signs the login tokens: any long random string, kept secret
JWT_SECRET_KEY=paste-the-output-of-the-command-below
JWT_EXPIRE_MINUTES=480

# where the frontend runs, so the browser is allowed to call the backend
CORS_ORIGINS=http://localhost:5173
```

Make the `JWT_SECRET_KEY` value with:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

| Setting | What it is |
|---|---|
| `DB_HOST` | the database server: Hostinger's hostname, or `127.0.0.1` locally |
| `DB_PORT` | `3306` unless your host says otherwise |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` | from step 3 |
| `JWT_SECRET_KEY` | a long random secret. Changing it signs everybody out |
| `JWT_EXPIRE_MINUTES` | how long a sign-in lasts: 480 is a working day |
| `CORS_ORIGINS` | the frontend's address. Separate several with commas |

`.env` is in `.gitignore`, so it never goes to GitHub. Never commit it.
`backend/.env.example` lists the same settings, without values.

The connection to the database is always encrypted. There is no setting to
turn that off.

### 5. Backend: install, load the database, run

```bash
cd backend

# a private Python environment for the project, and its packages
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# the tables, functions, procedures, triggers and views
.venv/bin/python -m scripts.load_schema

# the starting data: DCET, SY AI&DS G, its Panel G timetable, faculty and demo accounts
.venv/bin/python -m scripts.seed

# run it
.venv/bin/uvicorn app.main:app --port 8000
```

`load_schema` refuses to touch a database that already has tables. To
replace everything in it, run `.venv/bin/python -m scripts.load_schema --empty`.
That deletes all its tables, so take a backup first if it holds anything you
need.

`seed` **empties every table** and loads the starting data again. Run it once
on a new database, and again only when you want to start over.

The backend is ready when you see `Uvicorn running on http://127.0.0.1:8000`.
Its API documentation is at http://localhost:8000/docs.

### 6. Frontend: install and run

In a second terminal:

```bash
cd frontend
npm install
npx vite --port 5173
```

Open **http://localhost:5173**.

The frontend expects the backend at `http://localhost:8000`. If yours is
elsewhere, start the frontend with `VITE_API_URL=http://host:port npx vite --port 5173`.

### 7. Sign in

`scripts.seed` writes every account and one temporary password to
`backend/SEED_CREDENTIALS.local.md`. Git ignores that file. Everyone must
choose a new password the first time they sign in: at least 10 characters,
with upper and lower case letters and a digit.

| Email | What you see |
|---|---|
| `admin@continuity.local` | Administrator: manages everything, including the timetable editor |
| `director@continuity.local` | Programme Director for DCET |
| `coordinator@continuity.local` | Programme Coordinator, Year Coordinator and Class Teacher of SY G, in one account |
| `student@continuity.local` | a student in SY AI&DS G, batch G1 |
| `firstname.lastname@mitwpu.edu.in` | each faculty member, for example `santushti.betgeri@mitwpu.edu.in` |

---

## Checking it works

With the backend running:

```bash
cd backend
.venv/bin/python tests/e2e.py        # 50 checks, signing in as every role
.venv/bin/python -m scripts.seed     # then put the data back
```

The test changes data and passwords, so always reseed after it.

---

## When something goes wrong

| What you see | What to do |
|---|---|
| `RuntimeError: DB_HOST is not set in backend/.env` | `.env` is missing, misnamed, or not in `backend/`. See step 4 |
| `Access denied for user` (Hostinger) | check the user and password in hPanel, and that your IP is allowed under **Remote MySQL** |
| `Access denied` on a local MySQL with the right password | MySQL 8+ needs an encrypted connection after a restart. The app always encrypts; if another tool fails, sign in once with TLS |
| `Can't connect` / timeouts from a college network | some networks block port 3306. Try another network or a phone hotspot |
| `Table '...' doesn't exist` | the database is empty: run `python -m scripts.load_schema`, then `python -m scripts.seed` |
| error 1419 while loading routines | binary logging is on: see [DATABASE.md → DCL](DATABASE.md#2-dcl-users-and-privileges) |
| `address already in use` | something is already on that port. Stop it, or find it with `lsof -i :8000` |
| the page loads but every request fails | the backend is not running, or `CORS_ORIGINS` does not include the frontend's address |
