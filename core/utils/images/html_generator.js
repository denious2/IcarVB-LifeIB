/**
 * Файл: core/utils/images/html_generator.js
 * Версия: 4.3.1 (Pure Structural Templater + In-Root SVG Filters)
 * Описание: Шаблонизатор сцен. Поддерживает применение SVG-фильтров из library.json
 * на уровне пулов (фильтры монтируются внутри #root, чтобы не теряться при сборке в index.js).
 */

import fs from "fs";
import path from "path";

// Сборка слоев параллакса (-N .. fg .. +N) для сюжетных сцен
export function buildLayersStack(fileObj, file, activePool, isVideo, rootDir) {
  const layersToRender = [];
  let currentZIndex = 1;

  if (!isVideo) {
    const scenesPath = path.join(rootDir, activePool.path);
    const prlxDir = path.join(scenesPath, "prlx");

    if (fs.existsSync(prlxDir)) {
      const allPrlxFiles = fs.readdirSync(prlxDir);
      const prefix = `${fileObj.baseName}-prlx-b`;

      let bgLayers = [];
      let fgLayers = [];

      allPrlxFiles.forEach((f) => {
        if (f.startsWith(prefix)) {
          const numStr = f.slice(prefix.length, f.lastIndexOf("."));
          const n = parseInt(numStr, 10);

          if (!isNaN(n)) {
            if (n > 0)
              bgLayers.push({
                id: `b${n}`,
                path: `${activePool.path}/prlx/${f}`,
                n,
              });
            else if (n < 0)
              fgLayers.push({
                id: `b${n}`,
                path: `${activePool.path}/prlx/${f}`,
                n,
              });
          }
        }
      });

      bgLayers.sort((a, b) => b.n - a.n);
      bgLayers.forEach((layer) =>
        layersToRender.push({
          id: layer.id,
          path: layer.path,
          zIndex: currentZIndex++,
        }),
      );

      currentZIndex += 10;
      layersToRender.push({ id: "fg", path: file, zIndex: currentZIndex++ });

      currentZIndex += 10;
      fgLayers.sort((a, b) => b.n - a.n);
      fgLayers.forEach((layer) =>
        layersToRender.push({
          id: layer.id,
          path: layer.path,
          zIndex: currentZIndex++,
        }),
      );
    } else {
      layersToRender.push({ id: "fg", path: file, zIndex: currentZIndex });
    }
  } else {
    layersToRender.push({ id: "fg", path: file, zIndex: currentZIndex });
  }

  return layersToRender;
}

