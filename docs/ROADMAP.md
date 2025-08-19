# Momentia Development Roadmap

This roadmap outlines the key development milestones for the Momentia photo portfolio project. It serves as a guide to ensure continuity and clarity across different development sessions and among various contributors. By following this roadmap, we aim to systematically build, enhance, and maintain the platform with a focus on scalability, usability, and integration with modern technologies.

## Short-term Goals (1–2 months)

- ✅ Set up the Next.js project structure and initial configuration.
- ✅ Integrate Azure Blob Storage for photo uploads and storage.
- ✅ Implement image upload UI with drag-and-drop functionality.
- ✅ Develop basic photo gallery display with pagination.
- ✅ Set up PostgreSQL database schema for storing photo metadata.
- ✅ Create API routes in Next.js for CRUD operations on photo metadata.
- ✅ Implement user authentication and authorization.
- ✅ Establish CI/CD pipeline for automated deployment to Azure.
- ✅ Write unit tests for core components and API endpoints.
- Ship MVP purchase flow with **Stripe Checkout** (hosted page). Start with single-item “Buy now”, later expand to cart.
- Keep print sales as **Coming Soon**; evaluate FUJIFILM WALLDECOR or domestic lab partners for framed print fulfillment.
- Lock down **Blob** originals to **Private**; serve images via short‑lived **SAS** or server streaming; keep thumbnails cacheable.
- Add basic **watermark** for lightbox previews (server-side, tunable via env).

## Mid-term Goals (3–6 months)

- Enhance photo gallery with filtering and sorting capabilities.
- Integrate AI-based caption and keyword generation for uploaded photos using Azure Cognitive Services.
- Implement photo editing features such as cropping and resizing.
- Add user profile management and personalized galleries.
- Optimize image loading using Next.js Image component and Azure CDN.
- Develop analytics dashboard to track photo views and user engagement.
- Improve security with role-based access control and data validation.
- Conduct performance testing and optimize database queries.
- Expand test coverage with integration and end-to-end tests.
- Add **PayPal** as an alternative payment method; **Amazon Pay** to be evaluated post‑launch.
- Strengthen security: **CSP** hardening, API **rate limiting**, upload size caps; introduce basic WAF rules.

## Long-term Goals (6+ months)

- Introduce collaborative features such as shared albums and comments.
- Implement advanced AI features like automatic photo tagging and content moderation.
- Develop mobile app integration or PWA support for offline access.
- Scale infrastructure to support large user base and high traffic.
- Integrate with other cloud services for backup and disaster recovery.
- Continuously update UI/UX based on user feedback and usability studies.
- Explore monetization options such as premium accounts or print services.
- Maintain comprehensive documentation for developers and users.
- Plan and execute regular security audits and compliance checks.

## Deployment & Operations Checklist

### Deployment & Operations Checklist

> **Note:** When deploying to Azure for public release, ensure blob storage containers for originals are set to Private and served via API or short-lived SAS.

#### Azure & Entra ID Setup
1. **Entra ID Redirect URIs**
   - Add production URL:
     ```
     https://momentia.evoluzio.com/api/auth/callback/azure-ad
     https://momentia.azurewebsites.net/api/auth/callback/azure-ad
     ```
   - Keep local development URI:
     ```
     http://localhost:3000/api/auth/callback/azure-ad
     ```
   - If using custom domains, register them in Entra ID as additional redirect URIs.

2. **Environment Variables**
   - `NEXTAUTH_URL` → Set to production URL.
   - `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID` → Match values from Azure portal.
   - `AZURE_STORAGE_CONNECTION_STRING` → Use production storage account connection string.
   - `DATABASE_URL` → Point to production PostgreSQL instance.

3. **Azure App Service Configuration**
   - Set all required environment variables in Applwication Settings.
   - If using deployment slots (staging/prod), configure both.

4. **Security Checks**
   - Ensure role-based access control is enabled where required.
   - Validate that admin pages are behind authentication.
   - Remove any development/test accounts.

5. **Payments (MVP – Stripe Checkout)**
   - Create **Product** and **Price** in Stripe Dashboard (JPY).
   - Server route: `/api/checkout/create` → creates Checkout Session with success/cancel URLs.
   - Webhook: handle `checkout.session.completed` → mark order paid, issue license/SAS for download, email receipt.
   - Environment: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBKEY`.
   - Test cardsを用いた本番前テスト（3Dセキュア含む）。

6. **Final Verification**
   - Test the authentication flow in production.
   - Verify image uploads and gallery display.
   - Confirm that CDN caching works as expected.

---

_This checklist helps ensure smooth deployment and minimizes configuration errors._

_Last Updated: 2025-08-18_
