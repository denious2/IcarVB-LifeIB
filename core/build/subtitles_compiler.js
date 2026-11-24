/**
 * Файл: core/build/subtitles_compiler.js
 * Версия: 3.8.1 (Pure Data-Driven, No !important on Animatable Props)
 * Описание: Умный компилятор стилей и шрифтов для субтитров из library.json.
 *           Очищен от хардкодных цветов и блокирующих !important для корректной работы анимаций.
 */

import fs from 'fs';
import path from 'path';

export function compileSubtitlesStyles(library) {
    let css = "/* === COMPILED SUBTITLES & FONTS === */\n\n";

    // Умный поиск: ищем шрифты в корне или в effectsPool
    const fonts = library?.fonts || library?.effectsPool?.fonts || {};
    for (const [fontName, fontFaceRule] of Object.entries(fonts)) {
        css += `${fontFaceRule}\n`;
    }
    css += "\n";

    // Умный поиск стилей текста
    const textStyles = library?.textStyles || library?.effectsPool?.textStyles || {};
    
    for (const [styleKey, styleData] of Object.entries(textStyles)) {
        css += `.sub-style-${styleKey} {\n`;
        
        // Защита от легаси: если стиль передан сырой строкой
        if (typeof styleData === 'string') {
            css += `    ${styleData}\n}\n\n`;
            continue;
        }
        
        // Базовые шрифтовые настройки (!important допустим, чтобы перебить сброс стилей браузера)
        const fontFamily = styleData.font || 'Jura';
        css += `    font-family: '${fontFamily}', sans-serif !important;\n`;
        css += `    font-size: ${styleData.fontSize || '68px'} !important;\n`;
        css += `    font-weight: ${styleData.fontWeight || 'normal'} !important;\n`;
        
        // АНИМИРУЕМЫЕ СВОЙСТВА (СТРОГО БЕЗ !IMPORTANT)
        if (styleData.color) css += `    color: ${styleData.color};\n`;
        if (styleData.opacity !== undefined) css += `    opacity: ${styleData.opacity};\n`;
        if (styleData.letterSpacing) css += `    letter-spacing: ${styleData.letterSpacing};\n`;
        
        const stroke = styleData.stroke;
        if (stroke && stroke.width && stroke.width !== '0px') {
            const w = stroke.width;
            const c = stroke.color || '#000000';
            css += `    -webkit-text-stroke: ${w} ${c};\n`;
            css += `    text-shadow: -${w} -${w} 0 ${c}, ${w} -${w} 0 ${c}, -${w} ${w} 0 ${c}, ${w} ${w} 0 ${c};\n`;
        }

        const box = styleData.box;
        if (box && box.enabled) {
            if (box.backgroundColor) css += `    background-color: ${box.backgroundColor};\n`;
            if (box.padding) css += `    padding: ${box.padding};\n`;
            if (box.borderRadius) css += `    border-radius: ${box.borderRadius};\n`;
            css += `    -webkit-box-decoration-break: clone;\n`;
            css += `    box-decoration-break: clone;\n`;
        } else {
            css += `    background-color: transparent;\n`;
        }

        css += `    margin: 0.5em 0;\n`;
        css += `    line-height: 1.4;\n`;
        css += `}\n\n`;
    }

    return css;
}