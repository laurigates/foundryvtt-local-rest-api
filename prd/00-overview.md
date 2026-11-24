# FoundryVTT Local REST API - Product Overview

## Mission Statement
Provide a **100% local**, privacy-first REST API for FoundryVTT that enables external integrations without any third-party dependencies or cloud services.

## Core Principles
1. **Local-Only**: No external services, ever
2. **Privacy-First**: User data never leaves their network
3. **Simple Setup**: Install module, start bridge server, use API
4. **Secure by Default**: Cryptographic API keys, validated inputs
5. **Production Ready**: Comprehensive error handling and logging

## Architecture Decision
Two-component system required due to browser security limitations:
- **Module**: Runs in browser, accesses FoundryVTT data
- **Bridge Server**: Node.js process providing HTTP endpoints

## Success Criteria
- [ ] Zero external dependencies at runtime
- [ ] API key authentication working
- [ ] All core endpoints functional (actors, items, scenes, dice, world)
- [ ] Socket.io communication stable between components
- [ ] Comprehensive test coverage (>80%)
- [ ] Clear installation documentation
- [ ] Error messages helpful for debugging

## Non-Goals
- WebSocket streaming (future enhancement)
- Advanced rate limiting (future enhancement)
- Multi-user permission models (uses FoundryVTT's existing)
- Cloud deployment (explicitly local-only)

## Target Users
- Developers building FoundryVTT integrations
- Streamers needing local API access
- Home automation enthusiasts
- Privacy-conscious game masters