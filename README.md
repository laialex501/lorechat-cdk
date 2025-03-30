# LoreChatCDK: Cloud Infrastructure for AI-Powered Conversations 🚀

[![AWS CDK](https://img.shields.io/badge/AWS_CDK-TypeScript-orange)](https://aws.amazon.com/cdk/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Infrastructure](https://img.shields.io/badge/Infrastructure-As_Code-green)](https://en.wikipedia.org/wiki/Infrastructure_as_code)

> A sophisticated AWS CDK infrastructure for an Intelligent Conversational AI Platform

[Detailed Development Guide](DEVELOPMENT.md)

## Project Overview 🎯

Welcome to my GenAI portfolio project. This project implements a production-ready AWS infrastructure using CDK (TypeScript) to power [LoreChat](https://github.com/laialex501/lorechat-container), a Streamlit-based conversational AI platform.

## Technical Highlights 💫

- 🏗️ **Modular Stack Architecture** - Separate infrastructure, service, data, and monitoring stacks
- 🔐 **Security-First Design** - CloudFront + WAF architecture with least-privilege IAM
- 🎭 **Provider-Agnostic AI** - Abstract interfaces for LLM and vector store services. Supports GPT, Claude, and Deepseek.
- 🐳 **Container-Ready** - Deploy consistently across environments
- 🔄 **Intelligent Auto-scaling** - ECS Fargate with spot instance optimization
- 📊 **Comprehensive Monitoring** - Custom CloudWatch dashboards and budget tracking

## System Architecture: A Study in Cloud Design 🏗️

```mermaid
graph TD
    subgraph "Infrastructure Stack (Security & Networking)"
        A[CloudFront] --> B[WAF]
        B --> C[Application Load Balancer]
        E[Route 53] --> A
        D[VPC with Public Subnets]
    end

    subgraph "Service Stack (Compute & Integration)"
        C --> F[ECS Fargate Service]
        F --> G[Container: LoreChat App]
        O[LLM Service Factory]
    end

    subgraph "Data Stack (Processing & Storage)"
        H[S3 Source Bucket]
        J[Data Processing Lambda]
        K[Vectorization Lambda]
        H --> J --> K
    end

    subgraph "Monitoring Stack (Observability)"
        M[CloudWatch Dashboards]
        N[Budget Alarms]
    end

    subgraph "External Services"
        L[Vector Store]
        P[LLM Providers]
    end

    K --> L
    F --> O --> P
    L --> F
```

### Design Philosophy

Each stack represents a distinct responsibility domain:

1. 🛡️ **Infrastructure Stack**
   - Network isolation with public subnet optimization
   - Edge security through CloudFront + WAF
   - DNS and SSL/TLS management

2. 🚢 **Service Stack**
   - Container orchestration with ECS Fargate
   - Spot instance utilization
   - Service discovery and load balancing

3. 💾 **Data Stack**
   - Structured data processing pipeline
   - Efficient vectorization system
   - Scalable storage architecture

4. 📈 **Monitoring Stack**
   - Real-time performance tracking
   - Cost optimization monitoring
   - Resource utilization insights

## Engineering Decisions & Rationale 🤔

### Key Design Choices

| Component | Implementation | Engineering Rationale |
|-----------|---------------|---------------------|
| **Infrastructure as Code** | AWS CDK with TypeScript | - Strong type safety for infrastructure code<br>- Reusable component patterns<br>- Full programming language capabilities |
| **Compute Layer** | ECS Fargate with Spot | - Simplified container management<br>- Automatic scaling capabilities<br>- Resource optimization through spot instances |
| **Security Architecture** | CloudFront + WAF + Public Subnets | - Edge protection with DDoS mitigation<br>- WebSocket support for real-time features<br>- Optimized network cost through public subnet design |
| **Service Integration** | Factory Pattern | - Provider-agnostic interfaces<br>- Runtime service switching<br>- Simplified vendor migrations |

## Technical Deep Dives: Engineering Challenges & Solutions 🔬

### Infrastructure Design Evolution

<details>
<summary>💡 <b>AWS CDK Architecture</b> - Strategic Implementation Decisions</summary>

The choice of AWS CDK with TypeScript emerged from careful consideration of infrastructure management approaches:

**Evaluated Alternatives:**
- CloudFormation: Limited programming capabilities
- Terraform: Stronger provider ecosystem but less AWS integration
- Pulumi: Similar capabilities but smaller community

**CDK Advantages:**
1. Type-safe infrastructure code
2. Native AWS constructs
3. Component reusability
4. Testing capabilities

**Stack Separation Strategy:**
- Isolated blast radius for changes
- Independent deployment capabilities
- Clear responsibility boundaries
- Simplified maintenance
</details>

<details>
<summary>🌐 <b>Network Architecture</b> - Optimized Multi-AZ Design</summary>

The networking architecture demonstrates strategic problem-solving in cloud design:

**Initial Challenge:**
- Need for multi-AZ reliability
- WebSocket support requirement
- Cost optimization goals

**Solution Evolution:**
1. Started with API Gateway approach
2. Identified WebSocket limitations
3. Shifted to CloudFront + WAF
4. Implemented public subnet strategy

**Key Design Patterns:**
- Edge security with CloudFront
- Traffic filtering through WAF
- Direct routing for external APIs
- WebSocket protocol support
</details>

<details>
<summary>⚡ <b>Service Integration</b> - Factory Pattern Implementation</summary>

The service layer showcases software engineering design patterns:

**Chat Service:**
```python
def create_chat_service():
    """Create or update chat service with current settings."""
    st.session_state.chat_service = ChatService(
        llm_service=LLMFactory.create_llm_service(
            provider=st.session_state.provider,
            model_name=st.session_state.model_name
        ),
        vector_store=VectorStoreFactory.get_vector_store(),
        persona_type=st.session_state.persona
    )
```

**LLM Integration:**
```python

# Factory pattern for service abstraction
llm_service = LLMFactory.create_llm_service(
    provider=LLMProvider.Anthropic,
    model_name=ClaudeModel.SONNET3_5_HAIKU
)

# Provider-agnostic interface
prompt = "Hello world"
response = llmService.generate_response(prompt)
```

**Vector Store Integration:**
```python
# Abstract factory for vector stores
vector_store = VectorStoreFactory.get_vector_store()
query = "Hello world"
documents = vector_store.similarity_search(query, k=3)
```

**Benefits:**
- Runtime provider switching
- Simplified testing
- Reduced vendor lock-in
- Consistent interfaces
</details>

### Innovative Solutions

#### 1. Optimized Network Architecture
```mermaid
graph LR
    A[CloudFront] --> B[WAF]
    B --> C[ALB]
    C --> D[ECS Tasks]
    D --> E[Internet Gateway]
    E --> F[External APIs]
```

This design achieves:
- Multi-AZ reliability
- Direct API access
- Enhanced security
- WebSocket support

#### 2. Intelligent Auto-scaling
```typescript
// ECS Service auto-scaling configuration
const service = new ecs.FargateService(this, 'Service', {
  cluster,
  taskDefinition,
  capacityProviderStrategies: [{
    capacityProvider: 'FARGATE_SPOT',
    weight: 1
  }],
  minHealthyPercent: 50,
  maxHealthyPercent: 200
});

// Auto-scaling based on CPU utilization
const scaling = service.autoScaleTaskCount({
  minCapacity: 1,
  maxCapacity: 4
});
```


## Technical Deep Dives & Implementation Details 🔬

### WebSocket Evolution & Real-time Communication

```mermaid
sequenceDiagram
    participant Client
    participant CF as CloudFront
    participant ALB as Load Balancer
    participant ECS as Container
    
    Note over Client,ECS: Initial Connection
    Client->>CF: WebSocket Upgrade Request
    CF->>ALB: Forward Upgrade (Custom Policy)
    ALB->>ECS: Establish WebSocket
    
    Note over Client,ECS: Message Flow
    Client->>CF: WebSocket Message
    CF->>ALB: Route with Session Affinity
    ALB->>ECS: Process Message
    ECS-->>Client: Stream Response
```

**Challenge Faced:**
Initially implemented with API Gateway, but encountered limitations:
- WebSocket connection challenges
- Complex integration with Streamlit
- Higher latency than desired

**Solution Evolution:**
1. Analyzed API Gateway limitations
2. Explored CloudFront capabilities
3. Implemented custom origin policies
4. Added session affinity for stable connections

**Key Configuration:**
```typescript
// CloudFront WebSocket behavior
const webSocketBehavior = new cloudfront.BehaviorOptions({
  allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
  originRequestPolicy: new cloudfront.OriginRequestPolicy(this, 'WebSocketPolicy', {
    headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList(
      'Sec-WebSocket-Key',
      'Sec-WebSocket-Version',
      'Sec-WebSocket-Protocol',
      'Sec-WebSocket-Accept'
    ),
    queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all()
  })
});
```

### Hybrid Search Implementation

```mermaid
graph TD
    subgraph "Query Processing"
        A[User Query] --> B[Generate Dense Vector]
        A --> C[Generate Sparse Vector]
    end
    
    subgraph "Search Execution"
        B --> D[Dense Vector Search]
        C --> E[Sparse Vector Search]
        D --> F[RRF Fusion]
        E --> F
    end
    
    subgraph "Result Processing"
        F --> G[Score Normalization]
        G --> H[Context Assembly]
        H --> I[Final Results]
    end
```

### Intelligent Auto-scaling Strategy

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

### Data Processing Pipeline

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

## Development Methodology & Innovation 🛠️

### Systematic Approach to Cloud Architecture

```mermaid
graph TD
    A[Problem Analysis] --> B[Architecture Design]
    B --> C[Implementation]
    C --> D[Testing & Validation]
    D --> E[Documentation]
    E --> A
```

### Key Development Patterns

1. **Infrastructure as Code**
   - Type-safe CDK constructs
   - Reusable component patterns
   - Automated testing capabilities

2. **Security First**
   - Edge protection
   - Least privilege access
   - Encryption by default

3. **Service Abstraction**
   - Factory pattern implementation
   - Provider-agnostic interfaces
   - Runtime configuration

4. **Monitoring & Maintenance**
   - Custom CloudWatch metrics
   - Budget tracking
   - Resource optimization

## Future Enhancements 🔮

Planned architectural improvements:

1. **Infrastructure Evolution**
   - Multi-region deployment capability
   - Enhanced disaster recovery
   - Global edge presence

2. **Security Enhancements**
   - VPC endpoint integration
   - Enhanced IAM policies
   - Additional WAF rules

3. **Service Expansion**
   - Voice interaction support
   - Multi-agent orchestration
   - Advanced analytics integration

## Connect & Contribute 🤝

[GitHub](https://github.com/laialex501) | [LinkedIn](https://linkedin.com/in/laialex501)

Licensed under MIT - See [LICENSE](LICENSE) for details
