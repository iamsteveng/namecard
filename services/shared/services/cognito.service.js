"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const lambdaLogger_1 = __importDefault(require("../utils/lambdaLogger"));
class CognitoService {
    constructor() {
        const region = process.env.AWS_REGION || 'ap-southeast-1';
        const userPoolId = process.env.COGNITO_USER_POOL_ID;
        const clientId = process.env.COGNITO_CLIENT_ID;
        if (!userPoolId || !clientId) {
            throw new Error('Missing required Cognito environment variables');
        }
        lambdaLogger_1.default.info('Cognito service initialization', {
            region,
            userPoolId,
            clientId,
        });
        this.client = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({
            region,
        });
        this.userPoolId = userPoolId;
        this.clientId = clientId;
    }
    /**
     * Generate secret hash required for Cognito operations
     */
    generateSecretHash(username) {
        const clientSecret = process.env.COGNITO_CLIENT_SECRET;
        if (!clientSecret) {
            return '';
        }
        return crypto_1.default
            .createHmac('SHA256', clientSecret)
            .update(username + this.clientId)
            .digest('base64');
    }
    /**
     * Register a new user in Cognito
     */
    async registerUser(email, password, name) {
        try {
            lambdaLogger_1.default.info('Registering user with Cognito', { email });
            // Create user in Cognito User Pool
            const createUserCommand = new client_cognito_identity_provider_1.AdminCreateUserCommand({
                UserPoolId: this.userPoolId,
                Username: email,
                MessageAction: 'SUPPRESS', // Don't send welcome email, we'll handle verification
                TemporaryPassword: password,
                UserAttributes: [
                    {
                        Name: 'email',
                        Value: email,
                    },
                    {
                        Name: 'name',
                        Value: name,
                    },
                    {
                        Name: 'email_verified',
                        Value: 'false',
                    },
                ],
            });
            const createResult = await this.client.send(createUserCommand);
            const userSub = createResult.User?.Attributes?.find(attr => attr.Name === 'sub')?.Value;
            if (!userSub) {
                throw new Error('Failed to get user sub from Cognito response');
            }
            // Set permanent password
            const setPasswordCommand = new client_cognito_identity_provider_1.AdminSetUserPasswordCommand({
                UserPoolId: this.userPoolId,
                Username: email,
                Password: password,
                Permanent: true,
            });
            await this.client.send(setPasswordCommand);
            lambdaLogger_1.default.info('User registered successfully', { email, userSub });
            return { userSub };
        }
        catch (error) {
            lambdaLogger_1.default.error('Error registering user', error, { email });
            throw new Error(`Registration failed: ${error.message}`);
        }
    }
    /**
     * Authenticate user with email and password
     */
    async authenticateUser(email, password) {
        try {
            lambdaLogger_1.default.info('Authenticating user', { email });
            const authParameters = {
                USERNAME: email,
                PASSWORD: password,
            };
            // Add secret hash if client secret is configured
            const secretHash = this.generateSecretHash(email);
            if (secretHash) {
                authParameters.SECRET_HASH = secretHash;
            }
            const authCommand = new client_cognito_identity_provider_1.AdminInitiateAuthCommand({
                UserPoolId: this.userPoolId,
                ClientId: this.clientId,
                AuthFlow: client_cognito_identity_provider_1.AuthFlowType.ADMIN_NO_SRP_AUTH,
                AuthParameters: authParameters,
            });
            const authResult = await this.client.send(authCommand);
            if (authResult.ChallengeName) {
                // Handle auth challenges (e.g., NEW_PASSWORD_REQUIRED, MFA)
                return {
                    accessToken: '',
                    refreshToken: '',
                    idToken: '',
                    expiresIn: 0,
                    tokenType: 'Bearer',
                    user: {},
                    challengeName: authResult.ChallengeName,
                    session: authResult.Session,
                };
            }
            if (!authResult.AuthenticationResult) {
                throw new Error('Authentication failed - no result returned');
            }
            const { AccessToken, RefreshToken, IdToken, ExpiresIn, TokenType } = authResult.AuthenticationResult;
            if (!AccessToken || !RefreshToken || !IdToken) {
                throw new Error('Authentication failed - missing tokens');
            }
            // Decode the ID token to get user information
            const user = this.decodeIdToken(IdToken);
            lambdaLogger_1.default.info('User authenticated successfully', { email, userSub: user.sub });
            return {
                accessToken: AccessToken,
                refreshToken: RefreshToken,
                idToken: IdToken,
                expiresIn: ExpiresIn || 3600,
                tokenType: TokenType || 'Bearer',
                user,
            };
        }
        catch (error) {
            lambdaLogger_1.default.error('Error authenticating user', error, { email });
            throw new Error(`Authentication failed: ${error.message}`);
        }
    }
    /**
     * Refresh access token using refresh token
     */
    async refreshToken(refreshToken) {
        try {
            const authCommand = new client_cognito_identity_provider_1.AdminInitiateAuthCommand({
                UserPoolId: this.userPoolId,
                ClientId: this.clientId,
                AuthFlow: client_cognito_identity_provider_1.AuthFlowType.REFRESH_TOKEN_AUTH,
                AuthParameters: {
                    REFRESH_TOKEN: refreshToken,
                },
            });
            const authResult = await this.client.send(authCommand);
            if (!authResult.AuthenticationResult) {
                throw new Error('Token refresh failed - no result returned');
            }
            const { AccessToken, IdToken, ExpiresIn, TokenType } = authResult.AuthenticationResult;
            if (!AccessToken || !IdToken) {
                throw new Error('Token refresh failed - missing tokens');
            }
            return {
                accessToken: AccessToken,
                refreshToken, // Original refresh token is still valid
                idToken: IdToken,
                expiresIn: ExpiresIn || 3600,
                tokenType: TokenType || 'Bearer',
            };
        }
        catch (error) {
            lambdaLogger_1.default.error('Error refreshing token', error);
            throw new Error(`Token refresh failed: ${error.message}`);
        }
    }
    /**
     * Get user information from Cognito
     */
    async getUser(username) {
        try {
            const getUserCommand = new client_cognito_identity_provider_1.AdminGetUserCommand({
                UserPoolId: this.userPoolId,
                Username: username,
            });
            const result = await this.client.send(getUserCommand);
            if (!result.UserAttributes) {
                throw new Error('User not found');
            }
            const attributes = result.UserAttributes.reduce((acc, attr) => {
                if (attr.Name && attr.Value) {
                    acc[attr.Name] = attr.Value;
                }
                return acc;
            }, {});
            return {
                sub: attributes.sub,
                email: attributes.email,
                name: attributes.name,
                email_verified: attributes.email_verified === 'true',
                preferred_username: attributes.preferred_username,
            };
        }
        catch (error) {
            lambdaLogger_1.default.error('Error getting user', error, { username });
            throw new Error(`Failed to get user: ${error.message}`);
        }
    }
    /**
     * Update user attributes
     */
    async updateUser(username, attributes) {
        try {
            const userAttributes = Object.entries(attributes).map(([name, value]) => ({
                Name: name,
                Value: value,
            }));
            const updateCommand = new client_cognito_identity_provider_1.AdminUpdateUserAttributesCommand({
                UserPoolId: this.userPoolId,
                Username: username,
                UserAttributes: userAttributes,
            });
            await this.client.send(updateCommand);
            lambdaLogger_1.default.info('User updated successfully', { username });
        }
        catch (error) {
            lambdaLogger_1.default.error('Error updating user', error, { username });
            throw new Error(`Failed to update user: ${error.message}`);
        }
    }
    /**
     * Initiate forgot password flow
     */
    async forgotPassword(email) {
        try {
            const authParameters = {
                Username: email,
            };
            const secretHash = this.generateSecretHash(email);
            if (secretHash) {
                authParameters.SecretHash = secretHash;
            }
            const forgotPasswordCommand = new client_cognito_identity_provider_1.ForgotPasswordCommand({
                ClientId: this.clientId,
                ...authParameters,
            });
            await this.client.send(forgotPasswordCommand);
            lambdaLogger_1.default.info('Forgot password initiated', { email });
        }
        catch (error) {
            lambdaLogger_1.default.error('Error initiating forgot password', error, { email });
            throw new Error(`Forgot password failed: ${error.message}`);
        }
    }
    /**
     * Confirm forgot password with verification code
     */
    async confirmForgotPassword(email, confirmationCode, newPassword) {
        try {
            const authParameters = {
                Username: email,
                ConfirmationCode: confirmationCode,
                Password: newPassword,
            };
            const secretHash = this.generateSecretHash(email);
            if (secretHash) {
                authParameters.SecretHash = secretHash;
            }
            const confirmCommand = new client_cognito_identity_provider_1.ConfirmForgotPasswordCommand({
                ClientId: this.clientId,
                ...authParameters,
            });
            await this.client.send(confirmCommand);
            lambdaLogger_1.default.info('Password reset confirmed', { email });
        }
        catch (error) {
            lambdaLogger_1.default.error('Error confirming password reset', error, { email });
            throw new Error(`Password reset confirmation failed: ${error.message}`);
        }
    }
    /**
     * Sign out user globally (invalidate all tokens)
     */
    async globalSignOut(accessToken) {
        try {
            const signOutCommand = new client_cognito_identity_provider_1.GlobalSignOutCommand({
                AccessToken: accessToken,
            });
            await this.client.send(signOutCommand);
            lambdaLogger_1.default.info('User signed out globally');
        }
        catch (error) {
            lambdaLogger_1.default.error('Error signing out user', error);
            throw new Error(`Sign out failed: ${error.message}`);
        }
    }
    /**
     * Delete user from Cognito
     */
    async deleteUser(username) {
        try {
            const deleteCommand = new client_cognito_identity_provider_1.AdminDeleteUserCommand({
                UserPoolId: this.userPoolId,
                Username: username,
            });
            await this.client.send(deleteCommand);
            lambdaLogger_1.default.info('User deleted from Cognito', { username });
        }
        catch (error) {
            lambdaLogger_1.default.error('Error deleting user', error, { username });
            throw new Error(`Failed to delete user: ${error.message}`);
        }
    }
    /**
     * Verify JWT token and extract user information
     */
    async verifyToken(token) {
        try {
            // For production, you should verify the JWT signature using Cognito's public keys
            // For now, we'll decode the token to get user info
            const user = this.decodeIdToken(token);
            return user;
        }
        catch (error) {
            lambdaLogger_1.default.error('Error verifying token', error);
            throw new Error(`Token verification failed: ${error.message}`);
        }
    }
    /**
     * Decode ID token to extract user information
     * Note: In production, you should verify the JWT signature
     */
    decodeIdToken(idToken) {
        try {
            const payload = idToken.split('.')[1];
            const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
            return {
                sub: decoded.sub,
                email: decoded.email,
                name: decoded.name,
                email_verified: decoded.email_verified,
                preferred_username: decoded.preferred_username,
            };
        }
        catch (error) {
            throw new Error('Invalid token format');
        }
    }
}
exports.default = new CognitoService();
