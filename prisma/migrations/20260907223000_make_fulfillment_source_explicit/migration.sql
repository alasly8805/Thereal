-- fulfillmentSource must be set explicitly by every code path.
-- The old default 'PURCHASE' made admin panel grants indistinguishable from real payments.
ALTER TABLE "CourseEnrollment" ALTER COLUMN "fulfillmentSource" DROP DEFAULT;
