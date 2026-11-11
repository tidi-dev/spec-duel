import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBookings1731200000002 implements MigrationInterface {
  name = 'CreateBookings1731200000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "bookings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "room_id" uuid NOT NULL,
        "title" character varying(120) NOT NULL,
        "organizer_email" character varying(320) NOT NULL,
        "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "confirmation_status" character varying(10) NOT NULL DEFAULT 'PENDING',
        "confirmation_attempts" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CK_bookings_time_range" CHECK ("ends_at" > "starts_at"),
        CONSTRAINT "CK_bookings_confirmation_status" CHECK ("confirmation_status" IN ('PENDING', 'SENT', 'FAILED')),
        CONSTRAINT "PK_bookings_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_bookings_starts_at" ON "bookings" ("starts_at", "id")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_bookings_room_id_starts_at" ON "bookings" ("room_id", "starts_at", "id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "bookings"`);
  }
}
