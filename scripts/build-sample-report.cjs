/*
 * Generates the offline Power BI sample report project under samples/.
 *
 * A .pbix cannot be produced headlessly: its DataModel part is a binary Analysis
 * Services backup image. This script therefore emits a Power BI Project (PBIP) using
 * the documented PBIR report format and a TMSL semantic model, which Power BI Desktop
 * opens directly and can save as .pbix in one step.
 *
 * Everything is offline by construction:
 * - table data is inlined as M #table literals read from the tracked sample CSVs, so a
 *   refresh needs no credentials, no files, and no network;
 * - the visual is embedded from the built .pbiviz through resourcePackages rather than
 *   publicCustomVisuals, which would resolve the visual from the AppSource store.
 *
 * Output is deterministic: fixed names, fixed key order, two-space JSON, LF endings.
 */
const fs = require("node:fs");
const path = require("node:path");
const JSZip = require("jszip");

const root = path.resolve(__dirname, "..");
const projectName = "AtlynFunnelSample";
const projectRoot = path.join(root, "samples", "atlyn-funnel-sample");
const reportRoot = path.join(projectRoot, `${projectName}.Report`);
const modelRoot = path.join(projectRoot, `${projectName}.SemanticModel`);

const SCHEMA = {
  pbip: "https://developer.microsoft.com/json-schemas/fabric/pbip/pbipProperties/1.0.0/schema.json",
  pbir: "https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/2.0.0/schema.json",
  pbism: "https://developer.microsoft.com/json-schemas/fabric/item/semanticModel/definitionProperties/1.0.0/schema.json",
  version: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json",
  report: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/3.0.0/schema.json",
  pages: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json",
  page: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.0.0/schema.json",
  visual: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.7.0/schema.json"
};
const REPORT_DEFINITION_VERSION = "2.0.0";
const STAGES_TABLE = "Funnel stages";
const DIAGNOSTICS_TABLE = "Funnel diagnostics";
const PAGE_WIDTH = 1280;
const PAGE_HEIGHT = 720;

const fail = (message) => {
  process.stderr.write(`Sample report generation failed: ${message}\n`);
  process.exit(1);
};

const readJson = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));

const writeJson = (absolutePath, value) => {
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`.replace(/\r\n/g, "\n"));
};

const readCsv = (relativePath) => {
  const lines = fs.readFileSync(path.join(root, relativePath), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
};

const mText = (value) => `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '""')}"`;
const mNumber = (value) => (value === "" || value === undefined ? "null" : String(Number(value)));

/*
 * Builds an M expression whose only source is an inline #table literal. Nothing here
 * can reach a database, a file, or the network.
 */
const inlineTableExpression = (columns, rows) => [
  "let",
  "    Source = #table(",
  `        type table [${columns.map((column) => `#"${column.name}" = ${column.mType}`).join(", ")}],`,
  "        {",
  ...rows.map((row, index) => {
    const cells = columns.map((column) =>
      column.mType === "text" ? mText(row[column.name]) : mNumber(row[column.name])
    );
    return `            {${cells.join(", ")}}${index === rows.length - 1 ? "" : ","}`;
  }),
  "        }",
  "    )",
  "in",
  "    Source"
];

const tmslColumn = (name, dataType) => ({
  name,
  dataType,
  sourceColumn: name,
  summarizeBy: dataType === "int64" ? "sum" : "none",
  annotations: [{ name: "SummarizationSetBy", value: "Automatic" }]
});

const tmslTable = (name, columns, rows) => ({
  name,
  columns: columns.map((column) => tmslColumn(column.name, column.tmslType)),
  partitions: [
    {
      name,
      mode: "import",
      source: {
        type: "m",
        expression: inlineTableExpression(columns, rows)
      }
    }
  ],
  annotations: [{ name: "PBI_ResultType", value: "Table" }]
});

const columnProjection = (entity, property) => ({
  field: {
    Column: {
      Expression: { SourceRef: { Entity: entity } },
      Property: property
    }
  },
  queryRef: `${entity}.${property}`,
  nativeQueryRef: property
});

/* Aggregate function ids come from the published semanticQuery schema: 0 Sum, 1 Average,
 * 2 Distinct count, 3 Min, 4 Max, 5 CountNonNull, 6 Median, 7 StdDev, 8 Variance. */
const AGGREGATE = { sum: { id: 0, label: "Sum" }, min: { id: 3, label: "Min" } };

