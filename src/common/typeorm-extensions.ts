import {
  Repository,
  FindOneOptions,
  DeepPartial,
  UpdateResult,
  DeleteResult,
  InsertResult,
  ObjectId,
  FindOptionsWhere,
} from 'typeorm';
import { EntityTarget } from 'typeorm/common/EntityTarget';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

// TypeORM의 Repository를 확장하여 findOneWithLock 메서드 추가
declare module 'typeorm' {
  interface Repository<Entity> {
    insertOrFail(entity: QueryDeepPartialEntity<Entity>): Promise<number>;
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
    ): Promise<UpdateResult>;
    deleteOrFail(criteria: EntityTarget<Entity>): Promise<DeleteResult>;
  }
}

Repository.prototype.insertOrFail = async function (
  entity: QueryDeepPartialEntity<any>,
  message: string = 'Insert operation failed: No identifiers returned.',
) {
  const result: InsertResult = await this.insert(entity);
  if (!result.identifiers || result.identifiers.length === 0) {
    throw new Error(message);
  }
  return result.identifiers[0].id;
};

Repository.prototype.updateOrFail = async function (
  criteria: any,
  partialEntity: QueryDeepPartialEntity<any>,
  message: string = 'Update operation failed: No rows were affected.',
): Promise<UpdateResult> {
  const result: UpdateResult = await this.update(criteria, partialEntity);
  if (result.affected === 0) {
    throw new Error(message);
  }
  return result;
};

Repository.prototype.deleteOrFail = async function (
  criteria: any,
  message: string = 'Delete operation failed: No rows were affected.',
): Promise<DeleteResult> {
  const result: DeleteResult = await this.delete(criteria);
  if (result.affected === 0) {
    throw new Error(message);
  }
  return result.raw;
};
