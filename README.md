# EchoWatch — DCP audio early-warning

Acoustic / vibration predictive maintenance for Dangote Cement plants  
**DCP University Engineering Challenge · Track 2**

## Stack

| Layer | Tech |
|--------|------|
| Site + dashboard | Static HTML / CSS / JS (`website/`) |
| API | Node.js + Express (`server/`) |
| DB | SQLite via `better-sqlite3` |
| Auth | JWT (plant-scoped), bcrypt passwords |
| Edge feed (demo) | In-process PRONOSTIA-schema simulator |

No React/Vue build step. Open the site through the Node server so `/api/*` works.

## Quick start

```bash
cd server
npm install
npm start
```

- Site: http://localhost:3847  
- Login: http://localhost:3847/login.html  
- Dashboard (auth required): http://localhost:3847/dashboard.html  

### Plant logins

Credentials are **not shown on the public login page**. Share them privately with team members.

Password for every seeded account: `password123`

| Plant | Location | Operator | Manager |
|--------|----------|----------|---------|
| Obajana | Kogi | `operator@obajana.dcp` | `manager@obajana.dcp` |
| Ibese | Ogun | `operator@ibese.dcp` | `manager@ibese.dcp` |
| Gboko | Benue | `operator@gboko.dcp` | `manager@gboko.dcp` |
| Okpella | Edo | `operator@okpella.dcp` | `manager@okpella.dcp` |

JWT `plant_id` scopes dashboard queries — one plant per account.

### Edge device key (ingest)

```http
POST /api/readings/:deviceId
X-Device-Key: echowatch-edge-key
Content-Type: application/json
```

Payload (from parameter sheet / PRONOSTIA schema):

```json
{
  "timestamp": "2026-07-15T09:39:39.065664",
  "horizontal_accel": 0.552,
  "vertical_accel": -0.146,
  "rms": 0.41,
  "kurtosis": 3.72,
  "anomaly_score": 0.51,
  "energy_deviation": 0.43,
  "ahi": 0.62,
  "status": "WARNING"
}
```

## AHI thresholds

| Condition | Status |
|-----------|--------|
| `ahi >= 0.68` | NORMAL |
| `0.20 < ahi < 0.68` | WARNING |
| `ahi <= 0.20` | CRITICAL |

Alerts fire only after **5 consecutive** samples at WARNING or CRITICAL.

## Repo layout

```
Model Data/          # trained autoencoder (.pt, TFLite) + norm_stats
Notebooks/           # MIMII training notebooks
website/             # product site + login + dashboard
server/              # Express API, SQLite, simulator
```

## Honesty labels

Dashboard and `/api/overview` mark the feed as **simulated / replayed**, not live plant sensors. MIMII / PRONOSTIA are public proxy datasets for the competition build.
