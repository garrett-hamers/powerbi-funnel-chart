/*
 * Generates a fully offline harness page that renders the built Atlyn Funnel bundle
 * inside a mock Power BI host. The bundle JS and CSS are inlined, so the page makes
 * no network requests of any kind.
 *
 * Power BI renders custom visuals inside a shadow root, which is why src/style.css
 * declares its design tokens on :host. The harness reproduces that by attaching a
 * shadow root and mounting the visual inside it.
 *
 * By default the harness loads the bytes that ship inside dist/*.pbiviz. Pass
 * `{ source: "dist" }` to load the raw webpack output instead.
 */
const fs = require("node:fs");
const path = require("node:path");
const { readPackagedBundle } = require("./packaged-bundle.cjs");

const root = path.resolve(__dirname, "..");
const distDirectory = path.join(root, "dist");
const bundlePath = path.join(distDirectory, "visual.js");
const stylePath = path.join(distDirectory, "visual.css");
const scenarioPath = path.join(root, "assets", "sample-data", "screenshot-scenarios.json");

const readScenarios = () => {
  const parsed = JSON.parse(fs.readFileSync(scenarioPath, "utf8"));
  if (!Array.isArray(parsed.scenarios) || parsed.scenarios.length === 0) {
    throw new Error("screenshot-scenarios.json must declare at least one scenario");
  }
  return parsed;
};

const readDistBundle = () => {
  if (!fs.existsSync(bundlePath) || !fs.existsSync(stylePath)) {
    throw new Error("dist/visual.js and dist/visual.css are missing; run `npm run build` first");
  }
  const js = fs.readFileSync(bundlePath, "utf8");
  const css = fs.readFileSync(stylePath, "utf8");
  return {
    js,
    css,
    source: "dist",
    guid: "atlynFunnelA1B2C3D4",
    packageName: "dist/visual.js",
    jsBytes: Buffer.byteLength(js, "utf8"),
    cssBytes: Buffer.byteLength(css, "utf8")
  };
};

const readBundle = async (source = "packaged") => {
  if (source === "dist") {
    return readDistBundle();
  }
  const packaged = await readPackagedBundle();
  return { ...packaged, source: "packaged" };
};

const embed = (value) =>
  JSON.stringify(value).replace(/</g, "\\u003c").replace(/-->/g, "--\\u003e");

const bootstrap = `
(function () {
  var scenario = window.__ATLYN_SCENARIO__;
  var viewport = window.__ATLYN_VIEWPORT__;
  var visualCss = window.__ATLYN_CSS__;
  var identity = function (prefix, values) {
    return values.map(function (value, index) {
      return { key: prefix + ":" + index + ":" + String(value) };
    });
  };
  var categories = [{
    source: { displayName: "Stage", queryName: "Funnel.Stage", roles: { Stage: true } },
    values: scenario.stage,
    identity: identity("stage", scenario.stage)
  }];
  if (scenario.group) {
    categories.push({
      source: { displayName: "Segment", queryName: "Funnel.Segment", roles: { Group: true } },
      values: scenario.group,
      identity: identity("group", scenario.group)
    });
  }
  var values = [{
    source: { displayName: "Value", queryName: "Funnel.Value", roles: { Value: true } },
    values: scenario.value
  }];
  if (scenario.highlights) {
    values[0].highlights = scenario.highlights;
  }
  if (scenario.stageOrder) {
    values.push({
      source: { displayName: "Stage order", queryName: "Funnel.StageOrder", roles: { StageOrder: true } },
      values: scenario.stageOrder
    });
  }
  if (scenario.target) {
    values.push({
      source: { displayName: "Target", queryName: "Funnel.Target", roles: { Target: true } },
      values: scenario.target
    });
  }
  var dataView = {
    metadata: { columns: [] },
    categorical: { categories: categories, values: values }
  };

  var noop = function () { return undefined; };
  var selectionCounter = 0;
  var mockHost = {
    locale: scenario.locale || "en-US",
    hostCapabilities: { allowInteractions: true },
    colorPalette: {
      isHighContrast: Boolean(scenario.highContrast),
      foreground: { value: scenario.highContrast ? "#ffffff" : "#172033" },
      background: { value: scenario.highContrast ? "#000000" : "#ffffff" }
    },
    createSelectionManager: function () {
      return {
        select: noop,
        clear: noop,
        showContextMenu: noop,
        registerOnSelectCallback: noop,
        getSelectionIds: function () { return []; },
        hasSelection: function () { return false; }
      };
    },
    createSelectionIdBuilder: function () {
      var builder = {
        withCategory: function () { return builder; },
        withSeries: function () { return builder; },
        withMeasure: function () { return builder; },
        createSelectionId: function () {
          selectionCounter += 1;
          return { key: "selection-" + selectionCounter };
        }
      };
      return builder;
    },
    createLocalizationManager: function () {
      return { getDisplayName: function (key) { return key; } };
    },
    tooltipService: {
      enabled: function () { return true; },
      show: noop,
      move: noop,
      hide: noop
    },
    eventService: {
      renderingStarted: noop,
      renderingFinished: function () {
        document.documentElement.setAttribute("data-atlyn-render", "ready");
      },
      renderingFailed: function (_options, reason) {
        document.documentElement.setAttribute("data-atlyn-render", "failed");
        document.documentElement.setAttribute("data-atlyn-error", String(reason));
      }
    }
  };

  var container = document.getElementById("atlyn-visual-host");
  var visualSize = scenario.visual || viewport;
  container.style.width = visualSize.width + "px";
  container.style.height = visualSize.height + "px";
  var shadow = container.attachShadow({ mode: "open" });
  var style = document.createElement("style");
  style.textContent = visualCss;
  shadow.appendChild(style);
  var mount = document.createElement("div");
  mount.style.width = "100%";
  mount.style.height = "100%";
  shadow.appendChild(mount);

  var construct = function (options) {
    var plugins = window.powerbi && window.powerbi.visuals && window.powerbi.visuals.plugins;
    var plugin = plugins && plugins[window.__ATLYN_GUID__];
    if (plugin && typeof plugin.create === "function") {
      return plugin.create(options);
    }
    return new AtlynFunnel.Visual(options);
  };

  try {
    var visual = construct({ element: mount, host: mockHost });
    var updateOptions = {
      dataViews: [dataView],
      viewport: { width: visualSize.width, height: visualSize.height },
      type: 62,
      operationKind: 0,
      jsonFilters: [],
      viewMode: 0,
      editMode: 0,
      isInFocus: false
    };
    visual.update(updateOptions);
    window.__ATLYN_HARNESS__ = {
      container: container,
      shadow: shadow,
      mount: mount,
      visual: visual,
      host: mockHost,
      scenario: scenario,
      dataView: dataView,
      viewport: visualSize,
      update: function (overrides) {
        var next = {};
        Object.keys(updateOptions).forEach(function (key) { next[key] = updateOptions[key]; });
        Object.keys(overrides || {}).forEach(function (key) { next[key] = overrides[key]; });
        visual.update(next);
      }
    };
  } catch (error) {
    document.documentElement.setAttribute("data-atlyn-render", "failed");
    document.documentElement.setAttribute("data-atlyn-error", String(error && error.message));
  }
})();
`;

