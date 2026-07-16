const bcrypt = require('bcryptjs');
const { getDb, closeDb } = require('./db');

const DEMO_PASSWORD = 'password123';

const PLANTS = [
  { id: 'obajana', name: 'Obajana Plant', location: 'Kogi' },
  { id: 'ibese', name: 'Ibese Plant', location: 'Ogun' },
  { id: 'gboko', name: 'Gboko Plant', location: 'Benue' },
  { id: 'okpella', name: 'Okpella Plant', location: 'Edo' },
];

const ASSET_DEFS = [
  { type: 'crusher', name: 'Crushers', node: 'Node 01 · ESP32-S3', lead: 'Tunde · Crusher lead' },
  { type: 'rawmill', name: 'Raw Mills', node: 'Node 02 · ESP32-S3', lead: 'Amaka · Raw Mill lead' },
  { type: 'coalmill', name: 'Coal Mills', node: 'Node 03 · ESP32-S3', lead: 'Chidi · Coal Mill lead' },
  { type: 'kiln', name: 'Kilns', node: 'Node 04 · ESP32-S3', lead: 'Ngozi · Kiln lead' },
  { type: 'cementmill', name: 'Cement Mills', node: 'Node 05 · ESP32-S3', lead: 'Femi · Cement Mill lead' },
  { type: 'packing', name: 'Packing', node: 'Node 06 · ESP32-S3', lead: 'Sade · Packing lead' },
];

/**
 * One operator + one manager per plant.
 * Password for every account: password123
 */
function buildUsers() {
  const users = [];
  for (const plant of PLANTS) {
    const label = plant.name.replace(' Plant', '');
    users.push({
      email: `operator@${plant.id}.dcp`,
      name: `${label} Operator`,
      plant_id: plant.id,
      role: 'operator',
    });
    users.push({
      email: `manager@${plant.id}.dcp`,
      name: `${label} Manager`,
      plant_id: plant.id,
      role: 'manager',
    });
  }
  return users;
}

const USERS = buildUsers();

function seed() {
  const db = getDb();
  const insertPlant = db.prepare(
    `INSERT OR IGNORE INTO plants (id, name, location) VALUES (@id, @name, @location)`
  );
  const insertAsset = db.prepare(`
    INSERT OR IGNORE INTO assets
      (id, plant_id, name, type, device_id, node_label, lead_name, sort_order)
    VALUES
      (@id, @plant_id, @name, @type, @device_id, @node_label, @lead_name, @sort_order)
  `);
  const upsertUser = db.prepare(`
    INSERT INTO users (email, password_hash, name, plant_id, role)
    VALUES (@email, @password_hash, @name, @plant_id, @role)
    ON CONFLICT(email) DO UPDATE SET
      password_hash = excluded.password_hash,
      name = excluded.name,
      plant_id = excluded.plant_id,
      role = excluded.role
  `);
  const insertHealth = db.prepare(`
    INSERT OR IGNORE INTO device_health
      (device_id, asset_id, plant_id, last_seen, network_path)
    VALUES (@device_id, @asset_id, @plant_id, NULL, 'wifi')
  `);

  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);

  const run = db.transaction(() => {
    for (const plant of PLANTS) insertPlant.run(plant);

    for (const plant of PLANTS) {
      ASSET_DEFS.forEach((def, index) => {
        const assetId = `${plant.id}-${def.type}`;
        const deviceId = `esp32-${plant.id}-${def.type}`;
        insertAsset.run({
          id: assetId,
          plant_id: plant.id,
          name: def.name,
          type: def.type,
          device_id: deviceId,
          node_label: def.node,
          lead_name: def.lead,
          sort_order: index,
        });
        insertHealth.run({
          device_id: deviceId,
          asset_id: assetId,
          plant_id: plant.id,
        });
      });
    }

    for (const user of USERS) {
      upsertUser.run({
        email: user.email,
        password_hash: passwordHash,
        name: user.name,
        plant_id: user.plant_id,
        role: user.role,
      });
    }
  });

  run();
  console.log('Seed complete — plant logins (password for all: password123):');
  for (const plant of PLANTS) {
    console.log(
      `  ${plant.name.padEnd(16)}  operator@${plant.id}.dcp  |  manager@${plant.id}.dcp`
    );
  }
}

if (require.main === module) {
  seed();
  closeDb();
}

module.exports = { seed, PLANTS, ASSET_DEFS, USERS, DEMO_PASSWORD };
