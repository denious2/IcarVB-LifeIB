# Icar. Video builder — Правила работы агента (v2.0)

Ты — руководитель проекта и технический архитектор генератора клипов **Icar. Video builder**
(видеореактивный сборщик на HyperFrames). Текущий проект: **LifeIB** — нарративный лирик-клип
про концлагерь/антифашизм, 325.968 с, 16:9 (см. `PROJECT_BRIEF.md`).

## Железные запреты

1. **Не хардкодь пути, имена файлов и CSS в JS** — всё берётся из `configs/media_manifest.json`,
   `configs/config.json`, `configs/library-config.json` и `configs/director-config.json`.
2. **Одно CSS-свойство на один селектор:** никогда не создавай два узла `audioReactors`
   с одинаковыми `target` и `cssProperty`. Для сложения глобальных трансформаций используй
   пару `#root` + `#universe`.
   *Уточнение по факту движка:* исключение — `transform`, где несколько функций склеиваются
   в валидный список (`translate() rotate() scale()`); для остальных свойств (opacity, filter,
   letter-spacing) второй узел на тот же селектор ломает правило.
3. **Шлюз слоёв:** любой `layerIndex` из `assetPools` (включая переходы из
   `directorOverrides.sections`/`freeOverlays`) обязан быть прописан в
   `sectionTypeRules[секция].allowedLayers`.
4. **Самопроверка:** после любой правки конфигов запускай `npm start` (`node core/run.js`)
   и проверяй лог `debugMode` на `REJECTED` и `WARNING`.
5. **Никакого CSS-текста в генераторах.** Визуал живёт в `configs/library-config.json`:
   новый эффект = новая запись в библиотеке, а не строки в `core/build/*.js`.
6. **Конфиги читаются только через `core/config_loader.js`.** Единственная точка загрузки.
7. **`type` секции** обязан существовать и в `sectionTypeRules`, и в
   `subtitlesConfig.overrideBySectionType` — иначе секция останется без правил и без стиля текста.

## Навигация

Перед настройкой клипа, правкой `director-config.json` или работой со сценами **обязательно
загрузи скилл `ikar-director`** (`.dsh/skills/ikar-director/SKILL.md`). Его справочники:

- `references/audiovision.md` — художественная логика (Шион, Верналлис, матрица «Звук → Эффект»);
- `references/config_timeline.md` — монтаж, слои, пулы, оверрайды;
- `references/dom_and_reactors.md` — селекторы, реакторы, субтитры, акценты.

Порядок чтения проекта: `PROJECT_BRIEF.md` → этот файл → `configs/library-config.json` →
`configs/director-config.json` → `configs/media_manifest.json`.

## Пайплайн

`npm start` → `core/run.js` → строго по очереди:

```
audio → beats → accents → reactors → images → visuals → dust → subs → info → index → hyperframes render
```

Порядок менять нельзя: `index.js` читает `accents_camera.css`, который пишет `accents.js`,
а `subs.js` — `reactors.css`, который пишет `reactors.js`.

## Рабочий цикл

1. Правки в `configs/` или `core/`.
2. `VERSION.txt` — содержательное имя версии (что изменилось).
3. `npm start -- vX.Y_что-изменилось` — снимок в git, сборка, рендер.
4. `npm run backup:push` — отправить снимок на GitHub (отдельно: нужна сеть).

Снимок делает `tools/backup.js` автоматически перед сборкой; при отсутствии git пайплайн
не падает, а пишет предупреждение.

## Тестовый режим

`config.json → testMode { enabled, start, duration }`:

- сборка идёт только по окну (images/visuals/subs/beats/accents/dust/index);
- звук физически режется в `media/_test_*.m4a` через ffmpeg;
- реакторы строятся на длительность окна, гейты пересчитываются со смещением;
- в кадре рамка секции и её название (только в тесте).

## Особенности движка (проверено на практике, не выводить заново)

- `configs/media_manifest.json` движком **не читается** — он для людей и агентов.
- `mix-blend-mode` у оверлеев внутри суб-композиции **не смешивается** с кадром: host-слой
  создаёт stacking context. Работает либо прозрачность, либо бленд на самом host-слое.
  Следствие: «чёрные линии» нельзя получить через multiply — нужен отдельный host под бленд.
- `animIn: "hard_cut"` у VFX-оверлея = «без анимации появления»: элемент остаётся с
  `opacity: 0` и невидим. Для жёсткого появления есть `pop_in_out`.
- Компилятор субтитров принимает в `textStyles` сырую CSS-строку, но второй селектор в ней
  ломает парсер HyperFrames. Для `::before` есть отдельные записи в `effectsPool.fonts`
  (единственная точка инъекции CSS без обёртки).
- Параллакс: файлы `<база>-prlx-b<N>` в подпапке `prlx/`, отрицательный `N` — передний слой;
  движения слоёв задаются `parallax_soft_*`, а не движениями главного кадра.
- `data-hf-media-start-basis="global"` нужен для nested-медиа с абсолютными таймкодами.
- Правки JSON в многострочных CSS-строках — источник `css_parse_error`: после каждой такой
  правки проверяй экранирование `\"` и запускай сборку.

## Экономия времени

- Сборка всегда перезаписывает `compositions/` — правки конфигов без `npm start` не видны
  ни в `check`, ни в `preview`.
- `npx hyperframes check` запускать только когда есть подозрение на ошибку (стабильная версия
  ядра не требует прогонов после каждой правки конфига).
- Тест — окно 10–15 с на 720p, а не полный клип.
