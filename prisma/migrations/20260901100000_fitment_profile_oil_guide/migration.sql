-- The "which oil, and why" block on the found-car card.
--
-- On FitmentProfile rather than CarEngine because that is the unit the advice
-- describes: one profile already covers every type taking the same
-- recommendation, so writing it once for "i20 2016-2017" covers both of that
-- car's types.
--
-- Every column is nullable and the grade list defaults to empty, because blank
-- is the honest state for most cars today. oil-city publishes this block but
-- leaves it unfilled on 571 of 660 — see the schema.prisma comment.
ALTER TABLE "FitmentProfile"
  ADD COLUMN "oilViscosityStandard" TEXT,
  ADD COLUMN "oilViscosityHot"      TEXT,
  ADD COLUMN "oilViscosityCold"     TEXT,
  ADD COLUMN "oilApiGrades"         TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "oilGuideEn"           TEXT,
  ADD COLUMN "oilGuideFa"           TEXT;
