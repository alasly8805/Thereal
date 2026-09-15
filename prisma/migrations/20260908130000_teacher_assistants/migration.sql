-- Teacher-created assistant accounts (role = "assistant")
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "assistantOfTeacherId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "assistantPermissions" TEXT;

CREATE INDEX IF NOT EXISTS "User_assistantOfTeacherId_idx" ON "User"("assistantOfTeacherId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_assistantOfTeacherId_fkey'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_assistantOfTeacherId_fkey"
      FOREIGN KEY ("assistantOfTeacherId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
