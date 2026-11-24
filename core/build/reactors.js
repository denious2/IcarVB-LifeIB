/**
 * Файл: core/build/reactors.js
 * Версия: 4.7.0 (Strict Gate Edge Detection + Universal Gate Regex)
 * Описание: Полный компилятор аудио-реактивности (bass, melody, vocal, beat, drums) 
 * и стабильных тайм-гейтов в compositions/reactors.css. Все сигналы и гейты компилируются 
 * в единый таймлайн :root (global-audio-reactors) с жесткой фиксацией фронтов вкл/выкл.
 */

import fs from 'fs';
import path from 'path';
import { loadConfigs, createLogger } from '../config_loader.js';
import { compileSubtitlesStyles } from './subtitles_compiler.js';

const rootDir = process.cwd();
const log = createLogger(rootDir);

try {
    log("=== СТАРТ СБОРКИ АУДИО-РЕАКТОРОВ (NODE COMPILER) ===");
    
    const { config, director, library } = loadConfigs(rootDir);
    const compDir = path.join(rootDir, 'compositions');

    const FPS = 30;
    const isTest = config.testMode && config.testMode.enabled;
    const testStart = isTest ? (config.testMode.start || 0) : 0;
    const duration = isTest ? config.testMode.duration : config.project.totalDuration;
    const totalFrames = Math.max(1, Math.ceil(duration * FPS));
    const frameOffset = Math.floor(testStart * FPS);

    function loadSignal(filename, defaultKey) {
        const filePath = path.join(rootDir, filename);
        if (!fs.existsSync(filePath)) return null;
        try { 
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (Array.isArray(data)) return data;
            if (data[defaultKey] && Array.isArray(data[defaultKey])) return data[defaultKey];
            if (data.frames && Array.isArray(data.frames)) return data.frames;
            for (let key in data) if (Array.isArray(data[key])) return data[key];
            return null;
        }
        catch (e) { return null; }
    }

    // Определяем источники из режиссерского конфига
    const beatSrc = director.beatsConfig?.sourceFile || 'beats.json';
    const bassSrc = director.bass?.sourceFile || 'bass.json';
    const melodySrc = director.melody?.sourceFile || 'melody.json';
    const vocalSrc = director.vocal?.sourceFile || 'vocal.json';
    const drumsSrc = director.drums?.sourceFile || 'drums.json';

    const beatsData = loadSignal(beatSrc, 'beats');
    const bassData = loadSignal(bassSrc, 'bass');
    const melodyData = loadSignal(melodySrc, 'melody');
    const vocalData = loadSignal(vocalSrc, 'vocal');
    const drumsData = loadSignal(drumsSrc, 'drums');

    // Читаем ЗАТУХАНИЕ (Decay) из режиссерского конфига
    const beatDecay = director.beatsConfig?.decay !== undefined ? director.beatsConfig.decay : 0.82;
    const bassDecay = director.bass?.decay !== undefined ? director.bass.decay : 0.90;
    const melodyDecay = director.melody?.decay !== undefined ? director.melody.decay : 0.90;
    const vocalDecay = director.vocal?.decay !== undefined ? director.vocal.decay : 0.90;
    const drumsDecay = director.drums?.decay !== undefined ? director.drums.decay : 0.90;

    const frames = {
        bass: new Array(totalFrames).fill(0),
        melody: new Array(totalFrames).fill(0),
        vocal: new Array(totalFrames).fill(0),
        beat: new Array(totalFrames).fill(0),
        drums: new Array(totalFrames).fill(0)
    };

    const fillFrames = (data, targetArray, decayFactor) => {
        if (!data) return;
        if (data.length > 0 && typeof data[0] === 'number' && data[data.length-1] > 1.0) {
            data.forEach(time => {
                const frameIdx = Math.floor(time * FPS) - frameOffset;
                if (frameIdx >= 0 && frameIdx < totalFrames) targetArray[frameIdx] = 1.0;
            });
            for (let i = 1; i < totalFrames; i++) {
                targetArray[i] = Math.max(targetArray[i], targetArray[i - 1] * decayFactor);
                if (targetArray[i] < 0.02) targetArray[i] = 0; 
            }
        } 
        else {
            for(let i = 0; i < totalFrames; i++) targetArray[i] = data[frameOffset + i] || 0;
        }
    };

    // Применяем Data-Driven затухание для всех каналов
    if (bassData) { fillFrames(bassData, frames.bass, bassDecay); log(`🔊 Сигнал подключен: [audio.bass] (Decay: ${bassDecay})`); }
    if (melodyData) { fillFrames(melodyData, frames.melody, melodyDecay); log(`🎹 Сигнал подключен: [audio.melody] (Decay: ${melodyDecay})`); }
    if (vocalData) { fillFrames(vocalData, frames.vocal, vocalDecay); log(`🎤 Сигнал подключен: [audio.vocal] (Decay: ${vocalDecay})`); }
    if (beatsData) { fillFrames(beatsData, frames.beat, beatDecay); log(`🥁 Сигнал подключен: [audio.beat] (Decay: ${beatDecay})`); }
    if (drumsData) { fillFrames(drumsData, frames.drums, drumsDecay); log(`🥁 Сигнал подключен: [audio.drums] (Decay: ${drumsDecay})`); }

    // СТРОГИЙ СБОР ТАЙМ-ГЕЙТОВ (сквозная индексация только для активных гейтов)
    const activeGates = [];
    if (director.audioReactors && director.audioReactors.enabled && director.audioReactors.nodes) {
        let gateCounter = 0;
        director.audioReactors.nodes.forEach((node) => {
            if (node.activeFrom !== undefined && node.activeDuration !== undefined) {
                node.__gateIndex = gateCounter++;
                const gateName = `--gate-${node.__gateIndex}`;
                let startFrame = Math.floor(node.activeFrom * FPS) - frameOffset;
                let endFrame = Math.ceil((node.activeFrom + node.activeDuration) * FPS) - frameOffset;
                if (endFrame < 0 || startFrame >= totalFrames) { startFrame = -1; endFrame = -2; }
                activeGates.push({ name: gateName, startFrame, endFrame, nodeName: node.name });
                log(`🕒 Тайм-гейт зарегистрирован: [${node.name}] ➔ ${gateName} (${node.activeFrom}s – ${(node.activeFrom + node.activeDuration).toFixed(2)}s)`);
            }
        });
    }

    // 1. Генерация глобального CSS @keyframes для аудио-сигналов и тайм-гейтов
    let css = `/* === ДИНАМИЧЕСКИЕ СИГНАЛЫ (AUDIO ENVELOPES & TIME GATES) === */\n`;
    css += `@property --bass { syntax: '<number>'; inherits: true; initial-value: 0; }\n`;
    css += `@property --melody { syntax: '<number>'; inherits: true; initial-value: 0; }\n`;
    css += `@property --vocal { syntax: '<number>'; inherits: true; initial-value: 0; }\n`;
    css += `@property --beat { syntax: '<number>'; inherits: true; initial-value: 0; }\n`;
    css += `@property --drums { syntax: '<number>'; inherits: true; initial-value: 0; }\n`;
    activeGates.forEach(g => {
        css += `@property ${g.name} { syntax: '<number>'; inherits: true; initial-value: 0; }\n`;
    });
    css += `\n`;

    // Отслеживаем состояние гейтов на предыдущем кадре, чтобы фиксировать моменты фронтов (вкл/выкл)
    const prevGateStates = {};

    css += `@keyframes global-audio-reactors {\n`;
    for(let i = 0; i < totalFrames; i++) {
        const percent = (i / (totalFrames - 1) * 100).toFixed(3);
        const b = frames.bass[i].toFixed(3);
        const m = frames.melody[i].toFixed(3);
        const v = frames.vocal[i].toFixed(3);
        const bt = frames.beat[i].toFixed(3);
        const dr = frames.drums[i].toFixed(3);

        let gatesStr = "";
        let anyGateActive = false;
        let stateChanged = false;

        activeGates.forEach(g => {
            const isActive = (i >= g.startFrame && i <= g.endFrame);
            if (isActive) anyGateActive = true;

            if (prevGateStates[g.name] !== isActive) {
                stateChanged = true;
            }
            prevGateStates[g.name] = isActive;

            gatesStr += ` ${g.name}: ${isActive ? '1.000' : '0.000'};`;
        });
        
        if (b > 0 || m > 0 || v > 0 || bt > 0 || dr > 0 || anyGateActive || stateChanged || i === 0 || i === totalFrames - 1) {
             css += `  ${percent}% { --bass: ${b}; --melody: ${m}; --vocal: ${v}; --beat: ${bt}; --drums: ${dr};${gatesStr} }\n`;
        }
    }
    css += `}\n\n`;
    css += `:root { animation: global-audio-reactors ${duration}s linear forwards; }\n\n`;

    // 2. Генерация правил из director-config.json (Ноды + Огибающие + Гейты)
    if (director.audioReactors && director.audioReactors.enabled && director.audioReactors.nodes) {
        css += `/* === РЕЖИССЕРСКИЕ УЗЛЫ (AUDIO REACTORS NODES) === */\n`;
        
        const compiledMap = {}; 
        const gateRegex = /var\(--gate(?:-\d+)?(?:\s*,\s*[^)]+)?\)/g;
        
        director.audioReactors.nodes.forEach((node) => {
            if (!node.target || !node.cssProperty) return;
            
            if (!compiledMap[node.target]) {
                compiledMap[node.target] = { formulas: [], transitions: [], animations: [] };
            }

            let finalFormula = "";
            if (node.formulaParts && Array.isArray(node.formulaParts)) {
                finalFormula = node.formulaParts.map(part => part.code).join(' ');
            } else if (node.formula) {
                finalFormula = node.formula;
            }

            // ТОЧНАЯ ПОДСТАНОВКА СТАБИЛЬНОГО ИНДЕКСА ГЕЙТА (включая записи с фолбэком вроде var(--gate-0, 0))
            if (node.activeFrom !== undefined && node.activeDuration !== undefined && node.__gateIndex !== undefined) {
                finalFormula = finalFormula.replace(gateRegex, `var(--gate-${node.__gateIndex}, 0)`);
            } else {
                finalFormula = finalFormula.replace(gateRegex, `1`);
            }

            // ОБРАБОТКА ОГИБАЮЩИХ (ENVELOPES)
            if (node.envelope) {
                const envVar = `--env_${node.__gateIndex !== undefined ? node.__gateIndex : '0'}`; 
                finalFormula = finalFormula.replace(/--env/g, envVar); 

                let envData = typeof node.envelope === 'string' ? library?.effectsPool?.envelopes?.[node.envelope] : node.envelope;
                if (envData && envData.points) {
                    const kfName = `env_anim_${node.__gateIndex !== undefined ? node.__gateIndex : '0'}`;
                    css += `@property ${envVar} { syntax: '<number>'; inherits: true; initial-value: 1; }\n`;
                    css += `@keyframes ${kfName} {\n`;
                    envData.points.forEach(pt => {
                        css += `  ${(pt.x * 100).toFixed(2)}% { ${envVar}: ${pt.y}; }\n`;
                    });
                    css += `}\n\n`;
                    compiledMap[node.target].animations.push(`${kfName} ${duration}s linear forwards`);
                }
            }

            if (finalFormula) {
                compiledMap[node.target].formulas.push({ prop: node.cssProperty, val: finalFormula });
            }
            if (node.transition) {
                compiledMap[node.target].transitions.push(node.transition);
            }
        });

        // Склейка свойств
        for (const target in compiledMap) {
            css += `${target} {\n`;
            const targetData = compiledMap[target];
            
            const propsMap = {};
            targetData.formulas.forEach(f => {
                if (!propsMap[f.prop]) propsMap[f.prop] = [];
                propsMap[f.prop].push(f.val);
            });
            
            for (const prop in propsMap) {
                css += `    ${prop}: ${propsMap[prop].join(' ')};\n`;
            }

            if (targetData.transitions.length > 0) {
                 css += `    transition: ${[...new Set(targetData.transitions)].join(', ')};\n`;
            }
            if (targetData.animations.length > 0) {
                 css += `    animation: ${[...new Set(targetData.animations)].join(', ')};\n`;
            }
            css += `}\n\n`;
        }
        log(`🎛️ Скомпилировано нод (Audio Reactors): ${director.audioReactors.nodes.length}`);
    }

    // 3. Компилируем типографику и стили субтитров из библиотеки
    let subsCss = "";
    if (library) {
        log("🎨 Сборка стилей типографики и субтитров...");
        subsCss = compileSubtitlesStyles(library);
    }

    // Объединяем с реакторами и записываем в reactors.css
    const finalCss = subsCss + "\n" + css;

    if (!fs.existsSync(compDir)) fs.mkdirSync(compDir, { recursive: true });
    fs.writeFileSync(path.join(compDir, 'reactors.css'), finalCss, 'utf8');

    log(`✅ УСПЕХ! Матрица реакторов собрана: compositions/reactors.css`);
} catch (e) {
    log(`❌ Ошибка в reactors.js: ${e.message}`);
    process.exit(1);
}