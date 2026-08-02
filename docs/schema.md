# Datamodel

Den lokale MVP gemmer nedenstående relationelle struktur som JSON. ID-referencer og adgangsregler svarer til en senere SQL-model, så datalaget kan udskiftes uden at ændre brugerflowet.

## Entiteter

### users

- `id`, `name`, `email`
- `role`: `admin` eller `driver`
- `salt`, `passwordHash`

### stops

- `id`, `name`, `address`

### trips

- `id`, `title`, `departureAt`, `status`
- `originId`, `destinationId`, `busId`
- `basePrice`, `seatCount` (1–84, kun administratoren kan ændre værdien)
- `primaryDriverId`, `secondaryDriverId`

### buses

- `id`, `name`, `registration`
- `type`: `standard` eller `double`
- `seatCount`, `lowerDeckSeats`

### passengers

- `id`, `tripId`, `name`, `phone`
- `pickupStopId`, `destinationStopId`
- `paymentStatus`, `paymentCurrency` (`DKK` eller `EUR`), `cashAmount`, `paymentLocation`, `paymentRecordedAt`, `paymentRecordedBy`
- `seatNumber`, `seatType`, `seatSurcharge`, `totalPrice`
- `checkedIn`, `checkedInAt`

For en SQL-database skal `(tripId, seatNumber)` have en unik constraint.

### baggage

- `id`, `tripId`, `senderName`, `phone`
- `pickupStopId`, `destinationStopId`
- `pieces`, `description`, `notes`
- `paymentStatus`, `paymentCurrency` (`DKK` eller `EUR`), `cashAmount`, `paymentLocation`, `paymentRecordedAt`, `paymentRecordedBy`
- `status`

## Adgangsregler

- Administratoren kan læse og administrere alle ture.
- En chauffør kan kun læse en tur, når brugerens ID er `primaryDriverId` eller `secondaryDriverId`.
- Kun administratoren kan oprette ture, steder, passagerer og bagage.
- Kun administratoren kan redigere/slette opsamlingssteder og ændre bussens sædekapacitet.
- Kun administratoren kan oprette, redigere og slette busser. En bus, der er tildelt en tur, kan ikke slettes.
- Kun administratoren kan oprette, redigere og slette chaufførkonti; chauffører oprettes separat, før de kan tildeles en tur. Tildelte chauffører kan ikke slettes.
- Kun administratoren kan se den samlede salgs- og økonomirapport. DKK og EUR summeres separat uden automatisk valutaomregning.
- En tildelt chauffør kan udføre check-in og ændre bagagestatus.
- Administratoren og de tildelte chauffører kan ændre betaling fra ikke betalt til betalt. Betaling kan ikke ændres tilbage til ikke betalt.
- Reglerne håndhæves på serveren og er ikke kun skjult i brugerfladen.
