// Test environment: an isolated database and deterministic secrets.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://shams:shams@localhost:5432/shams_test?schema=public";
process.env.BETTER_AUTH_SECRET ??= "test-secret-0123456789abcdef0123456789abcdef";
process.env.APP_URL ??= "http://localhost:3000";
process.env.PAYMENT_SANDBOX_ENABLED = "true";
process.env.LOG_LEVEL = "error";
process.env.STORAGE_LOCAL_DIR = "./storage-test";
