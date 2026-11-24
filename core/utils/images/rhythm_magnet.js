/**
 * Файл: core/utils/images/rhythm_magnet.js
 * Версия: 3.1.0 (Unified Data Model - Override & Wall Magnet Fix)
 * Описание: Расчет длительности кадра на основе магнита ритма.
 * ИСПРАВЛЕНИЕ: 
 * 1. Ручной duration больше не сбрасывается Шагом 5 (учитывается hasCustomDuration).
 * 2. Магнит к стене (закрытие дыр в конце секции) перенесен ПОСЛЕ оверрайдов, чтобы не оставлять огрызков.
 * 3. Добавлен парсинг строковых чисел и защита от нулевых длительностей.
 */

// Вспомогательная функция для безопасного парсинга чисел и строк random(min, max)
function parseRandomStr(val, defaultVal) {
    if (typeof val === 'number' && !isNaN(val)) return val;
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed.startsWith('random(')) {
            const match = trimmed.match(/random\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
            if (match) {
                const min = parseFloat(match[1]);
                const max = parseFloat(match[2]);
                return min + Math.random() * (max - min);
            }
        }
        const parsed = parseFloat(trimmed);
        if (!isNaN(parsed)) return parsed;
    }
    return defaultVal;
}

export function calculateMagnetDuration(params) {
    const {
        absStart, currentBlockEnd, MAX_IMG_DURATION, MAX_VIDEO_DURATION,
        MIN_IMG_DURATION, subtitleStarts = [], beats = [], fileObj = {}, fileOverride = {}
    } = params;

    const timeToSectionEnd = Math.max(0, currentBlockEnd - absStart);
    if (timeToSectionEnd <= 0.001) return 0;

    const isVideo = typeof fileObj.realDuration === 'number' && fileObj.realDuration > 0;
    
    // >>> ЧИСТАЯ ИНКАПСУЛЯЦИЯ <<<
    // timeline_resolver.js уже очистил данные. Берем строго блок media.
    const mediaSettings = fileOverride?.media || {};
    
    const targetDurRaw = mediaSettings.duration;
    const hasCustomDuration = targetDurRaw !== undefined && targetDurRaw !== null;
    const playFull = Boolean(mediaSettings.playFull);
    const playToEnd = Boolean(mediaSettings.playToEnd);

    // 1. Базовые лимиты окна
    let effectiveMaxDuration = isVideo ? MAX_VIDEO_DURATION : MAX_IMG_DURATION;
    if (isVideo && !hasCustomDuration) {
        effectiveMaxDuration = Math.min(effectiveMaxDuration, fileObj.realDuration);
    }

    let maxAllowed = Math.min(effectiveMaxDuration, timeToSectionEnd);
    let minAllowed = Math.min(MIN_IMG_DURATION, maxAllowed);
    
    const windowStart = absStart + minAllowed;
    const windowEnd = absStart + maxAllowed;

    // 2. Магнит ритма (Ищем субтитры, затем биты)
    let rhythmDuration = maxAllowed;
    const subsInWindow = subtitleStarts.filter(t => t >= windowStart && t <= windowEnd);
    
    if (subsInWindow.length > 0) {
        rhythmDuration = Math.max(...subsInWindow) - absStart;
    } else {
        const beatsInWindow = beats.filter(b => b >= windowStart && b <= windowEnd);
        if (beatsInWindow.length > 0) {
            rhythmDuration = Math.max(...beatsInWindow) - absStart;
        }
    }

    let currentImgDuration = rhythmDuration;

    // 3. Применение жестких оверрайдов
    if (hasCustomDuration) {
        const safeDuration = parseRandomStr(targetDurRaw, currentImgDuration);
        currentImgDuration = Math.min(safeDuration, timeToSectionEnd);
    } else if (playFull && isVideo) {
        currentImgDuration = Math.min(fileObj.realDuration, timeToSectionEnd);
    } else if (playToEnd) {
        currentImgDuration = timeToSectionEnd;
    }

    // 4. Финальный защитный срез (запрет зацикливания коротких видео, если не задан ручной duration или playToEnd)
    if (isVideo && fileObj.realDuration < currentImgDuration && !playToEnd && !hasCustomDuration) {
        currentImgDuration = fileObj.realDuration;
    }

    // 5. Магнит к стене (закрытие узких дыр перед концом секции)
    // Выполняется в конце, но для обычных видео (без loop/override) не превышает их физическую длину
    const remainingGap = timeToSectionEnd - currentImgDuration;
    if (remainingGap > 0 && remainingGap < MIN_IMG_DURATION) {
        if (!isVideo || playToEnd || hasCustomDuration || fileObj.realDuration >= timeToSectionEnd) {
            currentImgDuration = timeToSectionEnd;
        }
    }

    return Math.max(0.05, currentImgDuration);
}