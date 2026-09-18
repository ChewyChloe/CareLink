import * as fs from 'fs';
import * as path from 'path';
import { CodeScanner, DependencyScanner, Finding } from './sentinel-sdk';

const codeScanner = new CodeScanner();
const depScanner = new DependencyScanner();

function getFilesRecursively(dir: string, exts: string[]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist' && file !== '.git' && file !== '.cache') {
        results.push(...getFilesRecursively(filePath, exts));
      }
    } else if (exts.some((ext) => file.endsWith(ext))) {
      results.push(filePath);
    }
  }
  return results;
}

const rootDir = path.resolve(__dirname, '../../../../');
const backendSrc = path.join(rootDir, 'backend/src');
const frontendSrc = path.join(rootDir, 'frontend/src');

const backendFiles = getFilesRecursively(backendSrc, ['.ts', '.js']);
const frontendFiles = getFilesRecursively(frontendSrc, ['.ts', '.tsx', '.js', '.jsx', '.css']);

const allCodeFindings: Array<{ file: string; finding: Finding }> = [];

for (const file of [...backendFiles, ...frontendFiles]) {
  // Exclude sentinel test files and the scanner itself from self-flagging test fixtures
  if (file.includes('sentinel') || file.includes('.spec.ts') || file.includes('.test.ts')) {
    continue;
  }
  const content = fs.readFileSync(file, 'utf-8');
  const relPath = path.relative(rootDir, file).replace(/\\/g, '/');
  const findings = codeScanner.scan(content, relPath);
  for (const f of findings) {
    allCodeFindings.push({ file: relPath, finding: f });
  }
}

// Scan package manifests
const allDepFindings: Array<{ file: string; finding: Finding }> = [];
const manifests = [
  path.join(rootDir, 'backend/package.json'),
  path.join(rootDir, 'frontend/package.json'),
];

for (const manifest of manifests) {
  if (fs.existsSync(manifest)) {
    const content = fs.readFileSync(manifest, 'utf-8');
    const relPath = path.relative(rootDir, manifest).replace(/\\/g, '/');
    const findings = depScanner.scan(content, relPath);
    for (const f of findings) {
      allDepFindings.push({ file: relPath, finding: f });
    }
  }
}

const summary = {
  scannedFiles: backendFiles.length + frontendFiles.length,
  manifestsScanned: manifests.length,
  codeFindingsCount: allCodeFindings.length,
  codeFindings: allCodeFindings,
  depFindingsCount: allDepFindings.length,
  depFindings: allDepFindings,
};

console.log(JSON.stringify(summary, null, 2));
