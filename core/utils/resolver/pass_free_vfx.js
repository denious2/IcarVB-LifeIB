/**
 * Файл: core/utils/resolver/pass_free_vfx.js
 * Версия: 1.0.2 (Strict Class Free-running VFX + Debug Inspector)
 * Описание: ПАС 5. Обрабатывает независимые оверлеи (freeOverlays), 
 * которые играют по абсолютным таймкодам, игнорируя границы секций и allowedLayers.
 */

import path from 'path';
import { logDebugReport } from './debug_inspector.js';

export function buildFreeVfxPass(ctx) {
    const { directorOverrides, totalDuration, testMode, mediaManifest, initializedVfxPools, config } = ctx;
    const vfxTimeline = [];
    let vfxCounter = 0;

    const freeOverlays = directorOverrides?.freeOverlays || [];
    if (!freeOverlays || freeOverlays.length === 0) return vfxTimeline;

    const isTest = testMode && testMode.enabled;
    const testStart = testMode?.start || 0;
    const testEnd = testStart + totalDuration;
    const isDebugEnabled = config?.debugMode?.enabled && config?.debugMode?.logPasses;

    for (const overlay of freeOverlays) {
        // Ищем целевой пул
        const targetEffectName = overlay.pool || overlay.name;
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

        if (!targetPool || !targetPool.files || targetPool.files.length === 0) {
            if (isDebugEnabled) logDebugReport("FreeVFX", "N/A", ["ANY"], targetEffectName, "N/A", "WARNING", "Пул пуст или не найден");
            continue;
        }

        // Расчет абсолютного времени
        const absStart = overlay.absStart !== undefined ? parseFloat(overlay.absStart) : 0;
        let effectDur = overlay.duration !== undefined ? parseFloat(overlay.duration) : 
                       (overlay.absEnd !== undefined ? (parseFloat(overlay.absEnd) - absStart) : 10.0);
        
        if (effectDur <= 0) continue;
        if (absStart >= totalDuration) continue;
        
        // Ограничиваем концом клипа
        effectDur = Math.min(effectDur, totalDuration - absStart);

        if (!(isTest && (absStart + effectDur <= testStart || absStart >= testEnd))) {
            const vfxFileObj = targetPool.files[targetPool.currentIndex % targetPool.files.length];
            targetPool.currentIndex++;
            
            const safeVfxPath = vfxFileObj.path || vfxFileObj.file || "";
            const safeVfxFileName = path.basename(safeVfxPath);

            let smartBlend = overlay.blend || overlay.blendMode || targetPool.blend || 'screen';
            if (mediaManifest?.sfx && (!overlay.blend && !overlay.blendMode)) {
                const manifestEntry = mediaManifest.sfx.find(s => s.file === safeVfxFileName);
                if (manifestEntry?.recommendedBlendMode) smartBlend = manifestEntry.recommendedBlendMode;
            }

            const rawZ = overlay.z !== undefined ? overlay.z : overlay.layerIndex;
            const finalZ = typeof rawZ === 'string' ? parseInt(rawZ, 10) : (rawZ !== undefined ? rawZ : 99);

            // Проверка по строгому классу atmosphere для дефолтного лупа
            const isAtmosphere = targetPool.class === 'atmosphere';
            const defaultLoop = isAtmosphere || targetPool.loop === true;
            const isLoop = overlay.loop !== undefined ? overlay.loop : defaultLoop;

            const timeRangeStr = `${absStart.toFixed(1)}s - ${(absStart + effectDur).toFixed(1)}s`;
            if (isDebugEnabled) logDebugReport("FreeVFX", timeRangeStr, ["ANY"], targetPoolName, finalZ, "ACTIVE", "Свободный оверлей запущен");

            vfxCounter++;
            vfxTimeline.push({
                id: `${targetPoolName}_free_${vfxCounter}`,
                poolName: targetPoolName,
                path: safeVfxPath,
                z: finalZ,
                blend: smartBlend,
                opacity: overlay.opacity !== undefined ? overlay.opacity : (targetPool.opacity !== undefined ? targetPool.opacity : 0.5),
                start: absStart,
                duration: effectDur,
                animIn: overlay.animIn || targetPool.animIn || "fade_in_base",
                animOut: overlay.animOut || targetPool.animOut || "hard_cut",
                motion: overlay.motion || (Array.isArray(targetPool.motion) ? targetPool.motion[0] : targetPool.motion) || "none",
                mediaStartOffsetRatio: null,
                poolLoop: isLoop
            });
        }
    }

    return vfxTimeline;
}