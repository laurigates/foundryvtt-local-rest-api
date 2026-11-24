import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGitRemoteInfo() {
  try {
    const remoteUrl = execSync('git config --get remote.origin.url', { encoding: 'utf8' }).trim();
    
    // Parse GitHub URL (supports both SSH and HTTPS formats)
    const sshMatch = remoteUrl.match(/git@github\.com:(.+?)\/(.+?)(?:\.git)?$/);
    const httpsMatch = remoteUrl.match(/https:\/\/github\.com\/(.+?)\/(.+?)(?:\.git)?$/);
    
    if (sshMatch) {
      return { username: sshMatch[1], repository: sshMatch[2] };
    } else if (httpsMatch) {
      return { username: httpsMatch[1], repository: httpsMatch[2] };
    }
  } catch {
    console.warn('Could not parse git remote URL');
  }
  
  return { username: 'yourusername', repository: 'foundryvtt-local-rest-api' };
}

function getPackageVersion() {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    return packageJson.version || '0.9.2';
  } catch {
    console.warn('Could not read package.json version');
    return '0.9.2';
  }
}

function getPackageAuthor() {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const author = packageJson.author;
    
    if (typeof author === 'string') {
      // Parse "Name <email>" or just "Name" format
      const match = author.match(/^([^<]+)(?:\s*<([^>]+)>)?/);
      if (match) {
        return {
          name: match[1].trim(),
          email: match[2] || ''
        };
      }
      return { name: author.trim(), email: '' };
    } else if (typeof author === 'object' && author !== null) {
      // Handle object format { name: "...", email: "..." }
      return {
        name: author.name || '',
        email: author.email || ''
      };
    }
    
    return { name: '', email: '' };
  } catch {
    console.warn('Could not read package.json author');
    return { name: '', email: '' };
  }
}

function getReplacements() {
  // Get dynamic values
  const gitInfo = getGitRemoteInfo();
  const packageVersion = getPackageVersion();
  const packageAuthor = getPackageAuthor();
  
  // Define replacement values with fallbacks to placeholder values
  const fullRepoPath = `${gitInfo.username}/${gitInfo.repository}`;
  
  return {
    GITHUB_USERNAME: process.env.GITHUB_USERNAME || gitInfo.username,
    GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY || fullRepoPath,
    MODULE_VERSION: process.env.MODULE_VERSION || packageVersion,
    AUTHOR_NAME: process.env.AUTHOR_NAME || packageAuthor.name || 'Your Name',
    // No placeholder fallback: an empty email is dropped from module.json
    AUTHOR_EMAIL: process.env.AUTHOR_EMAIL || packageAuthor.email || ''
  };
}

function processTemplateToString() {
  const templatePath = path.join(__dirname, '..', 'module.json.template');
  
  if (!fs.existsSync(templatePath)) {
    throw new Error('module.json.template not found');
  }
  
  let template = fs.readFileSync(templatePath, 'utf8');
  const replacements = getReplacements();
  
  // Replace all placeholders
  Object.entries(replacements).forEach(([key, value]) => {
    const placeholder = new RegExp(`{{${key}}}`, 'g');
    template = template.replace(placeholder, value);
  });
  
  console.log('Generated module.json with the following values:');
  Object.entries(replacements).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`);
  });
  
  return dropEmptyAuthorEmails(template);
}

/**
 * Remove `email` from authors that have none, rather than publishing an
 * empty string (Foundry's manifest schema treats email as optional).
 */
function dropEmptyAuthorEmails(json) {
  const manifest = JSON.parse(json);
  if (Array.isArray(manifest.authors)) {
    manifest.authors = manifest.authors.map(({ email, ...author }) =>
      email ? { ...author, email } : author
    );
  }
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function processTemplate() {
  const outputPath = path.join(__dirname, '..', 'module.json');
  const template = processTemplateToString();
  
  // Write processed template
  fs.writeFileSync(outputPath, template, 'utf8');
  
  console.log('✓ module.json written to root directory');
}

// If called directly, process the template
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    processTemplate();
    console.log('✓ module.json generated successfully');
  } catch (error) {
    console.error('✗ Error processing template:', error.message);
    process.exit(1);
  }
}

export { processTemplate, processTemplateToString };