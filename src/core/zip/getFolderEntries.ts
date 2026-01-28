import { createReadStream } from 'fs';
import { readdir, stat } from 'fs/promises';
import ignore from 'ignore';
import { join, relative, resolve } from 'path';
import { ZipAssetEntry } from './ZipAssetEntry.js';

export interface FolderEntriesOptions {
  archivePath?: string;
  ignore?: string[];
  source: string;
}

export async function* getFolderEntries({
  archivePath: archiveBasePath = '/',
  source,
  ignore: ignorePaths,
}: FolderEntriesOptions): AsyncIterableIterator<ZipAssetEntry> {
  const work = [resolve(source)];
  const ig = ignore.default().add(ignorePaths || []);

  while (work.length) {
    const curr = work.pop() as string;

    const entries = await readdir(curr, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = join(curr, entry.name);

      // For symlinks, follow them to get the real type
      let isDir = entry.isDirectory();
      let isFile = entry.isFile();
      if (entry.isSymbolicLink()) {
        const realStat = await stat(entryPath);
        isDir = realStat.isDirectory();
        isFile = realStat.isFile();
      }

      let archivePath = relative(source, entryPath);
      if (isDir) {
        archivePath += '/';
      }
      if (ig.ignores(archivePath)) {
        continue;
      }

      if (isDir) {
        work.push(entryPath);
      } else if (isFile) {
        yield {
          archivePath: join(archiveBasePath, archivePath),
          content: () => createReadStream(entryPath),
        };
      }
    }
  }
}
