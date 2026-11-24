/**
 * Файл: core/utils/resolver/pass_local_vfx.js
 * Версия: 5.1.5 (Strict Class Architecture + Motion Fix)
 * Описание: Оверрайды секций и точечные оверрайды файлов.
 * ИСПРАВЛЕНИЕ: Надежная обработка motion (поддержка как массивов, так и строк).
 */

import path from 'path';
import { logDebugReport } from './debug_inspector.js';

function parseDurationString(durationStr, fallbackDur) {
    if (typeof durationStr === 'number') return durationStr;
    if (typeof durationStr === 'string' && durationStr.startsWith('random(')) {
        const match = durationStr.match(/random\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
        if (match) {
            const min = parseFloat(match[1]);
            const max = parseFloat(match[2]);
            return min + Math.random() * (max - min);
        }
    }
    return fallbackDur;
}

function createVfxEvents(targetPool, poolName, targetStart, overrideEffect, fallbackDur, mediaManifest, counterObj, allowedLayers, isDebugEnabled, timeRangeStr, blockType) {
    const safeLayers = allowedLayers || [];

    if (!targetPool || !targetPool.files || targetPool.files.length === 0) {
        if (isDebugEnabled) logDebugReport(blockType || "N/A", timeRangeStr || "N/A", safeLayers, poolName, "N/A", "WARNING", "Пул пуст или не содержит файлов");
        return [];
    }
    
    let finalZ = (overrideEffect && overrideEffect.z !== undefined) ? overrideEffect.z : ((overrideEffect && overrideEffect.layerIndex !== undefined) ? overrideEffect.layerIndex : (targetPool.z || targetPool.layerIndex || 25));
    finalZ = typeof finalZ === 'string' ? parseInt(finalZ, 10) : finalZ;

    if (!safeLayers.includes(finalZ)) {
        if (isDebugEnabled) logDebugReport(blockType || "N/A", timeRangeStr || "N/A", safeLayers, poolName, finalZ, "REJECTED", "Слой отсутствует в allowedLayers");
        return [];
    }
    
    if (isDebugEnabled) logDebugReport(blockType || "N/A", timeRangeStr || "N/A", safeLayers, poolName, finalZ, "ACTIVE", "Точечный/Секционный оверлей применен");

    const vfxFileObj = targetPool.files[targetPool.currentIndex % targetPool.files.length];
    targetPool.currentIndex++;
    
    const safeVfxPath = vfxFileObj.path || vfxFileObj.file || "";
    const safeVfxFileName = path.basename(safeVfxPath);

    let finalBlend = targetPool.blend || targetPool.blendMode || 'screen';
    if (mediaManifest?.sfx) {
        const manifestEntry = mediaManifest.sfx.find(s => s.file === safeVfxFileName);
        if (manifestEntry?.recommendedBlendMode) finalBlend = manifestEntry.recommendedBlendMode;
    }
    if (overrideEffect && (overrideEffect.blend || overrideEffect.blendMode)) finalBlend = overrideEffect.blend || overrideEffect.blendMode;

    const finalOpacity = (overrideEffect && overrideEffect.opacity !== undefined) ? overrideEffect.opacity : ((overrideEffect && overrideEffect.baseOpacity !== undefined) ? overrideEffect.baseOpacity : (targetPool.opacity !== undefined ? targetPool.opacity : 0.5));
    
    const finalAnimIn = (overrideEffect && (overrideEffect.animIn || overrideEffect.appearance)) || targetPool.animIn || targetPool.defaultAppearance || "fade_in_base";
    const finalAnimOut = (overrideEffect && (overrideEffect.animOut || overrideEffect.exit)) || targetPool.animOut || targetPool.defaultExit || "hard_cut";
    
    // НОРМАЛИЗАЦИЯ MOTION: Защита от ошибки массива vs строки (спасает от бага первой буквы "h")
    let finalMotion = (overrideEffect && (overrideEffect.motion || overrideEffect.movement)) || targetPool.motion || "none";
    if (Array.isArray(finalMotion)) {
        finalMotion = finalMotion.length > 0 ? finalMotion[0] : "none";
    }
    
    let effectDur = (overrideEffect && overrideEffect.duration !== undefined) ? parseDurationString(overrideEffect.duration, fallbackDur) : fallbackDur;
    
    const isAtmosphere = targetPool.class === 'atmosphere';
    const defaultLoop = isAtmosphere || targetPool.loop === true;
    const isLoop = (overrideEffect && overrideEffect.loop !== undefined) ? overrideEffect.loop : defaultLoop;

    counterObj.count++;
    
    return [{
        id: `${poolName}_local_${counterObj.count}`,
        poolName: poolName,
        path: safeVfxPath,
        z: finalZ,
        blend: finalBlend,
        opacity: finalOpacity,
        start: targetStart,
        duration: effectDur,
        animIn: finalAnimIn,
        animOut: finalAnimOut,
        motion: finalMotion,
        mediaStartOffsetRatio: null,
        poolLoop: isLoop,
        strobeConfig: overrideEffect?.strobe || null
    }];
}

export function buildLocalVfxPass(ctx, narrativeTimeline) {
    const { structure, sectionRulesMap, totalDuration, testMode, mediaManifest, initializedVfxPools, directorOverrides, config } = ctx;
    const vfxTimeline = [];
    let vfxCounter = { count: 0 };
    
    const isDebugEnabled = config?.debugMode?.enabled && config?.debugMode?.logPasses;

    if (!structure || structure.length === 0) return vfxTimeline;

    // ПАС 3: Оверрайды секций
    for (let i = 0; i < structure.length; i++) {
        const currentBlock = structure[i];
        const blockStart = currentBlock.time;
        const blockEnd = (i < structure.length - 1) ? structure[i + 1].time : totalDuration;
        const rules = sectionRulesMap[currentBlock.type] || {};
        const allowedLayers = rules.allowedLayers || [];
        const timeRangeStr = `${blockStart.toFixed(1)}s - ${blockEnd.toFixed(1)}s`;
        
        const secOverrideEffect = directorOverrides?.sections?.[currentBlock.type]?.effect || null;
        if (!secOverrideEffect) continue;

        const targetEffectName = secOverrideEffect.name || secOverrideEffect.effect;
        if (!targetEffectName) continue;

        let targetPool = null;
        let targetPoolName = "";

        for (const [pName, pObj] of Object.entries(initializedVfxPools || {})) {
            if (pName.toLowerCase().includes(targetEffectName.toLowerCase())) {
                targetPool = pObj;
                targetPoolName = pName;
                break;
            }
        }

        if (targetPool) {
            let offset = secOverrideEffect.offset ? parseFloat(secOverrideEffect.offset) : 0;
            let targetStart = blockStart + offset;
            if (targetStart >= blockEnd) targetStart = blockStart;

            const isTest = testMode && testMode.enabled;
            const testStart = testMode?.start || 0;
            const testEnd = testStart + totalDuration;
            let effectDur = secOverrideEffect.duration !== undefined ? parseDurationString(secOverrideEffect.duration, 1.0) : 1.0;

            if (!(isTest && (targetStart + effectDur <= testStart || targetStart >= testEnd))) {
                const events = createVfxEvents(targetPool, targetPoolName, targetStart, secOverrideEffect, effectDur, mediaManifest, vfxCounter, allowedLayers, isDebugEnabled, timeRangeStr, currentBlock.type);
                vfxTimeline.push(...events);
            }
        }
    }

    // ПАС 4: Оверрайды файлов
    if (!narrativeTimeline) return vfxTimeline;
    
    for (const clip of narrativeTimeline) {
        if (!clip.rawOverride) continue;
        
        const effectOverride = clip.rawOverride.effect || null;
        if (effectOverride && (effectOverride.name || effectOverride.effect)) {
            const targetEffectName = effectOverride.name || effectOverride.effect;
            let targetPool = null;
            let targetPoolName = "";

            for (const [pName, pObj] of Object.entries(initializedVfxPools || {})) {
                if (pName.toLowerCase().includes(targetEffectName.toLowerCase())) {
                    targetPool = pObj;
                    targetPoolName = pName;
                    break;
                }
            }

            if (targetPool) {
                let targetAbsStart = clip.start + (effectOverride.offset ? parseFloat(effectOverride.offset) : 0);
                targetAbsStart = Math.max(0, targetAbsStart);
                let effectDur = effectOverride.duration !== undefined ? parseDurationString(effectOverride.duration, clip.duration) : clip.duration;
                const timeRangeStr = `${clip.start.toFixed(1)}s (Файл: ${clip.baseFileName})`;
                
                const events = createVfxEvents(targetPool, targetPoolName, targetAbsStart, effectOverride, effectDur, mediaManifest, vfxCounter, clip.allowedLayers, isDebugEnabled, timeRangeStr, "File Override");
                vfxTimeline.push(...events);
            }
        }
    }

    return vfxTimeline;
}