const buildHarnessHtml = (scenario, viewport, bundle, options = {}) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<title>Atlyn Funnel screenshot harness - ${scenario.id}</title>
<style>
html, body {
  align-items: center;
  background: ${options.bare ? "#ffffff" : "#eef1f6"};
  display: flex;
  height: ${viewport.height}px;
  justify-content: center;
  margin: 0;
  overflow: hidden;
  padding: 0;
  width: ${viewport.width}px;
}
#atlyn-visual-host {
  background: #ffffff;
${options.bare ? "" : `  border: 1px solid #d5dce7;
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(23, 32, 51, 0.08);
`}  /*
   * content-box so the inline width/height below describe the space Power BI hands
   * the visual. With border-box the decorative border would eat two pixels and every
   * measurement would be two pixels short of the real tile.
   */
  box-sizing: content-box;
  overflow: hidden;
}
</style>
</head>
<body>
<div id="atlyn-visual-host"></div>
<script>
window.powerbi = {
  VisualDataChangeOperationKind: { Create: 0, Append: 1, Segment: 2 },
  VisualUpdateType: { Data: 2, Resize: 4, ViewMode: 8, Style: 16, ResizeEnd: 32, All: 62 },
  VisualEnumerationInstanceKinds: { Constant: 1, ConstantOrRule: 5, Rule: 4 },
  visuals: {
    FormattingComponent: {
      ColorPicker: "ColorPicker",
      ToggleSwitch: "ToggleSwitch",
      NumUpDown: "NumUpDown",
      Slider: "Slider",
      TextInput: "TextInput",
      Dropdown: "Dropdown"
    }
  }
};
window.__ATLYN_GUID__ = ${embed(options.guid ?? "atlynFunnelA1B2C3D4")};
window.__ATLYN_SCENARIO__ = ${embed(scenario)};
window.__ATLYN_VIEWPORT__ = ${embed(viewport)};
window.__ATLYN_CSS__ = ${embed(bundle.css)};
</script>
<script>
${bundle.js}
</script>
<script>
${bootstrap}
</script>
${options.extraScript ? `<script>\n${options.extraScript}\n</script>` : ""}
</body>
</html>
`;

const writeHarnessPages = async (outputDirectory, options = {}) => {
  const declared = readScenarios();
  const scenarios = options.scenarios ?? declared.scenarios;
  const defaultViewport = options.viewport ?? declared.viewport;
  const bundle = await readBundle(options.source);
  fs.mkdirSync(outputDirectory, { recursive: true });
  return scenarios.map((scenario) => {
    const pageViewport = scenario.page ?? defaultViewport;
    const htmlPath = path.join(outputDirectory, `${scenario.id}.html`);
    fs.writeFileSync(
      htmlPath,
      buildHarnessHtml(scenario, pageViewport, bundle, {
        extraScript: options.extraScript,
        bare: options.bare,
        guid: bundle.guid
      })
    );
    return { id: scenario.id, title: scenario.title, htmlPath, viewport: pageViewport, bundle };
  });
};

module.exports = { readScenarios, readBundle, buildHarnessHtml, writeHarnessPages, scenarioPath };

if (require.main === module) {
  const outputDirectory = path.join(root, ".tmp", "screenshots");
  writeHarnessPages(outputDirectory)
    .then((pages) => {
      pages.forEach((page) => {
        process.stdout.write(`Harness written: ${path.relative(root, page.htmlPath)}\n`);
      });
    })
    .catch((error) => {
      process.stderr.write(`Harness generation failed: ${error.message}\n`);
      process.exit(1);
    });
}
