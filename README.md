# BusOps – Alba Turist

Første fungerende MVP til booking, sædevalg, bagage og check-in på busture.

## Start lokalt

Krav: Node.js 16 eller nyere. Projektet har ingen eksterne pakker.

```powershell
npm start
```

Åbn derefter `http://127.0.0.1:3000`.

### Demo-brugere

| Rolle | E-mail | Adgangskode |
|---|---|---|
| Administrator | `admin@albaturist.dk` | `admin123` |
| Chauffør | `mads@albaturist.dk` | `chauffor123` |
| Chauffør | `sara@albaturist.dk` | `chauffor123` |

Skift demo-adgangskoder før løsningen bruges med rigtige data.

## MVP-funktioner

- Login med sikre, saltede `scrypt`-password-hashes og HTTP-only sessionscookies
- Roller: administrator og chauffør
- Separat chaufføradministration, hvor kun administratoren kan oprette, redigere og slette chaufførkonti
- Kalender og turdashboard
- Opsamlingssteder, som kun administratoren kan oprette, redigere og slette
- To chauffører pr. tur, hvor én er primær
- Chauffører kan kun åbne ture, de selv er tildelt
- Passagerregistrering, betalingsstatus og kontant beløb
- Kontant betaling af både billet og bagage i DKK eller EUR
- Administratorrapport med solgte billetter samt billet- og bagageindtægter opdelt i DKK og EUR
- Visuel sædeplan med grøn markering af ledige sæder og unik reservation pr. tur
- Administratorkontrolleret buskapacitet: op til 54 sæder i almindelig bus og op til 84 i dobbeltdækker
- Separat busregister med navn, registreringsnummer, bustype og kapacitet
- Turen tildeles en konkret bus; dobbeltdækkere vises med under- og overetage
- Orienteringskort med overetage øverst, underetage direkte nedenunder, 2+2-sæder, midtergang, front, bagende og trappe
- Frontsæder (+100 kr.) og bordpladser (+75 kr.)
- Check-in fra passagerlisten
- Administrator og tildelte chauffører kan registrere ubetalte billetter og bagage som betalt i bus eller salgsbutik; betalingen kan ikke føres tilbage til ubetalt
- Chaufførvenlig passagerliste med søgning, filtre, opsamlingsgrupper, status, udeblevet-markering, opkald og passagerdetaljer
- Kontantansvar pr. chauffør for billet- og bagagebetalinger modtaget i bussen
- Turudgifter med upload af PDF- eller billedkvittering, kategori, beløb og valuta
- Separat liste over sendt bagage
- Bagageflow: registreret, modtaget, ombord, udleveret og ikke afhentet
- Vedvarende lokal database med atomisk lagring

## Struktur

```text
public/             Brugerflade
  index.html
  styles.css
  app.js
server.js           Webserver, API, adgangskontrol og datalag
data/db.json        Oprettes automatisk ved første start
docs/schema.md      Datamodel og produktionsvej
```

## Konfiguration

| Variabel | Standard | Formål |
|---|---|---|
| `PORT` | `3000` | Serverport |
| `HOST` | `127.0.0.1` | Netværksinterface |
| `DB_FILE` | `data/db.json` | Placering af databasen |

## GitHub

Repositoryet `nixter-dk/busops.albaturist.dk` var tilgængeligt, men tomt, og projektet er derfor bygget direkte i en klon af det.

Når GitHub-legitimationsoplysninger er tilgængelige:

```powershell
git add .
git commit -m "Build initial BusOps MVP"
git push -u origin main
```

Hvis den tomme remote bruger `master`, kan den aktuelle gren i stedet pushes med:

```powershell
git push -u origin HEAD:master
```

## Før produktion

MVP'en er beregnet til afprøvning. Næste produktionstrin er PostgreSQL, permanent sessionlager, nulstilling af adgangskoder, CSRF-beskyttelse, revisionslog, automatiske tests, backups og HTTPS-deployment. Datamodellen er dokumenteret i `docs/schema.md`.
