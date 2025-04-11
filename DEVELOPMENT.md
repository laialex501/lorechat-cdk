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

### 3. Configure AWS Credentials for Local Development

#### Creating an IAM Admin User

1. **Sign in to AWS Management Console**
   - Go to [AWS Console](https://console.aws.amazon.com/)
   - Sign in with your root account (not recommended for daily use)

2. **Create an IAM User**
   - Navigate to IAM service
   - Click "Users" in the left sidebar
   - Click "Add users"
   - Enter a username (e.g., `lorechat-admin`)
   - Select "Access key - Programmatic access"
   - Click "Next: Permissions"

3. **Assign Permissions**
   - Choose "Attach existing policies directly"
   - Search for and select "AdministratorAccess"
   - For production, consider a more restricted policy based on least privilege
   - Click "Next: Tags"

4. **Add Tags (Optional)**
   - Add key-value pairs like:
     - Key: `Project`, Value: `LoreChat`
     - Key: `Environment`, Value: `Development`
   - Click "Next: Review"

5. **Review and Create**
   - Review the user details and permissions
   - Click "Create user"

6. **Save Credentials**
   - Download the CSV file with the access key ID and secret access key
   - Store these credentials securely; you won't be able to view the secret access key again
   - Consider using a password manager for secure storage

#### Setting Up AWS CLI Profile

1. **Configure Default Profile**
   ```bash
   aws configure
   ```
   Provide:
   - AWS Access Key ID
   - AWS Secret Access Key
   - Default region
   - Output format (json)

2. **Configure Named Profile (Recommended)**
   ```bash
   aws configure --profile lorechat-dev
   ```
   Enter the requested information:
   - AWS Access Key ID: [Your access key]
   - AWS Secret Access Key: [Your secret key]
   - Default region name: us-east-1 (or your preferred region)
   - Default output format: json

3. **Verify Profile Setup**
   ```bash
   aws sts get-caller-identity --profile lorechat-dev
   ```
   You should see your account ID, user ARN, and user ID

#### Using AWS Profile with CDK

1. **Single Commands with Profile**
   ```bash
   AWS_PROFILE=lorechat-dev cdk synth
   AWS_PROFILE=lorechat-dev cdk deploy
   AWS_PROFILE=lorechat-dev cdk diff
   ```

2. **Set Default Profile for Session**
   ```bash
   # Bash/Zsh
   export AWS_PROFILE=lorechat-dev
   
   # Windows Command Prompt
   set AWS_PROFILE=lorechat-dev
   
   # PowerShell
   $env:AWS_PROFILE="lorechat-dev"
   ```
   Then run CDK commands normally:
   ```bash
   cdk synth
   cdk deploy
   ```

3. **Profile with Specific Environment**
   ```bash
   AWS_PROFILE=lorechat-dev CDK_ENV=dev cdk deploy
   ```

4. **Named Profiles in ~/.aws/config**
   You can enhance your profile in `~/.aws/config`:
   ```
   [profile lorechat-dev]
   region = us-east-1
   output = json
   cli_pager = 
   
   [profile lorechat-prod]
   region = us-east-1
   output = json
   cli_pager = 
   ```

#### Security Best Practices

1. **Rotate Access Keys Regularly**
   - Create new keys and delete old ones every 90 days
   - Update your local profile when keys change

2. **Use MFA When Possible**
   - Set up multi-factor authentication for your IAM user
   - For MFA-protected CLI access, use temporary credentials:
     ```bash
     aws sts get-session-token --serial-number arn:aws:iam::ACCOUNT-ID:mfa/username --token-code 123456 --profile lorechat-dev
     ```

3. **Least Privilege Access**
   - For production, create role-specific users instead of using admin
   - Assign only the permissions needed for development

4. **Never Commit Credentials**
   - Add credentials files to `.gitignore`
   - Use environment variables or AWS profiles instead of hardcoded values
   - Consider using git-secrets to prevent accidental commits

### 4. Environment Configuration
Create a `.env` file with necessary configurations:
```
AWS_DEFAULT_REGION=us-east-1
OPENAI_API_KEY=your_openai_key
BEDROCK_REGION=us-east-1
UPSTASH_VECTOR_URL=your_upstash_url
UPSTASH_VECTOR_TOKEN=your_upstash_token
```

### 5. Updating Secrets in AWS

After deploying the CDK stacks, you'll need to update the placeholder secrets with actual values:

```bash
# Update OpenAI API key
AWS_PROFILE=lorechat-dev aws secretsmanager put-secret-value \
  --secret-id LoreChat-openai-api-us-east-1 \
  --secret-string "your-actual-openai-api-key"

# Update Upstash Vector URL
AWS_PROFILE=lorechat-dev aws secretsmanager put-secret-value \
  --secret-id LoreChat-upstash-vector-url-us-east-1 \
  --secret-string "your-actual-upstash-vector-url"

# Update Upstash Vector Token
AWS_PROFILE=lorechat-dev aws secretsmanager put-secret-value \
  --secret-id LoreChat-upstash-vector-token-us-east-1 \
  --secret-string "your-actual-upstash-vector-token"
```

You can verify the secrets were updated correctly:

```bash
# List available secrets
AWS_PROFILE=lorechat-dev aws secretsmanager list-secrets

# Get a specific secret value
AWS_PROFILE=lorechat-dev aws secretsmanager get-secret-value \
  --secret-id LoreChat-openai-api-us-east-1
```

> **Note**: Replace `lorechat-dev` with your AWS profile name and adjust the secret IDs to match the ones created by your CDK deployment.

### 6. Enabling AWS Bedrock Models

To use AWS Bedrock models in your LoreChat application:

#### Request Access to Bedrock Models

1. **Navigate to AWS Bedrock Console**
   - Go to [AWS Bedrock Console](https://console.aws.amazon.com/bedrock)
   - Ensure you're in the correct region (e.g., `us-east-1`)

2. **Request Model Access**
   - Click on "Model access" in the left navigation
   - Click "Manage model access"
   - Select the models you want to use:
     - Anthropic Claude (Claude 3.5 Sonnet, Claude 3.5 Haiku)
     - Amazon Titan Embed v2, Nova Lite
     - Deepseek R1
   - Click "Request model access"
   - Wait for approval (usually immediate for most models)

## CDK Deployment

### Bootstrap CDK (First-Time Setup)
```bash
# With default profile
cdk bootstrap

# With named profile
AWS_PROFILE=lorechat-dev cdk bootstrap
```

### Synthesize CloudFormation Templates
```bash
# Build with Docker
cdk synth

# Build with Finch
cdk-finch synth
```

### Deploy Stacks
```bash
# Deploy all stacks
cdk deploy --all

# Deploy specific stack
cdk deploy StackName

# Deploy with Finch
cdk-finch deploy StackName
```

## GitHub Actions (CI/CD)

### GitHub OIDC Setup

GitHub OIDC provides a secure way for GitHub Actions to assume a role in your AWS account without storing long-lived credentials.

1. **Create OIDC Provider in AWS**
   - Go to AWS IAM Console → Identity providers
   - Click "Add provider"
   - Select "OpenID Connect"
   - Provider URL: `https://token.actions.githubusercontent.com`
   - Audience: `sts.amazonaws.com`
   - Click "Add provider"

2. **Create IAM Role for GitHub Actions**
   - Go to IAM Console → Roles
   - Click "Create role"
   - Select "Web identity"
   - Identity provider: `token.actions.githubusercontent.com`
   - Audience: `sts.amazonaws.com`
   - Click "Next: Permissions"
   - Attach the following policy (or create a custom one with least privilege):

   ```json
   {
       "Version": "2012-10-17",
       "Statement": [
           {
               "Effect": "Allow",
               "Action": [
                   "ecs:*",
                   "ecr:*",
                   "iam:PassRole",
                   "cloudformation:*",
                   "s3:*",
                   "ssm:*"
               ],
               "Resource": "*"
           }
       ]
   }
   ```

3. **Add Trust Relationship to Role**
   - After creating the role, go to the "Trust relationships" tab
   - Click "Edit trust policy"
   - Update the policy to include your GitHub repository:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": {
           "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
         },
         "Action": "sts:AssumeRoleWithWebIdentity",
         "Condition": {
           "StringEquals": {
             "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
           },
           "StringLike": {
             "token.actions.githubusercontent.com:sub": "repo:<GITHUB_USERNAME>/*"
           }
         }
       }
     ]
   }
   ```

   - Replace `<ACCOUNT_ID>` with your AWS account ID
   - Replace `<GITHUB_USERNAME>` with your GitHub username or organization name
   - Click "Update policy"

### Multi-Repo Workflow Setup

To enable the container repository to trigger deployments in the CDK repository:

1. **Create Personal Access Token (PAT)**
   - Go to GitHub → Settings → Developer settings → Personal access tokens
   - Click "Generate new token" (fine-grained)
   - Give it a descriptive name (e.g., "LoreChat CI/CD")
   - Use "Only select repositories" and select your LoreChat repos
   - For permissions, use the following
     - Actions: Read and write
     - Administration: Read-only
     - Attestations: Read-only
     - Contents: Read and write
     - Deployments: Read and write
     - Environments: Read and write
     - Metadata: Read-only
     - Repository security advisories: Read and write
     - Secrets: Read-only
     - Webhooks: Read-only
     - Workflows: Read and write
   - Click "Generate token"
   - Copy the token value immediately (you won't be able to see it again)

2. **Configure Repository Secrets**
   - Go to your container repository → Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `PAT_TOKEN`
   - Value: Your personal access token
   - Click "Add secret"
   - Repeat for the CDK repository if needed

3. **Update Workflow Files**
   - In the container repository workflow file:
     - Ensure the repository dispatch event is configured correctly
     - Update the repository name to match your CDK repository
   - In the CDK repository workflow file:
     - Update the role ARN to match your GitHub OIDC role
     - Update the container repository path if needed

### GitHub Actions Workflow

The GitHub Actions workflow is defined in `.github/workflows/deploy.yaml`. This workflow:

1. Triggers on:
   - Push to the main branch
   - Manual workflow dispatch
   - Repository dispatch event from the container repository

2. Performs the following steps:
   - Checks out the CDK repository
   - Checks out the container repository
   - Sets up Node.js and Python
   - Configures AWS credentials using OIDC
   - Installs dependencies
   - Builds the CDK project
   - Synthesizes CloudFormation templates
   - Deploys the CDK stacks

To trigger a manual deployment:
1. Go to your CDK repository on GitHub
2. Click "Actions"
3. Select the "Deploy CDK" workflow
4. Click "Run workflow"
5. Select the branch and click "Run workflow"

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

## Cloudflare Configuration Guide

### Initial DNS Setup

1. **Create Cloudflare Account**
   - Sign up at [cloudflare.com](https://cloudflare.com)
   - Add your domain to Cloudflare
   - Update your domain's nameservers to use Cloudflare's

2. **Configure DNS Records**
   - Log in to your Cloudflare account
   - Select your domain
   - Go to DNS settings
   - Add a CNAME record:
     - Type: CNAME
     - Name: `dev-chat` (or your subdomain)
     - Target: Your ALB DNS name (from CDK outputs)
     - Proxy status: Proxied (orange cloud)
   
   > **Important**: Cloudflare free tier only supports SSL origin validation for subdomains one-level deep.
   > Use `dev-chat.example.com` instead of `dev.chat.example.com` to avoid validation errors.

### ACM Certificate Integration

1. **Request ACM Certificate**
   - The CDK stack automatically requests an ACM certificate
   - The certificate uses DNS validation

2. **Validate Certificate with Cloudflare DNS**
   - After deploying the infrastructure stack, check the AWS Console for ACM
   - Find the CNAME record needed for validation
   - Add this CNAME record to Cloudflare:
     - Type: CNAME
     - Name: `_[validation-name]` (from ACM)
     - Target: `_[validation-value]` (from ACM)
     - Proxy status: DNS only (gray cloud)
   - Wait for validation to complete (can take up to 30 minutes)

### Cloudflare Security Settings

1. **SSL/TLS Configuration**
   - Go to SSL/TLS → Overview
   - Set SSL/TLS encryption mode to "Full Strict"
   - This ensures traffic between Cloudflare and ALB is encrypted

2. **WebSocket Configuration**
   - Go to Network → WebSockets
   - Enable WebSockets

3. **WAF and Security Settings**
   - Go to Security → WAF
   - Enable Bot Fight Mode
   - Go to Settings and enable "I'm Under Attack Mode" for enhanced protection
   - Set rate limiting rules:
     - Recommended: 100 requests/minute per IP
     - Note: Adjust based on your use case, as WebSocket connections and static assets count as separate requests

4. **Caching Configuration**
   - Go to Caching → Configuration
   - Set browser cache TTL to 4 hours for static assets
   - Create page rules for specific caching behaviors if needed

5. **Page Rules (Optional)**
   - Go to Rules → Page Rules
   - Click "Create Page Rule"
   - Enter URL pattern (e.g., `dev-chat.example.com/*`)
   - Configure settings like:
     - Cache level
     - Browser cache TTL
     - Security level
   - Click "Save and Deploy"

### Running the Cloudflare IP Updater Lambda

After deploying the infrastructure, you need to manually trigger the Cloudflare IP Updater Lambda the first time:

1. **Access AWS Lambda Console**
   - Go to AWS Console → Lambda
   - Find the `CloudflareIpUpdaterFunction` Lambda

2. **Create Test Event**
   - Click "Test" tab
   - Create a new test event with any name
   - Use an empty JSON object `{}`
   - Save the test event

3. **Run the Lambda**
   - Click "Test" to run the Lambda with your test event
   - This will update your ALB security group with current Cloudflare IP ranges
   - Verify in the CloudWatch logs that the function executed successfully

> **Critical**: If you don't run this Lambda, your ALB will reject traffic from Cloudflare, and users won't be able to access your application.

## Monitoring and Troubleshooting

### CloudWatch Logs
- Check Lambda function logs (including Cloudflare IP updater)
- Review ECS service logs
- Monitor CloudWatch dashboards

### Common Issues

1. **Cloudflare Connection Issues**
   - Verify Cloudflare IP updater Lambda has run successfully
   - Check security group rules to confirm Cloudflare IPs are allowed
   - Ensure SSL/TLS mode is set to "Full Strict"
   - Verify WebSockets are enabled if using real-time features

2. **Certificate Validation Problems**
   - Confirm DNS validation records are correctly added in Cloudflare
   - Check that validation records use DNS only mode (gray cloud)
   - Allow up to 30 minutes for validation to complete
   - Verify certificate status in ACM console

3. **Deployment Failures**
   - Check CDK synthesis output for errors
   - Verify AWS credentials and permissions
   - Review CloudFormation events in AWS console
   - Check IAM roles and policies

4. **Performance Issues**
   - Analyze CloudWatch metrics for resource utilization
   - Review Lambda cold start times
   - Check vector store query performance
   - Monitor ECS service scaling events

## Best Practices

### Security
- Always use least privilege IAM roles
- Encrypt sensitive information
- Regularly update dependencies
- Conduct security reviews
- Enable MFA for all IAM users

### Cost Optimization
- Monitor AWS Budgets
- Use Spot instances where possible
- Set appropriate auto-scaling thresholds
- Review and clean up unused resources
- Optimize Lambda memory settings

### Development
- Follow infrastructure as code best practices
- Document all configuration changes
- Use consistent naming conventions
- Implement comprehensive testing
- Maintain clear documentation

## Operational Procedures

### Scaling
- Monitor auto-scaling events
- Adjust ECS service configuration
- Review Lambda concurrency
- Set appropriate scaling thresholds
- Analyze traffic patterns

### Updates
- Test changes in staging environment
- Use blue/green deployments
- Monitor performance metrics
- Plan for rollback scenarios
- Document all changes
