const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = (process.env.LOG_LEVEL || 'debug').toLowerCase();
const currentThreshold = LOG_LEVELS[currentLevel] !== undefined ? LOG_LEVELS[currentLevel] : 0;

/**
 * Formats a log entry with ISO timestamp and standardized log tag.
 */
function formatMessage(level, message, meta) {
  const timestamp = new Date().toISOString();
  const metaString = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaString}`;
}

export const logger = {
  debug(message, meta = {}) {
    if (currentThreshold <= LOG_LEVELS.debug) {
      console.debug(formatMessage('debug', message, meta));
    }
  },

  info(message, meta = {}) {
    if (currentThreshold <= LOG_LEVELS.info) {
      console.info(formatMessage('info', message, meta));
    }
  },

  warn(message, meta = {}) {
    if (currentThreshold <= LOG_LEVELS.warn) {
      console.warn(formatMessage('warn', message, meta));
    }
  },

  error(message, meta = {}) {
    if (currentThreshold <= LOG_LEVELS.error) {
      console.error(formatMessage('error', message, meta));
    }
  },
};

export default logger;
