import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deployment from 'aws-cdk-lib/aws-s3-deployment';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface FrontendStackProps extends cdk.StackProps {
  environment: string;
  apiUrl: string;
  domainName?: string;
  certificateArn?: string;
}

export class FrontendStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public readonly bucketName: string;
  public readonly cloudFrontDomainName: string;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const { environment, apiUrl, domainName, certificateArn } = props;

    // Generate bucket name for frontend
    this.bucketName = `namecard-frontend-${environment}-${this.account}`;

    // Create S3 bucket for frontend static files
    this.bucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: this.bucketName,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      
      // Website configuration
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html', // For SPA routing
      
      removalPolicy: environment === 'production' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'production',
    });

    // CloudFront Origin Access Control (modern approach)
    const oac = new cloudfront.S3OriginAccessControl(this, 'FrontendOAC', {
      description: `OAC for NameCard Frontend - ${environment}`,
    });

    // Grant CloudFront access to S3 bucket
    this.bucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'AllowCloudFrontServicePrincipal',
      effect: iam.Effect.ALLOW,
      principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
      actions: ['s3:GetObject'],
      resources: [`${this.bucket.bucketArn}/*`],
      conditions: {
        StringEquals: {
          'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/*`,
        },
      },
    }));

    // CloudFront distribution for frontend
    this.distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      comment: `NameCard Frontend CDN - ${environment}`,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
        cachePolicy: new cloudfront.CachePolicy(this, 'FrontendCachePolicy', {
          cachePolicyName: `namecard-frontend-cache-${environment}`,
          comment: 'Cache policy for NameCard frontend',
          defaultTtl: cdk.Duration.hours(1),
          maxTtl: cdk.Duration.days(1),
          minTtl: cdk.Duration.seconds(0),
          headerBehavior: cloudfront.CacheHeaderBehavior.none(),
          queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
        }),
      },
      
      // API proxy behavior - forward all API requests to the backend
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(apiUrl.replace(/^https?:\/\//, ''), {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
      },
      
      // Custom error responses for SPA routing
      // Only applies to S3 origin (frontend), not API routes
      // This ensures React Router can handle all frontend routes
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
      
      // Default root object for SPA
      defaultRootObject: 'index.html',
      
      // Domain configuration (optional)
      domainNames: domainName ? [domainName] : undefined,
      
      priceClass: environment === 'production' 
        ? cloudfront.PriceClass.PRICE_CLASS_ALL
        : cloudfront.PriceClass.PRICE_CLASS_100,

      // HTTP version
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
    });

    this.cloudFrontDomainName = this.distribution.domainName;

    // Add stack tags
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('Application', 'NameCard');
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
    cdk.Tags.of(this).add('Stack', 'Frontend');

    // Create outputs
    this.createOutputs(environment, apiUrl);
  }

  // Method to deploy frontend assets
  public deployAssets(buildPath: string): s3deployment.BucketDeployment {
    return new s3deployment.BucketDeployment(this, 'DeployFrontend', {
      sources: [s3deployment.Source.asset(buildPath)],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
      
      // Cache control for different file types
      cacheControl: [
        s3deployment.CacheControl.setPublic(),
        s3deployment.CacheControl.maxAge(cdk.Duration.days(1)),
      ],
      
      // Metadata for static assets
      metadata: {
        'Cache-Control': 'public, max-age=86400', // 1 day
      },
    });
  }

  private createOutputs(environment: string, apiUrl: string): void {
    // S3 Bucket outputs
    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: this.bucket.bucketName,
      description: 'Name of the S3 bucket for frontend',
      exportName: `${this.stackName}-FrontendBucketName`,
    });

    new cdk.CfnOutput(this, 'FrontendBucketArn', {
      value: this.bucket.bucketArn,
      description: 'ARN of the frontend S3 bucket',
      exportName: `${this.stackName}-FrontendBucketArn`,
    });

    // CloudFront outputs
    new cdk.CfnOutput(this, 'FrontendDistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID for frontend',
      exportName: `${this.stackName}-FrontendDistributionId`,
    });

    new cdk.CfnOutput(this, 'FrontendDomainName', {
      value: this.distribution.domainName,
      description: 'CloudFront distribution domain name for frontend',
      exportName: `${this.stackName}-FrontendDomainName`,
    });

    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `https://${this.distribution.domainName}`,
      description: 'Frontend application URL',
      exportName: `${this.stackName}-FrontendUrl`,
    });

    // Environment summary
    new cdk.CfnOutput(this, 'FrontendDeploymentSummary', {
      value: JSON.stringify({
        environment,
        frontendUrl: `https://${this.distribution.domainName}`,
        apiUrl,
        bucketName: this.bucketName,
        region: this.region,
      }),
      description: 'Frontend deployment summary',
    });
  }
}