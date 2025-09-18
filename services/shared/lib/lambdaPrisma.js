"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrismaClient = getPrismaClient;
exports.disconnectPrisma = disconnectPrisma;
exports.setupLambdaCleanup = setupLambdaCleanup;
const client_1 = require("@prisma/client");
const secrets_service_1 = require("../services/secrets.service");
// Lambda-optimized Prisma client with Secrets Manager integration
let prisma = null;
let connectionPromise = null;
let databaseUrl = null;
async function getDatabaseUrl() {
    if (!databaseUrl) {
        const { url } = await secrets_service_1.secretsService.getDatabaseConfig();
        databaseUrl = url;
    }
    return databaseUrl;
}
function createPrismaClient(url) {
    const client = new client_1.PrismaClient({
        datasourceUrl: url,
        log: process.env.NODE_ENV === 'production'
            ? [
                { emit: 'event', level: 'error' },
                { emit: 'event', level: 'warn' },
            ]
            : ['error', 'warn'],
        errorFormat: 'minimal',
    });
    // Set up error handling
    client.$on('error', (e) => {
        console.error('Prisma client error:', e);
    });
    // Set up query logging in development
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
        client.$on('query', (e) => {
            console.log(`Query: ${e.query}`);
            console.log(`Duration: ${e.duration}ms`);
        });
    }
    return client;
}
async function connectPrisma() {
    if (!prisma) {
        const url = await getDatabaseUrl();
        prisma = createPrismaClient(url);
    }
    try {
        await prisma.$connect();
        console.log('Lambda: Database connection established successfully');
    }
    catch (error) {
        console.error('Lambda: Failed to connect to database:', error);
        throw error;
    }
}
// Get Prisma instance with connection management for Lambda
async function getPrismaClient() {
    // Reuse existing connection if available
    if (prisma) {
        try {
            // Test connection with a simple query
            await prisma.$queryRaw `SELECT 1`;
            return prisma;
        }
        catch (error) {
            console.warn('Lambda: Existing connection failed, creating new one:', error);
            // Connection failed, reset and reconnect
            prisma = null;
            connectionPromise = null;
        }
    }
    // Create new connection if needed
    if (!connectionPromise) {
        connectionPromise = connectPrisma();
    }
    await connectionPromise;
    if (!prisma) {
        throw new Error('Lambda: Failed to establish database connection');
    }
    return prisma;
}
// Lambda-friendly disconnect function
async function disconnectPrisma() {
    if (prisma) {
        await prisma.$disconnect();
        prisma = null;
        connectionPromise = null;
        databaseUrl = null; // Clear cached URL
        console.log('Lambda: Database connection closed');
    }
}
// Lambda context cleanup handler - keep connections alive between invocations
function setupLambdaCleanup() {
    // Only disconnect on process termination
    process.on('SIGTERM', async () => {
        await disconnectPrisma();
    });
}
// Initialize cleanup handlers
setupLambdaCleanup();
exports.default = getPrismaClient;
