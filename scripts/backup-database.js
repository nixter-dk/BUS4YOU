const { storageReady, maintenance } = require('../server');

(async () => {
  await storageReady;
  if (!maintenance.backupConfigured) throw new Error('BACKUP_ENCRYPTION_KEY mangler eller er ugyldig');
  const run = await maintenance.createDatabaseBackup({ reason: 'render_shell' });
  console.log(JSON.stringify({ ok:true, file:run.summary.file, bytes:run.summary.bytes, finishedAt:run.finishedAt }, null, 2));
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
