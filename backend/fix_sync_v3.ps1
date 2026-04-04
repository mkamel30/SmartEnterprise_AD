$filePath = "C:\Users\mkame\OneDrive\Documents\GitHub\Smart-Enterprise-Suite_VS_20260210_20260315\backend\src\services\adminSync.service.js"
$content = [System.IO.File]::ReadAllText($filePath)

# Replace everything from 'async tryConnect() {' to 'async logSync' with a clean version
$pattern = '(?s)async tryConnect\(\) \{.*?async logSync'
$newTryConnectAndStartLogSync = @"
    async tryConnect() {
        if (this.isConnected) {
            logger.debug('AdminSync: Already connected');
            return;
        }
        
        // Refresh env values from current environment
        this.portalUrl = process.env.PORTAL_URL;
        this.branchCode = process.env.BRANCH_CODE;
        this.apiKey = process.env.PORTAL_API_KEY;
        
        logger.info(`AdminSync: Attempting to connect to Central Portal at \${this.portalUrl}...`);
        await this.init();
    }

    async logSync
"@

$content = [regex]::Replace($content, $pattern, $newTryConnectAndStartLogSync)

[System.IO.File]::WriteAllText($filePath, $content)
