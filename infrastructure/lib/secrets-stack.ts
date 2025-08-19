/**
 * Secrets Management Stack
 * 
 * Manages application secrets with proper lifecycle and deployment strategies
 */

import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface SecretsStackProps extends cdk.StackProps {
  environment: string;
}

export class SecretsStack extends cdk.Stack {
  public readonly apiSecret: secretsmanager.ISecret;
  public readonly databaseSecret: secretsmanager.ISecret;
  
  constructor(scope: Construct, id: string, props: SecretsStackProps) {
    super(scope, id, props);
    
    const { environment } = props;
    
    // Database secrets (reference existing)
    this.databaseSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 
      'DatabaseSecret', 
      `namecard/database/${environment}`
    );
    
    // API Application Secrets - reference existing secret
    // We don't recreate it to avoid disrupting the current deployment
    this.apiSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'APISecret',
      `namecard/api/${environment}`
    );
    
    // Add tags for better management
    cdk.Tags.of(this.apiSecret).add('Environment', environment);
    cdk.Tags.of(this.apiSecret).add('Application', 'NameCard');
    cdk.Tags.of(this.apiSecret).add('SecretType', 'API');
    
    cdk.Tags.of(this.databaseSecret).add('Environment', environment);
    cdk.Tags.of(this.databaseSecret).add('Application', 'NameCard');
    cdk.Tags.of(this.databaseSecret).add('SecretType', 'Database');
    
    // Output secret ARNs for cross-stack reference
    new cdk.CfnOutput(this, 'APISecretArn', {
      value: this.apiSecret.secretArn,
      description: 'ARN of the API secrets',
      exportName: `namecard-api-secret-arn-${environment}`,
    });
    
    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: this.databaseSecret.secretArn,
      description: 'ARN of the database secrets',
      exportName: `namecard-db-secret-arn-${environment}`,
    });
    
    // Create IAM role for GitHub Actions secret management
    const githubActionsRole = new iam.Role(this, 'GitHubActionsSecretsRole', {
      roleName: `namecard-github-secrets-role-${environment}`,
      assumedBy: new iam.WebIdentityPrincipal(
        'arn:aws:iam::' + this.account + ':oidc-provider/token.actions.githubusercontent.com'
      ).withConditions({
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          'token.actions.githubusercontent.com:sub': 'repo:iamsteveng/namecard:*',
        },
      }),
      description: 'Role for GitHub Actions to manage secrets',
    });
    
    // Grant GitHub Actions permission to update API secrets
    this.apiSecret.grantWrite(githubActionsRole);
    
    new cdk.CfnOutput(this, 'GitHubActionsRoleArn', {
      value: githubActionsRole.roleArn,
      description: 'IAM Role ARN for GitHub Actions secret management',
      exportName: `namecard-github-role-arn-${environment}`,
    });
  }
  
  /**
   * Create a helper method for adding new API keys to the secret
   */
  public grantSecretAccess(principal: iam.IPrincipal): void {
    this.apiSecret.grantRead(principal);
  }
}