import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRooms1731200000000 implements MigrationInterface {
  name = 'CreateRooms1731200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "rooms" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(100) NOT NULL,
        "capacity" integer NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_rooms_name" UNIQUE ("name"),
        CONSTRAINT "PK_rooms_id" PRIMARY KEY ("id")
      )`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "rooms"`);
  }
}
