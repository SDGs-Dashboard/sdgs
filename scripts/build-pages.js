const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const tempRoot = path.join(root, '.pages-build-temp');
const tempAppRoot = path.join(tempRoot, 'app');
const tempOutRoot = path.join(tempAppRoot, 'out');
const finalOutRoot = path.join(root, 'out');

const fileCopies = [
  '.gitignore',
  'next-env.d.ts',
  'next.config.js',
  'package.json',
  'package-lock.json',
  'postcss.config.js',
  'tailwind.config.js',
  'tsconfig.json'
];

const directoryCopies = ['components', 'data', 'lib', 'meta', 'pages', 'public', 'styles', 'types', 'utils'];

const shouldSkip = (relativePath) => {
  const normalized = relativePath.replaceAll('\\', '/');
  return (
    normalized === 'middleware.ts' ||
    normalized.startsWith('pages/api/') ||
    normalized === 'pages/api' ||
    normalized.startsWith('pages/admin/') ||
    normalized === 'pages/admin' ||
    normalized.startsWith('data/admin/') ||
    normalized === 'data/admin' ||
    normalized.startsWith('data/uploads/') ||
    normalized === 'data/uploads'
  );
};

const ensureDirectory = (targetPath) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
};

const removePath = (targetPath) => {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
};

const copyFile = (sourcePath, targetPath) => {
  ensureDirectory(targetPath);
  fs.copyFileSync(sourcePath, targetPath);
};

const copyDirectory = (sourceDir, targetDir, baseDir) => {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    const relativePath = path.relative(baseDir, sourcePath);
    if (shouldSkip(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath, baseDir);
    } else {
      copyFile(sourcePath, targetPath);
    }
  }
};

const prepareTempApp = () => {
  removePath(tempRoot);
  removePath(finalOutRoot);
  fs.mkdirSync(tempAppRoot, { recursive: true });

  for (const relativeFile of fileCopies) {
    const sourcePath = path.join(root, relativeFile);
    if (fs.existsSync(sourcePath)) {
      copyFile(sourcePath, path.join(tempAppRoot, relativeFile));
    }
  }

  for (const relativeDirectory of directoryCopies) {
    const sourcePath = path.join(root, relativeDirectory);
    if (fs.existsSync(sourcePath)) {
      copyDirectory(sourcePath, path.join(tempAppRoot, relativeDirectory), root);
    }
  }

  const approvedSourceDir = path.join(root, 'data', 'approved');
  const publicDownloadsDir = path.join(tempAppRoot, 'public', 'approved-downloads');
  if (fs.existsSync(approvedSourceDir)) {
    copyDirectory(approvedSourceDir, publicDownloadsDir, approvedSourceDir);
  }
};

const buildTempApp = () => {
  const env = {
    ...process.env,
    GITHUB_PAGES: 'true',
    NEXT_PUBLIC_STATIC_EXPORT: 'true'
  };
  const result =
    process.platform === 'win32'
      ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npx next build'], {
          cwd: tempAppRoot,
          stdio: 'inherit',
          env
        })
      : spawnSync('npx', ['next', 'build'], {
          cwd: tempAppRoot,
          stdio: 'inherit',
          env
        });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Static export build failed with exit code ${result.status || 1}.`);
  }
};

const publishOutDirectory = () => {
  if (!fs.existsSync(tempOutRoot)) {
    throw new Error('Pages export did not generate an out/ directory.');
  }

  copyDirectory(tempOutRoot, finalOutRoot, tempOutRoot);
};

try {
  prepareTempApp();
  buildTempApp();
  publishOutDirectory();
  console.log('GitHub Pages export created in out/.');
} finally {
  removePath(tempRoot);
}
