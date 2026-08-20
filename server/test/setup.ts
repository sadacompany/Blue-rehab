// Runs once per test file, before that file's own imports resolve. src/config.ts
// parses process.env at *module load* time into a module-level singleton, so
// anything a test needs (e.g. isMoyasarConfigured() reading a real-looking
// MOYASAR_SECRET_KEY) has to be in the environment before src/config.ts is
// first imported — setting it inside a test body would be too late.
//
// Values are deliberately fake and clearly non-production ("sk_test_..." is
// Moyasar's own test-mode prefix) — nothing here talks to a real Supabase
// project or a real Moyasar account; every test that needs a client mocks it.
process.env.MOYASAR_SECRET_KEY ??= "sk_test_unit_test_fake_key";
process.env.MOYASAR_PUBLISHABLE_KEY ??= "pk_test_unit_test_fake_key";
