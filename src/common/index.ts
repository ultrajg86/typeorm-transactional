import { createNamespace, getNamespace, Namespace } from 'cls-hooked';
import { DataSource, EntityManager } from 'typeorm';
import {
  NAMESPACE_NAME,
  TYPEORM_DATA_SOURCE_NAME,
  TYPEORM_DATA_SOURCE_NAME_PREFIX,
  TYPEORM_ENTITY_MANAGER_NAME,
  TYPEORM_HOOK_NAME,
} from './constants';
import { EventEmitter } from 'events';
import { TypeOrmUpdatedPatchError } from '../errors/typeorm-updated-patch';

export type DataSourceName = string | 'default';

interface AddTransactionalDataSourceInput {
  /**
   * Custom name for data source
   */
  name?: DataSourceName;
  dataSource: DataSource;
  /**
   * Whether to "patch" some `DataSource` methods to support their usage in transactions (default `true`).
   *
   * If you don't need to use `DataSource` methods in transactions and you only work with `Repositories`,
   * you can set this flag to `false`.
   */
  patch?: boolean;
}

/**
 * Map of added data sources.
 *
 * The property "name" in the `DataSource` is deprecated, so we add own names to distinguish data sources.
 */
const dataSources = new Map<DataSourceName, DataSource>();

export const getTransactionalContext = () => getNamespace(NAMESPACE_NAME);

export const getEntityManagerByDataSourceName = (context: Namespace, name: DataSourceName) => {
  if (!dataSources.has(name)) return null;

  return (context.get(TYPEORM_DATA_SOURCE_NAME_PREFIX + name) as EntityManager) || null;
};

export const setEntityManagerByDataSourceName = (
  context: Namespace,
  name: DataSourceName,
  entityManager: EntityManager | null,
) => {
  if (!dataSources.has(name)) return;

  context.set(TYPEORM_DATA_SOURCE_NAME_PREFIX + name, entityManager);
};

const getEntityManagerInContext = (dataSourceName: DataSourceName) => {
  const context = getTransactionalContext();
  if (!context || !context.active) return null;

  return getEntityManagerByDataSourceName(context, dataSourceName);
};

const patchDataSource = (dataSource: DataSource) => {
  let originalManager = dataSource.manager;

  Object.defineProperty(dataSource, 'manager', {
    get() {
      return (
        getEntityManagerInContext(this[TYPEORM_DATA_SOURCE_NAME] as DataSourceName) ||
        originalManager
      );
    },
    set(manager: EntityManager) {
      originalManager = manager;
    },
  });

  const originalQuery = DataSource.prototype.query;
  if (originalQuery.length !== 3) {
    throw new TypeOrmUpdatedPatchError();
  }

  dataSource.query = function (...args: unknown[]) {
    args[2] = args[2] || this.manager?.queryRunner;

    return originalQuery.apply(this, args);
  };

  const originalCreateQueryBuilder = DataSource.prototype.createQueryBuilder;
  if (originalCreateQueryBuilder.length !== 3) {
    throw new TypeOrmUpdatedPatchError();
  }

  dataSource.createQueryBuilder = function (...args: unknown[]) {
    if (args.length === 0) {
      return originalCreateQueryBuilder.apply(this, [this.manager?.queryRunner]);
    }

    args[2] = args[2] || this.manager?.queryRunner;

    return originalCreateQueryBuilder.apply(this, args);
  };

  dataSource.transaction = function (...args: unknown[]) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return originalManager.transaction(...args);
  };
};

export const initializeTransactionalContext = () => {
  const originalGetRepository = EntityManager.prototype.getRepository;

  EntityManager.prototype.getRepository = function (...args: unknown[]) {
    const repository = originalGetRepository.apply(this, args);

    if (!(TYPEORM_ENTITY_MANAGER_NAME in repository)) {
      /**
       * Store current manager
       */
      repository[TYPEORM_ENTITY_MANAGER_NAME] = repository.manager;

      /**
       * Patch repository object
       */
      Object.defineProperty(repository, 'manager', {
        get() {
          return (
            getEntityManagerInContext(
              this[TYPEORM_ENTITY_MANAGER_NAME].connection[
                TYPEORM_DATA_SOURCE_NAME
              ] as DataSourceName,
            ) || this[TYPEORM_ENTITY_MANAGER_NAME]
          );
        },
        set(manager: EntityManager | undefined) {
          this[TYPEORM_ENTITY_MANAGER_NAME] = manager;
        },
      });
    }

    return repository;
  };

  return createNamespace(NAMESPACE_NAME) || getNamespace(NAMESPACE_NAME);
};

export const addTransactionalDataSource = (input: DataSource | AddTransactionalDataSourceInput) => {
  if (input instanceof DataSource) {
    input = { name: 'default', dataSource: input, patch: true };
  }

  const { name = 'default', dataSource, patch = true } = input;
  if (dataSources.has(name)) {
    throw new Error(`DataSource with name "${name}" has already added.`);
  }

  if (patch) {
    patchDataSource(dataSource);
  }

  dataSources.set(name, dataSource);
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  dataSource[TYPEORM_DATA_SOURCE_NAME] = name;

  return input.dataSource;
};

export const getDataSourceByName = (name: DataSourceName) => dataSources.get(name);

export const getHookInContext = (context: Namespace | undefined) =>
  context?.get(TYPEORM_HOOK_NAME) as EventEmitter | null;

export const setHookInContext = (context: Namespace, emitter: EventEmitter | null) =>
  context.set(TYPEORM_HOOK_NAME, emitter);
