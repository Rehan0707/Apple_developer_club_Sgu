import fs from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const emptyDatabase = () => ({ events: [], resources: [], badges: [], members: [], registrations: [], badgeAwards: [] });

function normalizeDatabase(value) {
  const db = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const members = Array.isArray(db.members) ? db.members : Array.isArray(db.students) ? db.students : [];
  return {
    ...emptyDatabase(),
    ...db,
    events: Array.isArray(db.events) ? db.events : [],
    resources: Array.isArray(db.resources) ? db.resources : [],
    badges: Array.isArray(db.badges) ? db.badges : [],
    members: members.filter(member => !/^mock([_-]|$)/i.test(String(member?.id || ''))),
    registrations: Array.isArray(db.registrations) ? db.registrations : [],
    badgeAwards: Array.isArray(db.badgeAwards) ? db.badgeAwards : []
  };
}

export function createJsonStore(filePath = 'data/db.json') {
  const path = resolve(filePath);
  let queue = Promise.resolve();

  async function readFile() {
    try {
      return normalizeDatabase(JSON.parse(await fs.readFile(path, 'utf8')));
    } catch (error) {
      if (error.code === 'ENOENT') return emptyDatabase();
      throw error;
    }
  }

  async function writeFile(db) {
    await fs.mkdir(dirname(path), { recursive: true });
    const tempPath = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
    try {
      await fs.writeFile(tempPath, JSON.stringify(db, null, 2), { mode: 0o600 });
      await fs.rename(tempPath, path);
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => {});
      throw error;
    }
  }

  return {
    async read() {
      await queue;
      return readFile();
    },
    transact(mutator) {
      const operation = queue.then(async () => {
        const db = await readFile();
        const result = await mutator(db);
        if (result?.persist !== false) await writeFile(db);
        return result && Object.hasOwn(result, 'value') ? result.value : result;
      });
      queue = operation.catch(() => {});
      return operation;
    }
  };
}
