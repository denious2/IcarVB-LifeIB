/**
 * Файл: core/build/images.js
 * Версия: 3.2.0 (Semantic Roles + Data-Driven Pool SVG Filters)
 * Описание: Оркестратор таймлайна нарративных сцен (сюжетных видео и фото).
 * Поддерживает подключение SVG-фильтров из library.json на уровне пулов.
 */

import path from 'path';

// Импорт наших модулей
import { createLogger, loadConfigs, loadBeats, loadSubtitlesStarts } from '../config_loader.js';
import { scanPools } from '../utils/images/media_scanner.js';
import { resolveTimeline } from '../utils/timeline_resolver.js';
import { buildLayersStack, generateGroupHTML, saveComposition } from '../utils/images/html_generator.js';

const rootDir = process.cwd();
const log = createLogger(rootDir);

(async () => {
    try {
        log("=== СТАРТ СБОРКИ НАРРАТИВА (SEMANTIC ROLES) ===");
        
        // 1. Загрузка конфигураций
        const { config, director, library } = loadConfigs(rootDir);
        const beats = loadBeats(rootDir, log);
        
        let subtitleStarts = [];
        try {
            const subPath = config.media?.subtitlesFile;
            if (subPath && subPath.trim() !== '') subtitleStarts = loadSubtitlesStarts(rootDir, log);
        } catch (subErr) {
            log(`ℹ️ Магнит ритма: Файл субтитров не найден. Опираемся только на биты.`);
        }
        
        const isTest = config.testMode && config.testMode.enabled;
        const totalDuration = isTest ? config.testMode.duration : config.project.totalDuration;
        const testStart = isTest ? config.testMode.start : 0;
        
        // 2. Генерация базовых CSS стилей и сбор SVG-фильтров из library.json
        let cssLibrary = "";
        let svgFiltersHTML = "";
        if (library.effectsPool) {
            if (library.effectsPool.movements) {
                for (const [name, keyframes] of Object.entries(library.effectsPool.movements)) cssLibrary += `@keyframes ${name} { ${keyframes} }\n`;
            }
            if (library.effectsPool.appearances) {
                for (const [name, keyframes] of Object.entries(library.effectsPool.appearances)) cssLibrary += `@keyframes ${name} { ${keyframes} }\n`;
            }
            if (library.effectsPool.svgFilters) {
                Object.values(library.effectsPool.svgFilters).forEach(svg => svgFiltersHTML += `${svg}\n`);
            }
        }

        const styleBlock = `
            <style>
                body { margin: 0; background: transparent; overflow: hidden; }
                #root { position: absolute; width: 100vw; height: 100vh; pointer-events: none; }
                .anim-wrapper { position: absolute; width: 100%; height: 100%; pointer-events: none; transform-origin: center; }
                @keyframes wrapper_fade_in { 0% { opacity: 0.2; } 100% { opacity: 1; } }
                .image-layer { position: absolute; top: 0; left: 0; width: 100vw; height: 100vh; background-size: cover; background-position: center; transform-origin: center center; }
                .video-layer { position: absolute; top: 0; left: 0; width: 100vw; height: 100vh; object-fit: cover; transform-origin: center center; }
                ${cssLibrary}
            </style>
        `;

        // 3. Сканирование пулов (асинхронно через ffprobe)
        // Разделяем пулы на нарратив и VFX, опираясь на возвращенные семантические роли
        const allPools = await scanPools(config, director, rootDir, log);
        const narrativePools = {};
        const vfxPools = {};
        
        for (const [pName, pData] of Object.entries(allPools)) {
            if (pData.role === 'narrative' || pData.class === 'narrative') {
                narrativePools[pName] = pData;
            } else {
                vfxPools[pName] = pData;
            }
        }

        if (Object.keys(narrativePools).length === 0) {
            log(`⚠️ Ни один пул сюжетов не найден. Генерирую пустую сцену.`);
            process.exit(0);
        }

        let mediaManifest = null;
        try { mediaManifest = loadConfigs(rootDir).mediaManifest; } catch(e) {} // Заглушка, если манифеста еще нет

        // 4. ВЫЗОВ ЦЕНТРАЛЬНОГО РЕЗОЛВЕРА (Магия новой архитектуры)
        const { narrativeTimeline } = resolveTimeline({
            config, director, mediaManifest, 
            narrativePools, allVfxPools: vfxPools, 
            beats, subtitleStarts, 
            totalDuration: config.project.totalDuration, testMode: config.testMode
        });

        // 5. Рендеринг HTML из плоского таймлайна
        let imagesHTML = "";
        const OVERLAP = 0.25;
        
        for (const clip of narrativeTimeline) {
            // Защита тестового режима: клипы вне окна теста отбрасываем,
            // остальные смещаем к нулю (как это уже делает visuals.js).
            if (isTest) {
                const clipAbsEnd = clip.start + clip.duration;
                if (clipAbsEnd <= testStart || clip.start >= testStart + totalDuration) continue;
                clip.start = Math.max(0, clip.start - testStart);
                clip.duration = Math.min(totalDuration, clipAbsEnd - testStart) - clip.start;
            }
            
            const poolCfg = director.assetPools?.[clip.poolName] || narrativePools[clip.poolName];
            let poolSvgFilter = poolCfg?.svgFilter || "";
            if (poolSvgFilter && !svgFiltersHTML.includes(`id="${poolSvgFilter}"`)) {
                log(`⚠️ SVG-фильтр #${poolSvgFilter} указан в пуле "${clip.poolName}", но не найден в library.json. Пропущен.`);
                poolSvgFilter = "";
            }

            const layersToRender = buildLayersStack(clip.fileObj, clip.path, narrativePools[clip.poolName], clip.isVideo, rootDir);
            
            imagesHTML += generateGroupHTML({
                clip, 
                layersToRender, 
                OVERLAP,
                svgFilter: poolSvgFilter
            });
        }

        // 6. Финальное сохранение
        saveComposition(path.join(rootDir, 'compositions'), styleBlock, imagesHTML, 'images_scene', config.project.resolution, totalDuration, config, svgFiltersHTML);
        log(`✅ УСПЕХ! Нарратив собран (Semantic Roles). Клипов: ${narrativeTimeline.length}`);

    } catch (e) { 
        console.error("❌ Ошибка:", e.message); 
        process.exit(1); 
    }
})();