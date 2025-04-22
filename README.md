# Typeorm Transactional

[![npm version](http://img.shields.io/npm/v/typeorm-transactional.svg?style=flat)](https://npmjs.org/package/typeorm-transactional "View this project on npm")

## Overview

`typeorm-transactional` is a fork of [typeorm-transactional-cls-hooked](https://github.com/odavid/typeorm-transactional-cls-hooked) designed for newer versions of TypeORM. It provides a `@Transactional` decorator and utilities to manage transactions seamlessly using [AsyncLocalStorage (ALS)](https://nodejs.org/api/async_context.html#class-asynclocalstorage) or [cls-hooked](https://www.npmjs.com/package/cls-hooked).

### Key Features
- Simplifies transaction management in TypeORM.
- Supports multiple `DataSource` instances.
- Provides hooks for transaction lifecycle events.
- Compatible with modern TypeORM APIs (`DataSource` instead of `Connection`).

---

## Table of Contents
- [Installation](#installation)
- [Initialization](#initialization)
- [Usage](#usage)
  - [Transactional Decorator](#transactional-decorator)
  - [Data Sources](#data-sources)
  - [Transaction Propagation](#transaction-propagation)
  - [Isolation Levels](#isolation-levels)
- [Hooks](#hooks)
- [Unit Test Mocking](#unit-test-mocking)
- [API Reference](#api-reference)
- [Custom Extensions](#custom-extensions)

---

## Installation

Install the library and its required dependencies:

```shell
# Using npm
npm install --save typeorm-transactional-extension typeorm reflect-metadata

# Using yarn
yarn add typeorm-transactional-extension typeorm reflect-metadata
```

> **Note**: Ensure `reflect-metadata` is imported globally in your application. See [TypeORM Installation Guide](https://github.com/typeorm/typeorm#installation).

---

## Initialization

Before using the library, initialize the transactional context **before your application starts**:

```typescript
import { initializeTransactionalContext, StorageDriver } from 'typeorm-transactional-extension';

initializeTransactionalContext({ storageDriver: StorageDriver.AUTO });
```

For example, in an Express app:

```typescript
import express from 'express';
import { initializeTransactionalContext, StorageDriver } from 'typeorm-transactional-extension';

initializeTransactionalContext({ storageDriver: StorageDriver.AUTO });

const app = express();
// Your app setup here
```

> **Important**: Call `initializeTransactionalContext` **before** initializing your application context.

---

## Usage

### Transactional Decorator

Use the `@Transactional()` decorator to make service methods transactional:

```typescript
import { Transactional } from 'typeorm-transactional-extension';

export class PostService {
  constructor(private readonly repository: PostRepository) {}

  @Transactional()
  async createPost(id: number, message: string): Promise<Post> {
    const post = this.repository.create({ id, message });
    return this.repository.save(post);
  }
}
```

#### Advanced Example

You can also use `DataSource` or `EntityManager` objects within transactions:

```typescript
export class PostService {
  constructor(
    private readonly repository: PostRepository,
    private readonly dataSource: DataSource
  ) {}

  @Transactional()
  async createAndFetchPost(id: number, message: string): Promise<Post> {
    const post = this.repository.create({ id, message });
    await this.repository.save(post);

    return this.dataSource
      .createQueryBuilder(Post, 'p')
      .where('id = :id', { id })
      .getOne();
  }
}
```

---

### Data Sources

To use transactions with TypeORM entities, register your `DataSource` using `addTransactionalDataSource`:

```typescript
import { DataSource } from 'typeorm';
import { addTransactionalDataSource } from 'typeorm-transactional-extension';

const dataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: 'postgres',
});

addTransactionalDataSource(dataSource);
```

For multiple `DataSource` instances, specify a custom name:

```typescript
addTransactionalDataSource({
  name: 'secondary',
  dataSource: new DataSource({ /* config */ }),
});
```

---

### Transaction Propagation

Propagation defines how transactions interact with existing ones. Supported options:

- `MANDATORY`: Requires an existing transaction; throws an error if none exists.
- `NESTED`: Creates a nested transaction if one exists; otherwise behaves like `REQUIRED`.
- `NEVER`: Executes non-transactionally; throws an error if a transaction exists.
- `NOT_SUPPORTED`: Executes non-transactionally; suspends the current transaction if one exists.
- `REQUIRED` (default): Uses the current transaction or creates a new one if none exists.
- `REQUIRES_NEW`: Always creates a new transaction, suspending any existing one.
- `SUPPORTS`: Uses the current transaction if one exists; otherwise executes non-transactionally.

---

### Isolation Levels

Isolation levels control how transactions interact with each other. Supported levels:

- `READ_UNCOMMITTED`: Allows dirty reads, non-repeatable reads, and phantom reads.
- `READ_COMMITTED`: Prevents dirty reads; allows non-repeatable reads and phantom reads.
- `REPEATABLE_READ`: Prevents dirty and non-repeatable reads; allows phantom reads.
- `SERIALIZABLE`: Prevents dirty reads, non-repeatable reads, and phantom reads.

---

## Hooks

Use hooks to execute logic during transaction lifecycle events:

- `runOnTransactionCommit(cb)`: Executes after a transaction commits.
- `runOnTransactionRollback(cb)`: Executes after a transaction rolls back.
- `runOnTransactionComplete(cb)`: Executes after a transaction completes (success or failure).

Example:

```typescript
import { runOnTransactionCommit } from 'typeorm-transactional-extension';

@Transactional()
async createPost(id: number, message: string): Promise<Post> {
  const post = this.repository.create({ id, message });
  const result = await this.repository.save(post);

  runOnTransactionCommit(() => {
    console.log('Transaction committed!');
  });

  return result;
}
```

---

## Unit Test Mocking

To mock `@Transactional` in unit tests (e.g., with Jest):

```typescript
jest.mock('typeorm-transactional-extension', () => ({
  Transactional: () => () => ({}),
}));
```

---

## API Reference

### `initializeTransactionalContext(options): void`

Initializes the transactional context. Options:

```typescript
{
  storageDriver?: StorageDriver;
  maxHookHandlers?: number;
}
```

- `storageDriver`: Mechanism for transaction propagation (`AUTO`, `CLS_HOOKED`, or `ASYNC_LOCAL_STORAGE`).
- `maxHookHandlers`: Maximum number of hooks allowed (default: `10`).

---

### `addTransactionalDataSource(input): DataSource`

Registers a `DataSource` for transactional use. Example:

```typescript
addTransactionalDataSource(new DataSource({ /* config */ }));
```

---

### `runInTransaction(fn, options?): Promise<any>`

Executes a function within a transactional context. Example:

```typescript
await runInTransaction(async () => {
  // Your transactional logic here
}, { propagation: 'REQUIRES_NEW' });
```

---

### `wrapInTransaction(fn, options?): WrappedFunction`

Wraps a function in a transactional context. Example:

```typescript
const wrappedFn = wrapInTransaction(async () => {
  // Your logic here
});
await wrappedFn();
```

---

### `runOnTransactionCommit(cb): void`

Registers a callback to execute after a transaction commits.

---

### `runOnTransactionRollback(cb): void`

Registers a callback to execute after a transaction rolls back.

---

### `runOnTransactionComplete(cb): void`

Registers a callback to execute after a transaction completes.

---

## Custom Extensions

This library also provides custom extensions for TypeORM's `Repository` to simplify common database operations. These extensions include:

### Extended Repository Methods

1. **`insertOrFail`**  
   Inserts an entity and throws an error if no identifiers are returned.

2. **`updateOrFail`**  
   Updates an entity and throws an error if no rows are affected.

3. **`deleteOrFail`**  
   Deletes an entity and throws an error if no rows are affected.

### Usage

To use these extensions, simply import and use the `Repository` methods as usual. The extensions are automatically applied.

#### Example

```typescript
import { Repository } from 'typeorm';
import { MyEntity } from './entities/my-entity';

export class MyService {
  constructor(private readonly repository: Repository<MyEntity>) {}

  async createEntity(data: Partial<MyEntity>): Promise<number> {
    return this.repository.insertOrFail(data);
  }

  async updateEntity(id: number, data: Partial<MyEntity>): Promise<void> {
    await this.repository.updateOrFail({ id }, data);
  }

  async deleteEntity(id: number): Promise<void> {
    await this.repository.deleteOrFail({ id });
  }
}
```

### Method Details

#### `insertOrFail`

Inserts an entity and ensures that the operation returns identifiers. If no identifiers are returned, an error is thrown.

```typescript
repository.insertOrFail(entity, 'Custom error message if insert fails');
```

#### `updateOrFail`

Updates an entity based on the given criteria. If no rows are affected, an error is thrown.

```typescript
repository.updateOrFail(criteria, partialEntity, 'Custom error message if update fails');
```

#### `deleteOrFail`

Deletes an entity based on the given criteria. If no rows are affected, an error is thrown.

```typescript
repository.deleteOrFail(criteria, 'Custom error message if delete fails');
```

---

For more details, refer to the [API Documentation](#api-reference).
