import {
  Repository,
  UpdateResult,
  DeleteResult,
  InsertResult,
  ObjectId,
  FindOptionsWhere,
  ObjectLiteral,
} from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

declare module 'typeorm' {
  interface Repository<Entity> {
    insertOrFail(entity: QueryDeepPartialEntity<Entity>, message?: string): Promise<Entity>;
    updateOrFail(
      criteria:
        | string
        | string[]
        | number
        | number[]
        | Date
        | Date[]
        | ObjectId
        | ObjectId[]
        | FindOptionsWhere<Entity>,
      partialEntity: QueryDeepPartialEntity<Entity>,
      message?: string,
    ): Promise<[UpdateResult, number]>;
    deleteOrFail(
      criteria:
        | string
        | string[]
        | number
        | number[]
        | Date
        | Date[]
        | ObjectId
        | ObjectId[]
        | FindOptionsWhere<Entity>,
      message?: string,
    ): Promise<[DeleteResult, number]>;
  }
}

Repository.prototype.insertOrFail = async function <Entity extends ObjectLiteral>(
  this: Repository<Entity>,
  entity: QueryDeepPartialEntity<Entity>,
  message = 'Insert operation failed: No identifiers returned.',
): Promise<Entity> {
  const result: InsertResult = await this.insert(entity);
  if (!result.identifiers || result.identifiers.length === 0) {
    throw new Error(message);
  }
  return result.identifiers[0] as Entity;
};

Repository.prototype.updateOrFail = async function <Entity extends ObjectLiteral>(
  this: Repository<Entity>,
  criteria:
    | string
    | string[]
    | number
    | number[]
    | Date
    | Date[]
    | ObjectId
    | ObjectId[]
    | FindOptionsWhere<Entity>,
  partialEntity: QueryDeepPartialEntity<Entity>,
  message = 'Update operation failed: No rows were affected.',
): Promise<[UpdateResult, number]> {
  const result: UpdateResult = await this.update(criteria, partialEntity);
  if (result.affected === 0 || result.affected === undefined) {
    throw new Error(message);
  }
  return [result, result.affected];
};

Repository.prototype.deleteOrFail = async function <Entity extends ObjectLiteral>(
  this: Repository<Entity>,
  criteria:
    | string
    | string[]
    | number
    | number[]
    | Date
    | Date[]
    | ObjectId
    | ObjectId[]
    | FindOptionsWhere<Entity>,
  message = 'Delete operation failed: No rows were affected.',
): Promise<[DeleteResult, number]> {
  const result: DeleteResult = await this.delete(criteria);
  if (result.affected === 0 || result.affected === null || result.affected === undefined) {
    throw new Error(message);
  }
  return [result, result.affected];
};
