import {
  GenericConfectDataModel,
  TableNamesInConfectDataModel,
} from "~/src/schema";

export type ConfectDocumentByName<
  EffectDataModel extends GenericConfectDataModel,
  TableName extends TableNamesInConfectDataModel<EffectDataModel>,
> = EffectDataModel[TableName]["confectDocument"];
