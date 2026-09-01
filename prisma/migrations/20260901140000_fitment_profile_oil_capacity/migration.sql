-- How much oil the engine takes, in millilitres.
--
-- Millilitres because that is the unit Product.volumeMl already uses, so a
-- 4-litre recommendation and a 4-litre bottle are the same kind of number.
-- Entered and shown in litres, which is how the source writes it.
--
-- Two figures because a new filter has to be filled as well, so the with-filter
-- figure is the larger of the two. Unlike the rest of the source's oil block,
-- this part is reliably filled in: 647 of 660 cars state both.
ALTER TABLE "FitmentProfile"
  ADD COLUMN "oilCapacityNoFilterMl"   INTEGER,
  ADD COLUMN "oilCapacityWithFilterMl" INTEGER;
