-- CreateEnum
CREATE TYPE "YearCalendar" AS ENUM ('JALALI', 'GREGORIAN');

-- AlterTable
--
-- Backfilled to GREGORIAN because that is what every hand-entered span already
-- means: the column this replaces was validated as 1900-2100, so nothing in the
-- database can be a Jalali year today. The default is dropped immediately
-- afterwards so that new rows must state their calendar rather than inherit a
-- guess — see the yearCalendar comment on CarModel in schema.prisma.
ALTER TABLE "CarModel" ADD COLUMN "yearCalendar" "YearCalendar" NOT NULL DEFAULT 'GREGORIAN';
ALTER TABLE "CarModel" ALTER COLUMN "yearCalendar" DROP DEFAULT;
