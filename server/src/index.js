const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { PORT, WEBSITE_DIR, SIMULATOR_ENABLED } = require('./config');
const { getDb } = require('./db');
const { seed } = require('./seed');
const routes = require('./routes');
const { startSimulator } = require('./simulator');

// Ensure schema + demo data exist
getDb();
seed();

const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));
app.use(morgan('dev'));

app.use('/api', routes);

// Static marketing site + dashboard
app.use(express.static(WEBSITE_DIR, { extensions: ['html'] }));

// SPA-style fallback for bare paths
app.get('/', (_req, res) => {
  res.sendFile(path.join(WEBSITE_DIR, 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`EchoWatch server → http://localhost:${PORT}`);
  console.log(`Dashboard        → http://localhost:${PORT}/dashboard.html`);
  console.log(`Login            → http://localhost:${PORT}/login.html`);
  console.log('Demo: demo@echowatch.local / password123');
  if (SIMULATOR_ENABLED) {
    // Feed all plants so plant-scoped logins (obajana, ibese, …) have live data
    startSimulator();
  }
});
