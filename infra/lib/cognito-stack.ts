import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export class CognitoStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create the User Pool
    this.userPool = new cognito.UserPool(this, 'NameCardUserPool', {
      userPoolName: 'namecard-user-pool',
      
      // Sign-in configuration
      signInAliases: {
        email: true,
        username: false,
      },
      
      // Auto-verification
      autoVerify: {
        email: true,
      },
      
      // Password policy
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: cdk.Duration.days(7),
      },
      
      // Account recovery
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      
      // MFA configuration
      mfa: cognito.Mfa.OFF,
      
      // Self sign-up
      selfSignUpEnabled: true,
      
      // User verification
      userVerification: {
        emailSubject: 'Welcome to NameCard - Verify your email',
        emailBody: 'Hello {username}, Welcome to NameCard! Your verification code is {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      
      // Standard attributes
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        givenName: {
          required: true,
          mutable: true,
        },
        familyName: {
          required: false,
          mutable: true,
        },
      },
      
      // Custom attributes
      customAttributes: {
        'company': new cognito.StringAttribute({ 
          minLen: 1, 
          maxLen: 256, 
          mutable: true 
        }),
        'jobTitle': new cognito.StringAttribute({ 
          minLen: 1, 
          maxLen: 100, 
          mutable: true 
        }),
      },
      
      // Lambda triggers (optional - for future use)
      // lambdaTriggers: {
      //   preSignUp: preSignUpLambda,
      //   postConfirmation: postConfirmationLambda,
      // },
      
      // Deletion protection
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Create the User Pool Client (for web application)
    this.userPoolClient = this.userPool.addClient('NameCardWebClient', {
      userPoolClientName: 'namecard-web-client',
      
      // Don't generate a client secret (for frontend apps)
      generateSecret: false,
      
      // Authentication flows
      authFlows: {
        userPassword: true,
        userSrp: true,
        adminUserPassword: true,
        custom: false,
      },
      
      // OAuth configuration (optional for future use)
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          'http://localhost:3000/auth/callback',
          'https://your-domain.com/auth/callback', // Replace with your production domain
        ],
        logoutUrls: [
          'http://localhost:3000/auth/logout',
          'https://your-domain.com/auth/logout', // Replace with your production domain
        ],
      },
      
      // Token validity
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      
      // Security
      preventUserExistenceErrors: true,
      
      // Supported identity providers
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
      ],
    });

    // Create User Pool Domain (for hosted UI - optional)
    const userPoolDomain = this.userPool.addDomain('NameCardUserPoolDomain', {
      cognitoDomain: {
        domainPrefix: `namecard-${cdk.Stack.of(this).account}`, // Unique domain prefix
      },
    });

    // Output the important values
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: 'NameCardUserPoolId',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: 'NameCardUserPoolClientId',
    });

    new cdk.CfnOutput(this, 'UserPoolArn', {
      value: this.userPool.userPoolArn,
      description: 'Cognito User Pool ARN',
      exportName: 'NameCardUserPoolArn',
    });

    new cdk.CfnOutput(this, 'UserPoolDomainUrl', {
      value: `https://${userPoolDomain.domainName}.auth.${cdk.Stack.of(this).region}.amazoncognito.com`,
      description: 'Cognito User Pool Domain URL',
      exportName: 'NameCardUserPoolDomainUrl',
    });

    new cdk.CfnOutput(this, 'Region', {
      value: cdk.Stack.of(this).region,
      description: 'AWS Region',
      exportName: 'NameCardRegion',
    });
  }
}