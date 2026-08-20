[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$packageRoot = Split-Path -Parent $PSScriptRoot
$requiredFiles = @(
  'README.md',
  'PRODUCT_AND_ARCHITECTURE.md',
  'TEN_PAGE_PROJECT_NARRATIVE.md',
  'DEMO_SCRIPT.md',
  'SCREENSHOT_SHOT_LIST.md',
  'CLAIMS_LEDGER.md',
  'LICENSE_AND_THIRD_PARTY_CHECKLIST.md',
  'JUDGE_CHECKLIST.md',
  'RUNTIME_EVIDENCE_CHECKLIST.md',
  'HANDOFF.md'
)

$errors = [System.Collections.Generic.List[string]]::new()
foreach ($file in $requiredFiles) {
  if (-not (Test-Path -LiteralPath (Join-Path $packageRoot $file))) {
    $errors.Add("Missing required file: $file")
  }
}

$narrativePath = Join-Path $packageRoot 'TEN_PAGE_PROJECT_NARRATIVE.md'
if (Test-Path -LiteralPath $narrativePath) {
  $pageCount = (Select-String -LiteralPath $narrativePath -Pattern '^## Page [0-9]+ —').Count
  if ($pageCount -ne 10) {
    $errors.Add("Ten-page narrative has $pageCount page headings; expected 10.")
  }
}

$markdownFiles = Get-ChildItem -LiteralPath $packageRoot -File -Recurse -Filter '*.md'
foreach ($markdownFile in $markdownFiles) {
  $content = Get-Content -LiteralPath $markdownFile.FullName -Raw
  foreach ($match in ([regex]::Matches($content, '\[[^\]]+\]\(([^)]+)\)'))) {
    $target = $match.Groups[1].Value
    if ($target.StartsWith('#') -or $target -match '^[a-zA-Z][a-zA-Z0-9+.-]*:') { continue }
    $relativeTarget = $target.Split('#')[0]
    if ([string]::IsNullOrWhiteSpace($relativeTarget)) { continue }
    if (-not (Test-Path -LiteralPath (Join-Path $markdownFile.DirectoryName $relativeTarget))) {
      $errors.Add("Broken local Markdown link in $($markdownFile.Name): $target")
    }
  }
}

$placeholderPattern = '\b(TBD|TBA|coming soon|lorem ipsum)\b'
foreach ($markdownFile in $markdownFiles) {
  if (Select-String -LiteralPath $markdownFile.FullName -Pattern $placeholderPattern -CaseSensitive:$false -Quiet) {
    $errors.Add("Placeholder language found in $($markdownFile.Name).")
  }
}

if ($errors.Count -gt 0) {
  $errors | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Output "Submission package validation passed: $($requiredFiles.Count) required documents, 10 narrative pages, local links, and placeholder scan."