// Генерация HTML для сюжетного слоя
export function generateGroupHTML(params) {
  const { clip, layersToRender, OVERLAP, svgFilter } = params;

  const requiresFade =
    clip.animIn && clip.animIn !== "hard_cut" && clip.animIn !== "none";
  const actualOverlap = requiresFade ? OVERLAP : 0;

  let renderStart = clip.isFirst
    ? clip.start
    : Math.max(0, clip.start - actualOverlap);
  let renderDur = clip.isFirst ? clip.duration : clip.duration + actualOverlap;

  const durStr = renderDur.toFixed(3);
  const startStr = renderStart.toFixed(3);

  const activeSvgFilter = svgFilter || clip.svgFilter || "";
  const fadeCss =
    clip.isFirst || !requiresFade
      ? ""
      : `animation: wrapper_fade_in ${actualOverlap}s ease-out forwards;`;
  const filterCss = activeSvgFilter ? `filter: url(#${activeSvgFilter});` : "";
  const wrapperStyle = `${fadeCss} ${filterCss}`.trim();

  let groupHTML = `\n<div id="wrap-${clip.id}" class="anim-wrapper" style="${wrapperStyle}">\n`;

  layersToRender.forEach((layer) => {
    let depthClass = "layer-hero";
    let layerN = 0;

    if (layer.id !== "fg") {
      layerN = parseInt(layer.id.replace("b", ""), 10);
      if (!isNaN(layerN)) depthClass = layerN > 0 ? "layer-bg" : "layer-fg";
    }

    // Параллакс: слои глубины двигаются СВОИМИ слабыми движениями,
    // никогда не совпадая с движением основного кадра.
    let finalMove = clip.motion;
    if (layer.id !== "fg") {
      const parallaxMoves = ["parallax_soft_1", "parallax_soft_2", "parallax_soft_3"];
      const depth = !isNaN(layerN) ? layerN : 1;
      // bg1 -> 0, bg2 -> 1, bg3 -> 2 ; fg-1 -> 2, fg-2 -> 0, fg-3 -> 1
      const idx = depth > 0 ? (depth - 1) % parallaxMoves.length
                            : (Math.abs(depth) + 1) % parallaxMoves.length;
      finalMove = parallaxMoves[idx];
    }

    let animParts = [`${finalMove} ${durStr}s linear forwards`];

    let opacityCss = `opacity: var(--base-opacity);`;
    if (requiresFade && (clip.animIn || clip.animOut)) {
      if (clip.animIn)
        animParts.push(`${clip.animIn} ${durStr}s linear forwards`);
      if (clip.animOut)
        animParts.push(`${clip.animOut} ${durStr}s linear forwards`);
      if (!clip.isFirst) opacityCss = "opacity: 0;";
    }

    const animCss = `animation: ${animParts.join(", ")};`;
    const zIndexBase = clip.z * 1000;
    const finalZ = zIndexBase + layer.zIndex;

    if (layer.path.toLowerCase().endsWith(".mp4")) {
      groupHTML += `    <video id="vid-${clip.id}-${layer.id}" src="../${layer.path}" class="video-layer clip ${depthClass}" data-in="0" data-out="${durStr}" data-start="${startStr}" data-hf-media-start-basis="global" data-duration="${durStr}" data-track-index="${finalZ}" style="z-index: ${layer.zIndex}; mix-blend-mode: ${clip.blend}; --base-opacity: ${clip.opacity}; ${opacityCss} ${animCss}" autoplay muted playsinline></video>\n`;
    } else {
      groupHTML += `    <div id="img-${clip.id}-${layer.id}" class="image-layer clip ${depthClass}" data-in="0" data-out="${durStr}" data-start="${startStr}" data-duration="${durStr}" data-track-index="${finalZ}" style="z-index: ${layer.zIndex}; background-image: url('../${layer.path}'); mix-blend-mode: ${clip.blend}; --base-opacity: ${clip.opacity}; ${opacityCss} ${animCss}"></div>\n`;
    }
  });

  groupHTML += `</div>`;
  return groupHTML;
}

