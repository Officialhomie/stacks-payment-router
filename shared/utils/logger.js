"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const winston_1 = require("winston");
const logFormat = winston_1.format.combine(winston_1.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.format.errors({ stack: true }), winston_1.format.splat(), winston_1.format.json());
exports.logger = (0, winston_1.createLogger)({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    transports: [
        new winston_1.transports.Console({
            format: winston_1.format.combine(winston_1.format.colorize(), winston_1.format.simple()),
        }),
    ],
});
if (process.env.NODE_ENV === 'production') {
    exports.logger.add(new winston_1.transports.File({
        filename: 'error.log',
        level: 'error',
    }));
    exports.logger.add(new winston_1.transports.File({
        filename: 'combined.log',
    }));
}
//# sourceMappingURL=logger.js.map