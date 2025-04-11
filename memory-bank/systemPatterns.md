# LoreChatCDK System Patterns

## Core Architecture

### System Overview
```mermaid
graph TD
    subgraph "Infrastructure Stack"
        A[Cloudflare DNS] --> B[Cloudflare CDN]
        B --> C[Cloudflare WAF]
        C --> D[Application Load Balancer]
        E[VPC]
        F[Cloudflare IP Updater] -.-> G[Security Groups]
        H[Secrets Manager]
        I[IAM Roles]
    end

    subgraph "Service Stack"
        D --> J[ECS Fargate Service]
        J --> K[Container: LoreChat App]
        L[LLM Service Factory]
    end

    subgraph "Data Stack"
        M[S3 Source Bucket]
        N[S3 Processed Bucket]
        O[Data Processing Lambda]
        P[Vectorization Lambda]
        M --> O
        O --> N
        N --> P
    end

    subgraph "Monitoring Stack"
        Q[CloudWatch Dashboards]
        R[Cloudwatch Logs]
        S[Budget Alarms]
    end

    subgraph "External Integrations"
        T[Upstash Vector]
        U[OpenAI]
        P --> T
        L --> U[OpenAI]
    end

    subgraph "AWS Bedrock"
        V[Claude]
        W[Deepseek]
        X[Nova]
        L --> V
        L --> W
        L --> X
    end

    J --> L
    T --> J
    H --> J
```

## Core Design Patterns

### 1. Factory Pattern Implementation
```mermaid
graph TD
    subgraph "Service Factories"
        LF[LLM Factory]
        VF[Vector Store Factory]
        
        LF --> OAI[OpenAI Service]
        LF --> CL[Claude Service]
        LF --> DS[Deepseek Service]
        LF --> NV[Nova Service]
        
        VF --> UV[Upstash Vector]
        VF --> FS[FAISS Service]
    end
```

### 2. Request Flow & WebSocket Handling
```mermaid
sequenceDiagram
    participant User
    participant CF as Cloudflare
    participant ALB as Load Balancer
    participant ECS
    participant Vector
    participant LLM
    
    Note over User,CF: Connection Phase
    User->>CF: WebSocket Upgrade Request
    CF->>ALB: Forward Upgrade
    ALB->>ECS: Establish WebSocket
    
    Note over User,LLM: Message Processing
    User->>CF: WebSocket Message
    CF->>ALB: Route with Session Affinity
    ALB->>ECS: Process Message
    
    Note over ECS,LLM: Context Retrieval
    ECS->>Vector: Hybrid Search
    Vector-->>ECS: Relevant Context
    
    Note over ECS,LLM: Response Generation
    ECS->>LLM: Generate Response
    LLM-->>ECS: Stream Response
    ECS-->>User: Stream Response
```

**Cloudflare WebSocket Configuration:**
WebSocket support is enabled through the Cloudflare dashboard under Network → WebSockets.

### 3. Enhanced Data Processing Pipeline
```mermaid
graph TD
    subgraph "Content Processing"
        A[Raw Content] --> B[HTML Extraction]
        B --> C[Content Cleaning]
        C --> D[Markdown Conversion]
    end
    
    subgraph "Chunking Strategy"
        D --> E[Semantic Splitting]
        E --> F[Overlap Calculation]
        F --> G[Metadata Enrichment]
    end
    
    subgraph "Vector Generation"
        G --> H[Batch Processing]
        H --> I[Embedding Creation]
        I --> J[Vector Storage]
    end
    
    subgraph "Optimization"
        K[Batch Size Tuning]
        L[Concurrent Processing]
        M[Error Recovery]
    end
```

**Processing Implementation:**
```typescript
// Optimized processing pipeline
class ContentProcessor {
  async process(content: string): Promise<ProcessedContent> {
    // Semantic splitting with overlap
    const chunks = await this.splitContent(content, {
      chunkSize: 1000,
      overlap: 100,
      preserveStructure: true
    });
    
    // Parallel processing with batching
    const batchSize = 50;
    const batches = this.createBatches(chunks, batchSize);
    
    const results = await Promise.all(
      batches.map(batch => this.processBatch(batch))
    );
    
    return this.assembleResults(results);
  }
}
```

#### Pipeline Components

1. **Data Processing Lambda**
   - Input: HTML content from source bucket
   - Processing:
     * Extracts structured content (title, source_text, source_link)
     * Converts content to markdown format
     * Handles both single files and JSONL batches
   - Output: JSONL files with fields:
     * title, source_text, source_link
     * url, content_type, extracted_at
     * markdown content
   - Storage: Processed bucket with "processed/" prefix

2. **Vectorization Lambda**
   - Input: JSONL files from processed bucket
   - Processing:
     * Parses each JSONL item individually
     * Uses markdown content for embedding generation
     * Creates unique vector IDs
   - Vector Storage:
     * Stores embeddings in Upstash Vector
     * Includes metadata fields from input
     * Maintains source traceability
   - Error Handling:
     * Processes items independently
     * Tracks success/failure per item
     * Continues on individual item failures

3. **Data Flow**
   - Source S3 → Processing Lambda (HTML → JSONL)
   - Processed S3 → Vectorization Lambda (JSONL → Vectors)
   - Upstash Vector (Final Storage with Metadata)

