import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as waf from "aws-cdk-lib/aws-wafv2";
import { Construct, IConstruct } from "constructs";
import { Constants } from "../../config/constants";
import { ResourceTags, TagManager } from "../utils/tag-manager";

export interface InfrastructureStackProps extends cdk.StackProps {}

export class InfrastructureStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly webSecurityGroup: ec2.SecurityGroup;
  public readonly certificate: acm.Certificate;
  public readonly distribution: cloudfront.Distribution;
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly webAcl: waf.CfnWebACL;
  public readonly httpsListener: elbv2.ApplicationListener;
  public readonly chatListenerRule: elbv2.ApplicationListenerRule;
  public readonly chatTargetGroup: elbv2.ApplicationTargetGroup;

  // Secrets for services
  public readonly upstashEndpointSecret: secretsmanager.Secret; // Upstash Vector endpoint
  public readonly upstashTokenSecret: secretsmanager.Secret; // Upstash Vector token
  public readonly openaiAPISecret: secretsmanager.Secret; // OpenAI API Key
  public readonly tavilyAPISecret: secretsmanager.Secret; // Tavily Web search API

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const addTags = (
      resource: IConstruct,
      service: string,
      extraTags?: Partial<ResourceTags>
    ) => {
      TagManager.addTags(resource, this, service, extraTags);
    };

    // Create secret for Upstash endpoint
    this.upstashEndpointSecret = new secretsmanager.Secret(
      this,
      "UpstashEndpoint",
      {
        secretName: `${Constants.SECRET_ARN_PREFIX}${Constants.UPSTASH_ENDPOINT_SECRET_PREFIX}-${this.region}`,
        description: "Endpoint for Upstash vector database",
      }
    );
    addTags(this.upstashEndpointSecret, "SecretsManager", {
      DataClassification: "Confidential",
    });

    // Create secret for Upstash token
    this.upstashTokenSecret = new secretsmanager.Secret(this, "UpstashToken", {
      secretName: `${Constants.SECRET_ARN_PREFIX}${Constants.UPSTASH_TOKEN_SECRET_PREFIX}-${this.region}`,
      description: "Token for Upstash vector database",
    });
    addTags(this.upstashTokenSecret, "SecretsManager", {
      DataClassification: "Confidential",
    });

    // Create secret for OpenAI API key
    this.openaiAPISecret = new secretsmanager.Secret(this, "OpenAIAPIKey", {
      secretName: `${Constants.SECRET_ARN_PREFIX}${Constants.OPENAI_API_KEY_SECRET_PREFIX}-${this.region}`,
      description: "API key for OpenAI",
    });

    // Create secret for Tavily API key
    this.tavilyAPISecret = new secretsmanager.Secret(this, "TavilyAPIKey", {
      secretName: `${Constants.SECRET_ARN_PREFIX}${Constants.TAVILY_API_KEY_SECRET_PREFIX}-${this.region}`,
      description: "API key for Tavily",
    });

    // VPC Configuration - Minimum 2 AZs required for ALB
    this.vpc = new ec2.Vpc(this, "LoreChatVPC", {
      maxAzs: 2, // Using 2 AZs as required by ALB
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });
    addTags(this.vpc, "VPC");

    // Security Groups Configuration
    this.webSecurityGroup = new ec2.SecurityGroup(this, "WebSecurityGroup", {
      vpc: this.vpc,
      description: "Security group for web traffic",
      allowAllOutbound: true,
    });
    addTags(this.webSecurityGroup, "SecurityGroup");

    // Allow HTTPS from CloudFront IPs using managed prefix list
    this.webSecurityGroup.addIngressRule(
      ec2.Peer.prefixList("pl-3b927c52"), // Global CloudFront prefix list
      ec2.Port.tcp(Constants.HTTPS_PORT),
      "Allow HTTPS from CloudFront"
    );

    // Allow HTTPS from within the VPC
    this.webSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(Constants.HTTPS_PORT),
      "Allow HTTPS from within VPC"
    );

    // Look up existing Route 53 hosted zone
    const hostedZone = route53.HostedZone.fromLookup(this, "RootHostedZone", {
      domainName: Constants.ROOT_DOMAIN_NAME,
    });

    const FULL_DOMAIN_NAME = `${process.env.STAGE || "dev"}.${
      Constants.SUBDOMAIN
    }.${Constants.ROOT_DOMAIN_NAME}`;

    // ACM Certificate for the subdomain
    this.certificate = new acm.Certificate(this, "LoreChatCertificate", {
      domainName: FULL_DOMAIN_NAME,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });
    addTags(this.certificate, "ACM");

    // Create S3 bucket for logs
    const logBucket = new s3.Bucket(this, "LoreChatLogsBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true, // Clean up logs when stack is destroyed
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER, // Enable ACLs
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(30), // Keep logs for 30 days
        },
      ],
    });
    addTags(logBucket, "S3", { DataClassification: "Internal" });

    // Grant CloudFront access to write logs
    logBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal("delivery.logs.amazonaws.com")],
        actions: ["s3:PutObject"],
        resources: [logBucket.arnForObjects("*")],
        conditions: {
          StringEquals: {
            "s3:x-amz-acl": "bucket-owner-full-control",
          },
        },
      })
    );

    // Create ALB
    this.alb = new elbv2.ApplicationLoadBalancer(this, "LoreChatALB", {
      vpc: this.vpc,
      internetFacing: true, // Public facing but blocks not-CloudFront IPs
      securityGroup: this.webSecurityGroup,
    });
    addTags(this.alb, "ALB");

    // Enable ALB access logging
    this.alb.logAccessLogs(logBucket, "alb-logs");

    // WAF Web ACL with basic rules
    this.webAcl = new waf.CfnWebACL(this, "LoreChatWebAcl", {
      defaultAction: { allow: {} },
      scope: "CLOUDFRONT",
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: "LoreChatWebAclMetric",
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: "RateLimit",
          priority: 1,
          statement: {
            rateBasedStatement: {
              limit: 100,
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
    // Note: CfnWebACL doesn't implement ITaggable, so we can't add tags directly

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
    addTags(staticAssetsCachePolicy, "CloudFront");

    // Create target group for chat service
    this.chatTargetGroup = new elbv2.ApplicationTargetGroup(
      this,
      "LoreChatTargetGroup",
      {
        vpc: this.vpc,
        port: Constants.STREAMLIT_PORT,
        protocol: elbv2.ApplicationProtocol.HTTP,
        healthCheck: {
          path: Constants.HEALTH_CHECK_PATH,
          interval: cdk.Duration.seconds(Constants.HEALTH_CHECK_INTERVAL),
          timeout: cdk.Duration.seconds(Constants.HEALTH_CHECK_TIMEOUT),
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 5,
        },
        stickinessCookieDuration: cdk.Duration.days(1),
      }
    );
    addTags(this.chatTargetGroup, "ALB");

    // Create HTTPS listener with routing rules
    this.httpsListener = this.alb.addListener("SharedHttpsListener", {
      port: Constants.HTTPS_PORT,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [this.certificate],
      defaultAction: elbv2.ListenerAction.forward([this.chatTargetGroup]), // Forward to chat service by default
    });
    addTags(this.httpsListener, "ALB");

    // Create CloudFront distribution with logging
    this.distribution = new cloudfront.Distribution(
      this,
      "LoreChatDistribution",
      {
        enableLogging: true,
        logBucket: logBucket,
        logFilePrefix: "cloudfront-logs/",
        defaultBehavior: {
          origin: new origins.LoadBalancerV2Origin(this.alb, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            connectionAttempts: 3,
            customHeaders: {
              "X-Forwarded-Host": FULL_DOMAIN_NAME,
              "X-Forwarded-Proto": "https",
              "X-Forwarded-Port": Constants.HTTPS_PORT.toString(),
            },
          }),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
          responseHeadersPolicy:
            cloudfront.ResponseHeadersPolicy
              .CORS_ALLOW_ALL_ORIGINS_AND_SECURITY_HEADERS, // Use all to pass Streamlit headers
        },
        certificate: this.certificate,
        domainNames: [FULL_DOMAIN_NAME],
        webAclId: this.webAcl.attrArn,
      }
    );
    addTags(this.distribution, "CloudFront");

    // Create DNS A record for the subdomain
    const aRecord = new route53.ARecord(this, "LoreChatARecord", {
      zone: hostedZone,
      recordName: `${process.env.STAGE || "dev"}.${Constants.SUBDOMAIN}`, // This creates a record for the subdomain
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(this.distribution)
      ),
    });
    addTags(aRecord, "Route53");

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
