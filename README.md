# BusOps 1.0

Responsivt driftsstyringssystem til busservice med Laravel 12, React, TypeScript, PostgreSQL og Tailwind CSS.

Systemets tidszone er `Europe/Copenhagen`, inklusive automatisk dansk sommer- og vintertid.

## Første version

- Rollebaseret login for administrator, medarbejder og Bus4You
- Bus4You-visning til oprettelse af opgaver samt samlet oversigt over udførte busser og udførende medarbejder
- Kunden ser det faktiske registrerede afhentningstidspunkt, ikke den planlagte tid
- Kundens opgaveformular indeholder kun busnummer, afhentningssted, dato/tid og valgfrie noter
- Ikke-tomme noter vises kun internt til administratoren og den tildelte medarbejder
- Kunden navigerer egne kommende og udførte opgaver i en månedskalender og kan rette eller slette opgaver, før de påbegyndes
- Kalenderen har et responsivt månedsgitter, datovalg og en dagsoversigt til mobil og desktop
- Administratorens Mailimport understøtter privat Outlook/Hotmail, importkladder, dubletkontrol og godkendelse
- Driftscentral med live overblik, status og historik
- Opret, redigér, forsink og aflys busopgaver via API
- Manuel fordeling og automatisk forslag blandt ledige medarbejdere
- Medarbejderflow: *Bus hentet* → *Bus afleveret* samt afvigelser
- Kunder, medarbejdere og fravær i datamodellen/API'et
- Forretningsregler for Busterminal, Københavns Lufthavn og Malmö Station

Alle medarbejdere har førerkort. Ved afhentning i Københavns Busterminal køres bussen på OUT uden brug af førerkort. Ved afhentning i Københavns Lufthavn eller Malmö Station udføres passagerkørsel, og førerkort skal bruges.

Efter klargøring afleveres bussen altid i Københavns Busterminal, uanset afhentningssted.

## Windows-installation uden Docker

Installér først:

- PHP 8.2 eller nyere med `pdo_pgsql`, `mbstring`, `openssl`, `fileinfo` og `curl`
- Composer 2
- Node.js 20.19+ (Node 22 LTS anbefales)
- PostgreSQL 16 eller nyere

Opret en tom PostgreSQL-database med navnet `busops`. Kopiér derefter `.env.example` til `.env` og ret databaseafsnittet:

```env
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=busops
DB_USERNAME=postgres
DB_PASSWORD=din_adgangskode
```

Kør i PowerShell fra projektmappen:

```powershell
composer install
Copy-Item .env.example .env
php artisan key:generate
php artisan migrate --seed
npm install
npm run build
composer run dev
```

Åbn `http://127.0.0.1:8000`.

## Demo-logins

Alle demo-brugere har adgangskoden `BusOps123!`.

| Rolle | E-mail |
|---|---|
| Administrator | admin@busops.dk |
| Medarbejder | medarbejder@busops.dk |
| Kunde | kunde@bus4you.dk |

Demo-oplysningerne er kun til lokal udvikling og skal ændres før produktion.

## Test

```powershell
php artisan test
npm run build
```

## Outlook/Hotmail-mailimport

Opret en appregistrering hos Microsoft med kontotypen **Personal Microsoft accounts only**. Tilføj redirect-adressen `http://localhost:8000/admin/outlook/callback` og de delegerede tilladelser `Mail.Read`, `User.Read` og `offline_access`.

Tilføj derefter værdierne i `.env`:

```env
MICROSOFT_CLIENT_ID=dit_client_id
MICROSOFT_CLIENT_SECRET=din_client_secret
MICROSOFT_REDIRECT_URI=http://localhost:8000/admin/outlook/callback
BUS4YOU_EMAIL=godkendt_afsender@eksempel.dk
BUS4YOU_EMAIL_DOMAIN=vy.se
```

Kør `php artisan config:clear`, log ind som administrator, og åbn fanen **Mailimport**. BusOps gemmer aldrig Outlook-adgangskoden. Lad `BUS4YOU_EMAIL` stå tomt for at acceptere alle afsendere, der slutter præcist på `@vy.se`. Udfyld kun `BUS4YOU_EMAIL`, hvis importen senere skal begrænses til én bestemt adresse.

## Arkitektur

Laravel leverer session-login, validering, PostgreSQL-modeller og JSON-endpoints. React-appen ligger i `resources/js/app.tsx`, mens Tailwind/CSS ligger i `resources/css/app.css`. Alle statusændringer skrives i `activity_logs`, så administratoren kan følge historikken.
