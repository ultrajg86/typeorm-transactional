import { EntityManager } from 'typeorm';
import {
  DataSourceName,
  getDataSourceByName,
  getEntityManagerByDataSourceName,
  getTransactionalContext,
  setEntityManagerByDataSourceName,
} from '../common';

import { IsolationLevel } from '../enums/isolation-level';
import { Propagation } from '../enums/propagation';
import { runInNewHookContext } from '../hooks';
import { TransactionalError } from '../errors/transactional';

export interface WrapInTransactionOptions {
  /**
   * For compatibility with `typeorm-transactional-cls-hooked` we use `connectionName`
   */
  connectionName?: DataSourceName;

  propagation?: Propagation;

  isolationLevel?: IsolationLevel;

  name?: string | symbol;
}

export const wrapInTransaction = <Fn extends (this: any, ...args: any[]) => ReturnType<Fn>>(
  fn: Fn,
  options?: WrapInTransactionOptions,
) => {
  async function wrapper(this: unknown, ...args: unknown[]) {
    const context = getTransactionalContext();
    if (!context) {
      throw new Error(
        'No CLS namespace defined in your app ... please call initializeTransactionalContext() before application start.',
      );
    }

    const connectionName = options?.connectionName ?? 'default';
    const dataSource = getDataSourceByName(connectionName);
    if (!dataSource) {
      throw new Error(
        'No data sources defined in your app ... please call addTransactionalDataSources() before application start.',
      );
    }

    const propagation = options?.propagation ?? Propagation.REQUIRED;
    const isolationLevel = options?.isolationLevel;

    const runOriginal = async () => await fn.apply(this, args);
    const runWithNewHook = async () => await runInNewHookContext(context, runOriginal);

    const runWithNewTransaction = async () => {
      const transactionCallback = async (entityManager: EntityManager) => {
        setEntityManagerByDataSourceName(context, connectionName, entityManager);

        try {
          const result = await runOriginal();
          return result;
        } finally {
          setEntityManagerByDataSourceName(context, connectionName, null);
        }
      };

      if (isolationLevel) {
        return await runInNewHookContext(context, () => {
          return dataSource.transaction(isolationLevel, transactionCallback);
        });
      } else {
        return await runInNewHookContext(context, () => {
          return dataSource.transaction(transactionCallback);
        });
      }
    };

    return await context.run(async () => {
      const currentTransaction = getEntityManagerByDataSourceName(context, connectionName);
      switch (propagation) {
        case Propagation.MANDATORY:
          if (!currentTransaction) {
            throw new TransactionalError(
              "No existing transaction found for transaction marked with propagation 'MANDATORY'",
            );
          }
          return await runOriginal();

        case Propagation.NESTED:
          return await runWithNewTransaction();

        case Propagation.NEVER:
          if (currentTransaction) {
            throw new TransactionalError(
              "Found an existing transaction, transaction marked with propagation 'NEVER'",
            );
          }
          return await runWithNewHook();

        case Propagation.NOT_SUPPORTED:
          if (currentTransaction) {
            setEntityManagerByDataSourceName(context, connectionName, null);
            const result = await runWithNewHook();
            setEntityManagerByDataSourceName(context, connectionName, currentTransaction);
            return result;
          }
          return await runOriginal();

        case Propagation.REQUIRED:
          if (currentTransaction) {
            return await runOriginal();
          }
          return await runWithNewTransaction();

        case Propagation.REQUIRES_NEW:
          return await runWithNewTransaction();

        case Propagation.SUPPORTS:
          return currentTransaction ? await runOriginal() : await runWithNewHook();
      }
    });
  }

  return wrapper as Fn;
};
