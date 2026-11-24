/**
 * Файл: run.js (или index.js)
 * Версия: 2.1.2 (Pipeline Orchestrator)
 * Описание: Главный запускальщик пайплайна генерации видео.
 * Последовательно выполняет сборку всех слоев (audio, beats, images, visuals и т.д.),
 * а затем вызывает CLI-рендер HyperFrames с фильтрацией логов.
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const configPath = path.join(rootDir, 'configs', 'config.json');

if (!fs.existsSync(configPath)) {
    console.error("❌ Ошибка: Файл config.json не найден в папке configs!");
    process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Имя версии можно передать одной строкой: npm start -- v0.11_что-изменилось
const versionArg = process.argv.slice(2).find(a => !a.startsWith('-'));
if (versionArg) {
    fs.writeFileSync(path.join(rootDir, 'VERSION.txt'), versionArg + '\n', 'utf8');
    console.log(`🏷️ Версия для коммита: ${versionArg}`);
}

const resW = config.project.resolution.width;
const resH = config.project.resolution.height;
const safeProjectName = config.project.name.replace(/[:\\/*?"<>|]/g, '-');

// Проверяем тестовый режим
const isTest = config.testMode && config.testMode.enabled;
const testStart = isTest ? config.testMode.start : 0;
const testDuration = isTest ? config.testMode.duration : config.project.totalDuration;

const outputFileName = isTest 
    ? `${safeProjectName}_TEST_${resW}x${resH}.mp4` 
    : `${safeProjectName}_${resW}x${resH}.mp4`; 

// Читаем настройки рендера
const hideDebugLogs = config.render?.hideDebugLogs !== false;
const renderQuality = config.render?.quality; 
const renderFps = config.render?.fps;       

// Модули сборки (выполняются строго по очереди)
const scripts = [
    path.join('core', 'build', 'audio.js'),
    path.join('core', 'build', 'beats.js'),     
    path.join('core', 'build', 'accents.js'),
    path.join('core', 'build', 'reactors.js'),   
    path.join('core', 'build', 'images.js'),    
    path.join('core', 'build', 'visuals.js'),   
    path.join('core', 'build', 'dust.js'),      
    path.join('core', 'build', 'subs.js'),
    path.join('core', 'build', 'info.js'),
    path.join('core', 'build', 'index.js')
];

function getTime() {
    return new Date().toLocaleTimeString();
}

async function runPipeline() {
    console.log(`[${getTime()}] 🚀 ЗАПУСК ПАЙПЛАЙНА ГЕНЕРАЦИИ ВИДЕО: "${config.project.name}" (${resW}x${resH})\n`);

    // Снимок версии в git ДО сборки: если рендер что-то испортит, откат есть.
    try {
        execSync('node tools/backup.js', { stdio: 'inherit', cwd: rootDir });
    } catch (e) {
        console.log('⚠️ Бэкап не сделан (git недоступен или ошибка) — продолжаю без снимка.');
    }

    try {
        // Шаг 1: Сборка всех слоев
        scripts.forEach(script => {
            const fullScriptPath = path.join(rootDir, script);
            if (fs.existsSync(fullScriptPath)) {
                console.log(`[${getTime()}] --- Выполняется ${script} ---`);
                // Важно: запускаем node относительно корня проекта
                execSync(`node ${script}`, { stdio: 'inherit', cwd: rootDir });
                console.log(""); 
            } else {
                console.log(`⚠️ Пропущен ${script} (файл не найден в папке core/build)\n`);
            }
        });

        console.log(`[${getTime()}] 🎬 ВСЕ СЦЕНЫ СОБРАНЫ. ЗАПУСКАЮ РЕНДЕР...`);
        
        // Шаг 2: Формируем динамический массив аргументов для hyperframes
        const renderArgs = ['hyperframes', 'render', '.'];
        
        if (renderQuality) {
            renderArgs.push('--quality', renderQuality);
            console.log(`✨ Качество рендера: ${renderQuality}`);
        }
        if (renderFps) {
            renderArgs.push('--fps', renderFps.toString());
            console.log(`🎥 Частота кадров: ${renderFps} FPS`);
        }
        
        if (isTest) {
            console.log(`🧪 ТЕСТОВЫЙ РЕЖИМ: Старт с ${testStart}s, Длительность ${testDuration}s`);
        }
        
        renderArgs.push('-o', outputFileName);

        console.log(`⏳ Идет рендер файла: "${outputFileName}". Технический мусор скрыт, ожидайте прогресс...\n`);
        
        // Шаг 3: Запускаем рендер асинхронно через spawn с перехватом потока
        await new Promise((resolve, reject) => {
            const renderProcess = spawn('npx', renderArgs, { shell: process.platform === 'win32', cwd: rootDir });

            const filterOutput = (data) => {
                const text = data.toString();
                
                if (hideDebugLogs) {
                    if (text.includes('[initSession') || 
                        text.includes('[BrowserManager]') || 
                        text.includes('[HyperFrames]') || 
                        text.includes('[WARN]') || 
                        text.includes('[INFO]') || 
                        text.includes('hyperframes]')) {
                        return; // Молча игнорируем технические логи
                    }
                }
                
                // Пропускаем чистый прогресс (FFmpeg) на экран
                process.stdout.write(text);
            };

            renderProcess.stdout.on('data', filterOutput);
            renderProcess.stderr.on('data', filterOutput);

            renderProcess.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Процесс завершился с кодом ${code}`));
            });
        });

        console.log(`\n[${getTime()}] ✅ УСПЕХ! Рендер завершен. Видео сохранено как: ${outputFileName}`);
    } catch (error) {
        console.error(`\n[${getTime()}] ❌ ПРОЦЕСС ПРЕРВАН ИЗ-ЗА ОШИБКИ:`);
        console.error(error.message);
    }
}

// Запускаем пайплайн
runPipeline();