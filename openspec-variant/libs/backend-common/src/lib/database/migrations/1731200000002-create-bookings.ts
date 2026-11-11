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
        "confirmation_status" character varying(16) NOT NULL DEFAULT 'PENDING',
        "confirmation_attempts" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_bookings_time_order" CHECK ("ends_at" > "starts_at"),
        CONSTRAINT "CHK_bookings_confirmation_status" CHECK ("confirmation_status" IN ('PENDING', 'SENT', 'FAILED')),
        CONSTRAINT "PK_bookings_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_bookings_starts_at_id" ON "bookings" ("starts_at", "id")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_bookings_room_id_starts_at_id" ON "bookings" ("room_id", "starts_at", "id")`,
    );
    await queryRunner.query(
      `CREATE TABLE "idempotency_keys" (
        "key" uuid NOT NULL,
        "request_fingerprint" character(64) NOT NULL,
        "response_status" integer NOT NULL,
        "response_body" jsonb NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_idempotency_keys_key" PRIMARY KEY ("key")
      )`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "idempotency_keys"`);
    await queryRunner.query(`DROP TABLE "bookings"`);
  }
}
