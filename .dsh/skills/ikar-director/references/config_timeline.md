# 🎬 Монтаж, слои и структура (`configs/director-config.json` v4.2.0)

## `layers` и `debugMode`
- `layers` — справочник, движком не исполняется.
- `debugMode` (`enabled: true`, `logPasses: true`) — выводит в консоль статус каждого слоя (`ACTIVE` / `REJECTED` / `WARNING`). Всегда проверяй лог после сборки.

## `songStructure` и `sectionTypeRules`
- `songStructure` задаёт старт секций в секундах (`time`, `name`, `type`). Длительность секции = разница до следующего `time`.
- `sectionTypeRules[type].allowedLayers` — **белый список `layerIndex`**. Если номер слоя из `assetPools` здесь не указан, движок его отклонит (`REJECTED`).
  - *Пример:* чтобы сменить декорации в 4-й секции, там открывают `[1, 14]`, отключая фоны `2, 3` и вуаль `25`.
  - *Критично:* если в `directorOverrides.sections` на секцию `"3"` повешен переход со слоем `30`, число `30` обязано быть в `allowedLayers` секции `"3"`.

## `layerBlendModes` и `overlays`
- `screen` для `host-visuals-bg`, `host-images`, `host-visuals-fg` — делает чёрный фон стоковых VFX прозрачным.
- `multiply` для `host-dust` — убирает белый фон текстур бумаги/шума.
- `overlays`: `shadowCrush` подключает стиль виньетки из `library-config.json`; `screenFlash: "none"` отключает белую вспышку, если цвет `#screen-flash-overlay` задаётся вручную в `audioReactors`.

## `directorOverrides`
Высший приоритет над Rhythm Magnet и общими настройками пулов.

- **`sections`** (ключ — `type` секции из `songStructure`, напр. `"3"`): накрывает эффектом все файлы внутри секции.
  - `effect`: `{ "name": "<имя_пула>", "offset": -1.5, "duration": 1.9, "loop": false }`
    - `name` — имя пула из `assetPools` (его `layerIndex` обязан быть в `allowedLayers` этой секции).
    - `offset` — сдвиг старта в секундах от начала секции (отрицательный накрывает стык).
    - `duration` — длительность показа эффекта.
    - `loop` — зацикливание.

- **`files`** (ключ — точное имя файла, напр. `"1-g11.mp4"`): точечное переопределение для конкретного кадра.
  - `media`: `{ "duration": 7.7, "movement": "<ключ>", "animIn": "<ключ>", "animOut": "<ключ>" }`
  - `effect`: `null` (принудительно отключает секционный эффект для этого файла) либо свой объект `{ name, offset, duration, loop }`.

## `assetPools`
4 класса (`class`) и их обязательные правила:
1. `narrative` (`layerIndex: 11..15`) — сюжет. `opacity: 1.0`, `motion` — массив строк.
2. `atmosphere` (`bg1: 2`, `bg2: 3`, `Sheer-veil: 25`) — `persistent: true`, `loop: true`. Порог `layerIndex = 20` делит слои на задний (`<20`) и передний (`>=20`) план.
3. `accent` — декор; отключается через `"enabled": false`.
4. `transition` (`Leafs-splash: 30`) — `persistent: false`, `loop: false`, `motion: ["none"]`, а `animIn` и `animOut` строго `"fade_in_base"` (обеспечивает корректное скрытие до старта и исчезновение после конца в HyperFrames).