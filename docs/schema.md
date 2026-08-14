# Datamodel

Den lokale MVP gemmer nedenstående relationelle struktur som JSON. ID-referencer og adgangsregler svarer til en senere SQL-model, så datalaget kan udskiftes uden at ændre brugerflowet.

## Entiteter

### users

- `id`, `name`, `email`
- `role`: `admin`, `driver` eller `sales_manager`
- `salt`, `passwordHash`

### stops

- `id`, `name`, `address`

### trips

- `id`, `title`, `departureAt`, `destinationArrivalAt`, `durationMinutes` (beregnet), `status`
- `cancellationReason`, `cancelledAt`, `cancelledBy` ved annullering
- `originId`, `destinationId`, `busId`
- `seatCount` (1–84, kun administratoren kan ændre værdien)
- `primaryDriverId`, `secondaryDriverId`, `salesManagerId`
- `timetable`: tider i `Europe/Copenhagen`; startstedet har kun afgang, slutstedet har kun forventet ankomst, og mellemstop har både ankomst og afgang

### buses

- `id`, `name`, `registration`
- `type`: `standard` eller `double`
- `seatCount`, `lowerDeckSeats` (dobbeltdækker er fast 84/22, hvilket giver 62 sæder på overetagen)

### passengers

- `id`, `tripId`, `name`, `phone`
- `pickupStopId`, `destinationStopId`
- `paymentStatus` (`unpaid`, `cash` eller `free`), `paymentCurrency` (`DKK` eller `EUR`), `cashAmount`, `paymentLocation`, `paymentRecordedAt`, `paymentRecordedBy`
- `freeTicketReason` (valgfri begrundelse ved gratis billet)
- `seatNumber`, `seatType`, `seatSurcharge`, `totalPrice`
- `extraSeatNumber`, `extraSeatAmount`, `extraSeatCurrency`, `extraSeatFree`, `extraSeatReason` ved køb af et ekstra nabosæde under billetbestillingen
- `ticketType` (`one_way`, `return_fixed` eller `return_open`) og `journeyLeg` (`outbound` eller `return`)
- `bookingGroupId`, `returnStatus`, `returnTripId`, `returnPassengerId` og `outboundPassengerId` forbinder ud- og returrejsen
- `partyBookingId`, `partyPrimaryPassengerId`, `partyRole` og `partySize` forbinder en familie- eller gruppebooking. Hovedpersonen har kontakttelefon og den fælles betaling; øvrige medlemmer har betalingsstatus `group_included`
- `openReturnValidUntil` angiver sidste gyldighedsdag for en åben returbillet
- `checkedIn`, `checkedInAt`
- `checkedInBy`, `attendanceStatus`, `attendanceHistory` (viser medarbejder og tidspunkt for hver handling)

For en SQL-database skal `(tripId, seatNumber)` have en unik constraint.

En fast returbillet opretter en separat returpassager på den valgte returtur med betalingsstatus `return_included`. Betalingen og omsætningen registreres kun på den oprindelige billet. En åben returbillet reserverer ikke et sæde, før en bruger senere vælger en gyldig returtur og et ledigt sæde.

En familie- eller gruppebooking opretter fortsat én passagerpost pr. rejsende, så alle kan få eget sæde og egen check-in. Telefon, opsamlingssted, destination, billettype og betaling deles fra hovedpersonen. Hvis hovedpersonen slettes ved en fejlrettelse, forfremmes et tilbageværende medlem automatisk, så gruppens kontakt- og betalingshistorik bevares.

### baggage

- `id`, `tripId`, `senderName`, `phone`
- `pickupStopId`, `destinationStopId`
- `pieces`, `description`, `notes`
- `photoName`, `photoType`, `photoFile` (obligatorisk foto ved registrering)
- `paymentStatus`, `paymentCurrency` (`DKK` eller `EUR`), `cashAmount`, `paymentLocation`, `paymentRecordedAt`, `paymentRecordedBy`
- `status`, `createdAt`, `createdBy`, `statusUpdatedAt`, `statusUpdatedBy`, `baggageHistory`

### expenses

- `id`, `tripId`, `expenseDate` (hentes automatisk fra turens afgang), `category`, `description`
- `amount`, `currency`, `paymentMethod` (`company_card`, `cash` eller `private`), `paidByUserId`
- `receiptName`, `receiptType`, `receiptFile` (kan tilføjes efter registreringen)
- `createdAt`, `createdBy`
- `status`: `pending`, `approved` eller `rejected`
- `reviewedAt`, `reviewedBy`, `reviewNote`
- `reimbursementStatus`, `reimbursedAt`, `reimbursedBy` for private udlæg

### cashSettlements

- `id`, `tripId`, `driverId`, `status`
- `expected`, `delivered`, `difference` opdelt i DKK og EUR
- `paymentRefs`, `submittedAt`, `submittedBy`
- `reviewedAt`, `reviewedBy`, `reviewNote`

### cashTransfers

- `id`, `tripId`, `fromUserId`, `toUserId`, `transferType`, `status`
- `totals` i DKK og EUR, `cashTransferAllocations`, `note`, `receiptNumber`
- `sourceDetailsRestricted` skjuler de underliggende billet- og bagagereferencer for chaufføren ved budgetoverførsel fra en salgschef
- `initiatedAt`, `respondedAt` og bruger-ID'er til revisionshistorik

