/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./local/enrichment-proxy.ts":
/*!***********************************!*\
  !*** ./local/enrichment-proxy.ts ***!
  \***********************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

eval("{\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nexports.handler = void 0;\nconst response_1 = __webpack_require__(/*! ../services/shared/utils/response */ \"./services/shared/utils/response.ts\");\nconst logger_1 = __webpack_require__(/*! ../services/shared/utils/logger */ \"./services/shared/utils/logger.ts\");\nconst handler = async (event, context) => {\n    const startTime = Date.now();\n    const requestId = (0, response_1.getRequestId)(event);\n    const method = event.httpMethod;\n    const path = event.path;\n    (0, logger_1.logRequest)(method, path, { requestId, functionName: context.functionName });\n    try {\n        const routePath = event.path.replace('/api/v1/enrichment/', '').replace('/api/v1/enrichment', '');\n        switch (true) {\n            case routePath === 'enrich' && method === 'POST':\n                return await handleEnrich(event, requestId);\n            case routePath === 'perplexity-lookup' && method === 'POST':\n                return await handlePerplexityLookup(event, requestId);\n            case routePath === 'refresh' && method === 'POST':\n                return await handleRefresh(event, requestId);\n            default:\n                return (0, response_1.createErrorResponse)(`Route not found: ${method} ${routePath}`, 404, requestId);\n        }\n    }\n    catch (error) {\n        const errorMessage = error instanceof Error ? error.message : 'Unknown error';\n        return (0, response_1.createErrorResponse)(errorMessage, 500, requestId);\n    }\n    finally {\n        const duration = Date.now() - startTime;\n        (0, logger_1.logResponse)(200, duration, { requestId, functionName: context.functionName });\n    }\n};\nexports.handler = handler;\nasync function handleEnrich(event, requestId) {\n    return (0, response_1.createSuccessResponse)({\n        message: 'Enrich card endpoint - to be implemented',\n        path: event.path,\n        method: event.httpMethod,\n    }, 200, 'Enrichment proxy working', requestId);\n}\nasync function handlePerplexityLookup(event, requestId) {\n    return (0, response_1.createSuccessResponse)({\n        message: 'Perplexity lookup endpoint - to be implemented',\n        path: event.path,\n        method: event.httpMethod,\n    }, 200, 'Enrichment proxy working', requestId);\n}\nasync function handleRefresh(event, requestId) {\n    return (0, response_1.createSuccessResponse)({\n        message: 'Refresh enrichment endpoint - to be implemented',\n        path: event.path,\n        method: event.httpMethod,\n    }, 200, 'Enrichment proxy working', requestId);\n}\n\n\n//# sourceURL=webpack://namecard-app/./local/enrichment-proxy.ts?\n}");

/***/ }),

/***/ "./services/shared/utils/logger.ts":
/*!*****************************************!*\
  !*** ./services/shared/utils/logger.ts ***!
  \*****************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

eval("{\nvar __importDefault = (this && this.__importDefault) || function (mod) {\n    return (mod && mod.__esModule) ? mod : { \"default\": mod };\n};\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nexports.logInfo = logInfo;\nexports.logError = logError;\nexports.logWarn = logWarn;\nexports.logDebug = logDebug;\nexports.logPerformance = logPerformance;\nexports.logRequest = logRequest;\nexports.logResponse = logResponse;\nexports.logDatabaseOperation = logDatabaseOperation;\nexports.logExternalApiCall = logExternalApiCall;\nconst winston_1 = __importDefault(__webpack_require__(/*! winston */ \"winston\"));\nconst logger = winston_1.default.createLogger({\n    level: process.env['LOG_LEVEL'] || 'info',\n    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json()),\n    defaultMeta: {\n        service: process.env['AWS_LAMBDA_FUNCTION_NAME'] || 'namecard-service',\n        stage: process.env['STAGE'] || 'local',\n    },\n    transports: [\n        new winston_1.default.transports.Console({\n            format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple())\n        })\n    ],\n});\nfunction logInfo(message, context = {}) {\n    logger.info(message, context);\n}\nfunction logError(message, error, context = {}) {\n    logger.error(message, {\n        ...context,\n        error: error instanceof Error ? {\n            message: error.message,\n            stack: error.stack,\n            name: error.name,\n        } : error,\n    });\n}\nfunction logWarn(message, context = {}) {\n    logger.warn(message, context);\n}\nfunction logDebug(message, context = {}) {\n    logger.debug(message, context);\n}\nfunction logPerformance(operation, duration, context = {}) {\n    logInfo(`Performance: ${operation}`, {\n        ...context,\n        operation,\n        duration,\n        durationMs: `${duration}ms`,\n    });\n}\nfunction logRequest(method, path, context = {}) {\n    logInfo('Incoming request', {\n        ...context,\n        method,\n        path,\n        timestamp: new Date().toISOString(),\n    });\n}\nfunction logResponse(statusCode, duration, context = {}) {\n    logInfo('Request completed', {\n        ...context,\n        statusCode,\n        duration,\n        durationMs: `${duration}ms`,\n    });\n}\nfunction logDatabaseOperation(operation, table, duration, context = {}) {\n    logInfo(`Database ${operation}`, {\n        ...context,\n        operation,\n        table,\n        duration,\n        durationMs: `${duration}ms`,\n    });\n}\nfunction logExternalApiCall(service, endpoint, duration, statusCode, context = {}) {\n    logInfo(`External API call: ${service}`, {\n        ...context,\n        service,\n        endpoint,\n        statusCode,\n        duration,\n        durationMs: `${duration}ms`,\n    });\n}\nexports[\"default\"] = logger;\n\n\n//# sourceURL=webpack://namecard-app/./services/shared/utils/logger.ts?\n}");

