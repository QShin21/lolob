# Runs a browser verifier up to three times. Hosted Windows runners occasionally lose the headless
# browser or miss a media start; a verifier still has to pass in full on one attempt.
$ErrorActionPreference = 'Stop'
if ($args.Count -lt 1) { throw 'usage: ci-retry.ps1 <command> [arguments]' }
$taskCommand = $args[0]
$taskArguments = @($args | Select-Object -Skip 1)
foreach ($taskAttempt in 1..3) {
  & $taskCommand @taskArguments
  if ($LASTEXITCODE -eq 0) { exit 0 }
  Write-Host "::warning::Attempt $taskAttempt of '$($args -join ' ')' exited with $LASTEXITCODE"
}
exit $LASTEXITCODE
