# Cloudflare R2 til BusOps

R2 skal oprettes som en privat bucket. BusOps viser fortsat filer gennem sine egne beskyttede API-ruter, så en fil ikke bliver offentligt tilgængelig via et direkte bucket-link.

## 1. Opret bucket

1. Log ind på Cloudflare Dashboard.
2. Åbn **R2 Object Storage**.
3. Vælg **Create bucket**.
4. Brug navnet `busops-files`.
5. Behold offentlig adgang deaktiveret.

## 2. Opret en begrænset adgangsnøgle

1. Åbn **Manage R2 API Tokens**.
2. Opret et token med **Object Read & Write**.
3. Begræns tokenet til bucketen `busops-files`.
4. Gem Account ID, Access Key ID og Secret Access Key sikkert. Den hemmelige nøgle vises normalt kun én gang.

Nøglerne må ikke skrives i GitHub, kildekoden, screenshots eller supportbeskeder.

## 3. Indstil Render

Tilføj følgende Environment Variables direkte på Render:

```text
FILE_STORAGE_BACKEND=mirror
R2_ACCOUNT_ID=<Cloudflare Account ID>
R2_ACCESS_KEY_ID=<Access Key ID>
R2_SECRET_ACCESS_KEY=<Secret Access Key>
R2_BUCKET=busops-files
R2_PREFIX=busops
R2_JURISDICTION=eu
```

Gem ændringerne. Render genstarter normalt tjenesten automatisk.

## 4. Kontroller integrationen

Åbn `/api/health`. Svaret skal indeholde:

```json
{
  "fileStorage": {
    "backend": "mirror",
    "r2Configured": true
  }
}
```

Upload derefter ét testbillede til bagage og én testkvittering. Kontroller, at begge kan åbnes i BusOps og kan ses under præfikset `busops/` i R2.

## 5. Sikker overgang

Behold `mirror`, indtil alle eksisterende filer er kopieret og en gendannelsestest er udført. Skift ikke til `r2`, mens ældre filer stadig kun findes på Render-disken.
