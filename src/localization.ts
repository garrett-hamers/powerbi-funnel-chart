import { valueFormatter } from "powerbi-visuals-utils-formattingutils";

export interface Localizer {
  locale: string;
  direction: "ltr" | "rtl";
  text(key: string, fallback?: string): string;
  number(value: number | null, options?: Intl.NumberFormatOptions, format?: string): string;
  percent(value: number | null): string;
}

type Messages = Record<string, string>;

const translations: Record<string, Messages> = {
  en: {
    title: "Atlyn Funnel",
    stage: "Stage",
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
    missingStage: "Missing Stage field.",
    missingValue: "Missing Value measure.",
    inferredOrder: "Inferred order: model order is preserved.",
    duplicateOrder: "Duplicate StageOrder: model order breaks ties.",
    duplicateStage: "Duplicate stage label preserved.",
    missingOrder: "Missing StageOrder on one or more stages.",
    nonmonotonic: "Nonmonotonic values: a later stage increases.",
    blankValue: "Blank value",
    negativeValue: "Negative value: the funnel is not a conventional conversion sequence.",
    zeroBaseline: "Zero baseline: conversion ratios are unavailable.",
    stageLimit: "Stage limit reached: only the ordered window is shown.",
    partialData: "Partial data: conversion metrics describe the supplied segment only.",
    blank: "(Blank)",
    zero: "Zero",
    selected: "Selected",
    notAvailable: "Not available"
  },
  es: {
    title: "Atlyn Funnel",
    stage: "Etapa",
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
    noData: "Agregue campos Stage y Value para ver el embudo.",
    missingStage: "Falta el campo Stage.",
    missingValue: "Falta la medida Value.",
    inferredOrder: "Orden inferido: se conserva el orden del modelo.",
    duplicateOrder: "StageOrder duplicado: el orden del modelo resuelve los empates.",
    duplicateStage: "Etiqueta de etapa duplicada conservada.",
    missingOrder: "Falta StageOrder en una o más etapas.",
    nonmonotonic: "Valores no monótonos: una etapa posterior aumenta.",
    blankValue: "Valor en blanco.",
    negativeValue: "Valor negativo: no es una secuencia de conversión convencional.",
    zeroBaseline: "Base cero: las proporciones de conversión no están disponibles.",
    stageLimit: "Límite de etapas alcanzado: solo se muestra la ventana ordenada.",
    partialData: "Datos parciales: las métricas describen solo el segmento suministrado.",
    blank: "(En blanco)"
  },
  fr: {
    title: "Atlyn Funnel",
    stage: "Étape",
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
    noData: "Ajoutez les champs Stage et Value pour afficher l'entonnoir.",
    missingStage: "Le champ Stage est manquant.",
    missingValue: "La mesure Value est manquante.",
    inferredOrder: "Ordre déduit : l'ordre du modèle est conservé.",
    duplicateOrder: "StageOrder en double : l'ordre du modèle départage les égalités.",
    duplicateStage: "Libellé d'étape en double conservé.",
    missingOrder: "StageOrder manque pour une ou plusieurs étapes.",
    nonmonotonic: "Valeurs non monotones : une étape ultérieure augmente.",
    blankValue: "Valeur vide.",
    negativeValue: "Valeur négative : la séquence n'est pas une conversion conventionnelle.",
    zeroBaseline: "Base zéro : les ratios de conversion sont indisponibles.",
    stageLimit: "Limite d'étapes atteinte : seule la fenêtre ordonnée est affichée.",
    partialData: "Données partielles : les mesures décrivent uniquement le segment fourni.",
    blank: "(Vide)"
  },
  de: {
    title: "Atlyn Funnel",
    stage: "Stufe",
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
    noData: "Fügen Sie Stage- und Value-Felder hinzu.",
    missingStage: "Das Stage-Feld fehlt.",
    missingValue: "Das Value-Maß fehlt.",
    inferredOrder: "Abgeleitete Reihenfolge: Die Modellreihenfolge bleibt erhalten.",
    duplicateOrder: "Doppeltes StageOrder: Die Modellreihenfolge löst Gleichstände.",
    duplicateStage: "Doppelte Stufenbezeichnung beibehalten.",
    missingOrder: "StageOrder fehlt für mindestens eine Stufe.",
    nonmonotonic: "Nichtmonotone Werte: Eine spätere Stufe steigt.",
    blankValue: "Leerer Wert.",
    negativeValue: "Negativer Wert: kein konventioneller Konversionstrichter.",
    zeroBaseline: "Nullbasis: Konversionsverhältnisse sind nicht verfügbar.",
    stageLimit: "Stufenlimit erreicht: Nur das geordnete Fenster wird angezeigt.",
    partialData: "Unvollständige Daten: Die Metriken beschreiben nur das bereitgestellte Segment.",
    blank: "(Leer)"
  },
  ar: {
    title: "Atlyn Funnel",
    stage: "المرحلة",
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
    missingStage: "حقل Stage مفقود.",
    missingValue: "مقياس Value مفقود.",
    inferredOrder: "ترتيب مستنتج: تم الحفاظ على ترتيب النموذج.",
    duplicateOrder: "StageOrder مكرر: ترتيب النموذج يحسم التعادل.",
    duplicateStage: "تم الحفاظ على تسمية المرحلة المكررة.",
    missingOrder: "StageOrder مفقود لمرحلة واحدة أو أكثر.",
    nonmonotonic: "قيم غير رتيبة: مرحلة لاحقة تزداد.",
    blankValue: "قيمة فارغة.",
    negativeValue: "قيمة سالبة: هذا ليس مسار تحويل تقليديًا.",
    zeroBaseline: "خط أساس صفري: نسب التحويل غير متاحة.",
    stageLimit: "تم بلوغ حد المراحل: يتم عرض النافذة المرتبة فقط.",
    partialData: "بيانات جزئية: تصف المقاييس المقطع المقدم فقط.",
    blank: "(فارغ)",
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
    number: (value, options, format) =>
      value === null || !Number.isFinite(value)
        ? (messages.notAvailable ?? translations.en.notAvailable)
        : format
          ? valueFormatter.format(value, format, true, formatterLocale)
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
    case "missing-order":
      return "missingOrder";
    case "nonmonotonic":
      return "nonmonotonic";
    case "blank-value":
      return "blankValue";
    case "missing-stage":
      return "missingStage";
    case "missing-value":
      return "missingValue";
    case "negative-value":
      return "negativeValue";
    case "zero-baseline":
      return "zeroBaseline";
    case "stage-limit":
      return "stageLimit";
    case "partial-data":
      return "partialData";
    default:
      return "warning";
  }
};
