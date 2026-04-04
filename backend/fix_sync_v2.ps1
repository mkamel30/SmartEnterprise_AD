$filePath = "C:\Users\mkame\OneDrive\Documents\GitHub\Smart-Enterprise-Suite_VS_20260210_20260315\backend\src\services\adminSync.service.js"
$content = [System.IO.File]::ReadAllText($filePath)

# 1. First, fix the SyntaxError at line 73 (if it's still there)
$content = $content.Replace("logger.info(AdminSync: Attempting to connect to Central Portal at \...);", "logger.info(`AdminSync: Attempting to connect to Central Portal at `${this.portalUrl}...`);")

# 2. Clean up the tryConnect duplicate block
# We want to match: } followed by the legacy .env parsing code, all the way to } before async logSync
$pattern = '(?s)\}\s+// Refresh env values.*?\}\s+async logSync'
$replacement = "    }`r`n`r`n    async logSync"

$content = [regex]::Replace($content, $pattern, $replacement)

[System.IO.File]::WriteAllText($filePath, $content)
