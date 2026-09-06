const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const envPath = path.join(__dirname, '..', '.env');
let dbUrl = process.env.DATABASE_URL || '';

console.log('🔍 Running prisma-generate.js script...');
console.log('  __dirname:', __dirname);
console.log('  envPath:', envPath);
console.log('  fs.existsSync(envPath):', fs.existsSync(envPath));
console.log('  Initial process.env.DATABASE_URL:', process.env.DATABASE_URL ? '(set)' : '(not set)');

if (!dbUrl && fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || !trimmed) continue;
    const match = trimmed.match(/^DATABASE_URL\s*=\s*(.*)$/);
    if (match) {
      dbUrl = match[1].replace(/["']/g, '').trim();
      console.log('  Matched active DATABASE_URL in .env:', dbUrl ? '(value matched)' : '(empty match)');
      break;
    }
  }
  if (!dbUrl) {
    console.log('  No active DATABASE_URL found in .env file');
  }
}

const maskedDbUrl = dbUrl ? dbUrl.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@') : '(none)';
console.log('  Final dbUrl to check:', maskedDbUrl);

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');

if (dbUrl.startsWith('postgres')) {
  console.log('🔄 Detected PostgreSQL connection string, updating schema provider...');
  schema = schema.replace(/provider\s*=\s*"(?:sqlite|postgresql)"/, 'provider = "postgresql"');
  if (!schema.includes('directUrl')) {
    schema = schema.replace(/(url\s*=\s*env\("DATABASE_URL"\))/, '$1\n  directUrl = env("DIRECT_URL")');
  }
  fs.writeFileSync(schemaPath, schema);
} else if (dbUrl.startsWith('file:') || dbUrl.startsWith('sqlite:')) {
  console.log('🔄 Detected SQLite connection string, ensuring schema provider is sqlite...');
  schema = schema.replace(/provider\s*=\s*"(?:sqlite|postgresql)"/, 'provider = "sqlite"');
  schema = schema.replace(/\s*directUrl\s*=\s*env\("DIRECT_URL"\)/, '');
  fs.writeFileSync(schemaPath, schema);
} else {
  console.log('⚠️ Could not identify database provider type from dbUrl. Schema provider unchanged.');
}

try {
  const prismaBin = require.resolve('prisma/build/index.js');
  execSync(`node "${prismaBin}" generate`, { stdio: 'inherit' });
} catch (e) {
  console.error('Failed to generate Prisma client:', e);
  process.exit(1);
}
