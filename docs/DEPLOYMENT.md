# Deployment Guide for Momentia

## Prerequisites
- Ensure you have an active Azure account with appropriate permissions.
- Install Azure CLI: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli
- Install Docker if building container images locally: https://docs.docker.com/get-docker/
- Ensure Node.js and npm are installed for local builds.
- Access to the project repository and necessary environment variables for deployment.

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
3. Create or update Azure resources as needed (Resource Group, App Service, Storage Account).
4. Deploy the built application to Azure App Service:
   ```
   az webapp up --name <app-service-name> --resource-group <resource-group> --sku F1
   ```
5. Configure environment variables and application settings in Azure portal or via CLI.
6. Deploy static assets or container images to Azure Blob Storage or Container Registry if applicable.

## Post-Deployment Tasks
- Verify the application is running correctly by accessing the deployed URL.
- Update `ROADMAP.md` flags to reflect the new deployment status.
- Test the purchase flow thoroughly to ensure no regressions.
- **Secure Blob Storage URLs:** Ensure that direct access to images in Azure Blob Storage is restricted. Use Shared Access Signatures (SAS tokens) or implement protected routes to prevent unauthorized access to image URLs.
- Monitor logs and performance metrics for any issues.

---

Following these steps will help ensure a smooth deployment and secure operation of the Momentia project.
