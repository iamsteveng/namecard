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

/***/ "./local/health.ts":
/*!*************************!*\
  !*** ./local/health.ts ***!
  \*************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

eval("{\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nexports.handler = void 0;\nconst response_1 = __webpack_require__(/*! ../services/shared/utils/response */ \"./services/shared/utils/response.ts\");\nconst handler = async (event, _context) => {\n    const requestId = (0, response_1.getRequestId)(event);\n    try {\n        const healthData = {\n            status: 'healthy',\n            environment: \"development\" || 0,\n            stage: process.env['STAGE'] || 'local',\n            timestamp: new Date().toISOString(),\n            version: '0.1.0',\n            services: {\n                auth: 'available',\n                cards: 'available',\n                upload: 'available',\n                ocr: 'available',\n                enrichment: 'available',\n            },\n            database: {\n                status: 'not checked in local proxy',\n            },\n        };\n        return (0, response_1.createSuccessResponse)(healthData, 200, 'Service is healthy', requestId);\n    }\n    catch (error) {\n        const errorMessage = error instanceof Error ? error.message : 'Unknown error';\n        return (0, response_1.createErrorResponse)(errorMessage, 500, requestId);\n    }\n};\nexports.handler = handler;\n\n\n//# sourceURL=webpack://namecard-app/./local/health.ts?\n}");

/***/ }),

/***/ "./services/shared/utils/response.ts":
/*!*******************************************!*\
  !*** ./services/shared/utils/response.ts ***!
  \*******************************************/
/***/ ((__unused_webpack_module, exports) => {

eval("{\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nexports.createSuccessResponse = createSuccessResponse;\nexports.createErrorResponse = createErrorResponse;\nexports.createValidationErrorResponse = createValidationErrorResponse;\nexports.createNotFoundResponse = createNotFoundResponse;\nexports.createUnauthorizedResponse = createUnauthorizedResponse;\nexports.createForbiddenResponse = createForbiddenResponse;\nexports.generateRequestId = generateRequestId;\nexports.getRequestId = getRequestId;\nexports.parseJsonBody = parseJsonBody;\nexports.getUserIdFromPath = getUserIdFromPath;\nexports.getIdFromPath = getIdFromPath;\nexports.getQueryParameter = getQueryParameter;\nexports.getPaginationParams = getPaginationParams;\nconst corsHeaders = {\n    'Access-Control-Allow-Origin': '*',\n    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',\n    'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',\n    'Content-Type': 'application/json',\n};\nfunction createSuccessResponse(data, statusCode = 200, message, requestId = generateRequestId()) {\n    const response = {\n        success: true,\n        data,\n        timestamp: new Date().toISOString(),\n        requestId,\n        ...(message && { message }),\n    };\n    return {\n        statusCode,\n        headers: corsHeaders,\n        body: JSON.stringify(response),\n    };\n}\nfunction createErrorResponse(error, statusCode = 500, requestId = generateRequestId()) {\n    const errorMessage = error instanceof Error ? error.message : error;\n    const response = {\n        success: false,\n        error: errorMessage,\n        timestamp: new Date().toISOString(),\n        requestId,\n    };\n    console.error('API Error:', {\n        error: errorMessage,\n        statusCode,\n        requestId,\n        timestamp: response.timestamp,\n    });\n    return {\n        statusCode,\n        headers: corsHeaders,\n        body: JSON.stringify(response),\n    };\n}\nfunction createValidationErrorResponse(errors, requestId = generateRequestId()) {\n    const response = {\n        success: false,\n        error: 'Validation failed',\n        data: { errors },\n        timestamp: new Date().toISOString(),\n        requestId,\n    };\n    return {\n        statusCode: 400,\n        headers: corsHeaders,\n        body: JSON.stringify(response),\n    };\n}\nfunction createNotFoundResponse(resource = 'Resource', requestId = generateRequestId()) {\n    return createErrorResponse(`${resource} not found`, 404, requestId);\n}\nfunction createUnauthorizedResponse(message = 'Unauthorized', requestId = generateRequestId()) {\n    return createErrorResponse(message, 401, requestId);\n}\nfunction createForbiddenResponse(message = 'Forbidden', requestId = generateRequestId()) {\n    return createErrorResponse(message, 403, requestId);\n}\nfunction generateRequestId() {\n    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;\n}\nfunction getRequestId(event) {\n    return event.requestContext?.requestId || generateRequestId();\n}\nfunction parseJsonBody(body) {\n    if (!body)\n        return null;\n    try {\n        return JSON.parse(body);\n    }\n    catch (error) {\n        console.error('Failed to parse JSON body:', error);\n        return null;\n    }\n}\nfunction getUserIdFromPath(event) {\n    return event.pathParameters?.userId || null;\n}\nfunction getIdFromPath(event) {\n    return event.pathParameters?.id || null;\n}\nfunction getQueryParameter(event, key, defaultValue) {\n    const params = event.queryStringParameters || {};\n    return params[key] || defaultValue;\n}\nfunction getPaginationParams(event) {\n    const limit = Math.min(parseInt(getQueryParameter(event, 'limit', '20') || '20'), 100);\n    const offset = Math.max(parseInt(getQueryParameter(event, 'offset', '0') || '0'), 0);\n    return { limit, offset };\n}\n\n\n//# sourceURL=webpack://namecard-app/./services/shared/utils/response.ts?\n}");

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
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
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
/******/ 	var __webpack_exports__ = __webpack_require__("./local/health.ts");
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;