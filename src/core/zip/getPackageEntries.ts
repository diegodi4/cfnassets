import chalk from 'chalk';
import childProc from 'child_process';
import { copyFile, readFile, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import { temporaryDirectory } from 'tempy';
import { parse as parseYaml } from 'yaml';
import { getFolderEntries } from './getFolderEntries.js';
import { ZipAssetEntry } from './ZipAssetEntry.js';

export interface PackageEntriesOptions {
  archivePath?: string;
  ignorePaths?: string[];
  packageArch?: string;
  packageFilePath: string;
  packagePlatform?: string;
  packageLockPath: string;
  packageNames: string[];
}

export async function* getPackageEntries({
  archivePath = 'node_modules',
  ignorePaths,
  packageLockPath,
  packageFilePath,
  packageArch,
  packagePlatform,
  packageNames,
}: PackageEntriesOptions): AsyncIterableIterator<ZipAssetEntry> {
  let exec: string[];
  const npmConfig: string[] = [];

  const lockBasename = basename(packageLockPath);
  if (lockBasename === 'package-lock.json') {
    exec = ['npm', 'ci'];
  } else if (lockBasename === 'yarn.lock') {
    exec = ['yarn', '--frozen-lockfile'];
  } else if (lockBasename === 'pnpm-lock.yaml') {
    exec = ['pnpm', 'install', '--no-frozen-lockfile'];
  } else {
    throw new Error(`unknown lockfile type for path '${packageLockPath}'`);
  }

  const pkg = JSON.parse(await readFile(packageFilePath, 'utf-8'));

  const newPackageJson = {
    name: 'build',
    private: true,
    dependencies: {} as Record<string, string>,
  };

  for (const dep of packageNames) {
    const version =
      (pkg.dependencies && pkg.dependencies[dep]) ||
      (pkg.devDependencies && pkg.devDependencies[dep]);

    if (!version) {
      throw new Error(`cannot find dependency ${dep} in ${packageFilePath}`);
    }

    newPackageJson.dependencies[dep] = version;
  }

  if (packageArch) {
    npmConfig.push(`arch=${packageArch}`);
  }
  if (packagePlatform) {
    npmConfig.push(`platform=${packagePlatform}`);
  }

  const outDir = temporaryDirectory();
  await writeFile(join(outDir, 'package.json'), JSON.stringify(newPackageJson));
  await copyFile(packageLockPath, join(outDir, lockBasename));

  if (npmConfig.length) {
    await writeFile(join(outDir, '.npmrc'), npmConfig.join('\n') + '\n');
  }

  const [cmd, ...args] = exec;

  const flags = npmConfig.join(', ');
  console.log(`\n${chalk.cyan.bold(`${cmd} install`)} ${chalk.gray(flags)}`);

  const proc = childProc.spawn(cmd, args, {
    cwd: outDir,
    stdio: 'inherit',
  });

  await new Promise<void>((resolve, reject) => {
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`npm exited with non-zero error code ${code}`));
      }
    });
  });

  console.log(`\n`);

  const nodeModulesDir = join(outDir, 'node_modules');
  const isPnpm = lockBasename === 'pnpm-lock.yaml';

  if (isPnpm) {
    // For pnpm, we need to read .modules.yaml and yield entries for all hoisted dependencies
    // pnpm stores packages in .pnpm/{name}@{version}/node_modules/{name}/
    // and lists what should be hoisted in .modules.yaml
    const modulesYamlPath = join(nodeModulesDir, '.modules.yaml');
    const modulesYaml = parseYaml(await readFile(modulesYamlPath, 'utf-8')) as {
      hoistedDependencies?: Record<string, Record<string, string>>;
    };

    const hoisted = modulesYaml.hoistedDependencies || {};

    // First yield the .pnpm directory contents (the actual package files)
    yield* getFolderEntries({
      source: join(nodeModulesDir, '.pnpm'),
      archivePath: join(archivePath, '.pnpm'),
      ignore: ignorePaths,
    });

    // Then yield entries for each hoisted dependency at root level
    for (const [packageAtVersion, aliases] of Object.entries(hoisted)) {
      for (const packageName of Object.keys(aliases)) {
        const sourcePath = join(
          nodeModulesDir,
          '.pnpm',
          packageAtVersion,
          'node_modules',
          packageName,
        );
        yield* getFolderEntries({
          source: sourcePath,
          archivePath: join(archivePath, packageName),
          ignore: ignorePaths,
        });
      }
    }
  } else {
    // For npm/yarn, just copy the whole node_modules directory
    yield* getFolderEntries({
      source: nodeModulesDir,
      archivePath,
      ignore: ignorePaths,
    });
  }
}
