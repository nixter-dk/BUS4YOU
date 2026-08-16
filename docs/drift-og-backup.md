# Drift, filflytning og backup

BusOps har et administratorområde, **System & sikkerhed**, til filkontrol, databasebackup, systemhændelser og aktive login-sessioner.

## 1. Migrer eksisterende filer til R2

1. Behold `FILE_STORAGE_BACKEND=mirror` under hele migreringen.
2. Åbn **System & sikkerhed** som administrator.
3. Vælg **Kontroller først**. Det ændrer ingen filer.
4. Vælg **Kopiér manglende til R2**.
5. Kør kontrollen igen. Filer, som allerede findes i R2, springes over.

Kontrollen omfatter app-logo, chaufførportrætter, bagagebilleder og udgiftskvitteringer. Lokale originaler slettes ikke. Hvis en databasepost henviser til en fil, som ikke længere findes på Render-disken, vises den som et problem i journalen.

## 2. Krypteret databasebackup

Opret en tilfældig nøgle på præcis 32 bytes og gem den som base64 i Render-variablen `BACKUP_ENCRYPTION_KEY`. Nøglen skal opbevares separat fra R2. Mister man nøglen, kan backupfilerne ikke gendannes.

Eksempel på generering i PowerShell:

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Gem resultatet som en hemmelig Render-variabel. Vis eller del det ikke efterfølgende. `BACKUP_INTERVAL_HOURS=24` aktiverer daglig backup. En manuel backup kan startes på administratorsiden eller i Render Shell:

```powershell
npm run backup
```

Backupfilen komprimeres og krypteres med AES-256-GCM, før den sendes til den private R2-bucket.

## 3. Kontrolleret gendannelse

Gendannelse overskriver den aktive database og bør kun udføres i et aftalt vedligeholdelsesvindue. Tag altid en ny backup først.

Fra en lokal backupfil:

```powershell
$env:BACKUP_FILE = 'C:\sikker\database-backup.busops'
$env:CONFIRM_RESTORE = 'RESTORE_BUSOPS'
npm run restore
```

Direkte fra et R2-objektnavn i Render Shell:

```bash
export BACKUP_OBJECT='database-backup-2026-08-16T10-00-00-000Z.busops'
export CONFIRM_RESTORE='RESTORE_BUSOPS'
npm run restore
```

Den samme `BACKUP_ENCRYPTION_KEY` skal være tilgængelig. Scriptet afviser en fil med forkert format, forkert nøgle eller ugyldig BusOps-datastruktur.

## 4. Sikkerhedscenter

Administratoren kan se:

- database-, R2- og backupstatus;
- åbne systemhændelser og vedligeholdelsesjournal;
- afviste loginforsøg med maskeret IP-adresse;
- aktive sessioner og afslutte andre sessioner;
- den aktuelle release-id og serverens driftstid.

Session-ID'er og adgangsnøgler sendes aldrig til browseren. IP-adresser maskeres, før de gemmes.

## 5. Kontrol efter deployment

Kør først den automatiske testpakke:

```powershell
npm run check
```

Kontroller derefter online status:

```powershell
$env:BUSOPS_URL = 'https://busops-albaturist.onrender.com'
npm run smoke
```

Smoke-testen kræver ikke login og ændrer ingen data.