// Генерация HTML для визуальных эффектов (VFX, Глитчи, Атмосфера)
export function generateVisualGroupHTML(clip) {
  const durStr = clip.duration.toFixed(3);
  const startStr = clip.start.toFixed(3);

  // ---------------------------------------------------------
  // АРХИТЕКТУРА PERSISTENT: Отрезки фонов, привязанные к таймлайну
  // ---------------------------------------------------------
  if (clip.isPersistent) {
    const wrapperId = `host-vfx-${clip.poolName}`;
    const mediaId = `vid-vfx-${clip.id}`;

    let motionName = "none";
    if (Array.isArray(clip.motion)) {
      motionName = clip.motion.length > 0 ? clip.motion[0] : "none";
    } else if (typeof clip.motion === "string") {
      motionName = clip.motion;
    }

    const motionCss =
      motionName && motionName !== "none"
        ? `animation: ${motionName} ${durStr}s linear forwards;`
        : "";

    let mediaTag = "";
    if (clip.path.toLowerCase().endsWith(".mp4")) {
      mediaTag = `<video id="${mediaId}" src="../${clip.path}" class="persistent-asset video-asset-layer clip" data-in="0" data-out="${durStr}" data-start="${startStr}" data-hf-media-start-basis="global" data-duration="${durStr}" data-track-index="${clip.z}" style="opacity: 1; ${motionCss}" autoplay muted loop playsinline></video>`;
    } else {
      mediaTag = `<div id="${mediaId}" class="persistent-asset visual-layer clip" data-in="0" data-out="${durStr}" data-start="${startStr}" data-duration="${durStr}" style="background-image: url('../${clip.path}'); opacity: 1; ${motionCss}"></div>`;
    }

    return `\n<div id="${wrapperId}" class="anim-wrapper" style="z-index: ${clip.z}; mix-blend-mode: ${clip.blend}; opacity: ${clip.opacity};">\n    ${mediaTag}\n</div>`;
  }

  // ---------------------------------------------------------
  // СТАНДАРТНАЯ ОБРАБОТКА (Дискретные слои, глитчи, нарезка)
  // ---------------------------------------------------------
  const wrapperId = `wrap-vfx-${clip.id}`;
  const mediaId = `vid-vfx-${clip.id}`;
  const isStrobe = clip.id.includes("strobe");

  let motionName = "none";
  if (Array.isArray(clip.motion)) {
    motionName = clip.motion.length > 0 ? clip.motion[0] : "none";
  } else if (typeof clip.motion === "string") {
    motionName = clip.motion;
  }

  let animParts = [];
  if (motionName && motionName !== "none") {
    animParts.push(`${motionName} ${durStr}s linear forwards`);
  }

  if (!isStrobe) {
    if (clip.animIn && clip.animIn !== "hard_cut")
      animParts.push(`${clip.animIn} ${durStr}s linear forwards`);
    if (clip.animOut)
      animParts.push(`${clip.animOut} ${durStr}s linear forwards`);
  }

  animParts.push(`engine_kill_switch 0.01s ${durStr}s linear forwards`);
  const animCss = `animation: ${animParts.join(", ")};`;

  let mediaTag = "";

  let mediaStartAttr = 'data-in="0"';
  if (
    clip.mediaStartOffsetRatio !== null &&
    clip.mediaStartOffsetRatio !== undefined
  ) {
    mediaStartAttr = `data-in="0" data-media-start-ratio="${clip.mediaStartOffsetRatio}"`;
  }

  const initialOpacity = isStrobe ? 1 : 0;

  if (clip.path.toLowerCase().endsWith(".mp4")) {
    mediaTag = `<video id="${mediaId}" src="../${clip.path}" class="video-asset-layer clip" ${mediaStartAttr} data-out="${durStr}" data-start="${startStr}" data-hf-media-start-basis="global" data-duration="${durStr}" data-track-index="${clip.z}" style="z-index: ${clip.z}; mix-blend-mode: ${clip.blend}; opacity: ${initialOpacity}; ${animCss}" autoplay muted loop playsinline></video>`;
  } else {
    mediaTag = `<div id="${mediaId}" class="visual-layer clip" data-in="0" data-out="${durStr}" data-start="${startStr}" data-duration="${durStr}" data-track-index="${clip.z}" style="z-index: ${clip.z}; background-image: url('../${clip.path}'); mix-blend-mode: ${clip.blend}; opacity: ${initialOpacity}; ${animCss}"></div>`;
  }

  return `\n<div id="${wrapperId}" class="anim-wrapper" style="opacity: ${clip.opacity};">${mediaTag}</div>`;
}

// СОХРАНЕНИЕ КОМПОЗИЦИИ (С инжектом SVG-фильтров внутрь #root)
export function saveComposition(
  compDir,
  styleBlock,
  imagesHTML,
  compositionId,
  resolution,
  totalDuration,
  config = {},
  svgFiltersHTML = "",
) {
  if (!fs.existsSync(compDir)) fs.mkdirSync(compDir, { recursive: true });

  const htmlOutput = `<!DOCTYPE html>
<html>
<head>
${styleBlock}
</head>
<body>
    <div id="root" data-composition-id="${compositionId}" data-width="${resolution.width}" data-height="${resolution.height}" data-duration="${totalDuration}">
${svgFiltersHTML}
${imagesHTML}
    </div>
    <script>
        window.__timelines = window.__timelines || {};
        window.__timelines["${compositionId}"] = document.querySelector('#root');
    </script>
</body>
</html>`;

  fs.writeFileSync(
    path.join(compDir, `${compositionId}.html`),
    htmlOutput,
    "utf8",
  );
}
