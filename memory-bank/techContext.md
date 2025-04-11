# LoreChatCDK Technical Context

## Technology Stack

### Core Technologies
```mermaid
graph TD
    subgraph "Infrastructure Layer"
        CDK[AWS CDK] --> TS[TypeScript]
        CDK --> CF[CloudFormation]
        TS --> IC[Infrastructure Code]
        CF --> RP[Resource Provisioning]
    end
    
    subgraph "Development Tools"
        GH[GitHub] --> GA[GitHub Actions]
        GA --> CD[CI/CD Pipeline]
        VS[VSCode] --> MB[Memory Bank]
        AI[AI Agents] --> Dev[Development]
    end
```

### Key Dependencies
- AWS CDK >= 2.100.0
- TypeScript >= 5.0.0
- AWS SDK >= 3.0.0
- Jest >= 29.0.0
- ESLint >= 8.0.0
- Node.js >= 18.x
- npm >= 9.x
- AWS CLI >= 2.x

### Development Environment
- VSCode with AWS Toolkit
- Memory Bank Integration
- AI Agent Support
- Local Development Tools

## Service Architecture

### Service Integration & Data Flow
```mermaid
graph TD
    subgraph "Edge Layer"
        CF[Cloudflare DNS] --> CDN[Cloudflare CDN]
        CDN --> WAF[Cloudflare WAF]
        WAF --> ALB[Load Balancer]
        CIU[Cloudflare IP Updater] -.-> SG[Security Groups]
    end
    
    subgraph "WebSocket Handling"
        ALB --> WS[WebSocket Connection]
        WS --> ECS[ECS Fargate]
        WS --> SA[Session Affinity]
    end
    
    subgraph "Data Processing"
        S3[Source S3] --> PL[Processing Lambda]
        PL --> VL[Vectorization Lambda]
        VL --> VS[Vector Storage]
    end
    
    subgraph "AI Services"
        ECS --> Vec[Vector Search]
        ECS --> LLM[LLM Services]
        Vec --> Hyb[Hybrid Search]
    end
    
    subgraph "Monitoring"
        CW[CloudWatch] --> Dash[Dashboards]
        CW --> Log[Logs]
        CW --> Met[Custom Metrics]
        Met --> Alarm[Alarms]
    end
```

### WebSocket Configuration

WebSocket support is enabled through the Cloudflare dashboard under Network → WebSockets.

```typescript
// ALB WebSocket target group
const webSocketTargetGroup = new elbv2.ApplicationTargetGroup(this, 'WebSocketGroup', {
  vpc,
  protocol: elbv2.ApplicationProtocol.HTTP,
  targetType: elbv2.TargetType.IP,
  healthCheck: {
    path: '/health',
    timeout: Duration.seconds(5),
    interval: Duration.seconds(30)
  }
});
```

### Cloudflare IP Updater
```typescript
// Cloudflare IP Updater construct
export class CloudflareIpUpdater extends Construct {
  constructor(scope: Construct, id: string, props: CloudflareIpUpdaterProps) {
    super(scope, id);
    
    // Create Lambda function
    const updaterFunction = new lambda.Function(
      this,
      "CloudflareIpUpdaterFunction",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: "index.handler",
        code: lambda.Code.fromAsset(
          path.join(__dirname, "../../lambda/cloudflare_ip_updater")
        ),
        timeout: cdk.Duration.minutes(5),
        environment: {
          SECURITY_GROUP_ID: props.securityGroup.securityGroupId,
          PORTS: props.ports.join(","),
        },
      }
    );
    
    // Schedule weekly updates
    new events.Rule(this, "ScheduleRule", {
      schedule: events.Schedule.rate(cdk.Duration.days(7)),
      targets: [new targets.LambdaFunction(updaterFunction)],
    });
  }
}
```

### Development Workflow
```mermaid
graph LR
    subgraph "Development Process"
        Plan[Plan Mode] --> Act[Act Mode]
        Act --> Test[Testing]
        Test --> Doc[Documentation]
        Doc --> MB[Memory Bank]
        MB --> Plan
    end
```

## Technical Implementation

### 1. Infrastructure Components

#### Edge & Network Layer
- Multi-AZ deployment with public subnets
- Cloudflare CDN + WAF for security and caching
- Cloudflare WebSocket support
- Cloudflare IP Updater for security group management
- Session affinity for connections

