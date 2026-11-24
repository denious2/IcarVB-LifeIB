import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { loadConfigs } from '../config_loader.js';

try {
    console.log("=== СТАРТ ГЕНЕРАЦИИ AUDIO_SCENE.HTML ===");
    const rootDir = process.cwd();
    const { config } = loadConfigs(rootDir);
    
    const isTest = config.testMode && config.testMode.enabled;
    const duration = isTest ? config.testMode.duration : config.project.totalDuration;
    const testStart = isTest ? config.testMode.start : 0;
    
    const compDir = path.join(rootDir, 'compositions');
    if (!fs.existsSync(compDir)) fs.mkdirSync(compDir, { recursive: true });

    // БЕРЕМ ПУТЬ СТРОГО ИЗ КОНФИГА
    const audioFileRel = config.media?.audioFile; 
    let audioFile = '';

    if (audioFileRel) {
        const absoluteAudioPath = path.join(rootDir, audioFileRel);
        if (fs.existsSync(absoluteAudioPath)) {
            // Преобразуем путь для HTML (учитывая, что html лежит в папке compositions/)
            audioFile = `../${audioFileRel.replace(/\\/g, '/')}`;
            console.log(`🎵 Выбран основной трек из конфига: ${audioFileRel}`);
        } else {
            console.warn(`⚠️ ВНИМАНИЕ: Файл ${audioFileRel}, указанный в config.json, не существует на диске!`);
        }
    } else {
        console.warn("⚠️ ВНИМАНИЕ: В config.json не заполнен параметр media.audioFile!");
    }

    let dataIn = isTest ? testStart : 0;
    let audioSrc = audioFile;

    // В тестовом режиме режем звук физически: иначе в бандл уходит весь трек,
    // и "быстрый тест" всё равно качает 6+ МБ.
    if (isTest && audioFile) {
        const outName = `_test_${Math.round(testStart)}_${Math.round(duration)}.m4a`;
        const outAbs = path.join(rootDir, 'media', outName);
        try {
            execFileSync(ffmpegPath, [
                '-y',
                '-ss', String(testStart),
                '-t', String(duration),
                '-i', path.join(rootDir, audioFileRel),
                '-vn',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-movflags', '+faststart',
                outAbs
            ], { stdio: 'ignore' });
            audioSrc = `../media/${outName}`;
            dataIn = 0;
            const kb = Math.round(fs.statSync(outAbs).size / 1024);
            console.log(`✂️ Тестовый фрагмент звука: media/${outName} (${kb} KB, ${duration}s с ${testStart}s)`);
        } catch (e) {
            console.warn(`⚠️ Не удалось нарезать звук (${e.message}). Использую полный файл со смещением.`);
        }
    }

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { margin: 0; background: transparent; overflow: hidden; }
        #root { position: absolute; width: 100%; height: 100%; }
        #main-audio { position: absolute; width: 0; height: 0; opacity: 0; pointer-events: none; }
    </style>
</head>
<body>
    <div id="root" data-composition-id="audio_scene">
        ${audioSrc
            ? `<audio id="main-audio" class="clip" src="${audioSrc}" data-in="${dataIn}" data-out="${dataIn + duration}" data-start="0" data-duration="${duration}"></audio>` 
            : ``
        }
    </div>
    <script>
        window.__timelines = window.__timelines || {};
        window.__timelines["audio_scene"] = document.querySelector('#root');
    </script>
</body>
</html>`;

    const outputPath = path.join(compDir, 'audio_scene.html');
    fs.writeFileSync(outputPath, html, 'utf8');
    
    console.log(`✅ audio_scene.html сгенерирован (Смещение: ${dataIn}s)`);
} catch (e) {
    console.error("❌ Ошибка в audio.js:", e.message);
    process.exit(1);
}