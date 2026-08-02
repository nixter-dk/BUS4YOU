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
- `originId`, `destinationId`
- `basePrice`
- `primaryDriverId`, `secondaryDriverId`

### passengers

- `id`, `tripId`, `name`, `phone`
- `pickupStopId`, `destinationStopId`
- `paymentStatus`, `cashAmount`
- `seatNumber`, `seatType`, `seatSurcharge`, `totalPrice`
- `checkedIn`, `checkedInAt`

For en SQL-database skal `(tripId, seatNumber)` have en unik constraint.

### baggage

- `id`, `tripId`, `senderName`, `phone`
- `pickupStopId`, `destinationStopId`
- `pieces`, `description`, `notes`
- `paymentStatus`, `cashAmount`
- `status`

## Adgangsregler

- Administratoren kan læse og administrere alle ture.
- En chauffør kan kun læse en tur, når brugerens ID er `primaryDriverId` eller `secondaryDriverId`.
- Kun administratoren kan oprette ture, steder, passagerer og bagage.
- En tildelt chauffør kan udføre check-in og ændre bagagestatus.
- Reglerne håndhæves på serveren og er ikke kun skjult i brugerfladen.
