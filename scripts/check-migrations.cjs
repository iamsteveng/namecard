#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const MIGRATION_FILENAME_REGEX = /^(?<timestamp>\d{4}-\d{2}-\d{2}T\d{4})__(?<service>[a-z0-9-]+)__(?<description>[a-z0-9-]+)\.sql$/;

function main() {
  const root = process.cwd();
  const servicesDir = path.join(root, 'services');
  if (!fs.existsSync(servicesDir)) {
    console.error('Unable to locate services directory at', servicesDir);
    process.exit(1);
  }

  const errors = [];
  const seenNames = new Set();
  const serviceEntries = fs.readdirSync(servicesDir, { withFileTypes: true });

  for (const entry of serviceEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const serviceName = entry.name;
    const migrationsDir = path.join(servicesDir, serviceName, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      continue;
    }

    const files = fs.readdirSync(migrationsDir, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.sql')) {
        continue;
      }

      const relativePath = path.join('services', serviceName, 'migrations', file.name);
      const match = MIGRATION_FILENAME_REGEX.exec(file.name);
      if (!match) {
        errors.push(`${relativePath}: filename must match YYYY-MM-DDThhmm__service__description.sql using lowercase letters, numbers, or dashes.`);
        continue;
      }

      if (match.groups.service !== serviceName) {
        errors.push(
          `${relativePath}: service segment "${match.groups.service}" must match directory name "${serviceName}".`,
        );
      }

      if (!isValidTimestamp(match.groups.timestamp)) {
        errors.push(`${relativePath}: timestamp segment "${match.groups.timestamp}" is not a valid UTC time.`);
      }

      if (seenNames.has(file.name)) {
        errors.push(`${relativePath}: duplicate migration filename detected across services.`);
      } else {
        seenNames.add(file.name);
      }

      const sqlPath = path.join(migrationsDir, file.name);
      const content = fs.readFileSync(sqlPath, 'utf8');
      const statementErrors = lintSql(content);
      for (const issue of statementErrors) {
        errors.push(`${relativePath}: ${issue}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error('Migration lint failed:');
    for (const message of errors) {
      console.error(` - ${message}`);
    }
    process.exit(1);
  }

  console.log('Migration lint passed.');
}

function isValidTimestamp(segment) {
  const year = Number(segment.slice(0, 4));
  const month = Number(segment.slice(5, 7));
  const day = Number(segment.slice(8, 10));
  const hour = Number(segment.slice(11, 13));
  const minute = Number(segment.slice(13, 15));

  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    return false;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return false;
  }

  const isoString = `${segment.slice(0, 10)}T${segment.slice(11, 13)}:${segment.slice(13, 15)}:00Z`;
  const date = new Date(isoString);
  return !Number.isNaN(date.valueOf());
}

function lintSql(sql) {
  const stripped = stripSqlComments(sql);
  const statements = stripped
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const issues = [];

  for (const statement of statements) {
    const normalized = statement.replace(/\s+/g, ' ').trim();
    const lower = normalized.toLowerCase();

    if (/\bdrop\s+table\b/.test(lower)) {
      issues.push('DROP TABLE statements are blocked; use a follow-up migration reviewed manually.');
    }

    if (/\btruncate\s+table\b/.test(lower)) {
      issues.push('TRUNCATE is not allowed in automated migrations.');
    }

    if (/^update\b/.test(lower) && !/\bwhere\b/.test(lower)) {
      issues.push('UPDATE statements require a WHERE clause to avoid full-table writes.');
    }

    if (/^delete\b/.test(lower) && !/\bwhere\b/.test(lower)) {
      issues.push('DELETE statements require a WHERE clause to avoid truncating tables.');
    }

    if (/^alter\s+table\b/.test(lower) && /\bdrop\s+(column|constraint)\b/.test(lower)) {
      issues.push('ALTER TABLE ... DROP COLUMN/CONSTRAINT is blocked; use expansion + contract strategy.');
    }

    if (/^create\s+index\b/.test(lower) && !/\bconcurrently\b/.test(lower)) {
      issues.push('CREATE INDEX must use CONCURRENTLY to prevent table locks.');
    }
  }

  return issues;
}

function stripSqlComments(sql) {
  return sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

main();
