/**
 * Файл: core/utils/media_scanner.js
 * Версия: 2.4.2 (Recursive Scenes, Smart SFX & Manifest Header)
 * Описание: Сканирует всю папку media рекурсивно. Исключает стемы, 
 * собирает сцены из подпапок (Intro, Verse1 и др.), 
 * интеллектуально определяет фон SFX через FFmpeg и записывает configs/media_manifest.json с шапкой.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createLogger } from '../config_loader.js';
import ffprobe from 'ffprobe-static';

const rootDir = process.cwd();
const log = createLogger(rootDir);

function getAllFilesRecursive(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    let allFiles = arrayOfFiles || [];
  
    files.forEach(function(file) {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            allFiles = getAllFilesRecursive(fullPath, allFiles);
        } else {
            allFiles.push(fullPath);
        }
    });
  
    return allFiles;
}

function getDurationSync(filePath) {
    try {
        const command = `"${ffprobe.path}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
        const result = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
        return parseFloat(result.trim());
    } catch (err) {
        log(`⚠️ Ошибка чтения длительности для ${filePath}: ${err.message}`);
        return null;
    }
}

function detectSfxProperties(filePath) {
    const props = { background: 'unknown', defaultBlendMode: 'screen' };
    
    try {
        const pixFmtCmd = `"${ffprobe.path}" -v error -select_streams v:0 -show_entries stream=pix_fmt -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
        const pixFmt = execSync(pixFmtCmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

        if (pixFmt.includes('a') && !pixFmt.includes('yuv420p') && !pixFmt.includes('yuv422p')) {
            props.background = 'transparent';
            props.defaultBlendMode = 'normal';
            return props;
        }

        const brightnessCmd = `ffmpeg -v error -ss 00:00:00.500 -i "${filePath}" -vf "scale=1:1,format=gray" -vframes 1 -f rawvideo -`;
        const buffer = execSync(brightnessCmd, { stdio: ['ignore', 'pipe', 'ignore'] });
        
        if (buffer.length > 0) {
            const luma = buffer[0];
            
            if (luma < 70) {
                props.background = 'dark';
                props.defaultBlendMode = 'screen';
            } else if (luma > 180) {
                props.background = 'light';
                props.defaultBlendMode = 'multiply';
            } else {
                props.background = 'mixed';
                props.defaultBlendMode = 'screen';
            }
        }
    } catch (err) {
        log(`⚠️ Не удалось проанализировать фон для ${path.basename(filePath)}: ${err.message}`);
    }
    
    return props;
}

(() => {
    log("=== СТАРТ СКАНИРОВАНИЯ МЕДИА-ПАСКОВ ===");

    try {
        const mediaDir = path.join(rootDir, 'media');
        if (!fs.existsSync(mediaDir)) {
            throw new Error("Папка media/ не найдена!");
        }

        // >>> ДОБАВЛЕНА ШАПКА _README В МАНИФЕСТ <<<
        const manifest = {
            _README: "Версия: 2.4.2. Глобальный манифест медиа-файлов проекта. Генерируется автоматически скриптом media_scanner.js. Содержит структуру пулов и умные режимы наложения SFX.",
            scannedAt: new Date().toISOString(),
            audioTracks: [],
            scenes: [],
            sfx: []
        };

        const rootFiles = fs.readdirSync(mediaDir);
        let audioFiles = [];
        let subtitlesFile = "";
        
        rootFiles.forEach(f => {
            const ext = path.extname(f).toLowerCase();
            if (ext === '.mp3' || ext === '.wav') {
                audioFiles.push({
                    fileName: f,
                    path: `media/${f}`,
                    sizeBytes: fs.statSync(path.join(mediaDir, f)).size
                });
            }
            if (ext === '.srt') {
                subtitlesFile = `media/${f}`;
            }
        });

        const configPath = path.join(rootDir, 'configs', 'config.json');
        let currentConfig = { project: {}, media: {} };
        if (fs.existsSync(configPath)) {
            currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }

        if (audioFiles.length > 0) {
            const stemKeywords = ['bass', 'drum', 'drums', 'melody', 'vocal', 'acapella', 'accents', 'beat', 'beats', 'sfx', 'pad', 'pads', 'inst'];

            let pureCandidates = audioFiles.filter(a => {
                const lowerName = a.fileName.toLowerCase();
                return !stemKeywords.some(keyword => lowerName.includes(keyword));
            });

            let chosenAudio = null;
            let selectionStrategy = "";

            if (pureCandidates.length > 0) {
                pureCandidates.sort((a, b) => b.sizeBytes - a.sizeBytes);
                chosenAudio = pureCandidates[0];
                selectionStrategy = "Главный трек (без стоп-слов)";
            } else {
                audioFiles.sort((a, b) => b.sizeBytes - a.sizeBytes);
                chosenAudio = audioFiles[0];
                selectionStrategy = "Фолбэк (самый тяжелый файл)";
            }

            chosenAudio.isMainCandidate = true;

            log(`🎵 СТРАТЕГИЯ ВЫБОРА АУДИО: ${selectionStrategy}`);
            log(`⏳ Вычисляем длительность [${chosenAudio.fileName}]...`);
            
            const fullAudioPath = path.join(rootDir, chosenAudio.path);
            const duration = getDurationSync(fullAudioPath);
            
            if (duration !== null) {
                chosenAudio.durationSeconds = parseFloat(duration.toFixed(3));
                log(`✅ УСПЕХ! Главный трек: "${chosenAudio.fileName}" | ${chosenAudio.durationSeconds}s`);
                
                if (!currentConfig.media) currentConfig.media = {};
                if (!currentConfig.project) currentConfig.project = {};
                
                currentConfig.media.audioFile = chosenAudio.path;
                currentConfig.project.audioFile = chosenAudio.path; 
                currentConfig.project.totalDuration = chosenAudio.durationSeconds;
                
                if (subtitlesFile) {
                    currentConfig.media.subtitlesFile = subtitlesFile;
                }
                
                fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf8');
            }
        }
        
        manifest.audioTracks = audioFiles;

        const scenesDir = path.join(mediaDir, 'Scenes');
        if (fs.existsSync(scenesDir)) {
            const allSceneFiles = getAllFilesRecursive(scenesDir);
            
            const baseAssets = allSceneFiles.filter(f => {
                const ext = path.extname(f).toLowerCase();
                return !f.includes('-prlx-') && ['.png', '.jpg', '.jpeg', '.mp4'].includes(ext);
            });

            baseAssets.forEach(fullPath => {
                const baseName = path.basename(fullPath, path.extname(fullPath));
                const fileName = path.basename(fullPath);
                const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
                const fileDir = path.dirname(fullPath);
                
                const assetEntry = {
                    name: baseName,
                    file: fileName,
                    path: relPath,
                    layers: []
                };

                const prlxFiles = allSceneFiles.filter(f => 
                    path.basename(f).startsWith(`${baseName}-prlx-`) && 
                    (path.dirname(f) === fileDir || path.dirname(f) === path.join(fileDir, 'prlx'))
                );

                prlxFiles.forEach(prlxPath => {
                    assetEntry.layers.push({
                        file: path.basename(prlxPath),
                        path: path.relative(rootDir, prlxPath).replace(/\\/g, '/')
                    });
                });

                manifest.scenes.push(assetEntry);
            });
        }
        
        const sfxDir = path.join(mediaDir, 'sfx');
        if (fs.existsSync(sfxDir)) {
            log(`🔎 Запущено глубокое сканирование и анализ фона SFX-файлов...`);
            const allSfxFiles = getAllFilesRecursive(sfxDir);
            
            allSfxFiles.forEach(fullPath => {
                const ext = path.extname(fullPath).toLowerCase();
                if (['.mp4', '.mov', '.wav', '.mp3', '.webm'].includes(ext)) {
                    const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
                    const fileName = path.basename(fullPath);
                    
                    let sfxEntry = { file: fileName, path: relPath };
                    
                    if (['.mp4', '.mov', '.webm'].includes(ext)) {
                        const props = detectSfxProperties(fullPath);
                        sfxEntry.background = props.background;
                        sfxEntry.recommendedBlendMode = props.defaultBlendMode;
                        log(`   ✨ ${fileName}: Фон [${props.background}] -> Blend [${props.defaultBlendMode}]`);
                    }
                    
                    manifest.sfx.push(sfxEntry);
                }
            });
        }

        const configsDir = path.join(rootDir, 'configs');
        if (!fs.existsSync(configsDir)) fs.mkdirSync(configsDir, { recursive: true });
        
        const manifestPath = path.join(configsDir, 'media_manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

        log(`✅ Сканирование завершено. Манифест записан в configs/media_manifest.json`);

    } catch (e) {
        log(`❌ Ошибка сканирования медиа: ${e.message}`);
    }
})();