import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PageQueryDto } from './page-query.dto';

const errorsFor = async (plain: Record<string, unknown>): Promise<string[]> => {
  const errors = await validate(plainToInstance(PageQueryDto, plain));
  return errors.map((error) => error.property);
};

describe('PageQueryDto', () => {
  it('defaults to page 1 with 10 items', async () => {
    const dto = plainToInstance(PageQueryDto, {});

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(10);
  });

  it('converts query strings to numbers', async () => {
    const dto = plainToInstance(PageQueryDto, { page: '2', limit: '5' });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(5);
  });

  it.each([
    [{ page: 0 }, 'page'],
    [{ page: -1 }, 'page'],
    [{ page: '1.5' }, 'page'],
    [{ limit: 0 }, 'limit'],
    [{ limit: 101 }, 'limit'],
    [{ limit: 'abc' }, 'limit'],
  ])('rejects %j', async (plain, property) => {
    expect(await errorsFor(plain)).toEqual([property]);
  });
});
