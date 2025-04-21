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
      findOneLock(options: FindOneOptions<Entity>): Promise<Entity | null>;
      insertOrFail(entity: QueryDeepPartialEntity<Entity>): Promise<Entity>;
      updateOrFail(
        criteria: string | string[] | number | number[] | Date | Date[] | ObjectId | ObjectId[] | FindOptionsWhere<Entity>,
        partialEntity: QueryDeepPartialEntity<Entity>,
      ): Promise<void>;
      deleteOrFail(criteria: EntityTarget<Entity>): Promise<void>;
    }
  }
  
  Repository.prototype.findOneLock = async function (options: FindOneOptions<any>) {
    // Locking을 위한 쿼리 빌더 사용
    options.lock = {
        mode: 'pessimistic_write', // Locking 모드 설정
    }
    return this.findOne(options);
  };
  
  Repository.prototype.insertOrFail = async function (entity: QueryDeepPartialEntity<any>) {
    const result: InsertResult = await this.insert(entity);
    if (!result.identifiers || result.identifiers.length === 0) {
      throw new Error('Insert operation failed: No rows were affected.');
    }
    return result.generatedMaps[0] || entity;
  };
  
  Repository.prototype.updateOrFail = async function (
    criteria: any,
    partialEntity: QueryDeepPartialEntity<any>,
  ) {
    const result: UpdateResult = await this.update(criteria, partialEntity);
    console.log(result);
    if (result.affected === 0) {
      throw new Error('Update operation failed: No rows were affected.');
    }
    return result.raw;
  };
  
  Repository.prototype.deleteOrFail = async function (criteria: any) {
    const result: DeleteResult = await this.delete(criteria);
    if (result.affected === 0) {
      throw new Error('Delete operation failed: No rows were affected.');
    }
    return result.raw;
  };
  