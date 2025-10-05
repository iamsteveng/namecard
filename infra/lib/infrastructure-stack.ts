import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface InfrastructureStackProps extends cdk.StackProps {
  environment: string;
}

export class InfrastructureStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly cloudFrontDistribution: cloudfront.Distribution;
  public readonly bucketName: string;
  public readonly cloudFrontDomainName: string;

  constructor(scope: Construct, id: string, props: InfrastructureStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // Generate bucket name based on environment
    this.bucketName = `namecard-images-${environment}-${this.account}`;

    // Create S3 bucket for image storage
    this.bucket = new s3.Bucket(this, 'NameCardImagesBucket', {
      bucketName: this.bucketName,
      // Security settings
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      
      // Lifecycle management
      lifecycleRules: [
        {
          id: 'DeleteIncompleteMultipartUploads',
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
        {
          id: 'DeleteOldVersions',
          enabled: true,
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
        {
          id: 'TransitionToIA',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],

      // Versioning for data protection
      versioned: true,

      // CORS configuration for web access
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: this.getAllowedOrigins(environment),
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],

      // Event notifications
      eventBridgeEnabled: true,

      // Remove bucket when stack is deleted (only for dev/staging)
      removalPolicy: environment === 'production' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'production',
    });

    // Create CloudFront distribution for CDN
    this.cloudFrontDistribution = this.createCloudFrontDistribution(environment);
    this.cloudFrontDomainName = this.cloudFrontDistribution.domainName;

    // Create IAM policies for API access
    this.createIAMPolicies(environment);

    // Add stack-level tags
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('Application', 'NameCard');
    cdk.Tags.of(this).add('ManagedBy', 'CDK');

    // Output important values
    this.createOutputs(environment);
  }

  private getAllowedOrigins(environment: string): string[] {
    const origins = ['http://localhost:3000']; // Always allow localhost for development

    switch (environment) {
      case 'development':
        origins.push('http://localhost:3001', 'http://127.0.0.1:3000');
        break;
      case 'staging':
        origins.push('https://staging.namecard.app');
        break;
      case 'production':
        origins.push('https://namecard.app', 'https://www.namecard.app');
        break;
    }

    return origins;
  }

  private createCloudFrontDistribution(environment: string): cloudfront.Distribution {
    // Origin Access Identity for secure S3 access
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(
      this,
      'NameCardImagesOAI',
      {
        comment: `OAI for NameCard Images Bucket - ${environment}`,
      }
    );

    // Grant CloudFront access to S3 bucket
    this.bucket.grantRead(originAccessIdentity);

    // Create CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'NameCardImagesCDN', {
      comment: `NameCard Images CDN - ${environment}`,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessIdentity(this.bucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      
      // Additional behaviors for API-style access
      additionalBehaviors: {
        '/images/*': {
          origin: origins.S3BucketOrigin.withOriginAccessIdentity(this.bucket, {
            originAccessIdentity,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: new cloudfront.CachePolicy(this, 'ImagesCachePolicy', {
            cachePolicyName: `namecard-images-cache-${environment}`,
            comment: 'Cache policy for NameCard images',
            defaultTtl: cdk.Duration.days(1),
            maxTtl: cdk.Duration.days(365),
            minTtl: cdk.Duration.seconds(0),
            headerBehavior: cloudfront.CacheHeaderBehavior.allowList(
              'Access-Control-Request-Headers',
              'Access-Control-Request-Method',
              'Origin'
            ),
            queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
          }),
          compress: true,
        },
      },

      // Geographic restrictions (if needed)
      geoRestriction: environment === 'production' 
        ? cloudfront.GeoRestriction.allowlist('US', 'CA', 'GB', 'DE', 'FR', 'AU', 'JP')
        : undefined, // No restrictions for dev/staging

      // Error pages
      errorResponses: [
        {
          httpStatus: 404,
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 403,
          ttl: cdk.Duration.minutes(5),
        },
      ],

      // Price class
      priceClass: environment === 'production' 
        ? cloudfront.PriceClass.PRICE_CLASS_ALL
        : cloudfront.PriceClass.PRICE_CLASS_100,

      // HTTP version
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
    });

    return distribution;
  }

  private createIAMPolicies(environment: string): void {
    // IAM policy for API application access
    const apiAccessPolicy = new iam.ManagedPolicy(this, 'NameCardS3ApiAccessPolicy', {
      managedPolicyName: `namecard-s3-api-access-${environment}`,
      description: 'Policy for NameCard API to access S3 bucket',
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            's3:GetObject',
            's3:PutObject',
            's3:DeleteObject',
            's3:GetObjectVersion',
            's3:PutObjectAcl',
          ],
          resources: [`${this.bucket.bucketArn}/*`],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            's3:ListBucket',
            's3:GetBucketLocation',
            's3:GetBucketVersioning',
          ],
          resources: [this.bucket.bucketArn],
        }),
      ],
    });

    // IAM role for EC2/ECS/Lambda (if using these services)
    const apiServiceRole = new iam.Role(this, 'NameCardApiServiceRole', {
      roleName: `namecard-api-service-role-${environment}`,
      description: 'Service role for NameCard API to access AWS resources',
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('ec2.amazonaws.com'),
        new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        new iam.ServicePrincipal('lambda.amazonaws.com'),
      ),
      managedPolicies: [apiAccessPolicy],
    });

    // Create outputs for the IAM resources
    new cdk.CfnOutput(this, 'ApiAccessPolicyArn', {
      value: apiAccessPolicy.managedPolicyArn,
      description: 'ARN of the API access policy',
      exportName: `${this.stackName}-ApiAccessPolicyArn`,
    });

    new cdk.CfnOutput(this, 'ApiServiceRoleArn', {
      value: apiServiceRole.roleArn,
      description: 'ARN of the API service role',
      exportName: `${this.stackName}-ApiServiceRoleArn`,
    });
  }

  private createOutputs(environment: string): void {
    // S3 Bucket outputs
    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'Name of the S3 bucket for images',
      exportName: `${this.stackName}-BucketName`,
    });

    new cdk.CfnOutput(this, 'BucketArn', {
      value: this.bucket.bucketArn,
      description: 'ARN of the S3 bucket',
      exportName: `${this.stackName}-BucketArn`,
    });

    new cdk.CfnOutput(this, 'BucketDomainName', {
      value: this.bucket.bucketDomainName,
      description: 'Domain name of the S3 bucket',
      exportName: `${this.stackName}-BucketDomainName`,
    });

    // CloudFront outputs
    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.cloudFrontDistribution.distributionId,
      description: 'CloudFront distribution ID',
      exportName: `${this.stackName}-CloudFrontDistributionId`,
    });

    new cdk.CfnOutput(this, 'CloudFrontDomainName', {
      value: this.cloudFrontDistribution.domainName,
      description: 'CloudFront distribution domain name',
      exportName: `${this.stackName}-CloudFrontDomainName`,
    });

    new cdk.CfnOutput(this, 'CDNUrl', {
      value: `https://${this.cloudFrontDistribution.domainName}`,
      description: 'CDN URL for images',
      exportName: `${this.stackName}-CDNUrl`,
    });

    // Environment variables for application
    new cdk.CfnOutput(this, 'S3BucketNameEnvVar', {
      value: this.bucket.bucketName,
      description: 'Environment variable: S3_BUCKET_NAME',
      exportName: `${this.stackName}-S3-BUCKET-NAME`,
    });

    new cdk.CfnOutput(this, 'S3RegionEnvVar', {
      value: this.region,
      description: 'Environment variable: S3_REGION',
      exportName: `${this.stackName}-S3-REGION`,
    });

    new cdk.CfnOutput(this, 'S3CdnDomainEnvVar', {
      value: this.cloudFrontDistribution.domainName,
      description: 'Environment variable: S3_CDN_DOMAIN',
      exportName: `${this.stackName}-S3-CDN-DOMAIN`,
    });

    // Output summary information
    new cdk.CfnOutput(this, 'StackSummary', {
      value: JSON.stringify({
        environment,
        bucketName: this.bucketName,
        cdnDomain: this.cloudFrontDomainName,
        region: this.region,
      }),
      description: 'Stack deployment summary',
    });
  }
}
