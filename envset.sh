#!/bin/bash

# --- あなたの環境に合わせて設定 ---
RESOURCE_GROUP="momentia-v1"
APP_NAME="momentia-v1"

# --- 設定するシークレット名と環境変数名の一覧 ---
# 形式: "シークレット名:環境変数名"
SECRETS_MAP=(
    "database-url:DATABASE_URL"
    "azure-storage-connection-string:AZURE_STORAGE_CONNECTION_STRING"
    "nextauth-url:NEXTAUTH_URL"
    "nextauth-secret:NEXTAUTH_SECRET"
    "azure-ad-client-id:AZURE_AD_CLIENT_ID"
    "azure-ad-client-secret:AZURE_AD_CLIENT_SECRET"
    "azure-ad-tenant-id:AZURE_AD_TENANT_ID"
)

# --- ここからスクリプト本体 ---

# 1. シークレットの値を順番に設定
echo "これからシークレットの値を順番に設定します。入力した値は表示されません。"
for item in "${SECRETS_MAP[@]}"; do
    SECRET_NAME="${item%%:*}"
    
    echo -n "Enter value for secret '$SECRET_NAME': "
    read -s SECRET_VALUE # -sフラグで入力値を非表示にする
    echo
    
    az containerapp secret set \
        --name "$APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --secrets "$SECRET_NAME=$SECRET_VALUE" > /dev/null
    
    if [ $? -eq 0 ]; then
        echo " -> '$SECRET_NAME' を設定しました。"
    else
        echo " -> '$SECRET_NAME' の設定に失敗しました。"
        exit 1
    fi
done

# 2. 環境変数としてシークレットを一括で紐付け
echo "コンテナに環境変数を設定しています..."
ENV_VARS_STRING=""
for item in "${SECRETS_MAP[@]}"; do
    SECRET_NAME="${item%%:*}"
    ENV_VAR_NAME="${item##*:}"
    ENV_VARS_STRING+="$ENV_VAR_NAME=secretref:$SECRET_NAME "
done

az containerapp update \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --set-env-vars $ENV_VARS_STRING

if [ $? -eq 0 ]; then
    echo "全ての環境変数を設定しました！"
else
    echo "環境変数の設定に失敗しました。"
fi
