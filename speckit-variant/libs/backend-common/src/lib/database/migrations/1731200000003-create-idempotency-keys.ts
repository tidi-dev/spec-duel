import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIdempotencyKeys1731200000003 implements MigrationInterface {
  name = 'CreateIdempotencyKeys1731200000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "idempotency_keys" (
        "key" uuid NOT NULL,
        "request_fingerprint" character(64) NOT NULL,
        "response_status" smallint NOT NULL,
        "response_body" jsonb NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_idempotency_keys_key" PRIMARY KEY ("key")
      )`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "idempotency_keys"`);
  }
}
