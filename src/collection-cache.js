// Reuse complete live snapshots and coalesce overlapping reads.
// Unwatched collections are never cached after their request completes.
export class CollectionCache {
  snapshots = new Map();
  requests = new Map();
  publish(key, rows) { this.snapshots.set(key, rows); }
  forget(key) { this.snapshots.delete(key); }
  read(key, fetchRows) {
    if (this.snapshots.has(key)) return Promise.resolve(this.snapshots.get(key));
    if (this.requests.has(key)) return this.requests.get(key);
    const request = Promise.resolve().then(fetchRows).then(rows => this.snapshots.get(key) ?? rows).finally(() => this.requests.delete(key));
    this.requests.set(key, request);
    return request;
  }
}
