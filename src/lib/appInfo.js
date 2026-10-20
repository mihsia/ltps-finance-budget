import pkg from '../../package.json';

export const APP_VERSION = pkg.version;

// Bumped by hand whenever a user-facing change ships, so the login screen
// shows when the system was last updated without needing a build-time date
// stamp (which would show the container's build time, not a meaningful
// release date).
export const APP_UPDATED_AT = '2026-10-20';
