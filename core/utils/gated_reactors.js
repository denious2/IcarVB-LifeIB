/**
 * Файл: core/utils/gated_reactors.js
 * Версия: 4.3.0 (HyperFrames Compliant: @property + #root timeline)
 * Описание: Компилятор аудио-реакторов с поддержкой Time-Gates.
 * Регистрирует --gate-X через @property (<number>) и вешает анимацию гейтов
 * на #root, чтобы HyperFrames корректно скрабил их по кадрам.
 */

export function compileGatedReactors(reactorsConfig, duration, isTest, testStart, debugConfig) {
    let audioReactorsCSS = "/* --- AUDIO REACTORS & GATES --- */\n";
    let gateProperties = "";
    let gateKeyframes = "";
    let rootAnimations = [];

    if (!reactorsConfig || !reactorsConfig.enabled || !reactorsConfig.nodes) {
        return { audioReactorsCSS: "", globalGatesCss: "" };
    }

    reactorsConfig.nodes.forEach((node, idx) => {
        if (!node.target || !node.cssProperty || !node.formulaParts) return;

        let formula = node.formulaParts.map(p => p.code).join('');
        
        if (node.activeFrom !== undefined && node.activeDuration !== undefined) {
            let relativeStart = isTest ? (node.activeFrom - testStart) : node.activeFrom;
            let relativeEnd = isTest ? (node.activeFrom + node.activeDuration - testStart) : (node.activeFrom + node.activeDuration);
            
            relativeStart = Math.max(0, Math.min(relativeStart, duration));
            relativeEnd = Math.max(0, Math.min(relativeEnd, duration));

            if (relativeStart >= duration || relativeEnd <= 0 || relativeStart === relativeEnd) {
                formula = formula.replace(/var\(--gate\)/g, "0");
            } else {
                const gateName = `--gate-${idx}`;
                const animName = `gate_anim_${idx}`;
                
                const startPct = ((relativeStart / duration) * 100).toFixed(4);
                const endPct = ((relativeEnd / duration) * 100).toFixed(4);
                
                // Обязательная регистрация CSS-переменной как числа для работы в calc()
                gateProperties += `        @property ${gateName} { syntax: '<number>'; inherits: true; initial-value: 0; }\n`;
                
                gateKeyframes += `
        @keyframes ${animName} {
            0%, ${startPct}% { ${gateName}: 0; }
            ${(parseFloat(startPct) + 0.0001).toFixed(4)}%, ${endPct}% { ${gateName}: 1; }
            ${(parseFloat(endPct) + 0.0001).toFixed(4)}%, 100% { ${gateName}: 0; }
        }\n`;
                rootAnimations.push(`${animName} ${duration}s linear forwards`);
                
                formula = formula.replace(/var\(--gate\)/g, `var(${gateName}, 0)`);
                
                if (debugConfig?.enabled && debugConfig?.logPasses) {
                    console.log(`[DEBUG INSPECTOR] 🕒 [Gated Reactor: ${node.name}] ➔ Активен с ${relativeStart}s по ${relativeEnd}s (${gateName})`);
                }
            }
        } else {
            formula = formula.replace(/var\(--gate\)/g, "1");
        }
        
        audioReactorsCSS += `        ${node.target} { ${node.cssProperty}: ${formula}; }\n`;
    });

    let globalGatesCss = "";
    if (rootAnimations.length > 0) {
        globalGatesCss = `
        /* ГЛОБАЛЬНЫЕ ТАЙМ-ГЕЙТЫ (Внутри таймлайна #root) */
${gateProperties}
${gateKeyframes}
        #root { animation: ${rootAnimations.join(', ')}; }
`;
    }

    return { audioReactorsCSS, globalGatesCss };
}