import { createLogger, format, transports } from 'winston';

const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.splat(),
  format.json()
);

export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    new transports.Console({
      format: format.combine(format.colorize(), format.simple()),
    }),
  ],
});

if (process.env.NODE_ENV === 'production') {
  logger.add(
    new transports.File({
      filename: 'error.log',
      level: 'error',
    })
  );
  logger.add(
    new transports.File({
      filename: 'combined.log',
    })
  );
}

