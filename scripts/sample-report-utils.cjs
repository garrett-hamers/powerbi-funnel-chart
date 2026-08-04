/*
 * Shared, dependency-free inspection of the offline sample report project so the
 * certification audit and the Jest suite enforce exactly the same invariants.
 */
const fs = require("node:fs");
const path = require("node:path");

const REQUIRED_ROLES = ["Stage", "Value"];

/* Connector functions that would make the sample report depend on something outside
 * the file. The sample must resolve entirely from inline M literals. */
const EXTERNAL_SOURCE_PATTERNS = [
  /\bAccessControlEntry\./,
  /\bAnalysisServices\./,
  /\bAzureStorage\./,
  /\bCsv\.Document\b/,
  /\bDatabricks\./,
  /\bDb2\./,
  /\bExcel\.(Workbook|CurrentWorkbook)\b/,
  /\bFile\.Contents\b/,
  /\bFolder\.(Files|Contents)\b/,
  /\bGoogleBigQuery\./,
  /\bHdInsight\./,
  /\bJson\.Document\b/,
  /\bMySQL\./,
  /\bOData\./,
  /\bOdbc\./,
  /\bOleDb\./,
  /\bOracle\./,
  /\bPostgreSQL\./,
  /\bSalesforce\./,
  /\bSharePoint\./,
  /\bSnowflake\./,
  /\bSql\.Database\b/,
  /\bSql\.Databases\b/,
  /\bTeradata\./,
  /\bWeb\.(Contents|Page|BrowserContents)\b/,
  /\bXml\.(Tables|Document)\b/,
  /https?:\/\//,
  /\\\\\\\\/
];

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const listFiles = (directory, prefix = "") =>
  fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => (left.name < right.name ? -1 : 1))
    .flatMap((entry) => {
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      return entry.isDirectory()
        ? listFiles(path.join(directory, entry.name), relative)
        : [relative];
    });

/*
 * Returns { issues, ... } instead of throwing so callers can report every problem at
 * once. An empty issues array means the project satisfies every checked invariant.
 */
