---
name: ikar-director
description: Режиссура, аудиовизуальная хореография (Audio-Vision) и сборка клипов в Ikar Engine через director-config.json и HyperFrames.
whenToUse: Использовать при создании нового клипа, настройке director-config.json, добавлении переходов, аудио-реакторов, субтитров или отладке сборки Ikar Engine.
---

# Icar. Video builder — Рабочий цикл руководителя проекта (v1.0)

## Справочники (читай по мере задачи)
- **Художественная логика (Мишель Шион, Верналлис, Эйзенштейн/Мёрч, 7 объектов, матрица Звук → Эффект):** `references/audiovision.md`
- **Монтаж и слои (`songStructure`, `allowedLayers`, `assetPools`, `directorOverrides`):** `references/config_timeline.md`
- **DOM и реактивность (селекторы, `audioReactors`, субтитры, `accents`):** `references/dom_and_reactors.md`

## Алгоритм работы с проектом
Не пиши финальный JSON вслепую — иди строго по 4 шагам:

### Шаг 1. Инспекция рабочей области
1. Прочитай `PROJECT_BRIEF.md` (если файла нет — запроси у режиссёра идею, настроение и референсы).
2. Если `configs/media_manifest.json` устарел или отсутствует — запусти `npm run scan-media`.
3. Прочитай `configs/media_manifest.json`, `configs/library-config.json` и текущий `configs/director-config.json`.

### Шаг 2. План и согласование
1. Прочитай `references/audiovision.md`.
2. Предложи режиссёру:
   - разбивку `songStructure` по секундам (с опорой на субтитры и длительность трека);
   - какие фоны, вуали и переходы работают в каждой секции;
   - аудиовизуальную карту (какой стем `--beat / --drums / --bass / --melody / --vocal / --gate` на какой слой воздействует).
3. Если не хватает ассетов в `configs/media_manifest.json` — напиши конкретные промпты для их генерации.
4. **Дождись подтверждения режиссёра.**

### Шаг 3. Сборка конфигов
1. Прочитай `references/config_timeline.md` и `references/dom_and_reactors.md`.
2. Обнови `configs/director-config.json` (и `configs/config.json`, если изменились `totalDuration` или пути медиа).
3. Проверь перед сохранением:
   - нет дублей пары `target + cssProperty` в `audioReactors`;
   - все `formulaParts` разбиты на `{ "code": "...", "note": "..." }` с пробелами между CSS-функциями;
   - для `.mp4`-сцен используется `.video-layer` (а не только `.image-layer`);
   - для дискретных переходов (`transition`) указаны `animIn: "fade_in_base"`, `animOut: "fade_in_base"` и открыт их `layerIndex` в `allowedLayers`.

### Шаг 4. Сборка и верификация
1. Запусти `npm run start`.
2. Проанализируй консольный вывод `debugMode`: убедись, что нет неожиданных `REJECTED` и ошибок синтаксиса.
3. При необходимости проверь сгенерированные файлы в `compositions/visuals_fg_scene.html` и `compositions/reactors.css`.
4. Кратко отчитайся о результате и назови таймкоды ключевых точек для просмотра.