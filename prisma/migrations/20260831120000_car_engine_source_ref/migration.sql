-- The importer's idempotency key moves down one level, onto the type.
--
-- oil-city has no types: a whole car identity is one string, and the importer
-- had nowhere to put it but `CarModel`. That made their "model" our model, so
-- 806 of them became 806 CarModel rows with one engine each, and the finder's
-- model step listed year spans and gearboxes instead of cars.
--
-- Their "model" is really our TYPE. Once `scripts/regroup-cars.ts` folds those
-- rows into ~497 real models, the row that corresponds one-to-one with a source
-- URL is the CarEngine, not the CarModel — so that is where `sourceRef` has to
-- live for a re-import to find what it already created. Without this column the
-- importer would re-create every flat model on its next run and undo the
-- regrouping. Nullable, because hand-entered types have no source.
ALTER TABLE "CarEngine" ADD COLUMN "sourceRef" TEXT;

CREATE UNIQUE INDEX "CarEngine_sourceRef_key" ON "CarEngine"("sourceRef");
