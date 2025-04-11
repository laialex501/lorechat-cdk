import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct, IConstruct } from "constructs";
import { Constants } from "../../config/constants";
import { CloudflareIpUpdater } from "../constructs/cloudflare-ip-updater";
import { ResourceTags, TagManager } from "../utils/tag-manager";

export interface InfrastructureStackProps extends cdk.StackProps {}

export class InfrastructureStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly webSecurityGroup: ec2.SecurityGroup;
  public readonly certificate: acm.Certificate;
  public readonly alb: elbv2.ApplicationLoadBalancer;
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

    // Allow HTTPS from within the VPC
    this.webSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(Constants.HTTPS_PORT),
      "Allow HTTPS from within VPC"
    );

    // Cloudflare IP ranges will be managed by the CloudflareIpUpdater

    // Look up existing Route 53 hosted zone
    const hostedZone = route53.HostedZone.fromLookup(this, "RootHostedZone", {
      domainName: Constants.ROOT_DOMAIN_NAME,
    });

    // chat.lorechat.dev
    // add qualifier like dev-chat.lorechat.dev if not prod
    const FULL_DOMAIN_NAME = `${
      process.env.STAGE != "prod" ? process.env.STAGE || "dev" + "-" : ""
    }${Constants.SUBDOMAIN}.${Constants.ROOT_DOMAIN_NAME}`;

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
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(30), // Keep logs for 30 days
        },
      ],
    });
    addTags(logBucket, "S3", { DataClassification: "Internal" });

    // Create ALB
    this.alb = new elbv2.ApplicationLoadBalancer(this, "LoreChatALB", {
      vpc: this.vpc,
      internetFacing: true, // Public facing for Cloudflare access
      securityGroup: this.webSecurityGroup,
    });
    addTags(this.alb, "ALB");

    // Enable ALB access logging
    this.alb.logAccessLogs(logBucket, "alb-logs");

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

    // Add Cloudflare IP Updater
    new CloudflareIpUpdater(this, "CloudflareIpUpdater", {
      securityGroup: this.webSecurityGroup,
      ports: [Constants.HTTPS_PORT], // HTTPS port
    });

    // Outputs
    new cdk.CfnOutput(this, "CertificateArn", {
      value: this.certificate.certificateArn,
      description: "ACM Certificate ARN",
    });

    new cdk.CfnOutput(this, "LoadBalancerDNS", {
      value: this.alb.loadBalancerDnsName,
      description: "Load balancer DNS name",
    });
  }
}
