# Deployment Guide for Momentia

## Prerequisites
- Ensure you have an active Azure account with appropriate permissions.
- Install Azure CLI: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli
- Install Docker if building container images locally: https://docs.docker.com/get-docker/
- Ensure Node.js and npm are installed for local builds.
- Access to the project repository and necessary environment variables for deployment.
- Ensure `.env` file is properly set up with required keys (Azure Blob, Entra ID, Stripe/PayPal keys, etc.). Refer to `.env.sample` for guidance.

## Local Build Steps
1. Clone the repository if not already done:
   ```
   git clone <repository-url>
   cd momentia
   ```
2. Install dependencies:
   ```
   npm install
   ```
3. Build the project:
   ```
   npm run build
   ```
4. (Optional) Run tests to verify build integrity:
   ```
   npm test
   ```

## Azure Deployment Steps
1. Log in to Azure CLI:
   ```
   az login
   ```
2. Set the subscription if necessary:
   ```
   az account set --subscription "<subscription-id>"
   ```
3. Create or update Azure resources as needed (Resource Group, Container App Environment, Storage Account).
4. Deploy the built application to Azure Container Apps:
   ```
   az containerapp up --name <container-app-name> --resource-group <resource-group> --environment <environment-name> --source .
   ```
5. Configure environment variables and application settings in Azure portal or via CLI.
6. Deploy static assets or container images to Azure Blob Storage or Container Registry if applicable.

## Post-Deployment Tasks
- Verify the application is running correctly by accessing the deployed URL.
- Update `ROADMAP.md` flags to reflect the new deployment status.
- Test the purchase flow thoroughly to ensure no regressions.
- **Secure Blob Storage URLs:** Ensure Azure Blob containers are set to *Private*. Prevent direct public access to image URLs. Use Shared Access Signatures (SAS tokens) with short expiry or serve images via protected routes.
- **HTTPS/TLS Enforcement:** Confirm HTTPS-only access is enforced in App Service.
- **CORS Settings:** Verify that CORS rules are restricted to trusted domains.
- **Payment Gateway Configuration:** Set correct Stripe/PayPal keys in production and configure webhook endpoints. Test both sandbox and production flows.
- Monitor logs and performance metrics for any issues.

- ✅ Custom domain configured (momentia.evoluzio.com with DNS + Container Apps binding)

---

Following these steps will help ensure a smooth deployment and secure operation of the Momentia project.

## Deployment Checklist
- ✅ Application is accessible via deployed URL
- ✅ Login/Session works correctly (Entra ID)
- ✅ Purchase flow verified with sandbox keys
- ✅ Stripe/PayPal webhooks configured
- ✅ Images in Blob Storage are not directly accessible
- ✅ HTTPS-only and CORS policies enforced
- ✅ Monitoring/alerts configured in Azure (App Insights or equivalent)
