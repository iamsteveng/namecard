"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.textractService = exports.AppError = exports.ImageValidationService = exports.ImagePreprocessingService = exports.secretsService = exports.cognitoService = exports.logger = exports.env = exports.setupLambdaCleanup = exports.disconnectPrisma = exports.getPrismaClient = void 0;
// Shared utilities for serverless functions
var lambdaPrisma_1 = require("./lib/lambdaPrisma");
Object.defineProperty(exports, "getPrismaClient", { enumerable: true, get: function () { return __importDefault(lambdaPrisma_1).default; } });
Object.defineProperty(exports, "disconnectPrisma", { enumerable: true, get: function () { return lambdaPrisma_1.disconnectPrisma; } });
Object.defineProperty(exports, "setupLambdaCleanup", { enumerable: true, get: function () { return lambdaPrisma_1.setupLambdaCleanup; } });
var env_1 = require("@shared/config/env");
Object.defineProperty(exports, "env", { enumerable: true, get: function () { return env_1.env; } });
var lambdaLogger_1 = require("./utils/lambdaLogger");
Object.defineProperty(exports, "logger", { enumerable: true, get: function () { return __importDefault(lambdaLogger_1).default; } });
__exportStar(require("./utils/response"), exports);
__exportStar(require("./utils/logger"), exports);
// Lambda utilities
__exportStar(require("./lambda"), exports);
// Services
var cognito_service_1 = require("./services/cognito.service");
Object.defineProperty(exports, "cognitoService", { enumerable: true, get: function () { return __importDefault(cognito_service_1).default; } });
__exportStar(require("./services/jwt.service"), exports);
var secrets_service_1 = require("./services/secrets.service");
Object.defineProperty(exports, "secretsService", { enumerable: true, get: function () { return __importDefault(secrets_service_1).default; } });
var image_preprocessing_service_1 = require("./services/image-preprocessing.service");
Object.defineProperty(exports, "ImagePreprocessingService", { enumerable: true, get: function () { return image_preprocessing_service_1.ImagePreprocessingService; } });
var image_validation_service_1 = require("./services/image-validation.service");
Object.defineProperty(exports, "ImageValidationService", { enumerable: true, get: function () { return image_validation_service_1.ImageValidationService; } });
Object.defineProperty(exports, "AppError", { enumerable: true, get: function () { return image_validation_service_1.AppError; } });
var textract_service_1 = require("./services/textract.service");
Object.defineProperty(exports, "textractService", { enumerable: true, get: function () { return textract_service_1.textractService; } });