### 4. Security Architecture
```mermaid
graph TD
    subgraph "Security Layers"
        CF[Cloudflare DNS] --> CDN[Cloudflare CDN]
        CDN --> WAF[Cloudflare WAF]
        WAF --> ALB[Load Balancer]
        ALB --> SG[Security Groups]
        SG --> ECS[ECS Service]
        SM[Secrets Manager] -.-> ECS
        IAM[IAM Roles] -.-> ECS
        CIU[Cloudflare IP Updater] -.-> SG
    end
```

### 5. Cloudflare IP Updater Pattern with CIDR Aggregation
```mermaid
graph TD
    subgraph "IP Range Management"
        A[EventBridge Rule] -->|Weekly Trigger| B[Lambda Function]
        B -->|Fetch IP Ranges| C[Cloudflare API]
        C -->|Return IP Ranges| B
        B -->|Aggregate CIDRs| H[CIDR Aggregation]
        H -->|Reduced IP Set| I[Batch Processing]
        I -->|Update Rules| D[Security Group]
    end
    
    subgraph "Security Group Rules"
        D -->|Allow| E[Cloudflare IPs]
        D -->|Allow| F[VPC Traffic]
        D -->|Deny| G[All Other Traffic]
    end
```

**Cloudflare IP Updater Implementation:**
```typescript
// Lambda function to update security group with Cloudflare IP ranges
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

**CIDR Aggregation Implementation:**
```javascript
// Lambda function with CIDR aggregation to stay under AWS limits
const { aggregate } = require('cidr-tools');

// Aggregate the new CIDR ranges to reduce the number of rules
const aggregatedRanges = aggregate(newRanges);
console.log(`Aggregated ${newRanges.length} Cloudflare IP ranges into ${aggregatedRanges.length} CIDR blocks`);

// Process in batches to stay under AWS limits
for (let i = 0; i < cidrsToAdd.length; i += MAX_RULES_PER_BATCH) {
  const batchCidrs = cidrsToAdd.slice(i, i + MAX_RULES_PER_BATCH);
  // Update security group with batch
}
```

## Implementation Patterns

### 1. Stack Organization
- Infrastructure Stack: Network and security components
- Service Stack: Application runtime and containers
- Data Stack: Storage and processing pipeline
- Monitoring Stack: Observability and cost tracking

### 2. Development Workflow
```mermaid
graph LR
    subgraph "Development Cycle"
        Plan[Plan Mode] --> Act[Act Mode]
        Act --> Test[Testing]
        Test --> Doc[Documentation]
        Doc --> Plan
    end
```

### 3. Key Design Principles
- Factory pattern for service abstraction
- Multi-AZ deployment for reliability
- Public subnet design with strict security
- Comprehensive monitoring and logging
- Cost-effective resource utilization

### 4. Auto-scaling Strategy
```mermaid
graph TD
    subgraph "Metrics Collection"
        A[CPU Utilization] --> D[Scaling Decision]
        B[Memory Usage] --> D
        C[Request Count] --> D
    end
    
    subgraph "Scaling Logic"
        D --> E{Scale Out?}
        E -->|Yes| F[Increase Capacity]
        E -->|No| G{Scale In?}
        G -->|Yes| H[Decrease Capacity]
        G -->|No| I[Maintain Current]
    end
    
    subgraph "Optimization"
        F --> J[Spot Instance Request]
        H --> K[Grace Period Check]
    end
```

**Auto-scaling Configuration:**
```typescript
// Advanced auto-scaling setup
const scaling = service.autoScaleTaskCount({
  maxCapacity: 4,
  minCapacity: 1
});

// CPU-based scaling
scaling.scaleOnCpuUtilization('CpuScaling', {
  targetUtilizationPercent: 70,
  scaleInCooldown: Duration.seconds(60),
  scaleOutCooldown: Duration.seconds(30)
});

// Request count scaling
scaling.scaleOnRequestCount('RequestScaling', {
  targetRequestsPerSecond: 100,
  scaleInCooldown: Duration.seconds(60),
  scaleOutCooldown: Duration.seconds(30)
});
```

## Operational Patterns

### 1. Enhanced Monitoring Strategy
```mermaid
graph TD
    subgraph "Performance Monitoring"
        CW[CloudWatch] --> Dash[Dashboards]
        CW --> Logs[Log Groups]
        CW --> Met[Custom Metrics]
    end
    
    subgraph "Cost Tracking"
        Met --> Cost[Cost Explorer]
        Cost --> BA[Budget Alarms]
        BA --> Not[Notifications]
    end
    
    subgraph "Health Checks"
        CW --> HC[Health Checks]
        HC --> AL[ALB Targets]
        HC --> Task[ECS Tasks]
    end
    
    subgraph "Logging"
        Logs --> Cont[Container Logs]
        Logs --> App[Application Logs]
        Logs --> Acc[Access Logs]
    end
```

### 2. Cost Management
- Resource tagging for cost allocation
- Budget monitoring and alerts
- Spot instance usage
- Efficient resource sizing
- Cache optimization

### 3. Security Implementation
- Cloudflare WAF with Bot Fight Mode
- Automated security group updates with Cloudflare IP ranges
- IAM least privilege
- Secrets management
- Encryption at rest and in transit (Full Strict SSL/TLS mode)

### 4. Development Practices
- Memory bank documentation
- Model-specific task allocation
- Plan-then-act workflow
- Continuous documentation
- Systematic testing approach
