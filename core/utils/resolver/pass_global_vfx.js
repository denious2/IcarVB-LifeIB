/**
 * Файл: core/utils/resolver/pass_global_vfx.js
 * Версия: 5.1.3 (Strict Class Architecture + Persistent Layers + Motion Fix)
 * Описание: Триггером глобального фона является исключительно class === 'atmosphere'.
 * Внедрена архитектурная защита для persistent-слоев и надежная обработка массивов motion.
 */

import path from 'path';
import { logDebugReport } from './debug_inspector.js';

export function buildGlobalVfxPass(ctx) {
    const { structure, sectionRulesMap, totalDuration, testMode, mediaManifest, initializedVfxPools, config } = ctx;
    const vfxTimeline = [];
    let vfxCounter = 0;

    if (!structure || structure.length === 0) return vfxTimeline;

    const isDebugEnabled = config?.debugMode?.enabled && config?.debugMode?.logPasses;

    for (let i = 0; i < structure.length; i++) {
        const currentBlock = structure[i];
        const blockStart = currentBlock.time;
        const blockEnd = (i < structure.length - 1) ? structure[i + 1].time : totalDuration;
        
        // Защита от зависания, если время секции указано некорректно
        if (blockEnd <= blockStart) continue; 
        
        const rules = sectionRulesMap[currentBlock.type] || {};
        const allowedLayers = rules.allowedLayers || [];

        const isTest = testMode && testMode.enabled;
        const testStart = testMode?.start || 0;
        const testEnd = testStart + totalDuration;
        
        const timeRangeStr = `${blockStart.toFixed(1)}s - ${blockEnd.toFixed(1)}s`;

        for (const [poolName, vfxState] of Object.entries(initializedVfxPools || {})) {
            // Безопасное извлечение слоя с дефолтом
            const rawZ = vfxState.z !== undefined ? vfxState.z : vfxState.layerIndex;
            const poolZ = typeof rawZ === 'string' ? parseInt(rawZ, 10) : (rawZ !== undefined ? rawZ : -1);
            
            // Строгая проверка по классу атмосферы
            const isAtmosphere = vfxState.class === 'atmosphere';
            
            // АРХИТЕКТУРНОЕ ИСПРАВЛЕНИЕ: Если слой persistent, он обрабатывается отдельно в главном резолвере.
            // Здесь мы режем на секции ТОЛЬКО обычные, дискретные атмосферные слои.
            if (isAtmosphere && !vfxState.persistent) {
                const isAllowed = allowedLayers.includes(poolZ);
                
                if (isAllowed) {
                    if (isDebugEnabled) {
                        logDebugReport(currentBlock.type, timeRangeStr, allowedLayers, poolName, poolZ, "ACTIVE", "Слой разрешен в секции");
                    }
                    
                    let chunkDur = vfxState.slotDuration || 6.0; 
                    // Защита от бесконечного цикла, если chunkDur случайно оказался 0
                    if (chunkDur <= 0.1) chunkDur = 6.0;
                    
                    // НОРМАЛИЗАЦИЯ MOTION: Защита от ошибки массива vs строки (спасает от бага первой буквы "h")
                    const rawMotion = vfxState.motion;
                    const resolvedMotion = Array.isArray(rawMotion) ? (rawMotion[0] || "none") : (rawMotion || "none");
                    
                    let loopTime = blockStart;
                    while (loopTime < blockEnd) {
                        let slotDur = Math.min(chunkDur, blockEnd - loopTime);
                        
                        if (!(isTest && (loopTime + slotDur <= testStart || loopTime >= testEnd))) {
                            if (!vfxState.files || vfxState.files.length === 0) { 
                                loopTime += slotDur; 
                                continue; 
                            }
                            
                            const vfxFileObj = vfxState.files[vfxState.currentIndex % vfxState.files.length];
                            vfxState.currentIndex++;
                            
                            const safeVfxPath = vfxFileObj.path || vfxFileObj.file || "";
                            const safeVfxFileName = path.basename(safeVfxPath);

                            let smartBlend = vfxState.blend || vfxState.blendMode || 'screen';
                            if (mediaManifest?.sfx) {
                                const manifestEntry = mediaManifest.sfx.find(s => s.file === safeVfxFileName);
                                if (manifestEntry?.recommendedBlendMode) smartBlend = manifestEntry.recommendedBlendMode;
                            }

                            vfxCounter++;
                            vfxTimeline.push({
                                id: `${poolName}_global_${vfxCounter}`,
                                poolName: poolName,
                                path: safeVfxPath,
                                z: poolZ,
                                blend: smartBlend,
                                opacity: vfxState.opacity !== undefined ? vfxState.opacity : 0.3,
                                start: loopTime,
                                duration: slotDur,
                                animIn: vfxState.animIn || "fade_in_base",
                                animOut: vfxState.animOut || "section_fade_out",
                                motion: resolvedMotion,
                                mediaStartOffsetRatio: null,
                                poolLoop: vfxState.loop === true
                            });
                        }
                        loopTime += slotDur;
                    }
                } else {
                    if (isDebugEnabled) {
                        logDebugReport(currentBlock.type, timeRangeStr, allowedLayers, poolName, poolZ, "REJECTED", "Слой отсутствует в allowedLayers секции");
                    }
                }
            }
        }
    }
    
    return vfxTimeline;
}