### cashBudgetEntries

- `id`, `transferId`, valgfrit `tripId`, `cashHolderUserId`
- `paymentStatus`, `paymentLocation`, `paymentCurrency`, `cashAmount`
- `cashHandedOverAt`, `cashSettlementId`, `createdAt`, `createdBy`
- En budgetpost er en særskilt kassepost og er ikke billet- eller bagageomsætning.

## Adgangsregler

- Administratoren kan læse og administrere alle ture.
- En tur kan kun bruge et sted med navnet `København` eller `Tetovo` som `originId`. Andre oprettede steder kan fortsat bruges som opsamlingssted og destination.
- `passengers.pickupStopId` er uafhængig af turens `originId`. Administratoren, salgschefer og de tildelte chauffører kan vælge alle oprettede steder, mens check-in kan udføres ved alle stop med passagerer.
- En chauffør kan kun læse en tur, når brugerens ID er `primaryDriverId` eller `secondaryDriverId`.
- Salgschefer kan læse alle ture, oprette og korrigere passagerer fra alle oprettede opsamlingssteder samt udføre check-in ved alle stop med passagerer. Ny bagage og betaling ved salgsstedet er fortsat knyttet til turens startsted.
- Kun administratoren kan ændre turens chauffører, og kun når ingen passager på turen er checket ind.
- Kun administratoren kan annullere en tur. Begrundelse, tidspunkt og administrator gemmes, og turens historik bevares.
- Kun en tur uden passagerer, bagage, udgifter og kontantafstemninger kan slettes permanent. Ellers skal turen annulleres.
- Kun administratoren kan oprette ture og steder. Salgschefer kan oprette passagerer på alle stop og bagage fra turens startsted.
- Kalenderen bruger turens afgangstid til planlægning og viser ressourcekonflikter for bus og chauffører.
- Kun administratoren kan redigere/slette opsamlingssteder og ændre bussens sædekapacitet.
- Kun administratoren kan oprette, redigere og slette busser. En bus, der er tildelt en tur, kan ikke slettes.
- Kun administratoren kan oprette, redigere og slette chaufførkonti; chauffører oprettes separat, før de kan tildeles en tur. Chauffører med tildelinger eller registreret drifts-, betalings-, udgifts- eller revisionshistorik kan ikke slettes.
- Kun administratoren kan oprette, redigere og slette salgschefkonti. `salesManagerId` kan fortsat markere den ansvarlige salgschef, men begrænser ikke turoversigten. Konti med registreret handlings- eller betalingshistorik kan ikke slettes.
- Kun administratoren kan se den samlede salgs- og økonomirapport. DKK og EUR summeres separat uden automatisk valutaomregning.
- Overblikssiden returnerer kun ture, opgaver og kontantansvar, som den aktuelle rolle har adgang til; administratoren ser den samlede drift.
- En tildelt chauffør kan udføre check-in og ændre bagagestatus.
- Turens primære og sekundære chauffør kan sælge nye kontantbetalte billetter på deres tildelte tur. Betalingen registreres som modtaget i bussen og kontanterne knyttes automatisk til den chauffør, der udførte salget.
- Turens primære og sekundære chauffør kan også modtage ny kontantbetalt bagage i bussen. Det obligatoriske foto gemmes på turen, og kontanterne knyttes automatisk til den chauffør, der modtog bagagen.
- Ny bagage kan kun registreres med et dokumentationsfoto i JPG-, PNG- eller WebP-format. Der er ingen særskilt filgrænse for bagagefotoet; hele API-anmodningen har en sikkerhedsgrænse på 128 MB. Fotoet er knyttet til turen og kan kun ses af personale med adgang til turen.
- Administratoren, de tildelte chauffører og turens salgschef kan ændre betaling fra ikke betalt til betalt inden for deres arbejdssted. Betaling kan ikke ændres tilbage til ikke betalt.
- Ved betaling i bussen knyttes kontanterne til chaufføren. Betaling ved startstedet knyttes til den tildelte salgschef.
- Administratoren og de tildelte chauffører kan registrere turudgifter og uploade en PDF- eller billedkvittering på højst 5 MB. En udgift kan gemmes uden bilag, men kan ikke godkendes, før kvitteringen er tilføjet.
- Chaufføren og salgschefen kan hver indsende en kontantafstemning for deres tur. Kun administratoren kan godkende eller afvise den, og kontanter flyttes først til kontoret ved godkendelse.
- Salgschefer kan overføre et samlet disponibelt budget til en chauffør med eller uden en bestemt tur. Chaufføren ser beløb, formål og kvitteringsnummer, men ikke hvilke konkrete billetter eller bagagebetalinger budgettet stammer fra.
- Kontante udgifter fra en chauffør eller salgschef reserveres mod personens disponible kasseposter og reducerer kassesaldoen. Samme beløb kan derfor ikke både bruges som udgift og overføres eller afstemmes.
- Reglerne håndhæves på serveren og er ikke kun skjult i brugerfladen.
