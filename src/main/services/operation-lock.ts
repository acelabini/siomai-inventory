export class OperationLock {
  private tail: Promise<void> = Promise.resolve();

  runExclusive<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}
