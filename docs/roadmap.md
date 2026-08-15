# BusOps – prioriteret roadmap

Denne liste gemmer de anbefalede næste forbedringer efter den nuværende Bootstrap-opdatering. Punkterne er prioriteret efter driftsrisiko og forretningsværdi.

## Før eller umiddelbart efter næste produktionsrelease

1. **Sikker release, backup og rollback**
   - Tag backup af PostgreSQL og den permanente uploadmappe før deployment.
   - Kontrollér `/api/health`, login og en testtur efter deployment.
   - Bevar mulighed for at rulle tilbage til seneste fungerende commit.

2. **Permanent kasseregnskab**
   - Fortløbende nummer på alle posteringer.
   - DKK og EUR føres separat.
   - Fejl rettes med modpostering i stedet for overskrivning eller sletning.
   - Startsaldo, indbetalinger, udgifter, overførsler og slutsaldo per medarbejder.
   - Daglig/turrelateret kasselukning med godkendelse.

3. **Udvidet offline-drift**
   - Udvid offline-køen fra check-in til betalinger, billetsalg, bagage og statusændringer.
   - Vis tydeligt hvad der afventer synkronisering.
   - Håndtér konflikter, hvis samme post er ændret på en anden enhed.

4. **Stærkere loginbeskyttelse**
   - Tofaktorgodkendelse for administrator og salgschef.
   - Oversigt over aktive enheder og mulighed for at logge andre enheder ud.
   - Kontrolleret nulstilling af glemt adgangskode.
   - Overvågning af fejlede login- og adgangsforsøg.

5. **Driftsovervågning**
   - Alarm ved manglende backup, databasefejl og lav diskplads.
   - Alarm ved kontantdifference, usynkroniserede offline-handlinger og ikke-udleveret bagage.

## Næste forretningsfunktioner

6. **Automatisk bookingnummer**
   - Generér et internt unikt nummer, fx `ALB-2026-001842`.
   - Bevar det eksisterende valgfrie felt til eksternt billetnummer.

7. **Billet og kvittering**
   - PDF, udskrift og eventuelt afsendelse via e-mail eller SMS.
   - Samlet familiebillet samt mulighed for genudskrift uden ny betaling.

8. **Advarsel om mulig dobbeltbooking**
   - Advar ved samme navn eller telefonnummer på samme tur.
   - Brugeren kan fortsætte efter bekræftelse, hvis bookingen er korrekt.

9. **Sikker bagageudlevering uden QR-kode**
   - Tilfældig 4- eller 6-cifret udleveringskode.
   - Registrér modtager, tidspunkt og eventuelt underskrift/foto ved udlevering.

10. **Klar til afgang-kontrol**
    - Kontrollér bus, chauffører, passagerstatus, bagage, startbudget, kontanter og åbne dokumenter.
    - Primær chauffør afslutter og bekræfter kontrollen.

11. **GPS og passagerinformation**
    - Web-track-integration med position og forventet ankomst.
    - Offentlig visning må aldrig indeholde passager- eller økonomioplysninger.

## Teknisk udviklingsplan

12. **Automatisk billedoptimering**
    - Komprimér store bagagefotos automatisk i stedet for at afvise dem.

13. **Relationel datamodel**
    - Flyt på længere sigt systemtilstanden fra én samlet JSONB-post til separate PostgreSQL-tabeller og transaktioner.

14. **GDPR og opbevaringspolitik**
    - Fastlæg frister for opbevaring af telefonnumre, billeder, bilag og historik.
    - Anonymisér persondata, når de ikke længere er nødvendige, uden at ødelægge påkrævet økonomidokumentation.

## Anbefalet rækkefølge

Backup/release → kasseregnskab → offline-drift → loginbeskyttelse → automatisk bookingnummer og billet → bagagekode → GPS/SMS.
