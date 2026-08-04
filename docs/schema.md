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

- `id`, `title`, `departureAt`, `durationMinutes`, `status`
- `originId`, `destinationId`, `busId`
- `basePrice`, `seatCount` (1–84, kun administratoren kan ændre værdien)
- `primaryDriverId`, `secondaryDriverId`, `salesManagerId`

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
- `checkedIn`, `checkedInAt`
- `checkedInBy`, `attendanceStatus`, `attendanceHistory` (viser medarbejder og tidspunkt for hver handling)

For en SQL-database skal `(tripId, seatNumber)` have en unik constraint.

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

## Adgangsregler

- Administratoren kan læse og administrere alle ture.
- En chauffør kan kun læse en tur, når brugerens ID er `primaryDriverId` eller `secondaryDriverId`.
- Salgschefer kan læse alle ture, men kan kun betjene passagerer og bagage ved den enkelte turs startsted.
- Kun administratoren kan ændre turens chauffører, og kun når ingen passager på turen er checket ind.
- Kun administratoren kan oprette ture og steder. Den tildelte salgschef kan oprette passagerer og bagage fra turens startsted.
- Kalenderen bruger `departureAt` og `durationMinutes` til at advare om overlappende brug af samme bus eller chauffør.
- Kun administratoren kan redigere/slette opsamlingssteder og ændre bussens sædekapacitet.
- Kun administratoren kan oprette, redigere og slette busser. En bus, der er tildelt en tur, kan ikke slettes.
- Kun administratoren kan oprette, redigere og slette chaufførkonti; chauffører oprettes separat, før de kan tildeles en tur. Tildelte chauffører kan ikke slettes.
- Kun administratoren kan oprette, redigere og slette salgschefkonti. `salesManagerId` kan fortsat markere den ansvarlige salgschef, men begrænser ikke turoversigten. Konti med registreret handlings- eller betalingshistorik kan ikke slettes.
- Kun administratoren kan se den samlede salgs- og økonomirapport. DKK og EUR summeres separat uden automatisk valutaomregning.
- Overblikssiden returnerer kun ture, opgaver og kontantansvar, som den aktuelle rolle har adgang til; administratoren ser den samlede drift.
- En tildelt chauffør kan udføre check-in og ændre bagagestatus.
- Turens primære og sekundære chauffør kan sælge nye kontantbetalte billetter på deres tildelte tur. Betalingen registreres som modtaget i bussen og kontanterne knyttes automatisk til den chauffør, der udførte salget.
- Ny bagage kan kun registreres med et dokumentationsfoto i JPG-, PNG- eller WebP-format på højst 5 MB. Fotoet er knyttet til turen og kan kun ses af personale med adgang til turen.
- Administratoren, de tildelte chauffører og turens salgschef kan ændre betaling fra ikke betalt til betalt inden for deres arbejdssted. Betaling kan ikke ændres tilbage til ikke betalt.
- Ved betaling i bussen knyttes kontanterne til chaufføren. Betaling ved startstedet knyttes til den tildelte salgschef.
- Administratoren og de tildelte chauffører kan registrere turudgifter og uploade en PDF- eller billedkvittering på højst 5 MB. En udgift kan gemmes uden bilag, men kan ikke godkendes, før kvitteringen er tilføjet.
- Chaufføren og salgschefen kan hver indsende en kontantafstemning for deres tur. Kun administratoren kan godkende eller afvise den, og kontanter flyttes først til kontoret ved godkendelse.
- Reglerne håndhæves på serveren og er ikke kun skjult i brugerfladen.
