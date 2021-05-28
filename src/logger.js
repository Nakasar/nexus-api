const winston = require("winston");

class Logger {
  constructor() {
    this.logger = winston.createLogger({
      level: 'debug',
      format: winston.format.json(),
      defaultMeta: { service: "nexus-calendar" },
      transports: [
        new winston.transports.Console()
      ],
    });
  }

  replaceConsole() {
    console.log = (message, ...params) => {
      this.logger.debug(message, params);
    }
  }
}

module.exports = { Logger };
