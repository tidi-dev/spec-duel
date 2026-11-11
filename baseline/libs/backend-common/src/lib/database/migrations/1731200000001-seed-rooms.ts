import { MigrationInterface, QueryRunner } from 'typeorm';

const SEEDED_ROOM_COUNT = 12;

const seededNames = Array.from(
  { length: SEEDED_ROOM_COUNT },
  (_, index) => `Room ${String(index + 1).padStart(2, '0')}`,
);
const seededCapacities = Array.from({ length: SEEDED_ROOM_COUNT }, (_, index) => (index + 1) * 2);

export class SeedRooms1731200000001 implements MigrationInterface {
  name = 'SeedRooms1731200000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "rooms" ("name", "capacity") SELECT * FROM unnest($1::varchar[], $2::integer[])`,
      [seededNames, seededCapacities],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "rooms" WHERE "name" = ANY($1::varchar[])`, [seededNames]);
  }
}
