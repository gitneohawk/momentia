import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
} from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";

function initializeBlobServiceClient() {
  const accountName = process.env.AZURE_STORAGE_ACCOUNT;
  const useMsi = process.env.AZURE_USE_MSI === "1";
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

  if (useMsi && accountName) {
    console.log("[Azure Storage] Initializing with Managed Identity (MSI).");
    const endpoint = `https://${accountName}.blob.core.windows.net`;
    return new BlobServiceClient(endpoint, new DefaultAzureCredential());
  }

  if (connectionString) {
    console.log("[Azure Storage] Initializing with Connection String.");
    return BlobServiceClient.fromConnectionString(connectionString);
  }
  
  throw new Error("Azure Storage configuration is missing.");
}

// 共通のBlobServiceClientインスタンス
export const blobServiceClient = initializeBlobServiceClient();

// --- ▼▼▼ ここからSAS生成関数を追加 ▼▼▼ ---

// SAS生成ロジックを共通化したファクトリ関数
export function createSasGenerator() {
  const accountName = process.env.AZURE_STORAGE_ACCOUNT || null;
  const useMsi = process.env.AZURE_USE_MSI === "1";
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

  const parseConnString = () => {
    if (!connectionString) throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set.");
    const map = new Map(connectionString.split(';').map(kv => { const i = kv.indexOf('='); return [kv.slice(0, i), kv.slice(i + 1)]; }));
    const accName = map.get("AccountName");
    const accKey = map.get("AccountKey");
    if (!accName || !accKey) throw new Error("Invalid storage connection string");
    
    const protocol = map.get("DefaultEndpointsProtocol") || "https";
    const endpointSuffix = map.get("EndpointSuffix") || "core.windows.net";
    const endpoint = map.get("BlobEndpoint") || `${protocol}://${accName}.blob.${endpointSuffix}`;
    const publicEndpoint = process.env.AZURE_BLOB_PUBLIC_ENDPOINT || endpoint;

    return { credential: new StorageSharedKeyCredential(accName, accKey), publicEndpoint };
  };

  const sasCache = new Map<string, { url: string; expiresAt: number }>();
  
  return async (storagePath: string, containerName: string, ttlMinutes = 15): Promise<string | null> => {
    const key = `${containerName}|${storagePath}|${ttlMinutes}`;
    const cached = sasCache.get(key);
    if (cached && cached.expiresAt - Date.now() > 30_000) {
      return cached.url;
    }

    const now = new Date();
    const SKEW_MIN = Number(process.env.SAS_SKEW_MINUTES ?? 10);
    const round = (d: Date) => new Date(Math.floor(d.getTime() / 1000) * 1000);
    const startsOn = round(new Date(now.getTime() - SKEW_MIN * 60 * 1000));
    const expiresOn = round(new Date(now.getTime() + ttlMinutes * 60 * 1000));
    const expiresAt = expiresOn.getTime();
    
    // --- 本番向け: Managed Identity (MSI) ---
    if (useMsi && accountName) {
      try {
        const userDelegationKey = await blobServiceClient.getUserDelegationKey(startsOn, expiresOn);
        const sas = generateBlobSASQueryParameters({ containerName, blobName: storagePath, permissions: BlobSASPermissions.parse("r"), startsOn, expiresOn }, userDelegationKey, accountName).toString();
        const publicEndpoint = process.env.AZURE_BLOB_PUBLIC_ENDPOINT || blobServiceClient.url.replace(/\/$/, "");
        const url = `${publicEndpoint}/${containerName}/${encodeURI(storagePath)}?${sas}`;
        sasCache.set(key, { url, expiresAt });
        return url;
      } catch (e) {
        console.error("[SAS Generator] MSI User Delegation SAS error:", e);
        return null;
      }
    }
    
    // --- 開発向け: 接続文字列 ---
    if (connectionString) {
      try {
        const { publicEndpoint, credential } = parseConnString();
        const sas = generateBlobSASQueryParameters({ containerName, blobName: storagePath, permissions: BlobSASPermissions.parse("r"), startsOn, expiresOn }, credential).toString();
        const url = `${publicEndpoint.replace(/\/$/, "")}/${containerName}/${encodeURI(storagePath)}?${sas}`;
        sasCache.set(key, { url, expiresAt });
        return url;
      } catch (e) {
        console.error("[SAS Generator] Shared Key SAS error:", e);
        return null;
      }
    }

    console.error("[SAS Generator] No valid authentication method found.");
    return null;
  };
}