import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as waf from "aws-cdk-lib/aws-wafv2";
import { Construct } from "constructs";
import { Constants } from "../../config/constants";

export interface InfrastructureStackProps extends cdk.StackProps {}

export class InfrastructureStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly webSecurityGroup: ec2.SecurityGroup;
  public readonly certificate: acm.Certificate;
  public readonly distribution: cloudfront.Distribution;
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly webAcl: waf.CfnWebACL;
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC Configuration - Single AZ for cost optimization
    this.vpc = new ec2.Vpc(this, "SiteChatVPC", {
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    // Security Groups Configuration
    this.webSecurityGroup = new ec2.SecurityGroup(this, "WebSecurityGroup", {
      vpc: this.vpc,
      description: "Security group for web traffic",
      allowAllOutbound: true,
    });

    // Allow HTTPS from CloudFront IPs only
    this.webSecurityGroup.addIngressRule(
      ec2.Peer.ipv4("130.176.0.0/16"),
      ec2.Port.tcp(Constants.HTTPS_PORT),
      "Allow HTTPS from CloudFront"
    );

    // Route 53 Configuration
    const hostedZone = new route53.PublicHostedZone(this, "PublicHostedZone", {
      zoneName: Constants.DOMAIN_NAME,
    });

    // ACM Certificate
    this.certificate = new acm.Certificate(this, "SiteChatCertificate", {
      domainName: Constants.DOMAIN_NAME,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // Create ALB
    this.alb = new elbv2.ApplicationLoadBalancer(this, "SiteChatALB", {
      vpc: this.vpc,
      internetFacing: false, // Internal ALB since CloudFront will be in front
      securityGroup: this.webSecurityGroup,
    });

    // WAF Web ACL with basic rules
    this.webAcl = new waf.CfnWebACL(this, "SiteChatWebAcl", {
      defaultAction: { allow: {} },
      scope: "CLOUDFRONT",
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: "SiteChatWebAclMetric",
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: "RateLimit",
          priority: 1,
          statement: {
            rateBasedStatement: {
              limit: 2000,
              aggregateKeyType: "IP",
            },
          },
          action: { block: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: "RateLimitRule",
          },
        },
        {
          name: "AWSManagedRulesCommonRuleSet",
          priority: 2,
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesCommonRuleSet",
            },
          },
          overrideAction: { none: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: "AWSManagedRulesCommonRuleSetMetric",
          },
        },
      ],
    });

    // Create custom cache policies
    const staticAssetsCachePolicy = new cloudfront.CachePolicy(
      this,
      "StaticAssetsCache",
      {
        defaultTtl: cdk.Duration.days(1),
        maxTtl: cdk.Duration.days(30),
        minTtl: cdk.Duration.hours(1),
        enableAcceptEncodingBrotli: true,
        enableAcceptEncodingGzip: true,
        queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
        headerBehavior: cloudfront.CacheHeaderBehavior.none(),
        cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      }
    );

    const apiCachePolicy = new cloudfront.CachePolicy(this, "ApiCache", {
      defaultTtl: cdk.Duration.minutes(5),
      maxTtl: cdk.Duration.minutes(30),
      minTtl: cdk.Duration.seconds(1),
      enableAcceptEncodingBrotli: true,
      enableAcceptEncodingGzip: true,
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList("Authorization"),
      cookieBehavior: cloudfront.CacheCookieBehavior.all(),
    });

    // Create CloudFront distribution
    this.distribution = new cloudfront.Distribution(
      this,
      "SiteChatDistribution",
      {
        defaultBehavior: {
          origin: new origins.LoadBalancerV2Origin(this.alb, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          }),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: apiCachePolicy,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
        additionalBehaviors: {
          [Constants.STATIC_ASSETS_PATH]: {
            origin: new origins.LoadBalancerV2Origin(this.alb, {
              protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            }),
            viewerProtocolPolicy:
              cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
            cachePolicy: staticAssetsCachePolicy,
          },
        },
        certificate: this.certificate,
        domainNames: [Constants.DOMAIN_NAME],
        webAclId: this.webAcl.attrArn,
      }
    );

    // DNS A record for the domain
    new route53.ARecord(this, "SiteChatARecord", {
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(this.distribution)
      ),
    });

    // Outputs
    new cdk.CfnOutput(this, "CertificateArn", {
      value: this.certificate.certificateArn,
      description: "ACM Certificate ARN",
    });

    new cdk.CfnOutput(this, "CloudFrontDomain", {
      value: this.distribution.distributionDomainName,
      description: "CloudFront distribution domain name",
    });

    new cdk.CfnOutput(this, "LoadBalancerDNS", {
      value: this.alb.loadBalancerDnsName,
      description: "Load balancer DNS name",
    });
  }
}
