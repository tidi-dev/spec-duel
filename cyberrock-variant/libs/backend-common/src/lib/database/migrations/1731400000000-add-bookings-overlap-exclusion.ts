import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookingsOverlapExclusion1731400000000 implements MigrationInterface {
  name = 'AddBookingsOverlapExclusion1731400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "EXCL_bookings_room_span"
        EXCLUDE USING gist ("room_id" WITH =, tstzrange("starts_at", "ends_at") WITH &&)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT "EXCL_bookings_room_span"`);
  }
}
