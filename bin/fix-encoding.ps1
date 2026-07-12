# Run this from the root of your Git repo in PowerShell
$extensions = @("*.txt","*.md","*.json","*.js","*.ts","*.html","*.css","*.xml","*.yml","*.yaml","*.cs","*.java","*.py")
$excludedDirectoryPattern = '(?:^|[\\/])(?:node_modules|\.build|\.next|tmp|dist|\.cache|coverage)(?:[\\/]|$)'

foreach ($ext in $extensions) {
    Get-ChildItem -Recurse -File -Include $ext | Where-Object {
        $_.FullName -notmatch $excludedDirectoryPattern
    } | ForEach-Object {
        Write-Host "Converting $($_.FullName)..."
        $content = Get-Content $_.FullName -Raw
        [System.IO.File]::WriteAllText($_.FullName, $content, [System.Text.UTF8Encoding]::new($false))
    }
}
