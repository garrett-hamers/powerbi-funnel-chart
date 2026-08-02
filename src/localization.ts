export interface Localizer {
  locale: string;
  direction: "ltr" | "rtl";
  text(key: string, fallback?: string): string;
  number(value: number | null, options?: Intl.NumberFormatOptions): string;
  percent(value: number | null): string;
}

type Messages = Record<string, string>;

const translations: Record<string, Messages> = {
  en: {
    value: "Value",
    overallConversion: "Overall conversion",
    stageConversion: "Stage conversion",
    dropRate: "Drop rate",
    absoluteLoss: "Absolute loss",
    target: "Target",
    group: "Group",
    warning: "Warning",
    tableLabel: "Accessible funnel metrics",
    stageListLabel: "Funnel stages",
    noData: "Add Stage and Value fields to view the funnel.",
    inferredOrder: "Inferred order: model order is preserved.",
    duplicateOrder: "Duplicate StageOrder: model order breaks ties.",
    duplicateStage: "Duplicate stage label preserved.",
    nonmonotonic: "Nonmonotonic values: a later stage increases.",
    blankValue: "Blank value",
    zero: "Zero",
    selected: "Selected",
    notAvailable: "Not available"
  },
  es: {
    value: "Valor",
    overallConversion: "Conversión total",
    stageConversion: "Conversión de etapa",
    dropRate: "Tasa de abandono",
    absoluteLoss: "Pérdida absoluta",
    target: "Objetivo",
    group: "Grupo",
    warning: "Advertencia",
    tableLabel: "Métricas de embudo accesibles",
    stageListLabel: "Etapas del embudo",
    noData: "Agregue campos Stage y Value para ver el embudo."
  },
  fr: {
    value: "Valeur",
    overallConversion: "Conversion globale",
    stageConversion: "Conversion de l'étape",
    dropRate: "Taux d'abandon",
    absoluteLoss: "Perte absolue",
    target: "Cible",
    group: "Groupe",
    warning: "Avertissement",
    tableLabel: "Mesures de l'entonnoir accessibles",
    stageListLabel: "Étapes de l'entonnoir",
    noData: "Ajoutez les champs Stage et Value pour afficher l'entonnoir."
  },
  de: {
    value: "Wert",
    overallConversion: "Gesamtkonversion",
    stageConversion: "Stufenkonversion",
    dropRate: "Abbruchrate",
    absoluteLoss: "Absoluter Verlust",
    target: "Ziel",
    group: "Gruppe",
    warning: "Warnung",
    tableLabel: "Barrierefreie Trichtermetriken",
    stageListLabel: "Trichterstufen",
    noData: "Fügen Sie Stage- und Value-Felder hinzu."
  },
  ar: {
    value: "القيمة",
    overallConversion: "التحويل الإجمالي",
    stageConversion: "تحويل المرحلة",
    dropRate: "معدل الانخفاض",
    absoluteLoss: "الخسارة المطلقة",
    target: "الهدف",
    group: "المجموعة",
    warning: "تحذير",
    tableLabel: "مقاييس مسار التحويل الميسّرة",
    stageListLabel: "مراحل مسار التحويل",
    noData: "أضف حقلي Stage وValue لعرض المسار.",
    notAvailable: "غير متاح"
  }
};

const rtlLocales = /^(ar|fa|he|ur)(-|$)/i;

export const createLocalizer = (requestedLocale?: string): Localizer => {
  const locale = requestedLocale || "en-US";
  const language = locale.toLowerCase().split("-")[0];
  const messages = translations[language] ?? translations.en;
  const formatterLocale = locale || "en-US";
  return {
    locale,
    direction: rtlLocales.test(locale) ? "rtl" : "ltr",
    text: (key, fallback) => messages[key] ?? translations.en[key] ?? fallback ?? key,
    number: (value, options) =>
      value === null || !Number.isFinite(value)
        ? (messages.notAvailable ?? translations.en.notAvailable)
        : new Intl.NumberFormat(formatterLocale, options).format(value),
    percent: (value) =>
      value === null || !Number.isFinite(value)
        ? (messages.notAvailable ?? translations.en.notAvailable)
        : new Intl.NumberFormat(formatterLocale, { style: "percent", maximumFractionDigits: 1 }).format(value)
  };
};

export const warningTextKey = (code: string): string => {
  switch (code) {
    case "inferred-order":
      return "inferredOrder";
    case "duplicate-order":
      return "duplicateOrder";
    case "duplicate-stage":
      return "duplicateStage";
    case "nonmonotonic":
      return "nonmonotonic";
    case "blank-value":
      return "blankValue";
    default:
      return "warning";
  }
};
