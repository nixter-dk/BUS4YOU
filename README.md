# BusOps – Alba Turist

Første fungerende MVP til booking, sædevalg, bagage og check-in på busture.

## Start lokalt

Krav: Node.js 22 eller nyere.

```powershell
npm install
npm start
```

Åbn derefter `http://127.0.0.1:3000`.

En tom lokal testdatabase opretter udviklingsbrugere automatisk. De er kun beregnet til lokal test. Produktionsmiljøet opretter ingen demo-chauffører og kræver en særskilt administratoradgangskode via miljøvariabler.

## MVP-funktioner

- Login med sikre, saltede `scrypt`-password-hashes og HTTP-only sessionscookies
- Roller: administrator, chauffør og salgschef
- Separat chaufføradministration, hvor kun administratoren kan oprette, redigere og slette chaufførkonti
- Driftskalender med dags-, uge- og månedsvisning, mobil tidslinje, ressourcekonflikter, driftsadvarsler, filtre og hurtigt turpanel
- Obligatorisk afgangstid ved startstedet og forventet ankomstdato/-tid ved slutstedet; turens varighed beregnes automatisk
- Rollebaseret overblik for administrator, chauffør og salgschef med næste afgang, handlingskø, dagens tidslinje, hurtige funktioner, salg og personligt kontantansvar
- Central driftskontrol med prioriterede handlinger pr. tur og fast turlivscyklus: planlagt, check-in åbnet, undervejs, ankommet, økonomi afventer og afsluttet
- Opsamlingssteder, som kun administratoren kan oprette, redigere og slette
- Faste startpunkter for ture: kun København eller Tetovo; andre steder bruges fortsat som opsamlingssted eller destination
- Passagerens opsamlingssted vælges uafhængigt af turens startpunkt, så administratoren og de tildelte chauffører kan vælge mellem alle oprettede opsamlingssteder
- Moderne firetrins-passagerformular til mobil og computer med enkeltbillet, fast returbillet og åben returbillet
- Familie- og gruppebooking i samme formular: hovedpersonen angiver telefon, rute og fælles betaling én gang, mens hver rejsende får eget sæde, billetnummer, retursæde og check-in
- To chauffører pr. tur, hvor én er primær
- Administratoren kan skifte turens primære og sekundære chauffør, indtil den første passager er checket ind
- Administratoren kan annullere en tur med obligatorisk begrundelse; al historik, økonomi, passagerer og bagage bevares
- En tom tur kan slettes permanent af administratoren, men sletning låses automatisk, så snart turen har passagerer, bagage, udgifter eller kontantafstemninger
- Salgschefer kan se alle ture, oprette og korrigere passagerer fra alle oprettede opsamlingssteder samt checke passagerer ind ved alle stop, hvor turen har gæster; ny bagage forbliver ved turens startsted
- Kontantbetalinger ved startstedet registreres hos den salgschef, som modtog dem, og indgår i personens kontantafstemning
- Passager- og bagagelister viser, hvem der udførte check-in eller håndtering, hvem der modtog betalingen, og det registrerede beløb
- Chauffører kan kun åbne ture, de selv er tildelt
- Tildelte chauffører kan sælge en ledig billet i bussen; betalingen og kontantansvaret registreres automatisk hos den sælgende chauffør
- Tildelte chauffører kan modtage bagage i bussen med obligatorisk foto; betalingen registreres automatisk hos den modtagende chauffør
- Passagerregistrering, betalingsstatus og kontant beløb
- Kontant betaling af både billet og bagage i DKK eller EUR
- Administratorrapport med solgte billetter samt billet- og bagageindtægter opdelt i DKK og EUR
- Resultat pr. tur med omsætning, godkendte/afventende udgifter, nettoresultat, belægningsgrad, periodefiltre og CSV-eksport
- Skrivebeskyttet økonomisk journal, der samler indtægter, godkendte udgifter, pengeoverførsler og kontantafstemninger uden dobbelttælling
- Avanceret økonomianalyse pr. tur med billet- og bagagekontanter, salgsbutik, afleverede og uafleverede kontanter, medarbejderansvar, udgiftskategorier og udvidelige turdetaljer
- Administratorgodkendelse eller afvisning af turudgifter; kun godkendte udgifter indgår i resultatet
- Visuel sædeplan med grøn markering af ledige sæder og unik reservation pr. tur
- Administratorkontrolleret buskapacitet: op til 54 sæder i almindelig bus og fast 84-sæders dobbeltdækker med 22 sæder nederst og 62 øverst
- Separat busregister med navn, registreringsnummer, bustype og kapacitet
- Turen tildeles en konkret bus; dobbeltdækkere vises med under- og overetage
- Orienteringskort med overetage øverst, underetage direkte nedenunder, 2+2-sæder, midtergang, front, bagende og trappe
- Klikbar dobbeltdækker-plantegning med etager, to bordgrupper på underetagen, førerplads, indgang, trapper, køkken og toilet
- Frontsæder (+100 kr.) og bordpladser (+75 kr.)
- Check-in fra passagerlisten
- Gratis billetter med valgfri begrundelse; de tæller med i belægningen, men ikke som indtægt eller ubetalt
- Administrator og tildelte chauffører kan registrere ubetalte billetter og bagage som betalt i bus eller salgsbutik; betalingen kan ikke føres tilbage til ubetalt
- Chaufførvenlig passagerliste med søgning, filtre, opsamlingsgrupper, status, udeblevet-markering, opkald og passagerdetaljer
- Chaufførens afslutningskontrol kræver, at turen er startet, og at hver passager er checket ind eller markeret som udeblevet; efterfølgende rettelser genåbner automatisk kontrollen
- Særskilt, mobilvenlig check-in-tilstand med store trykfelter, fast stopstatus, søgning, hurtigfiltre, store passagerkort, manuel uncheck fra passagerens handlingsmenu, hændelseshistorik og offline-kø
- Kontantansvar pr. chauffør for billet- og bagagebetalinger modtaget i bussen
- Personlig budgetkonto for chauffører og salgschefer med billet-, bagage- og budgetposteringer, disponible saldi og fuld overdragelseshistorik
- Salgschefen kan overføre et samlet budgetbeløb til en chauffør uden at chaufføren får vist de underliggende billet- og bagagereferencer
- Kontante udgifter reducerer automatisk den ansvarlige chaufførs eller salgschefs disponible kassebeholdning
- Kontantafstemning pr. chauffør og tur med forventet/afleveret beløb, difference og administratorgodkendelse
- Mobilvenlig digital udgiftsmappe per tur med betalingsmetode, betaler, kategori, beløb, DKK/EUR og PDF- eller billedkvittering
- Udgifter kan gemmes før kvitteringen er klar, men kan først godkendes efter bilaget er tilføjet; private udlæg har særskilt tilbagebetalingsstatus
- Separat liste over sendt bagage
- Obligatorisk foto af hver bagageforsendelse som dokumentation på den valgte tur
- Bagageflow: registreret, modtaget, ombord, udleveret og ikke afhentet
- Interne beskedkladder til bookingbekræftelser og aflysninger; de sendes ikke eksternt, før en godkendt SMS- eller e-mailtjeneste bliver tilkoblet
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
docs/production.md  Sikker onlineopsætning og backup
Dockerfile          Standardiseret produktionscontainer
render.yaml         Samlet Render-opsætning med web, database og fil-disk
.github/workflows/  Automatisk test før deployment
```

## Konfiguration

| Variabel | Standard | Formål |
|---|---|---|
| `PORT` | `3000` | Serverport |
| `HOST` | `127.0.0.1` | Netværksinterface |
| `DB_FILE` | `data/db.json` | Placering af databasen |
| `DATABASE_URL` | tom | PostgreSQL-forbindelse i produktion |
| `UPLOAD_DIR` | `data/uploads` | Bagagebilleder og kvitteringer |
| `FILE_STORAGE_BACKEND` | `local` | `local`, `mirror` eller `r2` |
| `R2_ACCOUNT_ID` | tom | Cloudflare-kontoens Account ID |
| `R2_ACCESS_KEY_ID` | tom | Adgangsnøgle til en privat R2-bucket |
| `R2_SECRET_ACCESS_KEY` | tom | Hemmelig R2-adgangsnøgle |
| `R2_BUCKET` | tom | Navnet på R2-bucketen |
| `R2_PREFIX` | `busops` | Mappepræfiks til BusOps-filer |
| `R2_JURISDICTION` | tom | `eu` for en bucket med EU-jurisdiktion |
| `INITIAL_ADMIN_EMAIL` | lokal standardværdi | Første administrator i en tom database |
| `INITIAL_ADMIN_PASSWORD` | lokal testværdi | Påkrævet i produktion, mindst 12 tegn |
| `SESSION_TTL_HOURS` | `8` | Login-sessionens varighed |
| `TRUST_PROXY` | `false` | Sættes til `true` bag hostingudbyderens HTTPS-proxy |

## Systemtest

Kør den samlede test af login, roller, ture, sædeplan, passagerer, bagage, udgifter, kvitteringer, kontantafstemning og økonomirapporter med:

```powershell
npm test
```

Testen bruger sin egen midlertidige database og ændrer derfor ikke driftsdata.

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

## Online uden eget domæne

Projektet er klargjort til en hostingudbyders HTTPS-adresse og behøver derfor ikke et eget domæne. Produktionsversionen understøtter PostgreSQL, permanente login-sessioner, Secure-cookie, kontrol af afsenderadresse, loginbegrænsning, sikkerhedsoverskrifter, helbredstjek og kontrolleret nedlukning.

Den medfølgende `render.yaml` kan oprette webtjeneste, PostgreSQL og permanent fil-disk i Frankfurt. Render tildeler automatisk en `onrender.com`-adresse med HTTPS. Den permanente disk og en database til varig drift kræver en betalt opsætning.

Bagagebilleder og kvitteringer skal ligge på en permanent disk. Database og disk skal sikkerhedskopieres separat. Den samlede trin-for-trin-tjekliste findes i `docs/production.md`.

BusOps kan desuden spejle nye filer til en privat Cloudflare R2-bucket. Start altid med `FILE_STORAGE_BACKEND=mirror`, så Render-disken fortsat fungerer som sikkerhed. Se `docs/cloudflare-r2.md`.

Ved en helt tom produktionsdatabase oprettes kun administratoren fra `INITIAL_ADMIN_EMAIL` og `INITIAL_ADMIN_PASSWORD`. Demo-chauffører oprettes aldrig i produktion.
