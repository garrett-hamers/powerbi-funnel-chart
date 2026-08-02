import powerbi from "powerbi-visuals-api";
import { DataViewLike } from "./model";
import { Localizer } from "./localization";

export interface FunnelSettings {
  dataPointFill: string;
  labelsShow: boolean;
}

export const DEFAULT_FUNNEL_SETTINGS: FunnelSettings = {
  dataPointFill: "#2563eb",
  labelsShow: true
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readFillColor = (value: unknown): string | undefined => {
  if (!isRecord(value) || !isRecord(value.solid)) {
    return undefined;
  }
  const color = value.solid.color;
  return typeof color === "string" && /^#[0-9a-f]{3,8}$/i.test(color.trim())
    ? color.trim()
    : undefined;
};

export const readFunnelSettings = (dataView: DataViewLike | undefined): FunnelSettings => {
  const objects = dataView?.metadata?.objects;
  const persistedFill = readFillColor(objects?.dataPoint?.fill);
  const persistedLabels = objects?.labels?.show;
  return {
    dataPointFill: persistedFill ?? DEFAULT_FUNNEL_SETTINGS.dataPointFill,
    labelsShow: typeof persistedLabels === "boolean" ? persistedLabels : DEFAULT_FUNNEL_SETTINGS.labelsShow
  };
};

export interface FormattingLocalization {
  displayName: (key: string, fallback: string) => string;
}

export const createFormattingModel = (
  settings: FunnelSettings,
  localizer: Localizer,
  localization: FormattingLocalization
): powerbi.visuals.FormattingModel => {
  const text = (key: string, fallback: string): string =>
    localization.displayName(key, localizer.text(key, fallback));
  const dataPointDescriptor = {
    objectName: "dataPoint",
    propertyName: "fill"
  };
  const labelsDescriptor = {
    objectName: "labels",
    propertyName: "show"
  };

  return {
    cards: [
      {
        uid: "atlynFunnel_format_card",
        displayName: text("FormatCard_DisplayNameKey", "Funnel"),
        description: text("FormatCard_DescriptionKey", "Configure the funnel appearance."),
        groups: [
          {
            uid: "atlynFunnel_dataPoint_group",
            displayName: text("Object_DataPoint_DisplayNameKey", "Data points"),
            slices: [
              {
                uid: "atlynFunnel_dataPoint_fill",
                displayName: text("Property_DataPointFill_DisplayNameKey", "Fill"),
                description: text("Property_DataPointFill_DescriptionKey", "Color used for positive data points."),
                control: {
                  type: powerbi.visuals.FormattingComponent.ColorPicker,
                  properties: {
                    descriptor: dataPointDescriptor,
                    value: { value: settings.dataPointFill }
                  }
                }
              }
            ]
          },
          {
            uid: "atlynFunnel_labels_group",
            displayName: text("Object_Labels_DisplayNameKey", "Labels"),
            slices: [
              {
                uid: "atlynFunnel_labels_show",
                displayName: text("Property_LabelsShow_DisplayNameKey", "Show chart labels"),
                description: text("Property_LabelsShow_DescriptionKey", "Show stage labels and values on the chart."),
                control: {
                  type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                  properties: {
                    descriptor: labelsDescriptor,
                    value: settings.labelsShow
                  }
                }
              }
            ]
          }
        ],
        revertToDefaultDescriptors: [dataPointDescriptor, labelsDescriptor]
      }
    ]
  };
};
