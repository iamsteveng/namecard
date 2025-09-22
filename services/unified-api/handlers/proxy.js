const https = require('https');
const http = require('http');

// Default service endpoints (staging) used when env vars are missing
const DEFAULT_ENDPOINTS = {
  auth: 'https://rai2raecji.execute-api.ap-southeast-1.amazonaws.com/staging',
  cards: 'https://v7h0gz3ozi.execute-api.ap-southeast-1.amazonaws.com/staging',
  upload: 'https://gk5ezv6x2j.execute-api.ap-southeast-1.amazonaws.com/staging',
};

function resolveEndpoint(service) {
  const envKey = `${service.toUpperCase()}_SERVICE_URL`;
  const raw = process.env[envKey] || DEFAULT_ENDPOINTS[service];

  if (!raw) {
    console.warn(`Unified API proxy missing endpoint for ${service}. Set ${envKey}.`);
    return undefined;
  }

  // Remove trailing slashes to avoid double slash when concatenating with path
  return raw.replace(/\/+$/, '');
}

// Service endpoint mappings resolved at runtime
const SERVICE_ENDPOINTS = {
  auth: resolveEndpoint('auth'),
  cards: resolveEndpoint('cards'),
  upload: resolveEndpoint('upload'),
};

/**
 * Generic proxy handler that routes requests to appropriate microservices
 */
function createProxyHandler(service, path = '') {
  return async (event, context) => {
    console.log(`Proxying request to ${service} service${path ? ' for path: ' + path : ''}`);
    
    const baseUrl = SERVICE_ENDPOINTS[service];
    if (!baseUrl) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        body: JSON.stringify({
          success: false,
          message: `Service ${service} not found`,
          error: 'SERVICE_NOT_FOUND'
        })
      };
    }

    try {
      // Construct target URL
      const targetUrl = `${baseUrl}${path}`;
      const url = new URL(targetUrl);

      const incomingHeaders = event.headers || {};
      const requestHeaders = {};

      for (const [key, value] of Object.entries(incomingHeaders)) {
        if (!value) continue;
        if (key.toLowerCase() === 'host') continue;
        requestHeaders[key] = value;
      }

      const body = event.body
        ? event.isBase64Encoded
          ? Buffer.from(event.body, 'base64')
          : event.body
        : undefined;

      requestHeaders['User-Agent'] = requestHeaders['User-Agent'] || requestHeaders['user-agent'] || 'NameCard-Unified-API/1.0.0';
      if (body) {
        requestHeaders['Content-Length'] = Buffer.isBuffer(body)
          ? body.length
          : Buffer.byteLength(body);
      }
      if (!requestHeaders['Content-Type'] && !requestHeaders['content-type']) {
        requestHeaders['Content-Type'] = 'application/json';
      }

      // Prepare request options
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: event.httpMethod || 'GET',
        headers: requestHeaders,
      };

      // Forward authorization headers if present
      if (event.headers.Authorization || event.headers.authorization) {
        options.headers.Authorization = event.headers.Authorization || event.headers.authorization;
      }

      // Make the HTTP request
      const response = await makeHttpRequest(options, body);
      
      return {
        statusCode: response.statusCode,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        body: response.body
      };

    } catch (error) {
      console.error('Proxy error:', error);
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        body: JSON.stringify({
          success: false,
          message: 'Internal proxy error',
          error: error.message
        })
      };
    }
  };
}

/**
 * Make HTTP request and return promise
 */
function makeHttpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const client = options.port === 443 ? https : http;
    
    const req = client.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    // Write body if present
    if (body) {
      if (Buffer.isBuffer(body)) {
        req.write(body);
      } else {
        req.write(body);
      }
    }

    req.end();
  });
}

// Export individual handlers for each service/endpoint combination
module.exports = {
  // Auth service handlers
  authHealth: createProxyHandler('auth', '/health'),
  authRegister: createProxyHandler('auth', '/register'),
  authLogin: createProxyHandler('auth', '/login'),
  
  // Cards service handlers  
  cardsHealth: createProxyHandler('cards', '/health'),
  cardsGet: createProxyHandler('cards', '/cards'),
  cardsCreate: createProxyHandler('cards', '/cards'),
  
  // Upload service handlers
  uploadHealth: createProxyHandler('upload', '/health'),
  uploadSingle: createProxyHandler('upload', '/single'),
};
