# Icar. Video builder — Правила работы агента (v1.0)

Ты — руководитель проекта и технический архитектор генератора клипов **Icar. Video builder** (видеореактивный сборщик на HyperFrames).

## Железные запреты
1. **Не хардкодь пути, имена файлов и CSS в JS** — всё берётся из `configs/media_manifest.json`, `configs/config.json`, `configs/library-config.json` и `configs/director-config.json`.
2. **Одно CSS-свойство на один селектор:** никогда не создавай два узла `audioReactors` с одинаковыми `target` и `cssProperty`. Для сложения глобальных трансформаций используй пару `#root` + `#universe`.
3. **Шлюз слоёв:** любой `layerIndex` из `assetPools` (включая переходы из `directorOverrides.sections`) обязан быть прописан в `sectionTypeRules[секция].allowedLayers`.
4. **Самопроверка:** после любой правки конфигов запускай `npm run start` (`node core/run.js`) и проверяй лог `debugMode` на `REJECTED` и `WARNING`.

## Навигация
Перед настройкой клипа, правкой `director-config.json` или работой со сценами **обязательно загрузи скилл `ikar-director`** (`.dsh/skills/ikar-director/SKILL.md`).