# LoreChatCDK Development Guide

> For system architecture and design documentation, see [README.md](README.md)

## Prerequisites

### Development Environment
- Node.js 18.x or higher
- npm 9.x or higher
- AWS CLI v2
- AWS CDK CLI
- Docker or Finch
- AWS Account with appropriate permissions

### Required Credentials
- AWS IAM User with CDK deployment rights
- OpenAI API key (optional)
- AWS Bedrock access (optional)
- Upstash Vector credentials

## Getting Started

### 1. Clone the Repository
```bash
git clone <repository-url>
cd LoreChatCDK
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure AWS Credentials
```bash
aws configure
```
Provide:
- AWS Access Key ID
- AWS Secret Access Key
- Default region
- Output format (json)

### 4. Environment Configuration
Create a `.env` file with necessary configurations:
```
AWS_DEFAULT_REGION=us-east-1
OPENAI_API_KEY=your_openai_key
BEDROCK_REGION=us-east-1
UPSTASH_VECTOR_URL=your_upstash_url
UPSTASH_VECTOR_TOKEN=your_upstash_token
```

## CDK Deployment

### Bootstrap CDK (First-Time Setup)
```bash
cdk bootstrap
```

### Synthesize CloudFormation Templates
```bash
cdk synth
```

### Deploy Stacks
```bash
# Deploy all stacks
cdk deploy --all

# Deploy specific stack
cdk deploy StackName
```

## Development Workflow

### Local Development
- Implement changes in TypeScript
- Run linter: `npm run lint`
- Run tests: `npm test`

### Testing
```bash
# Unit tests
npm test

# Infrastructure tests
npm run test:infra

# Integration tests
npm run test:integration
```

## Container Build Options

### Docker
```bash
export USE_FINCH=false
docker build -t lorechat-cdk .
```

### Finch
```bash
export USE_FINCH=true
finch build -t lorechat-cdk .
```

## Monitoring and Troubleshooting

### CloudWatch Logs
- Check Lambda function logs
- Review ECS service logs
- Monitor CloudWatch dashboards

### Common Issues
- Verify AWS credentials
- Check security group configurations
- Validate IAM roles and permissions
- Review VPC and subnet settings

## Continuous Integration

### GitHub Actions
- Automated testing on pull requests
- Deployment to staging environment
- Security scanning
- Cost estimation

## Best Practices

- Always use least privilege IAM roles
- Encrypt sensitive information
- Regularly update dependencies
- Conduct security reviews
- Monitor cost and performance metrics

## Operational Procedures

### Scaling
- Monitor auto-scaling events
- Adjust ECS service configuration
- Review Lambda concurrency

### Updates
- Test changes in staging
- Use blue/green deployments
- Monitor performance metrics

## Troubleshooting

### Deployment Failures
- Check CDK synthesis output
- Verify AWS account permissions
- Review CloudFormation events

### Performance Issues
- Analyze CloudWatch metrics
- Review Lambda cold start times
- Check vector store query performance

## Contributing

1. Create a feature branch
2. Implement changes
3. Run tests and linters
4. Submit pull request

## License

[Add Specific License Information]
