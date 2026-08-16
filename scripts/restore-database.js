const fs = require('fs');
const path = require('path');
const { storageReady, fileStorage, maintenance } = require('../server');

(async () => {
  if (process.env.CONFIRM_RESTORE !== 'RESTORE_BUSOPS') throw new Error('Afbrudt: sæt CONFIRM_RESTORE=RESTORE_BUSOPS for en bevidst gendannelse');
  await storageReady;
  let bytes;
  if (process.env.BACKUP_FILE) {
    bytes = fs.readFileSync(path.resolve(process.env.BACKUP_FILE));
  } else if (process.env.BACKUP_OBJECT) {
    const response = await fileStorage.r2Request('GET', path.basename(process.env.BACKUP_OBJECT));
    if (!response.ok) throw new Error(`Kunne ikke hente backup fra R2 (HTTP ${response.status})`);
    bytes = Buffer.from(await response.arrayBuffer());
  } else {
    throw new Error('Angiv BACKUP_FILE eller BACKUP_OBJECT');
  }
  const run = await maintenance.restoreDatabaseBackupBytes(bytes, { confirmed:true });
  console.log(JSON.stringify({ ok:true, restoredAt:run.finishedAt, records:run.summary.records }, null, 2));
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
