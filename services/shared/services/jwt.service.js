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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyAuthToken = verifyAuthToken;
exports.verifyAuthTokenSimple = verifyAuthTokenSimple;
const index_1 = require("../index");
/**
 * Extract and verify JWT token from Authorization header
 */
async function verifyAuthToken(authHeader) {
    if (!authHeader?.startsWith('Bearer ')) {
        return null;
    }
    const token = authHeader.slice(7);
    try {
        // Verify token with Cognito service
        const cognitoUser = await index_1.cognitoService.verifyToken(token);
        // Get user from database using Cognito ID
        const { getPrismaClient } = await Promise.resolve().then(() => __importStar(require('../index')));
        const prisma = await getPrismaClient();
        const user = await prisma.user.findUnique({
            where: { cognitoId: cognitoUser.sub },
            select: { id: true, cognitoId: true, email: true, name: true },
        });
        if (!user) {
            return null;
        }
        return {
            id: user.id,
            cognitoId: user.cognitoId,
            email: user.email,
            name: user.name || undefined,
        };
    }
    catch (error) {
        return null;
    }
}
/**
 * Simplified token verification for development/testing
 * Note: This should only be used for development purposes
 */
async function verifyAuthTokenSimple(authHeader) {
    if (!authHeader?.startsWith('Bearer ')) {
        return null;
    }
    const token = authHeader.slice(7);
    try {
        // For development purposes, we'll decode without verification
        // In production, use proper JWT verification
        const payload = token.split('.')[1];
        const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
        const { getPrismaClient } = await Promise.resolve().then(() => __importStar(require('../index')));
        const prisma = await getPrismaClient();
        const user = await prisma.user.findUnique({
            where: { cognitoId: decoded.sub },
            select: { id: true, cognitoId: true, email: true, name: true },
        });
        if (!user) {
            return null;
        }
        return {
            id: user.id,
            cognitoId: user.cognitoId,
            email: user.email,
            name: user.name || undefined,
        };
    }
    catch (error) {
        return null;
    }
}
