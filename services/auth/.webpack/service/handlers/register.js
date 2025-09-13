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

/***/ "./handlers/register.js":
/*!******************************!*\
  !*** ./handlers/register.js ***!
  \******************************/
/***/ ((module) => {

eval("{const handler = async (event, context) => {\n  const startTime = Date.now();\n  const requestId = context.awsRequestId;\n\n  console.log(`[${requestId}] User registration request received`);\n\n  try {\n    // Simple test response without any complex imports\n    const testResponse = {\n      success: true,\n      message: 'Registration handler is working',\n      data: {\n        requestId,\n        timestamp: new Date().toISOString(),\n        functionName: context.functionName,\n        memoryLimit: context.memoryLimitInMB,\n        environment: \"development\" || 0,\n      }\n    };\n\n    console.log(`[${requestId}] Test registration response created successfully`);\n\n    return {\n      statusCode: 200,\n      headers: {\n        'Content-Type': 'application/json',\n        'Access-Control-Allow-Origin': '*',\n        'Access-Control-Allow-Headers': 'Content-Type,Authorization',\n        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'\n      },\n      body: JSON.stringify(testResponse),\n    };\n\n  } catch (error) {\n    console.error(`[${requestId}] Registration test error:`, error);\n\n    return {\n      statusCode: 500,\n      headers: {\n        'Content-Type': 'application/json',\n        'Access-Control-Allow-Origin': '*',\n        'Access-Control-Allow-Headers': 'Content-Type,Authorization',\n        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'\n      },\n      body: JSON.stringify({\n        success: false,\n        message: 'Internal server error during registration test',\n        error: error.message,\n        requestId,\n      }),\n    };\n  }\n};\n\nmodule.exports = { handler };\n\n//# sourceURL=webpack://@namecard/auth-service/./handlers/register.js?\n}");

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
/******/ 	var __webpack_exports__ = __webpack_require__("./handlers/register.js");
/******/ 	var __webpack_export_target__ = exports;
/******/ 	for(var __webpack_i__ in __webpack_exports__) __webpack_export_target__[__webpack_i__] = __webpack_exports__[__webpack_i__];
/******/ 	if(__webpack_exports__.__esModule) Object.defineProperty(__webpack_export_target__, "__esModule", { value: true });
/******/ 	
/******/ })()
;