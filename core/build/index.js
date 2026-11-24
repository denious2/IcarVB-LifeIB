/**
 * Файл: core/build/index.js
 * Версия: 4.3.1 (Clean Root Orchestrator: Reactors & Gates delegated to reactors.js)
 * Описание: Главный оркестратор HTML-каркаса. #root находится на верхнем уровне
 * под <body> по стандарту HyperFrames, #universe внутри него изолирует трансформации.
 * Вся генерация аудио-реакторов и Time-Gates выполняется в core/build/reactors.js.
 */

import fs from 'fs';
import path from 'path';
import { loadConfigs } from '../config_loader.js';

try {
    console.log("=== СТАРТ ГЕНЕРАЦИИ INDEX.HTML (СБОРКА NODE ENGINE) ===");
    const rootDir = process.cwd();
    const { config, director, library } = loadConfigs(rootDir);
    
    const resW = config.project.resolution.width;
    const resH = config.project.resolution.height;
    const isTest = config.testMode && config.testMode.enabled;
    const duration = isTest ? config.testMode.duration : config.project.totalDuration;
    const testStart = isTest ? config.testMode.start : 0;
    
    const renderOffset = testStart;
    const renderEnd = renderOffset + duration;
    const testEnd = renderEnd;
    
    const compDir = path.join(rootDir, 'compositions');

    // --- 1. ИМПОРТ ВСЕХ АНИМАЦИЙ (@KEYFRAMES) ИЗ БИБЛИОТЕКИ ---
    let cssLibrary = "/* --- LIBRARY KEYFRAMES --- */\n";
    if (library.effectsPool) {
        if (library.effectsPool.movements) {
            Object.entries(library.effectsPool.movements).forEach(([name, keyframes]) => {
                cssLibrary += `        @keyframes ${name} { ${keyframes} }\n`;
            });
        }
        if (library.effectsPool.appearances) {
            Object.entries(library.effectsPool.appearances).forEach(([name, keyframes]) => {
                cssLibrary += `        @keyframes ${name} { ${keyframes} }\n`;
            });
        }
    }

    // --- 2. СБОРКА СТИЛЕЙ СЛОЕВ И ОВЕРЛЕЕВ ---
    const layerBlends = director.layerBlendModes || config.layerBlendModes || {};
    const bgBlend = layerBlends["host-visuals-bg"] || "normal";
    const imagesBlend = layerBlends["host-images"] || "normal";
    const fgBlend = layerBlends["host-visuals-fg"] || "normal";
    const dustBlend = layerBlends["host-dust"] || "screen";

    const colorGradeKey = config.effects?.colorGrade || "none";
    const colorGradeCss = library.effectsPool?.colorGrading?.[colorGradeKey] || "display: none;";
    const flashBlendMode = config.effects?.flashes?.blendMode || "normal";

    const accentsCssPath = path.join(compDir, 'accents_camera.css');
    const accentsHtmlPath = path.join(compDir, 'accents_scene.html');
    const cameraShakeCss = fs.existsSync(accentsCssPath) ? fs.readFileSync(accentsCssPath, 'utf8') : '';
    const shakeClass = fs.existsSync(accentsCssPath) ? 'global-shake-active' : '';
    const subsShakeClass = fs.existsSync(accentsCssPath) ? 'global-subs-counter' : '';
    const accentsBlendMode = director.accents?.videoGlitches?.blendMode || "screen";

    const accentsHtmlLayer = fs.existsSync(accentsHtmlPath) 
        ? `\n            <!-- 4.6 АКЦЕНТЫ -->\n            <div id="host-accents" data-composition-id="accents_scene" class="composition-layer clip" style="z-index: 9999; pointer-events: none; mix-blend-mode: ${accentsBlendMode};" data-in="${renderOffset}" data-out="${renderEnd}" data-start="0" data-duration="${duration}" data-track-index="46" data-composition-src="compositions/accents_scene.html"></div>` 
        : '';

    const shadowKey = director.overlays?.shadowCrush || "shadow_crush_default";
    const flashKey = director.overlays?.screenFlash || "screen_flash_white";
    const shadowCss = library.effectsPool?.overlayStyles?.[shadowKey] || "background: #000000; mix-blend-mode: multiply;";
    const flashCss = library.effectsPool?.overlayStyles?.[flashKey] || "background: #ffffff; mix-blend-mode: screen;";

    let subsHtmlLayer = "";
    const subPathConfig = config.media?.subtitlesFile;
    const subsCompositionPath = path.join(compDir, 'subs_scene.html');
    
    if (subPathConfig && subPathConfig.trim() !== '' && fs.existsSync(path.join(rootDir, subPathConfig)) && fs.existsSync(subsCompositionPath)) {
        subsHtmlLayer = `\n            <div id="host-subs" data-composition-id="subs_scene" class="composition-layer clip ${subsShakeClass}" style="z-index: 10000;" data-in="${renderOffset}" data-out="${renderEnd}" data-start="0" data-duration="${duration}" data-track-index="5" data-composition-src="compositions/subs_scene.html"></div>`;
        console.log("📝 Слой субтитров успешно подключен.");
    }

    const structure = (director.songStructure || config.songStructure).sort((a, b) => a.time - b.time);
    const sectionRulesMap = director.sectionTypeRules || config.sectionTypeRules || {};
    let globalFilterLayers = "";

    for (let i = 0; i < structure.length; i++) {
        const block = structure[i];
        const rules = sectionRulesMap[block.type];
        if (rules && rules.globalFilter) {
            const filterKey = rules.globalFilter;
            const filterCss = library.effectsPool?.globalFilters?.[filterKey] || filterKey;
            const absStart = block.time;
            const absEnd = (i < structure.length - 1) ? structure[i + 1].time : config.project.totalDuration;
            
            if (isTest && (absEnd <= testStart || absStart >= testEnd)) continue;
            
            const start = isTest ? Math.max(absStart, testStart) : absStart;
            const end = isTest ? Math.min(absEnd, testEnd) : absEnd;
            const blockDur = end - start;
            
            if (blockDur > 0) {
                const renderStart = isTest ? (start - testStart) : start;
                globalFilterLayers += `\n            <!-- ГЛОБАЛЬНЫЙ ФИЛЬТР (${block.name}) -->\n            <div id="global-filter-${i}" class="composition-layer clip" style="z-index: 9999; pointer-events: none; ${filterCss}" data-in="0" data-out="${blockDur.toFixed(3)}" data-start="${renderStart.toFixed(3)}" data-duration="${blockDur.toFixed(3)}" data-track-index="10"></div>\n`;
            }
        }
    }

    // ТЕСТОВЫЙ РЕЖИМ: рамка на входе секции + её название в углу
    let testOverlay = "";
    if (isTest) {
        const labelParts = [];
        structure.forEach((blk, i) => {
            const absStart = blk.time;
            const absEnd = (i < structure.length - 1) ? structure[i + 1].time : config.project.totalDuration;
            if (absEnd <= testStart || absStart >= testEnd) return;
            const start = Math.max(0, absStart - testStart);
            const labelDur = Math.min(3.5, testEnd - Math.max(absStart, testStart));
            if (labelDur <= 0.1) return;
            const boxStyle = "position: absolute; inset: 0; z-index: 10001; pointer-events: none; border: 6px solid rgba(255, 210, 120, 0.85); box-sizing: border-box;";
            const textStyle = "position: absolute; left: 2%; top: 3%; z-index: 10002; pointer-events: none; font-family: sans-serif; font-size: 26px; letter-spacing: 1px; color: #ffd479; background: rgba(0, 0, 0, 0.6); padding: 8px 14px; border-radius: 4px;";
            labelParts.push(`\n            <!-- ТЕСТ: ${blk.name} -->\n            <div class="clip" style="${boxStyle}" data-in="0" data-out="${labelDur.toFixed(3)}" data-start="${start.toFixed(3)}" data-duration="${labelDur.toFixed(3)}"></div>\n            <div class="clip" style="${textStyle}" data-in="0" data-out="${labelDur.toFixed(3)}" data-start="${start.toFixed(3)}" data-duration="${labelDur.toFixed(3)}">${blk.name}</div>`);
        });
        testOverlay = labelParts.join('');
    }

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${config.project.name}</title>
    <link rel="stylesheet" href="compositions/reactors.css">
    <style>
        body { margin: 0; background: #000; overflow: hidden; }
        
        /* Корневая композиция HyperFrames (строго первый элемент в body) */
        #root { position: absolute; width: ${resW}px; height: ${resH}px; overflow: hidden; transform-origin: center center; }
        
        /* Внутренний контейнер для сложения трансформаций (Катарсис поверх барабанов на #root) */
        #universe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; transform-origin: center center; will-change: transform, filter; }
        
        .composition-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
        
        .fullscreen-overlay {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            pointer-events: none; opacity: 0;
        }
        
        #shadow-crush-overlay { z-index: 9950; ${shadowCss} }
        #screen-flash-overlay { z-index: 9960; ${flashCss} }
        #host-subs { text-align: center; }

${cssLibrary}
${cameraShakeCss}
    </style>
</head>
<body>
    <div id="root" data-composition-id="root_scene" data-width="${resW}" data-height="${resH}" data-duration="${duration}">
        <div id="universe">
            <div id="host-audio" data-composition-id="audio_scene" class="composition-layer clip" data-in="${renderOffset}" data-out="${renderEnd}" data-start="0" data-duration="${duration}" data-track-index="-1" data-composition-src="compositions/audio_scene.html"></div>
            
            <div id="host-visuals-bg" data-composition-id="visuals_bg_scene" class="composition-layer clip ${shakeClass}" style="mix-blend-mode: ${bgBlend}; z-index: 10;" data-in="${renderOffset}" data-out="${renderEnd}" data-start="0" data-duration="${duration}" data-track-index="1" data-composition-src="compositions/visuals_bg_scene.html"></div>
            <div id="host-images" data-composition-id="images_scene" class="composition-layer clip ${shakeClass}" style="mix-blend-mode: ${imagesBlend}; z-index: 20;" data-in="${renderOffset}" data-out="${renderEnd}" data-start="0" data-duration="${duration}" data-track-index="2" data-composition-src="compositions/images_scene.html"></div>
            <div id="host-visuals-fg" data-composition-id="visuals_fg_scene" class="composition-layer clip ${shakeClass}" style="mix-blend-mode: ${fgBlend}; z-index: 30;" data-in="${renderOffset}" data-out="${renderEnd}" data-start="0" data-duration="${duration}" data-track-index="3" data-composition-src="compositions/visuals_fg_scene.html"></div>
            
            <div id="host-dust" data-composition-id="dust_scene" class="composition-layer clip ${shakeClass}" style="mix-blend-mode: ${dustBlend}; z-index: 90;" data-in="${renderOffset}" data-out="${renderEnd}" data-start="0" data-duration="${duration}" data-track-index="4" data-composition-src="compositions/dust_scene.html"></div>
            
            <div id="host-beats" data-composition-id="beats_scene" class="composition-layer clip" style="mix-blend-mode: ${flashBlendMode}; z-index: 95; pointer-events: none;" data-in="${renderOffset}" data-out="${renderEnd}" data-start="0" data-duration="${duration}" data-track-index="45" data-composition-src="compositions/beats_scene.html"></div>
            
            <div id="shadow-crush-overlay" class="fullscreen-overlay clip" data-in="${renderOffset}" data-out="${renderEnd}" data-start="0" data-duration="${duration}"></div>
            <div id="screen-flash-overlay" class="fullscreen-overlay clip" data-in="${renderOffset}" data-out="${renderEnd}" data-start="0" data-duration="${duration}"></div>
            
            ${subsHtmlLayer}
            <div id="host-color-grade" class="composition-layer clip" style="z-index: 9998; pointer-events: none; ${colorGradeCss}" data-in="${renderOffset}" data-out="${renderEnd}" data-start="0" data-duration="${duration}" data-track-index="6"></div>

            ${testOverlay}
            ${accentsHtmlLayer}
            ${globalFilterLayers}
        </div>
    </div>
    <script>
        window.__timelines = window.__timelines || {};
        window.__timelines["root_scene"] = document.querySelector('[data-composition-id="root_scene"]');
    </script>
</body>
</html>`;

    const indexPath = path.join(rootDir, 'index.html');
    fs.writeFileSync(indexPath, html, 'utf8');
    console.log(`✅ ${indexPath} успешно сгенерирован (Clean Root Orchestrator).`);
} catch (e) {
    console.error("❌ Ошибка в build_index.js:", e.message);
    process.exit(1);
}