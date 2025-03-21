# LoreChatCDK System Patterns

## Core Architecture

### System Overview
```mermaid
graph TD
    subgraph "Infrastructure Stack"
        A[CloudFront] --> B[WAF]
        B --> C[Application Load Balancer]
        E[Route 53] --> A
        S[Secrets Manager]
        D[VPC]
        Q[IAM Roles]
        R[Security Groups]
    end

    subgraph "Service Stack"
        C --> F[ECS Fargate Service]
        F --> G[Container: LoreChat App]
        O[LLM Service Factory]
    end

    subgraph "Data Stack"
        H[S3 Source Bucket]
        I[S3 Processed Bucket]
        J[Data Processing Lambda]
        K[Vectorization Lambda]
        H --> J
        J --> I
        I --> K
    end

    subgraph "Monitoring Stack"
        M[CloudWatch Dashboards]
        W[Cloudwatch Logs]
        N[Budget Alarms]
    end

    subgraph "External Integrations"
        L[Upstash Vector]
        P[OpenAI]
        K --> L
        O --> P[OpenAI]
    end

    subgraph "AWS Bedrock"
        T[Claude]
        U[Deepseek]
        V[Nova]
        O --> T
        O --> U
        O --> V
    end

    F --> O
    L --> F
    S --> F
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

### 2. Request Flow
```mermaid
sequenceDiagram
    participant User
    participant CloudFront
    participant WAF
    participant ALB
    participant ECS
    participant Vector
    participant LLM
    
    User->>CloudFront: WebSocket Connection
    CloudFront->>WAF: Security Check
    WAF->>ALB: Route Request
    ALB->>ECS: Load Balance
    ECS->>Vector: Context Search
    Vector-->>ECS: Relevant Context
    ECS->>LLM: Generate Response
    LLM-->>ECS: Response
    ECS-->>User: Stream Response
```

### 3. Data Processing Pipeline
```mermaid
graph LR
    subgraph "Data Processing"
        S1[Source S3] --> L1[Processing Lambda]
        L1 --> |JSONL| S2[Processed S3]
        S2 --> L2[Vectorization Lambda]
        L2 --> |Vectors + Metadata| VS[Upstash Vector]
    end

    subgraph "Processing Lambda"
        HTML[HTML Content] --> Extract[Extract Content]
        Extract --> |title, source, url...| Convert[Convert to Markdown]
        Convert --> JSONL[JSONL Output]
    end

    subgraph "Vectorization Lambda"
        JI[JSONL Input] --> Parse[Parse Items]
        Parse --> Embed[Generate Embeddings]
        Embed --> Store[Store with Metadata]
    end
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
        CF[CloudFront] --> WAF
        WAF --> ALB[Load Balancer]
        ALB --> SG[Security Groups]
        SG --> ECS[ECS Service]
        SM[Secrets Manager] -.-> ECS
        IAM[IAM Roles] -.-> ECS
    end
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

### 4. Resource Management
- Auto-scaling based on demand
- Spot instances for cost optimization
- CloudFront caching for performance
- Efficient vector storage solution
- Modular stack deployment

## Operational Patterns

### 1. Monitoring Strategy
```mermaid
graph TD
    subgraph "Monitoring"
        CW[CloudWatch] --> Dash[Dashboards]
        CW --> Logs[Log Groups]
        CW --> Alarms[Budget Alarms]
        Alarms --> Not[Notifications]
    end
```

### 2. Cost Management
- Resource tagging for cost allocation
- Budget monitoring and alerts
- Spot instance usage
- Efficient resource sizing
- Cache optimization

### 3. Security Implementation
- WAF rules and rate limiting
- Security group restrictions
- IAM least privilege
- Secrets management
- Encryption at rest and in transit

### 4. Development Practices
- Memory bank documentation
- Model-specific task allocation
- Plan-then-act workflow
- Continuous documentation
- Systematic testing approach
