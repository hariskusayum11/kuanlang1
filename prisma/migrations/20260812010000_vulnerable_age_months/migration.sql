ALTER TABLE "vulnerable_person"
ADD COLUMN "ageMonths" INTEGER;

ALTER TABLE "vulnerable_person"
ADD CONSTRAINT "vulnerable_person_age_months_check"
CHECK ("ageMonths" IS NULL OR ("ageMonths" >= 0 AND "ageMonths" <= 11));
