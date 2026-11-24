/**
 * Файл: tools/convert-media-to-jpg.js
 * Назначение: перегнать PNG-кадры сцен в JPEG (q90, максимум 1920x1080),
 * чтобы рендер быстрее читал и декодировал медиа. Оригиналы не удаляются,
 * а переносятся в media/_png_originals/ с сохранением структуры папок.
 *
 * Запуск (из корня проекта):  node tools/convert-media-to-jpg.js
 * Откат:  вернуть файлы из media/_png_originals/ обратно в media/Scenes/
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const SCENES_DIR = 'media/Scenes';
const ARCHIVE_DIR = 'media/_png_originals';
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;
const QUALITY = 90;

let converted = 0;
let skipped = 0;
let bytesBefore = 0;
let bytesAfter = 0;

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function convertFile(pngPath) {
    const rel = path.relative(SCENES_DIR, pngPath);
    const jpgPath = pngPath.replace(/\.png$/i, '.jpg');
    const archivePath = path.join(ARCHIVE_DIR, rel);

    if (fs.existsSync(jpgPath)) {
        console.log(`skip (jpg уже есть): ${rel}`);
        skipped++;
        return;
    }

    const before = fs.statSync(pngPath).size;

    const meta = await sharp(pngPath).metadata();
    const needResize = meta.width > MAX_WIDTH || meta.height > MAX_HEIGHT;

    let pipeline = sharp(pngPath);
    if (needResize) {
        pipeline = pipeline.resize({
            width: MAX_WIDTH,
            height: MAX_HEIGHT,
            fit: 'inside',
            withoutEnlargement: true,
        });
    }

    await pipeline
        .flatten({ background: '#000000' })
        .jpeg({ quality: QUALITY, mozjpeg: true, chromaSubsampling: '4:4:4' })
        .toFile(jpgPath);

    const after = fs.statSync(jpgPath).size;
    bytesBefore += before;
    bytesAfter += after;

    // оригинал убираем из папки сканера, но сохраняем
    ensureDir(path.dirname(archivePath));
    fs.renameSync(pngPath, archivePath);

    converted++;
    const kb = (n) => (n / 1024).toFixed(0) + ' KB';
    console.log(
        `${rel} -> ${path.basename(jpgPath)}  ${kb(before)} -> ${kb(after)}` +
        (needResize ? `  (resize ${meta.width}x${meta.height})` : '')
    );
}

async function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            await walk(full);
            continue;
        }
        if (!/\.png$/i.test(entry.name)) continue;
        try {
            await convertFile(full);
        } catch (e) {
            console.error(`ОШИБКА на ${full}: ${e.message}`);
        }
    }
}

if (!fs.existsSync(SCENES_DIR)) {
    console.error(`Нет папки ${SCENES_DIR} — запускай из корня проекта.`);
    process.exit(1);
}

console.log(`=== PNG -> JPEG (q${QUALITY}, до ${MAX_WIDTH}x${MAX_HEIGHT}) ===`);
await walk(SCENES_DIR);

const mb = (n) => (n / 1024 / 1024).toFixed(1) + ' MB';
console.log(
    `\nГотово. Конвертировано: ${converted}, пропущено: ${skipped}.` +
    `\nВес сцен: ${mb(bytesBefore)} -> ${mb(bytesAfter)}` +
    `\nОригиналы: ${ARCHIVE_DIR}`
);
console.log('Не забудь: npm run scan-media (обновит манифест) — по желанию.');
