import { DataSource } from 'typeorm';
import { Post } from './entities/Post.entity';
import {
  addTransactionalDataSource,
  initializeTransactionalContext,
  runInTransaction,
  runOnTransactionCommit,
  Propagation,
} from '../src';
import { PostReaderService } from './services/post-reader.service';
import { PostWriterService } from './services/post-writer.service';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const message = 'a simple message';

describe('Common tests', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: 'localhost',
      port: 5435,
      username: 'postgres',
      password: 'postgres',
      database: 'test',
      entities: [Post],
      synchronize: true,
    });

    initializeTransactionalContext();
    addTransactionalDataSource(dataSource);

    await dataSource.initialize();

    await dataSource.createEntityManager().clear(Post);
  });

  afterEach(async () => {
    await dataSource.createEntityManager().clear(Post);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it("shouldn't get post using standard typeorm transaction", async () => {
    const [writtenPost, readPost] = await dataSource.transaction(async (manager) => {
      const writerService = new PostWriterService(manager.getRepository(Post));
      const readerService = new PostReaderService(dataSource.getRepository(Post));

      const writtenPost = await writerService.createPost(message);
      const readPost = await readerService.getPostByMessage(message);

      return [writtenPost, readPost];
    });

    expect(writtenPost.id).toBeGreaterThan(0);
    expect(readPost).toBeNull();
  });

  it('should get post using runInTransaction', async () => {
    const repository = dataSource.getRepository(Post);

    const writerService = new PostWriterService(repository);
    const readerService = new PostReaderService(repository);

    let commitHookCalled = false;

    const [writtenPost, readPost] = await runInTransaction(async () => {
      const writtenPost = await writerService.createPost(message);
      const readPost = await readerService.getPostByMessage(message);

      runOnTransactionCommit(() => (commitHookCalled = true));

      return [writtenPost, readPost];
    });

    await sleep(100);

    expect(writtenPost.id).toBeGreaterThan(0);
    expect(readPost.id).toBe(writtenPost.id);
    expect(commitHookCalled).toBeTruthy();
  });

  it('should get post using @Transactional decorator', async () => {
    const repository = dataSource.getRepository(Post);

    const writerService = new PostWriterService(repository);
    const readerService = new PostReaderService(repository);

    const writtenPost = await writerService.createPostWithDecorator(message);
    const readPost = await readerService.getPostByMessage(message);

    await sleep(100);

    expect(writtenPost.id).toBeGreaterThan(0);
    expect(readPost.id).toBe(writtenPost.id);
    expect(writerService.success).toBe(true);
  });

  it('should fail create post using runInTransaction', async () => {
    const repository = dataSource.getRepository(Post);

    const writerService = new PostWriterService(repository);
    const readerService = new PostReaderService(repository);

    const [readPost] = await runInTransaction(async () => {
      expect(writerService.createPost(message, true)).rejects.toThrowError();

      const readPost = await readerService.getPostByMessage(message);

      return [readPost];
    });

    expect(readPost).toBeNull();
  });

  it('should fail create post using Transactional', async () => {
    const repository = dataSource.getRepository(Post);

    const writerService = new PostWriterService(repository);
    const readerService = new PostReaderService(repository);

    expect(writerService.createPostWithDecorator(message, true)).rejects.toThrowError();

    const readPost = await readerService.getPostByMessage(message);

    await sleep(100);

    expect(readPost).toBeNull();
    expect(writerService.success).toBe(false);
  });

  it('should fail for "MANDATORY" propagation without existing transaction', async () => {
    const repository = dataSource.getRepository(Post);

    const writerService = new PostWriterService(repository);
    const readerService = new PostReaderService(repository);

    const fn = () =>
      runInTransaction(
        async () => {
          const writtenPost = await writerService.createPost(message);
          const readPost = await readerService.getPostByMessage(message);

          return [writtenPost, readPost];
        },
        {
          propagation: Propagation.MANDATORY,
        },
      );

    expect(fn).rejects.toThrowError();
  });

  it('should pass transaction for "MANDATORY" propagation', async () => {
    const repository = dataSource.getRepository(Post);

    const writerService = new PostWriterService(repository);
    const readerService = new PostReaderService(repository);

    const [writtenPost, readPost] = await runInTransaction(async () => {
      const writtenPost = await writerService.createPost(message);
      const readPost = await runInTransaction(async () => readerService.getPostByMessage(message), {
        propagation: Propagation.MANDATORY,
      });

      return [writtenPost, readPost];
    });

    expect(writtenPost.id).toBeGreaterThan(0);
    expect(readPost.id).toBe(writtenPost.id);
  });

  it('should fail for "NEVER" propagation if transaction exists', async () => {
    const repository = dataSource.getRepository(Post);

    const writerService = new PostWriterService(repository);
    const readerService = new PostReaderService(repository);

    const fn = () =>
      runInTransaction(async () => {
        const writtenPost = await writerService.createPost(message);
        const readPost = await runInTransaction(() => readerService.getPostByMessage(message), {
          propagation: Propagation.NEVER,
        });

        return [writtenPost, readPost];
      });

    expect(fn).rejects.toThrowError();
  });

  it('should ignore transactions for "NOT_SUPPORTED" propagation', async () => {
    const repository = dataSource.getRepository(Post);

    const writerService = new PostWriterService(repository);
    const readerService = new PostReaderService(repository);

    const [writtenPost, readPost] = await runInTransaction(async () => {
      const writtenPost = await writerService.createPost(message);
      const readPost = await runInTransaction(async () => readerService.getPostByMessage(message), {
        propagation: Propagation.NOT_SUPPORTED,
      });

      return [writtenPost, readPost];
    });

    expect(writtenPost.id).toBeGreaterThan(0);
    expect(readPost).toBeNull();
  });

  it('should suspend old transactions for "REQUIRES_NEW" propagation', async () => {
    const repository = dataSource.getRepository(Post);

    const writerService = new PostWriterService(repository);
    const readerService = new PostReaderService(repository);

    const [writtenPost, readPost] = await runInTransaction(async () => {
      const writtenPost = await writerService.createPost(message);
      const readPost = await runInTransaction(async () => readerService.getPostByMessage(message), {
        propagation: Propagation.REQUIRES_NEW,
      });

      return [writtenPost, readPost];
    });

    expect(writtenPost.id).toBeGreaterThan(0);
    expect(readPost).toBeNull();
  });
});
