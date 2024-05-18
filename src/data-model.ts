import {
  GenericEffectDataModel,
  TableNamesInEffectDataModel,
} from "~/src/schema";

export type EffectDocumentByName<
  EffectDataModel extends GenericEffectDataModel,
  TableName extends TableNamesInEffectDataModel<EffectDataModel>,
> = EffectDataModel[TableName]["effectDocument"];