/***/ }),

/***/ "./services/shared/utils/response.ts":
/*!*******************************************!*\
  !*** ./services/shared/utils/response.ts ***!
  \*******************************************/
/***/ ((__unused_webpack_module, exports) => {

eval("{\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nexports.createSuccessResponse = createSuccessResponse;\nexports.createErrorResponse = createErrorResponse;\nexports.createValidationErrorResponse = createValidationErrorResponse;\nexports.createNotFoundResponse = createNotFoundResponse;\nexports.createUnauthorizedResponse = createUnauthorizedResponse;\nexports.createForbiddenResponse = createForbiddenResponse;\nexports.generateRequestId = generateRequestId;\nexports.getRequestId = getRequestId;\nexports.parseJsonBody = parseJsonBody;\nexports.getUserIdFromPath = getUserIdFromPath;\nexports.getIdFromPath = getIdFromPath;\nexports.getQueryParameter = getQueryParameter;\nexports.getPaginationParams = getPaginationParams;\nconst corsHeaders = {\n    'Access-Control-Allow-Origin': '*',\n    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',\n    'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',\n    'Content-Type': 'application/json',\n};\nfunction createSuccessResponse(data, statusCode = 200, message, requestId = generateRequestId()) {\n    const response = {\n        success: true,\n        data,\n        timestamp: new Date().toISOString(),\n        requestId,\n        ...(message && { message }),\n    };\n    return {\n        statusCode,\n        headers: corsHeaders,\n        body: JSON.stringify(response),\n    };\n}\nfunction createErrorResponse(error, statusCode = 500, requestId = generateRequestId()) {\n    const errorMessage = error instanceof Error ? error.message : error;\n    const response = {\n        success: false,\n        error: errorMessage,\n        timestamp: new Date().toISOString(),\n        requestId,\n    };\n    console.error('API Error:', {\n        error: errorMessage,\n        statusCode,\n        requestId,\n        timestamp: response.timestamp,\n    });\n    return {\n        statusCode,\n        headers: corsHeaders,\n        body: JSON.stringify(response),\n    };\n}\nfunction createValidationErrorResponse(errors, requestId = generateRequestId()) {\n    const response = {\n        success: false,\n        error: 'Validation failed',\n        data: { errors },\n        timestamp: new Date().toISOString(),\n        requestId,\n    };\n    return {\n        statusCode: 400,\n        headers: corsHeaders,\n        body: JSON.stringify(response),\n    };\n}\nfunction createNotFoundResponse(resource = 'Resource', requestId = generateRequestId()) {\n    return createErrorResponse(`${resource} not found`, 404, requestId);\n}\nfunction createUnauthorizedResponse(message = 'Unauthorized', requestId = generateRequestId()) {\n    return createErrorResponse(message, 401, requestId);\n}\nfunction createForbiddenResponse(message = 'Forbidden', requestId = generateRequestId()) {\n    return createErrorResponse(message, 403, requestId);\n}\nfunction generateRequestId() {\n    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;\n}\nfunction getRequestId(event) {\n    return event.requestContext?.requestId || generateRequestId();\n}\nfunction parseJsonBody(body) {\n    if (!body)\n        return null;\n    try {\n        return JSON.parse(body);\n    }\n    catch (error) {\n        console.error('Failed to parse JSON body:', error);\n        return null;\n    }\n}\nfunction getUserIdFromPath(event) {\n    return event.pathParameters?.userId || null;\n}\nfunction getIdFromPath(event) {\n    return event.pathParameters?.id || null;\n}\nfunction getQueryParameter(event, key, defaultValue) {\n    const params = event.queryStringParameters || {};\n    return params[key] || defaultValue;\n}\nfunction getPaginationParams(event) {\n    const limit = Math.min(parseInt(getQueryParameter(event, 'limit', '20') || '20'), 100);\n    const offset = Math.max(parseInt(getQueryParameter(event, 'offset', '0') || '0'), 0);\n    return { limit, offset };\n}\n\n\n//# sourceURL=webpack://namecard-app/./services/shared/utils/response.ts?\n}");

/***/ }),

/***/ "winston":
/*!**************************!*\
  !*** external "winston" ***!
  \**************************/
/***/ ((module) => {

module.exports = require("winston");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module can't be inlined because the eval devtool is used.
/******/ 	var __webpack_exports__ = __webpack_require__("./local/enrichment-proxy.ts");
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;