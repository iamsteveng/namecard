/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "./handlers/health.js":
/*!****************************!*\
  !*** ./handlers/health.js ***!
  \****************************/
/***/ ((module) => {

eval("{const handler = async (event, context) => {\n  const startTime = Date.now();\n  const requestId = context.awsRequestId;\n\n  console.log(`[${requestId}] Auth service health check requested`);\n\n  try {\n    const healthData = {\n      service: 'namecard-auth',\n      status: 'healthy',\n      timestamp: new Date().toISOString(),\n      version: '1.0.0',\n      environment: \"development\" || 0,\n      region: process.env.AWS_REGION,\n      runtime: `nodejs${process.version}`,\n      memoryLimitInMB: context.memoryLimitInMB,\n      functionName: context.functionName,\n      functionVersion: context.functionVersion,\n      cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID,\n      features: {\n        registration: true,\n        login: true,\n        tokenRefresh: true,\n        profile: true,\n        logout: true,\n      },\n      dependencies: {\n        cognito: 'available',\n        secrets: 'available',\n      },\n    };\n\n    const response = {\n      success: true,\n      data: healthData,\n      message: 'Auth service is healthy',\n      requestId,\n    };\n\n    const duration = Date.now() - startTime;\n    console.log(`[${requestId}] Health check completed successfully in ${duration}ms`);\n\n    return {\n      statusCode: 200,\n      headers: {\n        'Content-Type': 'application/json',\n        'Access-Control-Allow-Origin': '*',\n        'Access-Control-Allow-Headers': 'Content-Type,Authorization',\n        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'\n      },\n      body: JSON.stringify(response),\n    };\n\n  } catch (error) {\n    const duration = Date.now() - startTime;\n    \n    console.error(`[${requestId}] Health check failed after ${duration}ms:`, error);\n\n    return {\n      statusCode: 500,\n      headers: {\n        'Content-Type': 'application/json',\n        'Access-Control-Allow-Origin': '*',\n        'Access-Control-Allow-Headers': 'Content-Type,Authorization',\n        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'\n      },\n      body: JSON.stringify({\n        success: false,\n        message: 'Auth service health check failed',\n        error:  false ? 0 : error.message,\n        requestId,\n      }),\n    };\n  }\n};\n\nmodule.exports = { handler };\n\n//# sourceURL=webpack://@namecard/auth-service/./handlers/health.js?\n}");

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
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__("./handlers/health.js");
/******/ 	var __webpack_export_target__ = exports;
/******/ 	for(var __webpack_i__ in __webpack_exports__) __webpack_export_target__[__webpack_i__] = __webpack_exports__[__webpack_i__];
/******/ 	if(__webpack_exports__.__esModule) Object.defineProperty(__webpack_export_target__, "__esModule", { value: true });
/******/ 	
/******/ })()
;