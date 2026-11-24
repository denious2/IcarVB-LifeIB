/**
 * Файл: core/build/build_subs.js
 * Версия: 3.10.2 (Pure Data-Driven Hand-Drawn Filter + In-Root SVG Filters)
 * Описание: Генератор сцены субтитров. Поддерживает анимацию исчезновения (animOut),
 * выделение целых фраз/строк в accentWords, подключение SVG-фильтров из library.json
 * внутрь #root и микро-хаос базовой линии строго по параметрам из director-config.json.
 */

import fs from 'fs';
import path from 'path';
import { createLogger, loadConfigs } from '../config_loader.js';

const rootDir = process.cwd();
const log = createLogger(rootDir);

try {
    log("=== СТАРТ СБОРКИ СУБТИТРОВ (DATA-DRIVEN АРХИТЕКТУРА) ===");

    const { config, director, library } = loadConfigs(rootDir);
    const compDir = path.join(rootDir, 'compositions');
    if (!fs.existsSync(compDir)) fs.mkdirSync(compDir, { recursive: true });

    const outputPath = path.join(compDir, 'subs_scene.html');

    const generateEmptyScene = () => {
        const emptyHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
    <div id="root" data-composition-id="subs_scene"></div>
    <script>
        window.__timelines = window.__timelines || {};
        window.__timelines["subs_scene"] = document.querySelector('#root');
    </script>
</body>
</html>`;
        fs.writeFileSync(outputPath, emptyHtml, 'utf8');
        log("ℹ️ Субтитры отключены или файл не найден. Сгенерирована пустая сцена.");
    };

    const subPathRel = config.media?.subtitlesFile;
    const subsConfig = director.subtitlesConfig || {};

    if (!subsConfig.enabled || !subPathRel || subPathRel.trim() === '') {
        generateEmptyScene();
        process.exit(0);
    }

    const subsFile = path.join(rootDir, subPathRel);

    if (!fs.existsSync(subsFile) || fs.statSync(subsFile).isDirectory()) {
        log(`⚠️ ВНИМАНИЕ: Файл субтитров не найден по пути: ${subsFile}`);
        generateEmptyScene();
        process.exit(0);
    }

    const isTest = config.testMode && config.testMode.enabled;
    const totalDuration = isTest ? config.testMode.duration : config.project.totalDuration;
    const testStart = isTest ? config.testMode.start : 0;
    const testEnd = testStart + totalDuration;

    // Читаем настройки handDrawn строго из director-config.json (по умолчанию выключено)
    const handDrawnCfg = subsConfig.handDrawn || {};
    const handDrawnEnabled = handDrawnCfg.enabled === true;
    const handDrawnFilterId = handDrawnCfg.svgFilter || "";
    const maxRotate = Number(handDrawnCfg.maxRotate) || 0;
    const maxOffsetY = Number(handDrawnCfg.maxOffsetY) || 0;

    let cssLibrary = "";
    let svgFiltersHTML = "";

    if (library.effectsPool) {
        if (library.effectsPool.movements) {
            Object.entries(library.effectsPool.movements).forEach(([name, keyframes]) => {
                cssLibrary += `@keyframes ${name} { ${keyframes} }\n`;
            });
        }
        if (library.effectsPool.appearances) {
            Object.entries(library.effectsPool.appearances).forEach(([name, keyframes]) => {
                cssLibrary += `@keyframes ${name} { ${keyframes} }\n`;
            });
        }
        if (library.effectsPool.svgFilters) {
            Object.values(library.effectsPool.svgFilters).forEach(svg => svgFiltersHTML += `${svg}\n`);
        }
    }

    let handDrawnFilterCSS = '';
    if (handDrawnEnabled && handDrawnFilterId) {
        if (svgFiltersHTML.includes(`id="${handDrawnFilterId}"`)) {
            handDrawnFilterCSS = `filter: url(#${handDrawnFilterId});`;
            log(`✒️ Применён SVG-фильтр из library.json: #${handDrawnFilterId}`);
        } else {
            log(`⚠️ SVG-фильтр #${handDrawnFilterId} указан в director-config.json, но не найден в library.json (effectsPool.svgFilters). Пропущен.`);
        }
    }

    const structure = (director.songStructure || config.songStructure).sort((a, b) => a.time - b.time);

    function getStyleDataForTime(time) {
        let currentSection = structure[0];
        for (let i = 0; i < structure.length; i++) {
            if (time >= structure[i].time) {
                currentSection = structure[i];
            } else {
                break;
            }
        }
        
        const defaultStyle = subsConfig.defaultStyle || "base_box";
        const overrides = subsConfig.overrideBySectionType || {};
        const sectionOverride = overrides[currentSection?.type];

        return {
            styleClass: `sub-style-${sectionOverride?.style || defaultStyle}`,
            animIn: sectionOverride?.animation?.entrance || subsConfig.defaultAnimIn || "fly_up_fade",
            animOut: sectionOverride?.animation?.exit || subsConfig.defaultAnimOut || "none",
            motion: sectionOverride?.animation?.motion || subsConfig.defaultMotion || "micro_jitter",
            durIn: sectionOverride?.animation?.durationIn || subsConfig.defaultDurIn || 0.2,
            durOut: sectionOverride?.animation?.durationOut || subsConfig.defaultDurOut || 0.4
        };
    }

    let subsHTML = "";
    const srt = fs.readFileSync(subsFile, 'utf8');

    function timeToSec(timeStr) {
        const parts = timeStr.trim().replace(',', '.').split(':');
        return (parseFloat(parts[0]) * 3600) + (parseFloat(parts[1]) * 60) + parseFloat(parts[2]);
    }

    // Детерминированный генератор в диапазоне [-1, 1] для стабильного микро-хаоса
    function seededSignedRandom(seed) {
        const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
        return (x - Math.floor(x)) * 2 - 1;
    }

    // Очистка отдельного слова от пунктуации для точного сравнения
    function cleanToken(str) {
        return str
            .replace(/&nbsp;/gi, '')
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()«»"?!—–]/g, '')
            .toLowerCase();
    }

    // Читаем акценты из конфига и раскладываем на фразы (сортировка от длинных к коротким)
    const accentWordsRaw = subsConfig.accentWords || [];
    const accentMotion = subsConfig.accentMotion || "none";
    const accentPhrases = accentWordsRaw
        .map(phrase => phrase
            .replace(/&nbsp;/gi, ' ')
            .trim()
            .split(/\s+/)
            .map(cleanToken)
            .filter(t => t.length > 0)
        )
        .filter(tokens => tokens.length > 0)
        .sort((a, b) => b.length - a.length);

    // === КИНЕТИКА БУКВ (перенос старой .letter-типографики из configs/old/build_subs.js) ===
    // subs.js только разбивает текст на символы и считает сдвиг фазы.
    // Сама CSS-анимация и ограничения по слову приходят из конфига:
    // subtitlesConfig.charStyle / wordStyle / charDelayStep / charDelayMod.
    const kineticEnabled = subsConfig.kinetic === true;
    const charStyle = (subsConfig.charStyle || "").trim();
    const wordStyle = (subsConfig.wordStyle || "").trim();
    const charDelayStep = Number(subsConfig.charDelayStep) || 0.17;
    const charDelayMod = Number(subsConfig.charDelayMod) || 0.15;
    let charCursor = 0;

    function toChars(text) {
        let out = "";
        for (const ch of text) {
            if (ch === " ") {
                out += "&nbsp;";
                continue;
            }
            const delay = ((charCursor * charDelayStep) % charDelayMod).toFixed(3);
            charCursor++;
            out += `<span class="char" style="--char-delay: -${delay}s">${ch}</span>`;
        }
        return out;
    }

    function processTextForBass(rawText, clipIndex) {
        // Разбиваем текст на токены, сохраняя переносы строк как _BR_
        const normalizedText = rawText
            .replace(/<br\s*\/?>/gi, ' _BR_ ')
            .replace(/&nbsp;/gi, ' ');

        const rawTokens = normalizedText.split(/\s+/).filter(w => w.length > 0);
        const cleanTokens = rawTokens.map(t => (t === '_BR_' ? '_BR_' : cleanToken(t)));

        const segments = [];
        let i = 0;

        while (i < rawTokens.length) {
            if (rawTokens[i] === '_BR_') {
                segments.push({ type: 'br' });
                i++;
                continue;
            }

            let matchedLength = 0;

            if (accentMotion !== "none" && accentPhrases.length > 0) {
                for (let p = 0; p < accentPhrases.length; p++) {
                    const phrase = accentPhrases[p];
                    const len = phrase.length;
                    if (i + len > rawTokens.length) continue;

                    let isMatch = true;
                    for (let k = 0; k < len; k++) {
                        if (cleanTokens[i + k] !== phrase[k]) {
                            isMatch = false;
                            break;
                        }
                    }

                    if (isMatch) {
                        matchedLength = len;
                        break;
                    }
                }
            }

            if (matchedLength > 0) {
                const phraseText = rawTokens.slice(i, i + matchedLength).join(' ');
                segments.push({ type: 'accent', text: phraseText });
                i += matchedLength;
            } else {
                segments.push({ type: 'word', text: rawTokens[i] });
                i++;
            }
        }

        // Собираем HTML, добавляя микро-хаос базовой линии (если включён) и неразрывные пробелы после предлогов (1–3 буквы)
        let htmlOut = '';
        charCursor = 0;
        for (let s = 0; s < segments.length; s++) {
            const seg = segments[s];
            const nextSeg = segments[s + 1];

            if (seg.type === 'br') {
                htmlOut += '<br>';
                continue;
            }

            let chaosStyle = '';
            if (handDrawnEnabled && (maxRotate > 0 || maxOffsetY > 0)) {
                const seedBase = (clipIndex + 1) * 100 + (s + 1) * 7;
                const rot = (seededSignedRandom(seedBase) * maxRotate).toFixed(2);
                const ty = (seededSignedRandom(seedBase + 31) * maxOffsetY).toFixed(2);
                chaosStyle = ` rotate: ${rot}deg; translate: 0 ${ty}px;`;
            }

            const innerText = kineticEnabled ? toChars(seg.text) : seg.text;

            if (seg.type === 'accent') {
                htmlOut += `<span class="acc" style="display: inline-block;${chaosStyle} animation: ${accentMotion};">${innerText}</span>`;
            } else {
                htmlOut += `<span class="word" style="display: inline-block;${chaosStyle}">${innerText}</span>`;
            }

            if (nextSeg && nextSeg.type !== 'br') {
                const isShortWord = seg.type === 'word' && /^[а-яА-ЯёЁa-zA-Z]{1,3}$/.test(cleanToken(seg.text));
                htmlOut += isShortWord ? '&nbsp;' : ' ';
            }
        }

        return htmlOut.trim();
    }

    const blocks = srt.replace(/\r/g, '').trim().split(/\n\s*\n/);
    let subIndex = 0;

    blocks.forEach(block => {
        const lines = block.split('\n');
        const timeIndex = lines.findIndex(l => l.includes('-->'));
        if (timeIndex !== -1) {
            const times = lines[timeIndex].split(/\s*-->\s*/);
            if (times.length >= 2) {
                const absStart = timeToSec(times[0]);
                const absEnd = timeToSec(times[1]);

                if (isTest && (absEnd <= testStart || absStart >= testEnd)) return;

                const renderStart = isTest ? Math.max(0, absStart - testStart) : absStart;
                const renderEnd = isTest ? Math.min(totalDuration, absEnd - testStart) : absEnd;
                const duration = renderEnd - renderStart;

                const rawText = lines.slice(timeIndex + 1).join('<br>');
                const processedHtmlText = processTextForBass(rawText, subIndex);

                const subId = `sub-clip-${subIndex}`;
                const styleData = getStyleDataForTime(absStart);

                // Сборка составной анимации (появление, базовое движение)
                let animationString = `${styleData.animIn} ${styleData.durIn}s linear forwards, ${styleData.motion} 0.15s infinite`;

                // Если задано исчезновение — добавляем его в конец с нужной задержкой
                if (styleData.animOut && styleData.animOut !== "none") {
                    const delayOut = Math.max(0, duration - styleData.durOut).toFixed(3);
                    animationString += `, ${styleData.animOut} ${styleData.durOut}s linear ${delayOut}s forwards`;
                }

                subsHTML += `
<div id="${subId}" class="clip subtitle-wrapper" data-in="${renderStart.toFixed(3)}" data-out="${renderEnd.toFixed(3)}" data-start="${renderStart.toFixed(3)}" data-duration="${duration.toFixed(3)}" data-track-index="6">
    <div class="subtitle-animator" style="animation: ${animationString};">
        <span class="subtitle-text-inline ${styleData.styleClass}">${processedHtmlText}</span>
    </div>
</div>`;
                subIndex++;
            }
        }
    });
    log(`Обработано ${subIndex} титульных строк.`);

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="reactors.css">
<style>
    body { margin: 0; background: transparent; overflow: hidden; }
    #root { position: absolute; width: 100vw; height: 100vh; pointer-events: none; }

    .subtitle-wrapper {
        position: absolute; width: 100vw; height: 100vh;
        display: flex; align-items: center; justify-content: center;
        perspective: 1000px;
    }

    .subtitle-animator {
        width: 92vw;
        text-align: center;
    }

    .subtitle-text-inline {
        white-space: normal; 
        display: inline-block;
        ${handDrawnFilterCSS}
    }

    ${wordStyle ? `.word, .acc { ${wordStyle} }` : ""}
    ${charStyle ? `.char { ${charStyle} }` : ""}

    ${cssLibrary}
</style>
</head>
<body>
<div id="root" data-composition-id="subs_scene" data-width="${config.project.resolution.width}" data-height="${config.project.resolution.height}" data-duration="${totalDuration}">
${svgFiltersHTML}
${subsHTML}
</div>
<script>
    document.fonts.ready.then(() => {
        window.__timelines = window.__timelines || {};
        window.__timelines["subs_scene"] = document.querySelector('[data-composition-id="subs_scene"]');
    });
    setTimeout(() => {
        window.__timelines = window.__timelines || {};
        if (!window.__timelines["subs_scene"]) {
           window.__timelines["subs_scene"] = document.querySelector('[data-composition-id="subs_scene"]');
        }
    }, 100);
</script>
</body>
</html>`;

    fs.writeFileSync(outputPath, html, 'utf8');
    log("✅ УСПЕХ! HTML файл субтитров скомпилирован по Data-Driven архитектуре.");
} catch (e) {
    log(`❌ ОШИБКА В BUILD_SUBS.JS: ${e.message}`);
    process.exit(1); 
}