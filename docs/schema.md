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

- `id`, `title`, `departureAt`, `status`
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
- `checkedInBy`, `attendanceStatus`, `attendanceHistory`

For en SQL-database skal `(tripId, seatNumber)` have en unik constraint.

### baggage

- `id`, `tripId`, `senderName`, `phone`
- `pickupStopId`, `destinationStopId`
- `pieces`, `description`, `notes`
- `paymentStatus`, `paymentCurrency` (`DKK` eller `EUR`), `cashAmount`, `paymentLocation`, `paymentRecordedAt`, `paymentRecordedBy`
- `status`

### expenses

- `id`, `tripId`, `expenseDate` (hentes automatisk fra turens afgang), `category`, `description`
- `amount`, `currency`
- `receiptName`, `receiptType`, `receiptFile`
- `createdAt`, `createdBy`
- `status`: `pending`, `approved` eller `rejected`
- `reviewedAt`, `reviewedBy`, `reviewNote`

### cashSettlements

- `id`, `tripId`, `driverId`, `status`
- `expected`, `delivered`, `difference` opdelt i DKK og EUR
- `paymentRefs`, `submittedAt`, `submittedBy`
- `reviewedAt`, `reviewedBy`, `reviewNote`

## Adgangsregler

- Administratoren kan læse og administrere alle ture.
- En chauffør kan kun læse en tur, når brugerens ID er `primaryDriverId` eller `secondaryDriverId`.
- En salgschef kan kun læse turen, når brugerens ID er `salesManagerId`, og kan kun betjene passagerer og bagage ved turens startsted.
- Kun administratoren kan ændre turens chauffører, og kun når ingen passager på turen er checket ind.
- Kun administratoren kan oprette ture og steder. Den tildelte salgschef kan oprette passagerer og bagage fra turens startsted.
- Kun administratoren kan redigere/slette opsamlingssteder og ændre bussens sædekapacitet.
- Kun administratoren kan oprette, redigere og slette busser. En bus, der er tildelt en tur, kan ikke slettes.
- Kun administratoren kan oprette, redigere og slette chaufførkonti; chauffører oprettes separat, før de kan tildeles en tur. Tildelte chauffører kan ikke slettes.
- Kun administratoren kan oprette, redigere og slette salgschefkonti. En salgschef, der er tildelt en tur, kan ikke slettes.
- Kun administratoren kan se den samlede salgs- og økonomirapport. DKK og EUR summeres separat uden automatisk valutaomregning.
- En tildelt chauffør kan udføre check-in og ændre bagagestatus.
- Administratoren, de tildelte chauffører og turens salgschef kan ændre betaling fra ikke betalt til betalt inden for deres arbejdssted. Betaling kan ikke ændres tilbage til ikke betalt.
- Ved betaling i bussen knyttes kontanterne til chaufføren. Betaling ved startstedet knyttes til den tildelte salgschef.
- Administratoren og de tildelte chauffører kan registrere turudgifter og uploade en PDF- eller billedkvittering på højst 5 MB.
- Chaufføren og salgschefen kan hver indsende en kontantafstemning for deres tur. Kun administratoren kan godkende eller afvise den, og kontanter flyttes først til kontoret ved godkendelse.
- Reglerne håndhæves på serveren og er ikke kun skjult i brugerfladen.