const inspectProject = (projectDirectory, options, result) => {
  const issues = result.issues;
  const guid = options.guid;
  const version = options.version;
  const roles = new Set(options.dataRoles ?? []);

  if (!fs.existsSync(projectDirectory)) {
    issues.push(`sample report project is missing: ${projectDirectory}`);
    return result;
  }

  result.files = listFiles(projectDirectory);
  const pbipFile = result.files.find((file) => file.endsWith(".pbip") && !file.includes("/"));
  if (!pbipFile) {
    issues.push("sample report project must contain a .pbip entry point");
    return result;
  }
  const projectName = pbipFile.replace(/\.pbip$/, "");
  const reportFolder = `${projectName}.Report`;
  const modelFolder = `${projectName}.SemanticModel`;
  result.projectName = projectName;

  const required = [
    pbipFile,
    `${reportFolder}/definition.pbir`,
    `${reportFolder}/definition/version.json`,
    `${reportFolder}/definition/report.json`,
    `${reportFolder}/definition/pages/pages.json`,
    `${modelFolder}/definition.pbism`,
    `${modelFolder}/model.bim`
  ];
  if (guid) {
    required.push(
      `${reportFolder}/CustomVisuals/${guid}/package.json`,
      `${reportFolder}/CustomVisuals/${guid}/resources/${guid}.pbiviz.json`
    );
  }
  required.forEach((file) => {
    if (!result.files.includes(file)) {
      issues.push(`sample report is missing ${file}`);
    }
  });
  if (issues.length > 0) {
    return result;
  }

  const absolute = (relative) => path.join(projectDirectory, ...relative.split("/"));

  const pbir = readJson(absolute(`${reportFolder}/definition.pbir`));
  const modelPath = pbir.datasetReference?.byPath?.path;
  if (modelPath !== `../${modelFolder}`) {
    issues.push(`definition.pbir must reference ../${modelFolder} by path`);
  }
  if (pbir.datasetReference?.byConnection) {
    issues.push("definition.pbir must not use a byConnection dataset reference");
  }

  const report = readJson(absolute(`${reportFolder}/definition/report.json`));
  result.report = report;
  if (Array.isArray(report.publicCustomVisuals) && report.publicCustomVisuals.length > 0) {
    issues.push("report.json must not use publicCustomVisuals, which resolves from the AppSource store");
  }
  if (guid) {
    const customVisualPackage = (report.resourcePackages ?? []).find(
      (resourcePackage) => resourcePackage.type === "CustomVisual" && resourcePackage.name === guid
    );
    if (!customVisualPackage) {
      issues.push(`report.json must declare a CustomVisual resource package named ${guid}`);
    } else if (!customVisualPackage.items?.some(
      (item) => item.type === "CustomVisualMetadata" && item.path === `${guid}.pbiviz.json`
    )) {
      issues.push(`report.json CustomVisual package must point at ${guid}.pbiviz.json`);
    }
  }

  const pages = readJson(absolute(`${reportFolder}/definition/pages/pages.json`));
  const pagesPrefix = `${reportFolder}/definition/pages/`;
  const pageNames = result.files
    .filter((file) => file.startsWith(pagesPrefix) && file.endsWith("/page.json"))
    .map((file) => file.slice(pagesPrefix.length).split("/")[0]);
  result.pages = pageNames;
  if (pageNames.length === 0) {
    issues.push("sample report must contain at least one page");
  }
  pageNames.forEach((pageName) => {
    if (!(pages.pageOrder ?? []).includes(pageName)) {
      issues.push(`pages.json pageOrder is missing ${pageName}`);
    }
  });
  if (!pageNames.includes(pages.activePageName)) {
    issues.push("pages.json activePageName must reference a real page");
  }

  result.files
    .filter((file) => file.startsWith(`${reportFolder}/definition/pages/`) && file.endsWith("/visual.json"))
    .forEach((file) => {
      const visual = readJson(absolute(file));
      const declaredRoles = Object.keys(visual.visual?.query?.queryState ?? {});
      result.visuals.push({ path: file, visualType: visual.visual?.visualType, roles: declaredRoles });
      if (guid && visual.visual?.visualType !== guid) {
        issues.push(`${file} must bind visualType ${guid}`);
      }
      if (declaredRoles.length === 0) {
        issues.push(`${file} must bind at least one data role`);
      }
      declaredRoles.forEach((role) => {
        if (roles.size > 0 && !roles.has(role)) {
          issues.push(`${file} binds "${role}", which is not a capabilities.json data role`);
        }
      });
      REQUIRED_ROLES.forEach((role) => {
        if (!declaredRoles.includes(role)) {
          issues.push(`${file} must bind the required "${role}" role`);
        }
      });
      (Object.values(visual.visual?.query?.queryState ?? {})).forEach((state) => {
        if (!Array.isArray(state.projections) || state.projections.length === 0) {
          issues.push(`${file} has a data role with no projections`);
        }
      });
    });

  const model = readJson(absolute(`${modelFolder}/model.bim`));
  result.model = model;
  const tables = model.model?.tables ?? [];
  if (tables.length === 0) {
    issues.push("model.bim must define at least one table");
  }
  tables.forEach((table) => {
    (table.partitions ?? []).forEach((partition) => {
      if (partition.source?.type !== "m") {
        issues.push(`model.bim partition ${table.name} must use an inline M source`);
        return;
      }
      const expression = Array.isArray(partition.source.expression)
        ? partition.source.expression.join("\n")
        : String(partition.source.expression ?? "");
      if (!expression.includes("#table(")) {
        issues.push(`model.bim partition ${table.name} must build its rows from an inline #table literal`);
      }
      EXTERNAL_SOURCE_PATTERNS.forEach((pattern) => {
        if (pattern.test(expression)) {
          issues.push(`model.bim partition ${table.name} references an external data source (${pattern})`);
        }
      });
    });
  });
  if ((model.model?.dataSources ?? []).length > 0 || (model.model?.expressions ?? []).length > 0) {
    issues.push("model.bim must not declare shared data sources or parameters");
  }

  if (guid) {
    const embedded = readJson(absolute(`${reportFolder}/CustomVisuals/${guid}/package.json`));
    result.embeddedPackage = embedded;
    if (embedded.visual?.guid !== guid) {
      issues.push("the embedded custom visual package declares a different GUID");
    }
    if (version && embedded.visual?.version !== version) {
      issues.push(
        `the embedded custom visual is version ${embedded.visual?.version} but pbiviz.json declares ${version}; ` +
        "run `npm run sample-report` after packaging"
      );
    }
  }

  return result;
};

const inspectSampleReport = (projectDirectory, options = {}) => {
  const result = { issues: [], files: [], pages: [], visuals: [] };
  try {
    return inspectProject(projectDirectory, options, result);
  } catch (error) {
    result.issues.push(`sample report could not be inspected: ${error.message}`);
    return result;
  }
};

module.exports = { inspectSampleReport, EXTERNAL_SOURCE_PATTERNS, REQUIRED_ROLES };
