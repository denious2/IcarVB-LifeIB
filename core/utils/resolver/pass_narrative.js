/**
 * Файл: core/utils/resolver/pass_narrative.js
 * Версия: 5.1.0 (Titanium Magnet & Debug Inspector)
 * ИСПРАВЛЕНИЯ: Внедрена диагностика для прозрачности сборки.
 */

import path from 'path';
import { calculateMagnetDuration } from '../images/rhythm_magnet.js';
import { logDebugReport } from './debug_inspector.js';

export function buildNarrativePass(ctx) {
    const { structure, sectionRulesMap, limits, totalDuration, testMode, beats, subtitleStarts, directorOverrides, narrativePools, config } = ctx;
    const narrativeTimeline = [];
    let currentTime = 0;

    const isDebugEnabled = config?.debugMode?.enabled && config?.debugMode?.logPasses;

    if (!structure || structure.length === 0) return narrativeTimeline;

    const safeLimits = {
        MAX_IMG_DURATION: limits?.MAX_IMG_DURATION || 6.0,
        MAX_VIDEO_DURATION: limits?.MAX_VIDEO_DURATION || limits?.MAX_IMG_DURATION || 6.0,
        MIN_IMG_DURATION: limits?.MIN_IMG_DURATION || 2.5
    };

    while (currentTime < totalDuration) {
        const absStart = currentTime;
        const EPSILON = 0.01;

        let currentBlock = structure[0];
        let currentBlockEnd = totalDuration;

        for (let i = 0; i < structure.length; i++) {
            if (absStart + EPSILON >= structure[i].time) {
                currentBlock = structure[i];
                currentBlockEnd = (i < structure.length - 1) ? structure[i + 1].time : totalDuration;
            }
        }

        const rules = sectionRulesMap[currentBlock.type] || {};
        if (rules.blackout) { 
            currentTime += safeLimits.MAX_IMG_DURATION; 
            continue; 
        }

        const allowedLayers = rules.allowedLayers || [];
        const timeRangeStr = `${absStart.toFixed(1)}s`;
        
        let activeNarPoolName = null;
        let activeNarPool = null;
        let activePoolZ = 20;

        for (const [pName, pData] of Object.entries(narrativePools || {})) {
            if (pData.currentIndex === undefined) pData.currentIndex = 0;
            
            const rawZ = pData.z !== undefined ? pData.z : pData.layerIndex;
            const poolZ = typeof rawZ === 'string' ? parseInt(rawZ, 10) : (rawZ !== undefined ? rawZ : 20);
            
            if (allowedLayers.includes(poolZ)) {
                activeNarPoolName = pName;
                activeNarPool = pData;
                activePoolZ = poolZ; 
                break;
            }
        }

        if (!activeNarPool || !activeNarPool.files || activeNarPool.files.length === 0) {
            if (isDebugEnabled && activeNarPoolName) logDebugReport(currentBlock.type, timeRangeStr, allowedLayers, activeNarPoolName, activePoolZ, "WARNING", "Пул сюжетов пуст");
            currentTime += safeLimits.MAX_IMG_DURATION;
            continue;
        }

        const imageIndex = activeNarPool.currentIndex;
        const fileObj = activeNarPool.files[imageIndex % activeNarPool.files.length] || "";
        
        const safeFilePath = typeof fileObj === 'string' ? fileObj : (fileObj.path || fileObj.file || "");
        if (!safeFilePath) {
            currentTime += safeLimits.MAX_IMG_DURATION;
            activeNarPool.currentIndex++;
            continue;
        }

        const baseFileName = path.basename(safeFilePath);
        const baseFileNameNoExt = path.basename(safeFilePath, path.extname(safeFilePath));

        if (isDebugEnabled) logDebugReport(currentBlock.type, timeRangeStr, allowedLayers, activeNarPoolName, activePoolZ, "ACTIVE", `Файл: ${baseFileName}`);

        let fileOverride = null;
        if (directorOverrides && directorOverrides.files) {
            const overrideKey = Object.keys(directorOverrides.files).find(k => {
                const kLower = k.toLowerCase();
                return kLower === baseFileName.toLowerCase() || kLower === baseFileNameNoExt.toLowerCase();
            });
            if (overrideKey) fileOverride = directorOverrides.files[overrideKey];
        }

        const mediaOverride = (fileOverride && fileOverride.media) ? fileOverride.media : {};
        
        let slotDuration = safeLimits.MAX_IMG_DURATION;
        try {
            slotDuration = calculateMagnetDuration({
                absStart, 
                currentBlockEnd, 
                MAX_IMG_DURATION: safeLimits.MAX_IMG_DURATION, 
                MAX_VIDEO_DURATION: safeLimits.MAX_VIDEO_DURATION,
                MIN_IMG_DURATION: safeLimits.MIN_IMG_DURATION, 
                subtitleStarts: subtitleStarts || [], 
                beats: beats || [], 
                fileObj, 
                fileOverride: { media: mediaOverride }
            });
        } catch (e) {
            console.warn(`⚠️ Ошибка в магнитах для '${baseFileName}': ${e.message}. Используем дефолтную длительность.`);
            slotDuration = safeLimits.MAX_IMG_DURATION;
        }

        if (!slotDuration || isNaN(slotDuration) || slotDuration <= 0) {
            slotDuration = safeLimits.MIN_IMG_DURATION;
        }

        const absEnd = Math.min(currentTime + slotDuration, totalDuration);
        const actualDuration = absEnd - absStart;
        if (actualDuration <= 0) break;

        const isTest = testMode && testMode.enabled;
        const testStart = testMode?.start || 0;
        const testEnd = testStart + totalDuration;
        
        if (!(isTest && (absEnd <= testStart || absStart >= testEnd))) {
            const allowedMoves = activeNarPool.motion || activeNarPool.allowedMovements || ["none"];
            const localShift = parseInt(mediaOverride.movementShift, 10) || 0;
            
            const movesLen = allowedMoves.length;
            const moveIndex = ((imageIndex + localShift) % movesLen + movesLen) % movesLen;
            const baseMove = mediaOverride.motion || mediaOverride.movement || allowedMoves[moveIndex];

            narrativeTimeline.push({
                id: `${activeNarPoolName}_${imageIndex}`,
                poolName: activeNarPoolName,
                path: safeFilePath,
                baseFileName: baseFileName,
                z: activePoolZ,
                blend: activeNarPool.blend || activeNarPool.blendMode || 'normal',
                opacity: activeNarPool.opacity !== undefined ? activeNarPool.opacity : (activeNarPool.baseOpacity !== undefined ? activeNarPool.baseOpacity : 1.0),
                start: absStart,
                duration: actualDuration,
                animIn: mediaOverride.animIn || mediaOverride.entrance || activeNarPool.animIn || activeNarPool.defaultAppearance || "soft_fade",
                animOut: mediaOverride.animOut || mediaOverride.exit || activeNarPool.animOut || activeNarPool.defaultExit || null,
                motion: baseMove,
                isFirst: absStart === 0,
                isVideo: safeFilePath.toLowerCase().endsWith('.mp4'),
                fileObj: typeof fileObj === 'string' ? { path: fileObj } : fileObj,
                rawOverride: fileOverride || null,
                allowedLayers: allowedLayers || []
            });
        }

        currentTime += actualDuration;
        activeNarPool.currentIndex++;
    }
    
    return narrativeTimeline;
}