const aggregateProjection = (entity, property, aggregate) => ({
  field: {
    Aggregation: {
      Expression: {
        Column: {
          Expression: { SourceRef: { Entity: entity } },
          Property: property
        }
      },
      Function: aggregate.id
    }
  },
  queryRef: `${aggregate.label}(${entity}.${property})`,
  nativeQueryRef: `${aggregate.label} of ${property}`
});

const sumProjection = (entity, property) => aggregateProjection(entity, property, AGGREGATE.sum);

/* Stage order is aggregated with Min so that rolling several segment rows up into one
 * stage still yields the true ordinal rather than a multiplied sum. */
const minProjection = (entity, property) => aggregateProjection(entity, property, AGGREGATE.min);

const literal = (value) => ({ expr: { Literal: { Value: value } } });

const buildVisual = (guid, name, title, queryState) => ({
  $schema: SCHEMA.visual,
  name,
  position: {
    x: 16,
    y: 16,
    z: 0,
    height: PAGE_HEIGHT - 32,
    width: PAGE_WIDTH - 32,
    tabOrder: 0
  },
  visual: {
    visualType: guid,
    query: {
      queryState: Object.fromEntries(
        Object.entries(queryState).map(([role, projection]) => [role, { projections: [projection] }])
      )
    },
    visualContainerObjects: {
      title: [
        {
          properties: {
            show: literal("true"),
            text: literal(`'${title}'`)
          }
        }
      ]
    },
    drillFilterOtherVisuals: true
  }
});

const buildPage = (name, displayName) => ({
  $schema: SCHEMA.page,
  name,
  displayName,
  displayOption: "FitToPage",
  height: PAGE_HEIGHT,
  width: PAGE_WIDTH
});

