import crypto from 'crypto';

import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminInitiateAuthCommand,
  // AdminConfirmSignUpCommand, // Currently unused
  AdminDeleteUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminGetUserCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  AuthFlowType,
  ChallengeName,
  // AdminRespondToAuthChallengeCommand, // Currently unused
  GlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';

import { env } from '../config/env.js';
import logger from '../utils/logger.js';

export interface CognitoUser {
  sub: string;
  email: string;
  name?: string;
  email_verified?: boolean;
  preferred_username?: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface CognitoAuthResult extends AuthResult {
  user: CognitoUser;
  challengeName?: ChallengeName;
  session?: string;
}

class CognitoService {
  private client: CognitoIdentityProviderClient;
  private userPoolId: string;
  private clientId: string;

  constructor() {
    // Debug AWS credentials
    logger.info('Cognito service initialization', {
      region: env.cognito.region,
      hasAccessKey: !!env.aws.accessKeyId,
      awsProfile: process.env.AWS_PROFILE || 'not-set',
      userPoolId: env.cognito.userPoolId,
      clientId: env.cognito.clientId,
    });

    this.client = new CognitoIdentityProviderClient({
      region: env.cognito.region,
      // Only use explicit credentials if both are provided and valid
      // Otherwise, let AWS SDK use the default credential chain (profile, IAM role, etc.)
      ...(env.aws.accessKeyId &&
      env.aws.secretAccessKey &&
      env.aws.accessKeyId !== 'your-access-key-here'
        ? {
            credentials: {
              accessKeyId: env.aws.accessKeyId,
              secretAccessKey: env.aws.secretAccessKey,
            },
          }
        : {}),
    });

    this.userPoolId = env.cognito.userPoolId;
    this.clientId = env.cognito.clientId;
  }

  /**
   * Generate secret hash required for Cognito operations
   */
  private generateSecretHash(username: string): string {
    return crypto
      .createHmac('SHA256', process.env.COGNITO_CLIENT_SECRET || '')
      .update(username + this.clientId)
      .digest('base64');
  }

