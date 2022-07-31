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

export type DataSourceName = string | 'default';

interface AddTransactionalDataSourceInput {
  name: string;
  dataSource: DataSource;
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

const getEntityManagerInContext = (
  dataSourceName: DataSourceName,
  entityManager: EntityManager,
) => {
  const context = getTransactionalContext();
  if (!context || !context.active) return entityManager;

  return getEntityManagerByDataSourceName(context, dataSourceName) || entityManager;
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
          return getEntityManagerInContext(
            this[TYPEORM_ENTITY_MANAGER_NAME].connection[
              TYPEORM_DATA_SOURCE_NAME
            ] as DataSourceName,
            this[TYPEORM_ENTITY_MANAGER_NAME] as EntityManager,
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
    input = { name: 'default', dataSource: input };
  }

  const { name, dataSource } = input;
  if (dataSources.has(name)) {
    throw new Error(`DataSource with name "${name}" has already added.`);
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
