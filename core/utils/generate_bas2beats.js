import fs from 'fs';
import path from 'path';
import { AudioContext } from 'web-audio-api';
import MusicTempo from 'music-tempo';
import { loadConfigs } from '../config_loader.js';

const rootDir = process.cwd();
const bassPath = path.join(rootDir, 'bass.json');
const beatsPath = path.join(rootDir, 'beats.json');

try {
    const bassData = JSON.parse(fs.readFileSync(bassPath, 'utf8'));
    const fps = bassData.fps || 30;
    const frames = bassData.frames;

    // 1. Извлекаем путь к треку из конфигов
    const { config } = loadConfigs(rootDir);
    const audioRelPath = config.project?.audioFile || 'media/sg-shrz421-11.mp3';
    const audioPath = path.join(rootDir, audioRelPath);

    if (!fs.existsSync(audioPath)) {
        throw new Error(`Аудиофайл не найден по пути: ${audioPath}`);
    }

    console.log(`🎵 Извлечение реального BPM из файла: [${path.basename(audioPath)}]...`);
    
    const audioData = fs.readFileSync(audioPath);
    const context = new AudioContext();

    // 2. Декодируем аудио и считаем реальный темп
    context.decodeAudioData(audioData, (buffer) => {
        let PACEMAKER_BPM = 90; // Резервный фолбэк на крайний случай
        let channelData = buffer.getChannelData(0);
        
        try {
            console.log("⏳ Анализ транзиентов для вычисления базового темпа...");
            let mt = new MusicTempo(channelData);
            PACEMAKER_BPM = Math.round(mt.tempo);
            console.log(`🎯 РЕАЛЬНЫЙ ТЕМП ТРЕКА успешно определен: ${PACEMAKER_BPM} BPM`);
        } catch (err) {
            console.log(`⚠️ В треке слишком мало транзиентов ("${err.message || err}"). Использую резервный эмбиент-темп: ${PACEMAKER_BPM} BPM`);
        }

        // --- НАСТРОЙКИ ЕСТЕСТВЕННОГО БАСА ---
        const THRESHOLD = 0.03; 
        const COOLDOWN_SEC = 0.4; 
        
        // --- ДИНАМИЧЕСКИЙ КАРДИОСТИМУЛЯТОР ---
        const FILLER_INTERVAL = 60 / PACEMAKER_BPM; 
        const MAX_ALLOWED_GAP = 1.5; 

        let rawBeats = [];
        let lastBeatTime = -COOLDOWN_SEC;

        console.log(`📊 Анализирую басовую линию (кадров: ${frames.length})...`);

        // ШАГ 3: Ищем естественные пики баса
        for (let i = 1; i < frames.length - 1; i++) {
            const val = frames[i];
            const time = i / fps;

            if (val > THRESHOLD && val >= frames[i - 1] && val >= frames[i + 1]) {
                if (time - lastBeatTime >= COOLDOWN_SEC) {
                    rawBeats.push(time);
                    lastBeatTime = time;
                }
            }
        }

        const totalDuration = frames.length / fps;
        rawBeats.push(totalDuration);

        // ШАГ 4: Заполняем ямы ритмом по реальному BPM
        const finalBeats = [];
        let previousTime = 0;

        for (let i = 0; i < rawBeats.length; i++) {
            const currentTime = rawBeats[i];
            
            if (currentTime - previousTime > MAX_ALLOWED_GAP) {
                let fillerTime = previousTime + FILLER_INTERVAL;
                while (fillerTime < currentTime - (FILLER_INTERVAL * 0.8)) { 
                    finalBeats.push(parseFloat(fillerTime.toFixed(3)));
                    fillerTime += FILLER_INTERVAL;
                }
            }
            
            finalBeats.push(parseFloat(currentTime.toFixed(3)));
            previousTime = currentTime;
        }

        finalBeats.pop();

        const output = {
            bpm: PACEMAKER_BPM,
            sourceFile: path.basename(audioPath),
            beats: finalBeats
        };

        fs.writeFileSync(beatsPath, JSON.stringify(output, null, 2));
        console.log(`✅ УСПЕХ! Извлечено ${rawBeats.length - 1} естественных пиков.`);
        console.log(`💉 Кардиостимулятор заполнил ямы реальным ритмом ${PACEMAKER_BPM} BPM (шаг ${FILLER_INTERVAL.toFixed(2)}с).`);
        console.log(`🔥 Итого триггеров: ${finalBeats.length}. Результат сохранен в beats.json`);
        
        process.exit(0);

    }, (err) => {
        console.error(`❌ Ошибка декодирования аудио: ${err}`);
        process.exit(1);
    });

} catch (e) {
    console.error("❌ Системная ошибка:", e.message);
    process.exit(1);
}