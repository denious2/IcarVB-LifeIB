/**
 * Файл: core/utils/resolver/debug_inspector.js
 * Описание: Инспектор пайплайна для отладки слоев, эффектов и причин их отклонения.
 */

export function logDebugReport(sectionName, timeRange, allowedLayers, poolName, poolZ, status, reason = "") {
    const icons = {
        ACTIVE: "✅",
        REJECTED: "❌",
        WARNING: "⚠️"
    };

    const icon = icons[status] || "ℹ️";
    console.log(`[DEBUG INSPECTOR] ${icon} [Секция: ${sectionName} (${timeRange})] Пул '${poolName}' (Слой Z:${poolZ}) | Разрешено: [${allowedLayers.join(', ')}] ➔ Статус: ${status} ${reason ? `(${reason})` : ''}`);
}