const main = async () => {
  const pbiviz = readJson("pbiviz.json");
  const capabilities = readJson("capabilities.json");
  const guid = pbiviz.visual?.guid;
  const roles = new Set((capabilities.dataRoles ?? []).map((role) => role.name));
  if (!guid) {
    fail("pbiviz.json must declare visual.guid");
  }

  const packagePath = path.join(root, "dist", `${guid}.${pbiviz.visual.version}.pbiviz`);
  if (!fs.existsSync(packagePath)) {
    fail(`${path.relative(root, packagePath)} is missing; run \`npm run build\` then \`npm run package\` first`);
  }

  const stageRows = readCsv("assets/sample-data/atlyn-funnel-sample.csv");
  const diagnosticsRows = readCsv("assets/sample-data/atlyn-funnel-diagnostics-sample.csv");
  const stageColumns = [
    { name: "Stage", mType: "text", tmslType: "string" },
    { name: "StageOrder", mType: "Int64.Type", tmslType: "int64" },
    { name: "Segment", mType: "text", tmslType: "string" },
    { name: "Value", mType: "Int64.Type", tmslType: "int64" },
    { name: "Target", mType: "Int64.Type", tmslType: "int64" }
  ];
  const diagnosticsColumns = [
    { name: "Stage", mType: "text", tmslType: "string" },
    { name: "Value", mType: "Int64.Type", tmslType: "int64" }
  ];

  fs.rmSync(projectRoot, { recursive: true, force: true });

  writeJson(path.join(projectRoot, `${projectName}.pbip`), {
    $schema: SCHEMA.pbip,
    version: "1.0",
    artifacts: [{ report: { path: `${projectName}.Report` } }],
    settings: { enableAutoRecovery: true }
  });

  writeJson(path.join(modelRoot, "definition.pbism"), {
    $schema: SCHEMA.pbism,
    version: "1.0",
    settings: {}
  });

  writeJson(path.join(modelRoot, "model.bim"), {
    name: projectName,
    compatibilityLevel: 1550,
    model: {
      culture: "en-US",
      dataAccessOptions: {
        legacyRedirects: true,
        returnErrorValuesAsNull: true
      },
      defaultPowerBIDataSourceVersion: "powerBI_V3",
      sourceQueryCulture: "en-US",
      tables: [
        tmslTable(STAGES_TABLE, stageColumns, stageRows),
        tmslTable(DIAGNOSTICS_TABLE, diagnosticsColumns, diagnosticsRows)
      ],
      annotations: [
        { name: "PBI_QueryOrder", value: JSON.stringify([STAGES_TABLE, DIAGNOSTICS_TABLE]) },
        { name: "__PBI_TimeIntelligenceEnabled", value: "0" }
      ]
    }
  });

  writeJson(path.join(reportRoot, "definition.pbir"), {
    $schema: SCHEMA.pbir,
    version: "4.0",
    datasetReference: { byPath: { path: `../${projectName}.SemanticModel` } }
  });

  writeJson(path.join(reportRoot, "definition", "version.json"), {
    $schema: SCHEMA.version,
    version: REPORT_DEFINITION_VERSION
  });

  writeJson(path.join(reportRoot, "definition", "report.json"), {
    $schema: SCHEMA.report,
    themeCollection: {
      baseTheme: {
        name: "CY23SU04",
        reportVersionAtImport: { visual: "2.7.0", page: "2.0.0", report: "3.0.0" },
        type: "SharedResources"
      }
    },
    resourcePackages: [
      {
        name: guid,
        type: "CustomVisual",
        items: [
          {
            name: `${guid}.pbiviz.json`,
            path: `${guid}.pbiviz.json`,
            type: "CustomVisualMetadata"
          }
        ]
      }
    ],
    settings: {
      useStylableVisualContainerHeader: true,
      defaultDrillFilterOtherVisuals: true,
      useEnhancedTooltips: true
    }
  });

  const pages = [
    {
      name: "conversionFunnel",
      displayName: "Conversion funnel",
      visualName: "funnelOverview",
      title: "Conversion funnel",
      queryState: {
        Stage: columnProjection(STAGES_TABLE, "Stage"),
        Value: sumProjection(STAGES_TABLE, "Value"),
        StageOrder: minProjection(STAGES_TABLE, "StageOrder"),
        Target: sumProjection(STAGES_TABLE, "Target")
      }
    },
    {
      name: "segmentComparison",
      displayName: "Segment comparison",
      visualName: "funnelSegments",
      title: "Conversion funnel by segment",
      queryState: {
        Stage: columnProjection(STAGES_TABLE, "Stage"),
        Group: columnProjection(STAGES_TABLE, "Segment"),
        Value: sumProjection(STAGES_TABLE, "Value"),
        StageOrder: minProjection(STAGES_TABLE, "StageOrder"),
        Target: sumProjection(STAGES_TABLE, "Target")
      }
    },
    {
      name: "dataQuality",
      displayName: "Data quality",
      visualName: "funnelDiagnostics",
      title: "Funnel diagnostics",
      queryState: {
        Stage: columnProjection(DIAGNOSTICS_TABLE, "Stage"),
        Value: sumProjection(DIAGNOSTICS_TABLE, "Value")
      }
    }
  ];

  pages.forEach((page) => {
    Object.keys(page.queryState).forEach((role) => {
      if (!roles.has(role)) {
        fail(`page ${page.name} binds "${role}", which is not a capabilities.json data role`);
      }
    });
    writeJson(
      path.join(reportRoot, "definition", "pages", page.name, "page.json"),
      buildPage(page.name, page.displayName)
    );
    writeJson(
      path.join(reportRoot, "definition", "pages", page.name, "visuals", page.visualName, "visual.json"),
      buildVisual(guid, page.visualName, page.title, page.queryState)
    );
  });

  writeJson(path.join(reportRoot, "definition", "pages", "pages.json"), {
    $schema: SCHEMA.pages,
    pageOrder: pages.map((page) => page.name),
    activePageName: pages[0].name
  });

  const zip = await JSZip.loadAsync(fs.readFileSync(packagePath));
  const customVisualRoot = path.join(reportRoot, "CustomVisuals", guid);
  const entries = Object.keys(zip.files).filter((entry) => !zip.files[entry].dir).sort();
  const expected = ["package.json", `resources/${guid}.pbiviz.json`];
  expected.forEach((entry) => {
    if (!entries.includes(entry)) {
      fail(`the built package is missing ${entry}`);
    }
  });
  for (const entry of entries) {
    const contents = await zip.file(entry).async("nodebuffer");
    const target = path.join(customVisualRoot, ...entry.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }

  process.stdout.write(
    `Sample report written to ${path.relative(root, projectRoot).replace(/\\/g, "/")} ` +
    `(${pages.length} pages, ${stageRows.length + diagnosticsRows.length} inline rows, visual ${guid}).\n`
  );
};

main().catch((error) => fail(error.message));
