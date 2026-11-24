# ⚙️ DOM, субтитры и аудио-реактивность (Icar. Video builder v4.2.0)

## 1. Иерархия DOM и Z-Index (`index.html`)
Привязывай узлы `audioReactors` строго к этим селекторам.

| Селектор / ID | Z-Index | Назначение и ограничения |
| :--- | :---: | :--- |
| `#root` | — | Корень композиции (первый в `<body>`). Постоянная базовая тряска/зум под `--drums`/`--beat`. |
| `#universe` | — | Контейнер внутри `#root`. Для Time-Gated эффектов (Катарсис), чтобы складывать `transform` поверх `#root`. |
| `#host-audio` | `-1` | Скрытый аудио-контейнер (`audio_scene.html`). |
| `#host-visuals-bg` | `10` | Задние фоны и атмосферные подложки (`layerIndex < 20`). |
| `#host-images` | `20` | Сюжетный слой (`class: "narrative"`). |
| `#host-visuals-fg` | `30` | Передний план, вуали и переходы (`layerIndex >= 20`). |
| `#host-dust` / `.texture-wrapper` | `90` | Пыль, шум, плёночные дефекты (`dust_scene.html`). |
| `#host-beats` | `95` | Ритмические вспышки (`beats_scene.html`). |
| `#shadow-crush-overlay` | `9950` | Затемнение/виньетка. Базовый `opacity: 0`. |
| `#screen-flash-overlay` | `9960` | Вспышки/градиент. Базовый `opacity: 0`. |
| `#host-color-grade` | `9998` | Глобальный LUT поверх всего кадра. |
| `#host-accents` / `[id^='global-filter-']` | `9999` | Видео-акценты и секционные CSS-фильтры. |
| `#host-subs` | `10000` | Контейнер субтитров (всегда поверх всего). |

### Вложенные селекторы для `audioReactors`
- **Сюжет:** `.image-layer` (только фото/PNG!), `.video-layer` (только `.mp4`!). Для фото+видео вместе: `#host-images .visual-layer, #host-images .video-layer`. Для параллакса (`prlx/`): `.layer-bg`, `.layer-hero`, `.layer-fg`.
- **VFX (persistent: true):** `#host-vfx-<poolName>` (напр. `#host-vfx-bg1`, `#host-vfx-Sheer-veil`). Цепляет все отрезки пула сразу.
- **VFX (persistent: false / переходы):** `[id^='wrap-vfx-<poolName>']` (напр. `[id^='wrap-vfx-Leafs-splash']`). Обязательно префиксный селектор `^=`, т.к. движок добавляет `_local_1`, `_local_2`.
- **Субтитры:** `#host-subs`, `.subtitle-text-inline`, `.word`, `.char`.
- **Сигналы (CSS-переменные):** `var(--beat)`, `var(--bass)`, `var(--melody)`, `var(--drums)`, `var(--vocal)` (от `0` до `1`), а также `var(--gate, 0)` / `var(--gate-0, 0)` (только в узлах с `activeFrom` и `activeDuration`).

---

## 2. `subtitlesConfig` и кинетика букв
- `enabled`: вкл/выкл слоя `#host-subs`.
- `kinetic`: `true` разбивает каждую строку на `.word` (слова) и `.char` (буквы). При `false` рендерится целая строка `.subtitle-text-inline`, а реакторы на `.char` простаивают.
- `defaultStyle`, `defaultAnimIn`, `defaultAnimOut`: базовый шрифт/стиль и анимации входа/выхода из `library-config.json`.
- `accentWords` + `accentMotion`: массив ключевых слов и CSS-анимация их подсветки (работает даже при `kinetic: false`).
- `handDrawn`: `{ enabled, svgFilter, maxRotate, maxOffsetY }` — эффект рукописных чернил и живой разброс угла/высоты строк.
- `overrideBySectionType`: объект вида `{ "2": { ... } }` для переопределения стиля текста в конкретной секции.

**Воздействие на текст через `audioReactors`:**
- `#host-subs` — позиционирование всего блока (`transform: translateY(12vh)`).
- `.subtitle-text-inline` — межбуквенный интервал (`letter-spacing: calc(2px + var(--beat) * 8px)`), цвет (`color`), тень (`text-shadow`). Не вешать `transform`, если его уже двигают `defaultAnimIn`/`Out`.
- `.word` — воздействие на отдельные слова (при `kinetic: true`).
- `.char` — независимая физика каждой буквы (при `kinetic: true`): масштаб (`scale` от `--vocal`), вращение (`rotate` от `--melody`), сдвиг (`translate` от `--drums`/`--beat`), цвет (`color`).

