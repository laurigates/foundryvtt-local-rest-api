set shell := ["bash", "-euo", "pipefail", "-c"]

# List recipes
default:
    @just --list

# Install module and bridge-server dependencies
install:
    npm ci
    cd bridge-server && npm ci

# Run module tests
test:
    npm test

# Run bridge-server tests
test-bridge:
    cd bridge-server && npm test

# Run every test suite
test-all: test test-bridge

# Run module tests with coverage
coverage:
    npm run test:coverage

# Lint module and bridge server
lint:
    npx eslint scripts bridge-server

# Scan module and bridge server for unused files, exports and dependencies
knip:
    npx knip

# Generate module.json from the template
build:
    npm run build

# Run the bridge server
start:
    cd bridge-server && npm start

# Lint and test, as CI does
check: lint test-all

# Run all pre-commit hooks against the whole tree
pre-commit:
    pre-commit run --all-files

# Audit dependencies of module and bridge server
audit:
    npm audit --audit-level=moderate
    cd bridge-server && npm audit --audit-level=moderate
