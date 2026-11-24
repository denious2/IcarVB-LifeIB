/**
 * Файл: tools/backup.js
 * Назначение: снимок проекта в git с осмысленным именем версии.
 *
 *   node tools/backup.js          — add + commit
 *   node tools/backup.js --push   — add + commit + push в origin
 *
 * Имя версии берётся из VERSION.txt (первая строка).
 * Вызывается автоматически из core/run.js перед сборкой/рендером.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const doPush = process.argv.includes('--push');

function git(args, opts = {}) {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', ...opts });
}

function readVersion() {
    const file = path.join(root, 'VERSION.txt');
    if (fs.existsSync(file)) {
        const line = fs.readFileSync(file, 'utf8').split(/\r?\n/)[0].trim();
        if (line) return line;
    }
    return 'backup';
}

let insideRepo = true;
try {
    git(['rev-parse', '--is-inside-work-tree']);
} catch (e) {
    insideRepo = false;
}

if (!insideRepo) {
    console.error('⚠️ Это не git-репозиторий — снимок пропущен.');
    process.exit(0);
}

const versionArg = process.argv.slice(2).find((a) => !a.startsWith('-'));
const version = versionArg || readVersion();
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
const status = git(['status', '--porcelain']).trim();

if (!status) {
    console.log(`ℹ️ Рабочее дерево чистое, коммит не нужен (версия: ${version}).`);
} else {
    const changed = status.split('\n').filter(Boolean).length;
    git(['add', '-A']);
    const message = `${version}\n\nСнимок перед сборкой/рендером, ${stamp}. Изменено файлов: ${changed}.`;
    git(['commit', '-m', message]);
    console.log(`✅ Коммит: «${version}» (файлов: ${changed})`);
}

if (doPush) {
    try {
        git(['push'], { stdio: 'inherit' });
        console.log('🚀 Отправлено в origin.');
    } catch (e) {
        console.error('❌ push не удался:', String(e.stderr || e.message).trim());
        process.exit(1);
    }
}