---

## 3. Аудио-стемы (`beatsConfig`, `bass`, `melody`, `drums`, `vocal`)
Параметр `decay` задаёт скорость спада импульса:
- `beatsConfig` (`decay: 0.15`, `dynamics: "sharp"`, `intensity: 0.01`) — резкий удар под бочку; низкий `intensity` гасит встроенную заливку `#host-beats`, оставляя чистый сигнал `--beat`.
- `vocal` (`decay: 0.2`) — быстрый отклик на интонации.
- `bass`, `melody`, `drums` (`decay: 0.4`) — плавный инерционный хвост.

---

## 4. `audioReactors` (Универсальный CSS-композитор)
Компилируется в `compositions/reactors.css`. Формула всегда разбивается на массив `formulaParts: [{ "code": "...", "note": "..." }]` с пробелом в конце `code`, если CSS-функции идут подряд. **Запрещено дублировать пару `target + cssProperty` в двух узлах.**

Три типа узлов:
1. **Статические CSS-правки** (без переменных звука): цветокоррекция `[id^='wrap-vfx-Leafs-splash']` (`filter`), сдвиг `#host-subs` (`translateY(12vh)`), ось вращения `#host-vfx-bg1, #host-vfx-bg2` (`transform-origin: 50% 100%`), градиент `#screen-flash-overlay` (`background`).
2. **Time-Gated (Катарсис):** на `#universe` с полями `activeFrom` и `activeDuration`, используя `var(--gate, 0)` / `var(--gate-0, 0)` (напр. `sin`/`cos` джиттер и взрыв насыщенности).
3. **Постоянные аудио-реакции:** на `#root` (`scale(1.01 + ...)` — запас 1% обязателен, чтобы при сдвиге не вылезли чёрные края), `#host-vfx-Sheer-veil` (`translateY` от `--melody`, `brightness` от `--vocal`), `.video-layer` (пороговая вспышка `max(0, var(--vocal) - 0.7)`), `#shadow-crush-overlay` (`opacity` от `--beat`).

---

## 5. `accents` (Ручной триггерный канал / VJ-секвенсор)
Резервный режиссёрский инструмент для точечных «ручных» воздействий. В отличие от `audioReactors`, срабатывает строго в заданные таймкоды из кастомного файла `accents.json` (ручная разметка или уникальный выделенный стем).

**Когда использовать:**
- Для постоянной тряски и вспышек **всегда предпочитай `audioReactors`**.
- Включай `accents` только по прямому запросу режиссёра, когда есть кастомный `accents.json` и нужно:
  1. Сделать точечный удар/тряску камеры (`shakes`) в нестандартных местах трека.
  2. Нарезать **любой указанный `.mp4` файл** (глитч, футаж, крупные планы, «25-й кадр») на `slices` фрагментов и выстреливать их по паттерну `sequence` на `z-index: 9999` (`#host-accents`).

```json
"accents": {
  "enabled": false,
  "sourceFile": "accents.json",
  "shakes": {
    "enabled": false,
    "duration": 0.2,
    "pool": ["ключ_из_library.effectsPool.accent_movements"]
  },
  "videoGlitches": {
    "enabled": false,
    "file": "media/sfx/glitch.mp4",
    "duration": 0.15,
    "blendMode": "screen",
    "style": "ключ_из_library.effectsPool.accentStyles",
    "slices": 8,
    "sequence": [0, "none", 3, 5]
  }
}

- enabled — главный рубильник. При false скрипт accents.js пропускается и не создаёт accents_scene.html / accents_camera.css.

- sourceFile — JSON-файл с массивом таймкодов { "accents": [1.2, 4.5, ...] }.

- shakes — генерирует @keyframes masterAccentShake и вешает .global-shake-active на слои bg, images, fg, dust (шаги из library.effectsPool.accent_movements).

- videoGlitches — степ-секвенсор видео-вставок в #host-accents (z: 9999): file (путь к .mp4), duration (длина выстрела в сек.), slices (число равных кусков), sequence (порядок индексов от 0 до slices - 1, "none"/null — пропуск; пустой массив = по кругу), blendMode ("screen" для чёрного фона, "normal" для непрозрачных врезок), style (ключ CSS из library.effectsPool.accentStyles или "none").