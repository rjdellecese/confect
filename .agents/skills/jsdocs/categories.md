# Categories

Root declarations require one non-empty `@category`. Reuse nearby categories;
prefer plurals and gerunds with the repository formatter's casing. Retain
categories on public members used for reference navigation.

Common categories include:

- Shapes: `constructors`, `destructors`, `models`, `schemas`, `guards`,
  `predicates`, `getters`, `accessors`, `instances`, `constants`, `protocols`,
  `prototypes`, `re-exports`, `unsafe`, `testing`.
- Effect: `services`, `tags`, `layers`, `context`, `resource management`,
  `running`, `errors`, `error handling`.
- Operations: `combinators`, `filtering`, `mapping`, `sequencing`, `zipping`,
  `combining`, `merging`, `converting`, `transforming`, `folding`, `splitting`,
  `repetition`.
- Shared: `utility types`, `encoding`, `decoding`, `serialization`, `tracing`,
  `metrics`, `logging`, `annotations`, `references`, `symbols`, `type IDs`,
  `configuration`, `math`, `comparisons`, `ordering`.

Keep these boundaries: services are contracts, tags identify services, and
layers provide them; getters retrieve values while accessors read context;
errors model failures while error handling recovers or maps them; models are
domain data while utility types are type-level contracts; guards narrow while
predicates return booleans.
