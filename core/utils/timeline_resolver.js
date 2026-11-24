/**
 * Файл: core/utils/timeline_resolver.js
 * Версия: 3.5.0 (Strict AllowedLayers Filtering for Persistent Layers)
 * Описание: Центральный координатор сборки таймлайна. Persistent-слои физически фильтруются по allowedLayers секций.
 */

import path from 'path';
import { buildNarrativePass } from './resolver/pass_narrative.js';
import { buildGlobalVfxPass } from './resolver/pass_global_vfx.js';
import { buildLocalVfxPass } from './resolver/pass_local_vfx.js';
import { buildFreeVfxPass } from './resolver/pass_free_vfx.js';

export function resolveTimeline(params) {
    const {
        config = {}, director = {}, mediaManifest = {}, narrativePools = {}, allVfxPools = {},
        beats, subtitleStarts, totalDuration, testMode
    } = params;

    const structure = (director.songStructure || config.songStructure || []).sort((a, b) => a.time - b.time);
    const sectionRulesMap = director.sectionTypeRules || config.sectionTypeRules || {};
    
    const limits = {
        MAX_IMG_DURATION: config.effects?.imageDuration || 6.0,
        MAX_VIDEO_DURATION: config.effects?.videoDuration || (config.effects?.imageDuration || 6.0),
        MIN_IMG_DURATION: 2.5
    };

    const initializedVfxPools = {};
    for (const [pName, pObj] of Object.entries(allVfxPools || {})) {
        initializedVfxPools[pName] = { ...pObj, currentIndex: 0 };
        
        if (!initializedVfxPools[pName].files || initializedVfxPools[pName].files.length === 0) {
            if (initializedVfxPools[pName].path) {
                initializedVfxPools[pName].files = [{ path: initializedVfxPools[pName].path, file: path.basename(initializedVfxPools[pName].path) }];
            }
        }
    }

    const context = {
        structure, 
        sectionRulesMap, 
        limits, 
        totalDuration, 
        testMode,
        beats, 
        subtitleStarts, 
        mediaManifest, 
        directorOverrides: director.directorOverrides || {},
        initializedVfxPools,
        narrativePools,
        config: { 
            ...config, 
            debugMode: director.debugMode || config.debugMode 
        },
        director
    };

    const narrativeTimeline = buildNarrativePass(context);
    const globalVfxTimeline = buildGlobalVfxPass(context);
    const localVfxTimeline = buildLocalVfxPass(context, narrativeTimeline);
    const freeVfxTimeline = buildFreeVfxPass(context);

    // ПАС 6: Непрерывные (Persistent) слои с физическим пропуском запрещенных секций
    const persistentTimeline = [];
    for (const [poolName, vfxState] of Object.entries(initializedVfxPools)) {
        if (vfxState.persistent) {
            const rawZ = vfxState.z !== undefined ? vfxState.z : vfxState.layerIndex;
            const poolZ = typeof rawZ === 'string' ? parseInt(rawZ, 10) : (rawZ !== undefined ? rawZ : -1);
            
            const rawMotion = vfxState.motion;
            const resolvedMotion = Array.isArray(rawMotion) ? (rawMotion[0] || "none") : (rawMotion || "none");
            
            const safePath = (vfxState.files && vfxState.files.length > 0) 
                ? (vfxState.files[0].path || vfxState.files[0].file) 
                : (vfxState.path || "");

            // Пробегаем по секциям и создаем клипы только там, где слой разрешен
            for (let i = 0; i < structure.length; i++) {
                const currentBlock = structure[i];
                const blockStart = currentBlock.time;
                const blockEnd = (i < structure.length - 1) ? structure[i + 1].time : totalDuration;
                if (blockEnd <= blockStart) continue;

                const rules = sectionRulesMap[currentBlock.type] || {};
                const secAllowedLayers = rules.allowedLayers || [];
                const isVisible = secAllowedLayers.includes(poolZ);
                
                if (isVisible) {
                    persistentTimeline.push({
                        id: `persistent_${poolName}_sec_${i}`,
                        poolName: poolName,
                        path: safePath,
                        z: poolZ,
                        blend: vfxState.blend || vfxState.blendMode || 'screen',
                        opacity: vfxState.opacity !== undefined ? vfxState.opacity : 1,
                        start: blockStart,
                        duration: blockEnd - blockStart,
                        motion: resolvedMotion,
                        isPersistent: true,
                        visibilityMap: null
                    });
                }
            }
        }
    }

    const vfxTimeline = [...persistentTimeline, ...globalVfxTimeline, ...localVfxTimeline, ...freeVfxTimeline];

    return { narrativeTimeline, vfxTimeline };
}