#### Compute Layer
- ECS Fargate with Spot instances
- Auto-scaling based on multiple metrics
- Task definition optimization
- Resource utilization monitoring

#### Data Processing
- S3-based processing pipeline
- Optimized chunking strategy
- Parallel processing implementation
- Error handling and recovery

#### Search Implementation
```typescript
// Hybrid search configuration
class HybridSearchService implements SearchService {
  async search(query: string): Promise<SearchResult[]> {
    // Generate embeddings
    const denseVector = await this.embeddings.embedQuery(query);
    const sparseVector = this.generateSparseVector(query);
    
    // Parallel search execution
    const [denseResults, sparseResults] = await Promise.all([
      this.denseSearch(denseVector),
      this.sparseSearch(sparseVector)
    ]);
    
    // Reciprocal Rank Fusion
    return this.fuseResults(denseResults, sparseResults);
  }
}
```

### 2. Security Implementation
- Cloudflare WAF with Bot Fight Mode
- Automated security group updates with Cloudflare IP ranges
- IAM least privilege model
- Secrets Manager integration
- Encryption at rest and in transit (Full Strict SSL/TLS mode)

### 3. Development Practices
- Memory bank documentation
- AI agent collaboration
- Plan-then-act workflow
- Continuous documentation
- Systematic testing

### 4. Resource Management
- Auto-scaling configuration
- Spot instance optimization
- CloudFront caching
- Lambda concurrency limits
- S3 lifecycle policies

## Technical Constraints

### 1. Service Limits
- ECS task limits
- Cloudflare rate limits
- Lambda concurrency
- S3 event notifications
- API rate limits

### 2. Development Constraints
- AI agent limitations
- Memory bank maintenance
- Documentation overhead
- Testing requirements
- Security compliance

### 3. Cost Considerations
- Multi-AZ requirements
- Spot instance availability
- Cloudflare free tier utilization
- Vector storage costs
- Lambda execution


## Deployment
- CDK Deployment: `cdk deploy --all` or `cdk deploy StackName`
- Stack Order: Infrastructure → LLM → Service → Monitoring
- Environment Management: Context values in cdk.json
- Rollback Strategy: CloudFormation automatic rollback on failure

## Resource Management

### Compute Resources
```typescript
// ECS Task Definition
const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
  cpu: 256,
  memoryLimitMiB: 512,
  ephemeralStorageGiB: 21
});

// Auto-scaling configuration
const scaling = service.autoScaleTaskCount({
  maxCapacity: 4,
  minCapacity: 1
});

scaling.scaleOnCpuUtilization('CpuScaling', {
  targetUtilizationPercent: 70,
  scaleInCooldown: Duration.seconds(60),
  scaleOutCooldown: Duration.seconds(30)
});

scaling.scaleOnRequestCount('RequestScaling', {
  targetRequestsPerSecond: 100
});
```

### Infrastructure Resources
- VPC: Dual AZ, public subnets, no NAT Gateways
- ECS: Fargate Spot, optimized compute settings
- Security: Least privilege IAM, Cloudflare IP-only access
- Storage: Hybrid vector search implementation
- Compute: Optimized Lambda configurations
- Monitoring: Enhanced CloudWatch integration
- Caching: Cloudflare caching policies

## Development Guidelines

### Infrastructure as Code
- CDK Best Practices: L2 constructs, cross-stack references
- Type-safe infrastructure with proper interfaces
- Reusable component patterns
- Automated testing capabilities

### Security Implementation
```typescript
// Security group configuration
const securityGroup = new ec2.SecurityGroup(this, 'ServiceSG', {
  vpc,
  description: 'Security group for LoreChat service',
  allowAllOutbound: false
});

// Allow HTTPS from within VPC
securityGroup.addIngressRule(
  ec2.Peer.ipv4(vpc.vpcCidrBlock),
  ec2.Port.tcp(443),
  'Allow HTTPS from within VPC'
);

// Add Cloudflare IP Updater
new CloudflareIpUpdater(this, "CloudflareIpUpdater", {
  securityGroup: securityGroup,
  ports: [443], // HTTPS port
});
```

### Resource Optimization
- Free tier resource utilization
- Spot instance management
- Efficient Lambda execution
- Optimized vector operations
- Cloudflare caching strategies
- Cloudflare free tier utilization

### Development Workflow
- Clear stack separation
- Comprehensive documentation
- Memory bank synchronization
- Systematic testing approach
- Performance monitoring
