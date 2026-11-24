/**
 * module.json generation (scripts/build.js), which the release attaches.
 *
 * package.json's author has no email and CI sets no AUTHOR_EMAIL, so the
 * email must be left out rather than filled with a placeholder. A release's
 * module.json must download that release's own zip, not the latest one.
 */

import { execFileSync } from 'child_process';
import path from 'path';

const REPO = 'laurigates/foundryvtt-local-rest-api';
const BUILD = path.resolve(__dirname, '../../scripts/build.js');

// build.js is an ES module that reads import.meta, which babel-jest cannot
// load, so it runs in a child Node process; console.log is silenced there so
// stdout carries only the generated JSON. Nothing is written to disk.
function generate(env = {}) {
  const script = `console.log = () => {};
    const { processTemplateToString } = await import(${JSON.stringify(BUILD)});
    process.stdout.write(processTemplateToString());`;
  const childEnv = { ...process.env, GITHUB_REPOSITORY: REPO, MODULE_VERSION: '2.1.0', ...env };
  if (!('AUTHOR_EMAIL' in env)) delete childEnv.AUTHOR_EMAIL;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: childEnv,
    encoding: 'utf8'
  });
  return JSON.parse(out);
}

describe('module.json generation', () => {
  test('leaves out the author email when none is configured', () => {
    const moduleJson = generate();

    expect(moduleJson.authors).toEqual([{ name: 'Lauri Gates' }]);
    expect(JSON.stringify(moduleJson)).not.toMatch(/example\.com/);
  });

  test('keeps an email given in AUTHOR_EMAIL', () => {
    const moduleJson = generate({ AUTHOR_EMAIL: 'author@example.org' });

    expect(moduleJson.authors).toEqual([{ name: 'Lauri Gates', email: 'author@example.org' }]);
  });

  test("downloads the release's own zip; the manifest tracks the latest release", () => {
    const moduleJson = generate();

    expect(moduleJson.download).toBe(
      `https://github.com/${REPO}/releases/download/v2.1.0/foundryvtt-local-rest-api.zip`
    );
    expect(moduleJson.manifest).toBe(
      `https://github.com/${REPO}/releases/latest/download/module.json`
    );
  });

  test('points readme and changelog at files in the repository root at the release tag', () => {
    const moduleJson = generate();

    expect(moduleJson.readme).toBe(`https://github.com/${REPO}/blob/v2.1.0/README.md`);
    expect(moduleJson.changelog).toBe(`https://github.com/${REPO}/blob/v2.1.0/CHANGELOG.md`);
    expect(moduleJson.media ?? []).toEqual([]);
  });

  test('describes v13 and v14 support without the Query System claim', () => {
    const { description } = generate();

    expect(description).toMatch(/v13/);
    expect(description).toMatch(/v14/);
    expect(description).not.toMatch(/Query System/);
  });
});
