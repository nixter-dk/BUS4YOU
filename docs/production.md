# Produktionsopsætning

BusOps kan køre på en hostingadresse uden eget domæne. Hostingudbyderens adresse skal bruge HTTPS, eksempelvis `https://busops-eksempel.hosting.app`.

## Anbefalet første hosting

Repositoryet indeholder `render.yaml`, som kan oprette hele løsningen hos Render:

Pushes til den tilknyttede produktionsbranch deployes automatisk via `autoDeployTrigger: commit`.

- En Docker-baseret webtjeneste i Frankfurt.
- En PostgreSQL-database i samme region.
- En permanent disk til bagagebilleder og kvitteringer.
- Et helbredstjek på `/api/health`.
- Automatisk deployment efter beståede GitHub-tests.
- En offentlig `onrender.com`-adresse med HTTPS, så eget domæne ikke er nødvendigt.

Den permanente disk kræver en betalt webtjeneste. En gratis database hos Render udløber, så konfigurationen bruger en betalt basisdatabase til rigtig drift. Priser skal altid kontrolleres i Render, før Blueprintet godkendes.

Ved oprettelse af Blueprintet beder Render om `INITIAL_ADMIN_EMAIL` og `INITIAL_ADMIN_PASSWORD`. Brug en helt ny adgangskode på mindst 12 tegn. Den må ikke genbruges andre steder.

## Påkrævede dele

1. En Node.js- eller Docker-tjeneste bygget fra dette repository.
2. En PostgreSQL-database, som leverer `DATABASE_URL`.
3. En permanent disk monteret til en mappe som `/data`, med `UPLOAD_DIR=/data/uploads`.
4. Automatiske PostgreSQL-backups og backup af den permanente disk.
5. Hostingudbyderens HTTPS-adresse. Et eget domæne kan tilføjes senere.

## Miljøvariabler

Brug `.env.example` som tjekliste. Hemmelige værdier må kun gemmes i hostingudbyderens indstillinger og aldrig i GitHub.

De vigtigste værdier er:

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `DATABASE_URL`
- `INITIAL_ADMIN_EMAIL`
- `INITIAL_ADMIN_PASSWORD` på mindst 12 tegn
- `TRUST_PROXY=true`, når hostingudbyderen afslutter HTTPS foran appen
- `UPLOAD_DIR` på den permanente disk

Når databasen allerede indeholder data, ændrer `INITIAL_ADMIN_PASSWORD` ikke den eksisterende administrator. Administratorens adgangskode skal derefter ændres gennem systemet eller en særskilt kontrolleret nulstilling.

## Før første login

1. Kontrollér at `/api/health` svarer med `ok: true` og `storage: postgresql`.
2. Kontrollér at hostingadressen begynder med `https://`.
3. Log ind med den første administrator.
4. Opret chauffører og salgschefer med individuelle adgangskoder.
5. Opret opsamlingssteder og busser.
6. Kør en prøvetur uden rigtige kundedata.

## Backup og gendannelse

- Aktivér daglig databasebackup med mindst 30 dages opbevaring.
- Tag daglig backup af mappen angivet i `UPLOAD_DIR`.
- Udfør en prøvegennemgang af gendannelse mindst én gang i kvartalet.
- Database og filer skal gendannes fra samme omtrentlige tidspunkt, så bilagsreferencer passer til filerne.

## Sikkerhed, der er indbygget

- Saltede `scrypt`-adgangskoder.
- HTTP-only, Secure og SameSite-login-cookie i produktion.
- Permanente sessioner med udløbstid.
- Kontrol af afsenderadresse på alle ændrende API-kald.
- Begrænsning af gentagne loginforsøg.
- Sikkerhedsoverskrifter, CSP og HSTS.
- Tilladte filtyper kontrolleres. Kvitteringer har en grænse på 5 MB; bagagefotos har ingen særskilt filgrænse, men hele API-anmodningen har en sikkerhedsgrænse på 128 MB.
- Kontrolleret nedlukning, som venter på igangværende datalagring.

## Opdatering

Render-tjenesten er forbundet til GitHub-repositoryet `nixter-dk/busops.albaturist.dk` på branch `agent/publish-busops-updates`. Indstillingen **On Commit** skal være aktiv, så hver ny commit på branchen starter en automatisk deployment.

Kør altid den automatiske test før deployment. Ved deployment genstarter hostingudbyderen containeren. PostgreSQL-data og den permanente filmappe må ikke slettes eller erstattes under opdateringen.

Denne første produktionsversion skal køre som én web-instans. Den gemmer den samlede systemtilstand atomisk i PostgreSQL, så vandret skalering til flere samtidige instanser kræver en senere migrering til en fuldt relationel datamodel og fælles fillagring.
