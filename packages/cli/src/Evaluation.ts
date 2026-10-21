import type * as Array from "effect/Array";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as EntryPoint from "./EntryPoint";
import * as GenerationSnapshot from "./GenerationSnapshot";
import type { ImplModulePath } from "./ImplModulePath";
import * as Codegen from "./confect/codegen";
import * as EvaluationSession from "./EvaluationSession";
import type { EvaluationError } from "./EvaluationProtocol";
import { catchDiagnostic } from "./EvaluationProtocol";

export { EvaluationError, catchDiagnostic } from "./EvaluationProtocol";

export const loadPreviousFunctionPaths =
  Codegen.loadPreviousFunctionPaths.pipe(catchDiagnostic);

export const generateSnapshot = Codegen.generateWithSnapshot.pipe(
  Effect.map(({ snapshot }) => snapshot),
  catchDiagnostic,
);

export const generate = generateSnapshot.pipe(
  Effect.map(GenerationSnapshot.functionPaths),
);

export const updateDeclarations = (
  snapshot: GenerationSnapshot.GenerationSnapshot,
  declarations: Array.NonEmptyReadonlyArray<EntryPoint.Declaration>,
  paths: ReadonlyArray<ImplModulePath>,
) =>
  Codegen.updateDeclarations(snapshot, declarations, paths).pipe(
    catchDiagnostic,
  );

export const validate = (paths: ReadonlyArray<ImplModulePath>) =>
  EvaluationSession.withImplFiles(paths, EvaluationSession.validateImpls).pipe(
    EvaluationSession.provide,
    catchDiagnostic,
  );

export const catchAndLog = <A, R>(
  effect: Effect.Effect<A, EvaluationError, R>,
): Effect.Effect<Option.Option<A>, never, R> =>
  effect.pipe(
    Effect.asSome,
    Effect.catchTag("EvaluationError", ({ diagnostic }) =>
      Console.error(diagnostic).pipe(Effect.as(Option.none<A>())),
    ),
  );
