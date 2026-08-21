# Capy project configuration

Capy stores its Dev environment Setup in the project rather than in the
repository. Keep executable behavior versioned here and limit project Setup to
the following mappings:

## Lifecycle

- Initialize: `bash .agents/scripts/setup.sh`
- Update after checkout: `bash .agents/scripts/setup.sh`
- Startup: none

## Tool hooks

- Before `read`: `bash .agents/hooks/pre-read.sh "${path}"`
- After `edit`: `bash .agents/hooks/post-file.sh "${file_path}"`
- After `write`: `bash .agents/hooks/post-file.sh "${file_path}"`
- After `apply_patch`: `bash .agents/hooks/post-patch.sh`

The hooks apply to Capy's coding agents, not the read-only Review agent. Do not
duplicate their behavior inline in project Setup; edit and review the scripts in
this directory instead.