  /**
   * Register a new user in Cognito
   */
  async registerUser(
    email: string,
    password: string,
    name: string
  ): Promise<{ userSub: string; tempPassword?: string }> {
    try {
      logger.info('Registering user with Cognito', { email });

      // Create user in Cognito User Pool
      const createUserCommand = new AdminCreateUserCommand({
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
      const setPasswordCommand = new AdminSetUserPasswordCommand({
        UserPoolId: this.userPoolId,
        Username: email,
        Password: password,
        Permanent: true,
      });

      await this.client.send(setPasswordCommand);

      logger.info('User registered successfully', { email, userSub });
      return { userSub };
    } catch (error: any) {
      logger.error('Error registering user', { email, error: error.message });
      throw new Error(`Registration failed: ${error.message}`);
    }
  }

  /**
   * Authenticate user with email and password
   */
  async authenticateUser(email: string, password: string): Promise<CognitoAuthResult> {
    try {
      logger.info('Authenticating user', { email });

      const authCommand = new AdminInitiateAuthCommand({
        UserPoolId: this.userPoolId,
        ClientId: this.clientId,
        AuthFlow: AuthFlowType.ADMIN_NO_SRP_AUTH,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
          // SECRET_HASH: this.generateSecretHash(email), // Only if client secret is configured
        },
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
          user: {} as CognitoUser,
          challengeName: authResult.ChallengeName as any,
          session: authResult.Session,
        };
      }

      if (!authResult.AuthenticationResult) {
        throw new Error('Authentication failed - no result returned');
      }

      const { AccessToken, RefreshToken, IdToken, ExpiresIn, TokenType } =
        authResult.AuthenticationResult;

      if (!AccessToken || !RefreshToken || !IdToken) {
        throw new Error('Authentication failed - missing tokens');
      }

      // Decode the ID token to get user information
      const user = this.decodeIdToken(IdToken);

      logger.info('User authenticated successfully', { email, userSub: user.sub });

      return {
        accessToken: AccessToken,
        refreshToken: RefreshToken,
        idToken: IdToken,
        expiresIn: ExpiresIn || 3600,
        tokenType: TokenType || 'Bearer',
        user,
      };
    } catch (error: any) {
      logger.error('Error authenticating user', { email, error: error.message });
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<AuthResult> {
    try {
      const authCommand = new AdminInitiateAuthCommand({
        UserPoolId: this.userPoolId,
        ClientId: this.clientId,
        AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
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
    } catch (error: any) {
      logger.error('Error refreshing token', { error: error.message });
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }

  /**
   * Get user information from Cognito
   */
  async getUser(username: string): Promise<CognitoUser> {
    try {
      const getUserCommand = new AdminGetUserCommand({
        UserPoolId: this.userPoolId,
        Username: username,
      });

      const result = await this.client.send(getUserCommand);

      if (!result.UserAttributes) {
        throw new Error('User not found');
      }

      const attributes = result.UserAttributes.reduce(
        (acc, attr) => {
          if (attr.Name && attr.Value) {
            acc[attr.Name] = attr.Value;
          }
          return acc;
        },
        {} as Record<string, string>
      );

      return {
        sub: attributes.sub,
        email: attributes.email,
        name: attributes.name,
        email_verified: attributes.email_verified === 'true',
        preferred_username: attributes.preferred_username,
      };
    } catch (error: any) {
      logger.error('Error getting user', { username, error: error.message });
      throw new Error(`Failed to get user: ${error.message}`);
    }
  }

  /**
   * Update user attributes
   */
  async updateUser(username: string, attributes: Record<string, string>): Promise<void> {
    try {
      const userAttributes = Object.entries(attributes).map(([name, value]) => ({
        Name: name,
        Value: value,
      }));

      const updateCommand = new AdminUpdateUserAttributesCommand({
        UserPoolId: this.userPoolId,
        Username: username,
        UserAttributes: userAttributes,
      });

      await this.client.send(updateCommand);
      logger.info('User updated successfully', { username });
    } catch (error: any) {
      logger.error('Error updating user', { username, error: error.message });
      throw new Error(`Failed to update user: ${error.message}`);
    }
  }

  /**
   * Initiate forgot password flow
   */
  async forgotPassword(email: string): Promise<void> {
    try {
      const forgotPasswordCommand = new ForgotPasswordCommand({
        ClientId: this.clientId,
        Username: email,
        // SecretHash: this.generateSecretHash(email), // Only if client secret is configured
      });

      await this.client.send(forgotPasswordCommand);
      logger.info('Forgot password initiated', { email });
    } catch (error: any) {
      logger.error('Error initiating forgot password', { email, error: error.message });
      throw new Error(`Forgot password failed: ${error.message}`);
    }
  }

  /**
   * Confirm forgot password with verification code
   */
  async confirmForgotPassword(
    email: string,
    confirmationCode: string,
    newPassword: string
  ): Promise<void> {
    try {
      const confirmCommand = new ConfirmForgotPasswordCommand({
        ClientId: this.clientId,
        Username: email,
        ConfirmationCode: confirmationCode,
        Password: newPassword,
        // SecretHash: this.generateSecretHash(email), // Only if client secret is configured
      });

      await this.client.send(confirmCommand);
      logger.info('Password reset confirmed', { email });
    } catch (error: any) {
      logger.error('Error confirming password reset', { email, error: error.message });
      throw new Error(`Password reset confirmation failed: ${error.message}`);
    }
  }

  /**
   * Sign out user globally (invalidate all tokens)
   */
  async globalSignOut(accessToken: string): Promise<void> {
    try {
      const signOutCommand = new GlobalSignOutCommand({
        AccessToken: accessToken,
      });

      await this.client.send(signOutCommand);
      logger.info('User signed out globally');
    } catch (error: any) {
      logger.error('Error signing out user', { error: error.message });
      throw new Error(`Sign out failed: ${error.message}`);
    }
  }

  /**
   * Delete user from Cognito
   */
  async deleteUser(username: string): Promise<void> {
    try {
      const deleteCommand = new AdminDeleteUserCommand({
        UserPoolId: this.userPoolId,
        Username: username,
      });

      await this.client.send(deleteCommand);
      logger.info('User deleted from Cognito', { username });
    } catch (error: any) {
      logger.error('Error deleting user', { username, error: error.message });
      throw new Error(`Failed to delete user: ${error.message}`);
    }
  }

  /**
   * Verify JWT token and extract user information
   */
  async verifyToken(token: string): Promise<CognitoUser> {
    try {
      // For production, you should verify the JWT signature using Cognito's public keys
      // For now, we'll decode the token to get user info
      const user = this.decodeIdToken(token);
      return user;
    } catch (error: any) {
      logger.error('Error verifying token', { error: error.message });
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }

  /**
   * Decode ID token to extract user information
   * Note: In production, you should verify the JWT signature
   */
  private decodeIdToken(idToken: string): CognitoUser {
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
    } catch (error) {
      throw new Error('Invalid token format');
    }
  }
}

export default new CognitoService();
