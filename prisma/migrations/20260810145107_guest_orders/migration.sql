-- AlterTable: a guest checkout has no account behind it (Design Decision 6),
-- so the customer FK becomes nullable and the contact details the checkout
-- form collected live on the order row instead. The foreign key itself is
-- unchanged — the schema pins `onDelete: Restrict` so an optional relation
-- keeps the RESTRICT it had while required.
ALTER TABLE "Order" ADD COLUMN     "guestEmail" TEXT,
ADD COLUMN     "guestName" TEXT,
ADD COLUMN     "guestPhone" TEXT,
ALTER COLUMN "customerId" DROP NOT NULL;
