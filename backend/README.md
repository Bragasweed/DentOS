# Backend setup locale (FastAPI + MongoDB)

Questa cartella espone una API FastAPI (`server.py`) che usa MongoDB via `motor`.

## 1) Serve un file `.env`?

Sì: **serve**. Il backend legge il file `backend/.env` all'avvio.

In particolare sono richieste queste variabili:

- `MONGO_URL`
- `DB_NAME`
- `JWT_SECRET`

E facoltative per i dati demo:

- `DEMO_SEED=true|false`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Puoi partire da:

```bash
cp backend/env.example backend/.env
```

## 2) Avvio MongoDB in locale

Se non hai MongoDB installato, il modo più rapido è Docker:

```bash
docker run --name hudent-mongo -p 27017:27017 -d mongo:7
```

## 3) Install dipendenze e run backend

Dalla root repo:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.server:app --host 0.0.0.0 --port 8000 --reload
```

Health check:

```bash
curl http://localhost:8000/api/
```

Dovresti ricevere qualcosa come `{"app":"HuDent AI","status":"ok"}`.

## 4) Come usare i dati di test/demo già presenti nel backend

I dati test vengono creati automaticamente in startup **solo** se `DEMO_SEED=true`.

Con seed attivo, al primo avvio vengono creati:

- studio demo (`Studio Dentistico Demo`)
- utente admin demo (`ADMIN_EMAIL` / `ADMIN_PASSWORD`)
- utenti team demo
- pazienti / preventivi / appuntamenti / pagamenti / task
- reminder demo e dati automazioni/revenue

> Se lo studio demo esiste già, il seed non duplica i dati.

### Login demo

Con `env.example` proposto:

- email: `admin@dentalflow.it`
- password: `DentalFlow2026!`

Endpoint login:

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@dentalflow.it","password":"DentalFlow2026!"}'
```

## 5) Frontend / test puntati al backend locale

I test in `backend/tests` usano `REACT_APP_BACKEND_URL`.

Per usare locale:

```bash
export REACT_APP_BACKEND_URL=http://localhost:8000
pytest backend/tests -q
```

## 6) Troubleshooting rapido

- **Errore su `MONGO_URL` / `DB_NAME` / `JWT_SECRET`**: controlla che `backend/.env` esista e abbia tutte le chiavi.
- **Nessun dato demo**: verifica `DEMO_SEED=true` e riavvia il server.
- **Credenziali admin non funzionano**: se lo studio demo esiste già, aggiorna `ADMIN_PASSWORD` nel `.env` e riavvia; lo startup sincronizza la password admin demo.
