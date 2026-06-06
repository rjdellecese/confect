// Validate .claude/settings.json against the JSON Schema it declares in "$schema".
import { readFileSync } from "node:fs";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const settingsPath = ".claude/settings.json";

const settings = JSON.parse(readFileSync(settingsPath, "utf8"));

const schemaUrl = settings.$schema;
if (!schemaUrl) {
  console.error(`✗ ${settingsPath} has no "$schema" field to validate against`);
  process.exit(1);
}

let schema;
try {
  const response = await fetch(schemaUrl);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  schema = await response.json();
} catch (error) {
  console.error(`✗ Could not fetch schema from ${schemaUrl}`);
  console.error(`  ${error.message}`);
  process.exit(1);
}

// strict: false keeps Ajv from rejecting vendor-specific keywords in the
// schemastore schema that aren't part of the JSON Schema vocabulary.
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const validate = ajv.compile(schema);

if (validate(settings)) {
  console.log(`✓ ${settingsPath} is valid against ${schemaUrl}`);
} else {
  console.error(`✗ ${settingsPath} failed schema validation:`);
  for (const error of validate.errors) {
    const location = error.instancePath || "(root)";
    console.error(`  ${location} ${error.message}`);
  }
  process.exit(1);
}
