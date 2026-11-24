/**
 * Файл: core/build/visuals.js
 * Версия: 3.2.4 (Semantic Roles Architecture + Audio Reactors Debug Fix)
 * Описание: Оркестратор визуальных эффектов (VFX).
 * ИСПРАВЛЕНИЕ: Прямая передача directorOverrides и audioReactors в mergedConfig.
 */

import path from 'path';
import fs from 'fs';

import { createLogger, loadConfigs, loadBeats, loadSubtitlesStarts } from '../config_loader.js';
import { scanPools } from '../utils/images/media_scanner.js';
import { resolveTimeline } from '../utils/timeline_resolver.js';
import { generateVisualGroupHTML, saveComposition } from '../utils/images/html_generator.js';

const rootDir = process.cwd();
const log = createLogger(rootDir);

(async () => {
    try {
        log("=== СТАРТ СБОРКИ ЭФФЕКТОВ (SEMANTIC ROLES) ===");
        
        const { config, director, library, mediaManifest } = loadConfigs(rootDir);
        const beats = loadBeats(rootDir, log);

        // Страховка для инспектора, чтобы флаг дебага 100% долетел в ядро
        if (director.debugMode) {
            config.debugMode = director.debugMode;
        }
        
        let subtitleStarts = [];
        try {
            const subPath = config.media?.subtitlesFile;
            if (subPath && subPath.trim() !== '') subtitleStarts = loadSubtitlesStarts(rootDir, log);
        } catch (e) {}
        
        const isTest = config.testMode && config.testMode.enabled;
        const totalDuration = isTest ? config.testMode.duration : config.project.totalDuration;
        const testStart = isTest ? config.testMode.start : 0;

        let cssLibrary = "";
        if (library.effectsPool) {
            if (library.effectsPool.movements) {
                for (const [name, keyframes] of Object.entries(library.effectsPool.movements)) cssLibrary += `@keyframes ${name} { ${keyframes} }\n`;
            }
            if (library.effectsPool.appearances) {
                for (const [name, keyframes] of Object.entries(library.effectsPool.appearances)) cssLibrary += `@keyframes ${name} { ${keyframes} }\n`;
            }
        }

        const styleBlock = `
            <style>
                body { margin: 0; background: transparent; overflow: hidden; }
                #root { position: absolute; width: 100vw; height: 100vh; pointer-events: none; }
                .anim-wrapper { position: absolute; width: 100%; height: 100%; pointer-events: none; transform-origin: center; }
                .visual-layer { position: absolute; width: 100%; height: 100%; background-size: cover; background-position: center; opacity: 0; transform-origin: center center; }
                .video-asset-layer { position: absolute; width: 100vw; height: 100vh; object-fit: cover; opacity: 0; transform-origin: center center; }
                ${cssLibrary}
                @keyframes engine_kill_switch { to { opacity: 0 !important; visibility: hidden !important; display: none !important; } }
            </style>
        `;

        const allPools = await scanPools(config, director, rootDir, log);
        const narrativePools = {};
        for (const [pName, pData] of Object.entries(allPools)) {
            if (pData.enabled === false) continue;
            if (pData.class === 'narrative' || pData.role === 'narrative') {
                narrativePools[pName] = pData;
            }
        }

        const vfxPools = {};
        const activeAssetPools = director.assetPools || config.assetPools || {};
        for (const [poolName, pool] of Object.entries(activeAssetPools)) {
            if (pool.enabled === false) continue;
            if (pool.class === 'narrative' || pool.role === 'narrative') continue;
            
            let paths = Array.isArray(pool.path) ? pool.path : [pool.path];
            let files = [];
            paths.forEach(p => {
                const fullPath = path.join(rootDir, p);
                if (fs.existsSync(fullPath)) {
                    const folderContents = fs.readdirSync(fullPath);
                    const validFiles = folderContents.filter(f => ['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov', '.webm'].includes(path.extname(f).toLowerCase()));
                    files.push(...validFiles.map(f => ({ path: `${p}/${f}`, file: f })));
                }
            });
            
            vfxPools[poolName] = { ...pool, files, currentIndex: 0 };
            log(`📂 VFX Пул '${poolName}': найдено ${files.length} файлов.`);
        }

        // Вызов центрального резолвера
        const { vfxTimeline } = resolveTimeline({
            config, director, mediaManifest, 
            narrativePools, allVfxPools: vfxPools, 
            beats, subtitleStarts, 
            totalDuration: config.project.totalDuration, testMode: config.testMode
        });

        let visualBgHTML = "";
        let visualFgHTML = "";

        for (const clip of vfxTimeline) {
            if (isTest) {
                const clipAbsEnd = clip.start + clip.duration;
                if (clipAbsEnd <= testStart || clip.start >= testStart + totalDuration) continue;
                
                clip.start = Math.max(0, clip.start - testStart);
                clip.duration = Math.min(totalDuration, clipAbsEnd - testStart) - clip.start;
            }

            const htmlChunk = generateVisualGroupHTML(clip);
            
            if (clip.z < 20) {
                visualBgHTML += htmlChunk;
            } else {
                visualFgHTML += htmlChunk;
            }
        }

        // ВАЖНО: Объединяем конфиги надежно, чтобы шаблонизатор гарантированно увидел audioReactors
        const mergedConfig = { 
            ...config, 
            director, 
            audioReactors: director.audioReactors || config.audioReactors 
        };

        saveComposition(path.join(rootDir, 'compositions'), styleBlock, visualBgHTML, 'visuals_bg_scene', config.project.resolution, totalDuration, mergedConfig);
        saveComposition(path.join(rootDir, 'compositions'), styleBlock, visualFgHTML, 'visuals_fg_scene', config.project.resolution, totalDuration, mergedConfig);
        
        log(`✅ УСПЕХ! Визуальные эффекты собраны (Semantic Roles). Клипов: ${vfxTimeline.length}`);

    } catch (e) {
        console.error("❌ Ошибка в visuals.js:", e.message);
        process.exit(1);
    }
})();