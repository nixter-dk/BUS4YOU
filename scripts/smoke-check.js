const baseUrl=String(process.env.BUSOPS_URL||'http://127.0.0.1:3000').replace(/\/$/,'');

(async()=>{
  const response=await fetch(`${baseUrl}/api/health`,{headers:{Accept:'application/json'}});const health=await response.json();
  if(!response.ok||!health.ok)throw new Error(`Health check fejlede (HTTP ${response.status})`);
  if(!health.database?.ready)throw new Error('Databasen er ikke klar');
  if(health.fileStorage?.backend!=='local'&&!health.fileStorage?.r2Configured)throw new Error('R2 er ikke konfigureret til den valgte fillagring');
  console.log(JSON.stringify({ok:true,url:baseUrl,release:health.release,database:health.database.backend,fileStorage:health.fileStorage.backend,backup:health.backup},null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1});
