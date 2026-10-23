// Import first in S3-driver tests: imports run before a test file's own statements,
// so this is the only way the env is set before storage.ts reads it.
process.env.STORAGE_DRIVER = "s3";
process.env.NEXTAUTH_SECRET = "test-secret";
process.env.NEXTAUTH_URL = "https://idsms.example.edu";
